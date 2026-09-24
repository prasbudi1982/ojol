// FILE: lib/app/store/storeViews.js - FINAL FIX WARUNGKU + KELOLA MENU VARIAN ADDON + CART CANTIK & CART CLEAR AFTER CHECKOUT
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

function calcHav(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Fungsi global untuk membersihkan keranjang secara total
window._clearFoodCart = function () {
  try {
    localStorage.removeItem('ojol_cart_v2_food');
    localStorage.setItem('cart_just_cleared', Date.now().toString());
  } catch (e) {}

  try {
    if (cartStore && cartStore.setState) {
      cartStore.setState({
        items: [],
        storeName: '',
        storeId: null,
        pickup: {},
        dest: { text: '', lat: null, lng: null },
        store: null
      });
    }
  } catch (e) {}

  try {
    if (cartStore && cartStore._actions) {
      if (cartStore._actions.clearCart) cartStore._actions.clearCart();
      if (cartStore._actions.setItems) cartStore._actions.setItems([]);
      if (cartStore._actions.clear) cartStore._actions.clear();
    }
  } catch (e) {}

  try {
    if (cartStore && cartStore.getState) {
      const s = cartStore.getState();
      if (s) {
        s.items = [];
        if (s.cart) s.cart.items = [];
      }
    }
  } catch (e) {}
};

// Fetch rating driver seperti di order.js ojol
async function fetchDriverRatings(driverIds) {
  const ratingsMap = {};
  try {
    if (!driverIds || !driverIds.length) return ratingsMap;
    const { data, error } = await supabase
      .from('ratings')
      .select('driver_id, rating')
      .in('driver_id', driverIds);
    if (!error && data) {
      const grouped = {};
      data.forEach((r) => {
        if (!grouped[r.driver_id]) grouped[r.driver_id] = [];
        grouped[r.driver_id].push(r.rating);
      });
      Object.keys(grouped).forEach((id) => {
        const arr = grouped[id];
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        ratingsMap[id] = { avg: avg.toFixed(1), count: arr.length };
      });
    }
  } catch (e) {}
  try {
    const local = JSON.parse(localStorage.getItem('local_ratings') || '[]');
    const localGrouped = {};
    local.forEach((r) => {
      if (!driverIds.includes(r.driver_id)) return;
      if (!localGrouped[r.driver_id]) localGrouped[r.driver_id] = [];
      localGrouped[r.driver_id].push(r.rating);
    });
    Object.keys(localGrouped).forEach((id) => {
      if (ratingsMap[id]) return;
      const arr = localGrouped[id];
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      ratingsMap[id] = { avg: avg.toFixed(1), count: arr.length, local: true };
    });
  } catch (e) {}
  return ratingsMap;
}

export async function viewStoreList() {
  try {
    let stores = [];
    try {
      stores = await warungStore._actions.fetchOpenStores();
    } catch (e) {
      const { data } = await supabase
        .from('stores')
        .select('*')
        .eq('is_open', true)
        .limit(30);
      stores = data || [];
    }
    const cards = stores
      .map(
        (s) =>
          `<div class="driver-card" style="flex-direction:column;gap:8px"><div style="display:flex;justify-space-between"><b>${s.name}</b><span style="font-size:10px;background:${
            s.is_open ? '#16a34a' : '#ef4444'
          };color:white;padding:3px 8px;border-radius:99px">${
            s.is_open ? 'BUKA' : 'TUTUP'
          }</span></div><div class="muted" style="font-size:11px">${
            s.alamat_text || ''
          }</div><a href="#/store/detail/${
            s.id
          }" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a></div>`
      )
      .join('');
    return `<div class="card"><h2>🍔 Warung Buka</h2><div class="list">${
      cards || '<div class="muted">Belum ada warung</div>'
    }</div></div>`;
  } catch (e) {
    return `<div class="card">Error: ${e.message}</div>`;
  }
}

export async function viewStoreDetail(storeId) {
  try {
    const { data: store } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();
    if (!store) return '<div class="card">Warung tidak ditemukan</div>';
    let products = [];
    try {
      products = await productStore._actions.fetchByStore(storeId, true);
    } catch (e) {
      const { data } = await supabase
        .from('store_products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_available', true)
        .limit(50);
      products = data || [];
    }
    try {
      cartStore._actions.setStore(store);
    } catch (e) {}
    const prodJson = JSON.stringify(products).replace(/</g, '\\u003c');
    const listHtml = products
      .map((p) => {
        const harga = Number(p.harga || 0).toLocaleString('id-ID');
        return `<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2)"><b>${
          p.name
        }</b><div class="muted" style="font-size:11px">Rp ${harga} • ${
          p.kategori || ''
        }</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder('${
          p.id
        }')">🍱 Pilih Varian</button></div></div>`;
      })
      .join('');
    return `<div class="card"><a href="#/store" class="muted">← Kembali</a><h2>${
      store.name
    }</h2><div class="muted" style="font-size:11px">${
      store.alamat_text || ''
    }</div></div><div class="list" style="margin-top:12px">${
      listHtml || 'Belum ada menu'
    }</div>
      <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)">
        <div style="background:var(--bg);width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:24px 24px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,0.2)">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);border-radius:24px 24px 0 0;z-index:2">
            <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
            <div style="display:flex;justify-content:space-between;align-items:center"><div><div id="builderName" style="font-weight:800;font-size:18px">Menu</div><div id="builderBase" class="muted" style="font-size:13px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:36px;height:36px;border-radius:50%;padding:0">✕</button></div>
          </div>
          <div style="padding:16px 16px 100px 16px">
            <div style="font-weight:800;margin-bottom:10px;font-size:14px;display:flex;gap:6px">📦 Variasi <span class="muted" style="font-weight:400;font-size:11px">• Pilih 1</span></div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"></div>
            <div style="font-weight:800;margin-bottom:10px;font-size:14px;display:flex;gap:6px">➕ Addon <span class="muted" style="font-weight:400;font-size:11px">• Opsional</span></div><div id="builderAddon" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"></div>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px">Jumlah</span><div style="display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:4px"><button id="builderQtyMinus" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">−</button><span id="builderQty" style="min-width:28px;text-align:center;font-weight:800;font-size:16px">1</span><button id="builderQtyPlus" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0;background:var(--primary);color:white;border:none">+</button></div></div>
              <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)"><div class="muted" style="font-size:11px" id="builderSummary">-</div><div style="font-size:20px;font-weight:800;color:var(--primary)" id="builderTotal">Rp 0</div></div>
            </div>
          </div>
          <div style="position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;background:var(--card);border-top:1px solid var(--border);padding:12px 16px 20px"><button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800;font-size:14px;border-radius:14px">🛒 Tambah • <span id="builderTotalBtn">Rp 0</span></button></div>
        </div>
      </div><script type="application/json" id="productsData">${prodJson}</script>`;
  } catch (e) {
    return `<div class="card">Error: ${e.message}</div>`;
  }
}

export async function viewStoreCart() {
  let state;
  let rawLocal = null;
  try {
    rawLocal = localStorage.getItem('ojol_cart_v2_food');
  } catch (e) {}

  // Cek flag baru saja checkout
  try {
    var justCleared = localStorage.getItem('cart_just_cleared');
    if (justCleared) {
      var diff = Date.now() - parseInt(justCleared);
      if (diff < 60000) {
        window._clearFoodCart();
      }
    }
  } catch (e) {}

  // CRITICAL FIX: Jika localStorage kosong setelah checkout, LANGSUNG return keranjang kosong tanpa baca cartStore memory
  try {
    if (!rawLocal) {
      window._clearFoodCart();
      return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - Kosong</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">0 item</p><div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang kosong</div><div class="muted" style="font-size:11px;margin-top:4px">Pesanan kamu sudah diproses</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:10px 18px;font-size:12px;border-radius:12px">+ Cari Makanan Lagi</a></div></div>`;
    } else {
      var _parsedCheck = JSON.parse(rawLocal);
      if (!_parsedCheck.items || _parsedCheck.items.length === 0) {
        window._clearFoodCart();
        return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - Kosong</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">0 item</p><div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang kosong</div><div class="muted" style="font-size:11px;margin-top:4px">Pesanan kamu sudah diproses</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:10px 18px;font-size:12px;border-radius:12px">+ Cari Makanan Lagi</a></div></div>`;
      }
    }
  } catch (e) {}

  // Jika tidak kosong, lanjut baca state
  try {
    state = cartStore.getState();
    if ((!state.items || !state.items.length) && rawLocal) {
      try {
        const parsed = JSON.parse(rawLocal);
        if (parsed.items?.length) state = parsed;
      } catch (e) {}
    }
  } catch (e) {
    const raw = localStorage.getItem('ojol_cart_v2_food');
    state = raw
      ? JSON.parse(raw)
      : {
          items: [],
          storeName: '',
          dest: { text: '', lat: null, lng: null },
          pickup: {},
          storeId: null
        };
  }
  if (!state)
    state = {
      items: [],
      storeName: '',
      dest: { text: '', lat: null, lng: null },
      pickup: {},
      storeId: null
    };

  // Double check lagi
  try {
    if (rawLocal) {
      var _pl = JSON.parse(rawLocal);
      if (!_pl.items || !_pl.items.length) state.items = [];
    }
  } catch (e) {}

  // Jika setelah double check masih kosong, return kosong
  try {
    if (!state.items || !state.items.length) {
      window._clearFoodCart();
      return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - Kosong</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">0 item</p><div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang kosong</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:10px 18px;font-size:12px;border-radius:12px">+ Cari Makanan Lagi</a></div></div>`;
    }
  } catch (e) {}

  var effectiveStoreId = state.storeId || state.store_id || null;
  try {
    if (!effectiveStoreId) {
      const cs = cartStore.getState ? cartStore.getState() : null;
      if (cs) {
        effectiveStoreId = cs.storeId || cs.store_id || cs.store?.id || null;
        if (!effectiveStoreId && cs.storeName) {
          try {
            const { data: byName } = await supabase
              .from('stores')
              .select('id')
              .ilike('name', cs.storeName)
              .limit(1)
              .maybeSingle();
            if (byName) effectiveStoreId = byName.id;
          } catch (e) {}
        }
      }
    }
    if (!effectiveStoreId && state.items && state.items.length) {
      try {
        const firstProdId = state.items[0].product_id || state.items[0].id;
        if (firstProdId) {
          const { data: prod } = await supabase
            .from('store_products')
            .select('store_id')
            .eq('id', firstProdId)
            .maybeSingle();
          if (prod && prod.store_id) effectiveStoreId = prod.store_id;
        }
      } catch (e) {}
    }
    if (effectiveStoreId) state.storeId = effectiveStoreId;
  } catch (e) {
    console.warn('effectiveStoreId fail', e);
  }

  if (!state.pickup || !state.pickup.lat) {
    if (effectiveStoreId) {
      try {
        const { data: storeFix } = await supabase
          .from('stores')
          .select('id,name,lat,lng,latitude,longitude,alamat_text')
          .eq('id', effectiveStoreId)
          .single();
        if (storeFix) {
          var sLat = storeFix.lat || storeFix.latitude;
          var sLng = storeFix.lng || storeFix.longitude;
          if (sLat != null && sLng != null) {
            sLat = Number(sLat);
            sLng = Number(sLng);
            if (!isNaN(sLat) && !isNaN(sLng) && sLat !== 0 && sLng !== 0) {
              state.pickup = {
                lat: sLat,
                lng: sLng,
                text: storeFix.name,
                alamat_text: storeFix.alamat_text
              };
              try {
                localStorage.setItem(
                  'ojol_cart_v2_food',
                  JSON.stringify(state)
                );
              } catch (e) {}
              try {
                if (cartStore._actions && cartStore._actions.setStore)
                  cartStore._actions.setStore(storeFix);
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.warn('fix pickup fail', e);
      }
    }
  }

  var totals;
  try {
    totals = cartStore._actions.getTotals();
  } catch (e) {
    var sub = 0;
    for (var i = 0; i < (state.items || []).length; i++) {
      sub += Number(state.items[i].harga || 0) * Number(state.items[i].qty || 0);
    }
    totals = { subtotal: sub, delivery_fee: 0, total: sub };
  }

  var itemsHtml = '';
  if (state.items && state.items.length) {
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var key = it.cartKey || it.product_id || it.id;
      var variTxt = it.variants
        ? typeof it.variants === 'object'
          ? it.variants.name || ''
          : ''
        : '';
      var addonTxt =
        it.addons && it.addons.length
          ? it.addons.map((a) => a.name).join(', ')
          : '';
      itemsHtml += `<div class="card" style="margin:0 0 10px 0;border:1px solid var(--border);border-radius:16px;padding:12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);box-shadow:0 2px 8px rgba(0,0,0,0.08);position:relative;overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--primary)"></div><div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:22px">🍱</div><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${
        it.name || ''
      }</div><div class="muted" style="font-size:11px">Rp ${Number(
        it.harga || 0
      ).toLocaleString()} x ${it.qty} ${
        variTxt ? `• ${variTxt}` : ''
      }</div>${
        addonTxt ? `<div class="muted" style="font-size:10px">+ ${addonTxt}</div>` : ''
      }<div style="font-weight:700;font-size:12px;color:var(--primary);margin-top:2px">Rp ${(
        Number(it.harga || 0) * Number(it.qty || 0)
      ).toLocaleString()}</div></div><div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:4px"><button onclick="window._cartQty('${key}',${
        it.qty - 1
      })" class="btn secondary" style="width:28px;height:28px;border-radius:50%;padding:0">−</button><span style="min-width:20px;text-align:center;font-weight:800;font-size:13px">${
        it.qty
      }</span><button onclick="window._cartQty('${key}',${
        it.qty + 1
      })" class="btn secondary" style="width:28px;height:28px;border-radius:50%;padding:0;background:var(--primary);color:white;border:none">+</button></div><button onclick="window._removeCartItem('${key}')" style="font-size:10px;background:transparent;border:none;color:#ef4444">🗑️ Hapus</button></div></div></div>`;
    }
  } else {
    itemsHtml = `<div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang masih kosong</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:8px 16px;font-size:12px">+ Cari Makanan</a></div>`;
  }

  var distance_km = state.distanceKm || 0;
  if (state.pickup && state.pickup.lat && state.dest && state.dest.lat) {
    distance_km = calcHav(
      state.pickup.lat,
      state.pickup.lng,
      state.dest.lat,
      state.dest.lng
    );
  }
  var delivery_fee =
    !state.items || !state.items.length
      ? 0
      : distance_km <= 2
      ? 3000
      : Math.max(3000, Math.round(distance_km * 3000));
  var total = totals.subtotal + delivery_fee;
  var warungName =
    state.storeName || state.pickup?.text || state.pickup?.name || 'Warung';
  var warungAlamat = state.pickup?.alamat_text || state.pickup?.text || '';
  var warungLat = state.pickup?.lat || 0;
  var warungLng = state.pickup?.lng || 0;
  var destText = state.dest?.text || '';
  var destLat = state.dest?.lat || 0;
  var destLng = state.dest?.lng || 0;

  return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - ${
    state.storeName || 'Nasgor Pak W'
  }</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">${
    state.items?.length || 0
  } item • ${warungName}</p><div class="list" style="margin-top:10px">${itemsHtml}</div><div style="height:12px"></div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px">
        <div style="font-weight:800;font-size:12px;margin-bottom:6px">📍 Detail Jarak Warung</div>
        <div style="font-size:11px;line-height:1.5">
          <div>🏪 <b>${warungName}</b></div>
          <div class="muted" style="font-size:10px">${warungAlamat} ${
    warungLat ? `(${warungLat.toFixed(5)},${warungLng.toFixed(5)})` : ''
  }</div>
          <div style="margin-top:6px">🎯 <b>Tujuan:</b> ${
            destText || '<span class=muted>Belum set lokasi</span>'
          }</div>
          <div class="muted" style="font-size:10px">${
            destLat ? `(${destLat.toFixed(5)},${destLng.toFixed(5)})` : ''
          }</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <span style="background:#16a34a;color:white;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">Jarak: ${distance_km.toFixed(
              2
            )} km</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">Ongkir: Rp ${delivery_fee.toLocaleString()}</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">${
              distance_km <= 2
                ? '≤2km flat Rp 3rb'
                : 'Hitung Rp 3rb/km min Rp 3rb'
            }</span>
          </div>
        </div>
      </div>
      <div style="font-weight:800;font-size:12px">📍 Alamat Antar (Wajib Isi)</div>
      <input id="destText" value="${
        state.dest.text || ''
      }" placeholder="Contoh: RT 05 RW 02, Desa Suruh, Trenggalek" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border)"/>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button id="btnUseMyLocation" class="btn primary" style="flex:1;font-size:12px;padding:10px">📌 Pakai Lokasi Saya (Auto)</button>
      </div>
      <div class="muted" style="font-size:10px;margin-top:6px">💡 Klik tombol di atas untuk auto isi alamat + koordinat. Atau ketik manual alamat lengkap minimal 5 huruf.</div>
      <div class="muted" style="font-size:10px;margin-top:6px">Lat: <span id="cartLatDisplay">${
        state.dest.lat || '-'
      }</span> Lng: <span id="cartLngDisplay">${
    state.dest.lng || '-'
  }</span> • <span id="ongkirLiveStatus">Total ongkir Rp ${delivery_fee.toLocaleString()} untuk ${distance_km.toFixed(
    2
  )} km</span></div>
    </div>
    <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal (${
        state.items?.length || 0
      } item)</span><span>Rp ${totals.subtotal.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Ongkir (${distance_km.toFixed(
        2
      )} km)</span><span>Rp ${delivery_fee.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;font-size:14px"><span>Total</span><span>Rp ${total.toLocaleString()}</span></div>
    </div></div><div class="card" style="margin-top:12px;border:2px solid #16a34a"><div style="display:flex;justify-content:space-between"><h3 style="margin:0;font-size:14px">🏍️ Driver Terdekat dari Warung</h3><button id="btnRefreshDrivers" class="btn secondary" style="width:auto;font-size:11px">🔄 Refresh</button></div><div id="foodDriverStatus" class="muted" style="font-size:11px;margin-top:6px">Memuat...</div><div id="nearbyDriversList" style="margin-top:10px"></div><div style="margin-top:12px"><button id="btnCheckoutBroadcast" class="btn secondary" style="width:100%">📢 Broadcast ke Semua Driver</button></div></div>`;
}

export async function viewMyStore() {
  try {
    const profile = await getProfile();
    if (!profile) return '<div class="card">Login dulu</div>';
    let stores = [];
    let q = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', profile.id)
      .limit(20);
    if (!q.data || !q.data.length) {
      let q2 = await supabase
        .from('stores')
        .select('*')
        .eq('user_id', profile.id)
        .limit(20);
      if (q2.data?.length) stores = q2.data;
      else {
        try {
          stores = await warungStore._actions.fetchMyStores();
        } catch (e) {}
        if (!stores.length && q.data?.length) stores = q.data;
      }
    } else stores = q.data;

    // Jika belum ada warung, langsung tampilkan form buat inline
    if (!stores.length) {
      return `<div class="card" style="border:none;background:transparent;box-shadow:none;padding:0">
        <h2 style="font-size:22px;margin-bottom:12px">🏪 Warungku</h2>
        <div id="warungCreateForm" class="card" style="border:2px solid #16a34a;border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%)">
          <h3 style="margin:0 0 12px 0">+ Buat Warung Pertama</h3>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungCreateName" placeholder="Contoh: Nasgor Pak W" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
            <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungCreateAlamat" placeholder="RT12 RW05, Jalan..." style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungCreateLat" type="number" step="0.000001" placeholder="-8.095" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungCreateLng" type="number" step="0.000001" placeholder="111.635" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
            <div style="display:flex;gap:6px"><button id="btnWarungCreateMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungCreateMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
            <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungCreateIsOpen" type="checkbox" checked/> Warung Buka</label>
            <button id="btnSaveWarungCreate" class="btn primary" style="width:100%;padding:12px;border-radius:12px;font-weight:800">+ Buat Warung</button>
          </div>
        </div>
      </div>`;
    }

    const cards = stores
      .map(
        (s) =>
          `<div class="card" style="margin:0 0 12px 0;border:1px solid var(--border);border-radius:16px;padding:12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center"><div style="width:40px;height:40px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:20px">🏪</div><div><b style="font-size:14px">${
            s.name
          }</b><div class="muted" style="font-size:11px">${
            s.alamat_text || ''
          }</div></div></div><span style="font-size:10px;background:${
            s.is_open ? '#16a34a' : '#ef4444'
          };color:white;padding:4px 10px;border-radius:99px;font-weight:700">${
            s.is_open ? 'BUKA' : 'TUTUP'
          }</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button onclick="window._toggleWarung('${
            s.id
          }',${!s.is_open})" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px">${
            s.is_open ? '🔴 Tutup' : '🟢 Buka'
          }</button><a href="#/store/products/${
            s.id
          }" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px;text-align:center">🍱 Kelola Menu + Varian</a><button onclick="window._openWarungOrders('${
            s.id
          }')" class="btn primary" style="font-size:12px;padding:12px;border-radius:12px;background:#22c55e;color:#052e16;font-weight:800">📦 Order</button><button onclick="window._editWarung('${
            s.id
          }')" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px">✏️ Edit</button></div><button onclick="window._deleteWarung('${
            s.id
          }','${(s.name || '').replace(
            /'/g,  "\\'"
          )}')" class="btn secondary" style="width:100%;margin-top:8px;font-size:11px;padding:8px;border-radius:10px;background:#fee2e2;color:#dc2626;border:1px solid #fecaca">🗑️ Hapus Warung</button></div>`
      )
      .join('');

    return `<div class="card" style="border:none;background:transparent;box-shadow:none;padding:0">
      <h2 style="font-size:22px;margin-bottom:12px">🏪 Warungku</h2>
      
      <!-- Form Create Inline -->
      <div id="warungCreateForm" style="display:none" class="card" style="border:2px solid #16a34a;border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">+ Tambah Warung</h3><button onclick="window._closeWarungCreateForm()" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">✕</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungCreateName" placeholder="Nama Warung" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
          <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungCreateAlamat" placeholder="RT/RW, Jalan, Desa" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungCreateLat" type="number" step="0.000001" placeholder="-8.095" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungCreateLng" type="number" step="0.000001" placeholder="111.635" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
          <div style="display:flex;gap:6px"><button id="btnWarungCreateMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungCreateMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
          <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungCreateIsOpen" type="checkbox" checked/> Warung Buka</label>
          <div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._closeWarungCreateForm()" class="btn secondary" style="flex:1;padding:12px;border-radius:10px">Batal</button><button id="btnSaveWarungCreate" class="btn primary" style="flex:1;padding:12px;border-radius:10px;font-weight:800">+ Buat</button></div>
        </div>
      </div>

      <!-- Form Edit Inline -->
      <div id="warungEditForm" style="display:none" class="card" style="border:2px solid #f59e0b;border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">✏️ Edit Warung</h3><button onclick="window._closeWarungEditForm()" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">✕</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungEditName" placeholder="Nama Warung" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
          <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungEditAlamat" placeholder="RT/RW, Jalan, Desa" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungEditLat" type="number" step="0.000001" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungEditLng" type="number" step="0.000001" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
          <div style="display:flex;gap:6px"><button id="btnWarungEditMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungEditMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
          <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungEditIsOpen" type="checkbox"/> Warung Buka</label>
          <div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._closeWarungEditForm()" class="btn secondary" style="flex:1;padding:12px;border-radius:10px">Batal</button><button id="btnSaveWarungEdit" class="btn primary" style="flex:1;padding:12px;border-radius:10px;font-weight:800">💾 Simpan</button></div>
        </div>
      </div>

      <div class="list">${cards}</div>
      <button onclick="window._addWarung()" class="btn secondary" style="width:100%;margin-top:12px;text-align:center;padding:12px;border-radius:12px">+ Tambah Warung</button>
    </div>`;
  } catch (e) {
    return `<div class="card">Error Warungku: ${e.message}</div>`;
  }
}

export async function viewStoreProducts(storeId) {
  try {
    if (!storeId) {
      const profile = await getProfile();
      let { data: stores } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', profile.id)
        .limit(1);
      if (!stores?.length) {
        let q2 = await supabase
          .from('stores')
          .select('id')
          .eq('user_id', profile.id)
          .limit(1);
        stores = q2.data;
      }
      if (!stores?.length)
        return '<div class="card">Buat warung dulu</div>';
      storeId = stores[0].id;
    }
    const { data: store } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();
    const { data: products } = await supabase
      .from('store_products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(100);
    const listHtml =
      (products || [])
        .map((p) => {
          let vari = [];
          try {
            vari =
              typeof p.variants === 'string'
                ? JSON.parse(p.variants)
                : p.variants || [];
          } catch (e) {}
          let addons = [];
          try {
            addons =
              typeof p.addons === 'string'
                ? JSON.parse(p.addons)
                : p.addons || [];
          } catch (e) {}
          const variTxt = vari.length
            ? vari
                .map(
                  (v) =>
                    v.name + (v.price_delta ? ` (+${v.price_delta})` : '')
                )
                .join(', ')
            : 'Biasa';
          const addonTxt = addons.length
            ? addons.map((a) => a.name).join(', ')
            : '-';
          return `<div class="card" style="margin:0 0 10px 0;border:1px solid var(--border);border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><div><b>${
            p.name
          }</b><div class="muted" style="font-size:11px">Rp ${Number(
            p.harga || 0
          ).toLocaleString()} • ${p.kategori || ''} • <span style="background:${
            p.is_available ? '#16a34a' : '#ef4444'
          };color:white;padding:2px 6px;border-radius:6px;font-size:10px">${
            p.is_available ? 'TERSEDIA' : 'HABIS'
          }</span></div><div class="muted" style="font-size:10px">Varian: ${variTxt} | Addon: ${addonTxt}</div></div><button onclick="window._toggleProduct('${
            p.id
          }',${!p.is_available})" class="btn secondary" style="width:auto;font-size:11px">${
            p.is_available ? 'Nonaktif' : 'Aktif'
          }</button></div><div style="display:flex;gap:6px;margin-top:8px"><button onclick="window._editProduct('${
            p.id
          }')" class="btn secondary" style="flex:1;font-size:11px">✏️ Edit Varian/Addon</button><button onclick="window._deleteProduct('${
            p.id
          }')" class="btn secondary" style="flex:1;font-size:11px;background:#fee2e2;color:#dc2626">🗑️</button></div></div>`;
        })
        .join('') || '<div class="muted">Belum ada menu</div>';
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><h2>🍱 Kelola Menu - ${
      store?.name || ''
    }</h2><button onclick="window._addProduct('${storeId}')" class="btn primary" style="width:100%;margin-top:12px;padding:12px">+ Tambah Menu + Varian & Addon</button></div><div class="list" style="margin-top:12px">${listHtml}</div>
      <div id="productModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px"><div style="background:var(--card);width:100%;max-width:480px;border-radius:16px;padding:16px;max-height:92vh;overflow:auto"><h3 id="productModalTitle">Tambah Menu</h3><div style="display:flex;flex-direction:column;gap:10px;margin-top:12px"><input id="prodName" placeholder="Nama menu" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodHarga" type="number" placeholder="Harga dasar" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodKategori" placeholder="Kategori" value="Makanan" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><label style="font-size:12px"><input id="prodAvailable" type="checkbox" checked/> Tersedia</label>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">📦 Varian</b><button onclick="window._addVariantField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Varian</button></div><div id="prodVariantsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">➕ Addon</b><button onclick="window._addAddonField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Addon</button></div><div id="prodAddonsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="display:flex;gap:8px"><button onclick="window._closeProductModal()" class="btn secondary" style="flex:1">Batal</button><button id="btnSaveProduct" class="btn primary" style="flex:1">Simpan</button></div></div></div></div>`;
  } catch (e) {
    return `<div class="card">Error: ${e.message}</div>`;
  }
}

export async function viewStoreOrders(storeId) {
  try {
    let query = supabase
      .from('food_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (storeId) query = query.eq('store_id', storeId);
    const { data: orders } = await query;
    const listHtml =
      (orders || [])
        .map(
          (o) =>
            `<div class="card" style="margin:0 0 10px 0;border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><b>#${o.id
              .slice(0, 6)
              .toUpperCase()}</b><span style="font-size:10px;background:#f59e0b;color:white;padding:3px 8px;border-radius:99px">${
              o.status
            }</span></div><div class="muted" style="font-size:11px">${(
              o.items || []
            )
              .map((i) => i.name + ' x' + i.qty)
              .join(', ')}</div><div style="font-size:11px">Rp ${Number(
              o.total || 0
            ).toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:8px"><button onclick="window._orderStatus('${
              o.id
            }','preparing')" class="btn secondary" style="flex:1;font-size:11px">Masak</button><button onclick="window._orderStatus('${
              o.id
            }','ready')" class="btn secondary" style="flex:1;font-size:11px">Siap</button><button onclick="window._orderStatus('${
              o.id
            }','completed')" class="btn primary" style="flex:1;font-size:11px">Selesai</button></div></div>`
        )
        .join('') || 'Belum ada order';
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><h2>📦 Order Masuk</h2><div class="list" style="margin-top:12px">${listHtml}</div></div>`;
  } catch (e) {
    return `<div class="card">Error: ${e.message}</div>`;
  }
}

window._loadNearbyDriversForCart = async function () {
  var listEl = document.getElementById('nearbyDriversList');
  var statusEl = document.getElementById('foodDriverStatus');
  var ojolListEl = document.getElementById('driverList');
  if (!listEl && ojolListEl) listEl = ojolListEl;
  try {
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if (!raw) {
      if (statusEl) statusEl.textContent = 'Keranjang kosong';
      return;
    }
    var state = JSON.parse(raw);

    if (!state.pickup || !state.pickup.lat || !state.pickup.lng) {
      console.log('[food-driver] pickup missing, auto fetch dari stores');
      var fetched = false;
      try {
        const cs = cartStore.getState();
        if (cs && cs.store && (cs.store.lat || cs.store.latitude)) {
          var clat = cs.store.lat || cs.store.latitude;
          var clng = cs.store.lng || cs.store.longitude || cs.store.long;
          if (clat && clng) {
            state.pickup = {
              lat: Number(clat),
              lng: Number(clng),
              text: cs.store.name || cs.storeName || '',
              alamat_text: cs.store.alamat_text || ''
            };
            fetched = true;
          }
        } else if (cs && cs.pickup && cs.pickup.lat) {
          state.pickup = cs.pickup;
          fetched = true;
        }
        if (!state.storeId && cs && (cs.storeId || cs.store?.id))
          state.storeId = cs.storeId || cs.store?.id;
      } catch (e) {}

      if (!state.pickup || !state.pickup.lat) {
        var sid = state.storeId;
        if (!sid && state.items && state.items.length) {
          try {
            const pid = state.items[0].product_id || state.items[0].id;
            const { data: p } = await supabase
              .from('store_products')
              .select('store_id')
              .eq('id', pid)
              .maybeSingle();
            if (p && p.store_id) sid = p.store_id;
          } catch (e) {}
        }
        if (sid) {
          try {
            const { data: store } = await supabase
              .from('stores')
              .select('id,name,lat,lng,latitude,longitude,alamat_text')
              .eq('id', sid)
              .single();
            if (store) {
              var sLat = store.lat || store.latitude;
              var sLng = store.lng || store.longitude;
              if (sLat != null && sLng != null) {
                sLat = Number(sLat);
                sLng = Number(sLng);
                if (!isNaN(sLat) && !isNaN(sLng) && sLat !== 0 && sLng !== 0) {
                  state.pickup = {
                    lat: sLat,
                    lng: sLng,
                    text: store.name,
                    alamat_text: store.alamat_text
                  };
                  state.storeId = sid;
                  try {
                    localStorage.setItem(
                      'ojol_cart_v2_food',
                      JSON.stringify(state)
                    );
                  } catch (e) {}
                  fetched = true;
                }
              }
            }
          } catch (e) {
            console.warn('[food-driver] fetch store fail', e);
          }
        }
      }

      if (!state.pickup || !state.pickup.lat) {
        if (state.dest && state.dest.lat && state.dest.lng) {
          state.pickup = {
            lat: state.dest.lat,
            lng: state.dest.lng,
            text: 'Lokasi antar (fallback)',
            alamat_text: ''
          };
          if (statusEl)
            statusEl.textContent =
              '⚠️ Lokasi warung tidak terbaca, menampilkan driver di sekitar tujuan...';
        } else {
          if (statusEl) statusEl.textContent = 'Mencari driver...';
          state.pickup = { lat: -7.98, lng: 111.62, text: 'Suruh', alamat_text: '' };
        }
      }
    }

    if (statusEl)
      statusEl.textContent =
        'Mencari driver terdekat dari ' + (state.pickup.text || 'warung') + '...';
    if (listEl)
      listEl.innerHTML =
        '<div class=muted style="padding:12px;text-align:center">🔍 Mencari driver seperti di ojek...</div>';

    var { data: locs, error: locErr } = await supabase
      .from('driver_locations')
      .select('*')
      .limit(100);
    if (locErr) {
      var { data: usersOnly } = await supabase
        .from('users')
        .select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor')
        .eq('role', 'driver')
        .limit(20);
      if (usersOnly && usersOnly.length) {
        locs = usersOnly.map((u) => ({
          driver_id: u.id,
          lat: state.pickup.lat + (Math.random() - 0.5) * 0.02,
          lng: state.pickup.lng + (Math.random() - 0.5) * 0.02,
          jenis_kendaraan: u.jenis_kendaraan
        }));
      } else {
        if (statusEl) statusEl.textContent = 'Error RLS: ' + locErr.message;
        if (listEl)
          listEl.innerHTML =
            '<div style="padding:12px;background:#fee2e2;border-radius:8px;font-size:11px">Gagal baca driver_locations: ' +
            locErr.message +
            '</div>';
        return;
      }
    }

    if (!locs || !locs.length) {
      var { data: fallbackUsers } = await supabase
        .from('users')
        .select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor')
        .eq('role', 'driver')
        .limit(20);
      if (fallbackUsers && fallbackUsers.length) {
        locs = fallbackUsers.map((u) => ({
          driver_id: u.id,
          lat: state.pickup.lat + (Math.random() - 0.5) * 0.01,
          lng: state.pickup.lng + (Math.random() - 0.5) * 0.01,
          jenis_kendaraan: u.jenis_kendaraan
        }));
        if (statusEl)
          statusEl.textContent =
            'Driver lokasi kosong, menampilkan ' +
            fallbackUsers.length +
            ' driver (dummy lokasi)';
      } else {
        if (statusEl) statusEl.textContent = 'Tidak ada driver online';
        if (listEl)
          listEl.innerHTML =
            '<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:12px">Tidak ada driver online</div>';
        return;
      }
    }

    var driverIds = locs.map((l) => l.driver_id || l.user_id).filter(Boolean);
    var { data: users } = await supabase
      .from('users')
      .select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor,google_id')
      .in('id', driverIds);
    if (!users || !users.length) {
      var { data: users2 } = await supabase
        .from('users')
        .select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor,google_id')
        .in('google_id', driverIds);
      if (users2 && users2.length) users = users2;
    }
    if (!users || !users.length) {
      users = locs.map((l) => ({
        id: l.driver_id,
        name: 'Driver ' + String(l.driver_id || '').slice(0, 6),
        role: 'driver',
        jenis_kendaraan: l.jenis_kendaraan || 'motor',
        nopol: '',
        hp: '',
        tipe_motor: 'Beat'
      }));
    }

    var ratingsMap = await fetchDriverRatings(driverIds);

    var drivers = locs
      .map((loc) => {
        var u =
          users.find(
            (usr) => usr.id === loc.driver_id || usr.google_id === loc.driver_id
          ) || {};
        var dist = calcHav(state.pickup.lat, state.pickup.lng, loc.lat, loc.lng);
        var r = ratingsMap[loc.driver_id] || { avg: '5.0', count: 0 };
        return {
          id: loc.driver_id,
          name: u.name || 'Driver',
          hp: u.hp || '',
          jenis: u.jenis_kendaraan || loc.jenis_kendaraan || 'motor',
          nopol: u.nopol || '-',
          tipe_motor: u.tipe_motor || 'Motor',
          dist: dist,
          lat: loc.lat,
          lng: loc.lng,
          ratingAvg: r.avg,
          ratingCount: r.count
        };
      })
      .sort((a, b) => a.dist - b.dist);

    if (statusEl)
      statusEl.textContent =
        'Ditemukan ' + drivers.length + ' driver terdekat dari warung';

    var cards = drivers
      .map((d) => {
        var distTxt =
          d.dist < 1
            ? Math.round(d.dist * 1000) + ' m'
            : d.dist.toFixed(1) + ' km';
        return `<div class="driver-card" style="margin-bottom:8px;padding:10px;border:1px solid var(--border);border-radius:12px;display:flex;justify-content:space-between;align-items:center;background:var(--card)">
        <div>
          <div style="font-weight:700;font-size:13px">${d.name} <span style="font-size:11px;color:#f59e0b">★ ${d.ratingAvg} (${d.ratingCount})</span></div>
          <div class="muted" style="font-size:10px">${d.tipe_motor} • ${d.nopol}</div>
          <div style="font-size:10px;color:#16a34a;font-weight:700;margin-top:2px">📍 ${distTxt} dari warung</div>
        </div>
        <button onclick="window._chooseFoodDriver('${d.id}','${d.name}')" class="btn primary" style="padding:6px 12px;font-size:11px;border-radius:8px">Pilih Driver</button>
      </div>`;
      })
      .join('');

    if (listEl) listEl.innerHTML = cards;
  } catch (e) {
    console.error('[food-driver] error', e);
    if (statusEl) statusEl.textContent = 'Gagal memuat driver: ' + e.message;
  }
};

window._chooseFoodDriver = async function (driverId, driverName) {
  try {
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if (!raw) return alert('Keranjang kosong');
    var state = JSON.parse(raw);
    var profile = await getProfile();

    var { data, error } = await supabase
      .from('food_orders')
      .insert([
        {
          user_id: profile?.id || null,
          store_id: state.storeId,
          items: state.items,
          total: state.total || 0,
          status: 'pending',
          driver_id: driverId,
          dest_text: state.dest?.text || '',
          dest_lat: state.dest?.lat,
          dest_lng: state.dest?.lng
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // Kunci Pembersihan setelah checkout berhasil
    window._clearFoodCart();

    alert('Pesanan berhasil dibuat & dikirim ke driver ' + driverName + '!');
    window.location.hash = '#/store';
  } catch (e) {
    alert('Gagal membuat pesanan: ' + e.message);
  }
};
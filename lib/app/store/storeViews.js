
// =================================================================================
// FILE: lib/app/store/storeViews.js - FINAL FIX WARUNGKU & KELOLA MENU
// - File asli kamu: file4760533940745668490.js (FULL OPSI A + Peta + 5 driver)
// - Masalah: viewMyStore & viewStoreProducts cuma dummy -> sekarang FIX
// - Warungku: fetch stores milik user, toggle buka/tutup, edit, lihat order
// - Kelola Menu: CRUD store_products
// - Cart: 5 driver inline tanpa modal (sesuai request sebelumnya) + tracking modal di lib/app/trackingFood.js
// =================================================================================

import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

// =================================================================================
// BLOK 0: HELPER
// =================================================================================
function calcHav(lat1,lng1,lat2,lng2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// =================================================================================
// BLOK 1: BLOK WARUNG - LIST WARUNG BUKA (untuk customer)
// =================================================================================
export async function viewStoreList(){
  try{
    let stores = [];
    try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ 
      const { data } = await supabase.from('stores').select('*').eq('is_open', true).limit(30);
      stores = data||[];
    }
    const cards = stores.map(s => `
      <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>${s.name}</b>
          <span style="font-size:10px;background:${s.is_open ? '#16a34a' : '#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open ? 'BUKA' : 'TUTUP'}</span>
        </div>
        <div class="muted" style="font-size:11px">${s.alamat_text || ''}</div>
        <a href="#/store/detail/${s.id}" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a>
      </div>
    `).join('');
    return `
      <div class="card">
        <h2>🍔 Warung Buka</h2>
        <p class="muted" style="font-size:11px">Flow: Checkout cari driver dulu - driver terima - warung baru masak (driver_assigned)</p>
        <div class="list">${cards || '<div class="muted">Belum ada warung buka</div>'}</div>
      </div>
    `;
  }catch(e){
    return `<div class="card"><p class="muted">Error store: ${e.message}</p></div>`;
  }
}

// =================================================================================
// BLOK 2: BLOK MENU - DETAIL WARUNG UNTUK CUSTOMER (pilih varian)
// =================================================================================
export async function viewStoreDetail(storeId){
  try{
    const { data: store, error } = await supabase.from('stores').select('*').eq('id', storeId).single();
    if(error || !store) return '<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>';
    let products = [];
    try{ products = await productStore._actions.fetchByStore(storeId, true); }catch(e){
      const { data } = await supabase.from('store_products').select('*').eq('store_id', storeId).eq('is_available', true).limit(50);
      products = data||[];
    }
    try{ cartStore._actions.setStore(store); }catch(e){}
    const prodJson = JSON.stringify(products).replace(/</g, '\u003c');
    const listHtml = products.map(p => {
      const harga = Number(p.harga || 0).toLocaleString('id-ID');
      return `
        <div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden">
          <div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)">
            <b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${harga} • ${p.kategori || 'Makanan'}</div>
          </div>
          <div style="padding:10px">
            <button class="btn primary" style="width:100%" onclick="window._openMenuBuilder('${p.id}')">🍱 Pilih Varian</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card"><a href="#/store" class="muted">← Kembali</a><h2 style="margin-top:8px">🏪 ${store.name}</h2><div class="muted" style="font-size:11px">${store.alamat_text || ''}</div></div>
      <div class="list" style="margin-top:12px">${listHtml || '<div class="muted">Belum ada menu</div>'}</div>
      <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center">
        <div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0">
          <div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card)">
            <div style="display:flex;justify-content:space-between;align-items:center"><div><div id="builderName" style="font-weight:800">Menu</div><div id="builderBase" class="muted" style="font-size:12px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:auto">✕</button></div>
          </div>
          <div style="padding:16px">
            <div style="font-weight:800;margin-bottom:8px">📦 Variasi</div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>
            <div style="font-weight:800;margin-bottom:8px">➕ Addon</div><div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">
              <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12px">Qty</span><div style="display:flex;gap:8px;align-items:center"><button id="builderQtyMinus" class="btn secondary" style="width:36px">-</button><span id="builderQty">1</span><button id="builderQtyPlus" class="btn secondary" style="width:36px">+</button></div></div>
              <div class="muted" style="font-size:12px;margin-top:8px" id="builderSummary">-</div><div style="font-size:18px;font-weight:800;color:var(--primary);margin-top:4px" id="builderTotal">Rp 0</div>
            </div>
            <button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800">+ Tambah ke Keranjang</button>
          </div>
        </div>
      </div>
      <script type="application/json" id="productsData">${prodJson}</script>
    `;
  }catch(e){
    return `<div class="card">Error detail: ${e.message}</div>`;
  }
}

// =================================================================================
// BLOK 3: BLOK FOOD - KERANJANG + 5 DRIVER TERDEKAT INLINE (TANPA MODAL)
// =================================================================================
export async function viewStoreCart(){
  let state; let rawLocal=null;
  try{ rawLocal=localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ 
    state=cartStore.getState(); 
    if((!state.items || !state.items.length) && rawLocal){
      try{ const parsed=JSON.parse(rawLocal); if(parsed.items?.length) state=parsed; }catch(e){}
    }
  }catch(e){
    const raw=localStorage.getItem('ojol_cart_v2_food');
    state=raw?JSON.parse(raw):{ items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  }
  if(!state) state={ items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  
  var totals; try{ totals=cartStore._actions.getTotals(); }catch(e){ var sub=0; for(var i=0;i<(state.items||[]).length;i++){ sub+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); } totals={ subtotal:sub, delivery_fee:0, total:sub, distance_km:0, count:(state.items||[]).length }; }

  var itemsHtml='';
  if(state.items && state.items.length){
    for(var i=0;i<state.items.length;i++){
      var it=state.items[i]; var key=it.cartKey||it.product_id||it.id;
      itemsHtml+='<div class="driver-card" style="flex-direction:column;gap:8px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1"><b>'+(it.name||'')+'</b><div class="muted" style="font-size:11px">Rp '+Number(it.harga||0).toLocaleString()+' x '+it.qty+'</div></div><div style="display:flex;gap:6px;align-items:center"><button onclick="window._cartQty(\''+key+'\','+(it.qty-1)+')" class="btn secondary" style="width:36px">-</button><span style="font-weight:700">'+it.qty+'</span><button onclick="window._cartQty(\''+key+'\','+(it.qty+1)+')" class="btn secondary" style="width:36px">+</button></div></div><button onclick="window._removeCartItem(\''+key+'\')" class="btn secondary" style="width:100%;font-size:11px;background:#fee2e2;color:#dc2626">Hapus</button></div>';
    }
  } else { itemsHtml='<div class="muted">Keranjang kosong.</div>'; }

  var distance_km=state.distanceKm||0;
  if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){ distance_km=calcHav(state.pickup.lat, state.pickup.lng, state.dest.lat, state.dest.lng); }
  var delivery_fee=(!state.items||!state.items.length)?0:(distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000)));
  var total=totals.subtotal+delivery_fee;

  return `
    <div class="card">
      <h2>🛒 Keranjang - ${state.storeName||'Warung'}</h2>
      <div class="list" style="margin-top:10px">${itemsHtml}</div>
      <hr style="margin:12px 0"/>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:10px">
        <div style="font-weight:800;font-size:12px">📍 Alamat Antar</div>
        <input id="destText" value="${state.dest.text||''}" placeholder="Tulis alamat lengkap" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border)"/>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button id="btnPickDest" class="btn secondary" style="flex:1;font-size:11px">📍 Pilih di Peta</button>
          <button id="btnUseMyLocation" class="btn secondary" style="flex:1;font-size:11px">📌 Lokasi Saya</button>
          <button id="btnPickWarungLoc" class="btn secondary" style="flex:1;font-size:11px">🏪 Lokasi Warung</button>
        </div>
        <div class="muted" style="font-size:10px;margin-top:6px">Lat: <span id="cartLatDisplay">${state.dest.lat||'-'}</span> Lng: <span id="cartLngDisplay">${state.dest.lng||'-'}</span> • Jarak ${distance_km.toFixed(2)} km • <span id="ongkirLiveStatus">Ongkir Rp ${delivery_fee.toLocaleString()}</span></div>
      </div>
      <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal</span><span>Rp ${totals.subtotal.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>Ongkir (${distance_km.toFixed(2)} km)</span><span>Rp ${delivery_fee.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;font-size:14px"><span>Total</span><span>Rp ${total.toLocaleString()}</span></div>
      </div>
    </div>

    <!-- BLOK FOOD - 5 DRIVER TERDEKAT INLINE (TANPA MODAL) -->
    <div class="card" style="margin-top:12px;border:2px solid #16a34a">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:14px">🏍️ Driver Terdekat dari Warung</h3>
        <button id="btnRefreshDrivers" class="btn secondary" style="width:auto;font-size:11px;padding:6px 10px">🔄 Refresh</button>
      </div>
      <div id="foodDriverStatus" class="muted" style="font-size:11px;margin-top:6px">Memuat driver...</div>
      <div id="nearbyDriversList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
        <div class="muted" style="padding:12px;text-align:center;font-size:12px">🔍 Mencari driver di sekitar warung...</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button id="btnCheckoutBroadcast" class="btn secondary" style="flex:1">📢 Broadcast ke Semua Driver</button>
      </div>
      <div class="muted" style="font-size:10px;margin-top:8px;text-align:center">Pilih driver langsung atau broadcast • Tracking tetap modal di lib/app/trackingFood.js</div>
    </div>
  `;
}

// =================================================================================
// BLOK 4: BLOK WARUNGKU - WARUNGKU (FIX UTAMA)
// Sebelumnya dummy, sekarang implementasi full
// =================================================================================
export async function viewMyStore(){
  try{
    const profile = await getProfile();
    if(!profile) return '<div class="card"><p class="muted">Login dulu</p></div>';
    
    // Coba beberapa kemungkinan kolom owner: owner_id, user_id, google_id
    let stores = [];
    let q = await supabase.from('stores').select('*').eq('owner_id', profile.id).limit(20);
    if(!q.data || !q.data.length){
      let q2 = await supabase.from('stores').select('*').eq('user_id', profile.id).limit(20);
      if(q2.data?.length) stores = q2.data;
      else {
        // fallback via warungStore
        try{ stores = await warungStore._actions.fetchMyStores(); }catch(e){}
        if(!stores.length && q.data?.length) stores = q.data;
      }
    } else stores = q.data;

    if(!stores.length){
      return `
        <div class="card">
          <h2>🏪 Warungku</h2>
          <p class="muted" style="font-size:11px">Kamu belum punya warung</p>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            <a href="#/store/create" class="btn primary" style="text-align:center;padding:12px">+ Buat Warung Baru</a>
            <div class="muted" style="font-size:11px">Buat warung dulu biar bisa kelola menu & terima order</div>
          </div>
        </div>
      `;
    }

    const cards = stores.map(s => `
      <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:10px;border:1px solid var(--border);border-radius:16px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>${s.name}</b>
          <span style="font-size:10px;background:${s.is_open ? '#16a34a' : '#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open ? 'BUKA' : 'TUTUP'}</span>
        </div>
        <div class="muted" style="font-size:11px">${s.alamat_text || ''}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button onclick="window._toggleWarung('${s.id}', ${!s.is_open})" class="btn secondary" style="font-size:11px;padding:8px">${s.is_open ? '🔴 Tutup' : '🟢 Buka'}</button>
          <a href="#/store/products/${s.id}" class="btn secondary" style="font-size:11px;padding:8px;text-align:center">🍱 Kelola Menu</a>
          <a href="#/store/orders/${s.id}" class="btn primary" style="font-size:11px;padding:8px;text-align:center">📦 Order Masuk</a>
          <button onclick="window._editWarung('${s.id}')" class="btn secondary" style="font-size:11px;padding:8px">✏️ Edit</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="card">
        <h2>🏪 Warungku</h2>
        <p class="muted" style="font-size:11px">Kelola warung milik kamu</p>
        <div class="list" style="margin-top:12px">${cards}</div>
        <a href="#/store/create" class="btn secondary" style="width:100%;margin-top:12px;text-align:center">+ Tambah Warung</a>
      </div>
    `;
  }catch(e){
    return `<div class="card"><p class="muted">Error Warungku: ${e.message}</p></div>`;
  }
}

// =================================================================================
// BLOK 5: BLOK MENU - KELOLA MENU (FIX UTAMA)
// Sebelumnya dummy, sekarang CRUD store_products
// =================================================================================
export async function viewStoreProducts(storeId){
  try{
    if(!storeId){
      // Jika tidak ada storeId, ambil warung pertama milik user
      const profile = await getProfile();
      let { data: stores } = await supabase.from('stores').select('id').eq('owner_id', profile.id).limit(1);
      if(!stores?.length){
        let q2 = await supabase.from('stores').select('id').eq('user_id', profile.id).limit(1);
        stores = q2.data;
      }
      if(!stores?.length) return '<div class="card"><p class="muted">Buat warung dulu</p><a href="#/store/my" class="btn primary">Ke Warungku</a></div>';
      storeId = stores[0].id;
    }

    const { data: store } = await supabase.from('stores').select('*').eq('id', storeId).single();
    const { data: products } = await supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100);

    const listHtml = (products||[]).map(p => `
      <div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga||0).toLocaleString()} • ${p.kategori||'Makanan'} • <span style="background:${p.is_available?'#16a34a':'#ef4444'};color:white;padding:2px 6px;border-radius:6px;font-size:10px">${p.is_available?'TERSEDIA':'HABIS'}</span></div></div>
          <button onclick="window._toggleProduct('${p.id}', ${!p.is_available})" class="btn secondary" style="width:auto;font-size:11px;padding:6px 8px">${p.is_available?'Nonaktifkan':'Aktifkan'}</button>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="window._editProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px;padding:8px">✏️ Edit</button>
          <button onclick="window._deleteProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px;padding:8px;background:#fee2e2;color:#dc2626">🗑️ Hapus</button>
        </div>
      </div>
    `).join('') || '<div class="muted">Belum ada menu. Tambah menu pertama kamu.</div>';

    return `
      <div class="card">
        <a href="#/store/my" class="muted">← Warungku</a>
        <h2 style="margin-top:8px">🍱 Kelola Menu - ${store?.name||''}</h2>
        <p class="muted" style="font-size:11px">Store ID: ${storeId}</p>
        <button onclick="window._addProduct('${storeId}')" class="btn primary" style="width:100%;margin-top:12px;padding:12px">+ Tambah Menu Baru</button>
      </div>
      <div class="list" style="margin-top:12px">${listHtml}</div>
      
      <!-- Modal Tambah/Edit Menu -->
      <div id="productModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px">
        <div style="background:var(--card);width:100%;max-width:420px;border-radius:16px;padding:16px;max-height:90vh;overflow:auto">
          <h3 id="productModalTitle" style="margin:0">Tambah Menu</h3>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
            <input id="prodName" placeholder="Nama menu" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/>
            <input id="prodHarga" type="number" placeholder="Harga" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/>
            <input id="prodKategori" placeholder="Kategori (Makanan/Minuman)" value="Makanan" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/>
            <label style="font-size:12px"><input id="prodAvailable" type="checkbox" checked/> Tersedia</label>
            <div style="display:flex;gap:8px">
              <button onclick="window._closeProductModal()" class="btn secondary" style="flex:1">Batal</button>
              <button id="btnSaveProduct" class="btn primary" style="flex:1">Simpan</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }catch(e){
    return `<div class="card"><p class="muted">Error kelola menu: ${e.message}</p></div>`;
  }
}

export async function viewStoreOrders(storeId){
  try{
    let query = supabase.from('food_orders').select('*').order('created_at', { ascending: false }).limit(30);
    if(storeId) query = query.eq('store_id', storeId);
    const { data: orders } = await query;
    
    const listHtml = (orders||[]).map(o => `
      <div class="card" style="margin:0;border:1px solid var(--border);border-radius:12px;padding:10px">
        <div style="display:flex;justify-content:space-between"><b>#${o.id.slice(0,6).toUpperCase()}</b><span style="font-size:10px;background:#f59e0b;color:white;padding:3px 8px;border-radius:99px">${o.status}</span></div>
        <div class="muted" style="font-size:11px;margin-top:4px">${(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
        <div style="font-size:11px;margin-top:4px">Total Rp ${Number(o.total||0).toLocaleString()} • ${o.dest_text||''}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button onclick="window._orderStatus('${o.id}','preparing')" class="btn secondary" style="flex:1;font-size:11px">🍳 Masak</button>
          <button onclick="window._orderStatus('${o.id}','ready')" class="btn secondary" style="flex:1;font-size:11px">🍱 Siap</button>
          <button onclick="window._orderStatus('${o.id}','picked')" class="btn secondary" style="flex:1;font-size:11px">🚚 Diantar</button>
          <button onclick="window._orderStatus('${o.id}','completed')" class="btn primary" style="flex:1;font-size:11px">✅ Selesai</button>
        </div>
      </div>
    `).join('') || '<div class="muted">Belum ada order</div>';

    return `
      <div class="card">
        <a href="#/store/my" class="muted">← Warungku</a>
        <h2 style="margin-top:8px">📦 Order Masuk ${storeId?'- '+storeId.slice(0,6):''}</h2>
        <div class="list" style="margin-top:12px">${listHtml}</div>
      </div>
    `;
  }catch(e){
    return `<div class="card">Error order: ${e.message}</div>`;
  }
}

// =================================================================================
// BLOK 6: BLOK FOOD - LOGIC CART + 5 DRIVER + CHECKOUT + TRACKING
// =================================================================================
window._loadNearbyDriversForCart = async function(){
  var listEl=document.getElementById('nearbyDriversList');
  var statusEl=document.getElementById('foodDriverStatus');
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food');
    if(!raw){ if(statusEl) statusEl.textContent='Keranjang kosong'; return; }
    var state=JSON.parse(raw);
    if(!state.pickup || !state.pickup.lat){ if(statusEl) statusEl.textContent='Pickup warung belum ada'; return; }
    if(statusEl) statusEl.textContent='Mencari driver di sekitar warung...';
    if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">🔍 Mencari...</div>';
    var { data: locs } = await supabase.from('driver_locations').select('*').limit(50);
    if(!locs || !locs.length){
      if(statusEl) statusEl.textContent='Tidak ada driver online';
      if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">Tidak ada driver online.<br/>Broadcast ke semua driver.</div>';
      return;
    }
    var driverIds=locs.map(l=>l.driver_id).filter(Boolean);
    var { data: users } = await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol').in('id', driverIds);
    var drivers=locs.map(loc=>{
      var u=users?users.find(x=>x.id===loc.driver_id):null; if(!u) return null;
      if((u.role||'').toLowerCase()!=='driver') return null;
      var dLat=null,dLng=null; if(loc.lat && loc.lng){ dLat=loc.lat; dLng=loc.lng; } else if(loc.lokasi){ try{ var m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} } if(!dLat) return null;
      var dist=calcHav(state.pickup.lat, state.pickup.lng, dLat, dLng);
      return { ...u, driver_id:u.id, distance_km:dist };
    }).filter(Boolean).sort((a,b)=>a.distance_km-b.distance_km).slice(0,5);
    if(statusEl) statusEl.textContent='Ditemukan '+drivers.length+' driver terdekat';
    if(listEl){
      listEl.innerHTML=drivers.map(d=>{
        var icon=(d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
        return '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:center"><div style="flex:1"><div style="font-weight:800;font-size:13px">'+d.name+' '+icon+' <span style="background:#22c55e;color:#052e16;padding:2px 6px;border-radius:6px;font-size:10px">'+d.distance_km.toFixed(2)+' km</span></div><div class="muted" style="font-size:11px">'+(d.nopol||'')+'</div></div><button data-driver-id="'+d.driver_id+'" class="btn-choose-driver" style="background:#22c55e;color:#052e16;border:none;padding:10px 14px;border-radius:10px;font-weight:800;font-size:12px">✅ Pilih</button></div>';
      }).join('') || '<div class="muted">Tidak ada driver terdekat</div>';
    }
  }catch(err){ if(statusEl) statusEl.textContent='Error: '+err.message; }
};

window._checkoutFoodDirect = async function(driverId){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw); if(!state.items?.length) return alert('Keranjang kosong'); if(!state.dest.lat) return alert('Pilih lokasi antar dulu!');
    if(!confirm('Pesan dengan driver ini?')) return;
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat && state.dest?.lat){ distance_km=calcHav(state.pickup.lat, state.pickup.lng, state.dest.lat, state.dest.lng); }
    var delivery_fee=distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000));
    var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null;
    if(user){ var uRes=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={ store_id: state.storeId, customer_id: customerId, driver_id: driverId, items: state.items, subtotal, delivery_fee, total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: state.dest.text, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'driver_assigned' };
    var ins=await supabase.from('food_orders').insert(payload).select().single();
    var od=ins.data; var err=ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal={ store_id: payload.store_id, customer_id: payload.customer_id, driver_id: driverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
      var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.trackingFood?.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id);
    else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf=await import('../trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Gagal: '+e.message); }
};

window._checkoutFood = async function(){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw); if(!state.items?.length) return alert('Keranjang kosong'); if(!state.dest.lat) return alert('Pilih lokasi antar dulu!');
    var destText=document.getElementById('destText')?document.getElementById('destText').value.trim():state.dest.text||''; if(destText.length<5){ alert('Alamat harus lengkap'); return; }
    state.dest.text=destText; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=true; btn.textContent='Membuat pesanan...'; }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat && state.dest?.lat){ distance_km=calcHav(state.pickup.lat, state.pickup.lng, state.dest.lat, state.dest.lng); }
    var delivery_fee=distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null;
    if(user){ var uRes=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={ store_id: state.storeId, customer_id: customerId, items: state.items, subtotal, delivery_fee, total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'searching_driver' };
    var ins=await supabase.from('food_orders').insert(payload).select().single();
    var od=ins.data; var err=ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal={ store_id: payload.store_id, customer_id: payload.customer_id, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'searching_driver' };
      var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.trackingFood?.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id);
    else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf=await import('../trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Checkout gagal: '+e.message); var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=false; btn.textContent='📢 Broadcast ke Semua Driver'; } }
};

// =================================================================================
// BLOK 7: BLOK WARUNGKU & BLOK MENU - ACTIONS (toggle, add, edit, delete)
// =================================================================================
window._toggleWarung = async function(storeId, isOpen){
  try{
    const { error } = await supabase.from('stores').update({ is_open: isOpen }).eq('id', storeId);
    if(error) throw error;
    location.reload();
  }catch(e){ alert('Gagal toggle warung: '+e.message); }
};

window._editWarung = function(storeId){
  location.hash = '#/store/edit/'+storeId;
};

window._toggleProduct = async function(productId, isAvailable){
  try{
    const { error } = await supabase.from('store_products').update({ is_available: isAvailable }).eq('id', productId);
    if(error) throw error;
    location.reload();
  }catch(e){ alert('Gagal toggle produk: '+e.message); }
};

window._deleteProduct = async function(productId){
  if(!confirm('Hapus menu ini?')) return;
  try{
    const { error } = await supabase.from('store_products').delete().eq('id', productId);
    if(error) throw error;
    location.reload();
  }catch(e){ alert('Gagal hapus: '+e.message); }
};

let currentEditProductId = null;
let currentStoreIdForProduct = null;

window._addProduct = function(storeId){
  currentStoreIdForProduct = storeId;
  currentEditProductId = null;
  document.getElementById('productModalTitle').textContent = 'Tambah Menu Baru';
  document.getElementById('prodName').value = '';
  document.getElementById('prodHarga').value = '';
  document.getElementById('prodKategori').value = 'Makanan';
  document.getElementById('prodAvailable').checked = true;
  document.getElementById('productModal').style.display = 'flex';
  document.getElementById('btnSaveProduct').onclick = window._saveProduct;
};

window._editProduct = async function(productId){
  try{
    const { data: p } = await supabase.from('store_products').select('*').eq('id', productId).single();
    if(!p) return alert('Produk tidak ditemukan');
    currentEditProductId = productId;
    currentStoreIdForProduct = p.store_id;
    document.getElementById('productModalTitle').textContent = 'Edit Menu';
    document.getElementById('prodName').value = p.name||'';
    document.getElementById('prodHarga').value = p.harga||0;
    document.getElementById('prodKategori').value = p.kategori||'Makanan';
    document.getElementById('prodAvailable').checked = !!p.is_available;
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('btnSaveProduct').onclick = window._saveProduct;
  }catch(e){ alert(e.message); }
};

window._closeProductModal = function(){
  document.getElementById('productModal').style.display = 'none';
};

window._saveProduct = async function(){
  try{
    const name = document.getElementById('prodName').value.trim();
    const harga = Number(document.getElementById('prodHarga').value||0);
    const kategori = document.getElementById('prodKategori').value.trim()||'Makanan';
    const is_available = document.getElementById('prodAvailable').checked;
    if(!name) return alert('Nama harus diisi');
    if(!harga) return alert('Harga harus diisi');

    if(currentEditProductId){
      const { error } = await supabase.from('store_products').update({ name, harga, kategori, is_available }).eq('id', currentEditProductId);
      if(error) throw error;
    } else {
      const payload = { store_id: currentStoreIdForProduct, name, harga, kategori, is_available };
      const { error } = await supabase.from('store_products').insert(payload);
      if(error) throw error;
    }
    window._closeProductModal();
    location.reload();
  }catch(e){ alert('Gagal simpan: '+e.message); }
};

window._orderStatus = async function(id, status){ 
  if(!confirm('Ubah jadi ' + status + '?')) return; 
  try{ const { error } = await supabase.from('food_orders').update({ status: status }).eq('id', id); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } 
};

// =================================================================================
// BLOK 8: INIT & PETA HANDLERS (dari file asli)
// =================================================================================
(function(){
  function tryLoad(){
    if(location.hash && location.hash.indexOf('/store/cart')!==-1){
      setTimeout(function(){ try{ window._loadNearbyDriversForCart(); }catch(e){} }, 900);
    }
  }
  window.addEventListener('hashchange', tryLoad);
  setTimeout(tryLoad, 1200);
  window.addEventListener('food_dest_updated', function(){ setTimeout(function(){ window._loadNearbyDriversForCart(); }, 600); });
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='btnRefreshDrivers'){ window._loadNearbyDriversForCart(); }
    if(e.target && e.target.id==='btnCheckoutBroadcast'){ window._checkoutFood(); }
    var btn = e.target.closest ? e.target.closest('.btn-choose-driver') : null;
    if(btn && btn.getAttribute('data-driver-id')){ window._checkoutFoodDirect(btn.getAttribute('data-driver-id')); }
    if(e.target.closest('#btnPickDest')){ e.preventDefault(); window._pickDestMap && window._pickDestMap(); }
    if(e.target.closest('#btnUseMyLocation')){ e.preventDefault(); window._useMyLocation && window._useMyLocation(); }
    if(e.target.closest('#btnPickWarungLoc')){ e.preventDefault(); window._pickWarungMap && window._pickWarungMap(); }
  });
})();

window._pickDestMap = function(){ if(window.openMapPicker) window.openMapPicker(); else alert('Peta picker belum ready'); };
window._useMyLocation = function(){
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat = pos.coords.latitude; const lng = pos.coords.longitude;
    window.dispatchEvent(new CustomEvent('food_dest_updated', { detail: { lat, lng, text: 'Lokasi saya' } }));
  });
};
window._pickWarungMap = function(){
  try{
    const raw=localStorage.getItem('ojol_cart_v2_food');
    const s=JSON.parse(raw);
    if(s.pickup) window.dispatchEvent(new CustomEvent('food_dest_updated', { detail: { lat: s.pickup.lat, lng: s.pickup.lng, text: s.pickup.alamat_text || s.pickup.name }}));
  }catch(e){}
};
window.addEventListener('food_dest_updated', (e)=>{
  try{
    const d = e.detail;
    const latEl=document.getElementById('cartLatDisplay'); if(latEl) latEl.textContent = d.lat.toFixed(6);
    const lngEl=document.getElementById('cartLngDisplay'); if(lngEl) lngEl.textContent = d.lng.toFixed(6);
    const dt=document.getElementById('destText'); if(dt && d.text) dt.value = d.text;
    try{
      const raw=localStorage.getItem('ojol_cart_v2_food');
      if(raw){
        const s=JSON.parse(raw);
        if(s.pickup && s.pickup.lat && d.lat){
          const km=calcHav(s.pickup.lat, s.pickup.lng, d.lat, d.lng);
          const fee = km<=2 ? 8000 : Math.max(5000, Math.round(km*3000));
          const statusEl=document.getElementById('ongkirLiveStatus');
          if(statusEl) statusEl.textContent = `✅ Jarak ${km.toFixed(2)} km • Ongkir Rp ${fee.toLocaleString()} • Pilih di Peta berhasil`;
          setTimeout(()=>{ location.reload(); }, 600);
        }
      }
    }catch(err){}
  }catch(err){}
});

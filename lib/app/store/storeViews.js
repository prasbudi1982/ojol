
// lib/app/storeViews.js - CLEAN FIX - Valid JS - No syntax error - Flow Driver dulu baru Warung
// Versi Opsi A - Pisah trackingFood.js
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';

export async function viewStoreList(){
  let stores = [];
  try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ stores = []; }
  const cards = stores.length ? stores.map(s => `
    <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>${s.name}</b>
        <span style="font-size:10px;background:${s.is_open ? '#16a34a' : '#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open ? 'BUKA' : 'TUTUP'}</span>
      </div>
      <div class="muted" style="font-size:12px">${s.alamat_text || ''}</div>
      <a href="#/store/detail/${s.id}" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a>
    </div>
  `).join('') : '<div class="muted">Belum ada warung buka.</div>';
  return `
    <div class="card">
      <h2>🍔 Warung Buka</h2>
      <p class="muted">Flow: Checkout cari driver dulu - driver terima - warung baru masak.</p>
      <div class="list">${cards}</div>
    </div>
  `;
}

export async function viewStoreDetail(storeId){
  const { data: store, error } = await supabase.from('stores').select('*').eq('id', storeId).single();
  if(error || !store){
    return '<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>';
  }
  let products = [];
  try{ products = await productStore._actions.fetchByStore(storeId, true); }catch(e){ products = []; }
  try{ cartStore._actions.setStore(store); }catch(e){}
  const prodJson = JSON.stringify(products).replace(/</g, '\\u003c');
  const listHtml = products.length ? products.map(p => {
    const harga = Number(p.harga || 0).toLocaleString('id-ID');
    let vari = [];
    try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || []); }catch(e){}
    if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
    let addons = [];
    try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons || []); }catch(e){}
    const variText = vari.map(v => v.name + ' (+' + Number(v.price_delta||0).toLocaleString('id-ID') + ')').join(', ');
    const addonText = addons.length ? addons.map(a => a.name + ' (+' + Number(a.harga).toLocaleString('id-ID') + ')').join(', ') : 'Tanpa addon';
    return `
      <div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden">
        <div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)">
          <b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${harga} • ${p.kategori || 'Makanan'} • Varian: ${variText}</div>
          <div class="muted" style="font-size:10px">Addon: ${addonText}</div>
        </div>
        <div style="padding:10px">
          <button class="btn primary" style="width:100%" onclick="window._openMenuBuilder('${p.id}')">🍱 Pilih Varian</button>
        </div>
      </div>
    `;
  }).join('') : '<div class="card"><div class="muted">Belum ada menu</div></div>';

  return `
    <div class="card"><a href="#/store" class="muted">← Kembali</a><h2 style="margin-top:8px">🏪 ${store.name}</h2><div class="muted" style="font-size:12px">${store.alamat_text || ''}</div></div>
    <div class="list" style="margin-top:12px">${listHtml}</div>
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
}

export async function viewStoreCart(){
  let state;
  try{ state = cartStore.getState(); }catch(e){ state = { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null }; }
  let totals;
  try{ totals = cartStore._actions.getTotals(); }catch(e){ totals = { subtotal: 0, delivery_fee: 0, total: 0, distance_km: 0, count: 0 }; }
  const itemsHtml = state.items.length ? state.items.map(i => {
    const addons = i.addons || [];
    const addonText = addons.length ? ' + ' + addons.map(a => a.name).join(', +') : '';
    const variantText = i.variant ? ' (' + i.variant + ')' : '';
    const key = i.cartKey || i.product_id || i.id;
    return `
      <div class="driver-card" style="flex-direction:column;gap:8px;border-left:3px solid var(--primary)">
        <div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1"><b>${i.name}${variantText}${addonText}</b><div class="muted" style="font-size:11px">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = Rp ${Number(i.harga * i.qty).toLocaleString()}</div></div><div style="display:flex;gap:6px;align-items:center"><button onclick="window._cartQty('${key}', ${i.qty - 1})" class="btn secondary" style="width:36px">-</button><span style="font-weight:700">${i.qty}</span><button onclick="window._cartQty('${key}', ${i.qty + 1})" class="btn secondary" style="width:36px">+</button></div></div>
        <button onclick="window._removeCartItem('${key}')" class="btn secondary" style="width:100%;font-size:11px;background:#fee2e2;color:#dc2626">🗑️ Hapus</button>
      </div>
    `;
  }).join('') : '<div class="muted">Keranjang kosong.</div>';

  return `
    <div class="card">
      <h2>🛒 Keranjang${state.storeName ? ' - ' + state.storeName : ''}</h2>
      <div class="list">${itemsHtml}</div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div class="muted" style="font-size:12px">Subtotal Rp ${totals.subtotal.toLocaleString()} • Ongkir Rp ${totals.delivery_fee.toLocaleString()} (${totals.distance_km} km)</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ${totals.total.toLocaleString()}</div>
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px">
          <div style="font-size:13px;font-weight:700">📍 Alamat Antar *</div>
          <textarea id="destText" placeholder="Ds Suruh RT..." style="min-height:70px">${state.dest.text || ''}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="btnPickDest" class="btn secondary" style="flex:1">📍 Pilih di Peta</button>
            <button id="btnUseMyLocation" class="btn secondary" style="flex:1">📌 Lokasi Saya</button>
          </div>
          <div class="muted" style="font-size:10px;margin-top:6px">Lat: ${state.dest.lat || '-'} Lng: ${state.dest.lng || '-'} • Warung: ${state.pickup.text || '-'}</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;margin-top:12px;font-size:11px;color:#92400e">
          <b>ℹ️ Flow:</b> Checkout → Cari 5 driver terdekat dari warung (sama kayak Ojol) → Driver & Pemesan sepakat → Driver Terima → Warung baru dapat notif masak.
        </div>
        <button id="btnCheckout" class="btn primary" style="margin-top:12px;padding:14px;font-weight:800" ${state.items.length ? '' : 'disabled'}>✅ Checkout - Cari Driver Terdekat</button>
      </div>
    </div>
    <div id="foodActiveOrderCard" style="display:none;margin-top:12px"></div>
  `;
}

export async function viewMyStore(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile) return '<div class="card"><p class="muted">Harus login</p></div>';
  if(profile.role !== 'merchant' && profile.role !== 'warung'){
    return '<div class="card"><h2>🏪 Warungku</h2><p class="muted">Khusus merchant. Role kamu: ' + profile.role + '</p></div>';
  }
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore){
    return '<div class="card"><h2>🏪 Buat Warung</h2><p class="muted">Belum ada warung</p><label>Nama</label><input id="sName"/><label>Alamat</label><input id="sAlamat"/><label>WA</label><input id="sWa"/><label>Lat</label><input id="sLat"/><label>Lng</label><input id="sLng"/><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnCreateStore" class="btn primary" style="flex:1">Buat Warung</button></div></div>';
  }
  return '<div class="card"><h2>🏪 Warungku: ' + myStore.name + '</h2><div class="muted" style="font-size:12px">' + (myStore.is_open ? 'BUKA' : 'TUTUP') + ' • Driver terima dulu baru masuk sini</div><label>Nama</label><input id="sName" value="' + (myStore.name || '') + '"/><label>Alamat</label><input id="sAlamat" value="' + (myStore.alamat_text || '').replace(/"/g, '&quot;') + '"/><label>WA</label><input id="sWa" value="' + (myStore.wa_number || '') + '"/><label>Lat</label><input id="sLat" type="number" step="any" value="' + (myStore.lat || '') + '"/><label>Lng</label><input id="sLng" type="number" step="any" value="' + (myStore.lng || '') + '"/><label>Status</label><select id="sOpen"><option value="true" ' + (myStore.is_open ? 'selected' : '') + '>Buka</option><option value="false" ' + (!myStore.is_open ? 'selected' : '') + '>Tutup</option></select><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button></div><div style="margin-top:12px"><a href="#/store/products" class="btn primary">📦 Kelola Menu</a></div></div>';
}

export async function viewStoreProducts(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile || (profile.role !== 'merchant' && profile.role !== 'warung')) return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>';
  let prods = [];
  try{ prods = await productStore._actions.fetchMyProducts(myStore.id); }catch(e){}
  const list = prods.map(p => '<div class="driver-card"><div style="flex:1"><b>' + p.name + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga).toLocaleString() + ' • Stok ' + (p.stok || 0) + '</div></div><div style="display:flex;gap:6px"><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._editProd(\'' + p.id + '\')">Edit</button><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white" onclick="window._delProd(\'' + p.id + '\')">Hapus</button></div></div>').join('');
  return '<div class="card"><h2>📦 Menu - ' + myStore.name + '</h2><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><div style="display:flex;gap:8px"><input id="pName" placeholder="Nama menu" style="flex:2"/><input id="pHarga" type="number" placeholder="Harga" style="flex:1"/></div><div style="display:flex;gap:8px;margin-top:8px"><select id="pKategori" style="flex:1"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select><input id="pStok" type="number" value="100" style="width:90px"/><button id="btnAddProduct" class="btn primary" style="width:auto">+ Tambah</button></div><div style="margin-top:8px"><input id="pVariasi" placeholder="Varian: Biasa|0, Jumbo|5000" style="margin-top:4px"/><input id="pAddons" placeholder="Addon: Telur|3000, Kerupuk|1000" style="margin-top:4px"/></div></div><div class="list">' + (list || '<div class="muted">Belum ada menu</div>') + '</div></div>';
}

export async function viewStoreOrders(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile || (profile.role !== 'merchant' && profile.role !== 'warung')) return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>';
  let orders = [];
  try{
    const { data } = await supabase.from('food_orders').select('*').eq('store_id', myStore.id).in('status', ['driver_assigned','accepted','preparing','ready','picked']).order('created_at', { ascending: false }).limit(30);
    orders = data || [];
  }catch(e){ orders = []; }
  const htmlList = orders.length ? orders.map(o => {
    const statusColor = o.status === 'driver_assigned' ? '#22c55e' : '#f59e0b';
    let btn = '';
    if(o.status === 'driver_assigned' || o.status === 'accepted') btn = '<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus(\'' + o.id + '\',\'preparing\')">✅ Terima & Masak (driver sudah sepakat)</button>';
    else if(o.status === 'preparing') btn = '<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus(\'' + o.id + '\',\'ready\')">🍱 Siap Diambil</button>';
    else if(o.status === 'ready') btn = '<span class="muted" style="font-size:11px">Menunggu driver pick</span>';
    const items = (o.items || []).map(it => it.name + ' x' + it.qty).join(', ');
    return '<div class="card" style="margin:0;border-left:3px solid ' + statusColor + '"><div style="display:flex;justify-content:space-between"><b>#' + o.id.slice(0,8) + '</b><span style="font-size:10px;background:' + statusColor + ';color:#111;padding:2px 8px;border-radius:99px">' + o.status.toUpperCase() + '</span></div><div class="muted" style="font-size:11px">' + new Date(o.created_at).toLocaleString('id-ID') + ' • Rp ' + Number(o.total||0).toLocaleString() + '</div><div style="font-size:12px;margin-top:6px">' + items + '</div><div class="muted" style="font-size:11px;margin-top:4px">Antar: ' + (o.dest_text || '-') + '</div><div style="margin-top:10px">' + btn + '</div></div>';
  }).join('') : '<div class="card" style="text-align:center;padding:20px"><div style="font-size:32px">🍳</div><div class="muted" style="margin-top:8px">Belum ada pesanan yang sudah ada driver. Pesanan baru hanya muncul setelah driver terima.</div></div>';
  return '<div class="card"><h2>🔔 Pesanan Masuk - ' + myStore.name + '</h2><p class="muted" style="font-size:11px">Flow: Driver terima dulu baru warung masak. Status searching_driver tidak tampil di warung.</p><div class="list" style="margin-top:10px">' + htmlList + '</div></div>';
}

if(typeof window !== 'undefined'){
  let _builderState = { product: null, variant: null, addons: [], qty: 1, variList: [], addonList: [] };

  window._openMenuBuilder = function(pid){
    try{
      const el = document.getElementById('productsData');
      const prods = el ? JSON.parse(el.textContent) : [];
      const p = prods.find(x => x.id === pid);
      if(!p) return alert('Produk tidak ditemukan');
      let vari = [];
      try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || []); }catch(e){}
      if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
      let addons = [];
      try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons || []); }catch(e){}
      _builderState = { product: p, variant: vari[0], addons: [], qty: 1, variList: vari, addonList: addons };
      document.getElementById('builderName').textContent = p.name;
      document.getElementById('builderBase').textContent = 'Rp ' + Number(p.harga).toLocaleString('id-ID');
      const variContainer = document.getElementById('builderVariasi');
      variContainer.innerHTML = vari.map((v,i) => {
        const total = Number(p.harga) + Number(v.price_delta || 0);
        const checked = i === 0 ? 'checked' : '';
        return '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="radio" name="builderVariant" value="' + v.name + '" ' + checked + '><div><div style="font-size:13px;font-weight:600">' + p.name + ' ' + v.name + '</div><div style="font-size:12px;color:var(--primary);font-weight:700">Rp ' + total.toLocaleString() + '</div></div></div></label>';
      }).join('');
      variContainer.querySelectorAll('input[name="builderVariant"]').forEach(r => { r.onchange = function(){ window._builderPickVariant(this.value); }; });
      const addonContainer = document.getElementById('builderAddon');
      if(!addons.length){
        addonContainer.innerHTML = '<div class="muted" style="font-size:11px">Tidak ada addon</div>';
      } else {
        addonContainer.innerHTML = addons.map(a => '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="checkbox" value="' + a.name + '"><div style="font-size:13px;font-weight:600">' + a.name + ' (+' + Number(a.harga).toLocaleString() + ')</div></div><div style="font-size:12px;font-weight:700">+' + Number(a.harga).toLocaleString() + '</div></label>').join('');
        addonContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.onchange = function(){ window._builderToggleAddon(this.value); }; });
      }
      document.getElementById('builderQty').textContent = '1';
      document.getElementById('builderQtyMinus').onclick = function(){ if(_builderState.qty > 1){ _builderState.qty--; document.getElementById('builderQty').textContent = _builderState.qty; window._updateBuilderTotal(); } };
      document.getElementById('builderQtyPlus').onclick = function(){ _builderState.qty++; document.getElementById('builderQty').textContent = _builderState.qty; window._updateBuilderTotal(); };
      document.getElementById('builderAddBtn').onclick = function(){
        try{
          const prod = _builderState.product;
          const perItem = Number(prod.harga) + Number(_builderState.variant?.price_delta || 0) + _builderState.addons.reduce((s,a) => s + Number(a.harga || 0), 0);
          const cartKey = prod.id + '::' + (_builderState.variant?.name || 'Biasa') + '::' + _builderState.addons.map(a => a.name).sort().join('|');
          const item = { id: cartKey, product_id: prod.id, cartKey: cartKey, name: prod.name, harga: perItem, variant: _builderState.variant?.name || 'Biasa', variant_price_delta: Number(_builderState.variant?.price_delta || 0), addons: _builderState.addons.slice(), qty: _builderState.qty };
          const state = cartStore.getState();
          const existing = state.items.find(it => (it.cartKey || it.product_id || it.id) === cartKey);
          if(existing){ cartStore._actions.updateQty(cartKey, Number(existing.qty || 0) + Number(_builderState.qty || 1)); }
          else { cartStore._actions.addItem(item, Number(_builderState.qty || 1)); }
          const b = document.getElementById('cartBadge');
          if(b){ const c = cartStore.getState().items.reduce((a,b) => a + Number(b.qty || 0), 0); b.textContent = c; b.style.display = c > 0 ? 'block' : 'none'; }
          window._closeMenuBuilder();
          alert('✅ Ditambah: ' + prod.name + ' ' + (_builderState.variant?.name || '') + ' x' + _builderState.qty);
        }catch(e){ alert(e.message); }
      };
      window._updateBuilderTotal();
      document.getElementById('menuBuilderModal').style.display = 'flex';
    }catch(e){ alert(e.message); }
  };
  window._closeMenuBuilder = function(){ const m = document.getElementById('menuBuilderModal'); if(m) m.style.display = 'none'; };
  window._builderPickVariant = function(vName){ const v = _builderState.variList.find(x => x.name === vName); if(v) _builderState.variant = v; window._updateBuilderTotal(); };
  window._builderToggleAddon = function(aName){
    const exists = _builderState.addons.find(x => x.name === aName);
    if(exists){ _builderState.addons = _builderState.addons.filter(x => x.name !== aName); }
    else { const a = _builderState.addonList.find(x => x.name === aName); if(a) _builderState.addons.push({ name: a.name, harga: Number(a.harga) }); }
    window._updateBuilderTotal();
  };
  window._updateBuilderTotal = function(){
    if(!_builderState.product) return;
    const base = Number(_builderState.product.harga);
    const varDelta = Number(_builderState.variant?.price_delta || 0);
    const addonSum = _builderState.addons.reduce((s,a) => s + Number(a.harga || 0), 0);
    const perItem = base + varDelta + addonSum;
    const total = perItem * _builderState.qty;
    const varText = _builderState.variant ? _builderState.variant.name : '';
    const addonText = _builderState.addons.length ? ' + ' + _builderState.addons.map(a => a.name).join(', +') : '';
    document.getElementById('builderSummary').textContent = _builderState.product.name + ' ' + varText + addonText + ' x' + _builderState.qty;
    document.getElementById('builderTotal').textContent = 'Rp ' + total.toLocaleString('id-ID') + ' (' + _builderState.qty + 'x Rp ' + perItem.toLocaleString('id-ID') + ')';
    document.getElementById('builderAddBtn').textContent = '+ Tambah ke Keranjang - Rp ' + total.toLocaleString('id-ID');
  };
  window._cartQty = function(cartKey, qty){
    const q = Number(qty);
    if(q <= 0){ if(confirm('Hapus item ini?')){ cartStore._actions.removeItem(cartKey); location.reload(); } }
    else { cartStore._actions.updateQty(cartKey, q); setTimeout(() => location.reload(), 100); }
  };
  window._removeCartItem = function(cartKey){ if(!confirm('Hapus order ini?')) return; cartStore._actions.removeItem(cartKey); location.reload(); };
  window._orderStatus = async function(id, status){ if(!confirm('Ubah jadi ' + status + '?')) return; try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); } };
  window._toggleProd = async function(id, avail){ try{ const { default: idx } = await import('./store/index.js'); await idx.productStore._actions.updateProduct(id, { is_available: avail }); location.reload(); }catch(e){ alert(e.message); } };
  window._delProd = async function(id){ if(!confirm('Hapus?')) return; try{ const { default: idx } = await import('./store/index.js'); }catch(e){} try{ const mod = await import('./store/index.js'); await mod.productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); } };
  window._editProd = async function(id){
    try{
      const { data } = await supabase.from('store_products').select('*').eq('id', id).single(); if(!data) return;
      let vari = []; try{ vari = typeof data.variants === 'string' ? JSON.parse(data.variants) : (data.variants || []); }catch(e){}
      let addons = []; try{ addons = typeof data.addons === 'string' ? JSON.parse(data.addons) : (data.addons || []); }catch(e){}
      const variStr = vari.map(v => v.name + '|' + v.price_delta).join(', ');
      const addonStr = addons.map(a => a.name + '|' + a.harga).join(', ');
      const newVari = prompt('Edit Varian (format Nama|harga):', variStr); if(newVari === null) return;
      const newAddon = prompt('Edit Addon (Nama|harga):', addonStr); if(newAddon === null) return;
      const parseVari = function(str){ if(!str.trim()) return []; return str.split(',').map(s => s.trim()).filter(Boolean).map(part => { const p = part.split('|').map(x => x.trim()); return { name: p[0], price_delta: parseInt(p[1] || '0') || 0 }; }); };
      const parseAddon = function(str){ if(!str.trim()) return []; return str.split(',').map(s => s.trim()).filter(Boolean).map(part => { const p = part.split('|').map(x => x.trim()); return { name: p[0], harga: parseInt(p[1] || '0') || 0 }; }); };
      const mod = await import('./store/index.js'); await mod.productStore._actions.updateProduct(id, { variants: parseVari(newVari), addons: parseAddon(newAddon) }); location.reload();
    }catch(e){ alert(e.message); }
  };
}

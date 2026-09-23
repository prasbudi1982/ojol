
// lib/app/store/storeViews.js - FULL OPSI A - Driver dulu baru warung + Peta + 5 driver + Batal Selesai
// Hanya import path dalam: ../supabase.js dan ../user.js dan ./index.js
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

function calcHav(lat1,lng1,lat2,lng2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

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
    const prodJson = JSON.stringify(products).replace(/</g, '\\u003c');
    const listHtml = products.map(p => {
      const harga = Number(p.harga || 0).toLocaleString('id-ID');
      let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || []); }catch(e){}
      if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
      let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons || []); }catch(e){}
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

export async function viewStoreCart(){
  let state;
  let rawLocal = null;
  try{ rawLocal = localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ 
    state = cartStore.getState(); 
    // FIX: jika cartStore kosong tapi localStorage ada isi, pakai localStorage (bug order tidak masuk list)
    if((!state.items || !state.items.length) && rawLocal){
      try{
        const parsed = JSON.parse(rawLocal);
        if(parsed.items && parsed.items.length){
          state = parsed;
          // sync ke cartStore biar badge & totals konsisten
          try{ cartStore.setState(parsed); }catch(e){ try{ cartStore._actions.setState && cartStore._actions.setState(parsed); }catch(e2){} }
        }
      }catch(e){}
    }
  }catch(e){
    const raw = localStorage.getItem('ojol_cart_v2_food');
    state = raw ? JSON.parse(raw) : { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  }
  if(!state) state = { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  // fallback dest & pickup dari localStorage jika kosong
  if(rawLocal){
    try{
      const parsed = JSON.parse(rawLocal);
      if(!state.dest || !state.dest.lat){
        if(parsed.dest) state.dest = parsed.dest;
      }
      if(!state.pickup || !state.pickup.lat){
        if(parsed.pickup) state.pickup = parsed.pickup;
      }
      if(!state.storeName && parsed.storeName) state.storeName = parsed.storeName;
      if(!state.storeId && parsed.storeId) state.storeId = parsed.storeId;
      if((!state.items || !state.items.length) && parsed.items && parsed.items.length){
        state.items = parsed.items;
      }
    }catch(e){}
  }
  let totals;
  try{ totals = cartStore._actions.getTotals(); }catch(e){ 
    const subtotal = (state.items||[]).reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0);
    totals = { subtotal: subtotal, delivery_fee: 0, total: subtotal, distance_km: 0, count: (state.items||[]).length };
  }
  const itemsHtml = (state.items||[]).length ? state.items.map(i => {
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
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">Subtotal Makanan</span><b>Rp ${totals.subtotal.toLocaleString()}</b></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Jarak Warung ke Alamat</span><b>${totals.distance_km||'0.00'} km</b></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Ongkir Estimasi</span><b style="color:var(--primary)">Rp ${Number(totals.delivery_fee||0).toLocaleString()}</b></div>
          <div class="muted" style="font-size:10px;margin-top:8px;line-height:1.4">
            &bull; &le;2 km = Rp 8.000 flat &bull; >2 km = Rp 3.000/km, min Rp 5.000<br/>
            &bull; Warung: ${(state.pickup.text||state.storeName||'-').slice(0,40)} (${state.pickup.lat ? Number(state.pickup.lat).toFixed(4) : '-'} , ${state.pickup.lng ? Number(state.pickup.lng).toFixed(4) : '-'})<br/>
            &bull; Tujuan: ${(state.dest.text||'-').slice(0,40)} (${state.dest.lat ? Number(state.dest.lat).toFixed(4) : '-'} , ${state.dest.lng ? Number(state.dest.lng).toFixed(4) : '-'})
          </div>
          <div id="ongkirLiveStatus" class="muted" style="font-size:10px;margin-top:6px;color:#22c55e">${state.dest.lat && state.pickup.lat ? '✅ Jarak dihitung dari koordinat warung & alamat' : '⚠️ Pilih alamat di peta biar ongkir kehitung akurat'}</div>
        </div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ${Number(totals.total||0).toLocaleString()}</div>
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px">
          <div style="font-size:13px;font-weight:700">📍 Alamat Antar *</div>
          <textarea id="destText" placeholder="Ds Suruh RT..." style="min-height:70px">${state.dest.text || ''}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="btnPickDest" class="btn secondary" style="flex:1">📍 Pilih di Peta</button>
            <button id="btnUseMyLocation" class="btn secondary" style="flex:1">📌 Lokasi Saya</button>
          </div>
          <div class="muted" style="font-size:10px;margin-top:6px" id="cartLatLngDisplay">Lat: <span id="cartLatDisplay">${state.dest.lat || '-'}</span> Lng: <span id="cartLngDisplay">${state.dest.lng || '-'}</span> • Warung: ${state.pickup.text || '-'}</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;margin-top:12px;font-size:11px;color:#92400e">
          <b>ℹ️ Flow Driver Dulu:</b> Checkout → Cari 5 driver terdekat dari warung (sama kayak Ojol) → Driver & Pemesan sepakat → Driver Terima → Warung baru dapat notif masak.
        </div>
        <button id="btnCheckout" class="btn primary" style="margin-top:12px;padding:14px;font-weight:800" ${(state.items||[]).length ? '' : 'disabled'}>✅ Checkout - Cari Driver Terdekat</button>
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
  return '<div class="card"><h2>🏪 Warungku: ' + myStore.name + '</h2><div class="muted" style="font-size:11px">' + (myStore.is_open ? 'BUKA' : 'TUTUP') + ' • Driver terima dulu baru masuk sini</div><label>Nama</label><input id="sName" value="' + (myStore.name || '') + '"/><label>Alamat</label><input id="sAlamat" value="' + (myStore.alamat_text || '').replace(/"/g, '&quot;') + '"/><label>WA</label><input id="sWa" value="' + (myStore.wa_number || '') + '"/><label>Lat</label><input id="sLat" type="number" step="any" value="' + (myStore.lat || '') + '"/><label>Lng</label><input id="sLng" type="number" step="any" value="' + (myStore.lng || '') + '"/><label>Status</label><select id="sOpen"><option value="true" ' + (myStore.is_open ? 'selected' : '') + '>Buka</option><option value="false" ' + (!myStore.is_open ? 'selected' : '') + '>Tutup</option></select><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button></div><div style="margin-top:12px"><a href="#/store/products" class="btn primary">📦 Kelola Menu</a></div></div>';
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
  try{ prods = await productStore._actions.fetchMyProducts(myStore.id); }catch(e){ 
    const { data } = await supabase.from('store_products').select('*').eq('store_id', myStore.id).limit(50);
    prods = data||[];
  }
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

// Global handlers untuk Food - tidak ubah app.js, semua di sini
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
          const raw = localStorage.getItem('ojol_cart_v2_food');
          let s = raw ? JSON.parse(raw) : { items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } };
          const existing = s.items.find(it => (it.cartKey || it.product_id || it.id) === cartKey);
          if(existing){ existing.qty = Number(existing.qty||0) + Number(_builderState.qty||1); }
          else { s.items.push(item); }
          localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
          const b = document.getElementById('cartBadge');
          if(b){ const c = s.items.reduce((a,b) => a + Number(b.qty || 0), 0); b.textContent = c; b.style.display = c > 0 ? 'block' : 'none'; }
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
    const raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return;
    let s = JSON.parse(raw);
    if(q <= 0){ if(!confirm('Hapus item ini?')) return; s.items = s.items.filter(it => (it.cartKey||it.product_id||it.id) !== cartKey); }
    else { const it = s.items.find(it => (it.cartKey||it.product_id||it.id) === cartKey); if(it) it.qty = q; }
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
    location.reload();
  };
  window._removeCartItem = function(cartKey){ 
    if(!confirm('Hapus order ini?')) return; 
    const raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return;
    let s = JSON.parse(raw);
    s.items = s.items.filter(it => (it.cartKey||it.product_id||it.id) !== cartKey);
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
    location.reload(); 
  };

  // Peta Food - Pilih di Peta - FIX pakai mapPicker target food_dest
  window._pickDestMap = function(){
    if(window.mapModule && window.mapModule.openMapPicker){
      window.mapModule.openMapPicker('food_dest');
    } else if(window.openMapPicker){
      window.openMapPicker('food_dest');
    } else if(window.openFoodDestMapPicker){
      window.openFoodDestMapPicker();
    } else {
      alert('Map belum siap, reload halaman');
    }
  };
  window._haversine = function(lat1,lng1,lat2,lng2){
    const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  };
  window._useMyLocation = function(){
    if(!navigator.geolocation){ alert('GPS tidak support'); return; }
    navigator.geolocation.getCurrentPosition((pos)=>{
      const lat=pos.coords.latitude, lng=pos.coords.longitude;
      const raw=localStorage.getItem('ojol_cart_v2_food'); 
      if(raw){ let s=JSON.parse(raw); s.dest={lat:lat,lng:lng,text:s.dest.text||''}; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s)); location.reload(); }
    }, (err)=>alert(err.message), { enableHighAccuracy:true, timeout:8000 });
  };
  window._pickWarungMap = function(){
    if(window.mapModule && window.mapModule.openMapPicker){
      window.mapModule.openMapPicker('warung');
    } else if(window.openMapPicker){
      window.openMapPicker('warung');
    } else if(window.openWarungMapPicker){
      window.openWarungMapPicker();
    }
  };

  // Checkout dengan 5 driver terdekat seperti order.js
  window._checkoutFood = async function(){
    try{
      const raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw) return alert('Keranjang kosong');
      let state = JSON.parse(raw);
      if(!state.items || !state.items.length) return alert('Keranjang kosong');
      if(!state.dest.lat || !state.dest.lng){ alert('📍 Pilih lokasi antar di peta dulu!'); return; }
      const destText = document.getElementById('destText')?.value?.trim() || state.dest.text||'';
      if(destText.length<5){ alert('Alamat harus lengkap'); return; }
      state.dest.text = destText;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=true; btn.textContent='⏳ Membuat pesanan...'; }
      
      // Build payload
      let total = 0; try{ total = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      const payload = {
        store_id: state.storeId,
        items: state.items,
        total: total,
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        status: 'searching_driver',
        customer_id: (await supabase.auth.getUser()).data.user.id
      };
      const { data: orderData, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error) throw error;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      
      // Show modal dengan 5 driver terdekat - logic sama kayak order.js searchNearby
      let old=document.getElementById('foodCheckoutDriversModal'); if(old) old.remove();
      const div=document.createElement('div'); div.id='foodCheckoutDriversModal'; 
      div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0';
      div.innerHTML='<div style="background:var(--card);width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:20px 20px 0 0;border-top:2px solid var(--primary)"><div style="padding:16px 16px 8px;position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--border)"><div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:800;font-size:16px">🍔 Pesanan #' + orderData.id.slice(0,6).toUpperCase() + '</div><div style="font-size:12px" class="muted">Rp ' + Number(orderData.total||0).toLocaleString() + ' • ' + (state.storeName||'') + '</div><div style="font-size:11px" class="muted">⏱️ Timer 5 menit auto batal seperti Ojol</div></div><button onclick="document.getElementById(\'foodCheckoutDriversModal\').remove()" style="background:var(--card2);border:1px solid var(--border);padding:8px 12px;border-radius:10px">✕</button></div></div><div style="padding:16px"><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><div style="font-size:12px;font-weight:700">📍 Tracking Aktif</div><div style="font-size:11px" class="muted">Status: <b id="foodCheckoutStatus">Mencari driver terdekat dari warung...</b></div><div style="font-size:11px" class="muted">ID: ' + orderData.id.slice(0,8) + '</div><div style="margin-top:10px;display:flex;gap:8px"><button onclick="window._openFoodTracking(\'' + orderData.id + '\')" style="flex:1;background:var(--primary);color:white;border:none;padding:10px;border-radius:10px;font-weight:700">📍 Detail Tracking</button><button onclick="window._cancelFoodOrder(\'' + orderData.id + '\')" style="flex:1;background:var(--card);border:1px solid #ef4444;color:#ef4444;padding:10px;border-radius:10px;font-weight:700">❌ Batalkan Pesanan</button></div><button id="btnFoodCheckoutComplete" style="width:100%;margin-top:8px;background:#0ea5e9;color:white;border:none;padding:10px;border-radius:10px;font-weight:700;display:none" onclick="window._completeFoodOrder(\'' + orderData.id + '\')">✅ Selesai - Pesanan Diterima</button></div><div style="font-size:13px;font-weight:800;margin-bottom:8px">🏍️ 5 Driver Terdekat dari Warung (opsi cepat seperti order.js)</div><div id="foodNearbyDriversList"><div style="padding:20px;text-align:center" class="muted">🔍 Mencari driver terdekat dari warung...</div></div></div></div>';
      document.body.appendChild(div);
      
      // Load 5 driver terdekat
      try{
        const pickupLat=state.pickup.lat, pickupLng=state.pickup.lng;
        const tenMinAgo=new Date(Date.now()-10*60*1000).toISOString();
        const { data: locs } = await supabase.from('driver_locations').select('*').gte('updated_at', tenMinAgo).limit(50);
        const listEl=document.getElementById('foodNearbyDriversList'); const statusEl=document.getElementById('foodCheckoutStatus');
        if(!locs || !locs.length){ if(listEl) listEl.innerHTML='<div class="muted" style="padding:12px;text-align:center">Tidak ada driver online. Menunggu driver lihat di dashboard driver.<br/>Timer 5 menit auto batal seperti Ojol.</div>'; if(statusEl) statusEl.textContent='Menunggu driver online...'; }
        else{
          const driverIds=locs.map(l=>l.driver_id).filter(Boolean);
          const { data: users } = await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol').in('id', driverIds);
          const drivers=locs.map(loc=>{
            const u=users?users.find(x=>x.id===loc.driver_id):null; if(!u) return null; if((u.role||'').toLowerCase()!=='driver') return null;
            let dLat=null,dLng=null; if(loc.lat&&loc.lng){ dLat=loc.lat; dLng=loc.lng; } else if(loc.lokasi){ try{ const m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} } if(!dLat) return null;
            const R=6371; const dLatR=(pickupLat-dLat)*Math.PI/180; const dLngR=(pickupLng-dLng)*Math.PI/180; const a=Math.sin(dLatR/2)**2 + Math.cos(dLat*Math.PI/180)*Math.cos(pickupLat*Math.PI/180)*Math.sin(dLngR/2)**2; const dist=2*R*Math.asin(Math.sqrt(a));
            return { ...u, driver_id:u.id, distance_km:dist };
          }).filter(Boolean).sort((a,b)=>a.distance_km-b.distance_km).slice(0,5);
          if(statusEl) statusEl.textContent='Ditemukan '+drivers.length+' driver terdekat';
          if(listEl) listEl.innerHTML=drivers.map(d=>{
            const vehIcon=(d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
            return '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px;margin-bottom:8px;display:flex;gap:10px"><div style="flex:1"><div style="font-weight:800;font-size:13px">' + d.name + ' ' + vehIcon + ' <span style="background:#22c55e;color:#052e16;padding:2px 6px;border-radius:6px;font-size:10px">' + d.distance_km.toFixed(2) + ' km dari warung</span></div><div style="font-size:11px" class="muted">' + (d.nopol||'') + '</div></div><div style="display:flex;flex-direction:column;gap:6px"><button onclick="window._selectFoodDriver(\'' + d.driver_id + '\',\'' + orderData.id + '\')" style="background:#22c55e;color:#052e16;border:none;padding:10px 12px;border-radius:10px;font-weight:800;font-size:12px">✅ Pilih Cepat</button></div></div>';
          }).join('') || '<div class="muted">Tidak ada driver terdekat</div>';
        }
      }catch(err){ console.error(err); const listEl=document.getElementById('foodNearbyDriversList'); if(listEl) listEl.innerHTML='Error: '+err.message; }
      
      if(btn){ btn.disabled=false; btn.textContent='✅ Checkout - Cari Driver Terdekat'; }
      // Start tracking timer 5 menit seperti Ojol
      if(window.trackingFood && window.trackingFood.startFoodTracking){ window.trackingFood.startFoodTracking(orderData.id); }
    }catch(e){ alert('Checkout gagal: '+e.message); const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='✅ Checkout'; } }
  };
  
  window._selectFoodDriver = async function(driverId, orderId){
    if(!confirm('Pilih driver ini?')) return;
    try{ await supabase.from('food_orders').update({ driver_id: driverId, status:'driver_assigned' }).eq('id', orderId); alert('✅ Driver dipilih!'); if(window.trackingFood){ window.trackingFood.startFoodTracking(orderId); window.trackingFood.openFoodTrackingDetailModal(orderId); } }catch(e){ alert(e.message); }
  };
  window._openFoodTracking = function(orderId){ if(window.trackingFood) window.trackingFood.openFoodTrackingDetailModal(orderId); else alert('Tracking tidak siap'); };
  window._cancelFoodOrder = async function(orderId){ if(!confirm('Batalkan pesanan?')) return; try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id',orderId); }catch(e){} if(window.trackingFood) window.trackingFood.clearFoodTracking(); const m=document.getElementById('foodCheckoutDriversModal'); if(m) m.remove(); alert('❌ Dibatalkan'); location.hash='#/store'; };
  window._completeFoodOrder = async function(orderId){ if(!confirm('Selesaikan?')) return; try{ await supabase.from('food_orders').update({status:'completed'}).eq('id',orderId); }catch(e){} if(window.trackingFood) window.trackingFood.clearFoodTracking(); const m=document.getElementById('foodCheckoutDriversModal'); if(m) m.remove(); alert('✅ Selesai'); };


  window.addEventListener('food_dest_updated', (e)=>{
    try{
      const d = e.detail;
      const latEl=document.getElementById('cartLatDisplay'); if(latEl) latEl.textContent = d.lat.toFixed(6);
      const lngEl=document.getElementById('cartLngDisplay'); if(lngEl) lngEl.textContent = d.lng.toFixed(6);
      const dt=document.getElementById('destText'); if(dt && d.text) dt.value = d.text;
      // Recalc ongkir estimasi langsung tanpa reload
      try{
        const raw=localStorage.getItem('ojol_cart_v2_food');
        if(raw){
          const s=JSON.parse(raw);
          if(s.pickup && s.pickup.lat && d.lat){
            const R=6371; const dLat=(d.lat - s.pickup.lat)*Math.PI/180; const dLng=(d.lng - s.pickup.lng)*Math.PI/180;
            const a=Math.sin(dLat/2)**2 + Math.cos(s.pickup.lat*Math.PI/180)*Math.cos(d.lat*Math.PI/180)*Math.sin(dLng/2)**2;
            const km=2*R*Math.asin(Math.sqrt(a));
            const kmFixed=km.toFixed(2);
            const fee = km<=2 ? 8000 : Math.max(5000, Math.round(km*3000));
            const subtotal = (s.items||[]).reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0);
            const total = subtotal + fee;
            // Update DOM ongkir
            const ongkirEls = document.querySelectorAll('b');
            // Find elements containing Rp and update via id if exists, else reload
            const statusEl=document.getElementById('ongkirLiveStatus');
            if(statusEl) statusEl.textContent = `✅ Jarak ${kmFixed} km • Ongkir Rp ${fee.toLocaleString()} • Pilih di Peta berhasil`;
            // Simple reload to refresh totals display
            setTimeout(()=>{ location.reload(); }, 600);
          }
        }
      }catch(err){}
    }catch(err){}
  });

  // Hook tombol di cart
  document.addEventListener('click', (e)=>{
    if(e.target.closest('#btnPickDest')){ e.preventDefault(); window._pickDestMap(); }
    if(e.target.closest('#btnUseMyLocation')){ e.preventDefault(); window._useMyLocation(); }
    if(e.target.closest('#btnPickWarungLoc')){ e.preventDefault(); window._pickWarungMap(); }
    if(e.target.closest('#btnCheckout')){ e.preventDefault(); window._checkoutFood(); }
  });
}

  window._orderStatus = async function(id, status){ if(!confirm('Ubah jadi ' + status + '?')) return; try{ const { error } = await supabase.from('food_orders').update({ status: status }).eq('id', id); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };

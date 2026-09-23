
// lib/app/store/storeViews.js - V9 - Flow: Driver terima dulu baru Warung dapat notif
// Customer checkout -> food_orders status=searching_driver (driver cari)
// Driver terima -> status=driver_assigned / accepted -> Warung baru dapat notif untuk masak
// Warung: preparing -> ready -> picked -> completed
import { warungStore, productStore, cartStore, foodOrderStore, ratingStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { haversineKm } from '../geofence.js';

export async function viewStoreList(){
  let stores = [];
  try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ stores = []; }
  return `
    <div class="card">
      <h2>🍔 Warung Buka</h2>
      <p class="muted">Flow baru: Checkout cari driver dulu → driver terima → warung baru masak.</p>
      <div class="list">
        ${stores.length ? stores.map(s=>`
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>${s.name}</b>
              <span style="font-size:10px;background:${s.is_open?'#16a34a':'#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open?'BUKA':'TUTUP'}</span>
            </div>
            <div class="muted" style="font-size:12px">${s.alamat_text||''}</div>
            <a href="#/store/detail/${s.id}" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a>
          </div>
        `).join('') : `<div class="muted">Belum ada warung buka.</div>`}
      </div>
    </div>
  `;
}

export async function viewStoreDetail(storeId){
  const { data: store, error } = await supabase.from('stores').select('*').eq('id', storeId).single();
  if(error || !store) return `<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>`;
  let products = [];
  try{ products = await productStore._actions.fetchByStore(storeId, true); }catch(e){}
  try{ cartStore._actions.setStore(store); }catch(e){}
  const productsJson = JSON.stringify(products).replace(/</g,'\\u003c');
  return `
    <div class="card">
      <a href="#/store" class="muted">← Kembali ke Food</a>
      <h2 style="margin-top:8px">🏪 ${store.name}</h2>
      <div class="muted" style="font-size:12px">${store.alamat_text||''}</div>
    </div>
    <div class="list" style="margin-top:12px">
      ${products.length ? products.map(p=>{
        let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){ vari=[]; }
        if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
        let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){ addons=[]; }
        const base = Number(p.harga);
        const variPreview = vari.map(v=> v.name + (Number(v.price_delta||0)!==0 ? ' (+'+Number(v.price_delta).toLocaleString('id-ID')+')' : ' (+0)')).join(', ');
        const addonPreview = addons.map(a=> a.name + ' (+'+Number(a.harga).toLocaleString('id-ID')+')').join(', ');
        return `
        <div class="card" style="margin:0;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:16px">
          <div style="padding:12px 14px;background:var(--card2);border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;gap:10px">
              <div style="flex:1">
                <div style="font-size:16px;font-weight:800">${p.name}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">Rp ${base.toLocaleString('id-ID')} • ${p.kategori||'Makanan'}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:16px;font-weight:800;color:var(--primary)">Rp ${base.toLocaleString('id-ID')}</div>
              </div>
            </div>
          </div>
          <div style="padding:12px 14px">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px">📦 Variasi: <span class="muted" style="font-weight:400">${variPreview}</span></div>
            ${addons.length ? '<div style="font-size:12px;font-weight:700;margin-bottom:8px">➕ Addon: <span class="muted" style="font-weight:400">'+addonPreview+'</span></div>' : '<div class="muted" style="font-size:11px;margin-bottom:8px">Tanpa addon</div>'}
            <button class="btn primary" style="width:100%;padding:12px;font-weight:800" onclick="window._openMenuBuilder('${p.id}')">🍱 Pilih Varian & Addon</button>
          </div>
        </div>
        `;
      }).join('') : `<div class="card"><div class="muted">Belum ada menu</div></div>`}
    </div>
    <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center">
      <div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0">
        <div style="padding:16px 16px 8px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card)">
          <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div id="builderName" style="font-size:18px;font-weight:800">Nama Menu</div>
              <div id="builderBase" class="muted" style="font-size:12px">Rp 0</div>
            </div>
            <button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:auto;padding:8px 12px">✕</button>
          </div>
        </div>
        <div style="padding:16px">
          <div style="font-size:14px;font-weight:800;margin-bottom:10px">📦 Pilih Variasi</div>
          <div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
          <div id="builderAddonHeader" style="font-size:14px;font-weight:800;margin-bottom:10px">➕ Pilih Addon (boleh banyak)</div>
          <div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="muted" style="font-size:12px">Qty</span>
              <div style="display:flex;align-items:center;gap:10px">
                <button id="builderQtyMinus" class="btn secondary" style="width:40px;height:40px">-</button>
                <span id="builderQty" style="font-size:18px;font-weight:800;min-width:24px;text-align:center">1</span>
                <button id="builderQtyPlus" class="btn secondary" style="width:40px;height:40px">+</button>
              </div>
            </div>
            <div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:10px">
              <div class="muted" style="font-size:12px" id="builderSummary">-</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;color:var(--primary)" id="builderTotal">Rp 0</div>
            </div>
          </div>
          <button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-size:15px;font-weight:800">+ Tambah ke Keranjang (1 order)</button>
        </div>
      </div>
    </div>
    <script type="application/json" id="productsData">${productsJson}</script>
  `;
}

export async function viewStoreCart(){
  const state = (()=>{ try{ return cartStore.getState(); }catch(e){ return { items:[], storeName:'', dest:{text:'', lat:null, lng:null}, pickup:{}, storeId:null }; } })();
  const totals = (()=>{ try{ return cartStore._actions.getTotals(); }catch(e){ return { subtotal:0, delivery_fee:0, total:0, distance_km:0, count:0 }; } })();
  return `
    <div class="card">
      <h2>🛒 Keranjang${state.storeName ? ' - '+state.storeName : ''}</h2>
      <div class="list">
        ${state.items.length ? state.items.map(i=>{
          const addons = i.addons||[];
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px;border-left:3px solid var(--primary)">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1">
                <b>${i.name}</b>
                ${i.variant ? '<div style="font-size:11px;margin-top:2px">📦 '+i.variant+' '+(i.variant_price_delta?'(+'+Number(i.variant_price_delta).toLocaleString()+')':'')+'</div>' : ''}
                ${addons.length ? '<div style="font-size:11px;margin-top:2px">➕ '+addons.map(a=>a.name+' (+'+Number(a.harga).toLocaleString()+')').join(', ')+'</div>' : ''}
                <div class="muted" style="font-size:11px;margin-top:4px">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = <b>Rp ${Number(i.harga*i.qty).toLocaleString()}</b></div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <button onclick="window._cartQty('${i.cartKey||i.product_id||i.id}', ${i.qty-1})" class="btn secondary" style="width:36px;padding:8px">-</button>
                <div style="font-weight:700;min-width:20px;text-align:center">${i.qty}</div>
                <button onclick="window._cartQty('${i.cartKey||i.product_id||i.id}', ${i.qty+1})" class="btn secondary" style="width:36px;padding:8px">+</button>
              </div>
            </div>
            <button onclick="window._removeCartItem('${i.cartKey||i.product_id||i.id}')" class="btn secondary" style="width:100%;padding:8px;font-size:11px;background:#fee2e2;color:#dc2626">🗑️ Hapus</button>
          </div>
        `}).join('') : `<div class="muted">Keranjang kosong.</div>`}
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px" class="muted">Subtotal Rp ${totals.subtotal.toLocaleString()} • Ongkir Rp ${totals.delivery_fee.toLocaleString()} (${totals.distance_km} km)</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ${totals.total.toLocaleString()}</div>
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px">
          <div style="font-size:13px;font-weight:700">📍 Alamat Antar *</div>
          <textarea id="destText" placeholder="Ds Suruh RT..." style="min-height:70px">${state.dest.text||''}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="btnPickDest" class="btn secondary" style="flex:1">📍 Pilih di Peta</button>
            <button id="btnUseMyLocation" class="btn secondary" style="flex:1">📌 Lokasi Saya</button>
          </div>
          <div class="muted" style="font-size:10px;margin-top:6px">Lat: ${state.dest.lat||'-'} Lng: ${state.dest.lng||'-'} • Pickup Warung: ${state.pickup.text||'-'}</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;margin-top:12px;font-size:11px;color:#92400e">
          <b>ℹ️ Flow Baru:</b> Checkout → Cari driver terdekat dari warung (sama kayak Ojol) → Driver & Pemesan sepakat → Driver klik Terima → <b>Baru Warung dapat notif untuk masak</b>. Warung tidak dapat order kalau belum ada driver.
        </div>
        <button id="btnCheckout" class="btn primary" style="margin-top:12px;padding:14px;font-size:15px;font-weight:800" ${state.items.length?'':'disabled'}>✅ Checkout - Cari Driver Terdekat</button>
      </div>
    </div>

    <div id="foodDriverModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);padding:16px;overflow:auto">
      <div style="background:var(--card);border-radius:18px;max-width:480px;margin:0 auto;overflow:hidden;border:2px solid var(--primary)">
        <div style="background:var(--primary);color:white;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:800;font-size:14px">🍔 Pesanan Dibuat</div>
            <div style="font-size:11px;opacity:0.9" id="foodOrderId">ID # -</div>
          </div>
          <button onclick="document.getElementById('foodDriverModal').style.display='none'" class="btn secondary" style="width:auto;padding:6px 10px;background:rgba(255,255,255,0.2);border:none;color:white">✕</button>
        </div>
        <div style="padding:14px">
          <div id="foodDriverSearchInfo" style="font-size:12px;color:var(--muted);margin-bottom:10px">Mencari driver terdekat dari warung...</div>
          <div id="foodDriverList"></div>
          <div id="foodTrackingCard" style="display:none;margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--card2)">
            <div style="font-weight:700;font-size:13px">📍 Tracking Pesanan</div>
            <div id="foodTrackingStatus" style="font-size:12px;margin-top:6px">Menunggu driver terima...</div>
            <div id="foodTrackingDistance" style="font-size:11px;color:var(--muted);margin-top:4px">-</div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button id="btnCancelFoodOrder" class="btn secondary" style="flex:1;background:#fee2e2;color:#dc2626">❌ Batalkan</button>
              <a id="btnWaFoodDriver" href="#" target="_blank" class="btn secondary" style="flex:1;text-align:center;text-decoration:none;display:none">💬 WA Driver</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function viewMyStore(){
  let profile=null; try{ profile=await getProfile(); }catch(e){}
  if(!profile) return '<div class="card"><p class="muted">Harus login</p></div>';
  if(profile.role!=='merchant' && profile.role!=='warung') return '<div class="card"><h2>🏪 Warungku</h2><p class="muted">Khusus merchant</p></div>';
  let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} }
  if(!myStore){ return '<div class="card"><h2>🏪 Buat Warung</h2><p class="muted">Belum ada warung</p><label>Nama</label><input id="sName"/><label>Alamat</label><input id="sAlamat"/><label>WA</label><input id="sWa"/><label>Lat</label><input id="sLat"/><label>Lng</label><input id="sLng"/><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnCreateStore" class="btn primary" style="flex:1">Buat Warung</button></div></div>'; }
  return '<div class="card"><h2>🏪 Warungku: '+myStore.name+'</h2><div class="muted" style="font-size:12px">'+(myStore.is_open?'BUKA':'TUTUP')+' • Flow: Driver terima dulu baru masuk ke sini</div><label>Nama</label><input id="sName" value="'+(myStore.name||'')+'"/><label>Alamat</label><input id="sAlamat" value="'+(myStore.alamat_text||'').replace(/"/g,'&quot;')+'"/><label>WA</label><input id="sWa" value="'+(myStore.wa_number||'')+'"/><label>Lat</label><input id="sLat" type="number" step="any" value="'+(myStore.lat||'')+'"/><label>Lng</label><input id="sLng" type="number" step="any" value="'+(myStore.lng||'')+'"/><label>Status</label><select id="sOpen"><option value="true" '+(myStore.is_open?'selected':'')+'>Buka</option><option value="false" '+(!myStore.is_open?'selected':'')+'>Tutup</option></select><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button></div><div style="margin-top:12px"><a href="#/store/products" class="btn primary">📦 Kelola Menu</a></div></div>';
}

export async function viewStoreProducts(){
  let profile=null; try{ profile=await getProfile(); }catch(e){}
  if(profile?.role!=='merchant' && profile?.role!=='warung') return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} }
  if(!myStore) return '<div class="card"><h2>📦 Menu</h2><p class="muted">Buat warung dulu</p></div>';
  let prods=[]; try{ prods=await productStore._actions.fetchMyProducts(myStore.id); }catch(e){}
  return '<div class="card"><h2>📦 Kelola Menu</h2><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px"><label>Nama *</label><input id="pName" placeholder="Nasi Goreng"/><div style="display:flex;gap:8px"><div style="flex:1"><label>Harga *</label><input id="pHarga" type="number" placeholder="10000"/></div><div style="flex:1"><label>Kategori</label><select id="pKategori"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select></div><div style="width:90px"><label>Stok</label><input id="pStok" type="number" value="100"/></div></div><label>Varian - Nama|Tambahan</label><input id="pVariasi" placeholder="Biasa|0, Jumbo|5000"/><label>Addon - Nama|Harga</label><input id="pAddons" placeholder="Telur ceplok|3000"/><button id="btnAddProduct" class="btn primary" style="width:100%;margin-top:8px">+ Tambah Menu</button></div><div class="list">'+prods.map(p=>'<div class="driver-card" style="flex-direction:column"><div><b>'+p.name+'</b><div class="muted" style="font-size:11px">Rp '+Number(p.harga).toLocaleString()+'</div></div><div style="display:flex;gap:6px"><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._editProd(\''+p.id+'\')">Edit</button><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white" onclick="window._delProd(\''+p.id+'\')">Hapus</button></div></div>').join('')+'</div></div>';
}

// V9: Warung hanya lihat order yang sudah ada driver (driver_assigned, preparing, ready, picked)
export async function viewStoreOrders(){
  let profile=null; try{ profile=await getProfile(); }catch(e){}
  if(profile?.role!=='merchant' && profile?.role!=='warung') return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} }
  if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>';
  let orders=[]; 
  try{ 
    // Flow baru: hanya tampilkan order yang sudah ada driver (driver_assigned, preparing, ready, picked) - tidak tampilkan searching_driver
    const { data, error } = await supabase.from('food_orders').select('*').eq('store_id', myStore.id).in('status', ['driver_assigned','accepted','preparing','ready','picked']).order('created_at', {ascending:false}).limit(30);
    if(!error) orders = data||[];
    else orders = await foodOrderStore._actions.fetchIncomingOrders(myStore.id);
    // Filter manual kalau masih ada searching_driver
    orders = orders.filter(o=> o.status!=='searching_driver');
  }catch(e){ try{ orders=await foodOrderStore._actions.fetchIncomingOrders(myStore.id); orders=orders.filter(o=>o.status!=='searching_driver'); }catch(e2){} }
  return `
    <div class="card">
      <h2>🔔 Pesanan Masuk - ${myStore.name}</h2>
      <p class="muted" style="font-size:11px">Flow baru: Driver terima order dulu → baru warung dapat notif di sini untuk masak. Status searching_driver tidak muncul di warung.</p>
      <p class="muted" style="font-size:11px;margin-top:4px">🔔 <b>driver_assigned</b> = driver sudah sepakat dengan pemesan → warung mulai masak → <b>preparing</b> → <b>ready</b> → <b>picked</b> → <b>completed</b></p>
      <div class="list" style="margin-top:10px">
        ${orders.length ? orders.map(o=>{
          const driverInfo = o.driver_id ? 'Driver: '+o.driver_id.slice(0,6) : 'Driver: -';
          return '<div class="card" style="margin:0;border:1px solid var(--border);border-left:3px solid '+(o.status==='driver_assigned' ? '#22c55e' : o.status==='preparing' ? '#f59e0b' : '#16a34a')+'"><div style="display:flex;justify-content:space-between"><b>#'+o.id.slice(0,8)+'</b><span style="font-size:10px;background:'+(o.status==='driver_assigned' ? '#22c55e' : '#f59e0b')+';color:#111;padding:2px 8px;border-radius:99px">'+o.status.toUpperCase()+'</span></div><div class="muted" style="font-size:11px">'+new Date(o.created_at).toLocaleString('id-ID')+' • Rp '+Number(o.total||0).toLocaleString()+' • '+driverInfo+'</div><div style="font-size:12px;margin-top:6px">'+(o.items||[]).map(i=>{ let v=i.variant?' ('+i.variant+')':''; let a=i.addons&&i.addons.length?' +'+i.addons.map(x=>x.name).join(', +'):''; return i.name+v+a+' x'+i.qty }).join(', ')+'</div><div class="muted" style="font-size:11px;margin-top:4px">Antar ke: '+(o.dest_text||'-')+'</div><div style="display:flex;gap:6px;margin-top:10px">'+(o.status==='driver_assigned' || o.status==='accepted' ? '<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus(\''+o.id+'\',\'preparing\')">✅ Terima & Mulai Masak (driver sudah sepakat)</button>' : '')+(o.status==='preparing' ? '<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus(\''+o.id+'\',\'ready\')">🍱 Siap Diambil Driver</button>' : '')+(o.status==='ready' ? '<span class="muted" style="font-size:11px">Menunggu driver pick</span>' : '')+'</div></div>';
        }).join('') : '<div class="card" style="text-align:center;padding:20px"><div style="font-size:32px">🍳</div><div class="muted" style="margin-top:8px">Belum ada pesanan yang sudah ada driver.<br/>Pesanan baru hanya muncul setelah driver terima order dari pemesan.</div><div class="muted" style="font-size:10px;margin-top:6px">Flow: Pemesan checkout → driver terdekat menerima → warung dapat notif di sini</div></div>'}
      </div>
    </div>
  `;
}

if(typeof window !== 'undefined'){
  let _builderState = { product: null, variant: null, addons: [], qty: 1, variList: [], addonList: [] };
  let _foodTrackingChannel = null;
  let _foodPollInterval = null;

  function _calcHaversine(lat1,lng1,lat2,lng2){
    const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  window._openMenuBuilder = function(pid){
    try{
      const el = document.getElementById('productsData');
      const prods = el ? JSON.parse(el.textContent) : (productStore.getState().products||[]);
      const p = prods.find(function(x){ return x.id===pid; });
      if(!p) return alert('Produk tidak ditemukan');
      let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
      if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
      let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){}
      _builderState = { product: p, variant: vari[0], addons: [], qty: 1, variList: vari, addonList: addons };
      document.getElementById('builderName').textContent = p.name;
      document.getElementById('builderBase').textContent = 'Harga dasar Rp ' + Number(p.harga).toLocaleString('id-ID');
      const variContainer = document.getElementById('builderVariasi');
      variContainer.innerHTML = vari.map(function(v,i){
        const total = Number(p.harga) + Number(v.price_delta||0);
        const checked = i===0 ? 'checked' : '';
        return '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="radio" name="builderVariant" value="'+v.name+'" '+checked+'><div><div style="font-size:13px;font-weight:600">'+p.name+' '+v.name.toLowerCase()+' <span class="muted" style="font-size:11px">('+(Number(v.price_delta||0)===0 ? '+0' : '+'+Number(v.price_delta).toLocaleString())+')</span></div><div style="font-size:12px;color:var(--primary);font-weight:700">Rp '+total.toLocaleString()+'</div></div></div></label>';
      }).join('');
      variContainer.querySelectorAll('input[name="builderVariant"]').forEach(function(r){ r.onchange = function(){ window._builderPickVariant(this.value); }; });
      const addonContainer = document.getElementById('builderAddon');
      const addonHeader = document.getElementById('builderAddonHeader');
      if(!addons.length){ addonHeader.style.display='none'; addonContainer.innerHTML='<div class="muted" style="font-size:11px">Tidak ada addon</div>'; }
      else {
        addonHeader.style.display='block';
        addonContainer.innerHTML = addons.map(function(a){ return '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="checkbox" value="'+a.name+'"><div><div style="font-size:13px;font-weight:600">'+a.name+' <span class="muted" style="font-size:11px">(+'+Number(a.harga).toLocaleString()+')</span></div></div></div><div style="font-size:12px;font-weight:700;color:var(--primary)">+'+Number(a.harga).toLocaleString()+'</div></label>'; }).join('');
        addonContainer.querySelectorAll('input[type="checkbox"]').forEach(function(cb){ cb.onchange = function(){ window._builderToggleAddon(this.value); }; });
      }
      document.getElementById('builderQty').textContent='1';
      document.getElementById('builderQtyMinus').onclick=function(){ if(_builderState.qty>1){ _builderState.qty--; document.getElementById('builderQty').textContent=_builderState.qty; window._updateBuilderTotal(); } };
      document.getElementById('builderQtyPlus').onclick=function(){ _builderState.qty++; document.getElementById('builderQty').textContent=_builderState.qty; window._updateBuilderTotal(); };
      document.getElementById('builderAddBtn').onclick=function(){
        try{
          const p = _builderState.product;
          const perItem = Number(p.harga) + Number(_builderState.variant?.price_delta||0) + _builderState.addons.reduce(function(s,a){ return s+Number(a.harga||0); },0);
          const cartKey = p.id + '::' + (_builderState.variant?.name||'Biasa') + '::' + _builderState.addons.map(function(a){ return a.name; }).sort().join('|');
          const item = { id: cartKey, product_id: p.id, cartKey: cartKey, name: p.name, harga: perItem, variant: _builderState.variant?.name||'Biasa', variant_price_delta: Number(_builderState.variant?.price_delta||0), addons: _builderState.addons.slice(), qty: _builderState.qty };
          const state = cartStore.getState();
          const existing = state.items.find(function(it){ return (it.cartKey||it.product_id||it.id) === cartKey; });
          if(existing){ cartStore._actions.updateQty(cartKey, Number(existing.qty||0) + Number(_builderState.qty||1)); }
          else { cartStore._actions.addItem(item, Number(_builderState.qty||1)); }
          const b=document.getElementById('cartBadge'); if(b){ const c=cartStore.getState().items.reduce(function(a,b){ return a+Number(b.qty||0); },0); b.textContent=c; b.style.display=c>0?'block':'none'; }
          window._closeMenuBuilder();
          alert('✅ 1 order ditambah: '+p.name+' '+( _builderState.variant?.name||'')+' x'+_builderState.qty);
        }catch(e){ alert(e.message); }
      };
      window._updateBuilderTotal();
      document.getElementById('menuBuilderModal').style.display='flex';
    }catch(e){ alert(e.message); }
  };
  window._closeMenuBuilder=function(){ const m=document.getElementById('menuBuilderModal'); if(m) m.style.display='none'; };
  window._builderPickVariant=function(vName){ const v=_builderState.variList.find(function(x){ return x.name===vName; }); if(v) _builderState.variant=v; window._updateBuilderTotal(); };
  window._builderToggleAddon=function(aName){
    const exists=_builderState.addons.find(function(x){ return x.name===aName; });
    if(exists){ _builderState.addons=_builderState.addons.filter(function(x){ return x.name!==aName; }); }
    else { const a=_builderState.addonList.find(function(x){ return x.name===aName; }); if(a) _builderState.addons.push({ name:a.name, harga:Number(a.harga) }); }
    window._updateBuilderTotal();
  };
  window._updateBuilderTotal=function(){
    if(!_builderState.product) return;
    const base=Number(_builderState.product.harga); const varDelta=Number(_builderState.variant?.price_delta||0);
    const addonSum=_builderState.addons.reduce(function(s,a){ return s+Number(a.harga||0); },0);
    const perItem=base+varDelta+addonSum; const total=perItem*_builderState.qty;
    const varText=_builderState.variant? _builderState.variant.name : ''; const addonText=_builderState.addons.length ? ' + '+_builderState.addons.map(function(a){ return a.name; }).join(', +') : '';
    document.getElementById('builderSummary').textContent=_builderState.product.name+' '+varText+addonText+' x'+_builderState.qty;
    document.getElementById('builderTotal').textContent='Rp '+total.toLocaleString('id-ID')+' ('+_builderState.qty+'x Rp '+perItem.toLocaleString('id-ID')+')';
    document.getElementById('builderAddBtn').textContent='+ Tambah ke Keranjang - Rp '+total.toLocaleString('id-ID')+' (1 order)';
  };
  window._cartQty=function(cartKey, qty){
    const q=Number(qty); if(q<=0){ if(confirm('Hapus item ini?')){ cartStore._actions.removeItem(cartKey); location.reload(); } }
    else { cartStore._actions.updateQty(cartKey, q); setTimeout(function(){ location.reload(); },100); }
  };
  window._removeCartItem=function(cartKey){ if(!confirm('Hapus order ini?')) return; cartStore._actions.removeItem(cartKey); location.reload(); };
  window._clearCart=function(){ if(!confirm('Kosongkan keranjang?')) return; cartStore._actions.clear(); location.reload(); };

  // ===== CHECKOUT FOOD - Flow Driver Dulu Baru Warung =====
  window._checkoutFood = async function(){
    try{
      const profile = await getProfile();
      if(!profile){ alert('Harus login'); return; }
      const state = cartStore.getState();
      if(!state.items.length){ alert('Keranjang kosong'); return; }
      if(!state.dest.lat || !state.dest.lng){
        alert('📍 Pilih lokasi antar di peta dulu!'); return;
      }
      const btn = document.getElementById('btnCheckout');
      if(btn){ btn.disabled=true; btn.textContent='⏳ Membuat pesanan...'; }
      const payload = cartStore._actions.buildFoodOrderPayload(profile.id);
      // Pastikan status awal searching_driver (driver belum ada)
      payload.status = 'searching_driver';
      console.log('Checkout payload', payload);
      const { data: order, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error) throw error;
      cartStore._actions.clear();
      try{ localStorage.setItem('last_food_order_id', order.id); }catch(e){}
      const modal = document.getElementById('foodDriverModal');
      if(modal){
        modal.style.display='block';
        document.getElementById('foodOrderId').textContent='ID #'+order.id.slice(0,8).toUpperCase()+' • Rp '+Number(order.total).toLocaleString();
        document.getElementById('foodDriverSearchInfo').textContent='Mencari driver terdekat dari warung '+ (state.storeName||'')+'... Driver & pemesan harus sepakat dulu, baru warung dapat notif.';
      }
      await window._searchFoodDrivers(order, state.pickup.lat, state.pickup.lng);
      window._startFoodTracking(order.id);
      if(btn){ btn.disabled=false; btn.textContent='✅ Checkout - Cari Driver Terdekat'; }
    }catch(e){
      console.error(e); alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='✅ Checkout - Cari Driver Terdekat'; }
    }
  };

  window._searchFoodDrivers = async function(order, pickupLat, pickupLng){
    const info = document.getElementById('foodDriverSearchInfo');
    const list = document.getElementById('foodDriverList');
    if(info) info.textContent='🔍 Mencari driver dalam radius 5km dari warung...';
    if(list) list.innerHTML='<div style="text-align:center;padding:20px">🔍 Mencari driver terdekat...</div>';
    try{
      const tenMinAgo = new Date(Date.now()-10*60*1000).toISOString();
      const { data: locs, error: locErr } = await supabase.from('driver_locations').select('*').gte('updated_at', tenMinAgo).limit(50);
      if(locErr) throw locErr;
      if(!locs || !locs.length){
        if(list) list.innerHTML='<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:12px">Tidak ada driver online. Order tetap dibuat, driver akan lihat di dashboard driver.<br/><br/><button onclick="location.hash=\'#/store\'" class="btn primary">Kembali</button></div>';
        if(info) info.textContent='Tidak ada driver online - menunggu driver terima';
        return;
      }
      const driverIds = locs.map(l=>l.driver_id).filter(Boolean);
      const { data: users } = await supabase.from('users').select('id, name, hp, role, jenis_kendaraan, nopol').in('id', driverIds);
      const drivers = locs.map(loc=>{
        const u = users ? users.find(x=>x.id===loc.driver_id) : null;
        if(!u) return null; if((u.role||'').toLowerCase()!=='driver') return null;
        let dLat=null,dLng=null; if(loc.lat && loc.lng){ dLat=loc.lat; dLng=loc.lng; } else if(loc.lokasi){ try{ const m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} }
        if(!dLat) return null;
        const distFromWarung = _calcHaversine(pickupLat, pickupLng, dLat, dLng);
        return { ...u, driver_id: u.id, distance_km: distFromWarung, lat: dLat, lng: dLng, location_updated: loc.updated_at };
      }).filter(Boolean);
      let nearby = drivers.filter(d=>d.distance_km<=5).sort((a,b)=>a.distance_km-b.distance_km);
      if(!nearby.length){ nearby = drivers.sort((a,b)=>a.distance_km-b.distance_km).slice(0,5); if(info) info.textContent='Tidak ada driver dalam 5km, menampilkan 5 terdekat:'; }
      else { if(info) info.textContent='Ditemukan '+nearby.length+' driver terdekat dari warung:'; }
      if(!nearby.length){ if(list) list.innerHTML='<div style="padding:16px;text-align:center" class="muted">Tidak ada driver terdekat</div>'; return; }
      if(list){
        list.innerHTML = nearby.map(d=>{
          const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
          const wa = d.hp ? 'https://wa.me/'+d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')+'?text=Halo%20'+encodeURIComponent(d.name) : null;
          return '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px"><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-weight:800;font-size:14px">'+d.name+'</span><span style="background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:8px;font-size:10px">'+vehIcon+' '+(d.jenis_kendaraan||'motor').toUpperCase()+'</span><span style="background:#22c55e;color:#052e16;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">📍 '+d.distance_km.toFixed(2)+' km dari warung</span></div><div style="margin-top:6px;font-size:11px;color:var(--muted)">'+(d.nopol||'')+' • update '+new Date(d.location_updated).toLocaleTimeString('id-ID')+'</div></div><div style="display:flex;flex-direction:column;gap:8px;min-width:112px;justify-content:center"><button onclick="window._assignFoodDriver(\''+order.id+'\', \''+d.driver_id+'\')" style="background:#22c55e;color:#052e16;border:none;padding:10px 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer">✅ Pilih Driver</button>'+(wa ? '<a href="'+wa+'" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>' : '')+'</div></div>';
        }).join('');
      }
      try{ localStorage.setItem('food_auto_queue_'+order.id, JSON.stringify(nearby)); }catch(e){}
    }catch(e){
      console.error('searchFoodDrivers fail', e);
      if(info) info.textContent='Gagal cari driver: '+e.message;
    }
  };

  // Driver & Pemesan sepakat -> driver klik Terima -> status driver_assigned -> baru warung dapat notif
  window._assignFoodDriver = async function(orderId, driverId){
    if(!confirm('Pilih driver ini? Driver & pemesan dianggap sudah sepakat, warung akan dapat notif untuk masak.')) return;
    try{
      // Flow baru: searching_driver -> driver_assigned (bukan langsung preparing)
      // driver_assigned artinya driver sudah sepakat dengan pemesan, warung baru dapat notif
      const { data, error } = await supabase.from('food_orders').update({ driver_id: driverId, status: 'driver_assigned' }).eq('id', orderId).select().single();
      if(error) throw error;
      alert('✅ Driver dipilih! Driver & pemesan sepakat. Warung '+ (data.store_id ? 'sudah' : '') +' akan dapat notif untuk mulai masak.');
      document.getElementById('foodTrackingCard').style.display='block';
      document.getElementById('foodTrackingStatus').textContent='✅ Driver sepakat - Warung dapat notif untuk masak';
      document.getElementById('foodDriverList').style.display='none';
      document.getElementById('foodDriverSearchInfo').textContent='Driver terdekat sudah sepakat, warung sedang menyiapkan pesanan';
      const { data: drv } = await supabase.from('users').select('name,hp').eq('id', driverId).maybeSingle();
      if(drv){
        const waBtn = document.getElementById('btnWaFoodDriver');
        if(waBtn && drv.hp){ waBtn.href='https://wa.me/'+drv.hp.replace(/[^0-9]/g,'').replace(/^0/,'62'); waBtn.style.display='block'; }
      }
      // Broadcast ke warung via realtime akan otomatis muncul di viewStoreOrders karena status driver_assigned
    }catch(e){ alert('Gagal assign driver: '+e.message); }
  };

  window._startFoodTracking = function(orderId){
    if(_foodTrackingChannel){ try{ supabase.removeChannel(_foodTrackingChannel); }catch(e){} _foodTrackingChannel=null; }
    if(_foodPollInterval){ clearInterval(_foodPollInterval); _foodPollInterval=null; }
    _foodTrackingChannel = supabase.channel('food-order-'+orderId)
      .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, function(payload){
        const o = payload.new; if(!o) return;
        const statusEl = document.getElementById('foodTrackingStatus');
        if(statusEl){
          const map = { searching_driver:'Mencari driver...', driver_assigned:'✅ Driver sepakat - Warung dapat notif & mulai masak 🍳', accepted:'✅ Driver sepakat - Warung masak 🍳', preparing:'Warung sedang masak 🍳', ready:'Makanan siap, menunggu driver ambil 🍱', picked:'Driver OTW antar ke kamu 🚚', completed:'Selesai ✅', cancelled:'Dibatalkan ❌' };
          statusEl.textContent = map[o.status]||o.status;
        }
        if(['completed','cancelled'].includes(o.status)){
          if(_foodTrackingChannel){ try{ supabase.removeChannel(_foodTrackingChannel); }catch(e){} }
          if(_foodPollInterval){ clearInterval(_foodPollInterval); }
        }
      }).subscribe();
    _foodPollInterval = setInterval(async function(){
      try{
        const { data: o } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
        if(!o) return;
        const statusEl = document.getElementById('foodTrackingStatus');
        if(statusEl){
          const map = { searching_driver:'Mencari driver...', driver_assigned:'✅ Driver sepakat - Warung masak 🍳', accepted:'✅ Driver sepakat', preparing:'Warung masak 🍳', ready:'Makanan siap 🍱', picked:'Driver OTW 🚚', completed:'Selesai ✅', cancelled:'Dibatalkan ❌' };
          statusEl.textContent = map[o.status]||o.status;
        }
        if(o.driver_id && o.pickup_lat){
          try{
            const { data: loc } = await supabase.from('driver_locations').select('*').eq('driver_id', o.driver_id).single();
            if(loc && loc.lat){
              const distToWarung = _calcHaversine(loc.lat, loc.lng, o.pickup_lat, o.pickup_lng);
              const distToCust = o.dest_lat ? _calcHaversine(loc.lat, loc.lng, o.dest_lat, o.dest_lng) : 0;
              const distEl = document.getElementById('foodTrackingDistance');
              if(distEl){
                if(o.status==='driver_assigned' || o.status==='preparing' || o.status==='ready'){ distEl.textContent='Driver '+distToWarung.toFixed(2)+' km dari warung'; }
                else if(o.status==='picked'){ distEl.textContent='Driver '+distToCust.toFixed(2)+' km dari kamu'; }
              }
            }
          }catch(e){}
        }
        if(['completed','cancelled'].includes(o.status)){ clearInterval(_foodPollInterval); }
      }catch(e){}
    }, 4000);
  };

  window._toggleProd = async function(id, avail){ try{ await productStore._actions.updateProduct(id, { is_available: avail }); location.reload(); }catch(e){ alert(e.message); } };
  window._delProd = async function(id){ if(!confirm('Hapus?')) return; try{ await productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); } };
  window._editProd = async function(id){
    try{
      const { data } = await supabase.from('store_products').select('*').eq('id', id).single(); if(!data) return;
      let vari=[]; try{ vari=typeof data.variants==='string'?JSON.parse(data.variants):(data.variants||[]);}catch(e){}
      let addons=[]; try{ addons=typeof data.addons==='string'?JSON.parse(data.addons):(data.addons||[]);}catch(e){}
      const variStr=vari.map(function(v){ return v.name+'|'+v.price_delta; }).join(', ');
      const addonStr=addons.map(function(a){ return a.name+'|'+a.harga; }).join(', ');
      const newVari=prompt('Edit Varian:', variStr); if(newVari===null) return;
      const newAddon=prompt('Edit Addon:', addonStr); if(newAddon===null) return;
      const parseVari=function(str){ if(!str.trim()) return []; return str.split(',').map(function(s){ return s.trim(); }).filter(Boolean).map(function(part){ const p=part.split('|').map(function(x){ return x.trim(); }); return { name:p[0], price_delta:parseInt(p[1]||'0')||0 }; }); };
      const parseAddon=function(str){ if(!str.trim()) return []; return str.split(',').map(function(s){ return s.trim(); }).filter(Boolean).map(function(part){ const p=part.split('|').map(function(x){ return x.trim(); }); return { name:p[0], harga:parseInt(p[1]||'0')||0 }; }); };
      await productStore._actions.updateProduct(id, { variants:parseVari(newVari), addons:parseAddon(newAddon) }); location.reload();
    }catch(e){ alert(e.message); }
  };
  window._orderStatus = async function(id, status){ if(!confirm('Ubah jadi '+status+'?')) return; try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); } };
}

if(typeof document !== 'undefined'){
  document.addEventListener('click', function(e){
    if(e.target.closest('#btnCheckout')){ e.preventDefault(); if(window._checkoutFood) window._checkoutFood(); }
    if(e.target.closest('#btnPickDest')){
      e.preventDefault();
      if(window.mapModule && window.mapModule.openMapPicker){ window.mapModule.openMapPicker('dest'); }
      else if(window.openMapPicker){ window.openMapPicker('dest'); }
      else {
        const lat=prompt('Lat tujuan:'); const lng=prompt('Lng tujuan:'); const text=prompt('Alamat:');
        if(lat && lng){
          try{
            const raw=localStorage.getItem('ojol_cart_v2_food'); if(raw){ const s=JSON.parse(raw); s.dest={ lat:parseFloat(lat), lng:parseFloat(lng), text:text||'' }; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s)); location.reload(); }
          }catch(err){}
        }
      }
    }
    if(e.target.closest('#btnUseMyLocation')){
      e.preventDefault();
      if(!navigator.geolocation){ alert('GPS tidak support'); return; }
      navigator.geolocation.getCurrentPosition(function(pos){
        const lat=pos.coords.latitude, lng=pos.coords.longitude;
        try{
          const raw=localStorage.getItem('ojol_cart_v2_food'); if(raw){ const s=JSON.parse(raw); s.dest={ lat:lat, lng:lng, text:s.dest.text||'' }; if(s.pickup && s.pickup.lat){ const R=6371, dLat=(lat-s.pickup.lat)*Math.PI/180, dLng=(lng-s.pickup.lng)*Math.PI/180; const a=Math.sin(dLat/2)**2 + Math.cos(s.pickup.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2; s.distanceKm=2*R*Math.asin(Math.sqrt(a)); } localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s)); location.reload(); }
        }catch(e){ alert(e.message); }
      }, function(err){ alert('GPS error: '+err.message); }, { enableHighAccuracy:true, timeout:8000 });
    }
  });
}

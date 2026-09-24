import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

function calcHav(lat1,lng1,lat2,lng2){
  var R=6371;
  var dLat=(lat2-lat1)*3.1415926535/180;
  var dLng=(lng2-lng1)*3.1415926535/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*3.1415926535/180)*Math.cos(lat2*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(a));
}

export async function viewStoreList(){
  try{
    var stores = [];
    try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ 
      var res = await supabase.from('stores').select('*').eq('is_open', true).limit(30);
      stores = res.data||[];
    }
    var cards = '';
    for(var i=0;i<stores.length;i++){
      var s = stores[i];
      cards += '<div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + (s.name||'') + '</b><span style="font-size:10px;background:' + (s.is_open ? '#16a34a' : '#ef4444') + ';color:white;padding:3px 8px;border-radius:99px">' + (s.is_open ? 'BUKA' : 'TUTUP') + '</span></div><div class="muted" style="font-size:11px">' + (s.alamat_text||'') + '</div><a href="#/store/detail/' + s.id + '" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a></div>';
    }
    return '<div class="card"><h2>Warung Buka</h2><p class="muted" style="font-size:11px">Flow: Checkout cari driver dulu - driver terima - warung baru masak</p><div class="list">' + (cards || '<div class="muted">Belum ada warung buka</div>') + '</div></div>';
  }catch(e){
    return '<div class="card"><p class="muted">Error store: ' + e.message + '</p></div>';
  }
}


export async function viewStoreDetail(storeId){
  try{
    var res = await supabase.from('stores').select('*').eq('id', storeId).single();
    var store = res.data;
    if(!store) return '<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>';
    var prodRes = await supabase.from('store_products').select('*').eq('store_id', storeId).eq('is_available', true).limit(50);
    var products = prodRes.data||[];
    try{ cartStore._actions.setStore(store); }catch(e){}
    var prodJson = JSON.stringify(products).replace(/</g, '\\u003c');
    var listHtml = '';
    for(var i=0;i<products.length;i++){
      var p = products[i];
      listHtml += '<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)"><b>' + (p.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga||0).toLocaleString('id-ID') + ' • ' + (p.kategori||'Makanan') + '</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder(\'' + p.id + '\')">Pilih Varian</button></div></div>';
    }
    return '<div class="card"><a href="#/store" class="muted">Kembali</a><h2 style="margin-top:8px">' + (store.name||'') + '</h2><div class="muted" style="font-size:11px">' + (store.alamat_text||'') + '</div></div><div class="list" style="margin-top:12px">' + (listHtml || '<div class="muted">Belum ada menu</div>') + '</div><div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center"><div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0"><div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div id="builderName" style="font-weight:800">Menu</div><div id="builderBase" class="muted" style="font-size:12px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:auto">X</button></div></div><div style="padding:16px"><div style="font-weight:800;margin-bottom:8px">Variasi</div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="font-weight:800;margin-bottom:8px">Addon</div><div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12px">Qty</span><div style="display:flex;gap:8px;align-items:center"><button id="builderQtyMinus" class="btn secondary" style="width:36px">-</button><span id="builderQty">1</span><button id="builderQtyPlus" class="btn secondary" style="width:36px">+</button></div></div><div class="muted" style="font-size:12px;margin-top:8px" id="builderSummary">-</div><div style="font-size:18px;font-weight:800;color:var(--primary);margin-top:4px" id="builderTotal">Rp 0</div></div><button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800">+ Tambah ke Keranjang</button></div></div></div><script type="application/json" id="productsData">' + prodJson + '</script>';
  }catch(e){
    return '<div class="card">Error detail: ' + e.message + '</div>';
  }
}
export async function viewStoreCart(){
  var state;
  var rawLocal = null;
  try{ rawLocal = localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ 
    state = cartStore.getState(); 
    if((!state.items || !state.items.length) && rawLocal){
      try{
        var parsed = JSON.parse(rawLocal);
        if(parsed.items && parsed.items.length){
          state = parsed;
        }
      }catch(e){}
    }
  }catch(e){
    var raw = localStorage.getItem('ojol_cart_v2_food');
    state = raw ? JSON.parse(raw) : { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  }
  if(!state) state = { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  var totals;
  try{ totals = cartStore._actions.getTotals(); }catch(e){ 
    var subtotal = 0;
    for(var i=0;i<(state.items||[]).length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    totals = { subtotal: subtotal, delivery_fee: 0, total: subtotal, distance_km: 0, count: (state.items||[]).length };
  }
  var itemsHtml = '';
  if(state.items && state.items.length){
    for(var i=0;i<state.items.length;i++){
      var it = state.items[i];
      var key = it.cartKey || it.product_id || it.id;
      itemsHtml += '<div class="driver-card" style="flex-direction:column;gap:8px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1"><b>' + (it.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(it.harga||0).toLocaleString() + ' x ' + it.qty + '</div></div><div style="display:flex;gap:6px;align-items:center"><button onclick="window._cartQty(\'' + key + '\',' + (it.qty-1) + ')" class="btn secondary" style="width:36px">-</button><span style="font-weight:700">' + it.qty + '</span><button onclick="window._cartQty(\'' + key + '\',' + (it.qty+1) + ')" class="btn secondary" style="width:36px">+</button></div></div><button onclick="window._removeCartItem(\'' + key + '\')" class="btn secondary" style="width:100%;font-size:11px;background:#fee2e2;color:#dc2626">Hapus</button></div>';
    }
  } else {
    itemsHtml = '<div class="muted">Keranjang kosong.</div>';
  }
  return '<div class="card"><h2>Keranjang' + (state.storeName ? ' - ' + state.storeName : '') + '</h2><div class="list">' + itemsHtml + '</div><div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px"><div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">Subtotal</span><b>Rp ' + Number(totals.subtotal||0).toLocaleString() + '</b></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Jarak</span><b>' + (totals.distance_km||'0.00') + ' km</b></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Ongkir</span><b>Rp ' + Number(totals.delivery_fee||0).toLocaleString() + '</b></div><div class="muted" style="font-size:10px;margin-top:8px">Warung: ' + ((state.pickup.text||'').slice(0,40)) + ' Tujuan: ' + ((state.dest.text||'').slice(0,40)) + '</div></div><div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ' + Number(totals.total||0).toLocaleString() + '</div><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px"><div style="font-size:13px;font-weight:700">Alamat Antar *</div><textarea id="destText" placeholder="Alamat lengkap">' + (state.dest.text||'') + '</textarea><div style="display:flex;gap:8px;margin-top:8px"><button id="btnPickDest" class="btn secondary" style="flex:1">Pilih di Peta</button><button id="btnUseMyLocation" class="btn secondary" style="flex:1">Lokasi Saya</button></div><div class="muted" style="font-size:10px;margin-top:6px" id="cartLatLngDisplay">Lat: ' + (state.dest.lat||'-') + ' Lng: ' + (state.dest.lng||'-') + '</div></div><div id="cartNearbyDriversSection" style="margin-top:14px;border:1px solid #f59e0b;border-radius:14px;padding:12px;background:var(--card)"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">5 Driver Terdekat dari Warung (Aktif)</b><button id="btnRefreshDrivers" style="font-size:11px">Refresh</button></div><div class="muted" style="font-size:10px;margin-top:4px">Driver aktif 15 menit terakhir</div><div id="cartNearbyDriversList" style="margin-top:10px"><div class="muted" style="padding:12px;text-align:center;font-size:11px">Pilih alamat antar dulu</div></div><div style="display:flex;gap:8px;margin-top:10px"><button id="btnCheckoutBroadcast" class="btn secondary" style="flex:1">Cari Driver Lain (Broadcast)</button><button id="btnCheckout" class="btn primary" style="flex:1">Pesan dan Broadcast</button></div></div></div></div><div id="foodActiveOrderCard" style="display:none;margin-top:12px"></div>';
}

window._loadNearbyDriversForCart = async function(){
  var listEl = document.getElementById('cartNearbyDriversList');
  if(!listEl) return;
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw){ listEl.innerHTML = 'Keranjang kosong'; return; }
    var state = JSON.parse(raw);
    var plat = state.pickup && state.pickup.lat ? state.pickup : null;
    if(!plat || !plat.lat){ listEl.innerHTML = 'Warung belum ada koordinat'; return; }
    listEl.innerHTML = 'Mencari 5 driver...';
    var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
    var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
    var locs = res.data;
    if(!locs || !locs.length){ listEl.innerHTML = 'Tidak ada driver online. Tetap bisa Broadcast.'; return; }
    var driverIds = [];
    for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
    var usersRes = await supabase.from('users').select('id,name,role,jenis_kendaraan,nopol').in('id', driverIds);
    var users = usersRes.data || [];
    var drivers = [];
    for(var j=0;j<locs.length;j++){
      var loc = locs[j];
      var u = null;
      for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
      if(!u) continue;
      if((u.role||'').toLowerCase()!=='driver') continue;
      var R=6371;
      var dLat=(loc.lat - plat.lat)*3.1415926535/180;
      var dLng=(loc.lng - plat.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      var dist = 2*R*Math.asin(Math.sqrt(a));
      drivers.push({ loc: loc, user: u, dist: dist });
    }
    drivers.sort(function(a,b){ return a.dist-b.dist; });
    drivers = drivers.slice(0,5);
    if(!drivers.length){ listEl.innerHTML = 'Tidak ada driver aktif'; return; }
    var html = '';
    for(var d=0; d<drivers.length; d++){
      var dr = drivers[d];
      var usr = dr.user;
      html += '<div style="border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><div><b>' + (usr.name||'Driver') + '</b><div class="muted" style="font-size:10px">' + dr.dist.toFixed(2) + ' km</div></div><button data-driver-id="' + usr.id + '" class="btn-choose-driver" style="background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800">Pilih</button></div>';
    }
    listEl.innerHTML = html;
  }catch(e){
    if(listEl) listEl.innerHTML = 'Error: ' + e.message;
  }
};

window._checkoutFoodDirect = async function(driverId){
  if(!driverId) return window._checkoutFood();
  if(!confirm('Pilih driver ini?')) return;
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    var state = JSON.parse(raw);
    var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
    var subtotal = 0;
    for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km = state.distanceKm||0;
    var delivery_fee = 0;
    if(state.pickup && state.pickup.lat){
      var R=6371;
      var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
      var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      distance_km=2*R*Math.asin(Math.sqrt(a));
    }
    delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
    var total = subtotal + delivery_fee;
    var customerId=null;
    var authRes = await supabase.auth.getUser();
    var user = authRes.data ? authRes.data.user : null;
    if(user){
      var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
      customerId = uRes.data ? uRes.data.id : user.id;
    }
    var payload = { store_id: state.storeId, customer_id: customerId, driver_id: driverId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'driver_assigned' };
    var ins = await supabase.from('food_orders').insert(payload).select().single();
    var od = ins.data;
    var err = ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: driverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
      var r2 = await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od = r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Gagal: '+e.message); }
};

window._checkoutFood = async function(){
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return alert('Keranjang kosong');
    var state = JSON.parse(raw);
    if(!state.items || !state.items.length) return alert('Keranjang kosong');
    if(!state.dest.lat || !state.dest.lng){ alert('Pilih lokasi antar di peta dulu!'); return; }
    var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
    if(destText.length<5){ alert('Alamat harus lengkap'); return; }
    state.dest.text = destText;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    var btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=true; btn.textContent='Membuat pesanan...'; }
    var subtotal = 0;
    for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km = state.distanceKm||0;
    var delivery_fee = 0;
    if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
      var R=6371;
      var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
      var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      distance_km=2*R*Math.asin(Math.sqrt(a));
    }
    delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
    var total = subtotal + delivery_fee;
    var customerId=null;
    var authRes = await supabase.auth.getUser();
    var user = authRes.data ? authRes.data.user : null;
    if(user){
      var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
      customerId = uRes.data ? uRes.data.id : user.id;
    }
    var payload = { store_id: state.storeId, customer_id: customerId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'searching_driver' };
    var ins = await supabase.from('food_orders').insert(payload).select().single();
    var od = ins.data;
    var err = ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'searching_driver' };
      var r2 = await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od = r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){
    alert('Checkout gagal: '+e.message);
    var btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='Pesan dan Broadcast'; }
  }
};

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
  });
})();

document.addEventListener('click', function(e){
  var btn = e.target.closest ? e.target.closest('.btn-order-status') : null;
  if(btn){
    var oid = btn.getAttribute('data-order-id');
    var st = btn.getAttribute('data-status');
    if(oid && st) window._orderStatus(oid, st);
  }
});




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
  var htmlList = '';
  for(var i=0;i<orders.length;i++){
    var o = orders[i];
    var statusColor = o.status === 'driver_assigned' ? '#22c55e' : '#f59e0b';
    var btn = '';
    if(o.status === 'driver_assigned' || o.status === 'accepted'){
      btn = '<button class="btn primary btn-order-status" data-order-id="' + o.id + '" data-status="preparing" style="width:auto;padding:8px 12px;font-size:12px">Terima dan Masak</button>';
    } else if(o.status === 'preparing'){
      btn = '<button class="btn primary btn-order-status" data-order-id="' + o.id + '" data-status="ready" style="width:auto;padding:8px 12px;font-size:12px">Siap Diambil</button>';
    } else if(o.status === 'ready'){
      btn = '<span class="muted" style="font-size:11px">Menunggu driver pick</span>';
    }
    var items = '';
    if(o.items){
      var arr = [];
      for(var j=0;j<o.items.length;j++){ arr.push(o.items[j].name + ' x' + o.items[j].qty); }
      items = arr.join(', ');
    }
    htmlList += '<div class="card" style="margin:0;border-left:3px solid ' + statusColor + '"><div style="display:flex;justify-content:space-between"><b>#' + o.id.slice(0,8) + '</b><span style="font-size:10px;background:' + statusColor + ';color:#111;padding:2px 8px;border-radius:99px">' + o.status + '</span></div><div class="muted" style="font-size:11px;margin-top:4px">' + items + '</div><div style="margin-top:8px">' + btn + '</div></div>';
  }
  return '<div class="card"><h2>Pesanan Masuk - ' + myStore.name + '</h2><p class="muted" style="font-size:11px">Flow: Driver terima dulu baru warung masak.</p><div class="list" style="margin-top:10px">' + (htmlList || '<div class="muted">Belum ada pesanan</div>') + '</div></div>';
}



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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
  };



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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
  };



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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
  };



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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
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
    // Checkout - Langsung ke modal detail tracking, tidak ada modal 5 driver
  
  window._loadNearbyDriversForCart = async function(){
    var listEl = document.getElementById('cartNearbyDriversList');
    if(!listEl) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      if(!raw){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Keranjang kosong</div>'; return; }
      var state = JSON.parse(raw);
      var plat = state.pickup && state.pickup.lat ? state.pickup : null;
      if(!plat || !plat.lat){ listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Warung belum ada koordinat</div>'; return; }
      listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Mencari 5 driver aktif terdekat...</div>';
      var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
      var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
      var locs = res.data;
      if(!locs || !locs.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center;font-size:11px>Tidak ada driver online 15 menit terakhir.<br/>Tetap bisa Broadcast.</div>';
        return;
      }
      var driverIds = [];
      for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
      var usersRes = await supabase.from('users').select('id,name,role,status,jenis_kendaraan,nopol').in('id', driverIds);
      var users = usersRes.data || [];
      var drivers = [];
      for(var j=0;j<locs.length;j++){
        var loc = locs[j];
        var u = null;
        for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
        if(!u) continue;
        if((u.role||'').toLowerCase()!=='driver') continue;
        var R=6371;
        var dLat=(loc.lat - plat.lat)*3.1415926535/180;
        var dLng=(loc.lng - plat.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        var dist = 2*R*Math.asin(Math.sqrt(a));
        drivers.push({ loc: loc, user: u, dist: dist });
      }
      drivers.sort(function(a,b){ return a.dist-b.dist; });
      drivers = drivers.slice(0,5);
      if(!drivers.length){
        listEl.innerHTML = '<div class=muted style=padding:12px;text-align:center>Tidak ada driver aktif. Pakai Broadcast.</div>';
        return;
      }
      var html = '';
      for(var d=0; d<drivers.length; d++){
        var dr = drivers[d];
        var usr = dr.user;
        var lc = dr.loc;
        var onlineAgo = Math.round((Date.now() - new Date(lc.updated_at).getTime())/60000);
        var star = d===0 ? '⭐ ' : '';
        html += '<div style=border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;background:' + (d===0 ? '#f0fdf4' : 'var(--card2)') + '>'
          + '<div style=flex:1>'
          + '<div style=font-weight:800;font-size:12px>' + star + (usr.name||'Driver') + '</div>'
          + '<div style=font-size:10px class=muted>' + (usr.jenis_kendaraan||'') + ' ' + (usr.nopol||'') + ' - ' + dr.dist.toFixed(2) + ' km - ' + onlineAgo + ' mnt lalu</div>'
          + '</div>'
          + '<button onclick=window._checkoutFoodDirect(\'' + usr.id + '\') style=background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800;font-size:11px>Pilih</button>'
          + '</div>';
      }
      listEl.innerHTML = html;
    }catch(e){
      if(listEl) listEl.innerHTML = '<div class=muted style=padding:8px;font-size:11px>Error: ' + e.message + '</div>';
    }
  };
  window._checkoutFoodDirect = async function(preferredDriverId){
    if(!preferredDriverId) return window._checkoutFood();
    if(!confirm('Pilih driver ini?')) return;
    try{
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = JSON.parse(raw);
      var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
      var subtotal = 0;
      for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
      var distance_km = state.distanceKm||0;
      var delivery_fee = 0;
      if(state.pickup && state.pickup.lat){
        var R=6371;
        var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
        var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
        var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        distance_km=2*R*Math.asin(Math.sqrt(a));
      }
      delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      var total = subtotal + delivery_fee;
      var customerId=null;
      var authRes = await supabase.auth.getUser();
      var user = authRes.data ? authRes.data.user : null;
      if(user){
        var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
        customerId = uRes.data ? uRes.data.id : user.id;
      }
      var payload = {
        store_id: state.storeId,
        customer_id: customerId,
        driver_id: preferredDriverId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'driver_assigned'
      };
      var ins = await supabase.from('food_orders').insert(payload).select().single();
      var od = ins.data;
      var err = ins.error;
      if(err && err.message.indexOf('column')!==-1){
        var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: preferredDriverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
        var r2 = await supabase.from('food_orders').insert(minimal).select().single();
        if(r2.error) throw r2.error;
        od = r2.data;
      } else if(err) throw err;
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', od.id);
      if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
      else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
    }catch(e){ alert('Gagal: '+e.message); }
  };

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
      
      let subtotal = 0;
      try{ subtotal = state.items.reduce((a,b)=>a+Number(b.harga||0)*Number(b.qty||0),0); }catch(e){}
      let distance_km = state.distanceKm || state.distance_km || 0;
      let delivery_fee = 0;
      try{
        if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
          const R=6371; const dLat=(state.dest.lat - state.pickup.lat)*Math.PI/180; const dLng=(state.dest.lng - state.pickup.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2 + Math.cos(state.pickup.lat*Math.PI/180)*Math.cos(state.dest.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          distance_km = 2*R*Math.asin(Math.sqrt(a));
        }
        delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
      }catch(e){}
      const total = subtotal + delivery_fee;
      let customerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) customerId = u.id; else customerId = user.id;
        }
      }catch(e){}
      const payload = {
        store_id: state.storeId,
        customer_id: customerId,
        items: state.items,
        subtotal: subtotal,
        delivery_fee: delivery_fee,
        total: total,
        distance_km: parseFloat(Number(distance_km).toFixed(2)),
        dest_text: destText,
        dest_lat: state.dest.lat,
        dest_lng: state.dest.lng,
        pickup_lat: state.pickup.lat,
        pickup_lng: state.pickup.lng,
        pickup_text: state.pickup.text||'',
        status: 'searching_driver'
      };
      let orderData = null;
      let { data: od, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error){
        if(error.message.includes('column') || error.message.includes('subtotal') || error.message.includes('delivery_fee')){
          const minimal = {
            store_id: payload.store_id,
            customer_id: payload.customer_id,
            items: payload.items,
            total: payload.total,
            dest_text: payload.dest_text,
            dest_lat: payload.dest_lat,
            dest_lng: payload.dest_lng,
            pickup_lat: payload.pickup_lat,
            pickup_lng: payload.pickup_lng,
            status: payload.status
          };
          const r2 = await supabase.from('food_orders').insert(minimal).select().single();
          if(r2.error) throw r2.error;
          orderData = r2.data;
        } else { throw error; }
      } else { orderData = od; }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
      localStorage.setItem('active_food_order_id', orderData.id);
      localStorage.setItem('food_auto_start_'+orderData.id, Date.now().toString());
      // Langsung ke modal detail tracking, skip modal 5 driver
      try{
        if(window.openFoodTrackingDetailModal){
          window.openFoodTrackingDetailModal(orderData.id);
        } else {
          const tf = await import('./trackingFood.js');
          if(tf.openFoodTrackingDetailModal) tf.openFoodTrackingDetailModal(orderData.id);
          else location.hash = '#/tracking/food/' + orderData.id;
        }
      }catch(e){
        location.hash = '#/tracking/food/' + orderData.id;
      }
    }catch(e){
      console.error('checkoutFood fail', e);
      alert('Checkout gagal: '+e.message);
      const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='🛒 Pesan & Cari Driver'; }
    }
  };





window._orderStatus = async function(id, status){
  if(!id) return;
  if(!confirm('Ubah jadi ' + status + '?')) return;
  try{
    var res = await supabase.from('food_orders').update({ status: status }).eq('id', id);
    if(res.error) throw res.error;
    location.reload();
  }catch(e){ alert(e.message); }
};


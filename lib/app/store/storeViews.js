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
    var listHtml = '';
    for(var i=0;i<products.length;i++){
      var p = products[i];
      listHtml += '<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)"><b>' + (p.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga||0).toLocaleString('id-ID') + '</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder(\'' + p.id + '\')">Pilih Varian</button></div></div>';
    }
    return '<div class="card"><a href="#/store" class="muted">Kembali</a><h2 style="margin-top:8px">' + (store.name||'') + '</h2><div class="muted" style="font-size:11px">' + (store.alamat_text||'') + '</div></div><div class="list" style="margin-top:12px">' + (listHtml || '<div class="muted">Belum ada menu</div>') + '</div>';
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

export async function viewMyStore(){ return '<div class="card">Warungku - buka menu</div>'; }
export async function viewStoreProducts(){ return '<div class="card">Kelola Menu</div>'; }
export async function viewStoreOrders(){ return '<div class="card">Order Masuk</div>'; }

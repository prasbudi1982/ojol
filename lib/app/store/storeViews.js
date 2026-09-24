
// =================================================================================
// FINAL MERGED - storeViews + trackingFood
// - Pencarian 5 driver terdekat INLINE di keranjang (tanpa modal) - sesuai request
// - Tracking tetap MODAL (lock modal + detail modal)
// - Semua blok maintainable: WARUNG, MENU, FOOD, WARUNGKU, TRACKING
// =================================================================================

import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

// =================================================================================
// BLOK 0: HELPER
// =================================================================================
function calcHav(lat1,lng1,lat2,lng2){
  var R=6371;
  var dLat=(lat2-lat1)*3.1415926535/180;
  var dLng=(lng2-lng1)*3.1415926535/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*3.1415926535/180)*Math.cos(lat2*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(a));
}
function haversineKm(lat1,lng1,lat2,lng2){ return calcHav(lat1,lng1,lat2,lng2); }
function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

// =================================================================================
// BLOK 1: BLOK WARUNG - LIST WARUNG BUKA
// =================================================================================
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
    return '<div class="card"><h2>🍔 Warung Buka</h2><p class="muted" style="font-size:11px">Flow: Checkout cari driver dulu - driver terima - warung baru masak</p><div class="list">' + (cards || '<div class="muted">Belum ada warung buka</div>') + '</div></div>';
  }catch(e){
    return '<div class="card"><p class="muted">Error store: ' + e.message + '</p></div>';
  }
}

// =================================================================================
// BLOK 2: BLOK MENU - DETAIL WARUNG
// =================================================================================
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
      listHtml += '<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)"><b>' + (p.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga||0).toLocaleString('id-ID') + '</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder(\'' + p.id + '\')">🍱 Pilih Varian</button></div></div>';
    }
    return '<div class="card"><a href="#/store" class="muted">← Kembali</a><h2 style="margin-top:8px">' + (store.name||'') + '</h2><div class="muted" style="font-size:11px">' + (store.alamat_text||'') + '</div></div><div class="list" style="margin-top:12px">' + (listHtml || '<div class="muted">Belum ada menu</div>') + '</div>';
  }catch(e){
    return '<div class="card">Error detail: ' + e.message + '</div>';
  }
}

// =================================================================================
// BLOK 3: BLOK FOOD - KERANJANG + 5 DRIVER TERDEKAT INLINE (TANPA MODAL)
// Sesuai file referensi kamu - pencarian driver langsung di halaman keranjang
// =================================================================================
export async function viewStoreCart(){
  var state; var rawLocal=null;
  try{ rawLocal=localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ 
    state=cartStore.getState(); 
    if((!state.items || !state.items.length) && rawLocal){
      try{ var parsed=JSON.parse(rawLocal); if(parsed.items && parsed.items.length) state=parsed; }catch(e){}
    }
  }catch(e){
    var raw=localStorage.getItem('ojol_cart_v2_food');
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
        </div>
        <div class="muted" style="font-size:10px;margin-top:6px">Lat: <span id="cartLatDisplay">${state.dest.lat||'-'}</span> Lng: <span id="cartLngDisplay">${state.dest.lng||'-'}</span> • Jarak ${distance_km.toFixed(2)} km</div>
      </div>
      <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal</span><span>Rp ${totals.subtotal.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>Ongkir (${distance_km.toFixed(2)} km)</span><span>Rp ${delivery_fee.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;font-size:14px"><span>Total</span><span>Rp ${total.toLocaleString()}</span></div>
      </div>
    </div>

    <!-- BLOK FOOD - 5 DRIVER TERDEKAT INLINE (TANPA MODAL) - SEPERTI FILE REFERENSI -->
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
      <div class="muted" style="font-size:10px;margin-top:8px;text-align:center">Pilih driver langsung atau broadcast • Flow: driver terima dulu baru warung masak • Tracking tetap modal</div>
    </div>
  `;
}

// =================================================================================
// BLOK 4: BLOK FOOD - LOGIC PENCARIAN 5 DRIVER TERDEKAT (INLINE, NO MODAL)
// =================================================================================
window._loadNearbyDriversForCart = async function(){
  var listEl=document.getElementById('nearbyDriversList');
  var statusEl=document.getElementById('foodDriverStatus');
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food');
    if(!raw){ if(statusEl) statusEl.textContent='Keranjang kosong'; return; }
    var state=JSON.parse(raw);
    if(!state.pickup || !state.pickup.lat){ if(statusEl) statusEl.textContent='Pickup warung belum ada'; if(listEl) listEl.innerHTML='<div class=muted>Warung belum set lokasi</div>'; return; }

    if(statusEl) statusEl.textContent='Mencari driver di sekitar warung...';
    if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">🔍 Mencari...</div>';

    var { data: locs } = await supabase.from('driver_locations').select('*').limit(50);
    if(!locs || !locs.length){
      if(statusEl) statusEl.textContent='Tidak ada driver online';
      if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">Tidak ada driver online.<br/>Silakan broadcast, driver akan lihat di dashboard.<br/>Timer 5 menit auto batal.</div>';
      return;
    }

    var driverIds=locs.map(l=>l.driver_id).filter(Boolean);
    var { data: users } = await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol').in('id', driverIds);
    
    var drivers=locs.map(loc=>{
      var u=users?users.find(x=>x.id===loc.driver_id):null;
      if(!u) return null;
      if((u.role||'').toLowerCase()!=='driver') return null;
      var dLat=null,dLng=null;
      if(loc.lat && loc.lng){ dLat=loc.lat; dLng=loc.lng; }
      else if(loc.lokasi){ try{ var m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} }
      if(!dLat) return null;
      var dist=calcHav(state.pickup.lat, state.pickup.lng, dLat, dLng);
      return { ...u, driver_id:u.id, distance_km:dist, lat:dLat, lng:dLng };
    }).filter(Boolean).sort((a,b)=>a.distance_km-b.distance_km).slice(0,5);

    if(statusEl) statusEl.textContent='Ditemukan '+drivers.length+' driver terdekat dari warung';
    if(listEl){
      if(!drivers.length){
        listEl.innerHTML='<div class=muted>Tidak ada driver terdekat</div>';
      } else {
        listEl.innerHTML=drivers.map(d=>{
          var icon=(d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
          return '<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:center"><div style="flex:1"><div style="font-weight:800;font-size:13px">' + d.name + ' ' + icon + ' <span style="background:#22c55e;color:#052e16;padding:2px 6px;border-radius:6px;font-size:10px">' + d.distance_km.toFixed(2) + ' km dari warung</span></div><div style="font-size:11px" class="muted">' + (d.nopol||'') + ' • ' + (d.hp||'') + '</div></div><button data-driver-id="' + d.driver_id + '" class="btn-choose-driver" style="background:#22c55e;color:#052e16;border:none;padding:10px 14px;border-radius:10px;font-weight:800;font-size:12px">✅ Pilih</button></div>';
        }).join('');
      }
    }
  }catch(err){
    console.error(err);
    if(statusEl) statusEl.textContent='Error: '+err.message;
    if(listEl) listEl.innerHTML='<div class=muted>Error: '+err.message+'</div>';
  }
};

window._checkoutFoodDirect = async function(driverId){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw);
    if(!state.items || !state.items.length) return alert('Keranjang kosong');
    if(!state.dest.lat) return alert('Pilih lokasi antar dulu!');
    if(!confirm('Pesan dengan driver ini? Driver akan konfirmasi dulu, baru warung masak.')) return;

    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0;
    if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){ distance_km=calcHav(state.pickup.lat, state.pickup.lng, state.dest.lat, state.dest.lng); }
    var delivery_fee=distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000));
    var total=subtotal+delivery_fee;

    var customerId=null;
    var authRes=await supabase.auth.getUser();
    var user=authRes.data?authRes.data.user:null;
    if(user){ var uRes=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }

    var payload={ store_id: state.storeId, customer_id: customerId, driver_id: driverId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: state.dest.text, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'driver_assigned' };
    var ins=await supabase.from('food_orders').insert(payload).select().single();
    var od=ins.data; var err=ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal={ store_id: payload.store_id, customer_id: payload.customer_id, driver_id: driverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
      var r2=await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od=r2.data;
    } else if(err) throw err;

    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    // TRACKING TETAP MODAL
    if(window.trackingFood && window.trackingFood.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id);
    else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);

  }catch(e){ alert('Gagal: '+e.message); }
};

window._checkoutFood = async function(){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw);
    if(!state.items || !state.items.length) return alert('Keranjang kosong');
    if(!state.dest.lat || !state.dest.lng){ alert('Pilih lokasi antar di peta dulu!'); return; }
    var destText=document.getElementById('destText')?document.getElementById('destText').value.trim():state.dest.text||'';
    if(destText.length<5){ alert('Alamat harus lengkap'); return; }
    state.dest.text=destText;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=true; btn.textContent='Membuat pesanan...'; }
    
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=state.distanceKm||0;
    if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){ distance_km=calcHav(state.pickup.lat, state.pickup.lng, state.dest.lat, state.dest.lng); }
    var delivery_fee=distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000));
    var total=subtotal+delivery_fee;

    var customerId=null;
    var authRes=await supabase.auth.getUser();
    var user=authRes.data?authRes.data.user:null;
    if(user){ var uRes=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }

    var payload={ store_id: state.storeId, customer_id: customerId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'searching_driver' };
    var ins=await supabase.from('food_orders').insert(payload).select().single();
    var od=ins.data; var err=ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal={ store_id: payload.store_id, customer_id: payload.customer_id, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'searching_driver' };
      var r2=await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od=r2.data;
    } else if(err) throw err;

    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.trackingFood && window.trackingFood.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id);
    else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);

  }catch(e){
    alert('Checkout gagal: '+e.message);
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=false; btn.textContent='📢 Broadcast ke Semua Driver'; }
  }
};

// =================================================================================
// BLOK 5: BLOK WARUNGKU + BLOK AVAILABLE LAINNYA + INIT AUTO LOAD
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
  });
})();

export async function viewMyStore(){ return '<div class="card">Warungku - buka menu</div>'; }
export async function viewStoreProducts(){ return '<div class="card">Kelola Menu</div>'; }
export async function viewStoreOrders(){ return '<div class="card">Order Masuk</div>'; }


// NOTE: trackingFood.js ada di lib/app/trackingFood.js - harus di-load sebelum atau bersamaan dengan file ini
// File ini memanggil window.trackingFood.openFoodTrackingDetailModal(od.id)
// Jika belum ada, fallback import dynamic akan dilakukan

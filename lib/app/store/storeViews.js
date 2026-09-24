import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

function calcHav(lat1,lng1,lat2,lng2){
  var R=6371;
  var dLat=(lat2-lat1)*Math.PI/180;
  var dLng=(lng2-lng1)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(a));
}

export async function viewStoreList(){
  try{
    var stores=[];
    try{ stores=await warungStore._actions.fetchOpenStores(); }catch(e){ var r=await supabase.from('stores').select('*').eq('is_open',true).limit(30); stores=r.data||[]; }
    var cards='';
    for(var i=0;i<stores.length;i++){
      var s=stores[i];
      cards+='<div class="driver-card" style="flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><b>'+(s.name||'')+'</b><span style="font-size:10px;background:'+(s.is_open?'#16a34a':'#ef4444')+';color:white;padding:3px 8px;border-radius:99px">'+(s.is_open?'BUKA':'TUTUP')+'</span></div><div class="muted" style="font-size:11px">'+(s.alamat_text||'')+'</div><a href="#/store/detail/'+s.id+'" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a></div>';
    }
    return '<div class="card"><h2>Warung Buka</h2><div class="list">'+(cards||'<div class="muted">Belum ada warung</div>')+'</div></div>';
  }catch(e){ return '<div class="card">Error: '+e.message+'</div>'; }
}

export async function viewStoreDetail(storeId){
  try{
    var res=await supabase.from('stores').select('*').eq('id',storeId).single();
    var store=res.data; if(!store) return '<div class="card">Warung tidak ditemukan</div>';
    var prodRes=await supabase.from('store_products').select('*').eq('store_id',storeId).eq('is_available',true).limit(50);
    var products=prodRes.data||[];
    try{ cartStore._actions.setStore(store); }catch(e){}
    var listHtml='';
    for(var i=0;i<products.length;i++){
      var p=products[i];
      listHtml+='<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2)"><b>'+(p.name||'')+'</b><div class="muted" style="font-size:11px">Rp '+Number(p.harga||0).toLocaleString('id-ID')+'</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder(\''+p.id+'\')">Pilih Varian</button></div></div>';
    }
    return '<div class="card"><a href="#/store" class="muted">Kembali</a><h2>'+(store.name||'')+'</h2><div class="muted" style="font-size:11px">'+(store.alamat_text||'')+'</div></div><div class="list" style="margin-top:12px">'+(listHtml||'Belum ada menu')+'</div>';
  }catch(e){ return '<div class="card">Error detail: '+e.message+'</div>'; }
}

export async function viewStoreCart(){
  var state; var rawLocal=null;
  try{ rawLocal=localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{
    state=cartStore.getState();
    if((!state.items||!state.items.length)&&rawLocal){
      try{ var parsed=JSON.parse(rawLocal); if(parsed.items&&parsed.items.length) state=parsed; }catch(e){}
    }
  }catch(e){
    var raw=localStorage.getItem('ojol_cart_v2_food');
    state=raw?JSON.parse(raw):{ items:[], storeName:'', dest:{text:'',lat:null,lng:null}, pickup:{}, storeId:null };
  }
  if(!state) state={ items:[], storeName:'', dest:{text:'',lat:null,lng:null}, pickup:{}, storeId:null };

  var totals; try{ totals=cartStore._actions.getTotals(); }catch(e){ var sub=0; for(var i=0;i<(state.items||[]).length;i++){ sub+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); } totals={ subtotal:sub, total:sub, distance_km:0, count:(state.items||[]).length }; }

  var itemsHtml='';
  if(state.items&&state.items.length){
    for(var i=0;i<state.items.length;i++){
      var it=state.items[i]; var key=it.cartKey||it.product_id||it.id;
      itemsHtml+='<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div><b style="font-size:13px">'+(it.name||'')+'</b><div style="font-size:11px;color:var(--muted)">Rp '+Number(it.harga||0).toLocaleString()+' x '+it.qty+'</div></div><div style="display:flex;gap:6px;align-items:center"><button onclick="window._cartQty(\''+key+'\','+(it.qty-1)+')" class="btn secondary" style="width:28px;height:28px;border-radius:50%">-</button><span style="font-weight:800">'+it.qty+'</span><button onclick="window._cartQty(\''+key+'\','+(it.qty+1)+')" class="btn secondary" style="width:28px;height:28px;border-radius:50%">+</button></div></div>';
    }
  } else {
    itemsHtml='<div class="muted" style="padding:16px;text-align:center">Keranjang kosong</div>';
  }

  var destText=state.dest?state.dest.text:'';
  var latDisplay=state.dest&&state.dest.lat?state.dest.lat.toFixed(5):'-';
  var lngDisplay=state.dest&&state.dest.lng?state.dest.lng.toFixed(5):'-';

  return '<div class="card"><h2>Keranjang - '+(state.storeName||'Warung')+'</h2><div style="margin-top:12px">'+itemsHtml+'</div><div style="margin-top:16px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px"><div style="font-weight:800;font-size:13px">Alamat Antar</div><input id="destText" value="'+(destText||'')+'" placeholder="Alamat lengkap minimal 5 huruf" style="width:100%;margin-top:8px;padding:10px;border-radius:8px;border:1px solid var(--border)"><div style="display:flex;gap:8px;margin-top:8px"><button id="btnUseMyLocation" onclick="window._useMyLocation()" style="flex:1;background:var(--card);border:1px solid var(--border);padding:8px;border-radius:8px;font-size:11px">Pakai Lokasi Saya</button><button id="btnPickDestMap" onclick="window._pickDestMap()" style="flex:1;background:var(--card);border:1px solid var(--border);padding:8px;border-radius:8px;font-size:11px">Pilih di Peta</button></div><div style="font-size:10px;color:var(--muted);margin-top:6px">Lat: <span id="cartLatDisplay">'+latDisplay+'</span> Lng: <span id="cartLngDisplay">'+lngDisplay+'</span></div><div id="ongkirLiveStatus" style="font-size:11px;margin-top:6px"></div></div><div style="margin-top:16px"><div style="font-weight:800">Driver Terdekat</div><div id="nearbyDriversStatus" style="font-size:11px;color:var(--muted);margin-top:4px">Mencari driver...</div><div id="nearbyDriversList" style="margin-top:8px"></div><button id="btnRefreshDrivers" style="margin-top:8px;width:100%;background:var(--card);border:1px solid var(--border);padding:8px;border-radius:8px;font-size:11px">Refresh Driver</button></div><div style="margin-top:16px;display:flex;flex-direction:column;gap:8px"><button id="btnCheckoutBroadcast" onclick="window._checkoutFood()" style="background:#16a34a;color:white;border:none;padding:12px;border-radius:10px;font-weight:800">Broadcast ke Semua Driver</button><div style="font-size:10px;color:var(--muted);text-align:center">Total: Rp '+Number(totals.total||0).toLocaleString()+' ('+(totals.count||0)+' item)</div></div></div>';
}

window._checkoutFoodDirect=async function(driverId){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw); if(!state.items||!state.items.length) return alert('Keranjang kosong');
    if(!state.pickup||!state.pickup.lat){
      if(state.storeId){
        try{ var sRes=await supabase.from('stores').select('lat,lng,latitude,longitude,name,alamat_text').eq('id',state.storeId).single(); var s=sRes.data; if(s){ var sl=s.lat||s.latitude; var sn=s.lng||s.longitude; if(sl&&sn){ state.pickup={lat:Number(sl),lng:Number(sn),text:s.name}; localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); } } }catch(e){}
      }
      if(!state.pickup||!state.pickup.lat) return alert('Lokasi warung belum ada. Edit warung dulu');
    }
    if(!state.dest||!state.dest.lat||!state.dest.lng){ return alert('Koordinat tujuan belum ada. Klik Pakai Lokasi Saya'); }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup&&state.dest){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; try{ var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; } }catch(e){}
    var payload={ store_id:state.storeId, customer_id:customerId, driver_id:driverId, items:state.items, subtotal:subtotal, delivery_fee:delivery_fee, total:total, distance_km:parseFloat(Number(distance_km).toFixed(2)), dest_text:state.dest.text, dest_lat:state.dest.lat, dest_lng:state.dest.lng, pickup_lat:state.pickup.lat, pickup_lng:state.pickup.lng, pickup_text:state.pickup.text||'', status:'driver_assigned' };
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={ store_id:payload.store_id, customer_id:payload.customer_id, driver_id:driverId, items:payload.items, total:payload.total, dest_text:payload.dest_text, dest_lat:payload.dest_lat, dest_lng:payload.dest_lng, pickup_lat:payload.pickup_lat, pickup_lng:payload.pickup_lng, status:'driver_assigned' }; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
    localStorage.setItem('active_food_order_id',od.id);
    try{ window._updateCartBadge(); }catch(e){}
    // FIX: langsung buka modal tracking, jangan redirect ke halaman food
    if(window.trackingFood&&window.trackingFood.openFoodTrackingDetailModal){
      window.trackingFood.openFoodTrackingDetailModal(od.id);
      window.trackingFood.startFoodTracking(od.id);
    } else if(window.openFoodTrackingDetailModal){
      window.openFoodTrackingDetailModal(od.id);
    } else {
      alert('Order dibuat! ID: '+od.id.slice(0,6).toUpperCase());
    }
  }catch(e){ alert('Gagal: '+e.message); console.error(e); }
};

window._checkoutFood=async function(){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong');
    var state=JSON.parse(raw); if(!state.items||!state.items.length) return alert('Keranjang kosong');
    if(!state.dest||!state.dest.lat||!state.dest.lng){ alert('Pilih lokasi antar di peta dulu'); return; }
    var destText=document.getElementById('destText')?document.getElementById('destText').value.trim():state.dest.text||'';
    if(destText.length<5){ alert('Alamat harus lengkap'); return; }
    state.dest.text=destText; localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state));
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=true; btn.textContent='Membuat pesanan...'; }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup&&state.pickup.lat&&state.dest&&state.dest.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?8000:Math.max(5000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; try{ var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; } }catch(e){}
    var payload={ store_id:state.storeId, customer_id:customerId, items:state.items, subtotal:subtotal, delivery_fee:delivery_fee, total:total, distance_km:parseFloat(Number(distance_km).toFixed(2)), dest_text:destText, dest_lat:state.dest.lat, dest_lng:state.dest.lng, pickup_lat:state.pickup.lat, pickup_lng:state.pickup.lng, pickup_text:state.pickup.text||'', status:'searching_driver' };
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={ store_id:payload.store_id, customer_id:payload.customer_id, items:payload.items, total:payload.total, dest_text:payload.dest_text, dest_lat:payload.dest_lat, dest_lng:payload.dest_lng, pickup_lat:payload.pickup_lat, pickup_lng:payload.pickup_lng, status:'searching_driver' }; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
    localStorage.setItem('active_food_order_id',od.id);
    try{ window._updateCartBadge(); }catch(e){}
    if(window.trackingFood&&window.trackingFood.openFoodTrackingDetailModal){
      window.trackingFood.openFoodTrackingDetailModal(od.id);
      window.trackingFood.startFoodTracking(od.id);
    } else if(window.openFoodTrackingDetailModal){
      window.openFoodTrackingDetailModal(od.id);
    } else {
      alert('Order broadcast dibuat! ID: '+od.id.slice(0,6).toUpperCase());
    }
  }catch(e){ alert('Checkout gagal: '+e.message); var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=false; btn.textContent='Broadcast ke Semua Driver'; } }
};

export async function viewMyStore(){ return '<div class="card">Warungku - buka menu</div>'; }
export async function viewStoreProducts(){ return '<div class="card">Kelola Menu</div>'; }
export async function viewStoreOrders(){ return '<div class="card">Order Masuk</div>'; }

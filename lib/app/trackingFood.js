
// trackingFood.js - FINAL - Flow SAMA PERSIS dengan tracking.js Ojol - Timer 5 menit auto batal + auto tutup modal + rating
// Flow: Driver terima dulu baru Warung masak - Sama seperti tracking.js tapi untuk table food_orders
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

// FIX RATING: helper buka rating saat order food selesai - auto tutup modal + kosongkan keranjang + rating driver & warung
// FLOW BARU: Order selesai -> rating driver + rating warung dalam SATU modal -> skip atau kirim -> auto tutup tracking + auto refresh keranjang
async function openRatingForCompletedFoodOrder(order){
  try{
    if(!order) return;
    // Cek sudah dirating belum
    try{ if(localStorage.getItem('rated_food_'+order.id)) return; }catch(e){}

    // 1. AUTO TUTUP MODAL TRACKING
    try{
      document.getElementById('foodTrackingDetailModal')?.remove();
      document.getElementById('foodTrackingLockModal')?.remove();
      document.getElementById('foodActiveTracking')?.remove();
      hideFoodTrackingUI();
    }catch(e){}

    // 2. AUTO REFRESH KERANJANG - kosongkan
    try{
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
      localStorage.removeItem('active_food_order_id');
      localStorage.removeItem('food_auto_start_'+order.id);
      localStorage.removeItem('last_food_driver_id');
      localStorage.removeItem('last_food_driver_name');
      if(window._updateCartBadge) window._updateCartBadge();
      var badge=document.getElementById('cartBadge'); if(badge) badge.textContent='0';
      // Hapus channel realtime
      if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
      if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
      if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
      foodCurrentOrderId=null;
    }catch(e){}

    if(!order.driver_id){
      setTimeout(function(){ alert('Pesanan selesai! Terima kasih sudah order'); }, 400);
      return;
    }

    var driver = await fetchDriverProfileFood(order.driver_id);
    
    // 3. TAMPILKAN SATU MODAL GABUNGAN: rating driver + warung
    setTimeout(function(){ showCombinedRatingModal(order, driver); }, 600);

  }catch(e){ console.error('openRatingForCompletedFoodOrder error', e); }
}

function showCombinedRatingModal(order, driver){
  try{ document.getElementById('foodRatingModal')?.remove(); }catch(e){}
  var theme=getAppTheme();
  var div=document.createElement('div');
  div.id='foodRatingModal';
  div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.88);backdrop-filter:blur(10px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
  var driverName=driver?driver.name:'Driver';
  var storeName=order.pickup_text||'Warung';
  var itemsText=''; try{ itemsText=(order.items||[]).map(function(i){ return i.name+' x'+i.qty; }).join(', '); }catch(e){}
  
  div.innerHTML='<div style="background:white;border-radius:20px;max-width:400px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);border:2px solid '+theme.primary+';max-height:92vh;overflow:auto">'+
    '<div style="background:'+theme.primary+';color:white;padding:18px;text-align:center">'+
      '<div style="font-size:36px">⭐</div>'+
      '<div style="font-weight:800;font-size:16px;margin-top:6px">Pesanan Selesai!</div>'+
      '<div style="font-size:11px;opacity:0.9;margin-top:2px">#'+order.id.slice(0,6).toUpperCase()+' - Terima kasih</div>'+
    '</div>'+
    '<div style="padding:18px">'+
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:14px;font-size:12px">'+
        '<div style="font-weight:700">Warung: '+storeName+'</div>'+
        '<div style="font-size:11px;color:#64748b;margin-top:2px">'+itemsText+'</div>'+
        '<div style="font-size:11px;margin-top:4px;font-weight:700">Total Rp '+Number(order.total||0).toLocaleString()+'</div>'+
      '</div>'+
      '<div style="margin-bottom:14px">'+
        '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Rating Driver - '+driverName+'</div>'+
        '<div id="dStars" style="display:flex;gap:4px;justify-content:center;margin:6px 0">'+
          '<button data-d="1" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-d="2" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-d="3" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-d="4" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-d="5" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
        '</div>'+
        '<div id="dLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang untuk rating driver</div>'+
      '</div>'+
      '<div style="margin-bottom:14px">'+
        '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Rating Warung</div>'+
        '<div id="wStars" style="display:flex;gap:4px;justify-content:center;margin:6px 0">'+
          '<button data-w="1" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-w="2" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-w="3" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-w="4" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
          '<button data-w="5" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3;transition:0.2s">⭐</button>'+
        '</div>'+
        '<div id="wLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang untuk rating warung</div>'+
      '</div>'+
      '<textarea id="rateNote" placeholder="Komentar (opsional)" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:8px;font-size:12px;height:50px;resize:none;margin-bottom:12px"></textarea>'+
      '<div style="display:flex;gap:8px">'+
        '<button id="btnSendRate" style="flex:1;background:'+theme.primary+';color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">Kirim Rating</button>'+
        '<button id="btnSkipRate" style="flex:1;background:#f1f5f9;border:1px solid #e2e8f0;padding:12px;border-radius:10px;font-weight:700;font-size:12px;color:#64748b">Lewati</button>'+
      '</div>'+
      '<div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:8px">Bisa skip jika tidak ingin rating</div>'+
    '</div></div>';

  document.body.appendChild(div);

  var dRate=0; var wRate=0;
  var dStars=div.querySelectorAll('[data-d]');
  var wStars=div.querySelectorAll('[data-w]');
  var dLabel=div.querySelector('#dLabel');
  var wLabel=div.querySelector('#wLabel');
  var labels={1:'Buruk',2:'Kurang',3:'Cukup',4:'Baik',5:'Luar Biasa'};

  dStars.forEach(function(b){
    b.addEventListener('click', function(){
      dRate=parseInt(b.getAttribute('data-d'));
      dStars.forEach(function(x,i){ x.style.opacity=i<dRate?'1':'0.3'; x.style.transform=i<dRate?'scale(1.1)':'scale(1)'; });
      dLabel.textContent=labels[dRate]+' untuk driver';
      dLabel.style.color='#16a34a';
    });
  });
  wStars.forEach(function(b){
    b.addEventListener('click', function(){
      wRate=parseInt(b.getAttribute('data-w'));
      wStars.forEach(function(x,i){ x.style.opacity=i<wRate?'1':'0.3'; x.style.transform=i<wRate?'scale(1.1)':'scale(1)'; });
      wLabel.textContent=labels[wRate]+' untuk warung';
      wLabel.style.color='#16a34a';
    });
  });

  // AUTO TUTUP MODAL RATING + AUTO TUTUP TRACKING + AUTO REFRESH KERANJANG saat Skip
  div.querySelector('#btnSkipRate').onclick=function(){
    try{ localStorage.setItem('rated_food_'+order.id,'1'); }catch(e){}
    // Tutup rating modal
    div.remove();
    // Pastikan tracking modal juga tutup
    try{
      document.getElementById('foodTrackingDetailModal')?.remove();
      document.getElementById('foodTrackingLockModal')?.remove();
      document.getElementById('foodActiveTracking')?.remove();
    }catch(e){}
    // Refresh keranjang badge
    try{ if(window._updateCartBadge) window._updateCartBadge(); }catch(e){}
    // Dispatch event selesai
    try{ document.dispatchEvent(new CustomEvent('food_order_completed', {detail:{orderId:order.id}})); }catch(e){}
    console.log('Rating dilewati, flow selesai');
  };

  // KIRIM RATING: rating driver + warung, lalu auto tutup semua
  div.querySelector('#btnSendRate').onclick=async function(){
    if(dRate===0 && wRate===0){ alert('Pilih bintang dulu untuk driver atau warung, atau klik Lewati'); return; }
    var btn=div.querySelector('#btnSendRate');
    btn.textContent='Mengirim...';
    btn.disabled=true;
    try{
      // Rating Driver -> tabel ratings
      if(dRate>0 && order.driver_id){
        try{
          var uRes=await supabase.auth.getUser(); var u=uRes.data?uRes.data.user:null; var passengerId=null;
          if(u){ var pRes=await supabase.from('users').select('id').eq('google_id',u.id).maybeSingle(); if(pRes.data) passengerId=pRes.data.id; }
          await supabase.from('ratings').insert({ driver_id:order.driver_id, rating:dRate, order_id:order.id, passenger_id:passengerId, comment:div.querySelector('#rateNote').value||'', created_at:new Date().toISOString() });
          console.log('Rating driver saved', dRate);
        }catch(e){
          console.warn('ratings insert fail, try minimal', e.message);
          try{ await supabase.from('ratings').insert({ driver_id:order.driver_id, rating:dRate }); }catch(e2){
            try{ var local=JSON.parse(localStorage.getItem('local_ratings')||'[]'); local.push({driver_id:order.driver_id, rating:dRate, order_id:order.id, at:Date.now()}); localStorage.setItem('local_ratings', JSON.stringify(local)); }catch(e3){}
          }
        }
      }
      // Rating Warung -> tabel store_ratings
      if(wRate>0 && order.store_id){
        try{
          var uRes2=await supabase.auth.getUser(); var u2=uRes2.data?uRes2.data.user:null; var custId=null;
          if(u2){ var pRes2=await supabase.from('users').select('id').eq('google_id',u2.id).maybeSingle(); if(pRes2.data) custId=pRes2.data.id; }
          await supabase.from('store_ratings').insert({ store_id:order.store_id, rating:wRate, food_order_id:order.id, customer_id:custId, comment:div.querySelector('#rateNote').value||'' });
          console.log('Rating warung saved', wRate);
        }catch(e){
          console.warn('store_ratings insert fail, try minimal', e.message);
          try{ await supabase.from('store_ratings').insert({ store_id:order.store_id, rating:wRate, food_order_id:order.id }); }catch(e2){
            try{ var slocal=JSON.parse(localStorage.getItem('local_store_ratings')||'[]'); slocal.push({store_id:order.store_id, rating:wRate, order_id:order.id, at:Date.now()}); localStorage.setItem('local_store_ratings', JSON.stringify(slocal)); }catch(e3){}
          }
        }
      }
      localStorage.setItem('rated_food_'+order.id,'1');
      try{ document.dispatchEvent(new CustomEvent('rating:completed', {detail:{orderId:order.id}})); }catch(e){}
      try{ document.dispatchEvent(new CustomEvent('food_order_completed', {detail:{orderId:order.id}})); }catch(e){}

      // AUTO TUTUP MODAL RATING
      div.remove();
      // AUTO TUTUP MODAL TRACKING
      try{
        document.getElementById('foodTrackingDetailModal')?.remove();
        document.getElementById('foodTrackingLockModal')?.remove();
        document.getElementById('foodActiveTracking')?.remove();
      }catch(e){}
      // AUTO REFRESH KERANJANG
      try{
        localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
        if(window._updateCartBadge) window._updateCartBadge();
        var badge=document.getElementById('cartBadge'); if(badge) badge.textContent='0';
      }catch(e){}

      alert('Terima kasih ratingnya! Pesanan selesai');
      console.log('Flow selesai: rating terkirim, modal tutup, keranjang kosong');

    }catch(e){
      console.error('Rating fail', e);
      try{ localStorage.setItem('rated_food_'+order.id,'1'); }catch(e2){}
      div.remove();
      try{
        document.getElementById('foodTrackingDetailModal')?.remove();
        document.getElementById('foodTrackingLockModal')?.remove();
      }catch(e2){}
      alert('Rating disimpan');
    }
  };
}


let foodOrderChannel = null;
let foodDriverLocChannel = null;
let foodTrackingInterval = null;
let foodOrderPollInterval = null;
let foodAutoTimer = null;
let foodCurrentOrderId = null;
let foodSearchStart = null;
let foodSearchSeconds = 0;
let foodLastKnownDriverId = null;
let foodLastDriverLoc = null;
let foodNoDriverTimer = null;
const FOOD_TIMEOUT = 5*60; // 5 menit sama kayak Ojol tracking.js

async function fetchDriverProfileFood(driverId){
  try{
    const { data } = await supabase.from('users').select('id,name,hp,jenis_kendaraan,nopol').eq('id', driverId).maybeSingle();
    return data;
  }catch(e){ return null; }
}

export function showFoodTrackingLockModal(order){
  let modal = document.getElementById('foodTrackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'foodTrackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const mapStatus = {
    searching_driver: 'Mencari Driver...',
    driver_assigned: 'Menunggu Konfirmasi Driver',
    accepted: 'Driver Terima',
    preparing: 'Warung Masak',
    ready: 'Makanan Siap',
    picked: 'Driver OTW',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  };
  const statusText = mapStatus[order.status]||order.status;
  div.innerHTML = `
    <div style="background:var(--card);border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🍔</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Pesanan Makanan Aktif</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px">
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;color:var(--text)">
          <div>🏪 ${order.pickup_text||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:var(--muted)">#${order.id.slice(0,6).toUpperCase()}</span></div>
          <div style="margin-top:6px;font-size:11px" class="muted">Total Rp ${Number(order.total||0).toLocaleString()} • ${(order.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
          <div id="foodAutoTimerText" style="margin-top:8px;font-size:11px;color:#ef4444;font-weight:700"></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoFoodTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Makanan</button>
          <button id="btnCancelFoodFromLock" style="background:var(--card);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Pesanan</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoFoodTracking')?.addEventListener('click', ()=>{ div.remove(); if(order.id) openFoodTrackingDetailModal(order.id); });
  document.getElementById('btnCancelFoodFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan?')) return;
    try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
    clearFoodTracking(); hideFoodTrackingUI(); div.remove();
  });
}
export function hideFoodTrackingLockModal(){ const m=document.getElementById('foodTrackingLockModal'); if(m) m.remove(); }
export function hideFoodTrackingUI(){ const el=document.getElementById('foodActiveTracking'); if(el) el.style.display='none'; }
export function renderFoodActiveOrder(order, driver){}

export function startFoodTracking(orderId){
  if(!orderId) return;
  try{
    localStorage.removeItem('last_food_driver_id');
    localStorage.removeItem('last_food_driver_name');
    localStorage.setItem('food_auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  foodLastKnownDriverId = null;
  foodSearchStart = Date.now();
  foodSearchSeconds = 0;
  localStorage.setItem('active_food_order_id', orderId);
  foodCurrentOrderId = orderId;
  loadFoodActiveTracking();
}

export function clearFoodTracking(){
  if(foodOrderPollInterval){ clearInterval(foodOrderPollInterval); foodOrderPollInterval=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
  // Auto kosongkan keranjang setelah selesai/batal - fix bug keranjang tidak kosong
  try{
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
    localStorage.removeItem('active_food_order_id');
    localStorage.removeItem('food_auto_start_'+(foodCurrentOrderId||''));
    sessionStorage.removeItem('food_accept_alert_'+(foodCurrentOrderId||''));
    // Clear badge cart
    if(window._updateCartBadge) try{ window._updateCartBadge(); }catch(e){}
  }catch(e){}
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
  foodSearchStart=null; foodSearchSeconds=0; foodLastKnownDriverId=null;
  const orderId = localStorage.getItem('active_food_order_id') || foodCurrentOrderId;
  localStorage.removeItem('active_food_order_id'); localStorage.removeItem('food_pickup_lat'); localStorage.removeItem('food_pickup_lng');
  try{
    localStorage.removeItem('last_food_driver_id');
    localStorage.removeItem('last_food_driver_name');
    if(orderId){
      localStorage.removeItem('food_auto_start_'+orderId);
      localStorage.removeItem('food_auto_queue_'+orderId);
      localStorage.removeItem('food_auto_index_'+orderId);
    }
  }catch(e){}
  foodCurrentOrderId=null;
  hideFoodTrackingUI();
}

export async function loadFoodActiveTracking(){
  const orderId = localStorage.getItem('active_food_order_id') || foodCurrentOrderId;
  if(!orderId) return;
  foodCurrentOrderId = orderId;
  try{
    const { data: order, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(error || !order){ clearFoodTracking(); return; }
    if(['completed','cancelled'].includes(order.status)){
      if(order.status==='completed'){ openRatingForCompletedFoodOrder(order); return; }
      clearFoodTracking(); return;
    }
    try{
      if(order.pickup_lat) localStorage.setItem('food_pickup_lat', order.pickup_lat);
      if(order.pickup_lng) localStorage.setItem('food_pickup_lng', order.pickup_lng);
    }catch(e){}
    // render active order jika ada UI
    if(order.driver_id){
      foodLastKnownDriverId = order.driver_id;
      try{ localStorage.setItem('last_food_driver_id', order.driver_id); }catch(e){}
      const driver = await fetchDriverProfileFood(order.driver_id);
      if(driver){ try{ localStorage.setItem('last_food_driver_name', driver.name||'Driver'); }catch(e){} }
      renderFoodActiveOrder(order, driver);
      subscribeFoodDriverLocation(order.driver_id);
      startFoodDistanceUpdater(order);
    } else {
      renderFoodActiveOrder(order, null);
    }
    subscribeFoodOrder(orderId);
    if(['searching_driver','driver_assigned'].includes(order.status)){
      startFoodUnifiedTimer(orderId);
    }
  }catch(e){ console.error('loadFoodActiveTracking error', e); }
}

export async function openFoodTrackingDetailModal(orderId){
  if(!orderId) return;
  try{
    const { data: order, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(error || !order) return alert('Order tidak ditemukan');
    let modal=document.getElementById('foodTrackingDetailModal');
    if(modal) modal.remove();
    const theme=getAppTheme();
    const div=document.createElement('div');
    div.id='foodTrackingDetailModal';
    div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0';
    const statusMap={
      searching_driver: 'Mencari Driver...',
      driver_assigned: 'Menunggu Konfirmasi Driver',
      accepted: 'Driver Terima - Menunggu Warung',
      preparing: 'Warung Masak',
      ready: 'Makanan Siap',
      picked: 'Driver OTW',
      completed: 'Selesai',
      cancelled: 'Dibatalkan'
    };
    const statusText=statusMap[order.status]||order.status;
    div.innerHTML=`
      <div style="background:var(--card);width:100%;max-width:520px;max-height:90vh;border-radius:24px 24px 0 0;overflow:auto;box-shadow:0 -4px 24px rgba(0,0,0,0.3)">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:2;border-radius:24px 24px 0 0">
          <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:16px">🍔 Tracking Makanan</h3><button onclick="document.getElementById('foodTrackingDetailModal').remove()" class="btn secondary" style="width:36px;height:36px;border-radius:50%;padding:0">✕</button></div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><span id="foodDetailStatus" style="background:${theme.primary};color:white;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800">${statusText.toUpperCase()}</span><span style="font-size:11px;color:var(--muted)">#${order.id.slice(0,6).toUpperCase()}</span><span id="singleSearchTimer" style="background:var(--card2);border:1px solid var(--border);padding:4px 10px;border-radius:20px;font-size:11px">00:00</span><span id="singleTimeout" style="background:#fef3c7;border:1px solid #fcd34d;padding:4px 10px;border-radius:20px;font-size:11px">05:00</span></div>
        </div>
        <div style="padding:16px">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-size:12px">🏪 ${order.pickup_text||''}</div>
            <div style="font-size:12px;margin-top:4px">🎯 ${order.dest_text||''}</div>
            <div style="margin-top:8px;font-size:11px" class="muted">Total Rp ${Number(order.total||0).toLocaleString()} • ${(order.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><span style="font-size:11px">📏 <span id="foodDetailToWarung">-</span> ke warung</span><span style="font-size:11px">•</span><span style="font-size:11px">📏 <span id="foodDetailToCust">-</span> ke kamu</span></div>
            <div id="foodDetailDistance" style="margin-top:8px;font-size:11px;font-weight:700;color:${theme.primary}">Mencari driver...</div>
          </div>
          <div id="foodDetailActions" style="margin-top:12px"></div>
          <div style="margin-top:12px;display:flex;gap:8px"><button id="btnCancelFoodDetail" style="flex:1;background:var(--card);border:1px solid var(--border);color:#ef4444;padding:12px;border-radius:12px;font-weight:700">❌ Batalkan</button><button id="btnCompleteFoodDetail" style="flex:1;background:#0ea5e9;color:white;border:none;padding:12px;border-radius:12px;font-weight:700;display:none">✅ Selesai</button></div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    function renderDetailActions(o){
      const box=document.getElementById('foodDetailActions');
      if(!box) return;
      if(o.status==='searching_driver'){
        box.innerHTML=`<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:11px;color:#92400e">🔍 Broadcast ke semua driver... Menunggu driver terdekat terima order.<br><small>Timer 5 menit auto batal jika tidak ada respon.</small></div>`;
      } else if(o.status==='driver_assigned'){
        box.innerHTML=`<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:10px;font-size:11px;color:#854d0e">⏳ Driver dipilih, menunggu konfirmasi driver...<br><small>Driver belum klik Terima di aplikasi driver. Jika menolak, order kembali mencari.</small></div>`;
      } else if(o.status==='accepted'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">✅ Driver sudah terima! Menunggu warung konfirmasi & masak 🍳</div>`;
      } else if(o.status==='preparing'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍳 Warung sedang masak pesanan kamu...</div>`;
      } else if(o.status==='ready'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍱 Makanan siap! Driver akan ambil di warung</div>`;
      } else if(o.status==='picked'){
        box.innerHTML=`<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:10px;padding:10px;font-size:11px;color:#1e40af">🚚 Driver OTW antar ke kamu - Siapkan uang pas</div>`;
        const btnC=document.getElementById('btnCompleteFoodDetail'); if(btnC) btnC.style.display='block';
      }
    }
    renderDetailActions(order);
    document.getElementById('btnCancelFoodDetail')?.addEventListener('click', async ()=>{
      if(!confirm('Batalkan pesanan?')) return;
      try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', orderId); }catch(e){}
      clearFoodTracking(); div.remove();
    });
    document.getElementById('btnCompleteFoodDetail')?.addEventListener('click', async ()=>{
      if(!confirm('Selesaikan pesanan?')) return;
      try{ await supabase.from('food_orders').update({status:'completed'}).eq('id', orderId); }catch(e){}
      clearFoodTracking(); div.remove(); alert('✅ Selesai');
    });
    if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
    foodOrderChannel = supabase.channel('food-detail-'+orderId)
      .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, payload=>{
        const o=payload.new; if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(['completed','cancelled','rejected'].includes(o.status)){
          const isComp=o.status==='completed';
          const compData=isComp?{...o}:null;
          const reason=o.cancel_reason||'';
          setTimeout(()=>{ 
            div.remove(); clearFoodTracking();
            if(o.status==='cancelled' && reason.toLowerCase().includes('tolak')){
              alert('❌ Driver menolak order. Silakan order lagi.');
            } else if(o.status==='cancelled'){
              alert('❌ Pesanan dibatalkan');
            }
            if(isComp && compData){ openRatingForCompletedFoodOrder(compData); }
          }, 800);
          return;
        }
      }).subscribe();
    if(foodTrackingInterval) clearInterval(foodTrackingInterval);
    foodTrackingInterval=setInterval(async ()=>{
      try{
        const { data: o } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
        if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(o.driver_id && o.pickup_lat){
          const { data: loc } = await supabase.from('driver_locations').select('lat,lng').eq('driver_id', o.driver_id).maybeSingle();
          if(loc?.lat){
            const toWarung=haversineKm(loc.lat, loc.lng, o.pickup_lat, o.pickup_lng);
            const toCust=o.dest_lat?haversineKm(loc.lat, loc.lng, o.dest_lat, o.dest_lng):0;
            const elW=document.getElementById('foodDetailToWarung'); if(elW) elW.textContent=toWarung.toFixed(2)+' km';
            const elC=document.getElementById('foodDetailToCust'); if(elC) elC.textContent=toCust.toFixed(2)+' km';
            const elD=document.getElementById('foodDetailDistance');
            if(elD){
              if(['driver_assigned','accepted','preparing','ready'].includes(o.status)) elD.textContent=`Driver ${toWarung.toFixed(2)} km dari warung`;
              else if(o.status==='picked') elD.textContent=`Driver ${toCust.toFixed(2)} km dari kamu`;
            }
          }
        }
                if(['completed','cancelled'].includes(o.status)){            clearInterval(foodTrackingInterval); foodTrackingInterval=null;           if(o.status==='completed'){ div.remove(); openRatingForCompletedFoodOrder(o); return; }         }
      }catch(e){}
    }, 4000);
    if(['searching_driver','driver_assigned'].includes(order.status)) startFoodUnifiedTimer(orderId);
  }catch(e){ console.error('openFoodTrackingDetailModal fail', e); alert('Gagal buka tracking: '+e.message); }
}

function subscribeFoodOrder(orderId){
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  foodOrderChannel = supabase.channel('food-order-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, async payload=>{
      const o=payload.new; if(!o) return;
      if(['completed','cancelled','rejected'].includes(o.status)){
        const isComp = o.status==='completed';
        const compData = isComp ? {...o} : null;
        // Simpan data untuk rating sebelum clear
        const cancelReason = o.cancel_reason || o.status || '';
        // Fix: tutup modal dulu sebelum clear
        try{
          const detailModal=document.getElementById('foodTrackingDetailModal'); if(detailModal) detailModal.remove();
          const lockModal=document.getElementById('foodTrackingLockModal'); if(lockModal) lockModal.remove();
        }catch(e){}
        clearFoodTracking(); hideFoodTrackingUI();
        if(o.status==='cancelled'){
          if(cancelReason.toLowerCase().includes('tolak') || o.status==='cancelled'){
            alert('❌ Driver menolak order kamu. Silakan buat order baru dengan driver lain.');
          } else {
            alert('❌ Pesanan makanan dibatalkan');
          }
        }
        if(isComp && compData){ console.log('✅ Food completed, buka rating & kosongkan keranjang'); openRatingForCompletedFoodOrder(compData); }
        return;
      }
      handleFoodOrderRejection(o);
    }).subscribe();
  // Polling backup 4 detik - sama kayak tracking.js
  if(foodOrderPollInterval) clearInterval(foodOrderPollInterval);
  foodOrderPollInterval = setInterval(async ()=>{
    try{
      const { data: o, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
      if(error || !o) return;
      if(['completed','cancelled','rejected'].includes(o.status)){
        const isComp = o.status==='completed';
        const compData = isComp ? {...o} : null;
        const cancelReason = o.cancel_reason || o.status || '';
        try{
          const detailModal=document.getElementById('foodTrackingDetailModal'); if(detailModal) detailModal.remove();
          const lockModal=document.getElementById('foodTrackingLockModal'); if(lockModal) lockModal.remove();
        }catch(e){}
        clearInterval(foodOrderPollInterval); foodOrderPollInterval=null;
        clearFoodTracking(); hideFoodTrackingUI();
        if(o.status==='cancelled'){
          try{ alert('❌ Driver menolak order kamu. Silakan buat order baru.'); }catch(e){}
        }
        if(isComp && compData){ openRatingForCompletedFoodOrder(compData); }
        return;
      }
      handleFoodOrderRejection(o);
    }catch(e){}
  }, 4000);
}

function handleFoodOrderRejection(newOrder){
  // Flow sama kayak tracking.js ojol handleOrderRejection
  if(newOrder.driver_id){
    // Driver ada - driver terima order
    if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
    if(foodAutoTimer){ /* jangan stop timer, biar tetap jalan sampai picked */ }
    foodLastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_food_driver_id', newOrder.driver_id); }catch(e){}
    fetchDriverProfileFood(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_food_driver_name', driver?.name||'Driver'); }catch(e){}
      // Update lock modal jika ada
      const lockStatus=document.querySelector('#foodTrackingLockModal span');
      // Render active & subscribe lokasi
      renderFoodActiveOrder(newOrder, driver);
      subscribeFoodDriverLocation(newOrder.driver_id);
      startFoodDistanceUpdater(newOrder);
      // Jika modal detail terbuka, update status text
      const sEl=document.getElementById('foodDetailStatus');
      if(sEl){
        const map={searching_driver:'Mencari Driver...',driver_assigned:'Menunggu Konfirmasi Driver',accepted:'Driver Terima',preparing:'Warung Masak',ready:'Makanan Siap',picked:'Driver OTW',completed:'Selesai',cancelled:'Dibatalkan'};
        sEl.textContent=map[newOrder.status]||newOrder.status;
      }
      // Alert konfirmasi untuk pembeli (sekali saja saat accepted)
      if(newOrder.status==='accepted'){
        try{
          const key='food_accept_alert_'+newOrder.id;
          if(!sessionStorage.getItem(key)){
            sessionStorage.setItem(key,'1');
            setTimeout(()=> alert('✅ Driver '+ (driver?.name||'') +' menerima pesanan kamu! Driver sedang menuju warung.'), 500);
          }
        }catch(e){}
      }
    });
  } else {
    // driver_id hilang - driver menolak atau belum ada driver
    if(foodLastKnownDriverId && (newOrder.status==='searching_driver' || newOrder.status==='cancelled')){
      // Ini flow tolak seperti ojol: driver yang sebelumnya assigned menolak
      console.log('[food] driver menolak, last:', foodLastKnownDriverId);
      if(newOrder.status==='searching_driver'){
        // Jika masih searching, batalkan otomatis seperti ojol biar pembeli dapat info penolakan & modal auto tutup
        (async ()=>{
          try{
            await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', newOrder.id);
          }catch(e){}
        })();
        return;
      }
    }
    renderFoodActiveOrder(newOrder, null);
  }
}

function startFoodUnifiedTimer(orderId){
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  foodSearchStart = Date.now();
  foodSearchSeconds = 0;
  try{
    const saved = localStorage.getItem('food_auto_start_'+orderId);
    if(saved){
      const parsed = parseInt(saved);
      if(!isNaN(parsed)){
        foodSearchStart = parsed;
        foodSearchSeconds = Math.floor((Date.now()-parsed)/1000);
      }
    } else {
      localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString());
    }
  }catch(e){
    try{ localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString()); }catch(e2){}
  }
  foodAutoTimer = setInterval(async ()=>{
    const elapsed = Math.floor((Date.now()-foodSearchStart)/1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(Math.floor(elapsed%60)).padStart(2,'0');
    const remain = Math.max(0, FOOD_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');
    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const t3 = document.getElementById('singleTimeout2');
    const tAuto = document.getElementById('foodAutoTimerText');
    if(t1) t1.textContent = `${m}:${s}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    if(t3) t3.textContent = `${rm}:${rs}`;
    if(tAuto) tAuto.textContent = remain>0 ? `Auto batal dalam ${rm}:${rs}` : 'Membatalkan...';
    if(elapsed >= FOOD_TIMEOUT){
      clearInterval(foodAutoTimer); foodAutoTimer=null;
      try{
        const { data: cur } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
        if(cur && ['searching_driver','driver_assigned'].includes(cur.status)){
          await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId);
        }
      }catch(e){ console.warn('cancel food timeout fail', e.message); }
      try{
        localStorage.removeItem('food_auto_start_'+orderId);
        localStorage.removeItem('last_food_driver_id');
        localStorage.removeItem('last_food_driver_name');
      }catch(e){}
      alert('⏰ 5 menit tidak ada respon driver. Order makanan dibatalkan otomatis.');
      clearFoodTracking();
      hideFoodTrackingUI();
    }
  },1000);
}

function subscribeFoodDriverLocation(driverId){
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  foodDriverLocChannel = supabase.channel('food-driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateFoodDriverDistance(payload.new); })
    .subscribe();
}
function updateFoodDriverDistance(driverLoc){
  if(!driverLoc) return; foodLastDriverLoc = driverLoc;
  const pickupLat = parseFloat(localStorage.getItem('food_pickup_lat')); const pickupLng = parseFloat(localStorage.getItem('food_pickup_lng'));
  let dLat,dLng; if(driverLoc.lat&&driverLoc.lng){ dLat=driverLoc.lat; dLng=driverLoc.lng; } else if(driverLoc.lokasi){ const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }
  const el = document.getElementById('foodDetailDistance');
  if(!dLat||!pickupLat){ if(el) el.textContent = `📍 Driver online`; return; }
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  if(el){ el.textContent = dist<0.1? `🎉 Driver dekat! ${dist.toFixed(2)} km` : `📍 Driver ${dist.toFixed(2)} km dari warung`; }
}
function startFoodDistanceUpdater(order){
  if(foodTrackingInterval) clearInterval(foodTrackingInterval);
  foodTrackingInterval = setInterval(async ()=>{
    if(!order.driver_id) return;
    try{ const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single(); if(data) updateFoodDriverDistance(data); }catch(e){}
  },5000);
}

if(typeof window !== 'undefined'){
  window.trackingFood = {
    startFoodTracking,
    clearFoodTracking,
    openFoodTrackingDetailModal,
    showFoodTrackingLockModal,
    loadFoodActiveTracking
  };
  window.startFoodTracking = startFoodTracking;
  window.clearFoodTracking = clearFoodTracking;
  window.openFoodTrackingDetailModal = openFoodTrackingDetailModal;
  window.openRatingForCompletedFoodOrder = openRatingForCompletedFoodOrder;
  window.showFoodTrackingLockModal = showFoodTrackingLockModal;
}

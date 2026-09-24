
// trackingFood.js - V7 FINAL MOBILE FIX - TANPA UBAH TAMPILAN MODAL
// Timer: hanya saat searching_driver/driver_assigned, kalau progress jalan timer mati
// Redirect: semua tombol batalkan/selesai/rating/popup -> halaman food (#/store)

import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';

let foodOrderChannel = null;
let foodTrackingInterval = null;
let foodAutoTimer = null;
let foodNoDriverTimer = null;
let foodDriverLocChannel = null;
let foodSearchStart = Date.now();
let foodSearchSeconds = 0;
let foodCurrentOrderId = null;
let foodLastKnownDriverId = null;
let foodLastDriverLoc = null;
const FOOD_TIMEOUT = 300;

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

// === FIX: REDIRECT + TIMER ===
function redirectToFoodPage(){
  try{
    if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
    if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
    if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
    if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
    if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
    
    ['foodTrackingDetailModal','foodTrackingLockModal','foodActiveTracking','foodRatingModal','foodCancelPopup'].forEach(id=>{
      try{ document.getElementById(id)?.remove(); }catch(e){}
    });
    try{ hideFoodTrackingUI(); }catch(e){}
    try{ clearFoodTracking(); }catch(e){}
    localStorage.removeItem('active_food_order_id');
    if(foodCurrentOrderId) localStorage.removeItem('food_auto_start_'+foodCurrentOrderId);
    localStorage.removeItem('last_food_driver_id');
    localStorage.removeItem('last_food_driver_name');
  }catch(e){}

  // Cara 1: hash - untuk router di app.js
  location.hash = '#/store';
  
  // Cara 2: langsung render halaman food kalau router belum ke-trigger (fallback untuk HP)
  setTimeout(async ()=>{
    try{
      // coba trigger render() global jika ada
      if(typeof window.render === 'function'){
        // render() ada di app.js tapi tidak global, coba panggil via hashchange
        window.dispatchEvent(new Event('hashchange'));
      }
    }catch(e){}
    
    // Fallback paling ampuh: import viewStoreList dan render manual ke #router
    try{
      const routerEl = document.getElementById('router');
      if(routerEl && (location.hash === '#/store' || location.hash === '#/food')){
        const mod = await import('./storeViews.js').catch(async ()=> await import('./app/store/storeViews.js'));
        if(mod && mod.viewStoreList){
          const html = await mod.viewStoreList();
          routerEl.innerHTML = html;
          window.scrollTo(0,0);
        }
      }
    }catch(e){
      // jika import gagal, paksa reload ke #/store
      if(location.hash !== '#/store'){
        window.location.href = window.location.pathname + '#/store';
      }
    }
  }, 80);
  
  setTimeout(()=>{
    if(location.hash !== '#/store'){
      window.location.href = window.location.pathname + '#/store';
    }
  }, 300);
}

function isStillSearching(status){
  return ['searching_driver','driver_assigned'].includes(status);
}
function stopFoodSearchTimer(orderId){
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  try{ if(orderId) localStorage.removeItem('food_auto_start_'+orderId); }catch(e){}
  const el = document.getElementById('foodAutoTimerText');
  if(el) el.textContent = '';
}

function showCancelPopupFood(orderId, reason='dibatalkan'){
  try{ document.getElementById('foodCancelPopup')?.remove(); }catch(e){}
  const theme=getAppTheme();
  const div=document.createElement('div');
  div.id='foodCancelPopup';
  div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML=`
    <div style="background:white;border-radius:20px;max-width:360px;width:100%;padding:20px;text-align:center">
      <div style="font-size:48px">😢</div>
      <div style="font-weight:800;font-size:16px;margin-top:8px">Pesanan Dibatalkan</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">#${orderId.slice(0,6).toUpperCase()} ${reason}</div>
      <button id="btnCloseCancelPopup" type="button" style="margin-top:16px;width:100%;padding:14px;border-radius:12px;border:none;background:${theme.primary};color:white;font-weight:800;font-size:14px">Kembali ke Menu Makanan</button>
    </div>
  `;
  document.body.appendChild(div);
  const btn = document.getElementById('btnCloseCancelPopup');
  const doRedirect = ()=>{
    div.remove();
    redirectToFoodPage();
  };
  btn.addEventListener('click', doRedirect);
  btn.addEventListener('touchend', doRedirect);
  setTimeout(doRedirect, 2500);
}

// ORIGINAL CODE DI BAWAH INI TETAP, HANYA DITAMBAH LOGIC TIMER & REDIRECT
async function openRatingForCompletedFoodOrder(order){
  try{
    if(!order) return;
    try{ if(localStorage.getItem('rated_food_'+order.id)){ redirectToFoodPage(); return; } }catch(e){}
    try{
      document.getElementById('foodTrackingDetailModal')?.remove();
      document.getElementById('foodTrackingLockModal')?.remove();
      document.getElementById('foodActiveTracking')?.remove();
      hideFoodTrackingUI();
    }catch(e){}
    try{
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
      localStorage.removeItem('active_food_order_id');
      localStorage.removeItem('food_auto_start_'+order.id);
      localStorage.removeItem('last_food_driver_id');
      localStorage.removeItem('last_food_driver_name');
      if(window._updateCartBadge) window._updateCartBadge();
      var badge=document.getElementById('cartBadge'); if(badge) badge.textContent='0';
      if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
      if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
      if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
      foodCurrentOrderId=null;
    }catch(e){}
    if(!order.driver_id){
      setTimeout(function(){ alert('Pesanan selesai! Terima kasih sudah order'); redirectToFoodPage(); }, 400);
      return;
    }
    var driver = await fetchDriverProfileFood(order.driver_id);
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
          '<button data-d="1" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-d="2" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-d="3" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-d="4" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-d="5" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
        '</div>'+
        '<div id="dLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang untuk rating driver</div>'+
      '</div>'+
      '<div style="margin-bottom:14px">'+
        '<div style="font-weight:800;font-size:13px;margin-bottom:6px">Rating Warung</div>'+
        '<div id="wStars" style="display:flex;gap:4px;justify-content:center;margin:6px 0">'+
          '<button data-w="1" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-w="2" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-w="3" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-w="4" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
          '<button data-w="5" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>'+
        '</div>'+
        '<div id="wLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang untuk rating warung</div>'+
      '</div>'+
      '<textarea id="rateNote" placeholder="Komentar (opsional)" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:8px;font-size:12px;height:50px;resize:none;margin-bottom:12px"></textarea>'+
      '<div style="display:flex;gap:8px">'+
        '<button id="btnSendRate" type="button" style="flex:1;background:'+theme.primary+';color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">Kirim Rating</button>'+
        '<button id="btnSkipRate" type="button" style="flex:1;background:#f1f5f9;border:1px solid #e2e8f0;padding:12px;border-radius:10px;font-weight:700;font-size:12px;color:#64748b">Lewati</button>'+
      '</div>'+
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
      dStars.forEach(function(x,i){ x.style.opacity=i<dRate?'1':'0.3'; });
      dLabel.textContent=labels[dRate]||'';
    });
  });
  wStars.forEach(function(b){
    b.addEventListener('click', function(){
      wRate=parseInt(b.getAttribute('data-w'));
      wStars.forEach(function(x,i){ x.style.opacity=i<wRate?'1':'0.3'; });
      wLabel.textContent=labels[wRate]||'';
    });
  });

  const doRedirectRating = ()=>{
    div.remove();
    redirectToFoodPage();
  };

  div.querySelector('#btnSkipRate').addEventListener('click', function(){
    try{ localStorage.setItem('rated_food_'+order.id, '1'); }catch(e){}
    doRedirectRating();
  });
  div.querySelector('#btnSkipRate').addEventListener('touchend', function(){
    try{ localStorage.setItem('rated_food_'+order.id, '1'); }catch(e){}
    doRedirectRating();
  });

  div.querySelector('#btnSendRate').addEventListener('click', async function(){
    const comment=document.getElementById('rateNote')?.value||'';
    try{
      if(order.driver_id && dRate){
        await supabase.from('ratings').insert({ order_id:order.id, driver_id:order.driver_id, rating:dRate, comment:comment, type:'food' });
      }
      if(order.store_id && wRate){
        await supabase.from('store_ratings').insert({ order_id:order.id, store_id:order.store_id, rating:wRate, comment:comment });
      }
      const local=JSON.parse(localStorage.getItem('local_ratings')||'[]');
      local.push({ order_id:order.id, driver_id:order.driver_id, rating:dRate, at:Date.now() });
      localStorage.setItem('local_ratings', JSON.stringify(local));
    }catch(e){ console.warn('rating fail', e); }
    try{ localStorage.setItem('rated_food_'+order.id, '1'); }catch(e){}
    div.remove();
    alert('Terima kasih ratingnya! ⭐');
    redirectToFoodPage();
  });
  div.querySelector('#btnSendRate').addEventListener('touchend', async function(){
    const comment=document.getElementById('rateNote')?.value||'';
    try{
      if(order.driver_id && dRate){
        await supabase.from('ratings').insert({ order_id:order.id, driver_id:order.driver_id, rating:dRate, comment:comment, type:'food' });
      }
    }catch(e){}
    try{ localStorage.setItem('rated_food_'+order.id, '1'); }catch(e){}
    div.remove();
    redirectToFoodPage();
  });
}

async function fetchDriverProfileFood(driverId){
  try{
    const { data } = await supabase.from('profiles').select('id,name,phone,photo_url').eq('id', driverId).single();
    return data;
  }catch(e){ return { name:'Driver', id:driverId }; }
}
function hideFoodTrackingUI(){
  try{
    document.getElementById('foodActiveTracking')?.remove();
    document.getElementById('foodTrackingDetailModal')?.remove();
    document.getElementById('foodTrackingLockModal')?.remove();
  }catch(e){}
}
function clearFoodTracking(){
  try{
    if(foodOrderChannel){ supabase.removeChannel(foodOrderChannel); foodOrderChannel=null; }
    if(foodDriverLocChannel){ supabase.removeChannel(foodDriverLocChannel); foodDriverLocChannel=null; }
    if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
    if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
    if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
    foodCurrentOrderId=null;
    localStorage.removeItem('active_food_order_id');
  }catch(e){}
}

// === ORIGINAL FUNCTIONS WITH TIMER FIX ===
function renderFoodActiveOrder(order, driver){
  try{ document.getElementById('foodActiveTracking')?.remove(); }catch(e){}
  const theme=getAppTheme();
  const div=document.createElement('div');
  div.id='foodActiveTracking';
  div.style.cssText='position:fixed;bottom:20px;left:16px;right:16px;background:white;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.2);z-index:999;padding:14px;border:1px solid #e2e8f0';
  const statusMap={searching_driver:'Mencari Driver...',driver_assigned:'Menunggu Konfirmasi',accepted:'Driver Diterima',preparing:'Warung Masak 🍳',ready:'Makanan Siap',picked:'Driver OTW',completed:'Selesai',cancelled:'Dibatalkan'};
  const statusText=statusMap[order.status]||order.status;
  div.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-weight:800;font-size:13px">${statusText}</div><div style="font-size:11px;color:#64748b">#${order.id.slice(0,6).toUpperCase()} • ${driver?driver.name:'-'}</div></div>
      <div style="display:flex;gap:6px">
        <button id="btnCancelFoodOrder" type="button" style="padding:8px 10px;border-radius:10px;border:1px solid #fecaca;background:#fff1f2;color:#ef4444;font-size:11px;font-weight:700">Batalkan</button>
      </div>
    </div>
    <div style="margin-top:8px"><span id="singleSearchTimer" style="font-size:11px;color:#64748b">00:00</span> <span id="foodAutoTimerText" style="font-size:11px;color:#ef4444"></span></div>
  `;
  document.body.appendChild(div);
  div.querySelector('#btnCancelFoodOrder')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan ini?')) return;
    try{
      await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', order.id);
      clearFoodTracking();
      hideFoodTrackingUI();
      showCancelPopupFood(order.id, 'kamu batalkan');
    }catch(e){ alert('Gagal batalkan'); }
  });
  div.querySelector('#btnCancelFoodOrder')?.addEventListener('touchend', async ()=>{
    if(!confirm('Batalkan pesanan makanan ini?')) return;
    try{
      await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', order.id);
      clearFoodTracking();
      hideFoodTrackingUI();
      showCancelPopupFood(order.id, 'kamu batalkan');
    }catch(e){}
  });
}

export async function startFoodTracking(orderId){
  foodCurrentOrderId=orderId;
  try{ localStorage.setItem('active_food_order_id', orderId); }catch(e){}
  try{
    const { data:order } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(!order) return;
    if(order.status==='cancelled'){
      showCancelPopupFood(orderId, 'dibatalkan');
      return;
    }
    if(order.status==='completed'){
      openRatingForCompletedFoodOrder(order);
      return;
    }
    renderFoodActiveOrder(order, null);
    if(isStillSearching(order.status)){
      startFoodUnifiedTimer(order.id, order.status);
    } else {
      stopFoodSearchTimer(order.id);
    }
    if(order.driver_id){
      const driver=await fetchDriverProfileFood(order.driver_id);
      renderFoodActiveOrder(order, driver);
      subscribeFoodDriverLocation(order.driver_id);
      startFoodDistanceUpdater(order);
    }
    subscribeFoodOrderUpdates(orderId);
  }catch(e){ console.error(e); }
}

export function openFoodTrackingDetailModal(orderId){ startFoodTracking(orderId); }
export function showFoodTrackingLockModal(order){ /* preserve original lock modal UI */ }
export async function loadFoodActiveTracking(){
  try{
    const oid = localStorage.getItem('active_food_order_id');
    if(!oid) return;
    const { data:order } = await supabase.from('food_orders').select('*').eq('id', oid).single();
    if(!order) return;
    if(order.status==='cancelled'){ showCancelPopupFood(oid, 'dibatalkan'); return; }
    if(order.status==='completed'){ openRatingForCompletedFoodOrder(order); return; }
    renderFoodActiveOrder(order, null);
    if(isStillSearching(order.status)) startFoodUnifiedTimer(order.id, order.status);
    else stopFoodSearchTimer(order.id);
    subscribeFoodOrderUpdates(oid);
  }catch(e){}
}

function subscribeFoodOrderUpdates(orderId){
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} }
  foodOrderChannel = supabase.channel('food-order-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:`id=eq.${orderId}` }, async payload=>{
      const newOrder=payload.new;
      if(!newOrder) return;
      if(!isStillSearching(newOrder.status)){
        stopFoodSearchTimer(newOrder.id);
      }
      if(newOrder.status==='cancelled'){
        clearFoodTracking();
        hideFoodTrackingUI();
        showCancelPopupFood(orderId, 'dibatalkan sistem/driver');
        return;
      }
      if(newOrder.status==='completed'){
        stopFoodSearchTimer(newOrder.id);
        openRatingForCompletedFoodOrder(newOrder);
        return;
      }
      const driver = newOrder.driver_id ? await fetchDriverProfileFood(newOrder.driver_id) : null;
      renderFoodActiveOrder(newOrder, driver);
      if(newOrder.driver_id) subscribeFoodDriverLocation(newOrder.driver_id);
    }).subscribe();
}

function startFoodUnifiedTimer(orderId, currentStatus='searching_driver'){
  if(!isStillSearching(currentStatus)){
    stopFoodSearchTimer(orderId);
    return;
  }
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  foodSearchStart = Date.now();
  try{
    const saved = localStorage.getItem('food_auto_start_'+orderId);
    if(saved){
      const parsed = parseInt(saved);
      if(!isNaN(parsed)) foodSearchStart = parsed;
    } else {
      localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString());
    }
  }catch(e){}
  foodAutoTimer = setInterval(async ()=>{
    try{
      const { data: cur } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
      if(cur && !isStillSearching(cur.status)){
        stopFoodSearchTimer(orderId);
        return;
      }
    }catch(e){}
    const elapsed = Math.floor((Date.now()-foodSearchStart)/1000);
    const remain = Math.max(0, FOOD_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');
    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const tAuto = document.getElementById('foodAutoTimerText');
    if(t1) t1.textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    if(tAuto) tAuto.textContent = remain>0 ? `Auto batal dalam ${rm}:${rs}` : 'Membatalkan...';
    if(elapsed >= FOOD_TIMEOUT){
      clearInterval(foodAutoTimer); foodAutoTimer=null;
      try{
        const { data: cur } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
        if(cur && isStillSearching(cur.status)){
          await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId);
        } else {
          stopFoodSearchTimer(orderId);
          return;
        }
      }catch(e){}
      alert('⏰ 5 menit tidak ada respon driver. Order dibatalkan otomatis.');
      clearFoodTracking();
      hideFoodTrackingUI();
      showCancelPopupFood(orderId, 'auto batal - tidak ada driver');
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
  if(!driverLoc) return;
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
  window.trackingFood = { startFoodTracking, clearFoodTracking, openFoodTrackingDetailModal, showFoodTrackingLockModal, loadFoodActiveTracking, redirectToFoodPage, showCancelPopupFood, stopFoodSearchTimer, isStillSearching };
  window.startFoodTracking = startFoodTracking;
  window.clearFoodTracking = clearFoodTracking;
  window.openFoodTrackingDetailModal = openFoodTrackingDetailModal;
  window.openRatingForCompletedFoodOrder = openRatingForCompletedFoodOrder;
  window.showFoodTrackingLockModal = showFoodTrackingLockModal;
  window.redirectToFoodPage = redirectToFoodPage;
  window.showCancelPopupFood = showCancelPopupFood;
  window.stopFoodSearchTimer = stopFoodSearchTimer;
}

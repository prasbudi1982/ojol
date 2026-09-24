
// trackingFood.js - FINAL FIX + REDIRECT KE HALAMAN FOOD (#/store) - Flow sama persis tracking.js ojol
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
const FOOD_TIMEOUT = 300; // 5 menit

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

// ====== HELPER: REDIRECT PUSAT KE HALAMAN FOOD ======
function redirectToFoodPage(){
  // Halaman food di storeViews.js adalah viewStoreList -> route #/store
  try{
    // tutup semua modal dulu
    document.getElementById('foodTrackingDetailModal')?.remove();
    document.getElementById('foodTrackingLockModal')?.remove();
    document.getElementById('foodActiveTracking')?.remove();
    document.getElementById('foodRatingModal')?.remove();
    hideFoodTrackingUI();
    clearFoodTracking();
  }catch(e){}
  // delay sedikit biar animasi modal selesai
  setTimeout(()=>{
    location.hash = '#/store'; // <-- INI HALAMAN FOOD DI storeViews.js
    // optional refresh
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, 300);
}
window.redirectToFoodPage = redirectToFoodPage;

// FIX RATING: helper buka rating saat order food selesai - auto tutup modal + kosongkan keranjang + rating driver & warung
async function openRatingForCompletedFoodOrder(order){
  try{
    if(!order) return;
    try{ if(localStorage.getItem('rated_food_'+order.id)) { redirectToFoodPage(); return; } }catch(e){}

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
      if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
      if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
      if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
      foodCurrentOrderId=null;
    }catch(e){}

    if(!order.driver_id){
      setTimeout(function(){ 
        alert('Pesanan selesai! Terima kasih sudah order');
        redirectToFoodPage(); // REDIRECT
      }, 400);
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
      '<textarea id="foodRatingComment" placeholder="Komentar (opsional)..." style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:12px;min-height:60px;margin-bottom:12px"></textarea>'+
      '<div style="display:flex;gap:10px">'+
        '<button id="btnSkipRatingFood" style="flex:1;padding:12px;border-radius:12px;border:1px solid #e2e8f0;background:white;font-weight:700;cursor:pointer">Lewati</button>'+
        '<button id="btnSubmitRatingFood" style="flex:1;padding:12px;border-radius:12px;border:none;background:'+theme.primary+';color:white;font-weight:800;cursor:pointer;opacity:0.5" disabled>Kirim Rating</button>'+
      '</div>'+
    '</div></div>';
  document.body.appendChild(div);

  let dRating=0, wRating=0;
  const dLabels={1:'Buruk',2:'Kurang',3:'Cukup',4:'Bagus',5:'Luar Biasa'};
  const wLabels={1:'Tidak Enak',2:'Kurang',3:'Lumayan',4:'Enak',5:'Sangat Enak'};

  div.querySelectorAll('#dStars button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      dRating=parseInt(btn.dataset.d);
      div.querySelectorAll('#dStars button').forEach((b,i)=>{ b.style.opacity = (i < dRating) ? '1' : '0.3'; b.style.transform = (i < dRating) ? 'scale(1.2)' : 'scale(1)'; });
      document.getElementById('dLabel').textContent = dLabels[dRating];
      checkEnable();
    });
  });
  div.querySelectorAll('#wStars button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      wRating=parseInt(btn.dataset.w);
      div.querySelectorAll('#wStars button').forEach((b,i)=>{ b.style.opacity = (i < wRating) ? '1' : '0.3'; b.style.transform = (i < wRating) ? 'scale(1.2)' : 'scale(1)'; });
      document.getElementById('wLabel').textContent = wLabels[wRating];
      checkEnable();
    });
  });

  function checkEnable(){
    const btn=document.getElementById('btnSubmitRatingFood');
    if(dRating>0 && wRating>0){ btn.disabled=false; btn.style.opacity='1'; }
  }

  // ====== TOMBOL LEWATI -> REDIRECT KE FOOD ======
  document.getElementById('btnSkipRatingFood').addEventListener('click', async ()=>{
    try{ localStorage.setItem('rated_food_'+order.id,'1'); }catch(e){}
    div.remove();
    // REDIRECT KE HALAMAN FOOD
    redirectToFoodPage();
  });

  // ====== TOMBOL KIRIM RATING -> REDIRECT KE FOOD ======
  document.getElementById('btnSubmitRatingFood').addEventListener('click', async ()=>{
    const comment=document.getElementById('foodRatingComment')?.value||'';
    try{
      if(order.driver_id && dRating){
        await supabase.from('ratings').insert({ order_id:order.id, driver_id:order.driver_id, rating:dRating, comment:comment, type:'food' });
      }
      if(order.store_id && wRating){
        await supabase.from('store_ratings').insert({ order_id:order.id, store_id:order.store_id, rating:wRating, comment:comment });
      }
      // fallback local
      const local=JSON.parse(localStorage.getItem('local_ratings')||'[]');
      local.push({ order_id:order.id, driver_id:order.driver_id, rating:dRating, at:Date.now() });
      localStorage.setItem('local_ratings', JSON.stringify(local));
    }catch(e){ console.warn('rating fail', e); }
    try{ localStorage.setItem('rated_food_'+order.id,'1'); }catch(e){}
    div.remove();
    alert('Terima kasih ratingnya! ⭐');
    // REDIRECT KE HALAMAN FOOD
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

// POPUP PEMBATALAN - dengan redirect ke food
function showCancelPopupFood(orderId, reason='dibatalkan'){
  try{ document.getElementById('foodCancelPopup')?.remove(); }catch(e){}
  const theme=getAppTheme();
  const div=document.createElement('div');
  div.id='foodCancelPopup';
  div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML=`
    <div style="background:white;border-radius:20px;max-width:360px;width:100%;padding:20px;text-align:center">
      <div style="font-size:48px">😢</div>
      <div style="font-weight:800;font-size:16px;margin-top:8px">Pesanan Dibatalkan</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Pesanan #${orderId.slice(0,6).toUpperCase()} ${reason}</div>
      <button id="btnCloseCancelPopup" style="margin-top:16px;width:100%;padding:12px;border-radius:12px;border:none;background:${theme.primary};color:white;font-weight:800;cursor:pointer">Kembali ke Menu Makanan</button>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('btnCloseCancelPopup').addEventListener('click', ()=>{
    div.remove();
    redirectToFoodPage();
  });
  // auto redirect 2.5 detik
  setTimeout(()=>{ try{ div.remove(); redirectToFoodPage(); }catch(e){} }, 2500);
}

export async function startFoodTracking(orderId){
  foodCurrentOrderId=orderId;
  try{ localStorage.setItem('active_food_order_id', orderId); }catch(e){}
  // fetch order & subscribe realtime
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
    if(order.driver_id){
      const driver=await fetchDriverProfileFood(order.driver_id);
      renderFoodActiveOrder(order, driver);
      subscribeFoodDriverLocation(order.driver_id);
      startFoodDistanceUpdater(order);
    }
    subscribeFoodOrderUpdates(orderId);
    startFoodUnifiedTimer(orderId);
  }catch(e){ console.error(e); }
}

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
        <button onclick="window.openFoodTrackingDetailModal && window.openFoodTrackingDetailModal('${order.id}')" style="padding:8px 10px;border-radius:10px;border:none;background:${theme.primary};color:white;font-size:11px;font-weight:700">Detail</button>
        <button id="btnCancelFoodOrder" style="padding:8px 10px;border-radius:10px;border:1px solid #fecaca;background:#fff1f2;color:#ef4444;font-size:11px;font-weight:700">Batalkan</button>
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
}

export function openFoodTrackingDetailModal(orderId){
  // ... (tetap seperti sebelumnya)
  startFoodTracking(orderId);
}

export function showFoodTrackingLockModal(order){
  // ... lock modal searching driver dengan tombol batalkan yang redirect
  const theme=getAppTheme();
  try{ document.getElementById('foodTrackingLockModal')?.remove(); }catch(e){}
  const div=document.createElement('div');
  div.id='foodTrackingLockModal';
  div.style.cssText='position:fixed;inset:0;background:white;z-index:9999;display:flex;flex-direction:column;padding:20px;overflow:auto';
  div.innerHTML=`
    <div style="text-align:center;padding:20px">
      <div style="font-size:48px">🔍</div>
      <div style="font-weight:800;margin-top:10px">Mencari Driver Terdekat...</div>
      <div style="margin-top:8px"><span id="singleTimeout" style="font-weight:800;color:${theme.primary}">05:00</span></div>
      <div id="foodAutoTimerText" style="font-size:11px;color:#ef4444;margin-top:4px"></div>
      <button id="btnCancelFromLock" style="margin-top:16px;width:100%;padding:12px;border-radius:12px;border:1px solid #fecaca;background:#fff1f2;color:#ef4444;font-weight:700">Batalkan Pesanan</button>
      <button id="btnSelesaiLock" style="margin-top:10px;width:100%;padding:12px;border-radius:12px;border:none;background:${theme.primary};color:white;font-weight:700">Selesai / Kembali ke Menu</button>
    </div>
  `;
  document.body.appendChild(div);
  div.querySelector('#btnCancelFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan?')) return;
    try{ await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', order.id); }catch(e){}
    div.remove();
    showCancelPopupFood(order.id, 'kamu batalkan');
  });
  div.querySelector('#btnSelesaiLock')?.addEventListener('click', ()=>{
    div.remove();
    redirectToFoodPage();
  });
}

function subscribeFoodOrderUpdates(orderId){
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} }
  foodOrderChannel = supabase.channel('food-order-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:`id=eq.${orderId}` }, async payload=>{
      const newOrder=payload.new;
      if(!newOrder) return;
      if(newOrder.status==='cancelled'){
        clearFoodTracking();
        hideFoodTrackingUI();
        showCancelPopupFood(orderId, 'dibatalkan sistem/driver');
        return;
      }
      if(newOrder.status==='completed'){
        openRatingForCompletedFoodOrder(newOrder);
        return;
      }
      const driver = newOrder.driver_id ? await fetchDriverProfileFood(newOrder.driver_id) : null;
      renderFoodActiveOrder(newOrder, driver);
      if(newOrder.driver_id) subscribeFoodDriverLocation(newOrder.driver_id);
    }).subscribe();
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
    loadFoodActiveTracking: ()=>{},
    redirectToFoodPage,
    showCancelPopupFood
  };
  window.startFoodTracking = startFoodTracking;
  window.clearFoodTracking = clearFoodTracking;
  window.openFoodTrackingDetailModal = openFoodTrackingDetailModal;
  window.openRatingForCompletedFoodOrder = openRatingForCompletedFoodOrder;
  window.showFoodTrackingLockModal = showFoodTrackingLockModal;
  window.redirectToFoodPage = redirectToFoodPage;
}

export async function loadFoodActiveTracking(){}

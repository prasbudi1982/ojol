// tracking.js - STEP 1: OJOL 2 ARAH PENUMPANG + NOTIFIKASI
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';
import { showLocalNotification, getNotifSettings } from './push.js';

function notifyOjol(title, body, url='/#/passenger'){
  try{
    const st = getNotifSettings();
    if(!st.enabled || !st.ojol) return;
    showLocalNotification(title, body, url, 'ojol');
  }catch(e){}
}

async function openRatingForCompletedOrder(order){
  try{
    if(!order || !order.driver_id) return;
    try{ if(localStorage.getItem('rated_'+order.id)) return; }catch(e){}
    notifyOjol('✅ Order Ojol Selesai', `Sampai tujuan! Rating driver yuk`, '/#/passenger');
    const driver = await fetchDriverProfile(order.driver_id);
    const { openRatingModal } = await import('./rating.js');
    try{ localStorage.setItem('last_rated_order', order.id); }catch(e){}
    setTimeout(()=>{ try{ openRatingModal(order.driver_id, driver?.name||'Driver', order.id); }catch(err){} }, 400);
  }catch(e){ console.error('openRating error', e); }
}

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

export function showTrackingLockModal(order){
  let modal = document.getElementById('trackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'trackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const statusText = order.status==='accepted' ? 'Driver OTW' : order.status==='picked' ? 'Diantar' : 'Mencari driver';
  div.innerHTML = `
    <div style="background:var(--card);border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🔒</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Order Aktif Berjalan</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px">
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;color:var(--text)">
          <div>📍 ${order.pickup_text||order.pickup||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||order.destination||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Driver</button>
          <button id="btnCancelFromLock" style="background:var(--card);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Order</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoTracking')?.addEventListener('click', ()=>{ div.remove(); });
  document.getElementById('btnCancelFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan order aktif?')) return;
    try{ await supabase.from('orders').update({status:'cancelled', cancel_reason:'Dibatalkan penumpang'}).eq('id', order.id); }catch(e){}
    notifyOjol('❌ Order Dibatalkan', 'Kamu membatalkan order', '/#/passenger');
    clearActiveTracking(); hideTrackingUI(); div.remove();
  });
}
export function hideTrackingLockModal(){ const m = document.getElementById('trackingLockModal'); if(m) m.remove(); }

let orderChannel = null;
let driverLocationChannel = null;
let trackingInterval = null;
let currentOrderId = null;
let lastKnownDriverId = null;
let orderPollInterval = null;
let noDriverTimer = null;
let searchStartTime = null;
let autoAssignTimer = null;
const TIMER_TIMEOUT = 5*60;

export function startTracking(orderId){
  if(!orderId) return;
  try{
    localStorage.removeItem('last_driver_id');
    localStorage.removeItem('last_driver_name');
    localStorage.setItem('auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  lastKnownDriverId = null;
  searchStartTime = Date.now();
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  notifyOjol('🔍 Mencari Driver...', 'Order Ojol kamu sedang dicarikan driver', '/#/passenger');
  loadActiveTracking();
}

export function clearActiveTracking(){
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
  if(orderChannel){ try{ supabase.removeChannel(orderChannel); }catch(e){} orderChannel=null; }
  if(driverLocationChannel){ try{ supabase.removeChannel(driverLocationChannel); }catch(e){} driverLocationChannel=null; }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  searchStartTime=null; lastKnownDriverId=null;
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  localStorage.removeItem('active_order_id'); localStorage.removeItem('pickup_lat'); localStorage.removeItem('pickup_lng');
  try{
    localStorage.removeItem('last_driver_id');
    localStorage.removeItem('last_driver_name');
    if(orderId){
      localStorage.removeItem('auto_start_'+orderId);
      localStorage.removeItem('auto_queue_'+orderId);
      localStorage.removeItem('auto_index_'+orderId);
    }
  }catch(e){}
  currentOrderId=null;
  hideTrackingUI();
}

export async function loadActiveTracking(){
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  if(!orderId) return;
  try{
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(!order){ clearActiveTracking(); return; }
    if(['completed','cancelled','rejected'].includes(order.status)){
      const isComp = order.status==='completed';
      const compData = isComp ? { ...order } : null;
      clearActiveTracking(); hideTrackingUI();
      if(order.status==='cancelled'){
        notifyOjol('❌ Order Dibatalkan', order.cancel_reason || 'Order dibatalkan', '/#/passenger');
        try{ alert(order.cancel_reason ? `❌ Order dibatalkan: ${order.cancel_reason}` : '❌ Order dibatalkan'); }catch(e){}
        location.hash = '#/passenger';
      }
      if(isComp && compData) openRatingForCompletedOrder(compData);
      return;
    }
    renderActiveOrder(order, null);
    if(order.driver_id){
      lastKnownDriverId = order.driver_id;
      try{ localStorage.setItem('last_driver_id', order.driver_id); }catch(e){}
      fetchDriverProfile(order.driver_id).then(driver=>{
        try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
        renderActiveOrder(order, driver);
        subscribeDriverLocation(order.driver_id);
        startDistanceUpdater(order);
      });
    }
    subscribeOrderChannel(orderId);
    startUnifiedTimer(orderId);
  }catch(e){ console.error('loadActiveTracking error', e); }
}

function subscribeOrderChannel(orderId){
  if(orderChannel){ try{ supabase.removeChannel(orderChannel); }catch(e){} orderChannel=null; }
  orderChannel = supabase.channel('order-track-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:`id=eq.${orderId}` }, payload=>{
      const newOrder = payload.new;
      if(!newOrder) return;
      if(['completed','cancelled','rejected'].includes(newOrder.status)){
        const isComp = newOrder.status==='completed';
        const compData = isComp ? { ...newOrder } : null;
        if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
        clearActiveTracking(); hideTrackingUI();
        if(newOrder.status==='cancelled'){
          notifyOjol('❌ Order Dibatalkan', newOrder.cancel_reason || 'Order dibatalkan', '/#/passenger');
          try{ alert(newOrder.cancel_reason ? `❌ Order dibatalkan: ${newOrder.cancel_reason}` : '❌ Order dibatalkan'); }catch(e){}
          location.hash = '#/passenger';
        }
        if(isComp && compData) openRatingForCompletedOrder(compData);
        return;
      }
      handleOrderUpdate(newOrder);
    })
    .subscribe();

  orderPollInterval = setInterval(async ()=>{
    try{
      const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(error || !o) return;
      if(['completed','cancelled','rejected'].includes(o.status)){
        const isComp = o.status==='completed';
        const compData = isComp ? { ...o } : null;
        clearInterval(orderPollInterval); orderPollInterval=null;
        clearActiveTracking(); hideTrackingUI();
        if(o.status==='cancelled'){
          notifyOjol('❌ Order Dibatalkan', o.cancel_reason || 'Order dibatalkan', '/#/passenger');
          try{ alert(o.cancel_reason ? `❌ Order dibatalkan: ${o.cancel_reason}` : '❌ Order dibatalkan'); }catch(e){}
          location.hash = '#/passenger';
        }
        if(isComp && compData) openRatingForCompletedOrder(compData);
        return;
      }
      handleOrderUpdate(o);
    }catch(e){}
  }, 4000);
}

function handleOrderUpdate(newOrder){
  if(newOrder.driver_id){
    const isNewDriver = newOrder.driver_id !== lastKnownDriverId;
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    lastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_driver_id', newOrder.driver_id); }catch(e){}
    fetchDriverProfile(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
      renderActiveOrder(newOrder, driver);
      subscribeDriverLocation(newOrder.driver_id);
      startDistanceUpdater(newOrder);
      const si = document.getElementById('searchInfo'); if(si) si.textContent = `✅ Driver ${driver?.name||''} OTW`;
      // === NOTIFIKASI 2 ARAH PENUMPANG ===
      if(isNewDriver && newOrder.status==='accepted'){
        notifyOjol('✅ Driver Ditemukan!', `Driver ${driver?.name||''} OTW ke pickup - ${newOrder.dest_text||''}`, '/#/passenger');
      } else if(newOrder.status==='picked'){
        notifyOjol('🚗 Driver OTW Tujuan', `Driver mengantar ke ${newOrder.dest_text}`, '/#/passenger');
      }
    });
  } else {
    if(lastKnownDriverId && newOrder.status==='searching'){
      (async ()=>{
        try{
          await supabase.from('orders').update({ status:'cancelled', cancel_reason:'Driver menolak order' }).eq('id', newOrder.id);
          notifyOjol('❌ Driver Menolak', 'Driver menolak order, silakan buat order baru', '/#/passenger');
        }catch(e){}
      })();
      return;
    }
    renderActiveOrder(newOrder, null);
  }
}

function startUnifiedTimer(orderId){
  if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
  searchStartTime = Date.now();
  try{
    const saved = localStorage.getItem('auto_start_'+orderId);
    if(saved){
      const parsed = parseInt(saved);
      if(!isNaN(parsed)) searchStartTime = parsed;
    } else {
      localStorage.setItem('auto_start_'+orderId, searchStartTime.toString());
    }
  }catch(e){}
  autoAssignTimer = setInterval(async ()=>{
    const elapsed = Math.floor((Date.now()-searchStartTime)/1000);
    const remain = Math.max(0, TIMER_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');
    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const t3 = document.getElementById('singleTimeout2');
    if(t1) t1.textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    if(t3) t3.textContent = `${rm}:${rs}`;
    if(elapsed >= TIMER_TIMEOUT){
      clearInterval(autoAssignTimer); autoAssignTimer=null;
      try{
        const { data: cur } = await supabase.from('orders').select('status').eq('id', orderId).single();
        if(cur && ['searching','pending','new','open','created','waiting'].includes(cur.status)){
          await supabase.from('orders').update({ status:'cancelled', cancel_reason:'Timeout 5 menit tidak ada respon driver' }).eq('id', orderId);
          notifyOjol('⏰ Timeout', '5 menit tidak ada respon driver', '/#/passenger');
        }
      }catch(e){}
      alert('⏰ 5 menit tidak ada respon driver. Order dibatalkan otomatis.');
      clearActiveTracking(); hideTrackingUI(); location.hash = '#/passenger';
    }
  },1000);
}

function subscribeDriverLocation(driverId){
  if(driverLocationChannel){ try{ supabase.removeChannel(driverLocationChannel); }catch(e){} driverLocationChannel=null; }
  driverLocationChannel = supabase.channel('driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateDriverDistance(payload.new); })
    .subscribe();
}
function updateDriverDistance(driverLoc){
  if(!driverLoc) return;
  const pickupLat = parseFloat(localStorage.getItem('pickup_lat')); const pickupLng = parseFloat(localStorage.getItem('pickup_lng'));
  let dLat,dLng; if(driverLoc.lat&&driverLoc.lng){ dLat=driverLoc.lat; dLng=driverLoc.lng; } else if(driverLoc.lokasi){ const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }
  const el = document.getElementById('trackingDistance');
  if(!dLat||!pickupLat){ if(el) el.textContent = `📍 Driver online`; return; }
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  if(el){ el.textContent = dist<0.1? `🎉 Driver dekat! ${dist.toFixed(2)} km` : `📍 Driver ${dist.toFixed(2)} km dari pickup`; }
}
function startDistanceUpdater(order){
  if(trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(async ()=>{
    if(!order.driver_id) return;
    try{ const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single(); if(data) updateDriverDistance(data); }catch(e){}
  },5000);
}

// === RENDER (simplified - keep original logic if you have) ===
async function fetchDriverProfile(driverId){
  try{ const { data } = await supabase.from('users').select('*').eq('id', driverId).single(); return data; }catch(e){ return null; }
}
function renderActiveOrder(order, driver){
  try{
    const box = document.getElementById('activeTracking') || document.getElementById('passengerActiveOrder');
    if(!box) return;
    const statusText = {searching:'Mencari Driver...', accepted:'Driver OTW Pickup', picked:'OTW Tujuan', completed:'Selesai', cancelled:'Dibatalkan'};
    box.innerHTML = `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:12px">
        <div style="font-weight:800">${statusText[order.status]||order.status} ${driver?`• ${driver.name}`:''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">📍 ${order.pickup_text||''} → 🎯 ${order.dest_text||''}</div>
        <div id="trackingDistance" style="font-size:11px;margin-top:6px;color:var(--primary)">📍 Menghitung jarak...</div>
        <div style="margin-top:8px"><span id="singleSearchTimer" style="font-size:12px;font-weight:700">00:00</span> <span class="muted" style="font-size:10px">| timeout <span id="singleTimeout">05:00</span></span></div>
      </div>`;
  }catch(e){}
}
function hideTrackingUI(){
  try{
    document.getElementById('trackingLockModal')?.remove();
    const el = document.getElementById('activeTracking'); if(el) el.innerHTML='';
  }catch(e){}
}

// tracking.js - FINAL FIX TIMER 5 MENIT AUTO BATAL + AUTO TUTUP MODAL - v20
import { supabase } from './supabase.js';
import { notifyOjol } from './push.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

// FIX RATING: helper buka rating saat order selesai (dipanggil penumpang)
async function openRatingForCompletedOrder(order){
  try{
    try{ notifyOjol('✅ Order Selesai', 'Sampai tujuan! Rating driver yuk', '/#/passenger'); }catch(e){}
    if(!order || !order.driver_id) return;
    // Cek apakah sudah pernah rating order ini
    try{
      const ratedKey = 'rated_'+order.id;
      if(localStorage.getItem(ratedKey)) { console.log('Order sudah dirating sebelumnya', order.id); return; }
    }catch(e){}
    const driver = await fetchDriverProfile(order.driver_id);
    const { openRatingModal } = await import('./rating.js');
    // Simpan flag biar tidak double modal
    try{ localStorage.setItem('last_rated_order', order.id); }catch(e){}
    console.log('⭐ Membuka rating modal untuk', order.driver_id, driver?.name);
    // Delay sedikit biar tracking modal sempat tertutup
    setTimeout(()=>{
      try{ openRatingModal(order.driver_id, driver?.name||'Driver', order.id); }catch(err){ console.error('openRatingModal fail', err); }
    }, 400);
  }catch(e){ console.error('openRatingForCompletedOrder error', e); }
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
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:var(--muted)">ID ${order.id.slice(0,6).toUpperCase()}</span></div>
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
    try{ const { supabase } = await import('./supabase.js'); await supabase.from('orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
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
let searchSeconds = 0;
let lastDriverLoc = null;
let autoAssignTimer = null;
const TIMER_TIMEOUT = 5*60; // 5 menit = 300 detik
let TRACKING_IS_LOCKED = false; // UPDATE: kunci popup sampai driver selesai
function lockTrackingPopup(){ TRACKING_IS_LOCKED = true; try{ document.body.style.overflow='hidden'; }catch(e){} }
function unlockTrackingPopup(){ TRACKING_IS_LOCKED = false; try{ document.body.style.overflow=''; }catch(e){} }

export function startTracking(orderId){
  if(!orderId) return;
  try{
    localStorage.removeItem('last_driver_id');
    localStorage.removeItem('last_driver_name');
    localStorage.setItem('auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  lastKnownDriverId = null;
  searchStartTime = Date.now();
  searchSeconds = 0;
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  try{ notifyOjol('🔍 Mencari Driver...', 'Order Ojol kamu sedang dicarikan driver', '/#/passenger'); }catch(e){}
  loadActiveTracking();
}

export function clearActiveTracking(){
  try{ unlockTrackingPopup(); }catch(e){}
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
  if(orderChannel){ try{ supabase.removeChannel(orderChannel); }catch(e){} orderChannel=null; }
  if(driverLocationChannel){ try{ supabase.removeChannel(driverLocationChannel); }catch(e){} driverLocationChannel=null; }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  searchStartTime=null; searchSeconds=0; lastKnownDriverId=null;
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
  const card = document.getElementById('activeOrderCard');
  const info = document.getElementById('searchInfo');
  if(!orderId){ if(info) info.textContent = 'Tidak ada order aktif'; hideTrackingUI(); return null; }
  currentOrderId = orderId;
  try{
    ensureTrackingDetailModal();
    const modalContent = document.getElementById('trackingDetailContent');
    if(modalContent){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='flex'; modalContent.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;text-align:center;color:var(--text)">⏳ Memuat tracking... ID ${orderId.slice(0,8)}</div>`; }
    if(card){ card.style.display='none'; card.innerHTML=''; }
    let { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(error || !order){ console.warn('fetch order fail', error?.message); /* jangan clear dulu, coba pakai localStorage */ }
    // ===== FIX BUG: data order tidak masuk ke modal =====
    // Merge dengan localStorage & currentNearby karena fallback insert minimal tidak punya distance, cost, vehicle
    try{
      const lsPickup = localStorage.getItem('pickup_text') || localStorage.getItem('pickup_val') || '';
      const lsDest = localStorage.getItem('dest_text') || localStorage.getItem('dest_val') || '';
      const lsDist = parseFloat(localStorage.getItem('distance_km')||'0');
      const lsCost = parseFloat(localStorage.getItem('estimated_cost')||'0');
      const lsVeh = localStorage.getItem('vehicle_type') || 'motor';
      const lsTrip = localStorage.getItem('trip_type') || 'oneway';
      const lsPickupLat = parseFloat(localStorage.getItem('pickup_lat')||'');
      const lsPickupLng = parseFloat(localStorage.getItem('pickup_lng')||'');
      const lsDestLat = parseFloat(localStorage.getItem('dest_lat')||'');
      const lsDestLng = parseFloat(localStorage.getItem('dest_lng')||'');

      if(!order) order = { id: orderId, status: 'searching' };

      // Isi yang kosong dari localStorage
      order.pickup_text = order.pickup_text || order.pickup || lsPickup || '-';
      order.dest_text = order.dest_text || order.destination || order.dest || lsDest || '-';
      order.pickup = order.pickup || lsPickup;
      order.destination = order.destination || lsDest;
      order.distance_km = order.distance_km || order.distance || lsDist || 0;
      order.distance = order.distance || order.distance_km || lsDist || 0;
      order.estimated_cost = order.estimated_cost || order.cost || lsCost || 0;
      order.cost = order.cost || order.estimated_cost || lsCost || 0;
      order.vehicle_type = order.vehicle_type || lsVeh || 'motor';
      order.trip_type = order.trip_type || lsTrip || 'oneway';
      order.pickup_lat = order.pickup_lat || (isNaN(lsPickupLat)?null:lsPickupLat);
      order.pickup_lng = order.pickup_lng || (isNaN(lsPickupLng)?null:lsPickupLng);
      order.dest_lat = order.dest_lat || (isNaN(lsDestLat)?null:lsDestLat);
      order.dest_lng = order.dest_lng || (isNaN(lsDestLng)?null:lsDestLng);
      if(!order.created_at) order.created_at = new Date().toISOString();

      console.log('🔍 loadActiveTracking merged order', order);
    }catch(mergeErr){ console.warn('merge localStorage fail', mergeErr); }

    if(!order || !order.id){ clearActiveTracking(); hideTrackingUI(); return null; }
    // FIX: jika order sudah cancelled/completed/rejected -> auto tutup modal + rating jika completed
    if(['completed','cancelled','rejected'].includes(order.status)){
      const wasCompleted = order.status==='completed';
      const completedOrder = wasCompleted ? { ...order } : null;
      clearActiveTracking();
      hideTrackingUI();
      if(order.status==='cancelled'){
        try{ alert(order.cancel_reason ? `❌ Order dibatalkan: ${order.cancel_reason}. Silakan buat order baru.` : '❌ Order dibatalkan. Silakan buat order baru.'); }catch(e){}
        location.hash = '#/passenger';
      }
      if(wasCompleted && completedOrder){
        // FIX RATING: order selesai saat load -> langsung buka rating
        console.log('✅ Order sudah completed saat load, buka rating');
        openRatingForCompletedOrder(completedOrder);
      }
      return null;
    }
    showTrackingUI(order);
    subscribeOrderUpdates(orderId);
    if(order.driver_id){
      const driver = await fetchDriverProfile(order.driver_id);
      try{ localStorage.setItem('last_driver_id', order.driver_id); localStorage.setItem('last_driver_name', driver?.name||'Driver'); lastKnownDriverId = order.driver_id; }catch(e){}
      // UPDATE: jika status sudah accepted/picked, langsung kunci
      if(['accepted','picked'].includes(order.status)){ lockTrackingPopup(); if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; } }
      renderActiveOrder(order, driver);
      subscribeDriverLocation(order.driver_id);
      startDistanceUpdater(order);
      startUnifiedTimer(orderId);
    } else {
      // Order baru tanpa driver -> tampilkan searching, bukan rejected
      renderActiveOrder(order, null);
      startUnifiedTimer(order.id);
    }
    return order;
  }catch(e){ console.error('loadActiveTracking', e); return null; }
}

async function fetchDriverProfile(driverId){
  if(!driverId) return null;
  try{
    const { data } = await supabase.from('users').select('id,name,hp,nopol,jenis_kendaraan,tipe_motor').eq('id', driverId).maybeSingle();
    if(data) return data;
    return { id: driverId, name: 'Driver '+driverId.slice(0,4), hp:null, nopol:'-', jenis_kendaraan:'motor' };
  }catch(e){ return { id: driverId, name: 'Driver '+driverId.slice(0,4), hp:null, nopol:'-', jenis_kendaraan:'motor' }; }
}

function ensureTrackingDetailModal(){
  let modal = document.getElementById('trackingDetailModal');
  if(modal) return modal;
  const div = document.createElement('div');
  div.id = 'trackingDetailModal';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(11,15,20,0.92);backdrop-filter:blur(14px);z-index:9999;overflow-y:auto;padding:12px;align-items:flex-start;justify-content:center';
  div.innerHTML = `<div style="width:100%;max-width:420px;margin:0 auto;padding-top:8px;padding-bottom:24px"><div id="trackingDetailContent"></div></div>`;
  // UPDATE: block klik backdrop saat terkunci
  div.addEventListener('click', function(e){
    if(e.target===div && TRACKING_IS_LOCKED){
      e.preventDefault(); e.stopPropagation();
      const inner=div.querySelector('#trackingDetailContent > div');
      if(inner){ try{ inner.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:300}); }catch(err){} }
      return;
    }
  }, true);
  document.body.appendChild(div);
  if(!window._trackingEscBlocker){
    window._trackingEscBlocker=function(e){ if(TRACKING_IS_LOCKED && e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('keydown', window._trackingEscBlocker, true);
  }
  return div;
}

function showTrackingUI(order){
  document.querySelectorAll('#trackingDetailModal').forEach((el,i)=>{ if(i>0) el.remove(); });
  document.querySelectorAll('#trackingLockModal').forEach((el,i)=>{ if(i>0) el.remove(); });
  const modal = ensureTrackingDetailModal();
  const list = document.getElementById('driverList');
  const activeCard = document.getElementById('activeOrderCard');
  const driverActive = document.getElementById('driverActiveOrderCard');
  if(list) list.style.display='none';
  if(activeCard){ activeCard.style.display='none'; activeCard.innerHTML=''; }
  if(driverActive){ driverActive.style.display='none'; }
  if(modal){ modal.style.display='flex'; }
  document.body.style.overflow='hidden';
}

export function hideTrackingUI(){
  if(TRACKING_IS_LOCKED){
    // UPDATE: jangan tutup modal jika masih terkunci (driver sudah terima)
    console.log('🔒 hideTrackingUI diblock, transaksi masih terkunci');
    return;
  }
  const modal = document.getElementById('trackingDetailModal');
  const content = document.getElementById('trackingDetailContent');
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  if(modal) modal.style.display='none'; 
  if(content) content.innerHTML=''; 
  if(card){ card.style.display='none'; card.innerHTML=''; } 
  if(list) list.style.display='block';
  hideTrackingLockModal(); 
  document.body.style.overflow='';
}

// ===== RENDER SINGLE CLEAN CARD =====
function renderActiveOrder(order, driver, opts={}){
  ensureTrackingDetailModal();
  const container = document.getElementById('trackingDetailContent');
  if(!container) return;
  const oldCard = document.getElementById('activeOrderCard');
  if(oldCard){ oldCard.style.display='none'; oldCard.innerHTML=''; }
  
  const isRejected = opts.rejected;
  const rejectedName = opts.driverName || localStorage.getItem('last_driver_name') || 'Driver';
  const noDriver = opts.noDriver;
  const autoInfo = opts.autoInfo;

  const statusMap = { searching:'Mencari driver terdekat...', pending:'Menunggu konfirmasi', accepted:'Driver OTW', picked:'Diantar', completed:'Selesai', cancelled:'Dibatalkan' };
  const statusSteps = { searching:1, pending:2, accepted:3, picked:4, completed:5 };
  const step = statusSteps[order.status]||1;
  const statusText = statusMap[order.status]||order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';
  const tripLabel = order.trip_type==='roundtrip'?'PP':'Sekali';

  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);

  const headerHtml = `
    <div style="background:#16a34a;color:white;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <div style="width:32px;height:32px;background:rgba(0,0,0,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${vehicleIcon}</div>
        <div style="min-width:0"><div style="font-size:12px;font-weight:800;white-space:nowrap">${(() => { try{ let vt = order.vehicle_type; if(!vt) return 'MOTOR'; if(typeof vt !== 'string') vt='motor'; vt = vt.trim().toLowerCase(); if(vt.startsWith('{') || vt.includes('"ID"') || vt.includes('GOOGLE_ID')) return 'MOTOR'; if(vt!=='motor' && vt!=='mobil') return 'MOTOR'; return vt.toUpperCase(); }catch(e){ return 'MOTOR'; } })()} • ${tripLabel}</div><div style="font-size:9px;opacity:0.9">ID ${order.id.slice(0,6).toUpperCase()} • ${new Date(order.created_at||Date.now()).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div></div>
      </div>
      <div style="font-size:10px;background:rgba(0,0,0,0.2);padding:4px 8px;border-radius:6px">${statusText}</div>
    </div>`;

  const progressHtml = `
    <div style="padding:10px 14px 0;display:flex;gap:4px"><div style="flex:1;height:5px;border-radius:3px;background:${step>=1?'#16a34a':'var(--card2)'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=2?'#16a34a':'var(--card2)'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=3?'#16a34a':'var(--card2)'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=4?'#16a34a':'var(--card2)'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=5?'#16a34a':'var(--card2)'}"></div></div>
    <div style="padding:4px 14px 10px;display:flex;justify-content:space-between;font-size:8px;color:var(--muted)"><span>Cari</span><span>Konfirm</span><span>OTW</span><span>Diantar</span><span>Selesai</span></div>`;

  const routeHtml = `
    <div style="margin:0 10px;background:var(--card);border:1px solid var(--card2);padding:10px;border-radius:12px">
      <div style="font-size:12px;color:var(--text);line-height:1.4"><div style="display:flex;gap:6px"><span>📍</span><span style="flex:1"><b style="font-size:9px;color:var(--muted);display:block">PICKUP</b>${order.pickup_text||order.pickup||'-'}</span></div><div style="display:flex;gap:6px;margin-top:8px"><span>🎯</span><span style="flex:1"><b style="font-size:9px;color:var(--muted);display:block">TUJUAN</b>${order.dest_text||order.destination||'-'}</span></div></div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--card2);display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--muted)">📏 ${parseFloat(order.distance_km||order.distance||0).toFixed(2)} km • ${(order.vehicle_type||'motor').toUpperCase()} ${order.trip_type==='roundtrip'?'(PP)':''}</span><span style="font-weight:800;background:#16a34a;color:#052e16;padding:5px 10px;border-radius:8px;font-size:12px">Rp ${(order.estimated_cost||order.cost||0).toLocaleString('id-ID')}</span></div>
    </div>`;

  let bodyHtml = '';
  if(driver){
    bodyHtml = `
      <div style="margin:10px;background:var(--card);border:1px solid #22c55e;border-radius:14px;padding:12px">
        <div style="display:flex;gap:10px;align-items:center"><div style="width:42px;height:42px;background:#16a34a;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800">${driver.name?.charAt(0)||'D'}</div><div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--border)">${driver.name} ${driver.jenis_kendaraan==='mobil'?'🚗':'🏍️'}</div><div style="font-size:10px;color:var(--muted)">${driver.nopol||''} • ${driver.jenis_kendaraan||'motor'}</div></div><div style="font-size:10px;color:#22c55e;font-weight:700">OTW</div></div>
        <div style="margin-top:10px;background:var(--bg);border-radius:10px;padding:8px"><div id="trackingDistance" style="font-weight:700;color:#4ade80;font-size:12px">📍 Menghitung jarak...</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Auto batal jika 5 menit tidak respon • <span id="singleTimeout">${TIMER_TIMEOUT/60}:00</span> sisa</div></div>
        <div style="margin-top:8px;display:flex;gap:6px">${driver.hp ? `<a href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}" target="_blank" style="flex:1;background:#25D366;color:white;padding:10px;text-align:center;border-radius:10px;text-decoration:none;font-weight:700;font-size:12px">💬 WA Driver</a>`:''}<a id="btnOpenDriverMap" href="#" style="flex:1;background:var(--card2);color:var(--border);padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px">🗺️ Map</a></div>
      </div>`;
  } else {
    const alertBox = isRejected ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;padding:10px;display:flex;gap:8px;margin-bottom:10px"><div style="color:#f87171">⚠️</div><div style="flex:1"><div style="font-weight:700;color:#fecaca;font-size:12px">Driver Menolak</div><div style="font-size:11px;color:#fca5a5;margin-top:2px">${rejectedName} menolak. Order akan dibatalkan...</div></div></div>` : noDriver ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;padding:10px;margin-bottom:10px"><div style="font-weight:700;color:#fecaca">😔 Tidak Ada Respon</div><div style="font-size:11px;color:#fca5a5">Order dibatalkan otomatis setelah 5 menit.</div></div>` : `<div style="text-align:center;padding:8px"><div style="font-size:24px">⏳</div><div style="font-size:12px;color:#fbbf24;font-weight:600;margin-top:4px">Menunggu driver menerima...</div><div style="font-size:10px;color:var(--muted);margin-top:2px">Auto batal dalam <span id="singleTimeout2" style="font-weight:800;color:#f87171">05:00</span></div></div>`;
    bodyHtml = `
      <div style="margin:10px;background:rgba(245,158,11,0.08);border:1px dashed #f59e0b;padding:12px;border-radius:14px">
        ${alertBox}
        <div style="text-align:center;margin-top:6px"><div style="font-size:10px;color:#f59e0b;background:var(--bg);border:1px solid var(--card2);padding:4px 8px;border-radius:6px;display:inline-block">⏱️ <span id="singleSearchTimer">00:00</span> • Sisa <span id="singleTimeout2">${TIMER_TIMEOUT/60}:00</span> • ID ${order.id.slice(0,6).toUpperCase()}</div></div>
        ${autoInfo?`<div style="margin-top:8px;font-size:10px;color:var(--muted)">${autoInfo}</div>`:''}
      </div>`;
  }

  container.innerHTML = `
    <div style="border:1px solid var(--card2);border-radius:16px;overflow:hidden;background:var(--bg);box-shadow:0 20px 60px rgba(0,0,0,0.7)">
      ${headerHtml}
      ${progressHtml}
      ${routeHtml}
      ${bodyHtml}
      <div style="padding:10px;background:var(--bg);border-top:1px solid var(--card2);display:flex;gap:8px"><button id="btnCancelTracking" style="flex:1;background:var(--card2);color:#f87171;padding:11px;border-radius:10px;font-weight:600;border:1px solid var(--border);font-size:12px">❌ Batalkan Order</button></div> <!-- UPDATE: tombol Selesai dihilangkan, hanya driver yang bisa selesaikan -->
    </div>`;

  // ===== UPDATE: MATIKAN TIMER & DISABLE BATALKAN & KUNCI POPUP JIKA DRIVER SUDAH TERIMA =====
  (function(){
    const lockedStatuses = ['accepted','picked','on_the_way'];
    // FIX BUG direct driver: jangan lock hanya karena driver ada, cek status accepted/picked saja
    const isLocked = lockedStatuses.includes(order.status);
    if(isLocked){
      lockTrackingPopup();
      // matikan timer
      if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
      if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
      try{
        localStorage.removeItem('auto_start_'+order.id);
        const t1=document.getElementById('singleSearchTimer'); if(t1){ t1.style.display='none'; }
        const t2=document.getElementById('singleTimeout'); if(t2){ t2.textContent='00:00'; t2.style.display='none'; }
        const t3=document.getElementById('singleTimeout2'); if(t3){ t3.textContent='00:00'; t3.style.display='none'; }
        const distEl=document.getElementById('trackingDistance');
        if(distEl && order.status==='accepted'){ distEl.textContent += ' • 🔒 Terkunci'; }
      }catch(e){}
      // disable batalkan
      const btnCancel=document.getElementById('btnCancelTracking');
      if(btnCancel){
        btnCancel.disabled=true;
        btnCancel.style.opacity='0.4';
        btnCancel.style.pointerEvents='none';
        btnCancel.textContent='🔒 Terkunci - Driver OTW';
        btnCancel.title='Tidak bisa dibatalkan, driver sudah terima order';
      }
      // juga lock modal di lockModal
      const btnLockCancel=document.getElementById('btnCancelFromLock');
      if(btnLockCancel){
        btnLockCancel.disabled=true;
        btnLockCancel.style.opacity='0.4';
        btnLockCancel.style.pointerEvents='none';
        btnLockCancel.textContent='🔒 Terkunci';
      }
    } else {
      // masih searching -> pastikan timer jalan, batalkan aktif
      const btnCancel=document.getElementById('btnCancelTracking');
      if(btnCancel){
        btnCancel.disabled=false;
        btnCancel.style.opacity='1';
        btnCancel.style.pointerEvents='auto';
        btnCancel.textContent='❌ Batalkan Order';
        btnCancel.onclick = async ()=>{
          if(!confirm('Batalkan order?')) return;
          try{ await supabase.from('orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
          clearActiveTracking(); hideTrackingUI();
        };
      }
    }
  })();

  setTimeout(()=>{
    const mapBtn = document.getElementById('btnOpenDriverMap');
    if(mapBtn){ mapBtn.onclick = (e)=>{ e.preventDefault(); if(lastDriverLoc){ let dLat,dLng; if(lastDriverLoc.lat&&lastDriverLoc.lng){ dLat=lastDriverLoc.lat; dLng=lastDriverLoc.lng; } if(dLat&&order.pickup_lat){ window.open(`https://www.google.com/maps/dir/${dLat},${dLng}/${order.pickup_lat},${order.pickup_lng}`, '_blank'); } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } }; }
  },100);
}

function subscribeOrderUpdates(orderId){
  if(orderChannel){ try{ supabase.removeChannel(orderChannel); }catch(e){} orderChannel=null; }
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  // Realtime postgres_changes untuk order
  orderChannel = supabase.channel('order-'+orderId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${orderId}` }, payload=>{
      const newOrder = payload.new;
      if(!newOrder) return;
      // Jika cancelled/completed/rejected -> auto tutup modal + rating jika completed
      if(['cancelled','rejected','completed'].includes(newOrder.status)){
        const isCompleted = newOrder.status==='completed';
        const completedData = isCompleted ? { ...newOrder } : null;
        clearInterval(orderPollInterval);
        if(orderPollInterval) { clearInterval(orderPollInterval); orderPollInterval=null; }
        clearActiveTracking();
        hideTrackingUI();
        if(newOrder.status==='cancelled'){
          try{ notifyOjol('❌ Order Dibatalkan', newOrder.cancel_reason || 'Order dibatalkan', '/#/passenger'); }catch(e){}
          try{ alert(newOrder.cancel_reason ? `❌ Order dibatalkan: ${newOrder.cancel_reason}` : '❌ Order dibatalkan'); }catch(e){}
          location.hash = '#/passenger';
        }
        if(isCompleted && completedData){
          console.log('✅ Order completed via realtime, buka rating modal');
          openRatingForCompletedOrder(completedData);
        }
        return;
      }
      handleOrderRejection(newOrder);
    })
    .subscribe();

  // Polling backup setiap 4 detik - FIX RATING
  orderPollInterval = setInterval(async ()=>{
    try{
      const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(error || !o) return;
      if(['completed','cancelled','rejected'].includes(o.status)){
        const isComp = o.status==='completed';
        const compData = isComp ? { ...o } : null;
        clearInterval(orderPollInterval); orderPollInterval=null;
        clearActiveTracking();
        hideTrackingUI();
        if(o.status==='cancelled'){
          try{ notifyOjol('❌ Order Dibatalkan', o.cancel_reason || 'Order dibatalkan', '/#/passenger'); }catch(e){}
          try{ alert(o.cancel_reason ? `❌ Order dibatalkan: ${o.cancel_reason}` : '❌ Order dibatalkan'); }catch(e){}
          location.hash = '#/passenger';
        }
        if(isComp && compData){
          const compKey = 'completed_notif_'+compData.id;
          if(!sessionStorage.getItem(compKey)){
            sessionStorage.setItem(compKey,'1');
            console.log('✅ Order completed via polling, buka rating modal');
            openRatingForCompletedOrder(compData);
          }
        }
        return;
      }
      handleOrderRejection(o);
    }catch(e){}
  }, 4000);
}

function handleOrderRejection(newOrder){
  if(newOrder.driver_id){
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    // UPDATE: jika accepted/picked, kunci & matikan timer & disable batalkan
    const lockStatuses=['accepted','picked','on_the_way'];
    // FIX BUG: hanya lock jika sudah accepted/picked, jangan saat driver_assigned / searching
    if(lockStatuses.includes(newOrder.status)){
      lockTrackingPopup();
      if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
      try{
        localStorage.removeItem('auto_start_'+newOrder.id);
        const b1=document.getElementById('btnCancelTracking'); if(b1){ b1.disabled=true; b1.style.opacity='0.4'; b1.style.pointerEvents='none'; b1.textContent='🔒 Terkunci - Driver OTW'; }
      }catch(e){}
    }
    lastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_driver_id', newOrder.driver_id); }catch(e){}
    fetchDriverProfile(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
      renderActiveOrder(newOrder, driver);
      subscribeDriverLocation(newOrder.driver_id);
      startDistanceUpdater(newOrder);
      const si = document.getElementById('searchInfo'); if(si) si.textContent = `✅ Driver ${driver?.name||''} OTW`;
      try{
        // FIX BERULANG: dedup per order+status
        const notifKey = 'notif_'+newOrder.id+'_'+newOrder.status;
        if(sessionStorage.getItem(notifKey)) { /* sudah pernah notif status ini */ }
        else {
          const isNew = newOrder.driver_id !== localStorage.getItem('_last_notified_driver');
          if(isNew && newOrder.status==='accepted'){
            localStorage.setItem('_last_notified_driver', newOrder.driver_id);
            sessionStorage.setItem(notifKey, '1');
            notifyOjol('✅ Driver Ditemukan!', `Driver ${driver?.name||''} OTW ke pickup - ${newOrder.dest_text||''}`, '/#/passenger', newOrder.id);
          } else if(newOrder.status==='picked'){
            sessionStorage.setItem(notifKey, '1');
            notifyOjol('🚗 Driver OTW Tujuan', `Driver mengantar ke ${newOrder.dest_text}`, '/#/passenger', newOrder.id);
          }
        }
      }catch(e){}
    });
  } else {
    // Driver menolak atau belum ada driver
    if(lastKnownDriverId && newOrder.status==='searching'){
      // Driver yang sebelumnya assigned menolak -> batalkan otomatis sesuai request
      (async ()=>{
        try{
          await supabase.from('orders').update({ status:'cancelled', cancel_reason:'Driver menolak order' }).eq('id', newOrder.id);
        }catch(e){}
      })();
      return;
    }
    renderActiveOrder(newOrder, null);
  }
}

// ===== TIMER FINAL - 5 MENIT AUTO BATAL + AUTO TUTUP MODAL =====
function startUnifiedTimer(orderId){
  // UPDATE: jika sudah locked (driver terima) jangan start timer
  if(TRACKING_IS_LOCKED){
    if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    return;
  }
  if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  searchStartTime = Date.now();
  searchSeconds = 0;
  try{
    const saved = localStorage.getItem('auto_start_'+orderId);
    if(saved){
      const parsed = parseInt(saved);
      if(!isNaN(parsed)){
        searchStartTime = parsed;
        searchSeconds = Math.floor((Date.now()-parsed)/1000);
      }
    } else {
      localStorage.setItem('auto_start_'+orderId, searchStartTime.toString());
    }
  }catch(e){
    try{ localStorage.setItem('auto_start_'+orderId, searchStartTime.toString()); }catch(e2){}
  }

  autoAssignTimer = setInterval(async ()=>{
    if(TRACKING_IS_LOCKED){
      clearInterval(autoAssignTimer); autoAssignTimer=null;
      try{
        const t1=document.getElementById('singleSearchTimer'); if(t1) t1.style.display='none';
        const t2=document.getElementById('singleTimeout'); if(t2){ t2.style.display='none'; }
        const t3=document.getElementById('singleTimeout2'); if(t3){ t3.style.display='none'; }
      }catch(e){}
      return;
    }
    const elapsed = Math.floor((Date.now()-searchStartTime)/1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(Math.floor(elapsed%60)).padStart(2,'0');
    const remain = Math.max(0, TIMER_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');

    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const t3 = document.getElementById('singleTimeout2');
    const t3b = document.getElementById('singleTimeout');
    if(t1) t1.textContent = `${m}:${s}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    if(t3) t3.textContent = `${rm}:${rs}`;

    if(elapsed >= TIMER_TIMEOUT){
      clearInterval(autoAssignTimer); autoAssignTimer=null;
      try{
        const { data: cur } = await supabase.from('orders').select('status').eq('id', orderId).single();
        if(cur && ['searching','pending','new','open','created','waiting'].includes(cur.status)){
          await supabase.from('orders').update({ status:'cancelled', cancel_reason:'Timeout 5 menit tidak ada respon driver' }).eq('id', orderId);
        }
      }catch(e){ console.warn('cancel timeout fail', e.message); }
      try{
        localStorage.removeItem('auto_start_'+orderId);
        localStorage.removeItem('auto_queue_'+orderId);
        localStorage.removeItem('auto_index_'+orderId);
        localStorage.removeItem('last_driver_id');
        localStorage.removeItem('last_driver_name');
      }catch(e){}
      alert('⏰ 5 menit tidak ada respon driver. Order dibatalkan otomatis. Silakan buat order baru.');
      clearActiveTracking();
      hideTrackingUI();
      location.hash = '#/passenger';
    }
  },1000);
}

function startNoDriverCheck(orderId){ startUnifiedTimer(orderId); }
function startAutoAssignTimeout(orderId){ startUnifiedTimer(orderId); }

function subscribeDriverLocation(driverId){
  if(driverLocationChannel){ try{ supabase.removeChannel(driverLocationChannel); }catch(e){} driverLocationChannel=null; }
  driverLocationChannel = supabase.channel('driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateDriverDistance(payload.new); })
    .subscribe();
}
function updateDriverDistance(driverLoc){
  if(!driverLoc) return; lastDriverLoc = driverLoc;
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

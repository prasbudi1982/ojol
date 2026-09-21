// tracking.js - FIX PENOLAKAN DRIVER SAMPAI KE PENUMPANG - single card
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

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
    <div style="background:white;border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🔒</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Order Aktif Berjalan</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:12px;color:#0f172a">
          <div>📍 ${order.pickup_text||order.pickup||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||order.destination||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:#64748b">ID ${order.id.slice(0,6).toUpperCase()}</span></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Driver</button>
          <button id="btnCancelFromLock" style="background:white;border:1px solid #e2e8f0;color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Order</button>
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

export function startTracking(orderId){
  if(!orderId) return;
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  loadActiveTracking();
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
    if(modalContent){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='flex'; modalContent.innerHTML = `<div style="background:white;border-radius:16px;padding:20px;text-align:center">⏳ Memuat tracking... ID ${orderId.slice(0,8)}</div>`; }
    if(card){ card.style.display='none'; card.innerHTML=''; }
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(error || !order){ return null; }
    if(['completed','cancelled','rejected'].includes(order.status)){ clearActiveTracking(); hideTrackingUI(); return null; }
    showTrackingUI(order);
    subscribeOrderUpdates(orderId);
    if(order.driver_id){
      const driver = await fetchDriverProfile(order.driver_id);
      try{ localStorage.setItem('last_driver_id', order.driver_id); localStorage.setItem('last_driver_name', driver?.name||'Driver'); lastKnownDriverId = order.driver_id; }catch(e){}
      renderActiveOrder(order, driver);
      subscribeDriverLocation(order.driver_id);
      startDistanceUpdater(order);
    } else {
      // Kalau searching tanpa driver tapi sebelumnya ada last_driver_id, itu penolakan
      const prevId = lastKnownDriverId || localStorage.getItem('last_driver_id');
      if(prevId){
        const lastName = localStorage.getItem('last_driver_name')||'Driver';
        renderActiveOrder(order, null, {rejected:true, driverName:lastName});
      } else {
        renderActiveOrder(order, null);
      }
    }
    return order;
  }catch(e){ return null; }
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
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(11,15,20,0.88);backdrop-filter:blur(14px);z-index:9997;overflow-y:auto;padding:16px;align-items:flex-start;justify-content:center';
  div.innerHTML = `<div style="width:100%;max-width:440px;margin:0 auto;padding-top:4px;padding-bottom:24px"><div id="trackingDetailContent"></div><div style="text-align:center;margin-top:14px;font-size:10px;color:#64748b">🔒 Order terkunci sampai selesai</div></div>`;
  document.body.appendChild(div);
  div.addEventListener('click', (e)=>{ if(e.target===div) e.stopPropagation(); });
  return div;
}

function showTrackingUI(order){
  const modal = ensureTrackingDetailModal();
  const list = document.getElementById('driverList');
  if(list) list.style.display='none';
  if(modal){ modal.style.display='flex'; }
  document.body.style.overflow='hidden';
  const pickup = document.getElementById('pickup'); const dest = document.getElementById('dest'); const btnOrder = document.getElementById('btnOrder'); const formCard = document.getElementById('orderFormCard');
  if(pickup) pickup.disabled=true; if(dest) dest.disabled=true; if(btnOrder){ btnOrder.disabled=true; btnOrder.style.opacity='0.5'; btnOrder.textContent='🔒 Order aktif'; } if(formCard){ formCard.style.opacity='0.4'; formCard.style.pointerEvents='none'; }
}

function hideTrackingUI(){
  const modal = document.getElementById('trackingDetailModal');
  const content = document.getElementById('trackingDetailContent');
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  if(modal) modal.style.display='none'; if(content) content.innerHTML=''; if(card){ card.style.display='none'; card.innerHTML=''; } if(list) list.style.display='block';
  hideTrackingLockModal(); document.body.style.overflow='';
  const pickup = document.getElementById('pickup'); const dest = document.getElementById('dest'); const btnOrder = document.getElementById('btnOrder'); const formCard = document.getElementById('orderFormCard');
  if(pickup) pickup.disabled=false; if(dest) dest.disabled=false; if(btnOrder){ btnOrder.disabled=false; btnOrder.style.opacity='1'; btnOrder.textContent='🚀 Order Sekarang'; } if(formCard){ formCard.style.opacity='1'; formCard.style.pointerEvents='auto'; }
}

export function clearActiveTracking(){
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  if(orderChannel){ supabase.removeChannel(orderChannel); orderChannel=null; }
  if(driverLocationChannel){ supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  searchStartTime=null; searchSeconds=0; lastKnownDriverId=null;
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  localStorage.removeItem('active_order_id'); localStorage.removeItem('pickup_lat'); localStorage.removeItem('pickup_lng'); currentOrderId=null;
  hideTrackingUI();
}

// ===== RENDER SINGLE CARD - PENOLAKAN DI DALAM CARD LOADING, TIDAK BUAT CARD BARU =====
function renderActiveOrder(order, driver, opts={}){
  ensureTrackingDetailModal();
  const card = document.getElementById('trackingDetailContent');
  if(!card) return;
  const oldCard = document.getElementById('activeOrderCard');
  if(oldCard){ oldCard.style.display='none'; oldCard.innerHTML=''; }
  const isRejected = opts.rejected;
  const rejectedName = opts.driverName || localStorage.getItem('last_driver_name') || 'Driver';
  const noDriver = opts.noDriver; // flag tidak ada driver aktif

  const statusMap = { searching:'🔍 Mencari driver terdekat...', pending:'⏳ Menunggu konfirmasi', accepted:'✅ Driver OTW', picked:'🚗 Diantar', completed:'✅ Selesai', cancelled:'❌ Dibatalkan' };
  const statusSteps = { searching:1, pending:2, accepted:3, picked:4, completed:5 };
  const step = statusSteps[order.status]||1;
  const statusText = statusMap[order.status]||order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';

  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);

  // Template loading menunggu driver dengan slot notif di dalamnya
  const waitingCardInner = `
    <div style="margin:12px;background:rgba(245,158,11,0.08);border:1px dashed #f59e0b;padding:18px;border-radius:16px;text-align:center">
      ${isRejected ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;display:flex;gap:8px;align-items:center;text-align:left;margin-bottom:12px"><div style="width:32px;height:32px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px">⚠️</div><div style="flex:1"><div style="font-weight:800;color:#991b1b;font-size:12px">Driver Menolak</div><div style="font-size:11px;color:#7f1d1d;margin-top:1px">${rejectedName} tidak bisa melanjutkan. Mencari driver lain...</div></div></div>` : ''}
      ${noDriver ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;display:flex;gap:8px;align-items:center;text-align:left;margin-bottom:12px"><div style="width:32px;height:32px;background:#991b1b;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white">😔</div><div style="flex:1"><div style="font-weight:800;color:#991b1b;font-size:12px">Tidak Ada Driver Aktif</div><div style="font-size:11px;color:#7f1d1d;margin-top:1px">Tidak ada driver online di ${ACTIVE_KECAMATAN_NAME||'Suruh'} saat ini. Order akan dibatalkan otomatis.</div></div></div>` : ''}
      ${!isRejected && !noDriver ? `<div style="font-size:28px">⏳</div><div style="font-size:13px;color:#fbbf24;font-weight:700;margin-top:8px">Menunggu driver menerima order...</div><div style="font-size:11px;color:#8aa0b8;margin-top:4px">Order terkirim ke driver terdekat di ${ACTIVE_KECAMATAN_NAME||'Suruh'}</div>` : ''}
      ${isRejected ? `<div style="font-size:13px;color:#fbbf24;font-weight:700;margin-top:4px">⏳ Mencari driver pengganti...</div>` : ''}
      <div style="margin-top:10px;font-size:10px;color:#f59e0b;background:#0b0f14;border:1px solid #263240;padding:6px 10px;border-radius:8px;display:inline-block">ID ${order.id.slice(0,8).toUpperCase()} • <span id="searchTimer">00:00</span></div>
    </div>`;

  card.innerHTML = `
    <div style="border:1px solid #263240;border-radius:20px;overflow:hidden;background:#151c25;box-shadow:0 12px 40px rgba(0,0,0,0.5);color:#e6edf5">
      <div style="background:linear-gradient(135deg, ${getAppTheme().primary}, #16a34a);color:#052e16;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px"><span style="width:36px;height:36px;background:rgba(0,0,0,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">${vehicleIcon}</span><div><div style="font-size:13px;font-weight:800">${order.vehicle_type?.toUpperCase()||'MOTOR'} • ${order.trip_type==='roundtrip'?'PP':'Sekali'}</div><div style="font-size:10px;opacity:0.7">ID ${order.id.slice(0,6).toUpperCase()}</div></div></div><span style="background:rgba(0,0,0,0.25);color:white;padding:6px 12px;border-radius:20px;font-size:10px;font-weight:800">${statusText}</span>
      </div>
      <div style="padding:14px 16px 0;display:flex;gap:6px"><div style="flex:1;height:6px;border-radius:3px;background:${step>=1?getAppTheme().primary:'#1d2633'}"></div><div style="flex:1;height:6px;border-radius:3px;background:${step>=2?getAppTheme().primary:'#1d2633'}"></div><div style="flex:1;height:6px;border-radius:3px;background:${step>=3?getAppTheme().primary:'#1d2633'}"></div><div style="flex:1;height:6px;border-radius:3px;background:${step>=4?getAppTheme().primary:'#1d2633'}"></div><div style="flex:1;height:6px;border-radius:3px;background:${step>=5?getAppTheme().primary:'#1d2633'}"></div></div>
      <div style="padding:6px 16px 12px;display:flex;justify-content:space-between;font-size:9px;color:#8aa0b8"><span>Cari</span><span>Konfirm</span><span>OTW</span><span>Diantar</span><span>Selesai</span></div>
      <div style="margin:0 12px;background:#1d2633;border:1px solid #263240;padding:12px;border-radius:14px">
        <div style="font-size:13px;color:#e6edf5"><div>📍 ${order.pickup_text||order.pickup||'-'}</div><div style="margin-top:8px">🎯 ${order.dest_text||order.destination||'-'}</div></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #263240;display:flex;justify-content:space-between"><span style="font-size:11px;color:#8aa0b8">📏 ${order.distance_km?.toFixed?.(2)||order.distance_km||'-'} km</span><span style="font-weight:800;background:#0b0f14;border:1px solid #263240;padding:6px 12px;border-radius:10px">Rp ${order.estimated_cost?.toLocaleString('id-ID')||'-'}</span></div>
      </div>
      ${driver ? `<div style="margin:12px;background:#1d2633;border:1px solid #263240;border-radius:16px;padding:14px"><div style="display:flex;gap:12px;align-items:center"><div style="width:48px;height:48px;background:linear-gradient(135deg,#22c55e,#16a34a);border-radius:14px;display:flex;align-items:center;justify-content:center;color:#052e16;font-weight:800">${driver.name?.charAt(0)||'D'}</div><div style="flex:1"><div style="font-weight:800">${driver.name} ${driver.jenis_kendaraan==='mobil'?'🚗':'🏍️'}</div><div style="font-size:11px;color:#8aa0b8">${driver.nopol||''} • ${driver.jenis_kendaraan||'motor'}</div></div></div><div style="margin-top:12px;background:#0b0f14;border:1px solid #263240;border-radius:12px;padding:12px"><div id="trackingDistance" style="font-weight:800;color:#4ade80">📍 Menghitung jarak...</div><div id="trackingETA" style="font-size:11px;color:#8aa0b8">⏱️ Menunggu lokasi...</div></div><div style="margin-top:12px;display:flex;gap:8px">${driver.hp ? `<a href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}" target="_blank" style="flex:1;background:#25D366;color:white;padding:12px;text-align:center;border-radius:12px;text-decoration:none;font-weight:800">💬 WA</a>`:''}<a id="btnOpenDriverMap" href="#" style="flex:1;background:#151c25;border:1px solid #263240;color:#e6edf5;padding:12px;border-radius:12px;text-align:center;text-decoration:none;font-weight:700">🗺️ Maps</a></div></div>` : waitingCardInner}
      <div style="padding:12px;background:#0b0f14;border-top:1px solid #263240;display:flex;gap:8px;margin-top:12px;border-radius:0 0 20px 20px"><button id="btnCancelTracking" style="flex:1;background:#1d2633;border:1px solid #263240;color:#f87171;padding:12px;border-radius:12px;font-weight:700">❌ Batalkan</button><button id="btnCompleteOrder" style="flex:1;background:#22c55e;color:#052e16;border:none;padding:12px;border-radius:12px;font-weight:800">✅ Selesai</button></div>
    </div>`;

  setTimeout(()=>{
    const mapBtn = document.getElementById('btnOpenDriverMap');
    if(mapBtn){ mapBtn.onclick = (e)=>{ e.preventDefault(); if(lastDriverLoc){ let dLat,dLng; if(lastDriverLoc.lat&&lastDriverLoc.lng){ dLat=lastDriverLoc.lat; dLng=lastDriverLoc.lng; } if(dLat&&order.pickup_lat){ window.open(`https://www.google.com/maps/dir/${dLat},${dLng}/${order.pickup_lat},${order.pickup_lng}`, '_blank'); } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } }; }
  },100);
}


function subscribeOrderUpdates(orderId){
  if(orderChannel){ supabase.removeChannel(orderChannel); orderChannel=null; }
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  // Simpan driver_id awal untuk deteksi penolakan
  try{ lastKnownDriverId = localStorage.getItem('last_driver_id') || null; }catch(e){}
  orderChannel = supabase.channel('order-tracking-'+orderId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${orderId}` }, async payload=>{
      const newOrder = payload.new;
      if(newOrder.pickup_lat) localStorage.setItem('pickup_lat', newOrder.pickup_lat);
      if(newOrder.pickup_lng) localStorage.setItem('pickup_lng', newOrder.pickup_lng);
      if(['completed','cancelled','rejected'].includes(newOrder.status)){
        try{ if(navigator.vibrate) navigator.vibrate([200,100,200]); }catch(e){}
        if(newOrder.status==='completed' && newOrder.driver_id){
          try{
            const { data: drv } = await supabase.from('users').select('name').eq('id', newOrder.driver_id).maybeSingle();
            clearActiveTracking(); hideTrackingUI();
            const mod = await import('./rating.js'); mod.openRatingModal(newOrder.driver_id, drv?.name||'Driver', newOrder.id); return;
          }catch(e){}
        }
        alert(`Order ${newOrder.status}`); clearActiveTracking(); hideTrackingUI(); location.hash='#/'; return;
      }
      handleOrderRejection(newOrder);
    })
    .on('broadcast', { event: 'driver_rejected' }, async payload=>{
      console.log('Broadcast driver_rejected received', payload);
      try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
      const driverName = payload?.payload?.driverName || localStorage.getItem('last_driver_name') || 'Driver';
      const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(cur){
        renderActiveOrder(cur, null, {rejected:true, driverName});
        // Penumpang null-kan driver_id sendiri
        try{ await supabase.from('orders').update({ driver_id: null, accepted_at: null }).eq('id', orderId); }catch(e){}
        setTimeout(()=>{ try{ localStorage.removeItem('last_driver_name'); localStorage.removeItem('last_driver_id'); lastKnownDriverId=null; }catch(e){} },8000);
      }
    })
    .subscribe();

  // POLLING BACKUP - pastikan penolakan sampai meski realtime miss di HP
  orderPollInterval = setInterval(async ()=>{
    try{
      const { data: o, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(error || !o) return;
      if(['completed','cancelled','rejected'].includes(o.status)){
        clearInterval(orderPollInterval); return;
      }
      handleOrderRejection(o);
    }catch(e){}
  }, 4000);
}

function handleOrderRejection(newOrder){
  // Reset no driver timer jika ada driver
  if(newOrder.driver_id){
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    // Jika status searching tapi driver_id masih ada dan sama dengan lastKnown = sinyal PENOLAKAN dari driver (RLS-safe flow)
    if(newOrder.status==='searching' && lastKnownDriverId && newOrder.driver_id===lastKnownDriverId){
      try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
      const lastName = localStorage.getItem('last_driver_name')||'Driver';
      renderActiveOrder(newOrder, null, {rejected:true, driverName:lastName});
      const si = document.getElementById('searchInfo'); if(si) si.textContent = `⚠️ ${lastName} menolak - mencari driver lain...`;
      (async ()=>{
        try{
          const { error } = await supabase.from('orders').update({ driver_id: null, accepted_at: null }).eq('id', newOrder.id);
          if(error) console.warn('passenger nullify failed', error.message);
        }catch(e){ console.warn(e); }
      })();
      setTimeout(()=>{ try{ localStorage.removeItem('last_driver_name'); localStorage.removeItem('last_driver_id'); lastKnownDriverId=null; }catch(e){} },8000);
      startNoDriverCheck(newOrder.id);
      return;
    }
    // Ada driver baru / masih OTW
    lastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_driver_id', newOrder.driver_id); }catch(e){}
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    fetchDriverProfile(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
      renderActiveOrder(newOrder, driver);
      subscribeDriverLocation(newOrder.driver_id);
      startDistanceUpdater(newOrder);
      const si = document.getElementById('searchInfo'); if(si) si.textContent = `✅ Driver ${driver?.name||''} OTW - ${newOrder.status}`;
    });
  } else {
    // driver_id null
    if(lastKnownDriverId || localStorage.getItem('last_driver_id')){
      if(newOrder.status==='searching'){
        try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
        const lastName = localStorage.getItem('last_driver_name')||'Driver';
        renderActiveOrder(newOrder, null, {rejected:true, driverName:lastName});
        startNoDriverCheck(newOrder.id);
        return;
      }
    }
    // Murni searching tanpa pernah dapat driver - cek apakah ada driver aktif
    renderActiveOrder(newOrder, null);
    startNoDriverCheck(newOrder.id);
  }
}

function startNoDriverCheck(orderId){
  if(noDriverTimer) return;
  if(!searchStartTime) searchStartTime = Date.now();
  noDriverTimer = setInterval(async ()=>{
    searchSeconds++;
    const timerEl = document.getElementById('searchTimer');
    if(timerEl){
      const m = String(Math.floor(searchSeconds/60)).padStart(2,'0');
      const s = String(searchSeconds%60).padStart(2,'0');
      timerEl.textContent = `${m}:${s}`;
    }
    // Setiap 10 detik cek apakah ada driver online di Suruh
    if(searchSeconds % 10 === 0){
      try{
        const { data: onlineDrivers, error } = await supabase.from('users').select('id').eq('role','driver').eq('status','online').limit(1);
        if(!error && (!onlineDrivers || onlineDrivers.length===0)){
          // Tidak ada driver aktif
          if(searchSeconds >= 30){
            console.log('No active driver detected');
            const { data: cur } = await supabase.from('orders').select('status,driver_id').eq('id', orderId).single();
            if(cur && cur.status==='searching' && !cur.driver_id){
              renderActiveOrder(cur, null, {noDriver:true});
              // Auto batalkan setelah 5 detik tampil notif
              setTimeout(async ()=>{
                try{
                  await supabase.from('orders').update({ status:'cancelled' }).eq('id', orderId);
                  alert('😔 Tidak ada driver aktif di Suruh saat ini. Order dibatalkan otomatis.');
                  clearActiveTracking(); hideTrackingUI(); location.hash='#/';
                }catch(e){}
              },5000);
              clearInterval(noDriverTimer); noDriverTimer=null;
            }
          }
        }
      }catch(e){}
    }
    // Timeout total 90 detik tanpa driver -> auto cancel
    if(searchSeconds >= 90){
      try{
        const { data: cur } = await supabase.from('orders').select('status,driver_id').eq('id', orderId).single();
        if(cur && cur.status==='searching' && !cur.driver_id){
          renderActiveOrder(cur, null, {noDriver:true});
          setTimeout(async ()=>{
            try{
              await supabase.from('orders').update({ status:'cancelled' }).eq('id', orderId);
              alert('😔 Tidak ada driver yang menerima order. Order dibatalkan otomatis.');
              clearActiveTracking(); hideTrackingUI(); location.hash='#/';
            }catch(e){}
          },5000);
          clearInterval(noDriverTimer); noDriverTimer=null;
        }
      }catch(e){}
    }
  },1000);
}



function subscribeDriverLocation(driverId){
  if(driverLocationChannel){ supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  driverLocationChannel = supabase.channel('driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateDriverDistance(payload.new); })
    .subscribe();
}
function updateDriverDistance(driverLoc){
  if(!driverLoc) return; lastDriverLoc = driverLoc;
  const pickupLat = parseFloat(localStorage.getItem('pickup_lat')); const pickupLng = parseFloat(localStorage.getItem('pickup_lng'));
  let dLat,dLng; if(driverLoc.lat&&driverLoc.lng){ dLat=driverLoc.lat; dLng=driverLoc.lng; } else if(driverLoc.lokasi){ const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }
  const el = document.getElementById('trackingDistance'); const etaEl = document.getElementById('trackingETA');
  if(!dLat||!pickupLat){ if(el) el.textContent = `📍 Driver online`; return; }
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  if(el){ el.textContent = dist<0.1? `🎉 Driver dekat! ${dist.toFixed(2)} km` : `📍 Driver ${dist.toFixed(2)} km`; }
}
function startDistanceUpdater(order){
  if(trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(async ()=>{
    if(!order.driver_id) return;
    try{ const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single(); if(data) updateDriverDistance(data); }catch(e){}
  },5000);
}
export function driverAcceptOrder(orderId, driverProfile){
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
let driverOrdersChannel = null; let driverOrdersInterval = null;
export async function loadDriverOrders(driverProfile){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('driverOrders'); const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  const theme = getAppTheme(); const primary = theme.primary; const secondary = theme.secondary;
  if(infoEl) infoEl.textContent = '⏳ Mencari...';
  box.innerHTML = `<div style="padding:16px;text-align:center">⏳ Memuat order...</div>`;
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(30);
    if(q1.error) throw q1.error;
    let rejectedIds=[]; try{ rejectedIds = JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders = (q1.data||[]).filter(o => (!o.driver_id || o.driver_id===driverProfile.id) && !rejectedIds.includes(o.id));
    const myVeh = driverProfile.jenis_kendaraan||'motor';
    if(orders.length===0){ box.innerHTML = `<div style="padding:20px;text-align:center"><div>📭</div><div>Menunggu order...</div><button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:14px">🔄 Refresh</button></div>`; if(infoEl) infoEl.textContent=''; return; }
    if(infoEl) infoEl.textContent = `${orders.length} order`;
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id===driverProfile.id; const isBroadcast = !o.driver_id; const vehMatch = (o.vehicle_type||'motor')===myVeh;
      const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-'; const cost = o.estimated_cost||o.cost||0; const dist = o.distance_km||o.distance||0;
      let pickupMapUrl = o.pickup_lat? `https://www.google.com/maps?q=${o.pickup_lat},${o.pickup_lng}`:'#';
      let routeMapUrl = (o.pickup_lat&&o.dest_lat)? `https://www.google.com/maps/dir/${o.pickup_lat},${o.pickup_lng}/${o.dest_lat},${o.dest_lng}`:pickupMapUrl;
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+primary:'1px solid #e2e8f0'};border-radius:14px;background:white">
        <div style="background:${isForMe?primary:'#0f172a'};color:white;padding:8px 12px;display:flex;justify-content:space-between"><b>${(o.vehicle_type||'motor').toUpperCase()}</b><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${isForMe?'white':secondary};color:${isForMe?primary:'#0f172a'};font-weight:800">${isForMe?'UNTUK SAYA': isBroadcast?'BARU':o.status.toUpperCase()}</span></div>
        <div style="padding:12px"><div style="font-size:13px;color:#0f172a">📍 ${pickup}<br/>🎯 ${dest}</div><div style="margin-top:8px;display:flex;justify-content:space-between"><span style="font-size:11px;color:#64748b">📏 ${typeof dist==='number'?dist.toFixed(2):dist} km</span><span style="font-weight:800;background:#fef3c7;padding:3px 8px;border-radius:6px">Rp ${cost.toLocaleString('id-ID')}</span></div>${!vehMatch && isBroadcast? `<div style="font-size:10px;color:#d97706;margin-top:6px">⚠️ Beda kendaraan</div>`:''}</div>
        <div style="padding:0 12px 12px;display:flex;gap:6px"><a href="${pickupMapUrl}" target="_blank" style="flex:1;background:#0f172a;color:white;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px">🗺️ Map</a><a href="${routeMapUrl}" target="_blank" style="flex:1;background:#f1f5f9;border:1px solid #cbd5e1;color:#0f172a;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px">📍 Rute</a></div>
        <div style="padding:0 12px 12px;display:flex;gap:6px"><button data-driver-accept="${o.id}" class="btn primary" style="flex:1;background:${primary};color:white;padding:12px;border-radius:10px;font-weight:800;border:none">✅ TERIMA</button><button data-driver-reject="${o.id}" class="btn secondary" style="background:white;border:1px solid #e2e8f0;padding:10px 14px;border-radius:10px">❌</button></div></div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button id="btnRefreshDriverOrders" class="btn secondary">🔄 Refresh (${orders.length})</button></div>`;
  }catch(e){ if(box) box.innerHTML = `<div style="padding:16px;text-align:center;background:#fef2f2">Gagal memuat<br/>${e.message}</div>`; }
}
function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, payload=>{ const o=payload.new; if(o.driver_id===driverProfile.id || !o.driver_id){ loadDriverOrders(driverProfile); } })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, ()=>{ loadDriverOrders(driverProfile); })
    .subscribe();
  driverOrdersInterval = setInterval(()=> loadDriverOrders(driverProfile), 10000);
}
export function clearDriverOrdersSubscription(){ if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; } if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; } }
export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️'; const isOnline = (p.status==='online'); const theme = getAppTheme();
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon}</h3><p class="muted">${p.nopol||''} • ${vehIcon} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi data di Profil</p>':''}<div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white':''}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div><div class="card"><h4>📥 Order Masuk <span id="driverOrdersInfo"></span></h4><div id="driverOrders">Menunggu order...</div></div><div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}
export function initDriverPage(driverProfile){ if(!driverProfile) return; setTimeout(()=> loadDriverOrders(driverProfile),500); subscribeDriverOrders(driverProfile); }

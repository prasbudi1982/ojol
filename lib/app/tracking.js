// tracking.js - FIX MODAL HEADER + TIMER SINGLE + AUTO ASSIGN - v18
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
let autoAssignTimer = null;
const DRIVER_TIMEOUT = 40;

export function startTracking(orderId){
  if(!orderId) return;
  // FIX BUG: id order tidak berubah & langsung ditolak karena last_driver_id lama
  try{
    localStorage.removeItem('last_driver_id');
    localStorage.removeItem('last_driver_name');
    localStorage.removeItem('auto_start_'+orderId);
    // jangan hapus queue/index global, tapi reset lastKnown
  }catch(e){}
  lastKnownDriverId = null;
  searchStartTime = null;
  searchSeconds = 0;
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  loadActiveTracking();
}

export function clearActiveTracking(){
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
  lastKnownDriverId = null;
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
    if(modalContent){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='flex'; modalContent.innerHTML = `<div style="background:#151c25;border:1px solid #263240;border-radius:16px;padding:20px;text-align:center;color:#e6edf5">⏳ Memuat tracking... ID ${orderId.slice(0,8)}</div>`; }
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
      startUnifiedTimer(orderId);
    } else {
      // FIX: order baru langsung ditolak karena last_driver_id lama - jangan tampilkan rejected di load awal
      // Hanya tampilkan searching, bukan rejected, kecuali memang pernah ada driver untuk order ID ini
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
  document.body.appendChild(div);
  return div;
}

function showTrackingUI(order){
  // Hapus semua modal lama yang mungkin dobel
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

function hideTrackingUI(){
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

// ===== RENDER SINGLE CLEAN CARD - FIX HEADER KACAU =====
function renderActiveOrder(order, driver, opts={}){
  ensureTrackingDetailModal();
  const container = document.getElementById('trackingDetailContent');
  if(!container) return;
  // Bersihkan card lama
  const oldCard = document.getElementById('activeOrderCard');
  if(oldCard){ oldCard.style.display='none'; oldCard.innerHTML=''; }
  
  const isRejected = opts.rejected;
  const rejectedName = opts.driverName || localStorage.getItem('last_driver_name') || 'Driver';
  const noDriver = opts.noDriver;
  const autoAssign = opts.autoAssign;
  const autoInfo = opts.autoInfo;

  const statusMap = { searching:'Mencari driver terdekat...', pending:'Menunggu konfirmasi', accepted:'Driver OTW', picked:'Diantar', completed:'Selesai', cancelled:'Dibatalkan' };
  const statusSteps = { searching:1, pending:2, accepted:3, picked:4, completed:5 };
  const step = statusSteps[order.status]||1;
  const statusText = statusMap[order.status]||order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';
  const tripLabel = order.trip_type==='roundtrip'?'PP':'Sekali';

  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);

  let queueInfo = '';
  try{
    const q = JSON.parse(localStorage.getItem('auto_queue_'+order.id)||'[]');
    const idx = parseInt(localStorage.getItem('auto_index_'+order.id)||'0');
    if(q.length>0){
      queueInfo = `<div style="margin-top:10px;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:8px 10px">
        <div style="font-size:10px;color:#94a3b8;display:flex;justify-content:space-between"><span>🔄 Auto ${idx+1}/${q.length}</span><span style="font-size:9px">ID ${order.id.slice(0,6).toUpperCase()} • tetap</span></div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${q.map((d,i)=>`<span style="padding:2px 6px;border-radius:6px;font-size:9px;background:${i<idx?'#1e293b':i===idx?'#16a34a':'#0f172a'};color:${i===idx?'white':'#64748b'};border:1px solid ${i===idx?'#22c55e':'#1e293b'}">${i+1}.${d.name?.split(' ')[0]||'Dr'}${i<idx?'❌':i===idx?'⏳':''}</span>`).join('')}</div>
      </div>`;
    }
  }catch(e){}

  // SINGLE HEADER - tidak dobel
  const headerHtml = `
    <div style="background:#16a34a;color:white;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <div style="width:32px;height:32px;background:rgba(0,0,0,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${vehicleIcon}</div>
        <div style="min-width:0"><div style="font-size:12px;font-weight:800;white-space:nowrap">${(() => { try{ let vt = order.vehicle_type; if(!vt) return 'MOTOR'; if(typeof vt !== 'string') vt='motor'; vt = vt.trim().toLowerCase(); if(vt.startsWith('{') || vt.includes('"ID"') || vt.includes('GOOGLE_ID')) return 'MOTOR'; if(vt!=='motor' && vt!=='mobil') return 'MOTOR'; return vt.toUpperCase(); }catch(e){ return 'MOTOR'; } })()} • ${tripLabel}</div><div style="font-size:9px;opacity:0.9">ID ${order.id.slice(0,6).toUpperCase()} • ${new Date(order.created_at||Date.now()).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div></div>
      </div>
      <div style="background:rgba(0,0,0,0.25);color:white;padding:5px 10px;border-radius:16px;font-size:9px;font-weight:700;white-space:nowrap;flex-shrink:0">🔍 ${statusText}</div>
    </div>`;

  const progressHtml = `
    <div style="padding:10px 14px 0;display:flex;gap:4px"><div style="flex:1;height:5px;border-radius:3px;background:${step>=1?'#16a34a':'#1e293b'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=2?'#16a34a':'#1e293b'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=3?'#16a34a':'#1e293b'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=4?'#16a34a':'#1e293b'}"></div><div style="flex:1;height:5px;border-radius:3px;background:${step>=5?'#16a34a':'#1e293b'}"></div></div>
    <div style="padding:4px 14px 10px;display:flex;justify-content:space-between;font-size:8px;color:#64748b"><span>Cari</span><span>Konfirm</span><span>OTW</span><span>Diantar</span><span>Selesai</span></div>`;

  const routeHtml = `
    <div style="margin:0 10px;background:#0f172a;border:1px solid #1e293b;padding:10px;border-radius:12px">
      <div style="font-size:12px;color:#e2e8f0;line-height:1.4"><div style="display:flex;gap:6px"><span>📍</span><span style="flex:1"><b style="font-size:9px;color:#94a3b8;display:block">PICKUP</b>${order.pickup_text||order.pickup||'-'}</span></div><div style="display:flex;gap:6px;margin-top:8px"><span>🎯</span><span style="flex:1"><b style="font-size:9px;color:#94a3b8;display:block">TUJUAN</b>${order.dest_text||order.destination||'-'}</span></div></div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #1e293b;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:#94a3b8">📏 ${order.distance_km?.toFixed?.(2)||order.distance_km||'-'} km</span><span style="font-weight:800;background:#16a34a;color:#052e16;padding:5px 10px;border-radius:8px;font-size:12px">Rp ${order.estimated_cost?.toLocaleString('id-ID')||'-'}</span></div>
    </div>`;

  let bodyHtml = '';
  if(driver){
    bodyHtml = `
      <div style="margin:10px;background:#0f172a;border:1px solid #22c55e;border-radius:14px;padding:12px">
        <div style="display:flex;gap:10px;align-items:center"><div style="width:42px;height:42px;background:#16a34a;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800">${driver.name?.charAt(0)||'D'}</div><div style="flex:1"><div style="font-weight:700;font-size:13px;color:#e2e8f0">${driver.name} ${driver.jenis_kendaraan==='mobil'?'🚗':'🏍️'}</div><div style="font-size:10px;color:#94a3b8">${driver.nopol||''} • ${driver.jenis_kendaraan||'motor'}</div></div><div style="font-size:10px;color:#22c55e;font-weight:700">OTW</div></div>
        <div style="margin-top:10px;background:#020617;border-radius:10px;padding:8px"><div id="trackingDistance" style="font-weight:700;color:#4ade80;font-size:12px">📍 Menghitung jarak...</div><div style="font-size:10px;color:#64748b;margin-top:2px">ID order tetap • Auto pindah <span id="singleTimeout">${DRIVER_TIMEOUT}</span>s jika tidak respon</div></div>
        <div style="margin-top:8px;display:flex;gap:6px">${driver.hp ? `<a href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}" target="_blank" style="flex:1;background:#25D366;color:white;padding:10px;text-align:center;border-radius:10px;text-decoration:none;font-weight:700;font-size:12px">💬 WA Driver</a>`:''}<a id="btnOpenDriverMap" href="#" style="flex:1;background:#1e293b;color:#e2e8f0;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px">🗺️ Map</a></div>
        ${queueInfo}
      </div>`;
  } else {
    const alertBox = isRejected ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;padding:10px;display:flex;gap:8px;margin-bottom:10px"><div style="color:#f87171">⚠️</div><div style="flex:1"><div style="font-weight:700;color:#fecaca;font-size:12px">Driver Menolak</div><div style="font-size:11px;color:#fca5a5;margin-top:2px">${rejectedName} menolak. ${autoInfo||'Mencari selanjutnya...'}</div></div></div>` : autoAssign ? `<div style="background:#052e16;border:1px solid #16a34a;border-radius:10px;padding:10px;display:flex;gap:8px;margin-bottom:10px"><div>🔄</div><div style="flex:1"><div style="font-weight:700;color:#bbf7d0;font-size:12px">Mencoba Driver Selanjutnya</div><div style="font-size:11px;color:#86efac">${autoInfo||'Menghubungkan...'}</div></div></div>` : noDriver ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;padding:10px;margin-bottom:10px"><div style="font-weight:700;color:#fecaca">😔 Tidak Ada Driver Online</div><div style="font-size:11px;color:#fca5a5">Tidak ada driver di ${ACTIVE_KECAMATAN_NAME||'Suruh'} saat ini.</div></div>` : `<div style="text-align:center;padding:8px"><div style="font-size:24px">⏳</div><div style="font-size:12px;color:#fbbf24;font-weight:600;margin-top:4px">Menunggu driver menerima...</div><div style="font-size:10px;color:#94a3b8;margin-top:2px">Driver terdekat akan dihubungkan otomatis</div></div>`;
    bodyHtml = `
      <div style="margin:10px;background:rgba(245,158,11,0.08);border:1px dashed #f59e0b;padding:12px;border-radius:14px">
        ${alertBox}
        <div style="text-align:center;margin-top:6px"><div style="font-size:10px;color:#f59e0b;background:#020617;border:1px solid #1e293b;padding:4px 8px;border-radius:6px;display:inline-block">⏱️ <span id="singleSearchTimer">00:00</span> • Timeout <span id="singleTimeout2">${DRIVER_TIMEOUT}</span>s • ID ${order.id.slice(0,6).toUpperCase()}</div></div>
        ${queueInfo}
      </div>`;
  }

  container.innerHTML = `
    <div style="border:1px solid #1e293b;border-radius:16px;overflow:hidden;background:#020617;box-shadow:0 20px 60px rgba(0,0,0,0.7)">
      ${headerHtml}
      ${progressHtml}
      ${routeHtml}
      ${bodyHtml}
      <div style="padding:10px;background:#020617;border-top:1px solid #1e293b;display:flex;gap:8px"><button id="btnCancelTracking" style="flex:1;background:#1e293b;color:#f87171;padding:11px;border-radius:10px;font-weight:600;border:1px solid #334155;font-size:12px">❌ Batalkan Order</button><button id="btnCompleteOrder" style="flex:1;background:#16a34a;color:white;padding:11px;border-radius:10px;font-weight:700;border:none;font-size:12px">✅ Selesai</button></div>
    </div>`;

  setTimeout(()=>{
    const mapBtn = document.getElementById('btnOpenDriverMap');
    if(mapBtn){ mapBtn.onclick = (e)=>{ e.preventDefault(); if(lastDriverLoc){ let dLat,dLng; if(lastDriverLoc.lat&&lastDriverLoc.lng){ dLat=lastDriverLoc.lat; dLng=lastDriverLoc.lng; } if(dLat&&order.pickup_lat){ window.open(`https://www.google.com/maps/dir/${dLat},${dLng}/${order.pickup_lat},${order.pickup_lng}`, '_blank'); } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } } else if(order.pickup_lat){ window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank'); } }; }
  },100);
}

function subscribeOrderUpdates(orderId){
  if(orderChannel){ try{ supabase.removeChannel(orderChannel); }catch(e){} orderChannel=null; }
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
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
        try{ localStorage.removeItem('auto_queue_'+newOrder.id); localStorage.removeItem('auto_index_'+newOrder.id); localStorage.removeItem('auto_start_'+newOrder.id); }catch(e){}
        alert(`Order ${newOrder.status}`); clearActiveTracking(); hideTrackingUI(); location.hash='#/'; return;
      }
      handleOrderRejection(newOrder);
    })
    .on('broadcast', { event: 'driver_rejected' }, async payload=>{
      const driverName = payload?.payload?.driverName || localStorage.getItem('last_driver_name') || 'Driver';
      try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
      try{
        const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if(cur){
          renderActiveOrder(cur, null, {rejected:true, driverName, autoInfo:`${driverName} menolak, mencoba selanjutnya...`});
          const orderMod = await import('./order.js');
          if(orderMod.assignToNextDriver) await orderMod.assignToNextDriver(orderId, `Driver ${driverName} menolak`);
        }
      }catch(e){}
    })
    .on('broadcast', { event: 'auto_assigned' }, async payload=>{
      const p = payload?.payload||{};
      try{
        const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if(cur){
          renderActiveOrder(cur, null, {autoAssign:true, autoInfo:`Mencoba ${p.driverName} (${p.index}/${p.total})...`});
        }
      }catch(e){}
    })
    .on('broadcast', { event: 'auto_cancelled' }, async payload=>{
      alert('😔 '+(payload?.payload?.reason||'Tidak ada driver')+' - Order dibatalkan');
      clearActiveTracking(); hideTrackingUI(); location.hash='#/';
    })
    .subscribe();

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
  if(newOrder.driver_id){
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
    if(newOrder.status==='searching' && lastKnownDriverId && newOrder.driver_id===lastKnownDriverId){
      const lastName = localStorage.getItem('last_driver_name')||'Driver';
      renderActiveOrder(newOrder, null, {rejected:true, driverName:lastName, autoInfo:'Mencoba driver selanjutnya...'});
      (async ()=>{
        try{ await supabase.from('orders').update({ driver_id: null, accepted_at: null }).eq('id', newOrder.id); }catch(e){}
        try{ const orderMod = await import('./order.js'); if(orderMod.assignToNextDriver) await orderMod.assignToNextDriver(newOrder.id, `Driver ${lastName} menolak`); }catch(e){}
      })();
      return;
    }
    lastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_driver_id', newOrder.driver_id); }catch(e){}
    fetchDriverProfile(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
      renderActiveOrder(newOrder, driver);
      subscribeDriverLocation(newOrder.driver_id);
      startDistanceUpdater(newOrder);
      const si = document.getElementById('searchInfo'); if(si) si.textContent = `✅ Driver ${driver?.name||''} OTW`;
    });
  } else {
    // Hanya tampilkan rejected jika sebelumnya ada driver ter-assign untuk order ini (lastKnownDriverId ada)
    // dan sekarang driver_id hilang (ditolak), bukan karena order baru tanpa driver
    if(lastKnownDriverId && newOrder.status==='searching'){
      const lastName = localStorage.getItem('last_driver_name')||'Driver';
      renderActiveOrder(newOrder, null, {rejected:true, driverName:lastName, autoInfo:'Mencari driver terdekat selanjutnya...'});
      // clear lastKnown agar tidak loop rejected
      // tapi simpan untuk queue next
      return;
    }
    renderActiveOrder(newOrder, null);
  }
}

// ===== SINGLE UNIFIED TIMER - FIX KACAU =====
function startUnifiedTimer(orderId){
  if(autoAssignTimer){ clearInterval(autoAssignTimer); autoAssignTimer=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  if(!searchStartTime) searchStartTime = Date.now();
  searchSeconds = 0;
  let elapsed = 0;
  try{
    const start = parseInt(localStorage.getItem('auto_start_'+orderId)||Date.now().toString());
    elapsed = Math.floor((Date.now()-start)/1000);
  }catch(e){}

  autoAssignTimer = setInterval(async ()=>{
    searchSeconds++; elapsed++;
    const m = String(Math.floor(searchSeconds/60)).padStart(2,'0');
    const s = String(Math.floor(searchSeconds%60)).padStart(2,'0');
    const remain = Math.max(0, DRIVER_TIMEOUT - (elapsed % (DRIVER_TIMEOUT+1)));

    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const t3 = document.getElementById('singleTimeout2');
    if(t1) t1.textContent = `${m}:${s}`;
    if(t2) t2.textContent = remain;
    if(t3) t3.textContent = remain;

    // Timeout logic - setiap DRIVER_TIMEOUT detik
    if(elapsed % (DRIVER_TIMEOUT+1) === 0 && elapsed>0){
      try{
        const { data: cur } = await supabase.from('orders').select('status,driver_id').eq('id', orderId).single();
        if(cur && cur.status==='searching' && cur.driver_id){
          console.log(`Timeout ${DRIVER_TIMEOUT}s driver ${cur.driver_id}, auto next`);
          const orderMod = await import('./order.js');
          const queue = orderMod.getAutoQueue(orderId);
          const idx = orderMod.getAutoIndex(orderId);
          const driverName = queue[idx]?.name || 'Driver';
          renderActiveOrder(cur, null, {autoAssign:true, autoInfo:`${driverName} tidak merespon ${DRIVER_TIMEOUT}s, mencoba selanjutnya...`});
          if(orderMod.assignToNextDriver) await orderMod.assignToNextDriver(orderId, `Timeout ${DRIVER_TIMEOUT}s`);
          elapsed = 0;
          try{ localStorage.setItem('auto_start_'+orderId, Date.now().toString()); }catch(e){}
        } else if(cur && cur.status==='searching' && !cur.driver_id){
          // Tidak ada driver ter-assign, cek queue
          try{
            const orderMod = await import('./order.js');
            const q = orderMod.getAutoQueue(orderId);
            const idx = orderMod.getAutoIndex(orderId);
            if(q.length>0 && idx < q.length-1){
              await orderMod.assignToNextDriver(orderId, 'Mencoba driver selanjutnya');
              elapsed = 0;
              try{ localStorage.setItem('auto_start_'+orderId, Date.now().toString()); }catch(e){}
            } else {
              // Queue habis, cek apakah masih ada driver online di DB sebelum batalkan
              if(searchSeconds >= 60){
                const { data: onlineDrivers } = await supabase.from('users').select('id').eq('role','driver').eq('status','online').limit(1);
                if(!onlineDrivers || onlineDrivers.length===0){
                  // Benar-benar tidak ada driver
                  renderActiveOrder(cur, null, {noDriver:true});
                  setTimeout(async ()=>{
                    try{
                      await supabase.from('orders').update({ status:'cancelled', cancel_reason:'Tidak ada driver online' }).eq('id', orderId);
                      try{ localStorage.removeItem('auto_queue_'+orderId); }catch(e){}
                      alert('😔 Tidak ada driver online di Suruh saat ini. Order dibatalkan.');
                      clearActiveTracking(); hideTrackingUI(); location.hash='#/';
                    }catch(e){}
                  },3000);
                  clearInterval(autoAssignTimer); autoAssignTimer=null;
                }
              }
            }
          }catch(e){}
        }
      }catch(e){ console.warn('unified timer check fail', e.message); }
    }
  },1000);
}

function startNoDriverCheck(orderId){ /* deprecated - pakai startUnifiedTimer */ }
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

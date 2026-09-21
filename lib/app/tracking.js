// tracking.js - PRODUKSI - penolakan di dalam kartu menunggu driver (fix final)
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
  div.innerHTML = `<div style="background:white;border-radius:18px;max-width:360px;width:100%;overflow:hidden"><div style="background:${theme.primary};color:white;padding:16px;text-align:center"><div style="font-size:32px">🔒</div><div style="font-weight:800">Order Aktif Berjalan</div></div><div style="padding:16px"><div>📍 ${order.pickup_text||''}</div><div>🎯 ${order.dest_text||''}</div><button id="btnGotoTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;width:100%;margin-top:12px">📍 Lihat Tracking</button></div></div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoTracking')?.addEventListener('click', ()=>{ div.remove(); });
}
export function hideTrackingLockModal(){ const m = document.getElementById('trackingLockModal'); if(m) m.remove(); }

let orderChannel = null;
let driverLocationChannel = null;
let trackingInterval = null;
let currentOrderId = null;
let lastKnownDriverId = null;
let orderPollInterval = null;
let noDriverTimer = null;
let searchSeconds = 0;
let lastDriverLoc = null;

export function startTracking(orderId){
  if(!orderId) return;
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  loadActiveTracking();
}
export function clearActiveTracking(){
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  if(orderChannel){ supabase.removeChannel(orderChannel); orderChannel=null; }
  if(driverLocationChannel){ supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  searchSeconds=0; lastKnownDriverId=null;
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  localStorage.removeItem('active_order_id'); localStorage.removeItem('pickup_lat'); localStorage.removeItem('pickup_lng');
  currentOrderId=null; hideTrackingUI();
}
export async function loadActiveTracking(){
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  const card = document.getElementById('activeOrderCard');
  const info = document.getElementById('searchInfo');
  if(!orderId){ if(info) info.textContent='Tidak ada order aktif'; hideTrackingUI(); return null; }
  currentOrderId = orderId;
  try{
    ensureTrackingDetailModal();
    const modalContent = document.getElementById('trackingDetailContent');
    if(modalContent){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='flex'; modalContent.innerHTML = `<div style="background:white;border-radius:16px;padding:20px;text-align:center">⏳ Memuat tracking... ID ${orderId.slice(0,8)}</div>`; }
    if(card){ card.style.display='none'; card.innerHTML=''; }
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(error || !order) return null;
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
      const prevId = lastKnownDriverId || localStorage.getItem('last_driver_id');
      if(prevId){
        renderActiveOrder(order, null, {rejected:true, driverName: localStorage.getItem('last_driver_name')||'Driver'});
      } else {
        renderActiveOrder(order, null);
      }
      startNoDriverCheck(order.id);
    }
    return order;
  }catch(e){ return null; }
}
async function fetchDriverProfile(driverId){
  if(!driverId) return null;
  try{
    const { data } = await supabase.from('users').select('id,name,hp,nopol,jenis_kendaraan').eq('id', driverId).maybeSingle();
    if(data) return data;
    return { id: driverId, name: 'Driver '+driverId.slice(0,4), hp:null, nopol:'-', jenis_kendaraan:'motor' };
  }catch(e){ return { id: driverId, name: 'Driver', hp:null, nopol:'-', jenis_kendaraan:'motor' }; }
}
function ensureTrackingDetailModal(){
  let modal = document.getElementById('trackingDetailModal');
  if(modal) return modal;
  const div = document.createElement('div');
  div.id = 'trackingDetailModal';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(11,15,20,0.88);backdrop-filter:blur(14px);z-index:9997;overflow-y:auto;padding:16px;align-items:flex-start;justify-content:center';
  div.innerHTML = `<div style="max-width:420px;width:100%;margin:20px auto"><div id="trackingDetailContent"></div><div style="text-align:center;margin-top:12px"><button id="btnCloseTrackingDetail" style="background:#1d2633;border:1px solid #263240;color:#e6edf5;padding:10px 18px;border-radius:10px">✕ Tutup</button></div></div>`;
  document.body.appendChild(div);
  div.addEventListener('click', (e)=>{ if(e.target.id==='trackingDetailModal') hideTrackingUI(); });
  document.getElementById('btnCloseTrackingDetail')?.addEventListener('click', ()=> hideTrackingUI());
  return div;
}
export function showTrackingUI(order){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='flex'; }
export function hideTrackingUI(){ const m = document.getElementById('trackingDetailModal'); if(m) m.style.display='none'; document.body.style.overflow=''; }

function renderActiveOrder(order, driver, opts={}){
  const card = document.getElementById('trackingDetailContent');
  if(!card) return;
  const oldCard = document.getElementById('activeOrderCard');
  if(oldCard){ oldCard.style.display='none'; oldCard.innerHTML=''; }
  const isRejected = opts.rejected === true;
  const rejectedName = opts.driverName || localStorage.getItem('last_driver_name') || 'Driver';
  const noDriver = opts.noDriver === true;
  const statusMap = { searching:'🔍 Mencari driver terdekat...', accepted:'✅ Driver OTW', picked:'🚗 Diantar', completed:'✅ Selesai', cancelled:'❌ Dibatalkan' };
  const statusText = statusMap[order.status]||order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';
  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);

  const waitingInner = `
    <div style="margin:12px;background:rgba(245,158,11,0.08);border:1px dashed #f59e0b;padding:18px;border-radius:16px;text-align:center">
      ${isRejected ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;display:flex;gap:10px;align-items:center;text-align:left;margin-bottom:12px"><div style="width:36px;height:36px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white">⚠️</div><div style="flex:1"><div style="font-weight:800;color:#991b1b;font-size:13px">Driver Menolak Order</div><div style="font-size:11px;color:#7f1d1d;margin-top:2px">${rejectedName} tidak bisa melanjutkan. Mencari driver lain di ${ACTIVE_KECAMATAN_NAME||'Suruh'}...</div></div></div><div style="font-size:13px;color:#fbbf24;font-weight:700;margin-top:8px">⏳ Mencari driver pengganti...</div>` : ''}
      ${noDriver ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;display:flex;gap:10px;align-items:center;text-align:left;margin-bottom:12px"><div style="width:36px;height:36px;background:#991b1b;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white">😔</div><div style="flex:1"><div style="font-weight:800;color:#991b1b;font-size:13px">Tidak Ada Driver Aktif</div><div style="font-size:11px;color:#7f1d1d">Tidak ada driver online di ${ACTIVE_KECAMATAN_NAME||'Suruh'}. Order akan dibatalkan otomatis.</div></div></div>` : ''}
      ${!isRejected && !noDriver ? `<div style="font-size:28px">⏳</div><div style="font-size:13px;color:#fbbf24;font-weight:700;margin-top:8px">Menunggu driver menerima order...</div><div style="font-size:11px;color:#8aa0b8;margin-top:4px">Order terkirim ke driver terdekat di ${ACTIVE_KECAMATAN_NAME||'Suruh'}</div>` : ''}
      <div style="margin-top:10px;font-size:10px;color:#f59e0b;background:#0b0f14;border:1px solid #263240;padding:6px 10px;border-radius:8px;display:inline-block">ID ${order.id.slice(0,8).toUpperCase()} • <span id="searchTimer">${String(Math.floor(searchSeconds/60)).padStart(2,'0')}:${String(searchSeconds%60).padStart(2,'0')}</span></div>
    </div>`;

  card.innerHTML = `
    <div style="border:1px solid #263240;border-radius:20px;overflow:hidden;background:#151c25;box-shadow:0 12px 40px rgba(0,0,0,0.5);color:#e6edf5">
      <div style="background:linear-gradient(135deg, ${getAppTheme().primary}, #16a34a);color:#052e16;padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px"><span style="width:36px;height:36px;background:rgba(0,0,0,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center">${vehicleIcon}</span><div><div style="font-size:13px;font-weight:800">${order.vehicle_type?.toUpperCase()||'MOTOR'}</div><div style="font-size:10px">ID ${order.id.slice(0,6).toUpperCase()}</div></div></div><span style="background:rgba(0,0,0,0.25);color:white;padding:6px 12px;border-radius:20px;font-size:10px;font-weight:800">${statusText}</span>
      </div>
      <div style="margin:12px;background:#1d2633;border:1px solid #263240;padding:12px;border-radius:14px"><div>📍 ${order.pickup_text||order.pickup||'-'}</div><div style="margin-top:8px">🎯 ${order.dest_text||order.destination||'-'}</div><div style="margin-top:8px;display:flex;justify-content:space-between"><span style="font-size:11px">📏 ${order.distance_km||'-'} km</span><span style="font-weight:800">Rp ${(order.estimated_cost||0).toLocaleString('id-ID')}</span></div></div>
      ${driver ? `<div style="margin:12px;background:#1d2633;border:1px solid #263240;border-radius:16px;padding:14px"><div style="display:flex;gap:12px;align-items:center"><div style="width:48px;height:48px;background:#22c55e;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#052e16;font-weight:800">${driver.name?.charAt(0)||'D'}</div><div><div style="font-weight:800">${driver.name}</div><div style="font-size:11px;color:#8aa0b8">${driver.nopol||''}</div></div></div><div style="margin-top:12px;background:#0b0f14;border:1px solid #263240;border-radius:12px;padding:12px"><div id="trackingDistance" style="font-weight:800;color:#4ade80">📍 Menghitung jarak...</div><div id="trackingETA" style="font-size:11px;color:#8aa0b8">⏱️ Menunggu lokasi...</div></div></div>` : waitingInner}
      <div style="padding:12px;background:#0b0f14;border-top:1px solid #263240;display:flex;gap:8px"><button id="btnCancelTracking" style="flex:1;background:#1d2633;border:1px solid #263240;color:#f87171;padding:12px;border-radius:12px">❌ Batalkan</button><button id="btnCompleteOrder" style="flex:1;background:#22c55e;color:#052e16;border:none;padding:12px;border-radius:12px;font-weight:800">✅ Selesai</button></div>
    </div>`;
}

function subscribeOrderUpdates(orderId){
  if(orderChannel){ supabase.removeChannel(orderChannel); orderChannel=null; }
  if(orderPollInterval){ clearInterval(orderPollInterval); orderPollInterval=null; }
  try{ lastKnownDriverId = localStorage.getItem('last_driver_id') || null; }catch(e){}
  orderChannel = supabase.channel('order-tracking-'+orderId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${orderId}` }, async payload=>{
      const newOrder = payload.new;
      if(['completed','cancelled','rejected'].includes(newOrder.status)){ clearActiveTracking(); hideTrackingUI(); location.hash='#/'; return; }
      handleRejection(newOrder);
    })
    .on('broadcast', { event:'driver_rejected' }, async payload=>{
      const driverName = payload?.payload?.driverName || localStorage.getItem('last_driver_name') || 'Driver';
      const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(cur){
        try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
        renderActiveOrder(cur, null, {rejected:true, driverName});
        try{ await supabase.from('orders').update({ driver_id:null, accepted_at:null }).eq('id', orderId); }catch(e){}
      }
    })
    .subscribe();
  orderPollInterval = setInterval(async ()=>{
    try{
      const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(!o) return;
      if(['completed','cancelled','rejected'].includes(o.status)) return;
      handleRejection(o);
    }catch(e){}
  }, 3000);
}

function handleRejection(newOrder){
  if(newOrder.driver_id){
    if(newOrder.status==='searching' && lastKnownDriverId && newOrder.driver_id===lastKnownDriverId){
      try{ if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
      const lastName = localStorage.getItem('last_driver_name')||'Driver';
      renderActiveOrder(newOrder, null, {rejected:true, driverName:lastName});
      (async()=>{ try{ await supabase.from('orders').update({ driver_id:null, accepted_at:null }).eq('id', newOrder.id); }catch(e){} })();
      return;
    }
    lastKnownDriverId = newOrder.driver_id;
    try{ localStorage.setItem('last_driver_id', newOrder.driver_id); }catch(e){}
    fetchDriverProfile(newOrder.driver_id).then(driver=>{
      try{ localStorage.setItem('last_driver_name', driver?.name||'Driver'); }catch(e){}
      renderActiveOrder(newOrder, driver);
      subscribeDriverLocation(newOrder.driver_id);
      startDistanceUpdater(newOrder);
    });
    if(noDriverTimer){ clearInterval(noDriverTimer); noDriverTimer=null; }
  } else {
    const prevId = lastKnownDriverId || localStorage.getItem('last_driver_id');
    if(prevId && newOrder.status==='searching'){
      renderActiveOrder(newOrder, null, {rejected:true, driverName: localStorage.getItem('last_driver_name')||'Driver'});
      startNoDriverCheck(newOrder.id);
      return;
    }
    renderActiveOrder(newOrder, null);
    startNoDriverCheck(newOrder.id);
  }
}

function startNoDriverCheck(orderId){
  if(noDriverTimer) return;
  noDriverTimer = setInterval(async ()=>{
    searchSeconds++;
    const el = document.getElementById('searchTimer');
    if(el){ el.textContent = `${String(Math.floor(searchSeconds/60)).padStart(2,'0')}:${String(searchSeconds%60).padStart(2,'0')}`; }
    if(searchSeconds % 10 === 0){
      try{
        const { data: online } = await supabase.from('users').select('id').eq('role','driver').eq('status','online').limit(1);
        if(!online || online.length===0){
          if(searchSeconds>=30){
            const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
            if(cur && cur.status==='searching' && !cur.driver_id){
              renderActiveOrder(cur, null, {noDriver:true});
              setTimeout(async()=>{ try{ await supabase.from('orders').update({ status:'cancelled' }).eq('id', orderId); clearActiveTracking(); hideTrackingUI(); alert('😔 Tidak ada driver aktif. Order dibatalkan.'); location.hash='#/'; }catch(e){} },5000);
              clearInterval(noDriverTimer); noDriverTimer=null;
            }
          }
        }
      }catch(e){}
    }
    if(searchSeconds>=90){
      const { data: cur } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(cur && cur.status==='searching' && !cur.driver_id){
        renderActiveOrder(cur, null, {noDriver:true});
        setTimeout(async()=>{ try{ await supabase.from('orders').update({ status:'cancelled' }).eq('id', orderId); clearActiveTracking(); hideTrackingUI(); alert('😔 Tidak ada driver menerima. Order dibatalkan.'); location.hash='#/'; }catch(e){} },5000);
        clearInterval(noDriverTimer); noDriverTimer=null;
      }
    }
  },1000);
}

function subscribeDriverLocation(driverId){
  if(driverLocationChannel){ supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  driverLocationChannel = supabase.channel('driver-loc-'+driverId).on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateDriverDistance(payload.new); }).subscribe();
}
function updateDriverDistance(loc){
  if(!loc) return; lastDriverLoc=loc;
  const pLat=parseFloat(localStorage.getItem('pickup_lat')); const pLng=parseFloat(localStorage.getItem('pickup_lng'));
  let dLat,dLng; if(loc.lat&&loc.lng){ dLat=loc.lat; dLng=loc.lng; } else if(loc.lokasi){ const m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }
  const el=document.getElementById('trackingDistance');
  if(!dLat||!pLat){ if(el) el.textContent='📍 Driver online'; return; }
  const dist=haversineKm(dLat,dLng,pLat,pLng);
  if(el) el.textContent = dist<0.1? `🎉 Driver dekat! ${dist.toFixed(2)} km` : `📍 Driver ${dist.toFixed(2)} km`;
}
function startDistanceUpdater(order){
  if(trackingInterval) clearInterval(trackingInterval);
  trackingInterval=setInterval(async()=>{ if(!order.driver_id) return; try{ const { data }=await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single(); if(data) updateDriverDistance(data); }catch(e){} },5000);
}
export function driverAcceptOrder(orderId, driverProfile){ return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single(); }
export function driverPickedOrder(orderId){ return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single(); }
let driverOrdersChannel=null; let driverOrdersInterval=null;
export async function loadDriverOrders(driverProfile){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box=document.getElementById('driverOrders'); if(!box) return;
  box.innerHTML=`<div style="padding:16px;text-align:center">⏳ Memuat...</div>`;
  try{
    const q1=await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(30);
    let rejected=[]; try{ rejected=JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders=(q1.data||[]).filter(o=>(!o.driver_id || o.driver_id===driverProfile.id) && !rejected.includes(o.id));
    if(orders.length===0){ box.innerHTML=`<div style="padding:20px;text-align:center">📭 Menunggu order...</div>`; return; }
    box.innerHTML=orders.map(o=>`<div class="card" style="margin:10px 0;padding:12px;border:1px solid #e2e8f0;border-radius:12px"><div>📍 ${o.pickup_text||o.pickup||'-'}<br/>🎯 ${o.dest_text||o.destination||'-'}</div><div style="margin-top:8px;display:flex;gap:6px"><button data-driver-accept="${o.id}" style="flex:1;background:#16a34a;color:white;padding:10px;border-radius:10px;border:none">TERIMA</button><button data-driver-reject="${o.id}" style="background:white;border:1px solid #e2e8f0;padding:10px;border-radius:10px">❌</button></div></div>`).join('');
  }catch(e){ box.innerHTML=`<div style="padding:16px;background:#fef2f2">Gagal: ${e.message}</div>`; }
}
function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  driverOrdersChannel=supabase.channel('driver-orders-'+driverProfile.id).on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, payload=>{ const o=payload.new; if(o.driver_id===driverProfile.id || !o.driver_id) loadDriverOrders(driverProfile); }).on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, ()=>{ loadDriverOrders(driverProfile); }).subscribe();
  driverOrdersInterval=setInterval(()=>loadDriverOrders(driverProfile),10000);
}
export function clearDriverOrdersSubscription(){ if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; } if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; } }
export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver') return `<div class="card"><h3>Driver</h3><p>Ubah role di Profil.</p></div>`;
  return `<div class="card"><h3>🏍️ Driver - ${p.name}</h3><p>${p.nopol||''} • Status: <b>${p.status}</b></p><div class="row"><button id="btnOnline" class="btn">🟢 Go Online</button><button id="btnOffline" class="btn">🔴 Offline</button></div></div><div class="card"><h4>📥 Order Masuk</h4><div id="driverOrders">Menunggu...</div></div>`;
}
export function initDriverPage(driverProfile){ if(!driverProfile) return; setTimeout(()=>loadDriverOrders(driverProfile),500); subscribeDriverOrders(driverProfile); }

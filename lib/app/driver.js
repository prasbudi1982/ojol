
// driver.js - FINAL CLEAN - Ojek + Food - Pisah tracking seperti Ojol pakai trackingFood.js
import { supabase } from './supabase.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';
import { getProfile } from './user.js';
import * as trackingFood from './trackingFood.js';

window.trackingFood = trackingFood;

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

function calcHav(lat1,lng1,lat2,lng2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function buildMapLinks(o){
  const pLat = o.pickup_lat || o.pickupLat;
  const pLng = o.pickup_lng || o.pickupLng;
  const dLat = o.dest_lat || o.destLat;
  const dLng = o.dest_lng || o.destLng;
  const pickup = o.pickup_text||o.pickup||'-';
  const dest = o.dest_text||o.destination||'-';
  let pickupLink = ''; let destLink = ''; let routeLink = '';
  if(pLat && pLng){ pickupLink = `https://www.google.com/maps?q=${pLat},${pLng}`; }
  else if(pickup && pickup.length>3){ pickupLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`; }
  if(dLat && dLng){ destLink = `https://www.google.com/maps?q=${dLat},${dLng}`; }
  else if(dest && dest.length>3){ destLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`; }
  if(pLat && pLng && dLat && dLng){ routeLink = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`; }
  return { pickupLink, destLink, routeLink };
}

let driverOrdersChannel = null; 
let driverOrdersInterval = null;
let lastOrdersHash = '';
let isFirstLoad = true;
let foodOrdersChannel = null;
let foodOrdersInterval = null;
let lastFoodHash = '';
let isFirstFoodLoad = true;

export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('driverOrders'); const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  const theme = getAppTheme();
  if(!silent || isFirstLoad){
    if(infoEl) infoEl.textContent = isFirstLoad ? '⏳ Mencari...' : '↻ Update...';
    if(isFirstLoad) box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)"><div style="font-size:24px">⏳</div><div style="font-size:12px;margin-top:6px">Memuat order ojek...</div></div>`;
  }
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(30);
    if(q1.error) throw q1.error;
    let rejectedIds=[]; try{ rejectedIds = JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders = (q1.data||[]).filter(o => {
      if(rejectedIds.includes(o.id)) return false;
      if(o.passenger_id===driverProfile.id) return false;
      if(o.driver_id && o.driver_id!==driverProfile.id) return false;
      return true;
    });
    const newHash = JSON.stringify(orders.map(o=>o.id+o.status+o.updated_at).join('|'));
    if(!isFirstLoad && silent && newHash===lastOrdersHash){
      if(infoEl) infoEl.textContent = `${orders.length} order • update ${new Date().toLocaleTimeString('id-ID')}`;
      return;
    }
    lastOrdersHash = newHash;
    if(orders.length===0){ 
      box.innerHTML = `<div style="padding:20px;text-align:center;background:var(--card);border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">📭</div><div style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">Menunggu order ojek...</div></div>`; 
      if(infoEl) infoEl.textContent=''; isFirstLoad=false; return; 
    }
    if(infoEl) infoEl.textContent = `${orders.length} order • ${new Date().toLocaleTimeString('id-ID')}`;
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id===driverProfile.id;
      const dist = o.distance_km||0; const cost = o.estimated_cost||o.cost||0;
      const links = buildMapLinks(o);
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+theme.primary:'1px solid var(--border)'};border-radius:16px">
        <div style="background:${isForMe?theme.primary:'var(--card2)'};color:${isForMe?'white':'var(--text)'};padding:10px 12px;display:flex;justify-content:space-between">
          <span style="font-weight:800;font-size:12px">${isForMe?'🎯 UNTUKMU':'📢 BROADCAST'} • ${dist} km • Rp ${Number(cost).toLocaleString()}</span>
          <span style="font-size:10px">${new Date(o.created_at).toLocaleTimeString('id-ID')}</span>
        </div>
        <div style="padding:12px">
          <div style="font-size:12px"><b>📍 ${o.pickup_text||'-'}</b></div>
          <div style="font-size:12px;margin-top:4px">🎯 ${o.dest_text||'-'}</div>
          <div style="display:flex;gap:6px;margin-top:10px">
            ${links.routeLink ? `<a href="${links.routeLink}" target="_blank" style="flex:1;background:${theme.primary};color:white;padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none;font-weight:700">🗺️ Rute</a>` : ''}
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button data-driver-accept="${o.id}" style="flex:2;background:#22c55e;color:#052e16;border:none;padding:12px;border-radius:12px;font-weight:800">✅ Terima</button>
            <button data-driver-reject="${o.id}" style="flex:1;background:var(--card2);border:1px solid var(--border);color:#ef4444;padding:12px;border-radius:12px">❌</button>
          </div>
        </div>
      </div>`;
    }).join('');
    isFirstLoad=false;
  }catch(e){ if(!silent) box.innerHTML = `<div class="muted">Error: ${e.message}</div>`; }
}

export async function loadFoodOrdersForDriver(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('foodOrdersList');
  const infoEl = document.getElementById('foodOrdersInfo');
  if(!box) return;
  if(!silent || isFirstFoodLoad){
    if(infoEl) infoEl.textContent = isFirstFoodLoad ? '⏳ Mencari...' : '↻ Update...';
    if(isFirstFoodLoad) box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)">🍔 Memuat order makanan...</div>`;
  }
  try{
    let driverLat=null, driverLng=null;
    try{
      const { data: loc } = await supabase.from('driver_locations').select('lat,lng,lokasi').eq('driver_id', driverProfile.id).maybeSingle();
      if(loc){
        if(loc.lat && loc.lng){ driverLat=loc.lat; driverLng=loc.lng; }
        else if(loc.lokasi){ const m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ driverLng=parseFloat(m[1]); driverLat=parseFloat(m[2]); } }
      }
    }catch(e){}

    const qSearching = await supabase.from('food_orders').select('*, stores(name, alamat_text)').eq('status', 'searching_driver').order('created_at', {ascending:false}).limit(20);
    const qMyActive = await supabase.from('food_orders').select('*, stores(name, alamat_text)').eq('driver_id', driverProfile.id).in('status', ['driver_assigned','accepted','preparing','ready','picked']).order('created_at', {ascending:false}).limit(5);
    
    let searching = qSearching.data||[];
    let myActive = qMyActive.data||[];

    if(driverLat && driverLng){
      searching = searching.map(o=>{
        if(o.pickup_lat && o.pickup_lng){ return { ...o, distance_km: calcHav(driverLat, driverLng, o.pickup_lat, o.pickup_lng) }; }
        return { ...o, distance_km: 999 };
      }).filter(o=> o.distance_km <= 8).sort((a,b)=>a.distance_km-b.distance_km);
    }

    const allOrders = [...myActive, ...searching];
    const newHash = JSON.stringify(allOrders.map(o=>o.id+o.status).join('|'));
    if(!isFirstFoodLoad && silent && newHash===lastFoodHash){
      if(infoEl) infoEl.textContent = `${searching.length} baru • ${myActive.length} aktif • ${new Date().toLocaleTimeString('id-ID')}`;
      return;
    }
    lastFoodHash = newHash;
    if(infoEl) infoEl.textContent = `${searching.length} baru • ${myActive.length} aktif • ${new Date().toLocaleTimeString('id-ID')}`;

    let html = '';
    if(myActive.length){
      html += `<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:800;margin-bottom:6px">🔥 Aktif Kamu:</div>`;
      html += myActive.map(o=>{
        const statusColor = { driver_assigned:'#22c55e', accepted:'#22c55e', preparing:'#f59e0b', ready:'#16a34a', picked:'#0ea5e9' }[o.status]||'#6b7280';
        const statusLabel = { driver_assigned:'SEPAKAT - Warung masak', accepted:'SEPAKAT', preparing:'Warung masak', ready:'Siap ambil', picked:'OTW antar' }[o.status]||o.status;
        const links = buildMapLinks(o);
        return `<div class="card" style="margin:0 0 10px 0;border:2px solid ${statusColor};border-radius:16px;overflow:hidden">
          <div style="background:${statusColor};color:white;padding:10px 12px;display:flex;justify-content:space-between"><span style="font-weight:800;font-size:12px">🍔 #${o.id.slice(0,8).toUpperCase()} • ${statusLabel}</span><span style="font-size:10px">Rp ${Number(o.total||0).toLocaleString()}</span></div>
          <div style="padding:12px">
            <div style="font-size:12px"><b>🏪 ${o.stores?.name||''}</b> - ${o.pickup_text||''}</div>
            <div style="font-size:11px" class="muted">🎯 ${o.dest_text||''}</div>
            <div style="font-size:11px;margin-top:4px">${(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
            <div style="display:flex;gap:6px;margin-top:8px">${links.routeLink ? `<a href="${links.routeLink}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none">🗺️ Rute</a>` : ''}<button onclick="window.openFoodTrackingDetailModal && window.openFoodTrackingDetailModal('${o.id}')" style="flex:1;background:#0ea5e9;color:white;border:none;padding:8px;border-radius:10px;font-size:11px">📍 Tracking</button></div>
            <div style="display:flex;gap:8px;margin-top:8px">
              ${o.status==='ready' ? `<button data-food-picked="${o.id}" style="flex:1;background:#16a34a;color:white;border:none;padding:10px;border-radius:10px;font-weight:800;font-size:12px">📦 Ambil - OTW</button>` : ''}
              ${o.status==='picked' ? `<button data-food-complete="${o.id}" style="flex:1;background:#0ea5e9;color:white;border:none;padding:10px;border-radius:10px;font-weight:800">✅ Selesai</button>` : ''}
              ${['driver_assigned','accepted','preparing'].includes(o.status) ? `<span class="muted" style="font-size:11px;padding:8px">⏳ Warung masak...</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('') + `</div>`;
    }
    if(searching.length){
      html += `<div><div style="font-size:12px;font-weight:800;margin-bottom:6px">📥 Order Masuk (Driver terima dulu baru warung masak):</div>`;
      html += searching.map(o=>{
        const distText = o.distance_km ? o.distance_km.toFixed(2)+' km' : '';
        return `<div class="card" style="margin:0 0 10px 0;border-left:3px solid #f59e0b"><div style="display:flex;justify-content:space-between"><b>🍔 #${o.id.slice(0,8).toUpperCase()} • ${o.stores?.name||''}</b><span style="font-size:10px;background:#f59e0b;color:#111;padding:2px 8px;border-radius:99px">${distText}</span></div><div style="font-size:11px;margin-top:4px">🏪 ${o.pickup_text||''} → 🎯 ${o.dest_text||''}</div><div style="font-size:11px" class="muted">Rp ${Number(o.total||0).toLocaleString()} • ${(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div><button data-food-accept="${o.id}" style="width:100%;margin-top:8px;background:#22c55e;color:#052e16;border:none;padding:12px;border-radius:12px;font-weight:800">✅ Terima - Sepakat (Warung baru dapat notif)</button></div>`;
      }).join('') + `</div>`;
    }
    if(!searching.length && !myActive.length){
      html = `<div style="padding:20px;text-align:center;border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">🍔</div><div style="font-size:13px;margin-top:6px;font-weight:600">Menunggu order makanan...</div></div>`;
    }
    box.innerHTML = html;
    isFirstFoodLoad=false;
  }catch(e){ if(!silent) box.innerHTML = `<div class="muted">Error: ${e.message}</div>`; }
}

export async function acceptFoodOrder(orderId){
  const profile = await getProfile();
  if(!profile || profile.role!=='driver') return alert('Hanya driver');
  if(!confirm('Terima order? Kamu & pemesan sepakat, warung akan dapat notif masak.')) return;
  try{
    const { data, error } = await supabase.from('food_orders').update({ driver_id: profile.id, status: 'driver_assigned' }).eq('id', orderId).eq('status', 'searching_driver').select().single();
    if(error) throw error;
    alert('✅ Diterima! Warung dapat notif masak. Tracking modal akan terbuka seperti Ojol.');
    trackingFood.openFoodTrackingDetailModal(orderId);
    loadFoodOrdersForDriver(profile, false);
  }catch(e){ alert('Gagal: '+e.message); }
}

function subscribeDriverOrders(driverProfile){
  let reloadTimeout=null;
  function debounced(silent=true){ if(reloadTimeout) clearTimeout(reloadTimeout); reloadTimeout=setTimeout(()=>{ loadDriverOrders(driverProfile,silent); loadFoodOrdersForDriver(driverProfile,silent); },600); }
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} }
  if(foodOrdersChannel){ try{ supabase.removeChannel(foodOrdersChannel); }catch(e){} }
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, p=>{ if(!p.new.driver_id || p.new.driver_id===driverProfile.id) debounced(true); })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, p=>{ if(['searching','pending','new','open','created','waiting','accepted'].includes(p.new.status) || p.new.driver_id===driverProfile.id) debounced(true); })
    .subscribe();
  foodOrdersChannel = supabase.channel('driver-food-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'food_orders' }, p=>{ if(p.new.status==='searching_driver'){ debounced(true); try{ if(Notification && Notification.permission==='granted'){ new Notification('🍔 Order Makanan Baru!'); } }catch(e){} } })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'food_orders' }, p=>{ if(p.new.driver_id===driverProfile.id || p.new.status==='searching_driver') debounced(true); })
    .subscribe();
  if(driverOrdersInterval) clearInterval(driverOrdersInterval);
  if(foodOrdersInterval) clearInterval(foodOrdersInterval);
  driverOrdersInterval = setInterval(()=> loadDriverOrders(driverProfile,true),15000);
  foodOrdersInterval = setInterval(()=> loadFoodOrdersForDriver(driverProfile,true),12000);
}

export function clearDriverOrdersSubscription(){ 
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; } 
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  if(foodOrdersChannel){ try{ supabase.removeChannel(foodOrdersChannel); }catch(e){} foodOrdersChannel=null; }
  if(foodOrdersInterval){ clearInterval(foodOrdersInterval); foodOrdersInterval=null; }
  lastOrdersHash=''; lastFoodHash=''; isFirstLoad=true; isFirstFoodLoad=true;
  trackingFood.clearFoodTracking();
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p></div>`; }
  const theme = getAppTheme();
  const isOnline = (p.status||'').toLowerCase()==='online';
  return `<div class="card"><h3>🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||''} • Status: <b id="drvStatus" style="color:${isOnline?'#16a34a':'var(--muted)'}">${p.status}</b></p><div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white;border:none;padding:10px 16px;border-radius:10px':'background:var(--card2);border:1px solid var(--border);padding:10px 16px;border-radius:10px'}">🟢 Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}" style="${!isOnline?'background:#ef4444;color:white;border:none;padding:10px 16px;border-radius:10px':'background:var(--card2);border:1px solid var(--border);padding:10px 16px;border-radius:10px'}">🔴 Offline</button></div></div>
  <div class="card"><h4>📥 Order Ojek <span id="driverOrdersInfo" style="font-size:11px" class="muted"></span></h4><div id="driverOrders">Menunggu...</div></div>
  <div class="card" style="border:2px solid #f59e0b"><h4>🍔 Order Makanan (Driver Dulu Baru Warung) <span id="foodOrdersInfo" style="font-size:11px" class="muted"></span></h4><p class="muted" style="font-size:11px">Flow: Pemesan checkout → driver terdekat → driver terima (sepakat) → warung dapat notif masak</p><div id="foodOrdersList" style="margin-top:10px">Menunggu...</div></div>
  <div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
  isFirstLoad=true; isFirstFoodLoad=true; lastOrdersHash=''; lastFoodHash='';
  setTimeout(()=> { loadDriverOrders(driverProfile,false); loadFoodOrdersForDriver(driverProfile,false); },500); 
  subscribeDriverOrders(driverProfile); 
  try{ if(Notification && Notification.permission!=='granted'){ Notification.requestPermission(); } }catch(e){}
}

if(typeof window !== 'undefined'){
  window._acceptFoodOrder = acceptFoodOrder;
  window.loadFoodOrdersForDriver = loadFoodOrdersForDriver;
  window.openFoodTrackingDetailModal = trackingFood.openFoodTrackingDetailModal;
  window.startFoodTracking = trackingFood.startFoodTracking;
}

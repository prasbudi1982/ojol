
// driver.js - FINAL - Driver Ojol + Food terhubung - Flow sama dengan tracking.js
import { supabase } from './supabase.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

export function driverAcceptOrder(orderId, driverProfile){
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverAcceptFoodOrder(orderId, driverProfile){
  return supabase.from('food_orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedFoodOrder(orderId){
  return supabase.from('food_orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverRejectFoodOrder(orderId, driverProfile){
  // Jika driver menolak, kembalikan ke searching_driver dan hapus driver_id jika broadcast, atau biarkan jika assigned ke dia tapi tolak
  return supabase.from('food_orders').update({ status:'searching_driver', driver_id: null }).eq('id', orderId).select().single();
}

let driverOrdersChannel = null; 
let driverFoodChannel = null;
let driverOrdersInterval = null;
let lastOrdersHash = '';
let lastFoodHash = '';
let isFirstLoad = true;

function buildMapLinks(o){
  const pLat = o.pickup_lat || o.pickupLat || o.pickup_lat;
  const pLng = o.pickup_lng || o.pickupLng || o.pickup_lng;
  const dLat = o.dest_lat || o.destLat || o.dest_lat;
  const dLng = o.dest_lng || o.destLng || o.dest_lng;
  const pickup = o.pickup_text||o.pickup||'-';
  const dest = o.dest_text||o.destination||o.dest_text||'-';
  let pickupLink = ''; let destLink = ''; let routeLink = '';
  if(pLat && pLng) pickupLink = `https://www.google.com/maps?q=${pLat},${pLng}`;
  else if(pickup && pickup.length>3) pickupLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
  if(dLat && dLng) destLink = `https://www.google.com/maps?q=${dLat},${dLng}`;
  else if(dest && dest.length>3) destLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  if(pLat && pLng && dLat && dLng) routeLink = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
  else if(pickupLink && destLink) routeLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  return { pickupLink, destLink, routeLink, pLat, pLng, dLat, dLng };
}

// === OJOL ORDERS ===
export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('driverOrders'); const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  const theme = getAppTheme(); const primary = theme.primary;
  if(!silent || isFirstLoad){
    if(infoEl) infoEl.textContent = isFirstLoad ? '⏳ Mencari...' : '↻ Update...';
    if(isFirstLoad){
      box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)"><div style="font-size:24px">⏳</div><div style="font-size:12px;margin-top:6px">Memuat order masuk...</div></div>`;
    }
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
      if(infoEl) infoEl.textContent = `${orders.length} ojol • update ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      return;
    }
    lastOrdersHash = newHash;
    if(orders.length===0 && document.getElementById('driverFoodOrders')?.children.length===0){ 
      box.innerHTML = `<div style="padding:20px;text-align:center;background:var(--card);border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">📭</div><div style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">Menunggu order...</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Order ojek & makanan akan muncul otomatis</div></div>`; 
      if(infoEl) infoEl.textContent=''; 
      isFirstLoad=false;
      return; 
    }
    if(orders.length===0){ box.innerHTML=''; if(infoEl) infoEl.textContent=`0 ojol`; return; }
    if(infoEl) infoEl.textContent = `${orders.length} ojol • ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id===driverProfile.id; 
      let vTypeClean = 'motor'; try{ let vt=o.vehicle_type; if(typeof vt==='string'){ vt=vt.trim().toLowerCase(); if(vt==='mobil'||vt==='motor') vTypeClean=vt; } }catch(e){}
      const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-'; const cost = o.estimated_cost||o.cost||0; const dist = o.distance_km||o.distance||0;
      const links = buildMapLinks(o);
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+primary:'1px solid var(--border)'};border-radius:16px;background:var(--card)">
        <div style="background:${isForMe?primary:'var(--card2)'};color:${isForMe?'white':'var(--text)'};padding:10px 12px;display:flex;justify-content:space-between"><span style="font-weight:800;font-size:12px">${isForMe?'🎯 Untuk Kamu':'📢 Broadcast'} • ${vTypeClean.toUpperCase()}</span><span style="font-size:10px">Rp ${Number(cost).toLocaleString()} • ${Number(dist).toFixed(1)}km</span></div>
        <div style="padding:12px"><div style="font-size:12px">📍 ${pickup}</div><div style="font-size:12px;margin-top:4px">🎯 ${dest}</div>
        <div style="margin-top:10px;display:flex;gap:6px"><a href="${links.pickupLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px">📍 Jemput</a><a href="${links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px">🗺️ Rute</a></div>
        <div style="margin-top:10px;display:flex;gap:8px"><button onclick="window._driverAccept('${o.id}')" class="btn primary" style="flex:1;padding:10px;font-weight:800">✅ Terima</button><button onclick="window._driverReject('${o.id}')" class="btn secondary" style="flex:1;padding:10px">❌ Tolak</button></div></div></div>`;
    }).join('');
    isFirstLoad=false;
  }catch(e){ console.error('loadDriverOrders fail', e); }
}

// === FOOD ORDERS - TERHUBUNG ===
export async function loadDriverFoodOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  let box = document.getElementById('driverFoodOrders');
  if(!box){
    // Buat box jika belum ada, di bawah driverOrders
    const parent = document.getElementById('driverOrders')?.parentElement;
    if(parent){
      const card=document.createElement('div'); card.className='card'; card.style.cssText='margin-top:12px;border:1px solid var(--border)';
      card.innerHTML=`<h4 style="color:var(--text)">🍔 Order Makanan <span id="driverFoodInfo" style="font-size:11px;color:var(--muted);font-weight:400"></span></h4><div id="driverFoodOrders" style="min-height:40px">Menunggu order makanan...</div>`;
      parent.appendChild(card);
      box=document.getElementById('driverFoodOrders');
    } else return;
  }
  const infoEl=document.getElementById('driverFoodInfo');
  try{
    const q = await supabase.from('food_orders').select('*').in('status', ['searching_driver','driver_assigned']).order('created_at',{ascending:false}).limit(30);
    if(q.error) throw q.error;
    let orders=(q.data||[]).filter(o=>{
      if(o.driver_id && o.driver_id!==driverProfile.id) return false; // hanya broadcast atau untuk driver ini
      return true;
    });
    const newHash = JSON.stringify(orders.map(o=>o.id+o.status+o.updated_at).join('|'));
    if(silent && newHash===lastFoodHash) return;
    lastFoodHash=newHash;
    if(orders.length===0){ box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order makanan</div>`; if(infoEl) infoEl.textContent='0'; return; }
    if(infoEl) infoEl.textContent=`${orders.length} • ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}`;
    box.innerHTML=orders.map(o=>{
      const isForMe=o.driver_id===driverProfile.id;
      const pickup=o.pickup_text||'-'; const dest=o.dest_text||'-'; const total=o.total||0; const dist=o.distance_km||0;
      const links=buildMapLinks(o);
      const items=(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ');
      return `<div class="card" style="margin:8px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid #f59e0b':'1px solid var(--border)'};border-radius:14px">
        <div style="background:${isForMe?'#f59e0b':'var(--card2)'};color:${isForMe?'white':'var(--text)'};padding:8px 12px;display:flex;justify-content:space-between"><span style="font-weight:800;font-size:11px">${isForMe?'🎯 FOOD Untuk Kamu':'📢 FOOD Broadcast'} • ${dist.toFixed(1)}km</span><span style="font-size:10px">Rp ${Number(total).toLocaleString()}</span></div>
        <div style="padding:10px"><div style="font-size:11px">🏪 ${pickup}</div><div style="font-size:11px;margin-top:2px">🎯 ${dest}</div><div style="font-size:10px;margin-top:4px" class="muted">${items}</div>
        <div style="margin-top:8px;display:flex;gap:6px"><a href="${links.pickupLink}" target="_blank" class="btn secondary" style="flex:1;font-size:10px">🏪 Warung</a><a href="${links.destLink}" target="_blank" class="btn secondary" style="flex:1;font-size:10px">🎯 Antar</a><a href="${links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:10px">🗺️ Rute</a></div>
        <div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAcceptFood('${o.id}')" class="btn primary" style="flex:1;padding:8px;font-size:11px;font-weight:800">✅ Terima Food</button><button onclick="window._driverRejectFood('${o.id}')" class="btn secondary" style="flex:1;padding:8px;font-size:11px">❌ Tolak</button></div></div></div>`;
    }).join('');
  }catch(e){ console.error('loadDriverFoodOrders fail', e); }
}

export function clearDriverOrdersSubscription(){ 
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; } 
  if(driverFoodChannel){ try{ supabase.removeChannel(driverFoodChannel); }catch(e){} driverFoodChannel=null; } 
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; } 
  lastOrdersHash=''; lastFoodHash=''; isFirstLoad=true;
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️'; 
  const statusLower = (p.status||'').toLowerCase();
  const isOnline = statusLower==='online'; 
  const theme = getAppTheme();
  let latLngText = 'Belum ada lokasi';
  try{
    if(p.lokasi){
      const m = p.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if(m){ const lng = parseFloat(m[1]); const lat = parseFloat(m[2]); latLngText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
    } else if(p.last_lat && p.last_lng){ latLngText = `${p.last_lat}, ${p.last_lng}`; }
  }catch(e){}
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)"><h3>🏍️ Driver - ${p.name} ${vehIcon}</h3><p class="muted" style="color:var(--muted)">${p.nopol||''} • ${vehIcon} • Status: <b id="drvStatus" style="color:${isOnline?'#16a34a':'var(--muted)'}">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px;background:#fef2f2;padding:6px 10px;border-radius:8px;border:1px solid #fecaca">⚠️ Lengkapi data di Profil (Nopol, SIM, HP, Jenis Kendaraan)</p>':''}<div class="row" style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white;border:none;padding:10px 16px;border-radius:10px;font-weight:700':'background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:10px'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}" style="${!isOnline?'background:#ef4444;color:white;border:none;padding:10px 16px;border-radius:10px;font-weight:700':'background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:10px'}">🔴 Offline</button></div></div>
  <div class="card" style="border:1px solid var(--border);background:var(--card)"><h4 style="color:var(--text)">📍 Lokasi Saya (Live GPS)</h4>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px">
      <div id="driverLocText" style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">${latLngText}</div>
      <div id="driverLocStatus" style="margin-top:8px;font-size:10px;color:var(--muted)">Tap Go Online untuk mulai share lokasi</div>
    </div>
  </div>
  <div class="card" style="background:var(--card);border:1px solid var(--border)"><h4 style="color:var(--text)">📥 Order Masuk <span id="driverOrdersInfo" style="font-size:11px;color:var(--muted);font-weight:400"></span></h4><div id="driverOrders" style="min-height:80px">Menunggu order...</div></div>
  <div class="card" style="background:var(--card);border:1px solid var(--border);margin-top:12px"><h4 style="color:var(--text)">🍔 Order Makanan <span id="driverFoodInfo" style="font-size:11px;color:var(--muted);font-weight:400"></span></h4><div id="driverFoodOrders" style="min-height:80px">Menunggu order makanan...</div></div>
  <div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
  isFirstLoad=true; lastOrdersHash=''; lastFoodHash='';
  setTimeout(()=>{ loadDriverOrders(driverProfile, false); loadDriverFoodOrders(driverProfile, false); },500); 
  subscribeDriverOrders(driverProfile); 
}

function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; }
  if(driverFoodChannel){ try{ supabase.removeChannel(driverFoodChannel); }catch(e){} driverFoodChannel=null; }
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, payload=>{ 
      const o=payload.new; if(o.driver_id===driverProfile.id || !o.driver_id){ loadDriverOrders(driverProfile, true); } 
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, payload=>{
      const o=payload.new; if(['searching','pending','new','open','created','waiting','accepted'].includes(o.status) || o.driver_id===driverProfile.id){ loadDriverOrders(driverProfile, true); }
    }).subscribe();
  driverFoodChannel = supabase.channel('driver-food-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'food_orders' }, payload=>{
      const o=payload.new; if(o.status==='searching_driver' || o.driver_id===driverProfile.id){ loadDriverFoodOrders(driverProfile, true); }
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'food_orders' }, payload=>{
      const o=payload.new; if(['searching_driver','driver_assigned','accepted'].includes(o.status)){ loadDriverFoodOrders(driverProfile, true); }
    }).subscribe();
  if(driverOrdersInterval) clearInterval(driverOrdersInterval);
  driverOrdersInterval = setInterval(()=>{ loadDriverOrders(driverProfile, true); loadDriverFoodOrders(driverProfile, true); }, 15000);
}

// Global handlers untuk tombol driver
if(typeof window !== 'undefined'){
  window._driverAccept = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      if(!user) return alert('Login dulu');
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      if(!profile) return alert('Profile tidak ditemukan');
      const res = await driverAcceptOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('✅ Order ojek diterima!');
    }catch(e){ alert('Gagal terima: '+e.message); }
  };
  window._driverReject = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('id').eq('google_id', user?.id).single();
      let rej=[]; try{ rej=JSON.parse(localStorage.getItem('rejected_orders_'+profile.id)||'[]'); }catch(e){}
      rej.push(orderId); localStorage.setItem('rejected_orders_'+profile.id, JSON.stringify(rej));
      location.reload();
    }catch(e){}
  };
  window._driverAcceptFood = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      if(!user) return alert('Login dulu');
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      if(!profile) return alert('Profile tidak ditemukan');
      const res = await driverAcceptFoodOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('✅ Order makanan diterima! Segera ke warung.');
    }catch(e){ alert('Gagal terima food: '+e.message); }
  };
  window._driverRejectFood = async (orderId)=>{
    try{
      if(!confirm('Tolak order makanan ini?')) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      const res = await driverRejectFoodOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('Order ditolak, kembali mencari driver lain');
      loadDriverFoodOrders(profile, false);
    }catch(e){ alert('Gagal tolak: '+e.message); }
  };
}

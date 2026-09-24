// driver.js - FINAL FIX - Flow Ojol sama persis + Food terhubung - Active order step-by-step
import { supabase } from './supabase.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export function driverAcceptOrder(orderId, driverProfile){
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverCompleteOrder(orderId){
  return supabase.from('orders').update({ status:'completed', completed_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverAcceptFoodOrder(orderId, driverProfile){
  // SCHEMA-SAFE: food_orders kamu tidak punya accepted_at / picked_at -> hanya status + driver_id
  return supabase.from('food_orders').update({ status:'accepted', driver_id: driverProfile.id }).eq('id', orderId).select().single();
}
export function driverFoodPreparing(orderId){
  return supabase.from('food_orders').update({ status:'preparing' }).eq('id', orderId).select().single();
}
export function driverFoodReady(orderId){
  return supabase.from('food_orders').update({ status:'ready' }).eq('id', orderId).select().single();
}
export function driverFoodPicked(orderId){
  return supabase.from('food_orders').update({ status:'picked' }).eq('id', orderId).select().single();
}
export function driverFoodCompleted(orderId){
  return supabase.from('food_orders').update({ status:'completed' }).eq('id', orderId).select().single();
}
export function driverRejectFoodOrder(orderId){
  // SCHEMA-SAFE: hanya status cancelled, tanpa cancel_reason
  return supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId).select().single();
}
export function driverRejectFoodOrderToSearch(orderId){
  return supabase.from('food_orders').update({ status:'searching_driver', driver_id: null }).eq('id', orderId).select().single();
}

let driverOrdersChannel = null; 
let driverFoodChannel = null;
let driverActiveChannel = null;
let driverOrdersInterval = null;
let lastOrdersHash = '';
let lastFoodHash = '';
let isFirstLoad = true;

function buildMapLinks(o){
  const pLat = o.pickup_lat || o.pickupLat; const pLng = o.pickup_lng || o.pickupLng;
  const dLat = o.dest_lat || o.destLat; const dLng = o.dest_lng || o.destLng;
  const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-';
  let pickupLink=''; let destLink=''; let routeLink='';
  if(pLat && pLng) pickupLink=`https://www.google.com/maps?q=${pLat},${pLng}`;
  else if(pickup.length>3) pickupLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
  if(dLat && dLng) destLink=`https://www.google.com/maps?q=${dLat},${dLng}`;
  else if(dest.length>3) destLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  if(pLat && pLng && dLat && dLng) routeLink=`https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
  return { pickupLink, destLink, routeLink };
}

// === LOAD OJOL INCOMING ===
export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box=document.getElementById('driverOrders'); if(!box) return;
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(20);
    let rejectedIds=[]; try{ rejectedIds=JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders=(q1.data||[]).filter(o=>{ if(rejectedIds.includes(o.id)) return false; if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order ojek</div>`; return; }
    box.innerHTML=orders.map(o=>{
      const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-'; const links=buildMapLinks(o);
      return `<div class="card" style="margin:8px 0;padding:10px;border:1px solid var(--border);border-radius:12px"><div style="font-size:11px">📍 ${pickup}</div><div style="font-size:11px">🎯 ${dest}</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAccept('${o.id}')" class="btn primary" style="flex:1;font-size:11px">✅ Terima Ojek</button><a href="${links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px">🗺️ Rute</a></div></div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

// === LOAD FOOD INCOMING ===
export async function loadDriverFoodOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  let box=document.getElementById('driverFoodOrders'); if(!box) return;
  try{
    const q=await supabase.from('food_orders').select('*').in('status', ['searching_driver','driver_assigned']).order('created_at',{ascending:false}).limit(20);
    let orders=(q.data||[]).filter(o=>{ if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order makanan</div>`; return; }
    box.innerHTML=orders.map(o=>{
      const isForMe=o.driver_id===driverProfile.id;
      const pickup=o.pickup_text||'-'; const dest=o.dest_text||'-'; const total=o.total||0; const items=(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ');
      const links=buildMapLinks(o);
      return `<div class="card" style="margin:8px 0;padding:10px;border:${isForMe?'2px solid #16a34a':'1px solid var(--border)'};border-radius:12px"><div style="font-weight:700;font-size:12px">${isForMe?'🎯 Untuk Kamu':'📢 Broadcast'} • Rp ${Number(total).toLocaleString()}</div><div style="font-size:11px">🏪 ${pickup}</div><div style="font-size:11px">🎯 ${dest}</div><div style="font-size:10px;color:var(--muted)">${items}</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAcceptFood('${o.id}')" class="btn primary" style="flex:1;font-size:11px">✅ Terima Food</button><button onclick="window._driverRejectFood('${o.id}')" class="btn secondary" style="flex:1;font-size:11px">❌ Tolak</button></div></div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

export async function loadDriverActiveOrders(driverProfile){
  const card=document.getElementById('driverActiveOrderCard'); if(!card) return;
  try{
    const {data:foodActive}=await supabase.from('food_orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','preparing','ready','picked']).order('created_at',{ascending:false}).limit(5);
    const {data:ojolActive}=await supabase.from('orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','picked']).order('created_at',{ascending:false}).limit(5);
    let all=[...(foodActive||[]).map(o=>({...o, _type:'food'})), ...(ojolActive||[]).map(o=>({...o, _type:'ojol'}))];
    if(!all.length){ card.style.display='none'; return; }
    card.style.display='block';
    card.innerHTML=`<h4>🚚 Order Aktif (${all.length})</h4>`+all.map(o=>{
      if(o._type==='food'){
        const map={accepted:'Driver Terima - ke Warung',preparing:'Warung Masak',ready:'Makanan Siap',picked:'OTW Antar'};
        return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0"><div style="font-size:12px;font-weight:700">🍔 ${o.pickup_text||''} • ${map[o.status]||o.status}</div><div style="font-size:11px">${o.dest_text||''}</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${o.status==='accepted'?`<button onclick="window._driverFoodPreparing('${o.id}')" class="btn primary" style="font-size:11px">🏪 Sampai Warung</button>`:''}${o.status==='preparing'?`<button onclick="window._driverFoodReady('${o.id}')" class="btn primary" style="font-size:11px">🍱 Siap</button>`:''}${o.status==='ready'?`<button onclick="window._driverFoodPicked('${o.id}')" class="btn primary" style="font-size:11px">🚚 OTW</button>`:''}${o.status==='picked'?`<button onclick="window._driverFoodCompleted('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}</div></div>`;
      } else {
        return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0"><div style="font-size:12px;font-weight:700">🏍️ Ojek ${o.status}</div><div style="font-size:11px">${o.pickup_text||''} → ${o.dest_text||''}</div><div style="margin-top:8px;display:flex;gap:6px">${o.status==='accepted'?`<button onclick="window._driverPicked('${o.id}')" class="btn primary" style="font-size:11px">🚗 OTW</button>`:''}${o.status==='picked'?`<button onclick="window._driverComplete('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}</div></div>`;
      }
    }).join('');
  }catch(e){ console.error(e); }
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p></div>`; }
  const theme=getAppTheme();
  const isOnline=(p.status||'').toLowerCase()==='online';
  return `<div class="card" style="border:1px solid var(--border)"><h3>🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||''} • Status: <b style="color:${isOnline?'#16a34a':'var(--muted)'}">${p.status}</b></p><div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🔴 Offline</button></div></div>
  <div class="card" id="driverActiveOrderCard" style="display:none"></div>
  <div class="card"><h4>📥 Order Ojek Masuk <span id="driverOrdersInfo" style="font-size:11px" class="muted"></span></h4><div id="driverOrders">Menunggu...</div></div>
  <div class="card" style="margin-top:12px"><h4>🍔 Order Makanan Masuk <span id="driverFoodInfo" style="font-size:11px" class="muted"></span></h4><div id="driverFoodOrders">Menunggu...</div></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
  isFirstLoad=true;
  setTimeout(()=>{ loadDriverOrders(driverProfile, false); loadDriverFoodOrders(driverProfile, false); loadDriverActiveOrders(driverProfile); },500); 
  subscribeDriverOrders(driverProfile); 
}

function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; }
  if(driverFoodChannel){ try{ supabase.removeChannel(driverFoodChannel); }catch(e){} driverFoodChannel=null; }
  if(driverActiveChannel){ try{ supabase.removeChannel(driverActiveChannel); }catch(e){} driverActiveChannel=null; }

  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, ()=>{ loadDriverOrders(driverProfile, true); loadDriverActiveOrders(driverProfile); })
    .subscribe();
  driverFoodChannel = supabase.channel('driver-food-'+driverProfile.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders' }, ()=>{ loadDriverFoodOrders(driverProfile, true); loadDriverActiveOrders(driverProfile); })
    .subscribe();
  driverActiveChannel = supabase.channel('driver-active-'+driverProfile.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'driver_id=eq.'+driverProfile.id }, ()=> loadDriverActiveOrders(driverProfile))
    .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:'driver_id=eq.'+driverProfile.id }, ()=> loadDriverActiveOrders(driverProfile))
    .subscribe();

  if(driverOrdersInterval) clearInterval(driverOrdersInterval);
  driverOrdersInterval = setInterval(()=>{ loadDriverOrders(driverProfile, true); loadDriverFoodOrders(driverProfile, true); loadDriverActiveOrders(driverProfile); }, 10000);
}

// Global handlers
if(typeof window !== 'undefined'){
  window._driverAccept = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      const res = await driverAcceptOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('✅ Order ojek diterima!'); loadDriverActiveOrders(profile);
    }catch(e){ alert('Gagal: '+e.message); }
  };
  window._driverPicked = async (orderId)=>{
    try{ const res=await driverPickedOrder(orderId); if(res.error) throw res.error; alert('🚗 OTW tujuan'); }catch(e){ alert(e.message); }
  };
  window._driverComplete = async (orderId)=>{
    try{ const res=await driverCompleteOrder(orderId); if(res.error) throw res.error; alert('✅ Selesai'); location.reload(); }catch(e){ alert(e.message); }
  };
  window._driverAcceptFood = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      const res = await driverAcceptFoodOrder(orderId, profile);
      if(res.error) throw res.error;
      try{ localStorage.setItem('last_food_order_accepted_'+profile.id, orderId); }catch(e){}
      alert('✅ Order makanan diterima! Pembeli akan dapat konfirmasi. Segera ke warung.');
      await loadDriverActiveOrders(profile); 
      await loadDriverFoodOrders(profile, false);
      setTimeout(()=> loadDriverActiveOrders(profile), 1000);
    }catch(e){ alert('Gagal: '+e.message); console.error(e); }
  };
  window._driverFoodPreparing = async (orderId)=>{
    try{ const res=await driverFoodPreparing(orderId); if(res.error) throw res.error; alert('🏪 Sampai warung, warung mulai masak'); }catch(e){ alert(e.message); }
  };
  window._driverFoodReady = async (orderId)=>{
    try{ const res=await driverFoodReady(orderId); if(res.error) throw res.error; alert('🍱 Makanan siap'); }catch(e){ alert(e.message); }
  };
  window._driverFoodPicked = async (orderId)=>{
    try{ const res=await driverFoodPicked(orderId); if(res.error) throw res.error; alert('🚚 OTW antar ke pembeli - pembeli akan lihat tracking Driver OTW'); }catch(e){ alert(e.message); }
  };
  window._driverFoodCompleted = async (orderId)=>{
    try{ const res=await driverFoodCompleted(orderId); if(res.error) throw res.error; alert('✅ Selesai antar makanan'); location.reload(); }catch(e){ alert(e.message); }
  };
  window._driverRejectFood = async (orderId)=>{
    try{
      if(!confirm('Tolak order makanan ini? Pembeli akan dapat notifikasi penolakan dan order dibatalkan.')) return;
      const res=await driverRejectFoodOrder(orderId); 
      if(res.error) throw res.error;
      alert('❌ Order ditolak. Pembeli akan dapat info penolakan & modal auto tutup.');
      try{ 
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from('users').select('id').eq('google_id', user.id).single();
        if(profile) localStorage.removeItem('last_food_order_accepted_'+profile.id);
      }catch(e){}
      location.reload();
    }catch(e){ alert('Gagal tolak: '+e.message); }
  };
}

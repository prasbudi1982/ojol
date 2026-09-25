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
  const pLat = o.pickup_lat || o.pickupLat || o.store_lat || o.storeLat; 
  const pLng = o.pickup_lng || o.pickupLng || o.store_lng || o.storeLng;
  const dLat = o.dest_lat || o.destLat || o.customer_lat; 
  const dLng = o.dest_lng || o.destLng || o.customer_lng;
  const pickup = o.pickup_text||o.pickup||o.store_name||o.storeName||'-'; 
  const dest = o.dest_text||o.destination||o.customer_address||'-';
  let pickupLink=''; let destLink=''; let routeLink='';
  if(pLat && pLng) pickupLink=`https://www.google.com/maps?q=${pLat},${pLng}`;
  else if(pickup && pickup.length>3) pickupLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
  if(dLat && dLng) destLink=`https://www.google.com/maps?q=${dLat},${dLng}`;
  else if(dest && dest.length>3) destLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  if(pLat && pLng && dLat && dLng) routeLink=`https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
  else if(pickupLink && destLink) routeLink=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  return { pickupLink, destLink, routeLink, pLat, pLng, dLat, dLng };
}

function normalizeWaPhone(phone){
  if(!phone) return null;
  let p = String(phone).replace(/[^0-9+]/g,'');
  if(!p) return null;
  if(p.startsWith('+')) p=p.slice(1);
  if(p.startsWith('0')) p='62'+p.slice(1);
  if(p.startsWith('8')) p='62'+p;
  return p;
}
function extractCustomerPhone(o){
  // 1. langsung dari order jika ada
  const candidates = [
    o.customer_phone, o.customerPhone, o.buyer_phone, o.buyerPhone,
    o.passenger_phone, o.passengerPhone, o.user_phone, o.phone,
    o.dest_phone, o.destPhone, o.wa, o.whatsapp, o.phone_number,
    o.customer?.phone, o.passenger?.phone, o.user?.phone, o.buyer?.phone,
    o._userPhone, o._customerPhone // dari join users
  ];
  for(let c of candidates){
    if(c && String(c).trim().length>=9) return String(c).trim();
  }
  return null;
}
function buildWaLink(o, type='customer'){
  let raw=null;
  if(type==='store' || type==='warung'){
    raw = o._storePhone || o._warungPhone || o.store_phone || o.warung_phone || o.store?.phone;
  } else {
    raw = extractCustomerPhone(o);
  }
  const norm = normalizeWaPhone(raw);
  if(!norm) return null;
  const isFood = o._type==='food' || o.store_id || o.pickup_text;
  let msg='';
  if(type==='store' || type==='warung'){
    msg = `Halo kak Warung ${o.pickup_text||o.store_name||''}, saya driver Ojol Suruh yang terima order makanan tujuan ${o.dest_text||''}. Pesanan ${o.id?.slice(0,6)||''} ya kak, saya OTW ke warung 🙏`;
  } else {
    msg = isFood 
      ? `Halo kak, saya driver Ojol Suruh yang terima order makanan ${o.pickup_text||o.store_name||''} tujuan ${o.dest_text||''}. Saya OTW ya kak 🙏`
      : `Halo kak, saya driver Ojol Suruh yang terima order ojek dari ${o.pickup_text||''} ke ${o.dest_text||''}. Saya OTW jemput ya kak 🙏`;
  }
  return { link:`https://wa.me/${norm}?text=${encodeURIComponent(msg)}`, raw, norm, type };
}
function buildWaLinkCustomer(o){ return buildWaLink(o,'customer'); }
function buildWaLinkWarung(o){ return buildWaLink(o,'store'); }

async function enrichOrdersWithUserPhone(orders){
  try{
    if(!orders||!orders.length) return orders;
    const userIds = [...new Set(orders.map(o=> o.passenger_id || o.customer_id || o.user_id || o.buyer_id || o.customer || o.passenger || o.owner_id).filter(Boolean))];
    if(!userIds.length) return orders;
    const {data:users, error} = await supabase.from('users').select('id, hp').in('id', userIds);
    if(error || !users) return orders;
    const map={};
    users.forEach(u=>{
      const phone = u.hp;
      if(phone) map[u.id]=phone;
    });
    return orders.map(o=>{
      const uid = o.passenger_id || o.customer_id || o.user_id || o.buyer_id || o.customer || o.passenger;
      if(uid && map[uid]){
        o._userPhone = map[uid];
        o._customerPhone = map[uid];
      }
      return o;
    });
  }catch(e){ console.warn('enrich phone fail',e); return orders; }
}
async function enrichOrdersWithStorePhone(orders){
  try{
    if(!orders||!orders.length) return orders;
    const storeIds = [...new Set(orders.map(o=> o.store_id || o.storeId || o.warung_id).filter(Boolean))];
    if(!storeIds.length) return orders;
    // fetch stores
    const {data:stores, error} = await supabase.from('stores').select('id, wa_number, owner_id, user_id, name').in('id', storeIds);
    if(error || !stores) return orders;
    const storeMap={};
    const ownerIds=[];
    stores.forEach(s=>{
      const phone = s.wa_number;
      if(phone) storeMap[s.id]=phone;
      if(!phone){
        const oid = s.owner_id || s.user_id;
        if(oid) ownerIds.push(oid);
      }
    });
    // jika store gak punya phone, ambil dari owner di users
    if(ownerIds.length){
      try{
        const {data:owners} = await supabase.from('users').select('id, hp').in('id', [...new Set(ownerIds)]);
        const ownerPhoneMap={};
        (owners||[]).forEach(u=>{
          const ph = u.hp;
          if(ph) ownerPhoneMap[u.id]=ph;
        });
        stores.forEach(s=>{
          if(!storeMap[s.id]){
            const oid = s.owner_id || s.user_id;
            if(oid && ownerPhoneMap[oid]) storeMap[s.id]=ownerPhoneMap[oid];
          }
        });
      }catch(e){}
    }
    return orders.map(o=>{
      const sid = o.store_id || o.storeId || o.warung_id;
      if(sid && storeMap[sid]){
        o._storePhone = storeMap[sid];
        o._warungPhone = storeMap[sid];
      }
      return o;
    });
  }catch(e){ console.warn('enrich store phone fail',e); return orders; }
}




// === LOAD OJOL INCOMING ===
export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box=document.getElementById('driverOrders'); if(!box) return;
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(20);
    let rejectedIds=[]; try{ rejectedIds=JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders=(q1.data||[]).filter(o=>{ if(rejectedIds.includes(o.id)) return false; if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });
    // ENRICH WA dari tabel users
    orders = await enrichOrdersWithUserPhone(orders);
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order ojek</div>`; return; }
    box.innerHTML=orders.map(o=>{
      const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-'; const links=buildMapLinks(o);
      return `<div class="card" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--card);box-shadow:0 2px 12px var(--shadow)"><div style="font-size:11px">📍 ${pickup}</div><div style="font-size:11px">🎯 ${dest}</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAccept('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Ojek</button><a href="${links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px;border-radius:10px">🗺️ Rute</a></div></div>`;
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
    // ENRICH WA dari tabel users (customer_id / user_id) + WA warung dari stores
    orders = await enrichOrdersWithUserPhone(orders);
    orders = await enrichOrdersWithStorePhone(orders);
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order makanan</div>`; return; }
    box.innerHTML=orders.map(o=>{
      const isForMe=o.driver_id===driverProfile.id;
      const pickup=o.pickup_text||'-'; const dest=o.dest_text||'-'; const total=o.total||0; const items=(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ');
      const links=buildMapLinks(o);
      return `<div class="card" style="margin:8px 0;padding:10px;border:${isForMe?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:16px;background:var(--card);box-shadow:0 4px 16px var(--shadow)"><div style="font-weight:700;font-size:12px">${isForMe?'🎯 Untuk Kamu':'📢 Broadcast'} • Rp ${Number(total).toLocaleString()}</div><div style="font-size:11px">🏪 ${pickup}</div><div style="font-size:11px">🎯 ${dest}</div><div style="font-size:10px;color:var(--muted)">${items}</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAcceptFood('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Food</button><button onclick="window._driverRejectFood('${o.id}')" class="btn secondary" style="flex:1;font-size:11px;border-radius:10px">❌ Tolak</button></div></div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

export async function loadDriverActiveOrders(driverProfile){
  const card=document.getElementById('driverActiveOrderCard'); if(!card) return;
  try{
    let {data:foodActive}=await supabase.from('food_orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','preparing','ready','picked']).order('created_at',{ascending:false}).limit(5);
    let {data:ojolActive}=await supabase.from('orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','picked']).order('created_at',{ascending:false}).limit(5);
    foodActive = await enrichOrdersWithUserPhone(foodActive||[]);
    ojolActive = await enrichOrdersWithUserPhone(ojolActive||[]);
    let all=[...(foodActive||[]).map(o=>({...o, _type:'food'})), ...(ojolActive||[]).map(o=>({...o, _type:'ojol'}))];
    if(!all.length){ card.style.display='none'; return; }
    card.style.display='block';
    card.innerHTML=`<h4>🚚 Order Aktif (${all.length})</h4>`+all.map(o=>{
      if(o._type==='food'){
        const map={accepted:'Driver Terima - ke Warung',preparing:'Warung Masak',ready:'Makanan Siap',picked:'OTW Antar'};
        const links=buildMapLinks(o);
        const wa=buildWaLink(o,'customer');
        const waWarung=buildWaLink(o,'store');
        const waBtn = wa ? `<a href="${wa.link}" target="_blank" class="btn" style="font-size:10px;background:#25D366;color:white;border:none;border-radius:8px;padding:6px">💬 WA Pembeli</a>` : '';
        const waWarungBtn = waWarung ? `<a href="${waWarung.link}" target="_blank" class="btn" style="font-size:10px;background:#128C7E;color:white;border:none;border-radius:8px;padding:6px">🏪 WA Warung</a>` : '';
        return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin:8px 0;background:var(--card2)"><div style="font-size:12px;font-weight:800;color:var(--text)">🍔 ${o.pickup_text||''} • ${map[o.status]||o.status}</div><div style="font-size:11px;color:var(--muted)">${o.dest_text||''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <a href="${links.pickupLink}" target="_blank" class="btn secondary" style="font-size:10px">🏪 Map Warung</a>
            <a href="${links.destLink}" target="_blank" class="btn secondary" style="font-size:10px">📍 Map Pembeli</a>
            <a href="${links.routeLink}" target="_blank" class="btn secondary" style="font-size:10px">🗺️ Rute</a>
            ${waBtn}
            ${waWarungBtn}
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${o.status==='accepted'?`<button onclick="window._driverFoodPreparing('${o.id}')" class="btn primary" style="font-size:11px">🏪 Sampai Warung</button>`:''}${o.status==='preparing'?`<button onclick="window._driverFoodReady('${o.id}')" class="btn primary" style="font-size:11px">🍱 Siap</button>`:''}${o.status==='ready'?`<button onclick="window._driverFoodPicked('${o.id}')" class="btn primary" style="font-size:11px">🚚 OTW</button>`:''}${o.status==='picked'?`<button onclick="window._driverFoodCompleted('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}</div></div>`;
      } else {
        const links=buildMapLinks(o);
        const wa=buildWaLink(o,'customer');
        const waBtn = wa ? `<a href="${wa.link}" target="_blank" class="btn" style="font-size:10px;background:#25D366;color:white;border:none;border-radius:8px;padding:6px">💬 WA Penumpang</a>` : '';
        return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin:8px 0;background:var(--card2)"><div style="font-size:12px;font-weight:800;color:var(--text)">🏍️ Ojek ${o.status}</div><div style="font-size:11px;color:var(--muted)">${o.pickup_text||''} → ${o.dest_text||''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <a href="${links.pickupLink}" target="_blank" class="btn secondary" style="font-size:10px">📍 Map Pickup</a>
            <a href="${links.destLink}" target="_blank" class="btn secondary" style="font-size:10px">🎯 Map Tujuan</a>
            <a href="${links.routeLink}" target="_blank" class="btn secondary" style="font-size:10px">🗺️ Rute</a>
            ${waBtn}
          </div>
          <div style="margin-top:8px;display:flex;gap:6px">${o.status==='accepted'?`<button onclick="window._driverPicked('${o.id}')" class="btn primary" style="font-size:11px">🚗 OTW</button>`:''}${o.status==='picked'?`<button onclick="window._driverComplete('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}</div></div>`;
      }
    }).join('');
  }catch(e){ console.error(e); }
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p></div>`; }
  const theme=getAppTheme();
  const isOnline=(p.status||'').toLowerCase()==='online';
  return `<div class="card" style="border:1px solid var(--border);background:var(--card);border-radius:16px;box-shadow:0 4px 16px var(--shadow)"><h3 style="color:var(--text)">🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||''} • Status: <b style="color:${isOnline?'var(--primary)':'var(--muted)'}">${p.status}</b></p><div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🔴 Offline</button></div></div>
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

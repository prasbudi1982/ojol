// driver.js - FINAL FIX - Flow Ojol sama persis + Food terhubung - Active order step-by-step
// UPDATE: Tambah data pembeli/penumpang + tombol chat WA
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

// === NEW HELPER: WA ===
function formatWaNumber(num){
  if(!num) return '';
  let n = String(num).replace(/\D/g,'');
  if(!n) return '';
  if(n.startsWith('0')) n = '62' + n.slice(1);
  if(n.startsWith('8')) n = '62' + n;
  return n;
}
function buildWaLink(phone, text){
  const wa = formatWaNumber(phone);
  if(!wa) return '';
  return `https://wa.me/${wa}?text=${encodeURIComponent(text||'')}`;
}

// === NEW HELPER: FETCH USERS MAP ===
async function fetchUsersMap(userIds){
  const uniq = [...new Set((userIds||[]).filter(Boolean))];
  if(uniq.length===0) return {};
  try{
    const { data } = await supabase.from('users').select('id, name, hp').in('id', uniq);
    const map = {};
    (data||[]).forEach(u=>{ map[u.id]=u; });
    return map;
  }catch(e){ return {}; }
}
async function fetchStoresMap(storeIds){
  const uniq = [...new Set((storeIds||[]).filter(Boolean))];
  if(uniq.length===0) return {};
  try{
    const { data } = await supabase.from('stores').select('id, name, wa_number').in('id', uniq);
    const map = {};
    (data||[]).forEach(s=>{ map[s.id]=s; });
    return map;
  }catch(e){ return {}; }
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

    // === TAMBAHAN: Ambil data penumpang dari users ===
    const userIds = orders.map(o=> o.user_id || o.customer_id || o.buyer_id || o.passenger_id).filter(Boolean);
    const usersMap = await fetchUsersMap(userIds);

    box.innerHTML=orders.map(o=>{
      const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-'; const links=buildMapLinks(o);
      const uid = o.user_id || o.customer_id || o.buyer_id || o.passenger_id;
      const penumpang = usersMap[uid] || {};
      const namaPenumpang = penumpang.name || o.customer_name || o.passenger_name || '-';
      const hpPenumpang = penumpang.hp || o.customer_hp || o.customer_phone || o.hp || '';
      const waLinkPenumpang = buildWaLink(hpPenumpang, `Halo kak ${namaPenumpang}, saya driver ojek yang dapat orderan dari ${pickup} ke ${dest}. Saya OTW ke lokasi jemput ya.`);
      
      return `<div class="card" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--card);box-shadow:0 2px 12px var(--shadow)">
        <div style="font-size:11px">📍 ${pickup}</div>
        <div style="font-size:11px">🎯 ${dest}</div>
        <div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:10px;border:1px dashed var(--border)">
          <div style="font-size:11px;font-weight:600">👤 Penumpang: ${namaPenumpang}</div>
          <div style="font-size:11px">📱 ${hpPenumpang||'- tidak ada no HP -'}</div>
          ${waLinkPenumpang?`<a href="${waLinkPenumpang}" target="_blank" class="btn" style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;background:#25D366;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat WA Penumpang</a>`:''}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAccept('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Ojek</button><a href="${links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px;border-radius:10px">🗺️ Rute</a></div></div>`;
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

    // === TAMBAHAN: Ambil data pembeli + warung ===
    const userIds = orders.map(o=> o.user_id || o.customer_id || o.buyer_id).filter(Boolean);
    const storeIds = orders.map(o=> o.store_id || o.warung_id || o.shop_id).filter(Boolean);
    const [usersMap, storesMap] = await Promise.all([fetchUsersMap(userIds), fetchStoresMap(storeIds)]);

    box.innerHTML=orders.map(o=>{
      const isForMe=o.driver_id===driverProfile.id;
      const pickup=o.pickup_text||'-'; const dest=o.dest_text||'-'; const total=o.total||0; const items=(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ');
      const links=buildMapLinks(o);

      const uid = o.user_id || o.customer_id || o.buyer_id;
      const sid = o.store_id || o.warung_id || o.shop_id;
      const pembeli = usersMap[uid] || {};
      const warung = storesMap[sid] || {};

      const namaPembeli = pembeli.name || o.customer_name || o.buyer_name || '-';
      const hpPembeli = pembeli.hp || o.customer_hp || o.buyer_hp || o.customer_phone || '';
      const namaWarung = warung.name || o.store_name || o.warung_name || pickup || '-';
      const waWarung = warung.wa_number || o.store_wa || o.warung_wa || '';

      const waLinkPembeli = buildWaLink(hpPembeli, `Halo kak ${namaPembeli}, saya driver makanan untuk pesanan ${items}. Pesanan ${total>0?'Rp'+Number(total).toLocaleString('id-ID'):''} dari ${namaWarung}. Segera saya proses ya.`);
      const waLinkWarung = buildWaLink(waWarung, `Halo kak ${namaWarung}, ada order makanan ${items} untuk ${namaPembeli} (${hpPembeli}). Saya driver segera ke lokasi.`);

      return `<div class="card" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--card);box-shadow:0 2px 12px var(--shadow)"><div style="font-size:11px;font-weight:600">${namaWarung}</div><div style="font-size:10px" class="muted">${items||'-'}</div><div style="font-size:11px">📍 ${pickup}</div><div style="font-size:11px">🎯 ${dest}</div><div style="font-size:11px">💰 Rp${Number(total).toLocaleString('id-ID')}</div>
      
      <div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:10px;border:1px dashed var(--border)">
        <div style="font-size:11px;font-weight:600">👤 Pembeli: ${namaPembeli}</div>
        <div style="font-size:11px">📱 ${hpPembeli||'-'}</div>
        ${waLinkPembeli?`<a href="${waLinkPembeli}" target="_blank" class="btn" style="margin-top:4px;display:inline-flex;gap:4px;background:#25D366;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat Pembeli</a>`:''}
        <div style="margin-top:8px;font-size:11px;font-weight:600">🏪 Warung: ${namaWarung}</div>
        <div style="font-size:11px">📱 ${waWarung||'-'}</div>
        ${waLinkWarung?`<a href="${waLinkWarung}" target="_blank" class="btn" style="margin-top:4px;display:inline-flex;gap:4px;background:#128C7E;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat Warung</a>`:''}
      </div>

      <div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAcceptFood('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Food ${isForMe?'(Sudah Assigned)':''}</button><a href="${links.pickupLink||links.routeLink}" target="_blank" class="btn secondary" style="flex:1;font-size:11px;border-radius:10px">🗺️ Rute Warung</a></div></div>`;
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

// === TAMBAHAN: ACTIVE ORDER JUGA TAMPILKAN DATA WA (jika loadDriverActiveOrders ada di file ini, ini patch-nya) ===
// Jika function loadDriverActiveOrders ada di file lain, copy helper formatWaNumber, buildWaLink, fetchUsersMap, fetchStoresMap kesana
// dan di render active order tambahkan:
// const user = usersMap[order.user_id]; const store = storesMap[order.store_id];
// Lalu tampilkan tombol WA sama seperti di atas

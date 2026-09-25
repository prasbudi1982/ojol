// driver.js - FIX ERROR loadDriverActiveOrders is not defined + Lengkap WA + Map
// Hanya menambah, tidak mengubah flow lama
import { supabase } from './supabase.js';
import { notifyOjol, notifyFood } from './push.js';


function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export function driverAcceptOrder(orderId, driverProfile){
  try{ notifyOjol('✅ Kamu Terima Order', `Order ${orderId.slice(0,6)} diterima - OTW pickup`, '/#/driver'); }catch(e){}
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverCompleteOrder(orderId){
  return supabase.from('orders').update({ status:'completed', completed_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverAcceptFoodOrder(orderId, driverProfile){
  try{ notifyFood('🍔 Kamu Terima Food', `Order ${orderId.slice(0,6)} diterima - OTW ke warung`, '/#/driver'); }catch(e){}
  return supabase.from('food_orders').update({ status:'accepted', driver_id: driverProfile.id }).eq('id', orderId).select().single();
}
export function driverFoodPreparing(orderId){
  try{ notifyFood('🏪 Sampai Warung', `Warung mulai masak - ${orderId.slice(0,6)}`, '/#/driver'); }catch(e){}
  return supabase.from('food_orders').update({ status:'preparing' }).eq('id', orderId).select().single();
}
export function driverFoodReady(orderId){
  try{ notifyFood('🍱 Makanan Siap', `Makanan siap antar - ${orderId.slice(0,6)}`, '/#/driver'); }catch(e){}
  return supabase.from('food_orders').update({ status:'ready' }).eq('id', orderId).select().single();
}
export function driverFoodPicked(orderId){
  try{ notifyFood('🚚 OTW Antar Food', `Mengantar ke pembeli - ${orderId.slice(0,6)}`, '/#/driver'); }catch(e){}
  return supabase.from('food_orders').update({ status:'picked' }).eq('id', orderId).select().single();
}
export function driverFoodCompleted(orderId){
  try{ notifyFood('✅ Food Selesai Antar', `Food selesai - ${orderId.slice(0,6)}`, '/#/driver'); }catch(e){}
  return supabase.from('food_orders').update({ status:'completed' }).eq('id', orderId).select().single();
}
export function driverRejectFoodOrder(orderId){
  return supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId).select().single();
}
export function driverRejectFoodOrderToSearch(orderId){
  return supabase.from('food_orders').update({ status:'searching_driver', driver_id: null }).eq('id', orderId).select().single();
}

let driverOrdersChannel = null; 
let lastOjolCount = 0;
let lastFoodCount = 0;

let driverFoodChannel = null;
let driverActiveChannel = null;
let driverOrdersInterval = null;

function buildMapLinks(o){
  const pLat = o.pickup_lat || o.pickupLat; const pLng = o.pickup_lng || o.pickupLng;
  const dLat = o.dest_lat || o.destLat; const dLng = o.dest_lng || o.destLng;
  const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-';
  let pickupLink=''; let destLink=''; let routeLink='';
  if(pLat && pLng) pickupLink=`https://www.google.com/maps?q=${pLat},${pLng}`;
  else if(pickup && pickup.length>3) pickupLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
  if(dLat && dLng) destLink=`https://www.google.com/maps?q=${dLat},${dLng}`;
  else if(dest && dest.length>3) destLink=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  if(pLat && pLng && dLat && dLng) routeLink=`https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
  else if(pickupLink && destLink) routeLink=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  return { pickupLink, destLink, routeLink };
}

// === HELPER WA & FETCH ===
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

// === LOAD OJOL INCOMING - DENGAN WA + MAP ===
export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box=document.getElementById('driverOrders'); if(!box) return;
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(20);
    let rejectedIds=[]; try{ rejectedIds=JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders=(q1.data||[]).filter(o=>{ if(rejectedIds.includes(o.id)) return false; if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });
    // STEP1: Notif order baru masuk untuk driver (tanpa ubah logic)
    try{
      if(orders.length>lastOjolCount && lastOjolCount!==0){
        const diff = orders.length-lastOjolCount;
        if(diff>0 && orders[0]){ notifyOjol(`📦 ${diff} Order Baru Masuk!`, `${orders[0].pickup_text||'-'} → ${orders[0].dest_text||'-'} • Rp ${orders[0].estimated_cost?.toLocaleString('id-ID')||'-'}`, '/#/driver'); }
      }
      lastOjolCount = orders.length;
    }catch(e){}
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order ojek</div>`; return; }

    const userIds = orders.map(o=> o.user_id || o.customer_id || o.buyer_id || o.passenger_id).filter(Boolean);
    const usersMap = await fetchUsersMap(userIds);

    box.innerHTML=orders.map(o=>{
      const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-'; const links=buildMapLinks(o);
      const uid = o.user_id || o.customer_id || o.buyer_id || o.passenger_id;
      const penumpang = usersMap[uid] || {};
      const nama = penumpang.name || o.customer_name || o.passenger_name || 'Penumpang';
      const hp = penumpang.hp || o.customer_hp || o.customer_phone || o.hp || '';
      const waLink = buildWaLink(hp, `Halo kak ${nama}, saya driver ojek ${driverProfile.name||''}. Order dari ${pickup} ke ${dest}. Saya OTW jemput ya.`);

      return `<div class="card" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--card);box-shadow:0 2px 12px var(--shadow)">
        <div style="font-size:11px">📍 ${pickup}</div>
        <div style="font-size:11px">🎯 ${dest}</div>
        <div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:10px;border:1px dashed var(--border)">
          <div style="font-size:11px;font-weight:700">👤 Penumpang: ${nama}</div>
          <div style="font-size:11px">📱 ${hp||'-'}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            ${waLink?`<a href="${waLink}" target="_blank" style="display:inline-flex;background:#25D366;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat WA Penumpang</a>`:''}
            ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">📍 Map Jemput</a>`:''}
            ${links.destLink?`<a href="${links.destLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">🎯 Map Tujuan</a>`:''}
            ${links.routeLink?`<a href="${links.routeLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">🗺️ Rute</a>`:''}
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAccept('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Ojek</button></div>
      </div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

// === LOAD FOOD INCOMING - DENGAN WA + MAP WARUNG & PEMBELI ===
let _lastFoodIds = new Set();
export async function loadDriverFoodOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  let box=document.getElementById('driverFoodOrders'); if(!box) return;
  try{
    const q=await supabase.from('food_orders').select('*').in('status', ['searching_driver','driver_assigned']).order('created_at',{ascending:false}).limit(20);
    let orders=(q.data||[]).filter(o=>{ if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });
    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order makanan</div>`; return; }

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
      const namaPembeli = pembeli.name || o.customer_name || o.buyer_name || 'Pembeli';
      const hpPembeli = pembeli.hp || o.customer_hp || o.buyer_hp || '';
      const namaWarung = warung.name || o.store_name || o.warung_name || pickup || 'Warung';
      const waWarung = warung.wa_number || o.store_wa || o.warung_wa || '';
      const waLinkPembeli = buildWaLink(hpPembeli, `Halo kak ${namaPembeli}, saya driver makanan ${driverProfile.name||''}. Pesanan ${items} dari ${namaWarung} total Rp${Number(total).toLocaleString('id-ID')}. Saya proses ya.`);
      const waLinkWarung = buildWaLink(waWarung, `Halo ${namaWarung}, ada order ${items} untuk ${namaPembeli}. Saya driver ${driverProfile.name||''} OTW ke warung.`);

      return `<div class="card" style="margin:8px 0;padding:10px;border:${isForMe?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:16px;background:var(--card);box-shadow:0 4px 16px var(--shadow)">
        <div style="font-weight:700;font-size:12px">${isForMe?'🎯 Untuk Kamu':'📢 Broadcast'} • Rp ${Number(total).toLocaleString('id-ID')}</div>
        <div style="font-size:11px">🏪 ${namaWarung} → 🎯 ${dest}</div>
        <div style="font-size:10px;color:var(--muted)">${items}</div>
        <div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:10px;border:1px dashed var(--border)">
          <div style="font-size:11px;font-weight:700">👤 Pembeli: ${namaPembeli}</div>
          <div style="font-size:11px">📱 ${hpPembeli||'-'}</div>
          <div style="font-size:11px;font-weight:700;margin-top:6px">🏪 Warung: ${namaWarung}</div>
          <div style="font-size:11px">📱 ${waWarung||'-'}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            ${waLinkPembeli?`<a href="${waLinkPembeli}" target="_blank" style="display:inline-flex;background:#25D366;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat Pembeli</a>`:''}
            ${waLinkWarung?`<a href="${waLinkWarung}" target="_blank" style="display:inline-flex;background:#128C7E;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none">💬 Chat Warung</a>`:''}
            ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">📍 Map Warung</a>`:''}
            ${links.destLink?`<a href="${links.destLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">📍 Map Pembeli</a>`:''}
            ${links.routeLink?`<a href="${links.routeLink}" target="_blank" class="btn secondary" style="font-size:11px;border-radius:8px;padding:6px 10px;text-decoration:none">🗺️ Rute</a>`:''}
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px"><button onclick="window._driverAcceptFood('${o.id}')" class="btn primary" style="flex:1;font-size:11px;border-radius:10px">✅ Terima Food</button><button onclick="window._driverRejectFood('${o.id}')" class="btn secondary" style="flex:1;font-size:11px;border-radius:10px">❌ Tolak</button></div>
      </div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

// === LOAD ACTIVE ORDER - LENGKAP WA + MAP ===
export async function loadDriverActiveOrders(driverProfile){
  const card=document.getElementById('driverActiveOrderCard'); if(!card) return;
  try{
    const {data:foodActive}=await supabase.from('food_orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','preparing','ready','picked']).order('created_at',{ascending:false}).limit(5);
    const {data:ojolActive}=await supabase.from('orders').select('*').eq('driver_id', driverProfile.id).in('status', ['accepted','picked']).order('created_at',{ascending:false}).limit(5);
    let all=[...(foodActive||[]).map(o=>({...o, _type:'food'})), ...(ojolActive||[]).map(o=>({...o, _type:'ojol'}))];
    if(!all.length){ card.style.display='none'; return; }

    const userIds = all.map(o=> o.user_id || o.customer_id || o.buyer_id || o.passenger_id).filter(Boolean);
    const storeIds = (foodActive||[]).map(o=> o.store_id || o.warung_id || o.shop_id).filter(Boolean);
    const [usersMap, storesMap] = await Promise.all([fetchUsersMap(userIds), fetchStoresMap(storeIds)]);

    card.style.display='block';
    card.innerHTML=`<h4>🚚 Order Aktif (${all.length})</h4>`+all.map(o=>{
      const links = buildMapLinks(o);
      const uid = o.user_id || o.customer_id || o.buyer_id || o.passenger_id;
      const sid = o.store_id || o.warung_id || o.shop_id;
      const pembeli = usersMap[uid] || {};
      const warung = storesMap[sid] || {};
      const namaPembeli = pembeli.name || o.customer_name || o.buyer_name || o.passenger_name || 'Pelanggan';
      const hpPembeli = pembeli.hp || o.customer_hp || o.buyer_hp || o.customer_phone || o.hp || '';
      const namaWarung = warung.name || o.store_name || o.warung_name || o.pickup_text || 'Warung';
      const waWarung = warung.wa_number || o.store_wa || o.warung_wa || '';
      const waLinkPembeli = buildWaLink(hpPembeli, o._type==='food' ? `Halo kak ${namaPembeli}, saya driver ${driverProfile.name||''} yang bawa pesanan ${namaWarung}. Saya OTW ke ${o.dest_text||'lokasi kakak'} ya.` : `Halo kak ${namaPembeli}, saya driver ojek ${driverProfile.name||''} OTW ke ${o.dest_text||'tujuan'}.`);
      const waLinkWarung = buildWaLink(waWarung, `Halo ${namaWarung}, saya driver ${driverProfile.name||''} untuk order a.n ${namaPembeli}, status ${o.status}.`);

      if(o._type==='food'){
        const map={accepted:'Driver Terima - ke Warung',preparing:'Warung Masak',ready:'Makanan Siap',picked:'OTW Antar'};
        return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;background:var(--card)">
          <div style="font-size:12px;font-weight:700">🍔 ${namaWarung} • ${map[o.status]||o.status}</div>
          <div style="font-size:11px">${o.dest_text||''} • Rp${Number(o.total||0).toLocaleString('id-ID')}</div>
          <div style="margin-top:6px;padding:8px;background:var(--bg);border-radius:8px;border:1px dashed var(--border)">
            <div style="font-size:11px;font-weight:700">👤 Pembeli: ${namaPembeli} • ${hpPembeli||'-'}</div>
            <div style="font-size:11px;font-weight:700">🏪 Warung: ${namaWarung} • ${waWarung||'-'}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              ${waLinkPembeli?`<a href="${waLinkPembeli}" target="_blank" style="background:#25D366;color:#fff;padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">💬 WA Pembeli</a>`:''}
              ${waLinkWarung?`<a href="${waLinkWarung}" target="_blank" style="background:#128C7E;color:#fff;padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">💬 WA Warung</a>`:''}
              ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">📍 Map Warung</a>`:''}
              ${links.destLink?`<a href="${links.destLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">📍 Map Pembeli</a>`:''}
              ${links.routeLink?`<a href="${links.routeLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">🗺️ Rute</a>`:''}
            </div>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${o.status==='accepted'?`<button onclick="window._driverFoodPreparing('${o.id}')" class="btn primary" style="font-size:11px">🏪 Sampai Warung</button>`:''}
            ${o.status==='preparing'?`<button onclick="window._driverFoodReady('${o.id}')" class="btn primary" style="font-size:11px">🍱 Siap</button>`:''}
            ${o.status==='ready'?`<button onclick="window._driverFoodPicked('${o.id}')" class="btn primary" style="font-size:11px">🚚 OTW</button>`:''}
            ${o.status==='picked'?`<button onclick="window._driverFoodCompleted('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}
          </div>
        </div>`;
      } else {
        const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-';
        return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;background:var(--card)">
          <div style="font-size:12px;font-weight:700">🏍️ Ojek ${o.status}</div>
          <div style="font-size:11px">${pickup} → ${dest}</div>
          <div style="margin-top:6px;padding:8px;background:var(--bg);border-radius:8px;border:1px dashed var(--border)">
            <div style="font-size:11px;font-weight:700">👤 Penumpang: ${namaPembeli} • ${hpPembeli||'-'}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              ${waLinkPembeli?`<a href="${waLinkPembeli}" target="_blank" style="background:#25D366;color:#fff;padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">💬 WA Penumpang</a>`:''}
              ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">📍 Map Jemput</a>`:''}
              ${links.destLink?`<a href="${links.destLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">📍 Map Tujuan</a>`:''}
              ${links.routeLink?`<a href="${links.routeLink}" target="_blank" style="background:var(--border);padding:5px 9px;border-radius:6px;font-size:10px;text-decoration:none">🗺️ Rute</a>`:''}
            </div>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px">
            ${o.status==='accepted'?`<button onclick="window._driverPicked('${o.id}')" class="btn primary" style="font-size:11px">🚗 OTW</button>`:''}
            ${o.status==='picked'?`<button onclick="window._driverComplete('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}
          </div>
        </div>`;
      }
    }).join('');
  }catch(e){ console.error(e); card.style.display='none'; }
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p></div>`; }
  const isOnline=(p.status||'').toLowerCase()==='online';
  return `<div class="card" style="border:1px solid var(--border);background:var(--card);border-radius:16px;box-shadow:0 4px 16px var(--shadow)"><h3 style="color:var(--text)">🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||''} • Status: <b style="color:${isOnline?'var(--primary)':'var(--muted)'}">${p.status}</b></p><div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'primary':'secondary'}" style="padding:10px 16px;border-radius:10px">🔴 Offline</button></div></div>
  <div class="card" id="driverActiveOrderCard" style="display:none"></div>
  <div class="card"><h4>📥 Order Ojek Masuk</h4><div id="driverOrders">Menunggu...</div></div>
  <div class="card" style="margin-top:12px"><h4>🍔 Order Makanan Masuk</h4><div id="driverFoodOrders">Menunggu...</div></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
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

// === FIX: Pastikan loadDriverActiveOrders tersedia di window juga ===
if(typeof window !== 'undefined'){
  window.loadDriverActiveOrders = loadDriverActiveOrders;
  window.loadDriverOrders = loadDriverOrders;
  window.loadDriverFoodOrders = loadDriverFoodOrders;

  window._driverAccept = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      const res = await driverAcceptOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('✅ Order ojek diterima!'); 
      if(typeof loadDriverActiveOrders === 'function') await loadDriverActiveOrders(profile);
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
      alert('✅ Order makanan diterima! Segera ke warung.');
      if(typeof loadDriverActiveOrders === 'function') await loadDriverActiveOrders(profile);
      if(typeof loadDriverFoodOrders === 'function') await loadDriverFoodOrders(profile, false);
    }catch(e){ alert('Gagal: '+e.message); console.error(e); }
  };
  window._driverFoodPreparing = async (orderId)=>{
    try{ const res=await driverFoodPreparing(orderId); if(res.error) throw res.error; alert('🏪 Sampai warung, warung mulai masak'); }catch(e){ alert(e.message); }
  };
  window._driverFoodReady = async (orderId)=>{
    try{ const res=await driverFoodReady(orderId); if(res.error) throw res.error; alert('🍱 Makanan siap'); }catch(e){ alert(e.message); }
  };
  window._driverFoodPicked = async (orderId)=>{
    try{ const res=await driverFoodPicked(orderId); if(res.error) throw res.error; alert('🚚 OTW antar ke pembeli'); }catch(e){ alert(e.message); }
  };
  window._driverFoodCompleted = async (orderId)=>{
    try{ const res=await driverFoodCompleted(orderId); if(res.error) throw res.error; alert('✅ Selesai antar makanan'); location.reload(); }catch(e){ alert(e.message); }
  };
  window._driverRejectFood = async (orderId)=>{
    try{
      if(!confirm('Tolak order makanan ini?')) return;
      const res=await driverRejectFoodOrder(orderId); 
      if(res.error) throw res.error;
      alert('❌ Order ditolak.'); location.reload();
    }catch(e){ alert('Gagal tolak: '+e.message); }
  };
}


// STEP2 HOOK: Food new order notif via realtime - tanpa ubah fungsi lama
if(typeof window!=='undefined'){
  setTimeout(()=>{
    try{
      const origLoadFood = window.loadDriverFoodOrders;
      window.loadDriverFoodOrders = async function(profile, silent=false){
        const beforeIds = JSON.parse(localStorage.getItem('_food_ids')||'[]');
        const result = await origLoadFood(profile, silent);
        try{
          const { data } = await supabase.from('food_orders').select('id').in('status',['searching_driver','driver_assigned']).limit(20);
          const ids = (data||[]).map(o=>o.id);
          const newIds = ids.filter(id=> !beforeIds.includes(id));
          if(!silent && newIds.length>0 && beforeIds.length>0){
            notifyFood(`🍔 ${newIds.length} Order Food Baru!`, `${newIds.length} order food masuk - KLIK TERIMA`, '/#/driver');
          }
          localStorage.setItem('_food_ids', JSON.stringify(ids));
        }catch(e){}
        return result;
      };
    }catch(e){}
  }, 1000);
}

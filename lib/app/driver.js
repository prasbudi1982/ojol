// driver.js - STEP 1: OJOL 2 ARAH DRIVER + NOTIFIKASI
import { supabase } from './supabase.js';
import { showLocalNotification, getNotifSettings } from './push.js';

function notifyDriver(title, body, url='/#/driver'){
  try{
    const st = getNotifSettings();
    if(!st.enabled || !st.ojol) return;
    showLocalNotification(title, body, url, 'ojol');
  }catch(e){}
}

export function driverAcceptOrder(orderId, driverProfile){
  notifyDriver('✅ Kamu Terima Order', `Order ${orderId.slice(0,6)} diterima - OTW pickup`, '/#/driver');
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  notifyDriver('🚗 OTW Tujuan', `Order ${orderId.slice(0,6)} OTW ke tujuan`, '/#/driver');
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverCompleteOrder(orderId){
  notifyDriver('✅ Order Selesai', `Order ${orderId.slice(0,6)} selesai diantar`, '/#/driver');
  return supabase.from('orders').update({ status:'completed', completed_at: new Date().toISOString() }).eq('id', orderId).select().single();
}

let driverOrdersChannel = null;
let driverActiveChannel = null;
let driverOrdersInterval = null;
let lastOjolCount = 0;

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
    const map = {}; (data||[]).forEach(u=>{ map[u.id]=u; }); return map;
  }catch(e){ return {}; }
}

export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box=document.getElementById('driverOrders'); if(!box) return;
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(20);
    let rejectedIds=[]; try{ rejectedIds=JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders=(q1.data||[]).filter(o=>{ if(rejectedIds.includes(o.id)) return false; if(o.driver_id && o.driver_id!==driverProfile.id) return false; return true; });

    // === NOTIFIKASI ORDER BARU MASUK (DRIVER) ===
    if(!silent && orders.length>lastOjolCount && lastOjolCount!==0){
      const diff = orders.length - lastOjolCount;
      if(diff>0 && orders[0]){
        const o = orders[0];
        notifyDriver(`📦 ${diff} Order Baru Masuk!`, `${o.pickup_text||''} → ${o.dest_text||''} • Rp ${o.estimated_cost?.toLocaleString('id-ID')}`, '/#/driver');
      }
    }
    lastOjolCount = orders.length;

    if(orders.length===0){ if(!silent) box.innerHTML=`<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">Tidak ada order ojek</div>`; return; }
    const userIds = orders.map(o=> o.user_id || o.customer_id || o.buyer_id || o.passenger_id).filter(Boolean);
    const usersMap = await fetchUsersMap(userIds);
    box.innerHTML=orders.map(o=>{
      const pickup=o.pickup_text||o.pickup||'-'; const dest=o.dest_text||o.destination||'-'; const links=buildMapLinks(o);
      const uid = o.user_id || o.customer_id || o.buyer_id || o.passenger_id;
      const penumpang = usersMap[uid] || {};
      const nama = penumpang.name || o.customer_name || o.passenger_name || 'Penumpang';
      const hp = penumpang.hp || o.customer_hp || '';
      const waLink = buildWaLink(hp, `Halo kak ${nama}, saya driver ${o.vehicle_type||'ojek'}. Order dari ${pickup} ke ${dest}. Saya OTW jemput ya.`);
      return `<div class="card" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--card)">
        <div style="font-size:11px">📍 ${pickup} ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank">🗺️</a>`:''}</div>
        <div style="font-size:11px">🎯 ${dest} ${links.destLink?`<a href="${links.destLink}" target="_blank">🗺️</a>`:''}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">👤 ${nama} ${hp?`• ${hp}`:''} ${waLink?`<a href="${waLink}" target="_blank" style="background:#25D366;color:white;padding:2px 8px;border-radius:99px;font-size:10px;margin-left:6px">WA</a>`:''}</div>
        <div style="margin-top:8px;display:flex;gap:6px">
          ${links.routeLink?`<a href="${links.routeLink}" target="_blank" class="btn secondary" style="font-size:10px">🗺️ Rute</a>`:''}
          <button onclick="window._driverAccept('${o.id}')" class="btn primary" style="font-size:11px">✅ Terima</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){ console.error(e); }
}

export async function loadDriverActiveOrders(driverProfile){
  if(!driverProfile) return;
  const box=document.getElementById('driverActiveOrderCard'); if(!box) return;
  try{
    const { data: ojols } = await supabase.from('orders').select('*').eq('driver_id', driverProfile.id).in('status',['accepted','picked']).order('created_at',{ascending:false}).limit(5);
    const all = ojols||[];
    if(all.length===0){ box.style.display='none'; return; }
    box.style.display='block';
    box.innerHTML=`<h4 style="margin:0 0 8px">🔥 Order Aktif (${all.length})</h4>`+ all.map(o=>{
      return `<div class="card" style="margin:6px 0;padding:10px;border:1px solid var(--primary);border-radius:12px">
        <div style="font-size:11px">🏍️ ${o.status.toUpperCase()} - ${o.pickup_text||''} → ${o.dest_text||''}</div>
        <div style="margin-top:6px;display:flex;gap:6px">
          ${o.status==='accepted'?`<button onclick="window._driverPicked('${o.id}')" class="btn primary" style="font-size:11px">🚗 OTW Tujuan</button>`:''}
          ${o.status==='picked'?`<button onclick="window._driverComplete('${o.id}')" class="btn primary" style="font-size:11px">✅ Selesai</button>`:''}
        </div>
      </div>`;
    }).join('');
  }catch(e){ box.style.display='none'; }
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p></div>`; }
  const isOnline=(p.status||'').toLowerCase()==='online';
  return `<div class="card" style="border:1px solid var(--border);background:var(--card);border-radius:16px"><h3>🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||''} • Status: <b style="color:${isOnline?'var(--primary)':'var(--muted)'}">${p.status}</b></p><div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'primary':'secondary'}" style="padding:10px 16px">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'primary':'secondary'}" style="padding:10px 16px">🔴 Offline</button></div></div>
  <div class="card" id="driverActiveOrderCard" style="display:none"></div>
  <div class="card"><h4>📥 Order Ojek Masuk (Step 1)</h4><div id="driverOrders">Menunggu...</div></div>`;
}

export function initDriverPage(driverProfile){
  if(!driverProfile) return;
  try{
    const st = JSON.parse(localStorage.getItem('notif_settings')||'{}');
    if(st.enabled!==false && Notification.permission==='granted' && !localStorage.getItem('push-enabled')){
      localStorage.setItem('push-enabled','1');
    }
  }catch(e){}
  setTimeout(()=>{ loadDriverOrders(driverProfile, false); loadDriverActiveOrders(driverProfile); },500);
  subscribeDriverOrders(driverProfile);
}

function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; }
  if(driverActiveChannel){ try{ supabase.removeChannel(driverActiveChannel); }catch(e){} driverActiveChannel=null; }

  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'orders' }, ()=>{ loadDriverOrders(driverProfile, true); loadDriverActiveOrders(driverProfile); })
    .subscribe();
  driverActiveChannel = supabase.channel('driver-active-'+driverProfile.id)
    .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:'driver_id=eq.'+driverProfile.id }, payload=>{
      const o=payload.new;
      if(o && o.status==='cancelled'){
        notifyDriver('❌ Order Dibatalkan Penumpang', `${o.pickup_text} → ${o.dest_text} dibatalkan`, '/#/driver');
      }
      loadDriverActiveOrders(driverProfile);
    })
    .subscribe();

  if(driverOrdersInterval) clearInterval(driverOrdersInterval);
  driverOrdersInterval = setInterval(()=>{ loadDriverOrders(driverProfile, true); loadDriverActiveOrders(driverProfile); }, 10000);
}

if(typeof window !== 'undefined'){
  window.loadDriverActiveOrders = loadDriverActiveOrders;
  window.loadDriverOrders = loadDriverOrders;
  window._driverAccept = async (orderId)=>{
    try{
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
      const res = await driverAcceptOrder(orderId, profile);
      if(res.error) throw res.error;
      alert('✅ Order ojek diterima!'); 
      notifyDriver('✅ Order Diterima','Kamu terima order - OTW pickup','/#/driver');
      await loadDriverActiveOrders(profile);
    }catch(e){ alert('Gagal: '+e.message); }
  };
  window._driverPicked = async (orderId)=>{
    try{ const res=await driverPickedOrder(orderId); if(res.error) throw res.error; alert('🚗 OTW tujuan'); }catch(e){ alert(e.message); }
  };
  window._driverComplete = async (orderId)=>{
    try{ const res=await driverCompleteOrder(orderId); if(res.error) throw res.error; alert('✅ Selesai'); location.reload(); }catch(e){ alert(e.message); }
  };
}

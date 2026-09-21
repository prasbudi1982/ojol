// tracking.js - MODUL TRACKING LENGKAP - Passenger & Driver real-time
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

let orderChannel = null;
let driverLocationChannel = null;
let trackingInterval = null;
let currentOrderId = null;

// ===== START TRACKING - dipanggil setelah createOrder =====
export function startTracking(orderId){
  if(!orderId) return;
  localStorage.setItem('active_order_id', orderId);
  currentOrderId = orderId;
  console.log('Tracking started', orderId);
  loadActiveTracking();
}

// ===== LOAD ACTIVE TRACKING - dipanggil di #/passenger =====
export async function loadActiveTracking(){
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  if(!orderId){
    hideTrackingUI();
    return null;
  }
  currentOrderId = orderId;
  try{
    // Ambil order terbaru
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(error || !order){
      console.log('Order tidak ditemukan, clear tracking');
      clearActiveTracking();
      hideTrackingUI();
      return null;
    }
    // Jika sudah selesai / cancelled, hentikan
    if(['completed','cancelled','rejected'].includes(order.status)){
      clearActiveTracking();
      hideTrackingUI();
      return null;
    }

    // Tampilkan UI tracking
    showTrackingUI(order);
    
    // Subscribe perubahan order (status, driver_id)
    subscribeOrderUpdates(orderId);
    
    // Jika sudah ada driver, subscribe lokasi driver
    if(order.driver_id){
      const driver = await fetchDriverProfile(order.driver_id);
      renderActiveOrder(order, driver);
      subscribeDriverLocation(order.driver_id);
      startDistanceUpdater(order);
    } else {
      renderActiveOrder(order, null);
    }
    
    return order;
  }catch(e){
    console.error('loadActiveTracking error', e);
    return null;
  }
}

// ===== FETCH DRIVER PROFILE =====
async function fetchDriverProfile(driverId){
  if(!driverId) return null;
  try{
    const { data } = await supabase.from('users').select('id,name,hp,nopol,jenis_kendaraan,tipe_motor').eq('id', driverId).single();
    return data;
  }catch(e){ return null; }
}

// ===== SHOW / HIDE UI =====
function showTrackingUI(order){
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  const searchInfo = document.getElementById('searchInfo');
  if(card) card.style.display = 'block';
  if(list) list.style.display = 'none';
  if(searchInfo) searchInfo.textContent = `📍 Tracking order ${order.status} • ${ACTIVE_KECAMATAN_NAME||'Suruh'}`;
}

function hideTrackingUI(){
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  if(card) card.style.display = 'none';
  if(list) list.style.display = 'block';
}

// ===== RENDER DETAIL ORDER AKTIF =====
function renderActiveOrder(order, driver){
  const card = document.getElementById('activeOrderCard');
  if(!card) return;

  const statusMap = {
    searching: '🔍 Mencari driver terdekat...',
    pending: '⏳ Menunggu konfirmasi driver',
    accepted: '✅ Driver OTW ke pickup',
    picked: '🚗 Penumpang diantar',
    completed: '✅ Selesai',
    cancelled: '❌ Dibatalkan'
  };

  const statusText = statusMap[order.status] || order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';

  card.innerHTML = `
    <div style="border:2px solid #16a34a;border-radius:16px;padding:14px;background:#f0fdf4">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b>${vehicleIcon} ${order.vehicle_type?.toUpperCase()||'MOTOR'} • ${order.trip_type==='roundtrip'?'PP':'Sekali Jalan'}</b>
        <span style="background:#16a34a;color:white;padding:4px 8px;border-radius:12px;font-size:11px">${statusText}</span>
      </div>
      <div style="font-size:13px;line-height:1.5">
        <div>📍 <b>Pickup:</b> ${order.pickup_text||''}</div>
        <div>🎯 <b>Tujuan:</b> ${order.dest_text||''}</div>
        <div>📏 ${order.distance_km?.toFixed(2)||'-'} km • 💰 Rp ${order.estimated_cost?.toLocaleString('id-ID')||'-'}</div>
        <div id="trackingDistance" style="margin-top:6px;font-weight:bold;color:#16a34a">Menghitung jarak driver...</div>
        <div id="trackingETA" style="font-size:11px;color:#555"></div>
      </div>
      ${driver ? `
      <div style="margin-top:10px;border-top:1px dashed #ccc;padding-top:8px;display:flex;gap:10px;align-items:center;justify-content:space-between">
        <div>
          <div><b>👤 ${driver.name}</b> • ${driver.jenis_kendaraan||''}</div>
          <div style="font-size:11px">${driver.nopol||''} • ${driver.tipe_motor||''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${driver.hp ? `<a class="btn secondary" href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(driver.name)}%20saya%20penumpang%20order%20${order.id}" target="_blank">💬 WA</a>` : ''}
          <button data-report-user="${driver.id}" data-report-name="${driver.name}" data-report-role="driver" data-report-order="${order.id}" class="btn secondary" style="background:#fef2f2;border-color:#fecaca;font-size:11px">🚩 Laporkan</button>
        </div>
      </div>` : `<div style="margin-top:8px;font-size:12px;color:#666">Menunggu driver menerima order...</div>`}
      <div style="margin-top:12px;display:flex;gap:8px">
        <button id="btnCancelTracking" class="btn secondary" style="flex:1">❌ Batalkan</button>
        <button id="btnCompleteOrder" class="btn primary" style="flex:1;background:#16a34a">✅ Selesai</button>
      </div>
      <div id="trackingMap" style="height:200px;margin-top:10px;border-radius:12px;background:#e5e7eb;display:none"></div>
    </div>
  `;
}

// ===== SUBSCRIBE ORDER UPDATE (status berubah) =====
function subscribeOrderUpdates(orderId){
  if(orderChannel) { supabase.removeChannel(orderChannel); orderChannel=null; }
  orderChannel = supabase.channel('order-tracking-'+orderId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, async payload=>{
      const newOrder = payload.new;
      console.log('Order update', newOrder);
      if(['completed','cancelled','rejected'].includes(newOrder.status)){
        alert(`Order ${newOrder.status}: ${newOrder.status==='completed'?'Terima kasih!':'Dibatalkan'}`);
        clearActiveTracking();
        hideTrackingUI();
        location.hash = '#/';
        return;
      }
      // Jika baru dapat driver
      if(newOrder.driver_id){
        const driver = await fetchDriverProfile(newOrder.driver_id);
        renderActiveOrder(newOrder, driver);
        subscribeDriverLocation(newOrder.driver_id);
        startDistanceUpdater(newOrder);
      } else {
        renderActiveOrder(newOrder, null);
      }
    })
    .subscribe();
}

// ===== SUBSCRIBE LOKASI DRIVER REALTIME =====
function subscribeDriverLocation(driverId){
  if(driverLocationChannel) { supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  driverLocationChannel = supabase.channel('driver-loc-'+driverId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, payload=>{
      const loc = payload.new;
      if(loc){
        updateDriverDistance(loc);
      }
    })
    .subscribe();
}

// ===== UPDATE JARAK DRIVER KE PICKUP =====
let lastDriverLoc = null;
function updateDriverDistance(driverLoc){
  lastDriverLoc = driverLoc;
  const pickupLat = parseFloat(document.getElementById('pickup')?.dataset.lat || localStorage.getItem('pickup_lat'));
  const pickupLng = parseFloat(document.getElementById('pickup')?.dataset.lng || localStorage.getItem('pickup_lng'));
  // Coba parse lokasi driver dari geo string atau lat/lng
  let dLat, dLng;
  if(driverLoc.lat && driverLoc.lng){ dLat=driverLoc.lat; dLng=driverLoc.lng; }
  else if(driverLoc.lokasi){
    // Format SRID=4326;POINT(lng lat)
    const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); }
  }
  if(!dLat || !pickupLat) return;
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  const el = document.getElementById('trackingDistance');
  const etaEl = document.getElementById('trackingETA');
  if(el){
    el.textContent = `📍 Driver ${dist.toFixed(2)} km dari pickup`;
    if(etaEl){
      const speed = driverLoc.speed_kmh || 30; // asumsi 30 km/h kalau tidak ada
      const etaMin = (dist / (speed||30)) * 60;
      etaEl.textContent = `⏱️ Estimasi ${etaMin.toFixed(0)} menit • Kecepatan ${speed.toFixed(0)} km/h`;
    }
  }
}

function startDistanceUpdater(order){
  if(trackingInterval) clearInterval(trackingInterval);
  // Simpan pickup untuk perhitungan
  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);
  
  trackingInterval = setInterval(async ()=>{
    if(!order.driver_id) return;
    // Fetch lokasi terbaru driver setiap 5 detik sebagai backup jika realtime lambat
    try{
      const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single();
      if(data) updateDriverDistance(data);
    }catch(e){}
  }, 5000);
}

// ===== CLEAR TRACKING =====
export function clearActiveTracking(){
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  console.log('Clear tracking', orderId);
  localStorage.removeItem('active_order_id');
  localStorage.removeItem('pickup_lat');
  localStorage.removeItem('pickup_lng');
  currentOrderId = null;
  
  if(orderChannel){ supabase.removeChannel(orderChannel); orderChannel=null; }
  if(driverLocationChannel){ supabase.removeChannel(driverLocationChannel); driverLocationChannel=null; }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  lastDriverLoc = null;
  
  hideTrackingUI();
}

// ===== UNTUK DRIVER: UPDATE STATUS ORDER =====
export async function driverAcceptOrder(orderId, driverProfile){
  try{
    let res = await supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
    if(res.error && res.error.message.includes('updated_at')){
      res = await supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id }).eq('id', orderId).select().single();
    }
    if(res.error) throw res.error;
    return res.data;
  }catch(e){ alert('Gagal terima order: '+e.message); return null; }
}

export async function driverPickedOrder(orderId){
  try{
    let res = await supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
    if(res.error && res.error.message.includes('updated_at')){ res = await supabase.from('orders').update({ status:'picked' }).eq('id', orderId).select().single(); }
    return res.data;
  }catch(e){ return null; }
}

let driverOrdersChannel = null;
let driverOrdersInterval = null;

export async function loadDriverOrders(driverProfile){
  if(!driverProfile || driverProfile.role !== 'driver') return;
  const box = document.getElementById('driverOrders');
  const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  
  if(infoEl) infoEl.textContent = '⏳ Mencari...';
  box.innerHTML = `<div style="padding:12px;text-align:center"><div>⏳ Memuat order...</div><div style="font-size:10px;margin-top:4px;color:#666">Driver: ${driverProfile.id.slice(0,6)} • ${driverProfile.jenis_kendaraan||'motor'} • ${driverProfile.status}</div></div>`;
  
  try{
    let orders = [];
    let lastError = null;
    
    // QUERY 1: Paling simpel - tanpa OR, tanpa join - hanya status searching
    const q1 = await supabase
      .from('orders')
      .select('*')
      .in('status', ['searching','pending','new','open','created','waiting'])
      .order('created_at', {ascending: false})
      .limit(30);
    
    if(q1.error){
      lastError = q1.error;
      box.innerHTML = `<div style="padding:10px;background:#fee2e2;border-radius:8px;font-size:12px">
        <b>❌ Query 1 Error (HP):</b><br/>
        ${q1.error.message}<br/><br/>
        <b>Ini masalah RLS!</b> Jalankan SQL di bawah di Supabase:<br/>
        <div style="background:#111;color:#0f0;font-size:9px;padding:6px;margin-top:6px;white-space:pre-wrap">alter table orders enable row level security;
drop policy if exists "open" on orders;
create policy "open" on orders for all using (true) with check (true);</div>
        <button id="btnRefreshDriverOrders" class="btn primary" style="margin-top:8px;width:100%">🔄 Coba Lagi</button>
        <button id="btnDebugOrders" class="btn secondary" style="margin-top:6px;width:100%">🔍 Debug Detail</button>
      </div>`;
      if(infoEl) infoEl.textContent = 'Error: '+q1.error.message.slice(0,30);
      return;
    }
    
    // Filter di HP (client side) - tidak pakai .or() yang sering diblokir RLS
    const allOrders = q1.data || [];
    // Filter: driver_id null (broadcast) ATAU driver_id = saya
    orders = allOrders.filter(o => !o.driver_id || o.driver_id === driverProfile.id);
    
    // Kalau driver pilih kendaraan, utamakan kendaraan sama tapi tetap tampilkan semua
    const myVeh = driverProfile.jenis_kendaraan || 'motor';
    
    if(orders.length === 0){
      // Cek apakah ada order tapi beda status? Tampilkan info debug untuk HP
      const totalInDb = allOrders.length;
      box.innerHTML = `<div style="padding:12px;text-align:center;color:#666">
        <div style="font-size:28px">📭</div>
        <div style="margin-top:8px;font-size:13px"><b>Menunggu order...</b></div>
        <div style="font-size:11px;margin-top:8px;line-height:1.4;background:#f1f5f9;padding:8px;border-radius:8px;text-align:left">
          🔍 <b>Debug HP (tanpa console):</b><br/>
          • Total order searching di DB: ${totalInDb}<br/>
          • Filter saya (${myVeh}): ${orders.length}<br/>
          • Status driver: ${driverProfile.status}<br/>
          • ID: ${driverProfile.id.slice(0,8)}<br/>
          • Kendaraan: ${myVeh}<br/><br/>
          ${totalInDb>0 ? 'Ada '+totalInDb+' order tapi driver_id bukan null/saya.<br/>Cek di Supabase apakah driver_id terisi penumpang? Harus null untuk broadcast.' : 'Tidak ada order searching/pending di DB.<br/>Buat order baru dari akun penumpang.'}
        </div>
        <button id="btnRefreshDriverOrders" class="btn primary" style="margin-top:12px;width:100%">🔄 Refresh</button>
        <button id="btnDebugOrders" class="btn secondary" style="margin-top:6px;width:100%;font-size:11px">🔍 Lihat Semua Order (JSON)</button>
      </div>`;
      if(infoEl) infoEl.textContent = `0 order • DB ada ${totalInDb}`;
      return;
    }
    
    if(infoEl) infoEl.textContent = `${orders.length} order • ${myVeh}`;
    
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id === driverProfile.id;
      const isBroadcast = !o.driver_id;
      const vehMatch = (o.vehicle_type||'motor') === myVeh;
      const pickup = o.pickup_text || o.pickup || o.destination || '-';
      const dest = o.dest_text || o.destination || o.dest || '-';
      const cost = o.estimated_cost || o.cost || 0;
      const dist = o.distance_km || o.distance || 0;
      
      return `<div class="card" style="margin:8px 0;padding:10px;border:${isForMe?'2px solid #16a34a':'1px solid #334155'};background:${isForMe?'#f0fdf4': vehMatch ? '#fff' : '#fefce8'};">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b>${(o.vehicle_type||'motor')==='mobil'?'🚗':'🏍️'} ${o.vehicle_type||'motor'} • ${o.trip_type==='roundtrip'?'PP':'Sekali'}</b>
          <span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${isForMe?'#16a34a': isBroadcast ? '#f59e0b' : '#64748b'};color:white">${isForMe?'UNTUK SAYA': isBroadcast ? 'BARU' : o.status}</span>
        </div>
        <div style="font-size:12px;margin-top:8px;line-height:1.5">
          <div>📍 <b>${pickup}</b></div>
          <div>🎯 <b>${dest}</b></div>
          <div>📏 ${typeof dist === 'number' ? dist.toFixed(2) : dist} km • 💰 <b>Rp ${cost.toLocaleString('id-ID')}</b></div>
          <div style="font-size:10px;color:#666;margin-top:4px">🕐 ${new Date(o.created_at).toLocaleString('id-ID')} • ${!vehMatch && isBroadcast ? '⚠️ Beda kendaraan' : '✅ Cocok'}</div>
        </div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button data-driver-accept="${o.id}" class="btn primary" style="flex:1;background:#16a34a;padding:10px;font-size:13px;font-weight:bold">✅ TERIMA</button>
          <button data-driver-reject="${o.id}" class="btn secondary" style="padding:10px;font-size:11px">❌</button>
        </div>
      </div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button id="btnRefreshDriverOrders" class="btn secondary" style="font-size:11px;width:100%">🔄 Refresh (${orders.length})</button></div>`;
    
  }catch(e){
    const box2 = document.getElementById('driverOrders');
    if(box2) box2.innerHTML = `<div style="padding:10px;background:#fee2e2;border-radius:8px;font-size:12px">
      <b>❌ Error HP:</b> ${e.message}<br/>
      <div style="font-size:10px;margin-top:6px">Driver: ${driverProfile.id.slice(0,8)} • ${driverProfile.jenis_kendaraan}</div>
      <button id="btnRefreshDriverOrders" class="btn primary" style="margin-top:10px;width:100%">🔄 Coba Lagi</button>
      <button id="btnDebugOrders" class="btn secondary" style="margin-top:6px;width:100%">🔍 Debug</button>
    </div>`;
    if(infoEl) infoEl.textContent = 'Error';
  }
}


function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload=>{
      const o = payload.new;
      const isForMe = o.driver_id === driverProfile.id;
      const isBroadcast = !o.driver_id;
      const myVeh = driverProfile.jenis_kendaraan||'motor';
      if(isForMe || (isBroadcast && (o.vehicle_type||'motor') === myVeh)){
        console.log('New order for driver', o);
        loadDriverOrders(driverProfile);
        try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload=>{
      loadDriverOrders(driverProfile);
    })
    .subscribe();
  
  // Refresh tiap 10 detik sebagai backup realtime
  driverOrdersInterval = setInterval(()=> loadDriverOrders(driverProfile), 10000);
}

export function clearDriverOrdersSubscription(){
  if(driverOrdersChannel){ supabase.removeChannel(driverOrdersChannel); driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
}

// ===== VIEW DRIVER - di dalam modul tracking (penting) - driver location & order masuk =====
export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️';
  const isOnline = (p.status === 'online');
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon} ${p.jenis_kendaraan||'motor'}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • ${vehIcon} ${p.jenis_kendaraan||''} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Jenis Kendaraan, Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div><div class="card"><h4 style="margin:0 0 8px">📥 Order Masuk <span style="font-size:10px;color:#666" id="driverOrdersInfo"></span></h4><div id="driverOrders" class="muted" style="font-size:12px">Menunggu order...</div></div><div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

// Init driver orders when page loaded
export function initDriverPage(driverProfile){
  if(!driverProfile) return;
  setTimeout(()=> loadDriverOrders(driverProfile), 500);
  subscribeDriverOrders(driverProfile);
}


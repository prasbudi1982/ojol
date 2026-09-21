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
        <div style="display:flex;gap:6px">
          ${driver.hp ? `<a class="btn secondary" href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(driver.name)}%20saya%20penumpang%20order%20${order.id}" target="_blank">💬 WA</a>` : ''}
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
    const { data, error } = await supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
    if(error) throw error;
    return data;
  }catch(e){ alert('Gagal terima order: '+e.message); return null; }
}

export async function driverPickedOrder(orderId){
  try{
    const { data } = await supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
    return data;
  }catch(e){ return null; }
}

// ===== VIEW DRIVER - di dalam modul tracking (penting) - driver location & order masuk =====
export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️';
  const isOnline = (p.status === 'online');
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon} ${p.jenis_kendaraan||'motor'}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • ${vehIcon} ${p.jenis_kendaraan||''} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Jenis Kendaraan, Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div><div class="card"><h4 style="margin:0 0 8px">📥 Order Masuk</h4><div id="driverOrders" class="muted" style="font-size:12px">Menunggu order...</div></div>`;
}

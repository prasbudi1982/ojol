// tracking.js - MODUL TRACKING LENGKAP - Passenger & Driver real-time
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return {
      primary: s.primaryColor || '#16a34a',
      secondary: s.secondaryColor || '#f59e0b',
      appName: s.appName || 'Ojol Suruh'
    };
  }catch(e){ return { primary: '#16a34a', secondary: '#f59e0b', appName: 'Ojol Suruh' }; }
}



// ===== TRACKING LOCK MODAL - kunci halaman order saat ada order aktif =====
export function showTrackingLockModal(order){
  let modal = document.getElementById('trackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'trackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const statusText = order.status==='accepted' ? 'Driver OTW' : order.status==='picked' ? 'Diantar' : 'Mencari driver';
  div.innerHTML = `
    <div style="background:white;border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🔒</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Order Aktif Berjalan</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:12px;color:#0f172a">
          <div>📍 ${order.pickup_text||order.pickup||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||order.destination||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:#64748b">ID ${order.id.slice(0,6).toUpperCase()}</span></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Driver</button>
          <button id="btnCancelFromLock" style="background:white;border:1px solid #e2e8f0;color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Order</button>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:10px;color:#94a3b8">Order harus selesai sebelum pesan baru</div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('btnGotoTracking')?.addEventListener('click', ()=>{
    const card = document.getElementById('activeOrderCard');
    if(card){ card.scrollIntoView({behavior:'smooth'}); }
    div.remove();
  });
  document.getElementById('btnCancelFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan order aktif?')) return;
    try{
      const { supabase } = await import('./supabase.js');
      await supabase.from('orders').update({status:'cancelled'}).eq('id', order.id);
    }catch(e){}
    clearActiveTracking();
    hideTrackingUI();
    div.remove();
  });
}

export function hideTrackingLockModal(){
  const m = document.getElementById('trackingLockModal');
  if(m) m.remove();
}

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

// ===== LOAD ACTIVE TRACKING - dipanggil di #/passenger - HP VERSION =====
export async function loadActiveTracking(){
  const orderId = localStorage.getItem('active_order_id') || currentOrderId;
  const card = document.getElementById('activeOrderCard');
  const info = document.getElementById('searchInfo');
  
  if(!orderId){
    if(info) info.textContent = 'Tidak ada order aktif - buat order dulu';
    hideTrackingUI();
    return null;
  }
  currentOrderId = orderId;
  try{
    // Tampilkan modal loading dulu - modal mengunci
    ensureTrackingDetailModal();
    const modalContent = document.getElementById('trackingDetailContent');
    if(modalContent){
      const m = document.getElementById('trackingDetailModal');
      if(m) m.style.display='flex';
      modalContent.innerHTML = `<div style="background:white;border-radius:16px;padding:20px;text-align:center"><div style="font-size:24px">⏳</div><div style="margin-top:8px;font-weight:700">Memuat tracking...</div><div style="font-size:10px;margin-top:4px;color:#64748b">Order ID: ${orderId.slice(0,8).toUpperCase()}</div></div>`;
    }
    if(card){
      card.style.display = 'none';
    }
    if(info) info.textContent = '⏳ Memuat order '+orderId.slice(0,6)+'...';
    
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(error || !order){
      if(card) card.innerHTML = `<div style="padding:12px;background:#fee2e2;border-radius:8px;font-size:12px">❌ Order tidak ditemukan<br/>ID: ${orderId.slice(0,8)}<br/>Error: ${error?.message||'null'}<br/><button id="btnCancelTracking" class="btn secondary" style="margin-top:8px">Clear</button></div>`;
      if(info) info.textContent = 'Order tidak ditemukan: '+ (error?.message||'');
      return null;
    }
    if(['completed','cancelled','rejected'].includes(order.status)){
      clearActiveTracking();
      hideTrackingUI();
      if(info) info.textContent = 'Order '+order.status+' - selesai';
      return null;
    }

    showTrackingUI(order);
    subscribeOrderUpdates(orderId);
    
    if(order.driver_id){
      if(info) info.textContent = `✅ Driver ditemukan: ${order.driver_id.slice(0,6)} • ${order.status}`;
      const driver = await fetchDriverProfile(order.driver_id);
      renderActiveOrder(order, driver);
      subscribeDriverLocation(order.driver_id);
      startDistanceUpdater(order);
    } else {
      if(info) info.textContent = `🔍 ${order.status} - menunggu driver...`;
      renderActiveOrder(order, null);
    }
    
    return order;
  }catch(e){
    if(card) card.innerHTML = `<div style="padding:10px;background:#fee2e2;border-radius:8px;font-size:12px">❌ Error tracking HP: ${e.message}<br/>OrderID: ${orderId.slice(0,8)}<br/><button id="btnCancelTracking" class="btn secondary" style="margin-top:8px">Clear</button> <button id="btnRefreshTracking" class="btn secondary">Refresh</button></div>`;
    if(info) info.textContent = 'Error tracking: '+e.message;
    return null;
  }
}

// ===== FETCH DRIVER PROFILE - HP ROBUST =====
async function fetchDriverProfile(driverId){
  if(!driverId) return null;
  try{
    const { data, error } = await supabase.from('users').select('id,name,hp,nopol,jenis_kendaraan,tipe_motor,status').eq('id', driverId).single();
    if(error){
      // Coba tanpa filter status
      const { data: data2 } = await supabase.from('users').select('id,name,hp,nopol,jenis_kendaraan,tipe_motor').eq('id', driverId).maybeSingle();
      if(data2) return data2;
      // Fallback minimal
      return { id: driverId, name: 'Driver '+driverId.slice(0,4), hp: null, nopol: '-', jenis_kendaraan: 'motor' };
    }
    return data;
  }catch(e){ 
    return { id: driverId, name: 'Driver '+driverId.slice(0,4), hp: null, nopol: '-', jenis_kendaraan: 'motor' };
  }
}

// ===== TRACKING DETAIL MODAL - modal mengunci halaman order =====
function ensureTrackingDetailModal(){
  let modal = document.getElementById('trackingDetailModal');
  if(modal) return modal;
  const div = document.createElement('div');
  div.id = 'trackingDetailModal';
  // Full screen modal terkunci - tidak bisa scroll background
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9997;overflow-y:auto;padding:16px;align-items:flex-start;justify-content:center';
  div.innerHTML = `
    <div style="width:100%;max-width:440px;margin:0 auto;padding-top:8px;padding-bottom:20px">
      <div id="trackingDetailContent"></div>
      <div style="text-align:center;margin-top:12px;font-size:10px;color:#94a3b8">🔒 Halaman order terkunci sampai order selesai</div>
    </div>
  `;
  document.body.appendChild(div);
  return div;
}

function showTrackingUI(order){
  const modal = ensureTrackingDetailModal();
  const content = document.getElementById('trackingDetailContent');
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  const searchInfo = document.getElementById('searchInfo');
  // Sembunyikan card lama (yang auto fokus di atas) - sekarang pakai modal
  if(card) card.style.display = 'none';
  if(list) list.style.display = 'none';
  if(searchInfo) searchInfo.textContent = `📍 Tracking order ${order.status} • ${ACTIVE_KECAMATAN_NAME||'Suruh'}`;
  // Tampilkan modal detail tracking mengunci
  if(modal){
    modal.style.display = 'flex';
    if(content && !content.innerHTML){
      content.innerHTML = `<div style="padding:24px;text-align:center;color:white"><div style="font-size:28px">⏳</div><div style="margin-top:8px">Memuat detail tracking...</div></div>`;
    }
  }
  // Kunci body scroll
  document.body.style.overflow = 'hidden';
  // Kunci form order
  const formCard = document.getElementById('orderFormCard');
  const pickup = document.getElementById('pickup');
  const dest = document.getElementById('dest');
  const btnOrder = document.getElementById('btnOrder');
  if(pickup) pickup.disabled = true;
  if(dest) dest.disabled = true;
  if(btnOrder) { btnOrder.disabled = true; btnOrder.style.opacity='0.5'; btnOrder.textContent='🔒 Order aktif berjalan'; }
  if(formCard){
    formCard.style.opacity='0.4';
    formCard.style.pointerEvents='none';
  }
  const banner = document.getElementById('activeOrderLockBanner');
  if(banner) banner.style.display='none';
}

function hideTrackingUI(){
  const modal = document.getElementById('trackingDetailModal');
  const content = document.getElementById('trackingDetailContent');
  const card = document.getElementById('activeOrderCard');
  const list = document.getElementById('driverList');
  if(modal) modal.style.display = 'none';
  if(content) content.innerHTML = '';
  if(card) card.style.display = 'none';
  if(list) list.style.display = 'block';
  hideTrackingLockModal();
  document.body.style.overflow = '';
  const pickup = document.getElementById('pickup');
  const dest = document.getElementById('dest');
  const btnOrder = document.getElementById('btnOrder');
  const formCard = document.getElementById('orderFormCard');
  const banner = document.getElementById('activeOrderLockBanner');
  if(pickup) pickup.disabled = false;
  if(dest) dest.disabled = false;
  if(btnOrder) { btnOrder.disabled = false; btnOrder.style.opacity='1'; btnOrder.textContent='🚀 Order Sekarang'; }
  if(formCard){ formCard.style.opacity='1'; formCard.style.pointerEvents='auto'; }
  if(banner) banner.style.display='none';
}

// ===== RENDER DETAIL ORDER AKTIF - MODAL VERSION =====
function renderActiveOrder(order, driver){
  ensureTrackingDetailModal();
  let card = document.getElementById('trackingDetailContent');
  if(!card) card = document.getElementById('activeOrderCard');
  if(!card) return;

  const statusMap = {
    searching: '🔍 Mencari driver terdekat...',
    pending: '⏳ Menunggu konfirmasi driver',
    accepted: '✅ Driver OTW ke pickup',
    picked: '🚗 Penumpang diantar',
    completed: '✅ Selesai',
    cancelled: '❌ Dibatalkan'
  };
  const statusSteps = {
    searching: 1,
    pending: 2,
    accepted: 3,
    picked: 4,
    completed: 5
  };
  const step = statusSteps[order.status] || 1;

  const statusText = statusMap[order.status] || order.status;
  const vehicleIcon = (order.vehicle_type||'motor')==='mobil'?'🚗':'🏍️';

  // Simpan pickup ke localStorage untuk hitung jarak
  if(order.pickup_lat) localStorage.setItem('pickup_lat', order.pickup_lat);
  if(order.pickup_lng) localStorage.setItem('pickup_lng', order.pickup_lng);
  if(order.dest_lat) localStorage.setItem('dest_lat', order.dest_lat);
  if(order.dest_lng) localStorage.setItem('dest_lng', order.dest_lng);
  if(order.pickup_text) localStorage.setItem('pickup_text', order.pickup_text);
  if(order.dest_text) localStorage.setItem('dest_text', order.dest_text);

  card.innerHTML = `
    <div style="border:2px solid #16a34a;border-radius:18px;padding:0;overflow:hidden;background:#ffffff;box-shadow:0 6px 20px rgba(0,0,0,0.15);color:#0f172a">
      <!-- Header pakai setting aplikasi -->
      <div style="background:${getAppTheme().primary};color:white;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${vehicleIcon}</span>
          <div>
            <div style="font-size:13px;font-weight:800;letter-spacing:0.3px">${order.vehicle_type?.toUpperCase()||'MOTOR'} • ${order.trip_type==='roundtrip'?'PP':'Sekali'}</div>
            <div style="font-size:10px;color:#94a3b8">ID ${order.id.slice(0,6).toUpperCase()} • ${new Date(order.created_at).toLocaleTimeString('id-ID')}</div>
          </div>
        </div>
        <span style="background:${order.status==='accepted'?'#16a34a': order.status==='picked'?'#2563eb' : '#f59e0b'};color:white;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:800">${statusText}</span>
      </div>
      
      <!-- Progress timeline -->
      <div style="padding:10px 14px 0;display:flex;gap:6px;align-items:center">
        <div style="flex:1;height:8px;border-radius:4px;background:${step>=1?getAppTheme().primary:'#e2e8f0'}"></div>
        <div style="flex:1;height:8px;border-radius:4px;background:${step>=2?getAppTheme().primary:'#e2e8f0'}"></div>
        <div style="flex:1;height:8px;border-radius:4px;background:${step>=3?getAppTheme().primary:'#e2e8f0'}"></div>
        <div style="flex:1;height:8px;border-radius:4px;background:${step>=4?getAppTheme().primary:'#e2e8f0'}"></div>
        <div style="flex:1;height:8px;border-radius:4px;background:${step>=5?getAppTheme().primary:'#e2e8f0'}"></div>
      </div>
      <div style="padding:0 14px 8px;display:flex;justify-content:space-between;font-size:9px;color:#64748b;font-weight:600">
        <span>Cari</span><span>Konfirm</span><span>OTW</span><span>Diantar</span><span>Selesai</span>
      </div>

      <!-- Alamat - background putih, text hitam pekat -->
      <div style="margin:0 12px;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:12px">
        <div style="font-size:13px;line-height:1.5;color:#0f172a">
          <div style="display:flex;gap:8px"><span>📍</span><div><b style="color:#0f172a">Pickup:</b> <span style="color:#1e293b">${order.pickup_text||order.pickup||'-'}</span></div></div>
          <div style="display:flex;gap:8px;margin-top:6px"><span>🎯</span><div><b style="color:#0f172a">Tujuan:</b> <span style="color:#1e293b">${order.dest_text||order.destination||'-'}</span></div></div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:#334155;font-weight:600">📏 ${order.distance_km?.toFixed? order.distance_km.toFixed(2) : order.distance_km||'-'} km</span>
          <span style="font-size:14px;font-weight:800;color:#0f172a;background:#fef3c7;padding:4px 10px;border-radius:8px">💰 Rp ${order.estimated_cost?.toLocaleString('id-ID')||'-'}</span>
        </div>
      </div>

      ${driver ? `
      <div style="margin:12px;background:#ffffff;border:2px solid #16a34a;border-radius:14px;padding:12px">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="width:56px;height:56px;background:#16a34a;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:800;flex-shrink:0;box-shadow:0 2px 8px rgba(22,163,74,0.3)">${driver.name?.charAt(0)||'D'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:15px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">👤 ${driver.name} ${driver.jenis_kendaraan==='mobil'?'🚗':'🏍️'}</div>
            <div style="font-size:12px;color:#334155;font-weight:600;margin-top:2px">${driver.nopol||''} • ${driver.tipe_motor||''}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.3px">${driver.jenis_kendaraan||'motor'} • ${driver.status||'online'}</div>
          </div>
        </div>
        
        <!-- Live tracking box - kontras tinggi -->
        <div style="margin-top:12px;background:#0f172a;color:white;border-radius:10px;padding:10px">
          <div id="trackingDistance" style="font-weight:800;color:#4ade80;font-size:14px">📍 Menghitung jarak driver...</div>
          <div id="trackingETA" style="font-size:11px;color:#cbd5e1;margin-top:4px">⏱️ Menunggu lokasi driver...</div>
        </div>

        <div style="margin-top:12px;display:flex;gap:8px">
          ${driver.hp ? `<a href="https://wa.me/${driver.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(driver.name)}%20saya%20penumpang%20order%20${order.id}%20-%20Pickup:%20${encodeURIComponent(order.pickup_text||'')}" target="_blank" style="flex:1;background:#25D366;color:white;padding:12px;text-align:center;border-radius:10px;text-decoration:none;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;gap:6px">💬 WA Driver</a>` : ''}
          <button data-report-user="${driver.id}" data-report-name="${driver.name}" data-report-role="driver" data-report-order="${order.id}" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;font-size:16px">🚩</button>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <a id="btnOpenDriverMap" href="#" style="flex:1;background:#0f172a;color:white;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px;font-weight:700">🗺️ Lihat di Maps</a>
          <button id="btnRefreshTracking" style="flex:1;background:#f1f5f9;border:1px solid #cbd5e1;color:#0f172a;padding:10px;border-radius:10px;font-size:12px;font-weight:700">🔄 Refresh</button>
        </div>
      </div>
      ` : `<div style="margin:12px;background:#fffbeb;border:2px dashed #f59e0b;padding:16px;border-radius:12px;text-align:center">
        <div style="font-size:28px">⏳</div>
        <div style="font-size:13px;color:#78350f;font-weight:700;margin-top:6px">Menunggu driver menerima order...</div>
        <div style="font-size:11px;color:#92400e;margin-top:4px">Order kamu sudah terkirim ke driver terdekat di ${ACTIVE_KECAMATAN_NAME||'Suruh'}</div>
        <div style="margin-top:8px;font-size:10px;color:#a16207;background:white;padding:4px 8px;border-radius:6px;display:inline-block">ID ${order.id.slice(0,8).toUpperCase()} • ${new Date(order.created_at).toLocaleTimeString('id-ID')}</div>
      </div>`}
      
      <div style="padding:12px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;gap:8px;margin-top:4px">
        <button id="btnCancelTracking" style="flex:1;background:white;border:1px solid #e2e8f0;color:#ef4444;padding:12px;border-radius:10px;font-size:13px;font-weight:700">❌ Batalkan</button>
        <button id="btnCompleteOrder" style="flex:1;background:#16a34a;color:white;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:800">✅ Selesai</button>
      </div>
    </div>
  `;
  
  // Setup maps button
  setTimeout(()=>{
    const mapBtn = document.getElementById('btnOpenDriverMap');
    if(mapBtn){
      mapBtn.onclick = (e)=>{
        e.preventDefault();
        // Buka Google Maps dengan rute driver ke pickup kalau ada lokasi driver
        if(lastDriverLoc){
          let dLat, dLng;
          if(lastDriverLoc.lat && lastDriverLoc.lng){ dLat=lastDriverLoc.lat; dLng=lastDriverLoc.lng; }
          else if(lastDriverLoc.lokasi){
            const m = lastDriverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
            if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); }
          }
          if(dLat && order.pickup_lat){
            window.open(`https://www.google.com/maps/dir/${dLat},${dLng}/${order.pickup_lat},${order.pickup_lng}`, '_blank');
          } else if(order.pickup_lat){
            window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank');
          }
        } else if(order.pickup_lat){
          window.open(`https://www.google.com/maps?q=${order.pickup_lat},${order.pickup_lng}`, '_blank');
        }
      };
    }
    const refreshBtn = document.getElementById('btnRefreshTracking');
    if(refreshBtn){
      refreshBtn.onclick = ()=>{
        loadActiveTracking();
        if(order.driver_id){
          supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single().then(r=>{
            if(r.data) updateDriverDistance(r.data);
          });
        }
      };
    }
  }, 100);
}


// ===== SUBSCRIBE ORDER UPDATE (status berubah) - HP DENGAN VIBRATE =====
function subscribeOrderUpdates(orderId){
  if(orderChannel) { supabase.removeChannel(orderChannel); orderChannel=null; }
  orderChannel = supabase.channel('order-tracking-'+orderId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, async payload=>{
      const newOrder = payload.new;
      // Simpan ke localStorage biar tetap ada setelah reload HP
      if(newOrder.pickup_lat) localStorage.setItem('pickup_lat', newOrder.pickup_lat);
      if(newOrder.pickup_lng) localStorage.setItem('pickup_lng', newOrder.pickup_lng);
      
      if(['completed','cancelled','rejected'].includes(newOrder.status)){
        try{ if(navigator.vibrate) navigator.vibrate([200,100,200]); }catch(e){}
        alert(`Order ${newOrder.status}: ${newOrder.status==='completed'?'Terima kasih!':'Dibatalkan'}`);
        clearActiveTracking();
        hideTrackingUI();
        location.hash = '#/';
        return;
      }
      // Jika baru dapat driver - INI YANG KAMU CARI - driver berangkat jemput
      if(newOrder.driver_id){
        try{ if(navigator.vibrate) navigator.vibrate([300,100,300]); }catch(e){}
        const driver = await fetchDriverProfile(newOrder.driver_id);
        renderActiveOrder(newOrder, driver);
        subscribeDriverLocation(newOrder.driver_id);
        startDistanceUpdater(newOrder);
        // Update searchInfo juga
        const si = document.getElementById('searchInfo');
        if(si) si.textContent = `✅ Driver ${driver?.name||''} OTW - ${newOrder.status}`;
      } else {
        renderActiveOrder(newOrder, null);
      }
    })
    .subscribe((status)=>{
      console.log('order tracking sub', status);
    });
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

// ===== UPDATE JARAK DRIVER KE PICKUP - HP FRIENDLY =====
let lastDriverLoc = null;
function updateDriverDistance(driverLoc){
  if(!driverLoc) return;
  lastDriverLoc = driverLoc;
  const pickupLat = parseFloat(localStorage.getItem('pickup_lat') || document.getElementById('pickup')?.dataset.lat);
  const pickupLng = parseFloat(localStorage.getItem('pickup_lng') || document.getElementById('pickup')?.dataset.lng);
  
  let dLat, dLng;
  if(driverLoc.lat && driverLoc.lng){ dLat=parseFloat(driverLoc.lat); dLng=parseFloat(driverLoc.lng); }
  else if(driverLoc.latitude && driverLoc.longitude){ dLat=parseFloat(driverLoc.latitude); dLng=parseFloat(driverLoc.longitude); }
  else if(driverLoc.lokasi){
    const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); }
  }
  // Fallback kalau lokasi disimpan sebagai string "lat,lng"
  if(!dLat && driverLoc.updated_at){
    // tetap lanjutkan, tampilkan waktu update saja
  }
  
  const el = document.getElementById('trackingDistance');
  const etaEl = document.getElementById('trackingETA');
  
  if(!dLat || !pickupLat){
    if(el) el.textContent = `📍 Driver online • ${driverLoc.updated_at ? new Date(driverLoc.updated_at).toLocaleTimeString('id-ID') : 'menunggu lokasi...'}`;
    if(etaEl) etaEl.textContent = `Lokasi pickup: ${localStorage.getItem('pickup_text')?.slice(0,40)||'-'}`;
    return;
  }
  
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  if(el){
    if(dist < 0.1){
      el.textContent = `🎉 Driver sudah dekat! ${dist.toFixed(2)} km dari pickup`;
      el.style.color = '#16a34a';
    } else if(dist < 0.5){
      el.textContent = `📍 Driver ${dist.toFixed(2)} km lagi - hampir sampai!`;
      el.style.color = '#ea580c';
    } else {
      el.textContent = `📍 Driver ${dist.toFixed(2)} km dari pickup`;
      el.style.color = '#16a34a';
    }
    if(etaEl){
      const speed = driverLoc.speed_kmh || 25;
      const etaMin = Math.max(1, (dist / (speed||25)) * 60);
      etaEl.textContent = `⏱️ Estimasi ${etaMin.toFixed(0)} menit • ${speed.toFixed(0)} km/h • Update: ${driverLoc.updated_at ? new Date(driverLoc.updated_at).toLocaleTimeString('id-ID') : 'baru'}`;
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
  
  const theme = getAppTheme();
  const primary = theme.primary;
  const secondary = theme.secondary;
  
  if(infoEl) infoEl.textContent = '⏳ Mencari...';
  box.innerHTML = `<div style="padding:16px;text-align:center"><div style="font-size:20px">⏳</div><div style="font-size:12px;margin-top:6px;color:#64748b">Memuat order masuk...</div></div>`;
  
  try{
    const q1 = await supabase
      .from('orders')
      .select('*')
      .in('status', ['searching','pending','new','open','created','waiting'])
      .order('created_at', {ascending: false})
      .limit(30);
    
    if(q1.error) throw q1.error;
    
    const allOrders = q1.data || [];
    let orders = allOrders.filter(o => !o.driver_id || o.driver_id === driverProfile.id);
    
    const myVeh = driverProfile.jenis_kendaraan || 'motor';
    
    if(orders.length === 0){
      box.innerHTML = `<div style="padding:20px;text-align:center">
        <div style="font-size:32px">📭</div>
        <div style="margin-top:8px;font-size:14px;font-weight:700;color:#0f172a">Menunggu order...</div>
        <div style="font-size:11px;margin-top:4px;color:#64748b">Order ${myVeh} di ${ACTIVE_KECAMATAN_NAME||'Suruh'} akan muncul di sini</div>
        <button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:14px;font-size:12px">🔄 Refresh</button>
      </div>`;
      if(infoEl) infoEl.textContent = '';
      return;
    }
    
    if(infoEl) infoEl.textContent = `${orders.length} order`;
    
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id === driverProfile.id;
      const isBroadcast = !o.driver_id;
      const vehMatch = (o.vehicle_type||'motor') === myVeh;
      const pickup = o.pickup_text || o.pickup || '-';
      const dest = o.dest_text || o.destination || '-';
      const cost = o.estimated_cost || o.cost || 0;
      const dist = o.distance_km || o.distance || 0;
      const pickupLat = o.pickup_lat || o.pickupLat || null;
      const pickupLng = o.pickup_lng || o.pickupLng || null;
      const destLat = o.dest_lat || o.destLat || null;
      const destLng = o.dest_lng || o.destLng || null;
      
      // Link Google Maps penumpang
      let pickupMapUrl = '';
      if(pickupLat && pickupLng) pickupMapUrl = `https://www.google.com/maps?q=${pickupLat},${pickupLng}`;
      else pickupMapUrl = `https://www.google.com/maps/search/${encodeURIComponent(pickup)}`;
      
      let routeMapUrl = '';
      if(pickupLat && pickupLng && destLat && destLng) routeMapUrl = `https://www.google.com/maps/dir/${pickupLat},${pickupLng}/${destLat},${destLng}`;
      else routeMapUrl = pickupMapUrl;
      
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+primary:'1px solid #e2e8f0'};border-radius:14px;background:white">
        <div style="background:${isForMe?primary:'#0f172a'};color:white;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
          <b style="font-size:12px">${(o.vehicle_type||'motor')==='mobil'?'🚗':'🏍️'} ${(o.vehicle_type||'motor').toUpperCase()} • ${o.trip_type==='roundtrip'?'PP':'Sekali'}</b>
          <span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${isForMe?'white':secondary};color:${isForMe?primary:'#0f172a'};font-weight:800">${isForMe?'UNTUK SAYA': isBroadcast ? 'BARU' : o.status.toUpperCase()}</span>
        </div>
        <div style="padding:12px">
          <div style="font-size:13px;line-height:1.5;color:#0f172a">
            <div style="display:flex;gap:6px"><span>📍</span><b>${pickup}</b></div>
            <div style="display:flex;gap:6px;margin-top:4px"><span>🎯</span><b>${dest}</b></div>
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:#64748b">📏 ${typeof dist === 'number' ? dist.toFixed(2) : dist} km • 🕐 ${new Date(o.created_at).toLocaleTimeString('id-ID')}</span>
            <span style="font-size:13px;font-weight:800;background:#fef3c7;padding:3px 8px;border-radius:6px">Rp ${cost.toLocaleString('id-ID')}</span>
          </div>
          ${!vehMatch && isBroadcast ? '<div style="font-size:10px;color:#d97706;margin-top:6px">⚠️ Beda kendaraan ('+myVeh+' vs '+(o.vehicle_type||'motor')+')</div>' : ''}
        </div>
        <div style="padding:0 12px 12px;display:flex;gap:6px;flex-wrap:wrap">
          <a href="${pickupMapUrl}" target="_blank" style="flex:1;background:#0f172a;color:white;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px;font-weight:700">🗺️ Map Penumpang</a>
          <a href="${routeMapUrl}" target="_blank" style="flex:1;background:#f1f5f9;border:1px solid #cbd5e1;color:#0f172a;padding:10px;border-radius:10px;text-align:center;text-decoration:none;font-size:12px;font-weight:700">📍 Rute</a>
        </div>
        <div style="padding:0 12px 12px;display:flex;gap:6px">
          <button data-driver-accept="${o.id}" class="btn primary" style="flex:1;background:${primary};color:white;padding:12px;border-radius:10px;font-size:13px;font-weight:800;border:none">✅ TERIMA</button>
          <button data-driver-reject="${o.id}" class="btn secondary" style="background:white;border:1px solid #e2e8f0;padding:10px 14px;border-radius:10px">❌</button>
        </div>
      </div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button id="btnRefreshDriverOrders" class="btn secondary" style="font-size:11px">🔄 Refresh (${orders.length})</button></div>`;
    
  }catch(e){
    const box2 = document.getElementById('driverOrders');
    if(box2) box2.innerHTML = `<div style="padding:16px;text-align:center;background:#fef2f2;border-radius:12px">
      <div style="font-size:12px;color:#991b1b">Gagal memuat order</div>
      <div style="font-size:10px;color:#b45309;margin-top:4px">${e.message}</div>
      <button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:10px;font-size:11px">🔄 Coba Lagi</button>
    </div>`;
    if(infoEl) infoEl.textContent = '';
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

// ===== VIEW DRIVER - pakai setting aplikasi =====
export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️';
  const isOnline = (p.status === 'online');
  const theme = getAppTheme();
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon} ${p.jenis_kendaraan||'motor'}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • ${vehIcon} ${p.jenis_kendaraan||''} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Jenis Kendaraan, Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white':''}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div><div class="card"><h4 style="margin:0 0 8px">📥 Order Masuk <span style="font-size:10px;color:#666" id="driverOrdersInfo"></span></h4><div id="driverOrders" class="muted" style="font-size:12px">Menunggu order...</div></div><div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

// Init driver orders when page loaded
export function initDriverPage(driverProfile){
  if(!driverProfile) return;
  setTimeout(()=> loadDriverOrders(driverProfile), 500);
  subscribeDriverOrders(driverProfile);
}


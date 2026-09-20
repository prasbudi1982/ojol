// tracking.js - Live tracking driver untuk penumpang v7.0
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';

export let trackingChannel = null;
export let trackingDriverId = null;
export let trackingOrderId = null;
export let trackingMapInstance = null;
export let trackingMarkerDriver = null;
export let trackingMarkerPassenger = null;
export let trackingInterval = null;

export function parsePoint(wkt){
  if(!wkt) return null;
  try{
    const m = String(wkt).match(/POINT\s*\(\s*([-\d\.]+)\s+([-\d\.]+)\s*\)/i);
    if(!m) return null;
    const lng = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if(isNaN(lat)||isNaN(lng)) return null;
    return {lat, lng};
  }catch(e){ return null; }
}

function formatETA(distKm, speedKmh){
  if(!speedKmh || speedKmh < 2) return '~ menghitung...';
  const hours = distKm / speedKmh;
  const mins = Math.round(hours * 60);
  if(mins < 1) return '< 1 menit';
  if(mins < 60) return `${mins} menit`;
  const h = Math.floor(mins/60);
  const m = mins % 60;
  return `${h}j ${m}m`;
}

export function updateTrackingUI(driverLoc){
  const distEl = document.getElementById('trackDistance');
  const etaEl = document.getElementById('trackETA');
  const speedEl = document.getElementById('trackSpeed');
  const statusEl = document.getElementById('trackStatus');
  const lastEl = document.getElementById('trackLastUpdate');
  if(!driverLoc) return;
  const dLat = driverLoc.lat ?? driverLoc.latitude ?? parsePoint(driverLoc.lokasi)?.lat;
  const dLng = driverLoc.lng ?? driverLoc.longitude ?? parsePoint(driverLoc.lokasi)?.lng;
  if(!dLat || !dLng) return;
  const pLat = parseFloat(localStorage.getItem('track_pickup_lat'));
  const pLng = parseFloat(localStorage.getItem('track_pickup_lng'));
  let dist = null;
  if(pLat && pLng){
    dist = haversineKm(pLat, pLng, dLat, dLng);
    if(distEl) distEl.textContent = dist.toFixed(2) + ' km';
    if(etaEl) etaEl.textContent = formatETA(dist, driverLoc.speed_kmh || driverLoc.speed || 20);
  }
  if(speedEl) speedEl.textContent = (driverLoc.speed_kmh||0).toFixed(1) + ' km/h';
  if(lastEl) lastEl.textContent = new Date(driverLoc.updated_at||Date.now()).toLocaleTimeString();
  if(statusEl){
    if(dist !== null && dist < 0.05) statusEl.innerHTML = '✅ <b>Driver sudah dekat! Siap-siap</b>';
    else if(dist !== null && dist < 0.3) statusEl.innerHTML = '🏍️ <b>Driver mendekat</b> - ' + dist.toFixed(2) + ' km lagi';
    else statusEl.textContent = '🚀 Driver menuju pickup';
  }
  if(trackingMapInstance && window.L){
    if(!trackingMarkerDriver){
      trackingMarkerDriver = L.marker([dLat, dLng], {icon: L.divIcon({html:'🏍️', className:'driver-icon', iconSize:[30,30]})}).addTo(trackingMapInstance);
    } else {
      trackingMarkerDriver.setLatLng([dLat, dLng]);
    }
    try{
      const group = [];
      if(trackingMarkerDriver) group.push(trackingMarkerDriver.getLatLng());
      if(trackingMarkerPassenger) group.push(trackingMarkerPassenger.getLatLng());
      if(group.length>=2) trackingMapInstance.fitBounds(L.latLngBounds(group).pad(0.3));
      else trackingMapInstance.panTo([dLat, dLng]);
    }catch(e){}
  }
}

async function ensureLeafletForTracking(){
  if(window.L) return true;
  await new Promise((res,rej)=>{
    const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=res; s.onerror=rej; document.body.appendChild(s);
  });
  return true;
}

export async function initTrackingMap(pickupLat, pickupLng){
  await ensureLeafletForTracking();
  const mapEl = document.getElementById('trackingMap');
  if(!mapEl) return;
  mapEl.style.height = '280px';
  mapEl.style.display = 'block';
  setTimeout(()=>{ 
    if(trackingMapInstance) { try{ trackingMapInstance.remove(); }catch(e){} trackingMapInstance=null; }
    trackingMapInstance = L.map(mapEl).setView([pickupLat||-8.111, pickupLng||111.606], 14);
    L.tileLayer('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {maxZoom:20, attribution:'Google'}).addTo(trackingMapInstance);
    if(pickupLat && pickupLng){
      trackingMarkerPassenger = L.marker([pickupLat, pickupLng], {icon: L.divIcon({html:'📍', className:'pass-icon', iconSize:[30,30]})}).addTo(trackingMapInstance).bindPopup('Pickup kamu');
    }
    setTimeout(()=>trackingMapInstance.invalidateSize(), 300);
  }, 100);
}

export async function startTracking(driverId, orderId, pickupLat, pickupLng, driverInfo=null){
  stopTracking();
  trackingDriverId = driverId;
  trackingOrderId = orderId;
  if(pickupLat && pickupLng){
    localStorage.setItem('track_pickup_lat', pickupLat);
    localStorage.setItem('track_pickup_lng', pickupLng);
  }
  if(orderId) localStorage.setItem('active_order_id', orderId);
  if(driverId) localStorage.setItem('active_driver_id', driverId);
  if(driverInfo) localStorage.setItem('active_driver_info', JSON.stringify(driverInfo));
  const card = document.getElementById('activeOrderCard');
  if(card) card.style.display = 'block';
  const list = document.getElementById('driverList');
  if(list) list.style.display = 'none';
  const info = document.getElementById('searchInfo');
  if(info) info.textContent = '📡 Tracking driver...';
  await initTrackingMap(pickupLat, pickupLng);
  if(driverInfo){
    const nameEl = document.getElementById('trackDriverName');
    const vehEl = document.getElementById('trackDriverVehicle');
    const waEl = document.getElementById('trackWA');
    if(nameEl) nameEl.textContent = driverInfo.name || 'Driver';
    if(vehEl) vehEl.textContent = `${driverInfo.jenis_kendaraan==='mobil'?'🚗':'🏍️'} ${driverInfo.nopol||''} • ${driverInfo.tipe_motor||''}`;
    if(waEl && driverInfo.hp){
      const num = driverInfo.hp.replace(/[^0-9]/g,'').replace(/^0/,'62');
      waEl.href = `https://wa.me/${num}?text=Halo%20driver%20${encodeURIComponent(driverInfo.name||'')}%20saya%20menunggu%20jemputan`;
      waEl.style.display = 'inline-flex';
    }
  }
  try{
    const {data} = await supabase.from('driver_locations').select('*').eq('driver_id', driverId).single();
    if(data){
      const pt = parsePoint(data.lokasi);
      if(pt) updateTrackingUI({...data, lat:pt.lat, lng:pt.lng});
    }
  }catch(e){}
  try{
    trackingChannel = supabase.channel('track-driver-'+driverId)
      .on('postgres_changes', {event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}`}, payload=>{
        const loc = payload.new;
        if(!loc) return;
        const pt = parsePoint(loc.lokasi);
        if(pt) updateTrackingUI({...loc, lat:pt.lat, lng:pt.lng});
      })
      .subscribe();
  }catch(e){}
  trackingInterval = setInterval(async()=>{
    try{
      const {data} = await supabase.from('driver_locations').select('*').eq('driver_id', driverId).single();
      if(data){
        const pt = parsePoint(data.lokasi);
        if(pt) updateTrackingUI({...data, lat:pt.lat, lng:pt.lng});
      }
    }catch(e){}
  }, 5000);
  if(orderId){
    supabase.channel('track-order-'+orderId)
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${orderId}`}, payload=>{
        const o = payload.new;
        if(!o) return;
        if(o.status==='completed' || o.status==='cancelled'){
          const st = document.getElementById('trackStatus');
          if(st) st.textContent = o.status==='completed' ? '✅ Selesai - Terima kasih' : '❌ Order dibatalkan';
          setTimeout(()=>stopTracking(), 3000);
        }
      }).subscribe();
  }
}

export function stopTracking(){
  if(trackingChannel){
    try{ supabase.removeChannel(trackingChannel); }catch(e){}
    trackingChannel=null;
  }
  if(trackingInterval){ clearInterval(trackingInterval); trackingInterval=null; }
  trackingDriverId=null;
  trackingOrderId=null;
  if(trackingMapInstance){ try{ trackingMapInstance.remove(); }catch(e){} trackingMapInstance=null; }
  trackingMarkerDriver=null;
  trackingMarkerPassenger=null;
  const mapEl = document.getElementById('trackingMap');
  if(mapEl){ mapEl.style.height='0'; mapEl.style.display='none'; }
}

export async function loadActiveTracking(){
  const orderId = localStorage.getItem('active_order_id');
  const driverId = localStorage.getItem('active_driver_id');
  const pickupLat = localStorage.getItem('track_pickup_lat');
  const pickupLng = localStorage.getItem('track_pickup_lng');
  if(!orderId || !driverId) return null;
  try{
    const {data: order} = await supabase.from('orders').select('*').eq('id', orderId).single();
    if(!order) { clearActiveTracking(); return null; }
    if(order.status==='completed' || order.status==='cancelled'){ clearActiveTracking(); return null; }
    let driverInfo = null;
    try{ driverInfo = JSON.parse(localStorage.getItem('active_driver_info')||'null'); }catch(e){}
    if(!driverInfo){
      const {data: u} = await supabase.from('users').select('*').eq('id', driverId).single();
      driverInfo = u;
    }
    await startTracking(driverId, orderId, parseFloat(pickupLat), parseFloat(pickupLng), driverInfo);
    return order;
  }catch(e){ return null; }
}

export function clearActiveTracking(){
  localStorage.removeItem('active_order_id');
  localStorage.removeItem('active_driver_id');
  localStorage.removeItem('active_driver_info');
  localStorage.removeItem('track_pickup_lat');
  localStorage.removeItem('track_pickup_lng');
  stopTracking();
}

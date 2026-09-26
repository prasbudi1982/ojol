// map.js - VERSI FLEKSIBEL STABIL FIXED - Sinkron dengan admin setting
import { TRENGGALEK_BBOX, getActiveKecamatanLive } from './config.js';
import { isInTrenggalekKab, isInSuruhBbox } from './geofence.js';

export let mapInstance=null;
export let mapMarker=null;
export let mapSelected={lat:null,lng:null,address:null,inTrenggalek:false};
export let mapPickTarget='dest';

let activeKecRect = null; // simpan rectangle kecamatan aktif biar bisa dihapus saat ganti

export async function ensureLeaflet(){
  if(window.L) return;
  await new Promise((res,rej)=>{
    const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=res; s.onerror=rej; document.body.appendChild(s);
  });
}

function getActiveConfig(){
  try{ return getActiveKecamatanLive(); }catch(e){
    return { code:'3503071', name:'Suruh', center:{lat:-8.1111679,lng:111.6064513}, bbox:{minLat:-8.20,maxLat:-8.02,minLng:111.52,maxLng:111.70}, radiusKm:15 };
  }
}

export async function openMapPicker(target='dest'){
  mapPickTarget = target;
  if(typeof window!=='undefined') window._mapPickTarget = target;
  const modal=document.getElementById('mapModal'); if(!modal) return; modal.style.display='flex';
  await ensureLeaflet();

  const ACTIVE = getActiveConfig();
  const ACTIVE_CENTER = ACTIVE.center;
  const ACTIVE_BBOX = ACTIVE.bbox;
  const ACTIVE_NAME = ACTIVE.name;

  const mapEl=document.getElementById('leafletMap');
  if(!mapInstance){
    mapInstance = L.map(mapEl).setView([ACTIVE_CENTER.lat, ACTIVE_CENTER.lng], 12);
    const googleStreets = L.tileLayer('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: 'Google Maps' });
    const googleSat = L.tileLayer('https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: 'Google' });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' });
    googleStreets.addTo(mapInstance);
    L.control.layers({ "Google Maps Detail": googleStreets, "Google Satelit": googleSat, "OSM": osm }).addTo(mapInstance);
    
    // Batas kabupaten tetap
    L.rectangle([[TRENGGALEK_BBOX.minLat, TRENGGALEK_BBOX.minLng],[TRENGGALEK_BBOX.maxLat, TRENGGALEK_BBOX.maxLng]], {color:'#22c55e', weight:1, dashArray:'5,5', fillOpacity:0.05}).addTo(mapInstance).bindPopup('Batas Kabupaten Trenggalek');
    
    // Batas kecamatan aktif - dinamis
    activeKecRect = L.rectangle([[ACTIVE_BBOX.minLat, ACTIVE_BBOX.minLng],[ACTIVE_BBOX.maxLat, ACTIVE_BBOX.maxLng]], {color:'#3b82f6', weight:2, fillOpacity:0.08}).addTo(mapInstance).bindPopup(`Kecamatan ${ACTIVE_NAME} - Pickup Area (${ACTIVE.code})`);
    
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
  } else {
    // Update view & rectangle jika kecamatan berubah
    try{ mapInstance.off('click'); }catch(e){}
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
    
    if(activeKecRect){ try{ mapInstance.removeLayer(activeKecRect); }catch(e){} }
    activeKecRect = L.rectangle([[ACTIVE_BBOX.minLat, ACTIVE_BBOX.minLng],[ACTIVE_BBOX.maxLat, ACTIVE_BBOX.maxLng]], {color:'#3b82f6', weight:2, fillOpacity:0.08}).addTo(mapInstance).bindPopup(`Kecamatan ${ACTIVE_NAME} - Pickup Area (${ACTIVE.code})`);
    
    // Set view ke kecamatan aktif terbaru (jangan pakai Suruh hardcode)
    mapInstance.setView([ACTIVE_CENTER.lat, ACTIVE_CENTER.lng], 12);
  }
  
  setTimeout(()=>{ mapInstance.invalidateSize(); }, 200);
  setTimeout(()=>{ mapInstance.invalidateSize(); }, 700);

  // Cek existing location berdasarkan target
  let existingLat=null, existingLng=null;
  if(target==='merchant'){
    const latEl=document.getElementById('profileMerchantLat');
    const lngEl=document.getElementById('profileMerchantLng');
    existingLat=parseFloat(latEl?.value); existingLng=parseFloat(lngEl?.value);
  } else if(target==='warung'){
    const latEl=document.getElementById('sLat')||document.getElementById('profileMerchantLat');
    const lngEl=document.getElementById('sLng')||document.getElementById('profileMerchantLng');
    existingLat=parseFloat(latEl?.value); existingLng=parseFloat(lngEl?.value);
  } else {
    const destInput = document.getElementById('dest');
    existingLat = parseFloat(destInput?.dataset?.lat);
    existingLng = parseFloat(destInput?.dataset?.lng);
  }
  
  if(existingLat && existingLng && isInTrenggalekKab(existingLat, existingLng)){
    mapInstance.setView([existingLat, existingLng], 15);
    await setMapLocation(existingLat, existingLng);
    return;
  }
  
  try{
    const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:4000}));
    const lat=pos.coords.latitude; const lng=pos.coords.longitude;
    if(isInTrenggalekKab(lat,lng)){
      mapInstance.setView([lat,lng], 15);
      await setMapLocation(lat,lng);
      return;
    }
  }catch(e){}
  
  const addrEl2 = document.getElementById('mapSelectedAddress');
  const confirmBtn2 = document.getElementById('btnConfirmMap');
  const coordsEl2 = document.getElementById('mapSelectedCoords');
  const badgeEl2 = document.getElementById('mapTrenggalekBadge');
  if(addrEl2) addrEl2.textContent = `👆 Klik peta untuk pilih tujuan di ${ACTIVE_NAME} - jangan pakai default jika tujuan jauh`;
  if(coordsEl2) coordsEl2.textContent = 'Belum ada titik dipilih • Klik peta';
  if(badgeEl2){ badgeEl2.textContent = '⚠️ Belum pilih titik - klik peta dulu'; badgeEl2.style.background = '#f59e0b'; }
  if(confirmBtn2){ confirmBtn2.disabled = true; confirmBtn2.style.opacity = '0.5'; }
  if(mapMarker){ try{ mapInstance.removeLayer(mapMarker); }catch(e){} mapMarker=null; }
  mapSelected.lat=null; mapSelected.lng=null; mapSelected.address=null;
}

export async function setMapLocation(lat,lng, shouldPan=true){
  const ACTIVE = getActiveConfig();
  const preciseLat = parseFloat(Number(lat).toFixed(7));
  const preciseLng = parseFloat(Number(lng).toFixed(7));
  const addrEl=document.getElementById('mapSelectedAddress');
  const coordsEl=document.getElementById('mapSelectedCoords');
  const badgeEl=document.getElementById('mapTrenggalekBadge');
  const confirmBtn=document.getElementById('btnConfirmMap');
  if(!addrEl) return;
  if(mapMarker){ try{ mapInstance.removeLayer(mapMarker); }catch(e){} }
  
  const inKab = isInTrenggalekKab(preciseLat,preciseLng);
  // isInSuruhBbox sekarang cek terhadap bbox aktif (backward compat)
  let inKec = false;
  try{ inKec = isInSuruhBbox(preciseLat,preciseLng); }catch(e){
    // fallback manual jika geofence.js masih pakai SURUH_BBOX statis
    const b = ACTIVE.bbox;
    inKec = preciseLat >= b.minLat && preciseLat <= b.maxLat && preciseLng >= b.minLng && preciseLng <= b.maxLng;
  }
  
  mapMarker = L.marker([preciseLat,preciseLng], {draggable:true, autoPan:false}).addTo(mapInstance);
  mapMarker.bindPopup(inKab ? `✅ ${inKec ? 'Dalam '+ACTIVE.name : 'Tujuan di Trenggalek'}<br>`+preciseLat.toFixed(6)+', '+preciseLng.toFixed(6) : '⛔ Luar Trenggalek').openPopup();
  if(shouldPan && mapInstance){ mapInstance.panTo([preciseLat,preciseLng], {animate:true, duration:0.3}); }
  mapMarker.on('dragend', async ()=>{ const p=mapMarker.getLatLng(); await setMapLocation(p.lat, p.lng, false); });

  // Reverse geocode via Nominatim (opsional)
  try{
    if(addrEl) addrEl.textContent = '📍 Mengambil alamat...';
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${preciseLat}&lon=${preciseLng}&zoom=18&addressdetails=1`, { headers:{'Accept-Language':'id'} });
    const json = await resp.json();
    const display = json.display_name || `${preciseLat.toFixed(6)}, ${preciseLng.toFixed(6)}`;
    mapSelected.address = display;
    if(addrEl) addrEl.textContent = display;
  }catch(e){
    mapSelected.address = `${preciseLat.toFixed(6)}, ${preciseLng.toFixed(6)}`;
    if(addrEl) addrEl.textContent = mapSelected.address;
  }

  mapSelected.lat = preciseLat; mapSelected.lng = preciseLng; mapSelected.inTrenggalek = inKab;
  if(coordsEl) coordsEl.textContent = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  if(badgeEl){
    if(inKec){ badgeEl.textContent = `✅ Dalam ${ACTIVE.name}`; badgeEl.style.background = '#16a34a'; }
    else if(inKab){ badgeEl.textContent = '✅ Dalam Trenggalek (Luar Pickup)'; badgeEl.style.background = '#22c55e'; }
    else { badgeEl.textContent = '⛔ Luar Trenggalek'; badgeEl.style.background = '#ef4444'; }
  }
  if(confirmBtn){ confirmBtn.disabled = !inKab; confirmBtn.style.opacity = inKab ? '1' : '0.5'; }
}

export function closeMapPicker(){
  const modal=document.getElementById('mapModal'); if(modal) modal.style.display='none';
}

export function confirmMapLocation(updateEstimateFn){
  const ACTIVE = getActiveConfig();
  const target = mapPickTarget || (typeof window!=='undefined' ? window._mapPickTarget : 'dest') || 'dest';
  const finalLat = mapSelected.lat;
  const finalLng = mapSelected.lng;
  if(!finalLat || !finalLng) return;

  if(target==='merchant'){
    const latEl=document.getElementById('profileMerchantLat');
    const lngEl=document.getElementById('profileMerchantLng');
    if(latEl) latEl.value=finalLat.toFixed(7);
    if(lngEl) lngEl.value=finalLng.toFixed(7);
    if(window.setMerchantMapLocation){ window.setMerchantMapLocation(finalLat, finalLng, mapSelected.address); } else {
      const addrEl=document.getElementById('profileAlamatMerchant'); if(addrEl && mapSelected.address) addrEl.value=mapSelected.address.slice(0,180);
    }
    closeMapPicker();
    return;
  }
  if(target==='food_dest' || target==='food'){
    const raw = localStorage.getItem('ojol_cart_v2_food');
    let s = null;
    try{ s = raw ? JSON.parse(raw) : { items: [], dest: {}, pickup: {} }; }catch(e){ s = { items: [], dest: {}, pickup: {} }; }
    const finalAddress = (mapSelected.address && mapSelected.address.length>5) ? mapSelected.address : (finalLat.toFixed(7)+', '+finalLng.toFixed(7));
    s.dest = { lat: finalLat, lng: finalLng, text: finalAddress };
    if(s.pickup && s.pickup.lat){
      const R=6371; const dLat=(finalLat - s.pickup.lat)*Math.PI/180; const dLng=(finalLng - s.pickup.lng)*Math.PI/180;
      const a=Math.sin(dLat/2)**2 + Math.cos(s.pickup.lat*Math.PI/180)*Math.cos(finalLat*Math.PI/180)*Math.sin(dLng/2)**2;
      s.distanceKm = 2*R*Math.asin(Math.sqrt(a));
      s.distance_km = s.distanceKm;
    }
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
    closeMapPicker();
    try{ window.dispatchEvent(new CustomEvent('food_dest_updated', { detail: s.dest })); }catch(e){}
    return;
  }
  if(target==='warung'){
    const latEl=document.getElementById('sLat');
    const lngEl=document.getElementById('sLng');
    if(latEl) latEl.value=finalLat.toFixed(7);
    if(lngEl) lngEl.value=finalLng.toFixed(7);
    const addrEl=document.getElementById('sAlamat')||document.getElementById('profileAlamatMerchant');
    if(addrEl && mapSelected.address){ addrEl.value=mapSelected.address.slice(0,180); addrEl.dispatchEvent(new Event('input',{bubbles:true})); }
    closeMapPicker();
    return;
  }
  
  const destInput=document.getElementById('dest');
  const box=document.getElementById('destSuggestions');
  const badge=document.getElementById('destLive');
  if(box){ box.style.display='none'; box.innerHTML=''; }
  if(destInput){
    let rawAddr = (mapSelected.address||'').trim();
    let cleanAddr = rawAddr.split('|')[0].trim().slice(0,160);
    if(!cleanAddr || cleanAddr.length<5) cleanAddr = `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;
    destInput.value = cleanAddr;
    destInput.dataset.lat = finalLat.toString();
    destInput.dataset.lng = finalLng.toString();
    destInput.dataset.justSelected = 'true';
    try{
      localStorage.setItem('dest_lat', finalLat.toString());
      localStorage.setItem('dest_lng', finalLng.toString());
    }catch(e){}
  }
  mapSelected.lat = finalLat; mapSelected.lng = finalLng;
  if(!mapSelected.address || mapSelected.address.includes('Mengambil alamat')){
    mapSelected.address = `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;
  }
  if(badge) badge.textContent=`📍 dari Map • ${finalLat.toFixed(5)}, ${finalLng.toFixed(5)} • ${ACTIVE.name}`;
  closeMapPicker();
  setTimeout(()=>{
    if(updateEstimateFn) updateEstimateFn();
    try{
      const destInput2=document.getElementById('dest');
      if(destInput2){
        destInput2.dispatchEvent(new Event('change', {bubbles:true}));
        setTimeout(()=>{ destInput2.dataset.justSelected='false'; }, 1200);
      }
    }catch(e){}
  }, 150);
}

if(typeof window!=='undefined'){
  window.openMapPicker = openMapPicker;
  window.setMapLocation = setMapLocation;
  window.closeMapPicker = closeMapPicker;
  window.confirmMapLocation = (fn)=>confirmMapLocation(fn || window.updateOrderEstimate);
  window.openMerchantMapPicker = ()=>openMapPicker('merchant');
  window.openWarungMapPicker = ()=>openMapPicker('warung');
  window.openFoodDestMapPicker = ()=>openMapPicker('food_dest');
  window.openDestMapPicker = ()=>openMapPicker('dest');
}

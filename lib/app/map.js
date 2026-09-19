// map.js - Map picker Google tiles + Leaflet + pin akurat 7 desimal
import { SURUH_CENTER, SURUH_BBOX, TRENGGALEK_BBOX } from './config.js';
import { isInTrenggalekKab } from './geofence.js';

export let mapInstance=null;
export let mapMarker=null;
export let mapSelected={lat:null,lng:null,address:null,inTrenggalek:false};

export async function ensureLeaflet(){
  if(window.L) return;
  await new Promise((res,rej)=>{
    const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=res; s.onerror=rej; document.body.appendChild(s);
  });
}

export async function openMapPicker(){
  const modal=document.getElementById('mapModal'); if(!modal) return; modal.style.display='flex';
  await ensureLeaflet();
  const mapEl=document.getElementById('leafletMap');
  if(!mapInstance){
    mapInstance = L.map(mapEl).setView([SURUH_CENTER.lat, SURUH_CENTER.lng], 12);
    const googleStreets = L.tileLayer('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: 'Google Maps' });
    const googleSat = L.tileLayer('https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: 'Google' });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' });
    googleStreets.addTo(mapInstance);
    L.control.layers({ "Google Maps Detail": googleStreets, "Google Satelit": googleSat, "OSM": osm }).addTo(mapInstance);
    L.rectangle([[TRENGGALEK_BBOX.minLat, TRENGGALEK_BBOX.minLng],[TRENGGALEK_BBOX.maxLat, TRENGGALEK_BBOX.maxLng]], {color:'#22c55e', weight:1, dashArray:'5,5', fillOpacity:0.05}).addTo(mapInstance).bindPopup('Batas Kabupaten Trenggalek');
    L.rectangle([[SURUH_BBOX.minLat, SURUH_BBOX.minLng],[SURUH_BBOX.maxLat, SURUH_BBOX.maxLng]], {color:'#3b82f6', weight:2, fillOpacity:0.08}).addTo(mapInstance).bindPopup('Kecamatan Suruh - Pickup Area');
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
  } else {
    try{ mapInstance.off('click'); }catch(e){}
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
  }
  setTimeout(()=>{ mapInstance.invalidateSize(); }, 200);
  setTimeout(()=>{ mapInstance.invalidateSize(); }, 700);

  const destInput = document.getElementById('dest');
  const existingLat = parseFloat(destInput?.dataset?.lat);
  const existingLng = parseFloat(destInput?.dataset?.lng);
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
  let pinLat = SURUH_CENTER.lat; let pinLng = SURUH_CENTER.lng;
  try{ const center = mapInstance.getCenter(); if(center && center.lat) { pinLat = parseFloat(center.lat.toFixed(7)); pinLng = parseFloat(center.lng.toFixed(7)); } }catch(e){}
  await setMapLocation(pinLat, pinLng, false);
  const oldCross = document.getElementById('mapCrosshair'); if(oldCross) oldCross.remove();
}

export async function setMapLocation(lat,lng, shouldPan=true){
  const preciseLat = parseFloat(Number(lat).toFixed(7));
  const preciseLng = parseFloat(Number(lng).toFixed(7));
  const addrEl=document.getElementById('mapSelectedAddress');
  const coordsEl=document.getElementById('mapSelectedCoords');
  const badgeEl=document.getElementById('mapTrenggalekBadge');
  const confirmBtn=document.getElementById('btnConfirmMap');
  if(!addrEl) return;
  if(mapMarker){ try{ mapInstance.removeLayer(mapMarker); }catch(e){} }
  const inKab = isInTrenggalekKab(preciseLat,preciseLng);
  mapMarker = L.marker([preciseLat,preciseLng], {draggable:true, autoPan:false}).addTo(mapInstance);
  mapMarker.bindPopup(inKab ? '✅ Tujuan di Trenggalek<br>'+preciseLat.toFixed(6)+', '+preciseLng.toFixed(6) : '⛔ Luar Trenggalek').openPopup();
  if(shouldPan && mapInstance){ mapInstance.panTo([preciseLat,preciseLng], {animate:true, duration:0.3}); }
  mapMarker.on('dragend', async ()=>{ const p=mapMarker.getLatLng(); await setMapLocation(p.lat, p.lng, false); });
  mapSelected.lat=preciseLat; mapSelected.lng=preciseLng; mapSelected.inTrenggalek=inKab;
  addrEl.textContent='Mengambil alamat detail...';
  coordsEl.textContent=`${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  if(badgeEl){ badgeEl.textContent = inKab ? '✅ DALAM KAB. TRENGGALEK - SIAP DIPAKAI' : '⛔ LUAR KAB. TRENGGALEK - TIDAK BISA'; badgeEl.style.background = inKab ? '#16a34a' : '#ef4444'; badgeEl.style.color='white'; }
  if(confirmBtn){ confirmBtn.disabled = !inKab; confirmBtn.style.opacity = inKab ? '1' : '0.5'; confirmBtn.style.display='block'; confirmBtn.style.background = inKab ? '#16a34a' : '#475569'; }
  let detailAddress = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  try{
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${preciseLat}&lon=${preciseLng}&zoom=18&addressdetails=1`);
    const data = await resp.json();
    if(data && data.display_name){
      detailAddress = data.display_name;
      const a=data.address;
      const extra = [a.amenity, a.shop, a.house_number, a.road, a.hamlet, a.village, a.suburb, a.county].filter(Boolean).join(', ');
      if(extra) detailAddress = extra + ' | ' + data.display_name;
    }
  }catch(e){}
  mapSelected.address=detailAddress;
  addrEl.textContent=detailAddress;
  coordsEl.textContent=`${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)} • Akurat`;
}

export function closeMapPicker(){ const modal=document.getElementById('mapModal'); if(modal) modal.style.display='none'; }

export function confirmMapLocation(updateEstimateFn){
  let finalLat = mapSelected.lat; let finalLng = mapSelected.lng;
  if(mapMarker){ try{ const p = mapMarker.getLatLng(); finalLat = parseFloat(p.lat.toFixed(7)); finalLng = parseFloat(p.lng.toFixed(7)); }catch(e){} }
  if(!finalLat || !isInTrenggalekKab(finalLat, finalLng)){ alert('⛔ Pilih lokasi di dalam Kabupaten Trenggalek dulu'); return; }
  const destInput=document.getElementById('dest');
  if(destInput){
    const cleanAddr = (mapSelected.address||'').split('|')[0].slice(0,140) || `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;
    destInput.value = cleanAddr;
    destInput.dataset.lat = finalLat; destInput.dataset.lng = finalLng;
    destInput.focus();
  }
  mapSelected.lat = finalLat; mapSelected.lng = finalLng;
  const badge=document.getElementById('destLive'); if(badge) badge.textContent='📍 dari Map Google';
  closeMapPicker();
  if(updateEstimateFn) updateEstimateFn();
}

// expose global biar onclick lama tetap jalan
if(typeof window!=='undefined'){
  window.openMapPicker = openMapPicker;
  window.setMapLocation = setMapLocation;
  window.closeMapPicker = closeMapPicker;
  window.confirmMapLocation = ()=>confirmMapLocation();
}

// map.js - VERSI FLEKSIBEL STABIL - Map picker Google tiles + Leaflet + BBOX Fleksibel
import { SURUH_CENTER, SURUH_BBOX, TRENGGALEK_BBOX, ACTIVE_KECAMATAN_NAME } from './config.js';
import { isInTrenggalekKab, isInSuruhBbox } from './geofence.js';

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
    L.rectangle([[SURUH_BBOX.minLat, SURUH_BBOX.minLng],[SURUH_BBOX.maxLat, SURUH_BBOX.maxLng]], {color:'#3b82f6', weight:2, fillOpacity:0.08}).addTo(mapInstance).bindPopup(`Kecamatan ${ACTIVE_KECAMATAN_NAME} - Pickup Area`);
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
  } else {
    try{ mapInstance.off('click'); }catch(e){}
    mapInstance.on('click', async (e)=>{ await setMapLocation(e.latlng.lat, e.latlng.lng, true); });
    // Update popup name jika ganti kecamatan
    mapInstance.eachLayer(layer => {
      if(layer.getBounds && layer.getPopup()){
        const bounds = layer.getBounds();
        if(bounds.getSouthWest().lat === SURUH_BBOX.minLat){
          layer.setPopupContent(`Kecamatan ${ACTIVE_KECAMATAN_NAME} - Pickup Area`);
        }
      }
    });
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
  const inKec = isInSuruhBbox(preciseLat,preciseLng);
  mapMarker = L.marker([preciseLat,preciseLng], {draggable:true, autoPan:false}).addTo(mapInstance);
  mapMarker.bindPopup(inKab ? `✅ ${inKec ? 'Dalam '+ACTIVE_KECAMATAN_NAME : 'Tujuan di Trenggalek'}<br>`+preciseLat.toFixed(6)+', '+preciseLng.toFixed(6) : '⛔ Luar Trenggalek').openPopup();
  if(shouldPan && mapInstance){ mapInstance.panTo([preciseLat,preciseLng], {animate:true, duration:0.3}); }
  mapMarker.on('dragend', async ()=>{ const p=mapMarker.getLatLng(); await setMapLocation(p.lat, p.lng, false); });
  mapSelected.lat=preciseLat; mapSelected.lng=preciseLng; mapSelected.inTrenggalek=inKab;
  addrEl.textContent='Mengambil alamat detail...';
  coordsEl.textContent=`${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  if(badgeEl){ badgeEl.textContent = inKab ? '✅ DALAM KAB. TRENGGALEK - SIAP DIPAKAI' : '⛔ LUAR KAB. TRENGGALEK - TIDAK BISA'; badgeEl.style.background = inKab ? '#16a34a' : '#ef4444'; badgeEl.style.color='white'; }
  if(confirmBtn){ confirmBtn.disabled = !inKab; confirmBtn.style.opacity = inKab ? '1' : '0.5'; confirmBtn.style.display='block'; confirmBtn.style.background = inKab ? '#16a34a' : '#475569'; }
  // Field Lokasi penumpang gunakan koordinat jika nama lokasi tidak terdeteksi
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
  }catch(e){
    // Jika reverse geocode gagal, tetap pakai koordinat (jangan kosong)
    detailAddress = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  }
  // Pastikan jika nama lokasi tidak terdeteksi, gunakan koordinat
  if(!detailAddress || detailAddress.trim().length<5){
    detailAddress = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  }
  mapSelected.address=detailAddress;
  addrEl.textContent=detailAddress;
  coordsEl.textContent=`${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)} • ${ACTIVE_KECAMATAN_NAME}`;
}

export function closeMapPicker(){ const modal=document.getElementById('mapModal'); if(modal) modal.style.display='none'; }


export function confirmMapLocation(updateEstimateFn){
  let finalLat = mapSelected.lat; let finalLng = mapSelected.lng;
  if(mapMarker){ try{ const p = mapMarker.getLatLng(); finalLat = parseFloat(p.lat.toFixed(7)); finalLng = parseFloat(p.lng.toFixed(7)); }catch(e){} }
  if(!finalLat || !isInTrenggalekKab(finalLat, finalLng)){ alert('⛔ Pilih lokasi di dalam Kabupaten Trenggalek dulu'); return; }
  const destInput=document.getElementById('dest');
  const box=document.getElementById('destSuggestions');
  const badge=document.getElementById('destLive');
  if(box){ box.style.display='none'; box.innerHTML=''; }
  if(destInput){
    let rawAddr = (mapSelected.address||'').trim();
    let cleanAddr = '';
    if(rawAddr){
      const shortPart = rawAddr.split('|')[0].trim();
      if(shortPart && !shortPart.includes('Mengambil alamat')){
        cleanAddr = shortPart.slice(0,160);
      }
    }
    if(!cleanAddr || cleanAddr.length<5){
      cleanAddr = `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;
    }
    // FIX: langsung insert koordinat + alamat pendek, pastikan dataset terisi
    destInput.value = cleanAddr;
    destInput.dataset.lat = finalLat.toString();
    destInput.dataset.lng = finalLng.toString();
    destInput.dataset.justSelected = 'true';
    // FIX: simpan ke localStorage juga biar order.js baca
    try{
      localStorage.setItem('dest_lat', finalLat.toString());
      localStorage.setItem('dest_lng', finalLng.toString());
    }catch(e){}
    // FIX: update global meta jika ada
    try{
      if(window._currentOrderMeta){ window._currentOrderMeta.destLat=finalLat; window._currentOrderMeta.destLng=finalLng; }
      // Coba update order module currentOrderMeta via window.order (jika di-expose)
      if(window.order && window.order.currentOrderMeta){
        window.order.currentOrderMeta.destLat = finalLat;
        window.order.currentOrderMeta.destLng = finalLng;
      }
    }catch(e){}
  }
  mapSelected.lat = finalLat; mapSelected.lng = finalLng;
  if(!mapSelected.address || mapSelected.address.includes('Mengambil alamat')){
    mapSelected.address = `${finalLat.toFixed(7)}, ${finalLng.toFixed(7)}`;
  }
  if(badge) badge.textContent=`📍 dari Map • ${finalLat.toFixed(5)}, ${finalLng.toFixed(5)} • ${ACTIVE_KECAMATAN_NAME}`;
  closeMapPicker();
  // FIX: panggil updateEstimate setelah modal tertutup, dengan delay kecil biar DOM update
  setTimeout(()=>{
    if(updateEstimateFn) updateEstimateFn();
    // Juga trigger event input biar order.js deteksi
    try{
      const destInput2=document.getElementById('dest');
      if(destInput2){
        destInput2.dispatchEvent(new Event('change', {bubbles:true}));
        // reset justSelected setelah 1 detik, bukan langsung
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
}

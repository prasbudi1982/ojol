// map.js - VERSI FLEKSIBEL STABIL - Map picker Google tiles + Leaflet + BBOX Fleksibel - TANPA PENCARIAN
import { SURUH_CENTER, SURUH_BBOX, TRENGGALEK_BBOX, ACTIVE_KECAMATAN_NAME } from './config.js';
import { isInTrenggalekKab, isInSuruhBbox } from './geofence.js';

export let mapInstance=null;
export let mapMarker=null;
export let mapSelected={lat:null,lng:null,address:null,inTrenggalek:false};
// Untuk bedakan target picker: 'dest' (penumpang), 'merchant' (profil warung), 'warung' (store/my)
export let mapPickTarget='dest';

export async function ensureLeaflet(){
  if(window.L) return;
  await new Promise((res,rej)=>{
    const link=document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const s=document.createElement('script'); s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload=res; s.onerror=rej; document.body.appendChild(s);
  });
}

export async function openMapPicker(target='dest'){
  mapPickTarget = target;
  if(typeof window!=='undefined') window._mapPickTarget = target;
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
  // FIX BUG: jangan auto pakai koordinat kecamatan Suruh sebagai tujuan jika user belum klik
  // Cukup set view ke Suruh, tapi marker tidak di-set sampai user klik
  const addrEl2 = document.getElementById('mapSelectedAddress');
  const confirmBtn2 = document.getElementById('btnConfirmMap');
  const coordsEl2 = document.getElementById('mapSelectedCoords');
  const badgeEl2 = document.getElementById('mapTrenggalekBadge');
  if(addrEl2) addrEl2.textContent = '👆 Klik peta untuk pilih tujuan - jangan pakai default Suruh jika tujuan jauh';
  if(coordsEl2) coordsEl2.textContent = 'Belum ada titik dipilih • Klik peta';
  if(badgeEl2){ badgeEl2.textContent = '⚠️ Belum pilih titik - klik peta dulu'; badgeEl2.style.background = '#f59e0b'; }
  if(confirmBtn2){ confirmBtn2.disabled = true; confirmBtn2.style.opacity = '0.5'; }
  // Hapus marker lama jika ada
  if(mapMarker){ try{ mapInstance.removeLayer(mapMarker); }catch(e){} mapMarker=null; }
  mapSelected.lat=null; mapSelected.lng=null; mapSelected.address=null;
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
    detailAddress = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  }
  if(!detailAddress || detailAddress.trim().length<5){
    detailAddress = `${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)}`;
  }
  mapSelected.address=detailAddress;
  addrEl.textContent=detailAddress;
  coordsEl.textContent=`${preciseLat.toFixed(7)}, ${preciseLng.toFixed(7)} • ${ACTIVE_KECAMATAN_NAME}`;
}

export function closeMapPicker(){ const modal=document.getElementById('mapModal'); if(modal) modal.style.display='none'; }

export function confirmMapLocation(updateEstimateFn){
  const target = (typeof window!=='undefined' && window._mapPickTarget) ? window._mapPickTarget : mapPickTarget;
  let finalLat = mapSelected.lat; let finalLng = mapSelected.lng;
  if(mapMarker){ try{ const p = mapMarker.getLatLng(); finalLat = parseFloat(p.lat.toFixed(7)); finalLng = parseFloat(p.lng.toFixed(7)); }catch(e){} }
  if(!finalLat || !isInTrenggalekKab(finalLat, finalLng)){ alert('⛔ Pilih lokasi di dalam Kabupaten Trenggalek dulu'); return; }
  // Jika target merchant/warung, cek juga harus dalam kecamatan aktif (Suruh)
  if(target==='merchant' || target==='warung'){
    if(!isInSuruhBbox(finalLat, finalLng)){
      alert('⛔ Lokasi warung harus di dalam area '+ACTIVE_KECAMATAN_NAME+' - pilih lagi di dalam bbox');
      return;
    }
  }
  // MERCHANT TARGET
  if(target==='merchant'){
    const latEl=document.getElementById('profileMerchantLat');
    const lngEl=document.getElementById('profileMerchantLng');
    if(latEl) latEl.value=finalLat.toFixed(7);
    if(lngEl) lngEl.value=finalLng.toFixed(7);
    if(window.setMerchantMapLocation){ window.setMerchantMapLocation(finalLat, finalLng, mapSelected.address); } else {
      const latEl=document.getElementById('profileMerchantLat'); const lngEl=document.getElementById('profileMerchantLng');
      if(latEl) latEl.value=finalLat.toFixed(7);
      if(lngEl) lngEl.value=finalLng.toFixed(7);
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
    try{
      const dt=document.getElementById('destText'); 
      if(dt){ dt.value = s.dest.text; dt.dispatchEvent(new Event('input',{bubbles:true})); }
      // Update Lat/Lng display in cart - cari elemen muted yang berisi Lat:
      const mutedEls = document.querySelectorAll('.muted');
      mutedEls.forEach(el=>{
        if(el.textContent.includes('Lat:') && el.textContent.includes('Warung:')){
          const warungPart = el.textContent.split('•').pop() || '';
          el.textContent = `Lat: ${finalLat.toFixed(6)} Lng: ${finalLng.toFixed(6)} •` + warungPart;
        }
      });
      // Update cartStore if exists
      if(window.cartStore && window.cartStore._actions && window.cartStore._actions.setDest){
        try{ window.cartStore._actions.setDest(s.dest); }catch(e){}
      } else {
        // try via import
        try{
          const rawStore = localStorage.getItem('ojol_cart_v2_food');
          if(rawStore){
            const parsed = JSON.parse(rawStore);
            // keep items
            localStorage.setItem('ojol_cart_v2_food', JSON.stringify(parsed));
          }
        }catch(e){}
      }
      // Update totals if element exists
      const subtotalEl = document.querySelector('[data-cart-totals]');
      // No reload, just close
    }catch(e){ console.warn('food_dest UI update', e); }
    closeMapPicker();
    // Jangan reload full, cukup trigger custom event biar storeViews refresh Lat/Lng
    try{
      window.dispatchEvent(new CustomEvent('food_dest_updated', { detail: s.dest }));
      // Jika di cart, update langsung tanpa reload
      const latEl = document.querySelector('#cartLatDisplay');
      const lngEl = document.querySelector('#cartLngDisplay');
      if(latEl) latEl.textContent = finalLat.toFixed(6);
      if(lngEl) lngEl.textContent = finalLng.toFixed(6);
    }catch(e){}
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
    destInput.value = cleanAddr;
    destInput.dataset.lat = finalLat.toString();
    destInput.dataset.lng = finalLng.toString();
    destInput.dataset.justSelected = 'true';
    try{
      localStorage.setItem('dest_lat', finalLat.toString());
      localStorage.setItem('dest_lng', finalLng.toString());
    }catch(e){}
    try{
      if(window._currentOrderMeta){ window._currentOrderMeta.destLat=finalLat; window._currentOrderMeta.destLng=finalLng; }
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
  setTimeout(()=>{
    if(updateEstimateFn) updateEstimateFn();
    try{
      const destInput2=document.getElementById('dest');
      if(destInput2){
        destInput2.dispatchEvent(new Event('change', {bubbles:true}));
        // AUTO FOCUS FLOW: setelah insert map -> kendaraan
        destInput2.dispatchEvent(new CustomEvent('map:selected', {detail:{lat:finalLat,lng:finalLng}}));
        window.dispatchEvent(new CustomEvent('map:selected', {detail:{lat:finalLat,lng:finalLng}}));
        window.dispatchEvent(new Event('dest:selected'));
        if(typeof window.onMapInserted === 'function'){ window.onMapInserted(); }
        else if(typeof window.autoScrollTo === 'function'){ window.autoScrollTo('vehicleSection', 250); }
        else {
          const vs = document.getElementById('vehicleSection');
          if(vs) vs.scrollIntoView({behavior:'smooth', block:'start'});
        }
        setTimeout(()=>{ destInput2.dataset.justSelected='false'; }, 1200);
      }
    }catch(e){ console.warn(e); }
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
  window._mapSelected = mapSelected;
}

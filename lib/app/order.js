// order.js - Search driver, estimate, order, pickup
import { supabase } from './supabase.js';
import { TRENGGALEK_BBOX, TARIF, VEHICLE_TYPES, hitungTarif } from './config.js';
import { isInSuruhBbox, isInTrenggalekKab, haversineKm } from './geofence.js';

export let currentNearby = [];
export let currentOrderMeta = {distanceKm:0, cost:0, tripType:'oneway', vehicleType:'motor', pickupLat:null, pickupLng:null, destLat:null, destLng:null};
export let destDebounce = null;
export function setDestDebounce(v){ destDebounce = v; }

export function renderDriverList(drivers){
  const list = document.getElementById('driverList'); if(!list) return;
  const selectedVehicle = document.querySelector('input[name="vehicleType"]:checked')?.value || 'motor';
  let filtered = drivers;
  // filter driver sesuai kendaraan yang dipilih penumpang
  if(selectedVehicle){ filtered = drivers.filter(d => (d.jenis_kendaraan||'motor')===selectedVehicle); }
  if(!filtered?.length){
    // kalau gak ada yang sesuai, tampilkan semua dengan pesan
    if(drivers.length>0){
      list.innerHTML = `<p class="muted" style="font-size:12px">⚠️ Tidak ada driver ${selectedVehicle} online, menampilkan semua:</p>` + drivers.map(d=>{
        const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
        const vehLabel = d.jenis_kendaraan||'motor';
        const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
        return `<div class="driver-card" style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
          <div><b>${d.name}</b> ${vehIcon} ${vehLabel} • ${d.nopol||''} • ${(d.distance_km||0).toFixed(2)} km<br/><span class="muted" style="font-size:11px">${d.tipe_motor||''}</span></div>
          <div class="row" style="gap:6px"><button class="btn primary" data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}">✅ Pesan ${vehIcon}</button>${wa?`<a class="btn secondary" href="${wa}" target="_blank">💬 WA</a>`:''}</div>
        </div>`;
      }).join('');
      return;
    }
    list.innerHTML = '<p class="muted">Tidak ada driver online.</p>'; return;
  }
  list.innerHTML = filtered.map(d=>{
    const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
    const vehLabel = d.jenis_kendaraan||'motor';
    const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
    return `<div class="driver-card" style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
      <div><b>${d.name}</b> ${vehIcon} ${vehLabel} • ${d.nopol||''} • ${(d.distance_km||d.distance||0).toFixed? (d.distance_km||0).toFixed(2)+' km' : ''}<br/><span class="muted" style="font-size:11px">${d.tipe_motor||''} • ${vehLabel}</span></div>
      <div class="row" style="gap:6px"><button class="btn primary" data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}">✅ Pesan ${vehIcon}</button>${wa?`<a class="btn secondary" href="${wa}" target="_blank">💬 WA</a>`:''}</div>
    </div>`;
  }).join('');
}

export async function searchNearby(){
  const radius = 5000; const info = document.getElementById('searchInfo'); const list = document.getElementById('driverList');
  if(info) info.textContent = 'Mencari driver...'; if(list) list.innerHTML='🔍 Mencari...';
  try{
    let myLat=null, myLng=null;
    try{
      const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:5000}));
      myLat=pos.coords.latitude; myLng=pos.coords.longitude;
      if(!isInSuruhBbox(myLat,myLng)){
        if(info) info.textContent='⛔ Kamu di luar Kecamatan Suruh';
        if(list) list.innerHTML='<div class="card" style="border:1px solid #ef4444">⛔ Lokasi kamu di luar wilayah Kecamatan Suruh, Trenggalek.</div>';
        return;
      }
    }catch(e){ if(info) info.textContent='Aktifkan GPS'; return; }
    const { data, error } = await supabase.rpc('find_nearby_drivers', { lat: myLat, lng: myLng, radius_meters: radius, limit_count: 10 });
    let drivers=[];
    if(!error && data && data.length>0){ drivers=data; if(info) info.textContent=`✅ ${drivers.length} driver terdekat`; }
    else {
      const { data: locs } = await supabase.from('driver_locations').select('*').order('updated_at',{ascending:false}).limit(20);
      if(locs && locs.length>0){
        const ids=locs.map(l=>l.driver_id);
        const { data: users } = await supabase.from('users').select('*').in('id', ids).eq('status','online');
        drivers=locs.map(l=>{ const u=users?.find(x=>x.id===l.driver_id); return u? {...u,...l,driver_id:l.driver_id}:null; }).filter(Boolean);
        if(info) info.textContent=`✅ ${drivers.length} driver online`;
      } else { if(info) info.textContent='❌ Tidak ada driver online'; }
    }
    currentNearby=drivers; renderDriverList(drivers);
  }catch(e){ if(info) info.textContent='Error: '+e.message; }
}

export async function geocodeAddress(q){
  try{ const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=id`); const data=await resp.json(); if(data && data[0]) return {lat:parseFloat(data[0].lat), lng:parseFloat(data[0].lon)}; }catch(e){} return null;
}

export async function searchDestLive(q, mapModule){
  const box=document.getElementById('destSuggestions');
  const badge=document.getElementById('destLive');
  const raw=(q||'').trim();
  if(!raw || raw.length<1){ if(box) box.style.display='none'; if(badge) badge.textContent='🔍 ketik 1 huruf'; return; }
  if(badge) badge.textContent='🔍 mencari...';
  const viewbox = `${TRENGGALEK_BBOX.minLng},${TRENGGALEK_BBOX.minLat},${TRENGGALEK_BBOX.maxLng},${TRENGGALEK_BBOX.maxLat}`;
  let results=[];
  try{
    const q1 = raw.toLowerCase().includes('trenggalek') ? raw : raw + ' Trenggalek';
    const resp1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q1)}&limit=15&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`);
    results = await resp1.json()||[];
    if(results.length < 3){
      const resp2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}&limit=15&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`);
      const r2 = await resp2.json()||[];
      const seen = new Set(results.map(r=>r.place_id));
      for(let x of r2){ if(!seen.has(x.place_id)){ results.push(x); seen.add(x.place_id); } }
    }
    const inside = results.filter(r=> isInTrenggalekKab(parseFloat(r.lat), parseFloat(r.lon)) || (r.display_name||'').toLowerCase().includes('trenggalek'));
    const outside = results.filter(r=> !inside.includes(r));
    results = [...inside, ...outside].slice(0,15);
  }catch(e){}
  if(!box) return;
  if(results.length===0){
    box.innerHTML=`<div style="padding:10px"><span class="muted" style="font-size:12px">Tidak ada di map Trenggalek</span><div style="margin-top:8px"><button class="btn primary" style="padding:6px 10px;font-size:12px" id="btnUseManualDest">Pakai "${raw}"</button></div></div>`;
    box.style.display='block'; if(badge) badge.textContent='⚠️ manual';
    const btn=document.getElementById('btnUseManualDest');
    if(btn) btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); const di=document.getElementById('dest'); di.dataset.lat=''; di.dataset.lng=''; box.style.display='none'; box.innerHTML=''; di.blur(); clearTimeout(destDebounce); if(badge) badge.textContent='📍 manual'; updateOrderEstimate(); };
    return;
  }
  const seen=new Set(); const uniq=[];
  for(let d of results){ if(!seen.has(d.display_name)){ seen.add(d.display_name); uniq.push(d);} }
  box.innerHTML=uniq.map(d=>{
    const parts=d.display_name.split(','); const title=parts.slice(0,2).join(', '); const sub=parts.slice(2,4).join(', ');
    const inKab = isInTrenggalekKab(parseFloat(d.lat), parseFloat(d.lon));
    const badgeKab = inKab ? '<span style="background:#16a34a;color:white;font-size:9px;padding:2px 5px;border-radius:4px;margin-left:6px">TRENGGALEK</span>' : '<span style="background:#ef4444;color:white;font-size:9px;padding:2px 5px;border-radius:4px;margin-left:6px">LUAR</span>';
    return `<div class="suggest-item" data-lat="${d.lat}" data-lon="${d.lon}" data-display="${d.display_name.replace(/"/g,'&quot;')}" style="padding:10px;border-bottom:1px solid #1e293b;cursor:pointer"><b style="font-size:13px">${title}</b>${badgeKab}<br/><span class="muted" style="font-size:11px">${sub}</span></div>`;
  }).join('');
  box.style.display='block'; if(badge) badge.textContent=`✅ ${uniq.length} hasil`;
  box.querySelectorAll('.suggest-item').forEach(el=>{
    el.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      const lat = parseFloat(el.getAttribute('data-lat')); const lon = parseFloat(el.getAttribute('data-lon'));
      if(!isInTrenggalekKab(lat,lon)){ alert('⛔ Lokasi di luar Kabupaten Trenggalek'); return; }
      const di=document.getElementById('dest');
      const display = el.getAttribute('data-display');
      const parts = display.split(',').map(s=>s.trim()).filter(Boolean);
      let clean = parts.slice(0,3).join(', ');
      if(clean.length < 5) clean = parts.slice(0,4).join(', ');
      di.value=clean;
      di.dataset.lat=el.getAttribute('data-lat'); di.dataset.lng=el.getAttribute('data-lon');
      box.style.display='none'; box.innerHTML='';
      if(badge) badge.textContent='📍 Trenggalek ✅'; di.blur(); clearTimeout(destDebounce);
      if(mapModule){ mapModule.mapSelected.lat=lat; mapModule.mapSelected.lng=lon; mapModule.mapSelected.address=clean; mapModule.mapSelected.inTrenggalek=true; }
      updateOrderEstimate();
    };
  });
}

export async function updateOrderEstimate(){
  const pickupInput=document.getElementById('pickup'); const destInput=document.getElementById('dest');
  const tripType=document.querySelector('input[name="tripType"]:checked')?.value||'oneway';
  const vehicleType=document.querySelector('input[name="vehicleType"]:checked')?.value||'motor';
  const card=document.getElementById('estimateCard'); const distEl=document.getElementById('estDistance'); const costEl=document.getElementById('estCost'); const typeEl=document.getElementById('estTripType'); const vehEl=document.getElementById('estVehicle'); const btnOrder=document.getElementById('btnOrder');
  if(!destInput?.value){ alert('Isi tujuan dulu'); return; }
  const pickupLat=parseFloat(pickupInput?.dataset.lat); const pickupLng=parseFloat(pickupInput?.dataset.lng);
  let pLat=pickupLat, pLng=pickupLng;
  if(!pLat||!pLng){
    try{ const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:5000})); pLat=pos.coords.latitude; pLng=pos.coords.longitude; }catch(e){ alert('Aktifkan GPS dulu'); return; }
  }
  distEl.textContent='Menghitung...'; costEl.textContent='...'; if(card) card.style.display='block';
  let geoDest=null; const dLat=parseFloat(destInput?.dataset.lat); const dLng=parseFloat(destInput?.dataset.lng);
  if(dLat&&dLng){ geoDest={lat:dLat, lng:dLng}; } else { geoDest=await geocodeAddress(destInput.value); }
  let distance=0;
  if(geoDest){
    if(!isInTrenggalekKab(geoDest.lat, geoDest.lng)){ alert('⛔ Tujuan di luar Kabupaten Trenggalek'); return; }
    distance=haversineKm(pLat,pLng,geoDest.lat,geoDest.lng); currentOrderMeta.destLat=geoDest.lat; currentOrderMeta.destLng=geoDest.lng;
  } else { distance=3.5; }
  currentOrderMeta.pickupLat=pLat; currentOrderMeta.pickupLng=pLng; currentOrderMeta.distanceKm=distance; currentOrderMeta.tripType=tripType; currentOrderMeta.vehicleType=vehicleType;
  // hitung tarif dari config.js sesuai jenis kendaraan
  const cost = hitungTarif(distance, vehicleType, tripType);
  currentOrderMeta.cost=cost;
  const vehInfo = VEHICLE_TYPES[vehicleType]||VEHICLE_TYPES.motor;
  const t = TARIF[vehicleType]||TARIF.motor;
  distEl.textContent=distance.toFixed(2)+' km'; typeEl.textContent=tripType==='roundtrip'?'Pulang-Pergi (x1.6)':'Antar Saja'; if(vehEl) vehEl.textContent=`${vehInfo.icon} ${vehInfo.label} Rp ${t.perKm}/km`; costEl.textContent='Rp '+cost.toLocaleString('id-ID');
  if(btnOrder) btnOrder.style.display='block';
  const si=document.getElementById('searchInfo'); if(si) si.textContent=`Estimasi: ${distance.toFixed(2)} km • ${typeEl.textContent} • ${vehInfo.icon} ${vehInfo.label} • Rp ${cost.toLocaleString('id-ID')}`;
  // re-render driver list agar filter kendaraan
  if(currentNearby.length>0) renderDriverList(currentNearby);
}

export async function createOrder(driverId=null, currentProfile){
  const pickup=document.getElementById('pickup')?.value||'Lokasi saya'; const dest=document.getElementById('dest')?.value; if(!dest) return alert('Isi tujuan');
  if(currentOrderMeta.pickupLat && !isInSuruhBbox(currentOrderMeta.pickupLat, currentOrderMeta.pickupLng)){ alert('⛔ Pickup di luar Kecamatan Suruh'); return; }
  if(currentOrderMeta.destLat && currentOrderMeta.destLng){
    if(!isInTrenggalekKab(currentOrderMeta.destLat, currentOrderMeta.destLng)){ alert('⛔ Tujuan di luar Kabupaten Trenggalek'); return; }
  }
  if(currentOrderMeta.distanceKm===0) await updateOrderEstimate();
  if(currentOrderMeta.distanceKm===0) return;
  const {tripType, cost, distanceKm, vehicleType}=currentOrderMeta;
  try{
    const payload={ passenger_id:currentProfile.id, driver_id:driverId, pickup_text:pickup, dest_text:dest, pickup_lat:currentOrderMeta.pickupLat, pickup_lng:currentOrderMeta.pickupLng, dest_lat:currentOrderMeta.destLat, dest_lng:currentOrderMeta.destLng, distance_km:distanceKm, trip_type:tripType, vehicle_type:vehicleType, estimated_cost:cost, status: driverId?'pending':'searching' };
    const { data, error }=await supabase.from('orders').insert(payload).select().single(); if(error) throw error;
    // Trigger push ke driver via Edge Function (jika sudah deploy) - non-blocking
    try{
      // panggil edge function send-push, kalau belum ada akan fail silently
      supabase.functions.invoke('send-push', { body: { order_id: data.id } }).then(r=>console.log('push invoked', r)).catch(()=>{});
    }catch(_){}
    // Fallback realtime sudah handle di push.js
    alert(`Order dibuat! ${pickup} -> ${dest} • ${vehicleType} Rp ${cost.toLocaleString('id-ID')}`);
  }catch(err){ alert(`Estimasi: ${currentOrderMeta.distanceKm.toFixed(2)}km • ${currentOrderMeta.tripType} • ${currentOrderMeta.vehicleType} • Rp ${currentOrderMeta.cost.toLocaleString('id-ID')}`); }
}

export async function refreshPickupField(){
  const pickupInput=document.getElementById('pickup'); const badge=document.getElementById('pickupLive'); const myLoc=document.getElementById('myLoc');
  if(!pickupInput) return; if(badge) badge.textContent='📡 mencari...'; pickupInput.placeholder='Mendeteksi lokasi...';
  try{
    const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:8000, maximumAge:0}));
    const lat=pos.coords.latitude; const lng=pos.coords.longitude; const acc=pos.coords.accuracy;
    let address=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try{
      const resp=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data=await resp.json();
      if(data && data.display_name){ const a=data.address; const short=[a.village||a.hamlet||a.suburb||'', a.road||a.neighbourhood||'', a.county||''].filter(Boolean).join(', '); address=short||data.display_name.split(',').slice(0,3).join(', '); }
    }catch(e){}
    const inSuruh = isInSuruhBbox(lat,lng);
    pickupInput.value=address + (inSuruh?'':' (DI LUAR SURUH)'); pickupInput.dataset.lat=lat; pickupInput.dataset.lng=lng; pickupInput.dataset.acc=acc;
    if(myLoc) myLoc.textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)} • ${acc.toFixed(0)}m ${inSuruh?'✅ Suruh':'⛔ Luar Suruh'}`;
    if(badge) badge.textContent=inSuruh?`📍 live • ${acc.toFixed(0)}m ✅ Suruh`:`⛔ Luar Suruh`;
    if(!inSuruh){ setTimeout(()=>alert('⛔ Di luar wilayah Kecamatan Suruh'),300); }
  }catch(err){ if(badge) badge.textContent='❌ GPS off'; pickupInput.placeholder='Aktifkan GPS - tap 📍'; if(myLoc) myLoc.textContent='GPS tidak aktif: '+err.message; }
}

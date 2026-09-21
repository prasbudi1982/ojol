// order.js - FIX FINAL - Tombol order penumpang -> driver 100% benar
import { supabase } from './supabase.js';
import * as tracking from './tracking.js';
import { TRENGGALEK_BBOX, TARIF, VEHICLE_TYPES, hitungTarif, ACTIVE_KECAMATAN_NAME } from './config.js';
import { isInSuruhBbox, isInTrenggalekKab, haversineKm, getActiveKecamatanName } from './geofence.js';

export let currentNearby = [];
export let currentOrderMeta = {distanceKm:0, cost:0, tripType:'oneway', vehicleType:'motor', pickupLat:null, pickupLng:null, destLat:null, destLng:null};
export let destDebounce = null;
export function setDestDebounce(v){ destDebounce = v; }

export function renderDriverList(drivers){
  const list = document.getElementById('driverList'); if(!list) return;
  const selectedVehicle = document.querySelector('input[name="vehicleType"]:checked')?.value || 'motor';
  let filtered = drivers;
  if(selectedVehicle){ filtered = drivers.filter(d => (d.jenis_kendaraan||'motor')===selectedVehicle); }
  if(!filtered?.length){
    if(drivers.length>0){
      list.innerHTML = `<p class="muted" style="font-size:12px">⚠️ Tidak ada driver ${selectedVehicle} online di ${ACTIVE_KECAMATAN_NAME||'Suruh'}, menampilkan semua:</p>` + drivers.map(d=>{
        const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
        const vehLabel = d.jenis_kendaraan||'motor';
        const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
        return `<div class="driver-card" style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;justify-content:space-between">
          <div><b>${d.name}</b> ${vehIcon} ${vehLabel} • ${d.nopol||''} • ${(d.distance_km||0).toFixed(2)} km<br/><span class="muted" style="font-size:11px">${d.tipe_motor||''}</span></div>
          <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary" data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}">✅ Pesan ${vehIcon}</button>${wa?`<a class="btn secondary" href="${wa}" target="_blank">💬 WA</a>`:''}<button data-report-user="${d.driver_id||d.id}" data-report-name="${d.name}" data-report-role="driver" class="btn secondary" style="background:#fef2f2;border-color:#fecaca;font-size:10px">🚩</button></div>
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
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary" data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}">✅ Pesan ${vehIcon}</button>${wa?`<a class="btn secondary" href="${wa}" target="_blank">💬 WA</a>`:''}<button data-report-user="${d.driver_id||d.id}" data-report-name="${d.name}" data-report-role="driver" class="btn secondary" style="background:#fef2f2;border-color:#fecaca;font-size:10px">🚩</button></div>
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
        const kecName = getActiveKecamatanName ? getActiveKecamatanName() : (ACTIVE_KECAMATAN_NAME||'Suruh');
        if(info) info.textContent=`⛔ Kamu di luar Kecamatan ${kecName}`;
        if(list) list.innerHTML=`<div class="card" style="border:1px solid #ef4444">⛔ Lokasi kamu di luar wilayah Kecamatan ${kecName}, Trenggalek.</div>`;
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
    if(!results.length){ if(box) box.style.display='none'; if(badge) badge.textContent='❌ tidak ditemukan'; return; }
    if(box){
      box.style.display='block';
      box.innerHTML = results.filter(r=> isInTrenggalekKab(parseFloat(r.lat), parseFloat(r.lon))).map(r=>{
        const lat=parseFloat(r.lat); const lon=parseFloat(r.lon);
        const label=r.display_name; const short=label.split(',').slice(0,3).join(',');
        return `<div class="suggestion" data-lat="${lat}" data-lon="${lon}" data-label="${label.replace(/"/g,'&quot;')}" style="padding:8px;border-bottom:1px solid #eee;cursor:pointer">📍 ${short}</div>`;
      }).join('') || '<div style="padding:8px">⛔ Di luar Trenggalek</div>';
    }
    if(badge) badge.textContent=`${results.length} hasil`;
    if(box){
      box.querySelectorAll('.suggestion').forEach(el=>{
        el.onclick=()=>{
          const lat=parseFloat(el.dataset.lat); const lon=parseFloat(el.dataset.lon); const label=el.dataset.label;
          const di=document.getElementById('dest'); if(!di) return;
          const clean=label.split(',').slice(0,4).join(',').slice(0,140);
          di.value=clean; di.dataset.lat=lat; di.dataset.lng=lon;
          box.style.display='none'; box.innerHTML='';
          if(badge) badge.textContent='📍 Trenggalek ✅'; di.blur(); clearTimeout(destDebounce);
          if(mapModule){ mapModule.mapSelected.lat=lat; mapModule.mapSelected.lng=lon; mapModule.mapSelected.address=clean; mapModule.mapSelected.inTrenggalek=true; }
          updateOrderEstimate();
        };
      });
    }
  }catch(e){ if(badge) badge.textContent='Error'; }
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
  const cost = hitungTarif(distance, vehicleType, tripType);
  currentOrderMeta.cost=cost;
  const vehInfo = VEHICLE_TYPES[vehicleType]||VEHICLE_TYPES.motor;
  const t = TARIF[vehicleType]||TARIF.motor;
  distEl.textContent=distance.toFixed(2)+' km'; typeEl.textContent=tripType==='roundtrip'?'Pulang-Pergi (x1.6)':'Antar Saja'; if(vehEl) vehEl.textContent=`${vehInfo.icon} ${vehInfo.label} Rp ${t.perKm}/km`; costEl.textContent='Rp '+cost.toLocaleString('id-ID');
  if(btnOrder) btnOrder.style.display='block';
  const si=document.getElementById('searchInfo'); if(si) si.textContent=`Estimasi: ${distance.toFixed(2)} km • ${typeEl.textContent} • ${vehInfo.icon} ${vehInfo.label} • Rp ${cost.toLocaleString('id-ID')}`;
  if(currentNearby.length>0) renderDriverList(currentNearby);
}

// === FIX UTAMA DI SINI ===
export async function createOrder(driverId=null, currentProfile){
  const pickup=document.getElementById('pickup')?.value||'Lokasi saya'; const dest=document.getElementById('dest')?.value; if(!dest) return alert('Isi tujuan');
  if(currentOrderMeta.pickupLat && !isInSuruhBbox(currentOrderMeta.pickupLat, currentOrderMeta.pickupLng)){ alert('⛔ Pickup di luar Kecamatan '+ (ACTIVE_KECAMATAN_NAME||'Suruh')); return; }
  if(currentOrderMeta.destLat && currentOrderMeta.destLng){
    if(!isInTrenggalekKab(currentOrderMeta.destLat, currentOrderMeta.destLng)){ alert('⛔ Tujuan di luar Kabupaten Trenggalek'); return; }
  }
  if(currentOrderMeta.distanceKm===0) await updateOrderEstimate();
  if(currentOrderMeta.distanceKm===0) return;
  const {tripType, cost, distanceKm, vehicleType}=currentOrderMeta;
  const btnOrder = document.getElementById('btnOrder');
  if(btnOrder){ btnOrder.disabled=true; btnOrder.textContent='⏳ Mengirim...'; }
  try{
    // Payload lengkap
    const fullPayload={ 
      passenger_id:currentProfile.id, 
      driver_id:driverId||null,
      pickup_text:pickup, 
      dest_text:dest, 
      pickup_lat:currentOrderMeta.pickupLat, 
      pickup_lng:currentOrderMeta.pickupLng, 
      dest_lat:currentOrderMeta.destLat, 
      dest_lng:currentOrderMeta.destLng, 
      distance_km:distanceKm, 
      trip_type:tripType, 
      vehicle_type:vehicleType, 
      estimated_cost:cost, 
      status: driverId?'pending':'searching',
      created_at: new Date().toISOString()
    };
    console.log('Creating order', fullPayload);
    let data, error;
    // Coba insert lengkap dulu
    const res = await supabase.from('orders').insert(fullPayload).select().single();
    data = res.data; error = res.error;
    
    // Jika error karena kolom belum ada (schema cache), coba payload minimal
    if(error && (error.message.includes('dest_lat') || error.message.includes('pickup_lat') || error.message.includes('schema cache'))){
      console.warn('Kolom lat/lng belum ada, coba payload minimal', error.message);
      const minimalPayload = {
        passenger_id: currentProfile.id,
        driver_id: driverId||null,
        pickup_text: pickup,
        dest_text: dest,
        pickup_lat: currentOrderMeta.pickupLat,
        pickup_lng: currentOrderMeta.pickupLng,
        dest_lat: currentOrderMeta.destLat,
        dest_lng: currentOrderMeta.destLng,
        distance_km: distanceKm,
        trip_type: tripType,
        vehicle_type: vehicleType,
        estimated_cost: cost,
        status: driverId?'pending':'searching'
      };
      // Hapus created_at untuk kompatibilitas, dan coba tanpa lat/lng jika masih error
      const res2 = await supabase.from('orders').insert(minimalPayload).select().single();
      if(res2.error && res2.error.message.includes('dest_lat')){
        console.warn('Masih error dest_lat, coba tanpa koordinat');
        const ultraMinimal = {
          passenger_id: currentProfile.id,
          driver_id: driverId||null,
          pickup_text: pickup,
          dest_text: dest,
          distance_km: distanceKm,
          trip_type: tripType,
          vehicle_type: vehicleType,
          estimated_cost: cost,
          status: driverId?'pending':'searching'
        };
        const res3 = await supabase.from('orders').insert(ultraMinimal).select().single();
        data = res3.data; error = res3.error;
      } else {
        data = res2.data; error = res2.error;
      }
    }
    if(error) throw error;
    
    // 1. Trigger push via Edge Function - WAJIB untuk driver yang HP terkunci
    try{
      const { data: pushData, error: pushError } = await supabase.functions.invoke('send-push', { 
        body: { 
          order_id: data.id,
          driver_id: driverId||null,
          vehicle_type: vehicleType
        } 
      });
      console.log('push invoked', pushData, pushError);
    }catch(pushErr){
      console.warn('Push function belum deploy atau error (abaikan jika pakai realtime)', pushErr);
    }

    // 2. Broadcast via Supabase Realtime (backup)
    // channel orders akan otomatis diterima driver via push.js
    
    alert(`✅ Order terkirim! ${pickup} -> ${dest} • ${vehicleType} Rp ${cost.toLocaleString('id-ID')}\n${driverId ? 'Menunggu konfirmasi driver...' : 'Mencari driver terdekat...'}`);
    
    // Reset atau redirect
    if(btnOrder){ btnOrder.textContent='✅ Terkirim'; setTimeout(()=>{ btnOrder.disabled=false; btnOrder.textContent='🚀 Order Sekarang'; }, 2000); }
    
        // Mulai tracking realtime
    try{ tracking.startTracking(data.id); }catch(e){ console.warn('tracking start fail', e); }
    return data;
  }catch(err){ 
    console.error('createOrder error', err);
    alert('❌ Gagal buat order: '+(err.message||err));
    if(btnOrder){ btnOrder.disabled=false; btnOrder.textContent='🚀 Order Sekarang'; }
  }
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
    pickupInput.value=address + (inSuruh?'':' (DI LUAR '+ (ACTIVE_KECAMATAN_NAME||'SURUH')+')'); pickupInput.dataset.lat=lat; pickupInput.dataset.lng=lng; pickupInput.dataset.acc=acc;
    if(myLoc) myLoc.textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)} • ${acc.toFixed(0)}m ${inSuruh?'✅ '+ (ACTIVE_KECAMATAN_NAME||'Suruh'):'⛔ Luar'}`;
    if(badge) badge.textContent=inSuruh?`📍 live • ${acc.toFixed(0)}m ✅ ${ACTIVE_KECAMATAN_NAME||'Suruh'}`:`⛔ Luar ${ACTIVE_KECAMATAN_NAME||'Suruh'}`;
    if(!inSuruh){ setTimeout(()=>alert('⛔ Di luar wilayah Kecamatan '+(ACTIVE_KECAMATAN_NAME||'Suruh')),300); }
  }catch(err){ if(badge) badge.textContent='❌ GPS off'; pickupInput.placeholder='Aktifkan GPS - tap 📍'; if(myLoc) myLoc.textContent='GPS tidak aktif: '+err.message; }
}

// ===== VIEW PASSENGER - di dalam modul order (penting) =====
export function viewPassenger(currentProfile){
  return `<div class="card"><h3>🧍 Order Ojol - ${currentProfile?.name||''}</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
  <label>Pickup <span class="muted" style="font-size:10px" id="pickupLive">📡 live</span>
    <div class="row" style="gap:8px;align-items:center"><input id="pickup" placeholder="Lokasi jemput..." style="flex:4;min-width:0"><button id="btnRefreshPickup" class="btn secondary" style="flex:0 0 48px;padding:8px 0">📍</button></div>
  </label>
  <label>Tujuan <span class="muted" style="font-size:10px" id="destLive">🔍 ketik 1 huruf</span>
    <div class="row" style="gap:8px;align-items:center"><input id="dest" placeholder="Ketik tujuan di Trenggalek..." style="flex:4;min-width:0"><button id="btnOpenMap" class="btn secondary" style="flex:0 0 64px;padding:8px 0">🗺️ Map</button></div>
    <div id="destSuggestions" style="display:none;max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:8px;margin-top:6px;background:#0f172a"></div>
  </label>
  <label>Pilih Kendaraan</label>
  <div class="row" style="gap:8px;margin-top:6px">
    <label style="flex:1;border:2px solid #22c55e;border-radius:12px;padding:10px;text-align:center;cursor:pointer;background:rgba(34,197,94,0.1)" id="labelMotor"><input type="radio" name="vehicleType" value="motor" checked style="display:none"><span style="font-size:20px">🏍️</span><br/><b>Motor</b><br/><span class="muted" style="font-size:10px">Hemat • Rp 2.500/km</span></label>
    <label style="flex:1;border:1px solid #334155;border-radius:12px;padding:10px;text-align:center;cursor:pointer" id="labelMobil"><input type="radio" name="vehicleType" value="mobil" style="display:none"><span style="font-size:20px">🚗</span><br/><b>Mobil</b><br/><span class="muted" style="font-size:10px">Nyaman • Rp 5.500/km</span></label>
  </div>
  <div class="row" style="margin-top:8px"><label style="flex:1"><input type="radio" name="tripType" value="oneway" checked> Antar Saja</label><label style="flex:1"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
  <div id="estimateCard" style="display:none;margin-top:12px;border:1px dashed #475569;padding:10px;border-radius:8px"><p style="font-size:12px">Jarak: <b id="estDistance">-</b> • <span id="estTripType">-</span> • <span id="estVehicle">-</span> • Biaya: <b id="estCost">-</b></p><p class="muted" id="searchInfo" style="font-size:11px"></p></div>
  <button id="btnOrder" class="btn primary" style="display:none;margin-top:12px">🚀 Order Sekarang</button>
  <div id="driverList" style="margin-top:12px"></div>
  <div id="activeOrderCard" style="display:none;margin-top:16px" class="card tracking-card"></div>
  </div>`;
}

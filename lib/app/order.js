// order.js - FIX FINAL - Tombol order penumpang -> driver 100% benar
import { supabase } from './supabase.js';
import * as tracking from './tracking.js';
import { TRENGGALEK_BBOX, TARIF, VEHICLE_TYPES, hitungTarif, ACTIVE_KECAMATAN_NAME } from './config.js';
import { isInSuruhBbox, isInTrenggalekKab, haversineKm, getActiveKecamatanName } from './geofence.js';

export let currentNearby = [];
export let currentOrderMeta = {distanceKm:0, cost:0, tripType:'oneway', vehicleType:'motor', pickupLat:null, pickupLng:null, destLat:null, destLng:null};
export let destDebounce = null;
export function setDestDebounce(v){ destDebounce = v; }

export async function fetchDriverRatings(driverIds){
  const ratingsMap = {};
  try{
    if(!driverIds || driverIds.length===0) return ratingsMap;
    const { data, error } = await supabase.from('ratings').select('driver_id, rating').in('driver_id', driverIds);
    if(!error && data){
      const grouped = {};
      data.forEach(r=>{ if(!grouped[r.driver_id]) grouped[r.driver_id]=[]; grouped[r.driver_id].push(r.rating); });
      Object.keys(grouped).forEach(id=>{
        const arr = grouped[id];
        const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
        ratingsMap[id] = { avg: avg.toFixed(1), count: arr.length };
      });
    }
  }catch(e){}
  try{
    const local = JSON.parse(localStorage.getItem('local_ratings')||'[]');
    const localGrouped = {};
    local.forEach(r=>{
      if(!driverIds.includes(r.driver_id)) return;
      if(!localGrouped[r.driver_id]) localGrouped[r.driver_id]=[];
      localGrouped[r.driver_id].push(r.rating);
    });
    Object.keys(localGrouped).forEach(id=>{
      if(ratingsMap[id]) return;
      const arr = localGrouped[id];
      const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
      ratingsMap[id] = { avg: avg.toFixed(1), count: arr.length, local: true };
    });
  }catch(e){}
  return ratingsMap;
}

export async function renderDriverList(drivers){
  const list = document.getElementById('driverList'); if(!list) return;
  const selectedVehicle = document.querySelector('input[name="vehicleType"]:checked')?.value || 'motor';
  // FIX: hanya driver, tolak admin & passenger - tetap tampilkan driver walau nopol belum lengkap (rating & WA tetap penting)
  let driversOnly = drivers.filter(d=> {
    const role = (d.role||'').toLowerCase();
    return role==='driver';
  });
  let filtered = driversOnly;
  if(selectedVehicle){ filtered = driversOnly.filter(d => (d.jenis_kendaraan||'motor')===selectedVehicle); }
  const driverIds = (filtered.length ? filtered : driversOnly).map(d=> d.driver_id||d.id).filter(Boolean);
  const ratingsMap = await fetchDriverRatings(driverIds);
  
  const renderCard = (d)=>{
    const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
    const vehLabel = d.jenis_kendaraan||'motor';
    const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
    const r = ratingsMap[d.driver_id||d.id];
    const ratingText = r ? `${r.avg}` : `Baru`;
    const ratingCount = r ? `(${r.count})` : '';
    const ratingBg = r ? (parseFloat(r.avg)>=4.5 ? '#22c55e' : parseFloat(r.avg)>=4.0 ? '#f59e0b' : '#475569') : '#334155';
    const dist = (d.distance_km||d.distance||0).toFixed ? (d.distance_km||0).toFixed(2) : (d.distance||0);
    return `
    <div style="background:#151c25;border:1px solid #263240;border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;font-size:14px;color:#e6edf5;letter-spacing:0.2px">${d.name}</span>
          <span style="background:#1d2633;border:1px solid #263240;padding:3px 8px;border-radius:8px;font-size:10px;color:#8aa0b8">${vehIcon} ${vehLabel.toUpperCase()}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="background:${ratingBg};color:${r && parseFloat(r.avg)>=4.0 ? '#052e16' : 'white'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:4px">⭐ ${ratingText} <span style="font-weight:600;opacity:0.9;font-size:10px">${ratingCount}</span></span>
          <span style="font-size:11px;color:#8aa0b8">${d.nopol||''} • ${dist} km • ${d.tipe_motor||'Beat'}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:112px;justify-content:center">
        <button data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}" style="background:#22c55e;color:#052e16;border:none;padding:10px 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(34,197,94,0.3)">✅ Pesan</button>
        <div style="display:flex;gap:6px">
          ${wa?`<a href="${wa}" target="_blank" style="flex:1;background:#1d2633;border:1px solid #263240;color:#e6edf5;padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>`:''}
          <button data-report-user="${d.driver_id||d.id}" data-report-name="${d.name}" data-report-role="driver" style="flex:1;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#f87171;padding:8px;border-radius:10px;font-size:12px">🚩</button>
        </div>
      </div>
    </div>`;
  };

  if(!filtered?.length){
    if(driversOnly.length>0){
      list.innerHTML = `<p style="font-size:11px;color:#fbbf24;margin-bottom:8px">⚠️ Tidak ada driver ${selectedVehicle} online di Suruh, menampilkan semua:</p>` + driversOnly.map(renderCard).join('');
      return;
    }
    list.innerHTML = '<div style="background:#1d2633;border:1px dashed #263240;border-radius:12px;padding:16px;text-align:center;color:#8aa0b8;font-size:12px">Tidak ada driver online</div>'; return;
  }
  list.innerHTML = filtered.map(renderCard).join('');
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
    
    let drivers=[];
    
    // LEVEL 1: RPC find_nearby_drivers
    try{
      const { data, error } = await supabase.rpc('find_nearby_drivers', { lat: myLat, lng: myLng, radius_meters: radius, limit_count: 10 });
      if(!error && data && data.length>0){
        drivers = data.filter(d=> (d.role||'').toLowerCase()==='driver');
        // Hitung jarak jika belum ada
        drivers = drivers.map(d=>{
          if(!d.distance_km && d.lat && d.lng){
            try{ d.distance_km = haversineKm(myLat, myLng, d.lat, d.lng); }catch(e){}
          }
          if(!d.driver_id) d.driver_id = d.id;
          return d;
        }).sort((a,b)=> (a.distance_km||999)-(b.distance_km||999));
        if(info) info.textContent=`✅ ${drivers.length} driver terdekat (RPC)`;
      }
    }catch(e){ console.warn('RPC error', e.message); }
    
    // LEVEL 2: Fallback driver_locations + users
    if(drivers.length===0){
      try{
        const { data: locs } = await supabase.from('driver_locations').select('*').order('updated_at',{ascending:false}).limit(20);
        if(locs && locs.length>0){
          const ids=locs.map(l=>l.driver_id);
          const { data: users } = await supabase.from('users').select('*').in('id', ids).ilike('role','driver');
          // Filter status online (case-insensitive) dan tidak banned
          const onlineUsers = (users||[]).filter(u=>{
            const st = (u.status||'').toLowerCase();
            const role = (u.role||'').toLowerCase();
            return role==='driver' && (st==='online' || st==='active') && !u.is_banned;
          });
          drivers = locs.map(l=>{
            const u = onlineUsers.find(x=>x.id===l.driver_id);
            if(!u) return null;
            let d = {...u, ...l, driver_id:l.driver_id};
            // Parse POINT(lng lat) jika ada
            if(d.lokasi && !d.lat){
              try{
                const m = d.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                if(m){ d.lng=parseFloat(m[1]); d.lat=parseFloat(m[2]); }
              }catch(e){}
            }
            if(d.lat && d.lng){
              try{ d.distance_km = haversineKm(myLat, myLng, d.lat, d.lng); }catch(e){}
            } else {
              d.distance_km = 999;
            }
            return d;
          }).filter(Boolean).sort((a,b)=> (a.distance_km||999)-(b.distance_km||999));
          if(drivers.length>0 && info) info.textContent=`✅ ${drivers.length} driver online (lokasi)`;
        }
      }catch(e){ console.warn('fallback1 error', e.message); }
    }
    
    // LEVEL 3: Fallback langsung users online (tanpa driver_locations) - INI YANG BIKIN DRIVER TAMPIL
    if(drivers.length===0){
      try{
        const { data: onlineUsers } = await supabase.from('users').select('*').ilike('role','driver').limit(20);
        const filtered = (onlineUsers||[]).filter(u=>{
          const st = (u.status||'').toLowerCase();
          const role = (u.role||'').toLowerCase();
          return role==='driver' && (st==='online' || st==='active') && !u.is_banned;
        });
        if(filtered.length>0){
          drivers = filtered.map(u=>{
            let dist = 999;
            try{
              if(u.last_lat && u.last_lng){ dist = haversineKm(myLat, myLng, u.last_lat, u.last_lng); }
              else if(u.lokasi){
                const m = u.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                if(m){ const lng=parseFloat(m[1]); const lat=parseFloat(m[2]); dist = haversineKm(myLat, myLng, lat, lng); }
              }
            }catch(e){}
            return {...u, driver_id:u.id, distance_km:dist, distance:dist};
          }).sort((a,b)=> (a.distance_km||999)-(b.distance_km||999));
          if(info) info.textContent=`✅ ${drivers.length} driver online (tanpa lokasi)`;
        }
      }catch(e){ console.warn('fallback2 error', e.message); }
    }
    
    // Final guard - tolak admin & passenger
    drivers = drivers.filter(d=> (d.role||'').toLowerCase()==='driver');
    
    if(drivers.length===0){
      if(info) info.textContent='❌ Tidak ada driver online di Suruh';
      if(list) list.innerHTML='<div style="background:#1d2633;border:1px dashed #263240;border-radius:12px;padding:16px;text-align:center;color:#8aa0b8;font-size:12px">Tidak ada driver online saat ini<br/><span style="font-size:10px">Driver harus Go Online di halaman Driver</span></div>';
    }
    
    currentNearby=drivers; 
    await renderDriverList(drivers);
  }catch(e){ 
    if(info) info.textContent='Error: '+e.message; 
    console.error('searchNearby error', e);
  }
}

export async function geocodeAddress(q){
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=id&viewbox=${TRENGGALEK_BBOX.minLng},${TRENGGALEK_BBOX.minLat},${TRENGGALEK_BBOX.maxLng},${TRENGGALEK_BBOX.maxLat}&bounded=0`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Language': 'id' } });
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const data = await resp.json();
    if(data && data[0]){
      const lat=parseFloat(data[0].lat); const lng=parseFloat(data[0].lon);
      return {lat, lng, display_name:data[0].display_name};
    }
  }catch(e){ console.warn('geocodeAddress fail', e.message); }
  return null;
}

export async function searchDestLive(q, mapModule){
  const box=document.getElementById('destSuggestions');
  const badge=document.getElementById('destLive');
  const raw=(q||'').trim();
  if(!raw || raw.length<1){ if(box){ box.style.display='none'; box.innerHTML=''; } if(badge) badge.textContent='🔍 ketik tujuan di Trenggalek'; return; }
  // Jika user baru saja memilih dari list, jangan search lagi
  const destInput=document.getElementById('dest');
  if(destInput && destInput.dataset.justSelected==='true'){ return; }
  if(badge) badge.textContent='🔍 mencari di Trenggalek...';
  const viewbox = `${TRENGGALEK_BBOX.minLng},${TRENGGALEK_BBOX.minLat},${TRENGGALEK_BBOX.maxLng},${TRENGGALEK_BBOX.maxLat}`;
  let results=[];
  try{
    // Query 1: tambah Trenggalek untuk akurasi
    const q1 = raw.toLowerCase().includes('trenggalek') ? raw : raw + ' Trenggalek';
    const resp1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q1)}&limit=10&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`, { headers:{'Accept':'application/json'} });
    if(resp1.ok){ results = await resp1.json()||[]; }
    // Query 2: jika hasil kurang, coba tanpa tambahan Trenggalek
    if(results.length < 3){
      try{
        const resp2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}&limit=10&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`, { headers:{'Accept':'application/json'} });
        if(resp2.ok){
          const r2 = await resp2.json()||[];
          const seen = new Set(results.map(r=>r.place_id));
          for(let x of r2){ if(!seen.has(x.place_id)){ results.push(x); } }
        }
      }catch(e){}
    }
    if(!results.length){ 
      if(box){ box.style.display='block'; box.innerHTML='<div style="padding:10px;color:#fbbf24;font-size:11px">❌ Tujuan tidak ditemukan di Trenggalek<br/>Coba kata kunci lain atau pakai tombol 🗺️ Map</div>'; } 
      if(badge) badge.textContent='❌ tidak ditemukan - harus di Trenggalek'; 
      return; 
    }
    // ATURAN: tujuan hanya boleh di wilayah Trenggalek - filter ketat
    const filtered = results.filter(r=>{
      try{ return isInTrenggalekKab(parseFloat(r.lat), parseFloat(r.lon)); }catch(e){ return false; }
    });
    if(!filtered.length){
      if(box){ box.style.display='block'; box.innerHTML='<div style="padding:10px;color:#ef4444;font-size:11px">⛔ Hasil di luar Kabupaten Trenggalek<br/>Tujuan hanya boleh di wilayah Trenggalek<br/><small>Coba tambah kata "Trenggalek"</small></div>'; }
      if(badge) badge.textContent='⛔ di luar Trenggalek - harus di Trenggalek';
      return;
    }
    const displayResults = filtered.slice(0,8);
    if(box){
      box.style.display='block';
      box.innerHTML = displayResults.map(r=>{
        const lat=parseFloat(r.lat); const lon=parseFloat(r.lon);
        const label=r.display_name; 
        const short=label.split(',').slice(0,3).join(',');
        const safeLabel = label.replace(/"/g,'&quot;');
        return `<div class="suggestion" data-lat="${lat}" data-lon="${lon}" data-label="${safeLabel}" style="padding:10px;border-bottom:1px solid #1e293b;cursor:pointer;color:#e2e8f0">📍 ${short}</div>`;
      }).join('');
    }
    if(badge) badge.textContent=`${displayResults.length} hasil di Trenggalek ✅`;
    if(box){
      box.querySelectorAll('.suggestion').forEach(el=>{
        el.onclick=(e)=>{
          e.preventDefault(); e.stopPropagation();
          const lat=parseFloat(el.dataset.lat); const lon=parseFloat(el.dataset.lon); const label=el.dataset.label;
          const di=document.getElementById('dest'); if(!di) return;
          // ATURAN TETAP: validasi Trenggalek
          if(!isInTrenggalekKab(lat, lon)){
            alert('⛔ Tujuan di luar Kabupaten Trenggalek - pilih yang di Trenggalek');
            return;
          }
          const clean=label.split(',').slice(0,4).join(',').slice(0,140);
          di.value=clean; 
          di.dataset.lat=lat; di.dataset.lng=lon;
          di.dataset.justSelected='true';
          box.style.display='none'; box.innerHTML='';
          if(badge) badge.textContent='📍 Tujuan di Trenggalek ✅'; 
          if(destDebounce) clearTimeout(destDebounce);
          if(mapModule){ 
            mapModule.mapSelected.lat=lat; 
            mapModule.mapSelected.lng=lon; 
            mapModule.mapSelected.address=clean; 
            mapModule.mapSelected.inTrenggalek=true; 
          }
          currentOrderMeta.destLat=lat; currentOrderMeta.destLng=lon;
          updateOrderEstimate();
          setTimeout(()=>{ di.dataset.justSelected='false'; }, 500);
        };
      });
    }
  }catch(e){ 
    console.error('searchDestLive error', e);
    if(badge) badge.textContent='❌ Error jaringan - coba Map';
    if(box){ box.style.display='block'; box.innerHTML='<div style="padding:8px;color:#ef4444;font-size:11px">❌ Gagal cari tujuan - cek internet atau pakai tombol 🗺️ Map<br/><small>'+e.message+'</small></div>'; }
  }
}

export async function updateOrderEstimate(){
  const pickupInput=document.getElementById('pickup'); const destInput=document.getElementById('dest');
  const tripType=document.querySelector('input[name="tripType"]:checked')?.value||'oneway';
  const vehicleType=document.querySelector('input[name="vehicleType"]:checked')?.value||'motor';
  const card=document.getElementById('estimateCard'); const distEl=document.getElementById('estDistance'); const costEl=document.getElementById('estCost'); const typeEl=document.getElementById('estTripType'); const vehEl=document.getElementById('estVehicle'); const btnOrder=document.getElementById('btnOrder');
  const badge=document.getElementById('destLive');
  if(!destInput?.value || destInput.value.trim().length<2){ 
    if(card) card.style.display='none';
    if(btnOrder) btnOrder.style.display='none';
    return; 
  }
  // ATURAN: penumpang harus di wilayah kecamatan sesuai setting
  const pickupLat=parseFloat(pickupInput?.dataset.lat); const pickupLng=parseFloat(pickupInput?.dataset.lng);
  let pLat=pickupLat, pLng=pickupLng;
  if(!pLat||!pLng||isNaN(pLat)||isNaN(pLng)){
    try{ 
      const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:8000})); 
      pLat=pos.coords.latitude; pLng=pos.coords.longitude; 
      if(pickupInput){ pickupInput.dataset.lat=pLat; pickupInput.dataset.lng=pLng; }
    }catch(e){ 
      alert('⛔ Gagal deteksi lokasi pickup - aktifkan GPS. Penumpang harus berada di wilayah '+ (getActiveKecamatanName?getActiveKecamatanName():ACTIVE_KECAMATAN_NAME||'Suruh'));
      if(card) card.style.display='none'; if(btnOrder) btnOrder.style.display='none';
      return;
    }
  }
  // Validasi kecamatan
  if(!isInSuruhBbox(pLat,pLng)){
    const kecName = getActiveKecamatanName ? getActiveKecamatanName() : (ACTIVE_KECAMATAN_NAME||'Suruh');
    alert('⛔ Kamu di luar Kecamatan '+kecName+' - Penumpang harus berada di wilayah '+kecName);
    if(card) card.style.display='none'; if(btnOrder) btnOrder.style.display='none';
    return;
  }
  if(distEl) distEl.textContent='Menghitung...'; if(costEl) costEl.textContent='...'; if(card) card.style.display='block';
  let geoDest=null; 
  const dLat=parseFloat(destInput?.dataset.lat); const dLng=parseFloat(destInput?.dataset.lng);
  if(dLat&&dLng && !isNaN(dLat) && !isNaN(dLng)){ 
    geoDest={lat:dLat, lng:dLng}; 
  } else { 
    // Jika user ketik manual tanpa pilih suggestion, coba geocode
    if(badge) badge.textContent='🔍 deteksi tujuan...';
    geoDest=await geocodeAddress(destInput.value);
    if(geoDest){
      destInput.dataset.lat=geoDest.lat; destInput.dataset.lng=geoDest.lng;
      if(badge) badge.textContent='📍 Tujuan terdeteksi ✅';
    } else {
      if(badge) badge.textContent='❌ Gagal deteksi - pilih dari daftar atau Map';
      alert('❌ Gagal deteksi lokasi tujuan - ketik dan pilih dari daftar saran, atau pakai tombol 🗺️ Map. Tujuan harus di Trenggalek.');
      if(card) card.style.display='none'; if(btnOrder) btnOrder.style.display='none';
      return;
    }
  }
  // ATURAN: tujuan hanya boleh di wilayah Trenggalek
  if(!isInTrenggalekKab(geoDest.lat, geoDest.lng)){
    alert('⛔ Tujuan di luar Kabupaten Trenggalek - Tujuan hanya boleh di wilayah Trenggalek');
    if(badge) badge.textContent='⛔ Luar Trenggalek - harus di Trenggalek';
    if(card) card.style.display='none'; if(btnOrder) btnOrder.style.display='none';
    return;
  }
  const distance=haversineKm(pLat,pLng,geoDest.lat,geoDest.lng);
  currentOrderMeta.pickupLat=pLat; currentOrderMeta.pickupLng=pLng;
  currentOrderMeta.destLat=geoDest.lat; currentOrderMeta.destLng=geoDest.lng;
  currentOrderMeta.distanceKm=distance; currentOrderMeta.tripType=tripType; currentOrderMeta.vehicleType=vehicleType;
  const cost = hitungTarif(distance, vehicleType, tripType);
  currentOrderMeta.cost=cost;
  const vehInfo = VEHICLE_TYPES[vehicleType]||VEHICLE_TYPES.motor;
  const t = TARIF[vehicleType]||TARIF.motor;
  if(distEl) distEl.textContent=distance.toFixed(2)+' km'; 
  if(typeEl) typeEl.textContent=tripType==='roundtrip'?'Pulang-Pergi (x1.6)':'Antar Saja'; 
  if(vehEl) vehEl.textContent=`${vehInfo.icon} ${vehInfo.label} Rp ${t.perKm}/km`; 
  if(costEl) costEl.textContent='Rp '+cost.toLocaleString('id-ID');
  if(btnOrder) btnOrder.style.display='block';
  const si=document.getElementById('searchInfo'); if(si) si.textContent=`Estimasi: ${distance.toFixed(2)} km • ${typeEl?.textContent||''} • ${vehInfo.icon} ${vehInfo.label} • Rp ${cost.toLocaleString('id-ID')} • Tujuan Trenggalek ✅`;
  if(currentNearby.length>0) renderDriverList(currentNearby);
}

// === FIX UTAMA DI SINI ===
export async function createOrder(driverId, currentProfile){
  const btnOrder=document.getElementById('btnOrder');
  if(btnOrder){ btnOrder.disabled=true; btnOrder.textContent='⏳ Mengirim...'; }
  try{
    const pickupInput=document.getElementById('pickup');
    const destInput=document.getElementById('dest');
    const pickup = pickupInput?.value?.trim() || '';
    const dest = destInput?.value?.trim() || '';
    if(!pickup || !dest){ alert('Isi pickup & tujuan'); if(btnOrder){ btnOrder.disabled=false; btnOrder.textContent='🚀 Order Sekarang'; } return; }
    
    const distanceKm = currentOrderMeta.distanceKm || 0;
    const tripType = document.querySelector('input[name="tripType"]:checked')?.value || 'oneway';
    const vehicleType = document.querySelector('input[name="vehicleType"]:checked')?.value || 'motor';
    const cost = currentOrderMeta.cost || hitungTarif(distanceKm, vehicleType, tripType);

    // Payload kompatibel lama + baru - biar tidak error 'pickup' not-null atau 'dest_lat' not found
    const pickupVal = pickup;
    const destVal = dest;

    // Hanya kirim lat/lng kalau valid number
    const validPickupLat = currentOrderMeta.pickupLat && !isNaN(currentOrderMeta.pickupLat) ? currentOrderMeta.pickupLat : null;
    const validPickupLng = currentOrderMeta.pickupLng && !isNaN(currentOrderMeta.pickupLng) ? currentOrderMeta.pickupLng : null;
    const validDestLat = currentOrderMeta.destLat && !isNaN(currentOrderMeta.destLat) ? currentOrderMeta.destLat : null;
    const validDestLng = currentOrderMeta.destLng && !isNaN(currentOrderMeta.destLng) ? currentOrderMeta.destLng : null;

    const basePayload = {
      passenger_id: currentProfile.id,
      driver_id: driverId||null,
      pickup_text: pickupVal,
      dest_text: destVal,
      pickup: pickupVal,
      destination: destVal,
      dest: destVal,
      distance_km: distanceKm,
      distance: distanceKm,
      trip_type: tripType,
      vehicle_type: vehicleType,
      estimated_cost: cost,
      cost: cost,
      status: driverId?'pending':'searching'
    };
    // Tambah lat/lng hanya kalau valid, untuk hindari invalid geometry
    if(validPickupLat && validPickupLng){
      basePayload.pickup_lat = validPickupLat;
      basePayload.pickup_lng = validPickupLng;
    }
    if(validDestLat && validDestLng){
      basePayload.dest_lat = validDestLat;
      basePayload.dest_lng = validDestLng;
    }

    console.log('Creating order', basePayload);
    let { data, error } = await supabase.from('orders').insert(basePayload).select().single();

    if(error){
      console.warn('Insert base failed:', error.message, 'coba minimal');
      const isGeometryError = error.message.includes('invalid geometry') || error.message.includes('parse error') || error.message.includes('geometry');
      const isStatusCheckError = error.message.includes('status_check') || error.message.includes('check constraint');
      const retryStatus = isStatusCheckError ? 'new' : (driverId?'pending':'searching');
      
      // Jika error geometry, jangan kirim lat/lng sama sekali, hanya text
      let minimal;
      if(isGeometryError){
        console.warn('Geometry error - coba tanpa lat/lng');
        minimal = {
          passenger_id: currentProfile.id,
          driver_id: driverId||null,
          pickup: pickupVal,
          destination: destVal,
          pickup_text: pickupVal,
          dest_text: destVal,
          status: retryStatus
        };
      } else {
        minimal = {
          passenger_id: currentProfile.id,
          driver_id: driverId||null,
          pickup: pickupVal,
          destination: destVal,
          pickup_text: pickupVal,
          dest_text: destVal,
          status: retryStatus
        };
      }
      const res2 = await supabase.from('orders').insert(minimal).select().single();
      data = res2.data; error = res2.error;
      if(error){
        console.warn('Minimal failed:', error.message, 'coba fallback status');
        const fallbackStatuses = ['new', 'open', 'created', 'waiting', 'pending', 'searching'];
        for(const s of fallbackStatuses){
          // Coba tanpa kolom lat/lng kalau geometry error
          const payload = isGeometryError ? {
            passenger_id: currentProfile.id,
            driver_id: driverId||null,
            pickup: pickupVal,
            destination: destVal,
            status: s
          } : {
            passenger_id: currentProfile.id,
            driver_id: driverId||null,
            pickup: pickupVal,
            destination: destVal,
            pickup_text: pickupVal,
            dest_text: destVal,
            status: s
          };
          const res3 = await supabase.from('orders').insert(payload).select().single();
          if(!res3.error){
            data = res3.data; error = null;
            break;
          }
          data = res3.data; error = res3.error;
        }
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
    
        // Mulai tracking realtime - MODAL MENGUNCI SAJA, tanpa card bawah duplikat
    try{ 
      localStorage.setItem('active_order_id', data.id);
      localStorage.setItem('pickup_text', pickupVal);
      localStorage.setItem('dest_text', destVal);
      if(currentOrderMeta.pickupLat) localStorage.setItem('pickup_lat', currentOrderMeta.pickupLat);
      if(currentOrderMeta.pickupLng) localStorage.setItem('pickup_lng', currentOrderMeta.pickupLng);
      if(currentOrderMeta.destLat) localStorage.setItem('dest_lat', currentOrderMeta.destLat);
      if(currentOrderMeta.destLng) localStorage.setItem('dest_lng', currentOrderMeta.destLng);
      tracking.startTracking(data.id);
      // Tidak pakai activeOrderCard lagi - hanya modal tracking yang mengunci
      const list = document.getElementById('driverList');
      if(list) list.style.display='none';
      const info = document.getElementById('searchInfo');
      if(info) info.textContent = `✅ Order terkirim - ID ${data.id.slice(0,6)} - menunggu driver...`;
    }catch(e){ console.warn('tracking start fail', e); }
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

// ===== VIEW PASSENGER - modal tracking mengunci - TANPA DOUBLE DETAIL =====
export function viewPassenger(currentProfile){
  return `<div>
  <div id="activeOrderCard" style="display:none !important" class="card tracking-card"></div>
  <div class="card" id="orderFormCard"><h3>🧍 Order Ojol - ${currentProfile?.name||''}</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
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
  </div>
  </div>`;
}

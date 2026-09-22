// order.js - AUTO ASSIGN ke driver terdekat berurutan + timeout + auto cancel
import { supabase } from './supabase.js';
import * as tracking from './tracking.js';
import { TRENGGALEK_BBOX, TARIF, VEHICLE_TYPES, hitungTarif, ACTIVE_KECAMATAN_NAME } from './config.js';
import { isInSuruhBbox, isInTrenggalekKab, haversineKm, getActiveKecamatanName } from './geofence.js';

export let currentNearby = [];
export let currentOrderMeta = {distanceKm:0, cost:0, tripType:'oneway', vehicleType:'motor', pickupLat:null, pickupLng:null, destLat:null, destLng:null};
export let destDebounce = null;
export function setDestDebounce(v){ destDebounce = v; }

// ===== AUTO ASSIGN CONFIG =====
const DRIVER_RESPONSE_TIMEOUT = 40; // detik tiap driver harus respon
const AUTO_ASSIGN_ENABLED = true;

export function getAutoQueue(orderId){
  try{ return JSON.parse(localStorage.getItem('auto_queue_'+orderId)||'[]'); }catch(e){ return []; }
}
export function getAutoIndex(orderId){
  try{ return parseInt(localStorage.getItem('auto_index_'+orderId)||'0'); }catch(e){ return 0; }
}
export function setAutoIndex(orderId, idx){
  try{ localStorage.setItem('auto_index_'+orderId, String(idx)); }catch(e){}
}
export function clearAutoQueue(orderId){
  try{ localStorage.removeItem('auto_queue_'+orderId); localStorage.removeItem('auto_index_'+orderId); localStorage.removeItem('auto_start_'+orderId); }catch(e){}
}

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
  let filtered = drivers;
  if(selectedVehicle){ filtered = drivers.filter(d => (d.jenis_kendaraan||'motor')===selectedVehicle); }
  // Urutkan jarak terdekat paling atas (sudah dari RPC tapi pastikan)
  filtered = [...filtered].sort((a,b)=> (a.distance_km||a.distance||999) - (b.distance_km||b.distance||999));
  const driverIds = (filtered.length ? filtered : drivers).map(d=> d.driver_id||d.id).filter(Boolean);
  const ratingsMap = await fetchDriverRatings(driverIds);
  
  const renderCard = (d, idx)=>{
    const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
    const vehLabel = d.jenis_kendaraan||'motor';
    const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
    const r = ratingsMap[d.driver_id||d.id];
    const ratingText = r ? `${r.avg}` : `Baru`;
    const ratingCount = r ? `(${r.count})` : '';
    const ratingBg = r ? (parseFloat(r.avg)>=4.5 ? '#22c55e' : parseFloat(r.avg)>=4.0 ? '#f59e0b' : '#475569') : '#334155';
    const dist = (d.distance_km||d.distance||0).toFixed ? (d.distance_km||0).toFixed(2) : (d.distance||0);
    const isTop = idx===0;
    return `
    <div style="background:${isTop?'#1a2e1a':'#151c25'};border:${isTop?'2px solid #22c55e':'1px solid #263240'};border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px;position:relative">
      ${isTop?'<div style="position:absolute;top:-8px;left:12px;background:#22c55e;color:#052e16;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800">⭐ TERDEKAT</div>':''}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;font-size:14px;color:#e6edf5;letter-spacing:0.2px">${idx+1}. ${d.name}</span>
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
    if(drivers.length>0){
      list.innerHTML = `<p style="font-size:11px;color:#fbbf24;margin-bottom:8px">⚠️ Tidak ada driver ${selectedVehicle} online di Suruh, menampilkan semua:</p>` + drivers.map((d,i)=>renderCard(d,i)).join('');
      return;
    }
    list.innerHTML = '<div style="background:#1d2633;border:1px dashed #263240;border-radius:12px;padding:16px;text-align:center;color:#8aa0b8;font-size:12px">Tidak ada driver online</div>'; return;
  }
  list.innerHTML = filtered.map((d,i)=>renderCard(d,i)).join('');
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
    if(!error && data && data.length>0){ 
      drivers=data.filter(d=> d.role==='driver' || (!d.role && d.status==='online')); 
      drivers=drivers.filter(d=> d.role!=='admin'); 
      // Urutkan jarak
      drivers.sort((a,b)=> (a.distance_km||a.distance||999)-(b.distance_km||b.distance||999));
      if(info) info.textContent=`✅ ${drivers.length} driver terdekat (urut jarak)`; 
    }
    else {
      // Fallback 1: coba driver_locations
      const { data: locs } = await supabase.from('driver_locations').select('*').order('updated_at',{ascending:false}).limit(20);
      if(locs && locs.length>0){
        const ids=locs.map(l=>l.driver_id);
        const { data: users } = await supabase.from('users').select('*').in('id', ids).eq('status','online').eq('role','driver');
        drivers=locs.map(l=>{ const u=users?.find(x=>x.id===l.driver_id); return u? {...u,...l,driver_id:l.driver_id}:null; }).filter(Boolean);
        drivers = drivers.map(d=>{
          if(!d.distance_km && d.lat && d.lng && myLat){
            try{ d.distance_km = haversineKm(myLat, myLng, d.lat, d.lng); }catch(e){}
          }
          if(d.lokasi && !d.lat){
            try{
              const m = d.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
              if(m){ d.lng=parseFloat(m[1]); d.lat=parseFloat(m[2]); d.distance_km = haversineKm(myLat, myLng, d.lat, d.lng); }
            }catch(e){}
          }
          return d;
        }).sort((a,b)=> (a.distance_km||999)-(b.distance_km||999));
        if(drivers.length>0){
          if(info) info.textContent=`✅ ${drivers.length} driver online (urut jarak)`;
        }
      }
      // Fallback 2: jika masih 0, query users online langsung tanpa lokasi (biar tetap tampil)
      if(drivers.length===0){
        const { data: onlineUsers, error: uErr } = await supabase.from('users').select('*').eq('status','online').eq('role','driver').limit(10);
        if(!uErr && onlineUsers && onlineUsers.length>0){
          drivers = onlineUsers.map(u=>{
            let dist = 999;
            try{ if(myLat && u.last_lat && u.last_lng){ dist = haversineKm(myLat, myLng, u.last_lat, u.last_lng); } }catch(e){}
            return {...u, driver_id: u.id, distance_km: dist, distance: dist};
          }).sort((a,b)=> (a.distance_km||999)-(b.distance_km||999));
          if(info) info.textContent=`✅ ${drivers.length} driver online (tanpa lokasi)`;
        } else {
          if(info) info.textContent='❌ Tidak ada driver online';
        }
      }
    }
    drivers=drivers.filter(d=> d.role!=='admin');
    currentNearby=drivers; renderDriverList(drivers);
  }catch(e){ if(info) info.textContent='Error: '+e.message; }
}

export async function updateOrderEstimate(){
  const pickupEl=document.getElementById('pickup'); const destEl=document.getElementById('dest'); const estCard=document.getElementById('estimateCard');
  const estDist=document.getElementById('estDistance'); const estCost=document.getElementById('estCost'); const estTrip=document.getElementById('estTripType'); const estVeh=document.getElementById('estVehicle'); const btnOrder=document.getElementById('btnOrder');
  const tripType=document.querySelector('input[name="tripType"]:checked')?.value||'oneway';
  const vehicleType=document.querySelector('input[name="vehicleType"]:checked')?.value||'motor';
  const pickupLat=pickupEl?.dataset.lat ? parseFloat(pickupEl.dataset.lat) : null;
  const pickupLng=pickupEl?.dataset.lng ? parseFloat(pickupEl.dataset.lng) : null;
  let destLat=null, destLng=null;
  const destVal=destEl?.value||'';
  if(destVal){
    try{
      const viewbox = `${TRENGGALEK_BBOX.minLng},${TRENGGALEK_BBOX.minLat},${TRENGGALEK_BBOX.maxLng},${TRENGGALEK_BBOX.maxLat}`;
      const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destVal)}&limit=1&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`);
      const data=await resp.json();
      if(data && data[0]){ destLat=parseFloat(data[0].lat); destLng=parseFloat(data[0].lon); }
    }catch(e){}
  }
  if(pickupLat && destLat){
    const dist=haversineKm(pickupLat,pickupLng,destLat,destLng);
    const cost=hitungTarif(dist, vehicleType, tripType);
    currentOrderMeta={distanceKm:dist, cost, tripType, vehicleType, pickupLat, pickupLng, destLat, destLng};
    if(estDist) estDist.textContent=`${dist.toFixed(2)} km`;
    if(estCost) estCost.textContent=`Rp ${cost.toLocaleString('id-ID')}`;
    if(estTrip) estTrip.textContent=tripType==='roundtrip'?'PP x1.6':'Sekali jalan';
    if(estVeh) estVeh.textContent=vehicleType;
    if(estCard) estCard.style.display='block';
    if(btnOrder) btnOrder.style.display='block';
  } else {
    if(estCard) estCard.style.display='none';
    if(btnOrder) btnOrder.style.display='none';
  }
}

export async function geocodeAddress(q){
  try{ const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&countrycodes=id`); const data=await resp.json(); if(data && data[0]) return {lat:parseFloat(data[0].lat), lng:parseFloat(data[0].lon)}; }catch(e){} return null;
}

export async function searchDestLive(q, mapModule){
  const box=document.getElementById('destSuggestions');
  const badge=document.getElementById('destLive');
  const raw=(q||'').trim();
  if(!raw || raw.length<1){ if(box){ box.style.display='none'; box.innerHTML=''; } if(badge) badge.textContent='🔍 ketik 1 huruf'; return; }
  if(badge) badge.textContent='🔍 mencari...';
  const viewbox = `${TRENGGALEK_BBOX.minLng},${TRENGGALEK_BBOX.minLat},${TRENGGALEK_BBOX.maxLng},${TRENGGALEK_BBOX.maxLat}`;
  let results=[];
  try{
    const q1 = raw.toLowerCase().includes('trenggalek') ? raw : raw + ' Trenggalek';
    const resp1 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q1)}&limit=15&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`);
    results = await resp1.json()||[];
    if(results.length < 3){
      try{
        const resp2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}&limit=15&addressdetails=1&viewbox=${viewbox}&bounded=0&countrycodes=id`);
        const r2 = await resp2.json()||[];
        const seen = new Set(results.map(r=>r.place_id));
        for(let x of r2){ if(!seen.has(x.place_id)){ results.push(x); seen.add(x.place_id); } }
      }catch(e){}
    }
    if(!results.length){ if(box){ box.style.display='none'; box.innerHTML=''; } if(badge) badge.textContent='❌ tidak ditemukan - coba kata lain'; return; }
    const filtered = results.filter(r=> {
      try{ return isInTrenggalekKab(parseFloat(r.lat), parseFloat(r.lon)); }catch(e){ return true; }
    });
    const displayResults = filtered.length>0 ? filtered : results;
    if(box){
      box.style.display='block';
      // Simpan results ke global biar bisa diakses onclick
      window._destResults = displayResults;
      box.innerHTML = displayResults.map((r, i)=>{
        const lat=parseFloat(r.lat); const lon=parseFloat(r.lon);
        const label=r.display_name; 
        const short=label.split(',').slice(0,3).join(',');
        const escShort = short.replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        // Pakai mousedown + onclick inline, stopPropagation biar tidak ketutup listener document di app.js
        return `<div data-idx="${i}" data-lat="${lat}" data-lng="${lon}" style="padding:10px;border-bottom:1px solid #334155;cursor:pointer;font-size:12px;color:#e6edf5" onmousedown="event.stopPropagation(); event.preventDefault(); window._selectDest(${i}); return false;" onclick="window._selectDest(${i}); return false;">${escShort}</div>`;
      }).join('');
      
      // Global function untuk select
      window._selectDest = (idx)=>{
        try{
          const r = window._destResults[idx];
          if(!r) return;
          const lat=parseFloat(r.lat); const lon=parseFloat(r.lon);
          const short=r.display_name.split(',').slice(0,3).join(',');
          const destInput=document.getElementById('dest');
          if(destInput){ 
            destInput.value=short; 
            destInput.dataset.lat=lat; 
            destInput.dataset.lng=lon; 
            destInput.dataset.full= r.display_name;
          }
          const b = document.getElementById('destSuggestions');
          if(b){ b.style.display='none'; b.innerHTML=''; }
          const badge2=document.getElementById('destLive');
          if(badge2) badge2.textContent='✅ dipilih';
          updateOrderEstimate();
        }catch(e){ console.warn('select dest error', e); }
      };
      
      if(badge) badge.textContent=`${displayResults.length} hasil - klik untuk pilih`;
    }
  }catch(e){ if(badge) badge.textContent='Error'; }
}

// ===== AUTO ASSIGN LOGIC =====
export async function assignToNextDriver(orderId, reason=''){
  try{
    const queue = getAutoQueue(orderId);
    let idx = getAutoIndex(orderId);
    if(!queue || queue.length===0){
      console.log('Auto queue kosong, batalkan order', orderId);
      await autoCancelOrder(orderId, 'Tidak ada driver terdekat lain');
      return;
    }
    // Cari driver selanjutnya yang belum menolak dan masih online
    // idx sudah menunjuk ke driver yang baru saja menolak/timeout, jadi naikkan 1
    idx = idx + 1;
    setAutoIndex(orderId, idx);
    
    if(idx >= queue.length){
      console.log('Semua driver di nearby habis, auto cancel', orderId);
      await autoCancelOrder(orderId, 'Semua driver terdekat tidak merespon/menolak');
      return;
    }
    
    const nextDriver = queue[idx];
    const nextId = nextDriver.driver_id || nextDriver.id;
    const nextName = nextDriver.name || 'Driver';
    
    console.log(`Auto assign ke driver ${idx+1}/${queue.length}: ${nextName} (${nextId}) reason: ${reason}`);
    
    // Update order ke driver selanjutnya - ID ORDER TETAP SAMA
    const { error } = await supabase.from('orders').update({ 
      driver_id: nextId, 
      status: 'searching'
    }).eq('id', orderId);
    
    if(error){
      console.warn('Auto assign error, coba tanpa kolom tambahan', error.message);
      await supabase.from('orders').update({ driver_id: nextId, status: 'searching' }).eq('id', orderId);
    }
    
    // Broadcast ke tracking card
    try{
      const ch = supabase.channel('order-tracking-'+orderId);
      ch.subscribe(async (status)=>{
        if(status === 'SUBSCRIBED'){
          await ch.send({ type: 'broadcast', event: 'auto_assigned', payload: { driverName: nextName, driverId: nextId, index: idx+1, total: queue.length, reason } });
        }
      });
      setTimeout(async()=>{ try{ await ch.send({ type: 'broadcast', event: 'auto_assigned', payload: { driverName: nextName, driverId: nextId, index: idx+1, total: queue.length, reason } }); }catch(e){} }, 500);
    }catch(e){ console.warn('broadcast auto assign fail', e.message); }
    
    // Reset timeout untuk driver baru
    try{ localStorage.setItem('auto_start_'+orderId, Date.now().toString()); }catch(e){}
    
  }catch(e){
    console.error('assignToNextDriver error', e);
  }
}

export async function autoCancelOrder(orderId, reason){
  try{
    console.log('Auto cancel order', orderId, reason);
    await supabase.from('orders').update({ status: 'cancelled', cancel_reason: reason }).eq('id', orderId);
    try{
      const ch = supabase.channel('order-tracking-'+orderId);
      ch.subscribe(async (status)=>{
        if(status === 'SUBSCRIBED'){
          await ch.send({ type: 'broadcast', event: 'auto_cancelled', payload: { reason } });
        }
      });
    }catch(e){}
    clearAutoQueue(orderId);
    alert('😔 '+reason+' - Order dibatalkan otomatis. Silakan buat order baru.');
  }catch(e){
    console.error('autoCancel error', e);
  }
}

export function startAutoAssignTimer(orderId){
  if(!AUTO_ASSIGN_ENABLED) return;
  try{
    localStorage.setItem('auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  // Timer ini dijalankan di tracking.js via startNoDriverCheck / interval
}

export async function createOrder(driverId=null, vehicleType=null){
  const pickupEl=document.getElementById('pickup'); const destEl=document.getElementById('dest'); const btnOrder=document.getElementById('btnOrder');
  if(!pickupEl || !destEl){ alert('Form tidak ditemukan'); return; }
  const pickupVal=pickupEl.value.trim(); const destVal=destEl.value.trim();
  if(!pickupVal || !destVal){ alert('Isi pickup & tujuan'); return; }
  const tripType=document.querySelector('input[name="tripType"]:checked')?.value||'oneway';
  const vType=vehicleType || document.querySelector('input[name="vehicleType"]:checked')?.value||'motor';
  const pickupLat=pickupEl.dataset.lat ? parseFloat(pickupEl.dataset.lat) : currentOrderMeta.pickupLat;
  const pickupLng=pickupEl.dataset.lng ? parseFloat(pickupEl.dataset.lng) : currentOrderMeta.pickupLng;
  const destLat=destEl.dataset.lat ? parseFloat(destEl.dataset.lat) : currentOrderMeta.destLat;
  const destLng=destEl.dataset.lng ? parseFloat(destEl.dataset.lng) : currentOrderMeta.destLng;
  const distanceKm=currentOrderMeta.distanceKm||0;
  const cost=currentOrderMeta.cost||0;
  if(btnOrder){ btnOrder.disabled=true; btnOrder.textContent='⏳ Mengirim...'; }
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) throw new Error('Belum login');
    const { data: profile } = await supabase.from('users').select('id').eq('google_id', user.id).single();
    if(!profile) throw new Error('Profile tidak ditemukan');

    // Siapkan antrian driver terdekat untuk auto assign - ID TETAP SAMA
    let queue = [];
    if(currentNearby && currentNearby.length>0){
      // Urutkan jarak terdekat
      const sorted = [...currentNearby].sort((a,b)=> (a.distance_km||a.distance||999)-(b.distance_km||b.distance||999));
      if(driverId){
        // Jika penumpang pilih driver spesifik, taruh driver itu paling depan, sisanya urut jarak
        const chosen = sorted.find(d=> (d.driver_id||d.id)===driverId);
        const others = sorted.filter(d=> (d.driver_id||d.id)!==driverId);
        queue = chosen ? [chosen, ...others] : sorted;
      } else {
        queue = sorted;
      }
      // Filter kendaraan sesuai pilihan
      queue = queue.filter(d=> (d.jenis_kendaraan||'motor')===vType);
      if(queue.length===0) queue = sorted; // fallback kalau filter kendaraan kosong
    }

    const insertData = {
      passenger_id: profile.id,
      pickup_text: pickupVal,
      dest_text: destVal,
      pickup: pickupVal,
      destination: destVal,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dest_lat: destLat,
      dest_lng: destLng,
      distance_km: distanceKm,
      estimated_cost: cost,
      cost: cost,
      trip_type: tripType,
      vehicle_type: vType,
      status: 'searching',
      driver_id: driverId || (queue.length>0 ? (queue[0].driver_id||queue[0].id) : null)
    };

    const { data, error } = await supabase.from('orders').insert(insertData).select().single();
    if(error) throw error;

    // Simpan antrian auto assign ke localStorage - ID ORDER SAMA
    if(queue.length>0){
      try{
        localStorage.setItem('auto_queue_'+data.id, JSON.stringify(queue));
        localStorage.setItem('auto_index_'+data.id, '0');
        localStorage.setItem('auto_start_'+data.id, Date.now().toString());
        console.log(`Auto queue disimpan: ${queue.length} driver, mulai dari ${queue[0].name}`);
      }catch(e){}
    }

    // Push notif ke driver (jika ada Edge Function)
    try{
      const { data: pushData, error: pushError } = await supabase.functions.invoke('push-order', { 
        body: { 
          order_id: data.id,
          driver_id: insertData.driver_id||null,
          vehicle_type: vType
        } 
      });
      console.log('push invoked', pushData, pushError);
    }catch(pushErr){
      console.warn('Push function belum deploy atau error (abaikan jika pakai realtime)', pushErr);
    }

    const assignedName = queue.length>0 ? queue[0].name : 'driver terdekat';
    alert(`✅ Order terkirim! ${pickupVal} -> ${destVal} • ${vType} Rp ${cost.toLocaleString('id-ID')}\nMencoba ${assignedName} (1/${queue.length}) - Auto pindah ke driver selanjutnya jika menolak/tidak merespon ${DRIVER_RESPONSE_TIMEOUT} detik`);
    
    if(btnOrder){ btnOrder.textContent='✅ Terkirim'; setTimeout(()=>{ btnOrder.disabled=false; btnOrder.textContent='🚀 Order Sekarang'; }, 2000); }
    
    try{ 
      localStorage.setItem('active_order_id', data.id);
      localStorage.setItem('pickup_text', pickupVal);
      localStorage.setItem('dest_text', destVal);
      if(currentOrderMeta.pickupLat) localStorage.setItem('pickup_lat', currentOrderMeta.pickupLat);
      if(currentOrderMeta.pickupLng) localStorage.setItem('pickup_lng', currentOrderMeta.pickupLng);
      if(currentOrderMeta.destLat) localStorage.setItem('dest_lat', currentOrderMeta.destLat);
      if(currentOrderMeta.destLng) localStorage.setItem('dest_lng', currentOrderMeta.destLng);
      tracking.startTracking(data.id);
      const list = document.getElementById('driverList');
      if(list) list.style.display='none';
      const info = document.getElementById('searchInfo');
      if(info) info.textContent = `✅ Order terkirim - ID ${data.id.slice(0,6)} - mencoba ${assignedName}...`;
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

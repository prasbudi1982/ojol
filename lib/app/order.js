
// order.js - ADAPTIF TEMA HP
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
    const ratingBg = r ? (parseFloat(r.avg)>=4.5 ? '#22c55e' : parseFloat(r.avg)>=4.0 ? '#f59e0b' : 'var(--border)') : 'var(--border)';
    const dist = (d.distance_km||d.distance||0).toFixed ? (d.distance_km||0).toFixed(2) : (d.distance||0);
    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:800;font-size:14px;color:var(--text);letter-spacing:0.2px">${d.name}</span>
          <span style="background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:8px;font-size:10px;color:var(--muted)">${vehIcon} ${vehLabel.toUpperCase()}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="background:${ratingBg};color:${r && parseFloat(r.avg)>=4.0 ? '#052e16' : 'var(--text)'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:4px">⭐ ${ratingText} <span style="font-weight:600;opacity:0.9;font-size:10px">${ratingCount}</span></span>
          <span style="font-size:11px;color:var(--muted)">${d.nopol||''} • ${dist} km • ${d.tipe_motor||'Beat'}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:112px;justify-content:center">
        <button data-order-driver="${d.driver_id||d.id}" data-vehicle="${vehLabel}" style="background:var(--primary);color:#052e16;border:none;padding:10px 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(34,197,94,0.3)">✅ Pesan</button>
        <div style="display:flex;gap:6px">
          ${wa?`<a href="${wa}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>`:''}
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
    list.innerHTML = '<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:12px">Tidak ada driver online</div>'; return;
  }
  list.innerHTML = filtered.map(renderCard).join('');
}

// ... sisa fungsi searchNearby, viewPassenger dll tetap, tapi adaptif tema
export function viewPassenger(currentProfile){
  return `<div>
  <div id="activeOrderCard" style="display:none !important" class="card tracking-card"></div>
  <div class="card" id="orderFormCard"><h3>🧍 Order Ojol - ${currentProfile?.name||''}</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
  <label>Pickup <span class="muted" style="font-size:10px" id="pickupLive">📡 live</span>
    <div class="row" style="gap:8px;align-items:center"><input id="pickup" placeholder="Lokasi jemput..." style="flex:4;min-width:0"><button id="btnRefreshPickup" class="btn secondary" style="flex:0 0 48px;padding:8px 0">📍</button></div>
  </label>
  <label>Tujuan <span class="muted" style="font-size:10px" id="destLive">🔍 ketik 1 huruf</span>
    <div class="row" style="gap:8px;align-items:center"><input id="dest" placeholder="Ketik tujuan di Trenggalek..." style="flex:4;min-width:0"><button id="btnOpenMap" class="btn secondary" style="flex:0 0 64px;padding:8px 0">🗺️ Map</button></div>
    <div id="destSuggestions" style="display:none;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-top:6px;background:var(--card)"></div>
  </label>
  <label>Pilih Kendaraan</label>
  <div class="row" style="gap:8px;margin-top:6px">
    <label style="flex:1;border:2px solid var(--primary);border-radius:12px;padding:10px;text-align:center;cursor:pointer;background:rgba(34,197,94,0.1)" id="labelMotor"><input type="radio" name="vehicleType" value="motor" checked style="display:none"><span style="font-size:20px">🏍️</span><br/><b>Motor</b><br/><span class="muted" style="font-size:10px">Hemat • Rp 2.500/km</span></label>
    <label style="flex:1;border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center;cursor:pointer" id="labelMobil"><input type="radio" name="vehicleType" value="mobil" style="display:none"><span style="font-size:20px">🚗</span><br/><b>Mobil</b><br/><span class="muted" style="font-size:10px">Nyaman • Rp 5.500/km</span></label>
  </div>
  <div class="row" style="margin-top:8px"><label style="flex:1"><input type="radio" name="tripType" value="oneway" checked> Antar Saja</label><label style="flex:1"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
  <div id="estimateCard" style="display:none;margin-top:12px;border:1px dashed var(--border);padding:10px;border-radius:8px"><p style="font-size:12px">Jarak: <b id="estDistance">-</b> • <span id="estTripType">-</span> • <span id="estVehicle">-</span> • Biaya: <b id="estCost">-</b></p><p class="muted" id="searchInfo" style="font-size:11px"></p></div>
  <button id="btnOrder" class="btn primary" style="display:none;margin-top:12px">🚀 Order Sekarang</button>
  <div id="driverList" style="margin-top:12px"></div>
  </div>
  </div>`;
}

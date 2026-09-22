// driver.js - Halaman driver - FINAL FIX style dinamis + link Maps + no flicker
import { supabase } from './supabase.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

export function driverAcceptOrder(orderId, driverProfile){
  return supabase.from('orders').update({ status:'accepted', driver_id: driverProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
}
export function driverPickedOrder(orderId){
  return supabase.from('orders').update({ status:'picked', picked_at: new Date().toISOString() }).eq('id', orderId).select().single();
}

let driverOrdersChannel = null; 
let driverOrdersInterval = null;
let lastOrdersHash = '';
let isFirstLoad = true;

function buildMapLinks(o){
  const pLat = o.pickup_lat || o.pickupLat;
  const pLng = o.pickup_lng || o.pickupLng;
  const dLat = o.dest_lat || o.destLat;
  const dLng = o.dest_lng || o.destLng;
  const pickup = o.pickup_text||o.pickup||'-';
  const dest = o.dest_text||o.destination||'-';
  
  let pickupLink = '';
  let destLink = '';
  let routeLink = '';
  
  if(pLat && pLng){
    pickupLink = `https://www.google.com/maps?q=${pLat},${pLng}`;
  } else if(pickup && pickup.length>3){
    pickupLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
  }
  
  if(dLat && dLng){
    destLink = `https://www.google.com/maps?q=${dLat},${dLng}`;
  } else if(dest && dest.length>3){
    destLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
  }
  
  if(pLat && pLng && dLat && dLng){
    routeLink = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
  } else if(pickupLink && destLink){
    routeLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  }
  
  return { pickupLink, destLink, routeLink, pLat, pLng, dLat, dLng };
}

export async function loadDriverOrders(driverProfile, silent=false){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('driverOrders'); const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  const theme = getAppTheme(); const primary = theme.primary; const secondary = theme.secondary;
  
  // FIX FLICKER: jangan tampilkan loading jika sudah ada data dan silent=true (auto refresh)
  if(!silent || isFirstLoad){
    if(infoEl) infoEl.textContent = isFirstLoad ? '⏳ Mencari...' : '↻ Update...';
    if(isFirstLoad){
      box.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)"><div style="font-size:24px">⏳</div><div style="font-size:12px;margin-top:6px">Memuat order masuk...</div></div>`;
    }
  }
  
  try{
    const q1 = await supabase.from('orders').select('*').in('status', ['searching','pending','new','open','created','waiting']).order('created_at',{ascending:false}).limit(30);
    if(q1.error) throw q1.error;
    let rejectedIds=[]; try{ rejectedIds = JSON.parse(localStorage.getItem('rejected_orders_'+driverProfile.id)||'[]'); }catch(e){}
    let orders = (q1.data||[]).filter(o => {
      if(rejectedIds.includes(o.id)) return false;
      if(o.passenger_id===driverProfile.id) return false;
      if(o.driver_id && o.driver_id!==driverProfile.id) return false;
      return true;
    });
    
    // FIX FLICKER: hash check, jika data sama jangan re-render
    const newHash = JSON.stringify(orders.map(o=>o.id+o.status+o.updated_at).join('|'));
    if(!isFirstLoad && silent && newHash===lastOrdersHash){
      if(infoEl) infoEl.textContent = `${orders.length} order • update ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      return; // tidak berubah, skip render biar tidak kedip
    }
    lastOrdersHash = newHash;
    
    if(orders.length===0){ 
      box.innerHTML = `<div style="padding:20px;text-align:center;background:var(--card);border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">📭</div><div style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">Menunggu order...</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Order baru akan muncul otomatis tanpa kedip</div><button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:14px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 16px;border-radius:10px">🔄 Refresh</button></div>`; 
      if(infoEl) infoEl.textContent=''; 
      isFirstLoad=false;
      return; 
    }
    if(infoEl) infoEl.textContent = `${orders.length} order • ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id===driverProfile.id; const isBroadcast = !o.driver_id;
      let vTypeClean = 'motor'; try{ let vt=o.vehicle_type; if(typeof vt==='string'){ vt=vt.trim().toLowerCase(); if(vt.startsWith('{') || vt.includes('"ID"') || vt.includes('GOOGLE_ID')){ vt='motor'; } if(vt==='mobil'||vt==='motor'){ vTypeClean=vt; } } }catch(e){ vTypeClean='motor'; }
      const vehMatch = vTypeClean===(driverProfile.jenis_kendaraan||'motor');
      const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-'; const cost = o.estimated_cost||o.cost||0; const dist = o.distance_km||o.distance||0;
      const links = buildMapLinks(o);
      const hasCoords = !!(links.pLat && links.pLng && links.dLat && links.dLng);
      
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+primary:'1px solid var(--border)'};border-radius:16px;background:var(--card);box-shadow:0 2px 8px var(--shadow);transition:transform 0.2s">
        <div style="background:${isForMe?primary:'var(--card2)'};color:${isForMe?'white':'var(--text)'};padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px">${vTypeClean==='mobil'?'🚗':'🏍️'}</span><b style="font-size:13px">${vTypeClean.toUpperCase()}</b><span style="font-size:10px;background:var(--bg);padding:2px 6px;border-radius:6px;border:1px solid var(--border)">${typeof dist==='number'?dist.toFixed(2):dist} km • Rp ${cost.toLocaleString('id-ID')}</span></div>
          <span style="font-size:10px;padding:4px 8px;border-radius:10px;background:${isForMe?'white':secondary};color:${isForMe?primary:'white'};font-weight:800">${isForMe?'UNTUK SAYA': isBroadcast?'BARU':'OPEN'}</span>
        </div>
        <div style="padding:12px">
          <div style="font-size:12px;color:var(--text);line-height:1.5">
            <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px"><span style="font-size:12px;margin-top:2px">📍</span><div style="flex:1"><b style="font-size:10px;color:var(--muted);display:block;letter-spacing:0.5px">PICKUP</b><span style="font-size:12px">${pickup}</span>${links.pLat?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${links.pLat.toFixed(5)}, ${links.pLng.toFixed(5)}</div>`:''}</div></div>
            <div style="display:flex;gap:8px;align-items:flex-start"><span style="font-size:12px;margin-top:2px">🎯</span><div style="flex:1"><b style="font-size:10px;color:var(--muted);display:block;letter-spacing:0.5px">TUJUAN</b><span style="font-size:12px">${dest}</span>${links.dLat?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${links.dLat.toFixed(5)}, ${links.dLng.toFixed(5)}</div>`:''}</div></div>
          </div>
          ${hasCoords?`<div style="margin-top:10px;background:var(--bg);border:1px solid var(--card2);border-radius:8px;padding:6px 8px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px;color:var(--muted)">📏 ${typeof dist==='number'?dist.toFixed(2):dist} km • ${o.trip_type==='roundtrip'?'PP x1.6':'Sekali jalan'}</span><span style="font-size:10px;background:${primary};color:white;padding:2px 6px;border-radius:6px">Koordinat akurat ✅</span></div>`:''}
          ${!vehMatch && isBroadcast? `<div style="font-size:10px;color:#d97706;background:#fef3c7;padding:4px 8px;border-radius:6px;margin-top:8px">⚠️ Beda kendaraan (${vTypeClean} vs ${driverProfile.jenis_kendaraan}) - tetap bisa ambil</div>`:''}
        </div>
        <div style="padding:0 12px 10px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            ${links.pickupLink?`<a href="${links.pickupLink}" target="_blank" style="flex:1;min-width:90px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 6px;border-radius:10px;text-align:center;font-size:11px;font-weight:600;text-decoration:none">📍 Pickup Map</a>`:''}
            ${links.destLink?`<a href="${links.destLink}" target="_blank" style="flex:1;min-width:90px;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 6px;border-radius:10px;text-align:center;font-size:11px;font-weight:600;text-decoration:none">🎯 Tujuan Map</a>`:''}
            ${links.routeLink?`<a href="${links.routeLink}" target="_blank" style="flex:1;min-width:90px;background:${primary};border:none;color:white;padding:8px 6px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">🗺️ Rute</a>`:''}
          </div>
          <div style="display:flex;gap:8px">
            <button data-driver-accept="${o.id}" class="btn primary" style="flex:1;background:${primary};color:white;padding:12px;border-radius:12px;font-weight:800;border:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer">✅ TERIMA ORDER</button>
            <button data-driver-reject="${o.id}" class="btn secondary" style="background:var(--card);border:1px solid var(--border);color:var(--muted);padding:10px 14px;border-radius:12px;font-weight:600;cursor:pointer">❌</button>
          </div>
        </div>
      </div>`;
    }).join('') + `<div style="text-align:center;margin-top:12px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px;color:var(--muted)">Auto refresh tiap 15 detik • tidak kedip</span><button id="btnRefreshDriverOrders" class="btn secondary" style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:8px;font-size:11px">🔄 Refresh</button></div>`;
    isFirstLoad=false;
  }catch(e){ 
    if(isFirstLoad){
      if(box) box.innerHTML = `<div style="padding:16px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:12px"><div style="font-size:20px">❌</div><div style="font-size:12px;color:#991b1b;margin-top:4px">Gagal memuat<br/>${e.message}</div><button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:10px">🔄 Coba lagi</button></div>`; 
    } else {
      console.warn('loadDriverOrders silent fail', e.message);
      if(infoEl) infoEl.textContent = `⚠️ Gagal update • ${e.message.slice(0,30)}`;
    }
  }
}

export function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  
  // FIX: debounce reload biar tidak kedip saat banyak event
  let reloadTimeout = null;
  function debouncedReload(silent=true){
    if(reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(()=> loadDriverOrders(driverProfile, silent), 600);
  }
  
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, payload=>{ 
      const o=payload.new; 
      if(o.driver_id===driverProfile.id || !o.driver_id){ 
        console.log('🔔 Order baru masuk realtime', o.id);
        debouncedReload(true); 
      } 
    })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, payload=>{
      const o=payload.new;
      // Hanya reload jika status masih open/searching atau untuk saya
      if(['searching','pending','new','open','created','waiting','accepted'].includes(o.status)){
        debouncedReload(true);
      } else if(o.driver_id===driverProfile.id){
        debouncedReload(true);
      }
    })
    .subscribe();
    
  // FIX: interval 15 detik, silent=true biar tidak kedip
  driverOrdersInterval = setInterval(()=> loadDriverOrders(driverProfile, true), 15000);
}

export function clearDriverOrdersSubscription(){ 
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; } 
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; } 
  lastOrdersHash=''; isFirstLoad=true;
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️'; 
  const statusLower = (p.status||'').toLowerCase();
  const isOnline = statusLower==='online'; 
  const theme = getAppTheme();
  
  let latLngText = 'Belum ada lokasi';
  try{
    if(p.lokasi){
      const m = p.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if(m){ 
        const lng = parseFloat(m[1]); const lat = parseFloat(m[2]);
        latLngText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
    } else if(p.last_lat && p.last_lng){
      latLngText = `${p.last_lat}, ${p.last_lng}`;
    }
  }catch(e){}
  
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)"><h3>🏍️ Driver - ${p.name} ${vehIcon}</h3><p class="muted" style="color:var(--muted)">${p.nopol||''} • ${vehIcon} • Status: <b id="drvStatus" style="color:${isOnline?'#16a34a':'var(--muted)'}">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px;background:#fef2f2;padding:6px 10px;border-radius:8px;border:1px solid #fecaca">⚠️ Lengkapi data di Profil (Nopol, SIM, HP, Jenis Kendaraan)</p>':''}<div class="row" style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white;border:none;padding:10px 16px;border-radius:10px;font-weight:700':'background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:10px'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}" style="${!isOnline?'background:#ef4444;color:white;border:none;padding:10px 16px;border-radius:10px;font-weight:700':'background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:10px'}">🔴 Offline</button></div></div>
  
  <div class="card" style="border:1px solid var(--border);background:var(--card)"><h4 style="color:var(--text)">📍 Lokasi Saya (Live GPS)</h4>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px;margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--muted)">Koordinat</span>
        <span style="font-size:10px;color:var(--muted)">Live GPS</span>
      </div>
      <div id="driverLocText" style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">${latLngText}</div>
      <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--muted)">KECEPATAN</div><div id="kpiSpeed" style="font-size:16px;font-weight:800;color:#22c55e">0.0</div><div style="font-size:9px;color:var(--muted)">km/h</div></div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--muted)">ARAH</div><div id="kpiHead" style="font-size:16px;font-weight:800;color:#f59e0b">0°</div><div style="font-size:9px;color:var(--muted)">heading</div></div>
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px;color:var(--muted)">UPDATE</div><div id="kpiUpd" style="font-size:12px;font-weight:700;color:var(--text)">-</div><div style="font-size:9px;color:var(--muted)">waktu</div></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <div style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px"><div style="font-size:8px;color:var(--muted)">LAT</div><div id="kpiLat" style="font-size:11px;color:var(--text)">-</div></div>
        <div style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px"><div style="font-size:8px;color:var(--muted)">LNG</div><div id="kpiLng" style="font-size:11px;color:var(--text)">-</div></div>
        <div style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px"><div style="font-size:8px;color:var(--muted)">AKURASI</div><div id="kpiAcc" style="font-size:11px;color:var(--text)">-</div></div>
      </div>
      <div id="driverLocStatus" style="margin-top:8px;font-size:10px;color:var(--muted)">Tap Go Online untuk mulai share lokasi</div>
    </div>
  </div>
  
  <div class="card" style="background:var(--card);border:1px solid var(--border)"><h4 style="color:var(--text)">📥 Order Masuk <span id="driverOrdersInfo" style="font-size:11px;color:var(--muted);font-weight:400"></span></h4><div id="driverOrders" style="min-height:80px">Menunggu order...</div></div><div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
  isFirstLoad=true;
  lastOrdersHash='';
  setTimeout(()=> loadDriverOrders(driverProfile, false),500); 
  subscribeDriverOrders(driverProfile); 
}

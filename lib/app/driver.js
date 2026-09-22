// driver.js - Halaman untuk driver - dipisah dari tracking.js
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

export async function loadDriverOrders(driverProfile){
  if(!driverProfile || driverProfile.role!=='driver') return;
  const box = document.getElementById('driverOrders'); const infoEl = document.getElementById('driverOrdersInfo');
  if(!box) return;
  const theme = getAppTheme(); const primary = theme.primary; const secondary = theme.secondary;
  if(infoEl) infoEl.textContent = '⏳ Mencari...';
  box.innerHTML = `<div style="padding:16px;text-align:center">⏳ Memuat order...</div>`;
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
    if(orders.length===0){ box.innerHTML = `<div style="padding:20px;text-align:center"><div>📭</div><div>Menunggu order...</div><button id="btnRefreshDriverOrders" class="btn secondary" style="margin-top:14px">🔄 Refresh</button></div>`; if(infoEl) infoEl.textContent=''; return; }
    if(infoEl) infoEl.textContent = `${orders.length} order`;
    box.innerHTML = orders.map(o=>{
      const isForMe = o.driver_id===driverProfile.id; const isBroadcast = !o.driver_id;
      let vTypeClean = 'motor'; try{ let vt=o.vehicle_type; if(typeof vt==='string'){ vt=vt.trim().toLowerCase(); if(vt.startsWith('{') || vt.includes('"ID"') || vt.includes('GOOGLE_ID')){ vt='motor'; } if(vt==='mobil'||vt==='motor'){ vTypeClean=vt; } } }catch(e){ vTypeClean='motor'; }
      const vehMatch = vTypeClean===(driverProfile.jenis_kendaraan||'motor');
      const pickup = o.pickup_text||o.pickup||'-'; const dest = o.dest_text||o.destination||'-'; const cost = o.estimated_cost||o.cost||0; const dist = o.distance_km||o.distance||0;
      return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:${isForMe?'2px solid '+primary:'1px solid #e2e8f0'};border-radius:14px;background:var(--card)">
        <div style="background:${isForMe?primary:'#0f172a'};color:white;padding:8px 12px;display:flex;justify-content:space-between"><b>${vTypeClean.toUpperCase()}</b><span style="font-size:10px;padding:3px 8px;border-radius:10px;background:${isForMe?'white':secondary};color:${isForMe?primary:'#0f172a'};font-weight:800">${isForMe?'UNTUK SAYA': isBroadcast?'BARU':o.status.toUpperCase()}</span></div>
        <div style="padding:12px"><div style="font-size:13px;color:var(--text)">📍 ${pickup}<br/>🎯 ${dest}</div><div style="margin-top:8px;display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">📏 ${typeof dist==='number'?dist.toFixed(2):dist} km</span><span style="font-weight:800;background:#fef3c7;padding:3px 8px;border-radius:6px">Rp ${cost.toLocaleString('id-ID')}</span></div>${!vehMatch && isBroadcast? `<div style="font-size:10px;color:#d97706;margin-top:6px">⚠️ Beda kendaraan</div>`:''}</div>
        <div style="padding:0 12px 12px;display:flex;gap:6px"><button data-driver-accept="${o.id}" class="btn primary" style="flex:1;background:${primary};color:white;padding:12px;border-radius:10px;font-weight:800;border:none">✅ TERIMA</button><button data-driver-reject="${o.id}" class="btn secondary" style="background:var(--card);border:1px solid var(--border);padding:10px 14px;border-radius:10px">❌</button></div></div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button id="btnRefreshDriverOrders" class="btn secondary">🔄 Refresh (${orders.length})</button></div>`;
  }catch(e){ if(box) box.innerHTML = `<div style="padding:16px;text-align:center;background:#fef2f2">Gagal memuat<br/>${e.message}</div>`; }
}

export function subscribeDriverOrders(driverProfile){
  if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; }
  if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; }
  driverOrdersChannel = supabase.channel('driver-orders-'+driverProfile.id)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'orders' }, payload=>{ const o=payload.new; if(o.driver_id===driverProfile.id || !o.driver_id){ loadDriverOrders(driverProfile); } })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'orders' }, ()=>{ loadDriverOrders(driverProfile); })
    .subscribe();
  driverOrdersInterval = setInterval(()=> loadDriverOrders(driverProfile), 10000);
}

export function clearDriverOrdersSubscription(){ if(driverOrdersChannel){ try{ supabase.removeChannel(driverOrdersChannel); }catch(e){} driverOrdersChannel=null; } if(driverOrdersInterval){ clearInterval(driverOrdersInterval); driverOrdersInterval=null; } }

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
  
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon}</h3><p class="muted">${p.nopol||''} • ${vehIcon} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi data di Profil</p>':''}<div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}" style="${isOnline?'background:'+theme.primary+';color:white':''}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div>
  
  <div class="card" style="border:1px solid #22c55e"><h4>📍 Lokasi Saya (Live GPS)</h4>
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
  
  <div class="card"><h4>📥 Order Masuk <span id="driverOrdersInfo"></span></h4><div id="driverOrders">Menunggu order...</div></div><div class="card" id="driverActiveOrderCard" style="display:none"></div>`;
}

export function initDriverPage(driverProfile){ 
  if(!driverProfile) return; 
  setTimeout(()=> loadDriverOrders(driverProfile),500); 
  subscribeDriverOrders(driverProfile); 
}


// trackingFood.js - FINAL - Tracking Food Delivery seperti tracking.js Ojol - Timer 5 menit + Modal + Realtime
// Flow: Driver terima dulu baru Warung masak
// Sama seperti tracking.js tapi untuk table food_orders
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

// ====== STATE FOOD ======
let foodOrderChannel = null;
let foodDriverLocChannel = null;
let foodTrackingInterval = null;
let foodOrderPollInterval = null;
let foodAutoTimer = null;
let foodCurrentOrderId = null;
let foodSearchStart = null;
const FOOD_TIMEOUT = 5*60; // 5 menit sama kayak Ojol

async function fetchDriverProfileFood(driverId){
  try{
    const { data } = await supabase.from('users').select('id,name,hp,jenis_kendaraan,nopol').eq('id', driverId).maybeSingle();
    return data;
  }catch(e){ return null; }
}

// ===== MODAL LOCK seperti showTrackingLockModal di tracking.js =====
export function showFoodTrackingLockModal(order){
  let modal = document.getElementById('foodTrackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'foodTrackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const mapStatus = {
    searching_driver: 'Mencari Driver Terdekat...',
    driver_assigned: 'Driver Sepakat - Menunggu Warung Masak',
    accepted: 'Driver Sepakat',
    preparing: 'Warung Masak',
    ready: 'Makanan Siap',
    picked: 'Driver OTW Antar',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  };
  const statusText = mapStatus[order.status]||order.status;
  div.innerHTML = `
    <div style="background:var(--card);border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🍔</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Pesanan Makanan Aktif</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px">
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;color:var(--text)">
          <div>🏪 ${order.pickup_text||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:var(--muted)">#${order.id.slice(0,6).toUpperCase()}</span></div>
          <div style="margin-top:6px;font-size:11px" class="muted">Total Rp ${Number(order.total||0).toLocaleString()} • ${ (order.items||[]).map(i=>i.name+' x'+i.qty).join(', ') }</div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoFoodTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Makanan</button>
          <button id="btnCancelFoodFromLock" style="background:var(--card);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Pesanan</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoFoodTracking')?.addEventListener('click', ()=>{ div.remove(); if(order.id) openFoodTrackingDetailModal(order.id); });
  document.getElementById('btnCancelFoodFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan?')) return;
    try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
    clearFoodTracking(); hideFoodTrackingUI(); div.remove();
  });
}
export function hideFoodTrackingLockModal(){ const m=document.getElementById('foodTrackingLockModal'); if(m) m.remove(); }

// ===== TRACKING UTAMA seperti tracking.js =====
export function startFoodTracking(orderId){
  if(!orderId) return;
  try{
    localStorage.setItem('active_food_order_id', orderId);
    localStorage.setItem('food_auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  foodCurrentOrderId = orderId;
  foodSearchStart = Date.now();
  loadFoodActiveTracking();
}

export function clearFoodTracking(){
  if(foodOrderPollInterval){ clearInterval(foodOrderPollInterval); foodOrderPollInterval=null; }
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
  const oid = localStorage.getItem('active_food_order_id') || foodCurrentOrderId;
  try{
    localStorage.removeItem('active_food_order_id');
    if(oid){
      localStorage.removeItem('food_auto_start_'+oid);
      localStorage.removeItem('food_auto_queue_'+oid);
    }
  }catch(e){}
  foodCurrentOrderId=null;
  hideFoodTrackingUI();
}

export async function loadFoodActiveTracking(){
  const orderId = localStorage.getItem('active_food_order_id') || foodCurrentOrderId;
  if(!orderId) return;
  foodCurrentOrderId = orderId;
  try{
    const { data: order } = await supabase.from('food_orders').select('*, stores(name)').eq('id', orderId).single();
    if(!order) return;
    if(['completed','cancelled'].includes(order.status)){
      clearFoodTracking(); return;
    }
    renderFoodActiveOrder(order);
    subscribeFoodOrder(orderId);
    if(order.driver_id){
      const driver = await fetchDriverProfileFood(order.driver_id);
      renderFoodActiveOrder(order, driver);
      subscribeFoodDriverLocation(order.driver_id);
    } else {
      startFoodUnifiedTimer(orderId);
    }
  }catch(e){ console.error('loadFoodActiveTracking fail', e); }
}

function renderFoodActiveOrder(order, driver=null){
  // Cari container, kalau tidak ada buat modal detail
  let card = document.getElementById('foodActiveOrderCard');
  if(!card){
    // fallback ke modal detail
    return;
  }
  const theme = getAppTheme();
  const statusMap = {
    searching_driver: '🔍 Mencari Driver Terdekat dari Warung...',
    driver_assigned: '✅ Driver & Pemesan Sepakat - Warung Masak',
    accepted: '✅ Driver Sepakat - Warung Masak',
    preparing: '🍳 Warung Sedang Masak...',
    ready: '🍱 Makanan Siap di Warung - Menunggu Driver Ambil',
    picked: '🚚 Driver OTW Antar ke Kamu',
    completed: '✅ Selesai',
    cancelled: '❌ Dibatalkan'
  };
  card.style.display='block';
  card.innerHTML = `
    <div style="background:${theme.primary};color:white;padding:12px 14px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:800;font-size:13px">🍔 Pesanan Makanan #${order.id.slice(0,6).toUpperCase()}</div>
        <div style="font-size:11px;opacity:0.9">${order.stores?.name||''} • Rp ${Number(order.total||0).toLocaleString()}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;opacity:0.8">Status</div>
        <div style="font-size:11px;font-weight:800">${(order.status||'').toUpperCase()}</div>
      </div>
    </div>
    <div style="padding:12px;background:var(--card);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px">
      <div style="font-size:12px">${statusMap[order.status]||order.status}</div>
      <div id="foodTrackingDistance" style="font-size:11px;color:var(--muted);margin-top:4px">-</div>
      <div style="font-size:11px;margin-top:8px" class="muted">🏪 ${order.pickup_text||''} → 🎯 ${order.dest_text||''}</div>
      ${driver ? `<div style="margin-top:8px;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:8px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:700;font-size:12px">${driver.name} ${driver.jenis_kendaraan==='mobil'?'🚗':'🏍️'}</div><div style="font-size:10px" class="muted">${driver.nopol||''}</div></div><a href="https://wa.me/${(driver.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62')}" target="_blank" style="background:#22c55e;color:#052e16;padding:6px 10px;border-radius:8px;font-size:11px;text-decoration:none;font-weight:700">💬 WA</a></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="btnFoodTrackingDetail" style="flex:1;background:${theme.primary};color:white;border:none;padding:10px;border-radius:10px;font-weight:700">📍 Detail Tracking</button>
        <button id="btnCancelFoodTracking" style="flex:1;background:var(--card2);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px">❌ Batal</button>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:space-between">
        <span style="font-size:10px" class="muted">⏱️ <span id="foodSearchTimer">00:00</span> / <span id="foodTimeout">05:00</span></span>
        <span style="font-size:10px" class="muted">ID ${order.id.slice(0,8)}</span>
      </div>
    </div>
  `;
  document.getElementById('btnFoodTrackingDetail')?.addEventListener('click', ()=> openFoodTrackingDetailModal(order.id));
  document.getElementById('btnCancelFoodTracking')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan?')) return;
    try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
    clearFoodTracking();
  });
}

function hideFoodTrackingUI(){
  const c = document.getElementById('foodActiveOrderCard');
  if(c) c.style.display='none';
  const m = document.getElementById('foodTrackingDetailModal');
  if(m) m.remove();
}

// ===== TIMER 5 MENIT SAMA KAYAK tracking.js =====
function startFoodUnifiedTimer(orderId){
  if(foodAutoTimer) clearInterval(foodAutoTimer);
  foodSearchStart = Date.now();
  try{
    const saved = localStorage.getItem('food_auto_start_'+orderId);
    if(saved){ const parsed=parseInt(saved); if(!isNaN(parsed)){ foodSearchStart=parsed; } }
    else { localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString()); }
  }catch(e){}
  foodAutoTimer = setInterval(async ()=>{
    const elapsed = Math.floor((Date.now()-foodSearchStart)/1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(Math.floor(elapsed%60)).padStart(2,'0');
    const remain = Math.max(0, FOOD_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');
    const t1 = document.getElementById('foodSearchTimer');
    const t2 = document.getElementById('foodTimeout');
    if(t1) t1.textContent = `${m}:${s}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    const t3 = document.getElementById('foodModalSearchTimer');
    const t4 = document.getElementById('foodModalTimeout');
    if(t3) t3.textContent = `${m}:${s}`;
    if(t4) t4.textContent = `${rm}:${rs}`;

    if(elapsed >= FOOD_TIMEOUT){
      clearInterval(foodAutoTimer); foodAutoTimer=null;
      try{
        const { data: cur } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
        if(cur && ['searching_driver'].includes(cur.status)){
          await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId);
        }
      }catch(e){}
      alert('⏰ 5 menit tidak ada driver terima order makanan. Pesanan dibatalkan otomatis.');
      clearFoodTracking();
    }
  },1000);
}

// ===== MODAL DETAIL TRACKING seperti di tracking.js =====
export async function openFoodTrackingDetailModal(orderId){
  try{
    const { data: order } = await supabase.from('food_orders').select('*, stores(name, alamat_text)').eq('id', orderId).single();
    if(!order) return;
    let old = document.getElementById('foodTrackingDetailModal');
    if(old) old.remove();
    const theme = getAppTheme();
    const div = document.createElement('div');
    div.id = 'foodTrackingDetailModal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    const statusMap = {
      searching_driver: 'Mencari Driver Terdekat...',
      driver_assigned: '✅ Driver & Pemesan Sepakat - Warung Masak',
      accepted: '✅ Driver Sepakat',
      preparing: 'Warung Masak 🍳',
      ready: 'Makanan Siap 🍱',
      picked: 'Driver OTW Antar 🚚',
      completed: 'Selesai ✅',
      cancelled: 'Dibatalkan ❌'
    };
    div.innerHTML = `
      <div style="background:var(--card);border-radius:18px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:2px solid ${theme.primary};max-height:90vh;overflow:auto">
        <div style="background:${theme.primary};color:white;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0">
          <div>
            <div style="font-weight:800;font-size:14px">🍔 Tracking Food #${order.id.slice(0,6).toUpperCase()}</div>
            <div style="font-size:11px;opacity:0.9">${order.stores?.name||''} • Rp ${Number(order.total||0).toLocaleString()}</div>
          </div>
          <button id="btnCloseFoodDetail" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:6px 10px;border-radius:8px">✕</button>
        </div>
        <div style="padding:14px">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-size:12px"><b>🏪 ${order.stores?.name||''}</b></div>
            <div style="font-size:11px" class="muted">${order.pickup_text||''}</div>
            <div style="font-size:11px;margin-top:8px"><b>🎯 ${order.dest_text||''}</b></div>
            <div style="font-size:11px;margin-top:6px">${(order.items||[]).map(i=> i.name + (i.variant?' ('+i.variant+')':'') + ' x'+i.qty).join(', ')}</div>
          </div>
          <div style="margin-top:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-size:12px;font-weight:700">📍 Status</div>
            <div id="foodDetailStatus" style="font-size:14px;font-weight:800;margin-top:6px;color:${theme.primary}">${statusMap[order.status]||order.status}</div>
            <div id="foodDetailDistance" style="font-size:11px;color:var(--muted);margin-top:4px">-</div>
            <div style="margin-top:10px;display:flex;gap:8px">
              <div style="flex:1;background:var(--card2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px" class="muted">KE WARUNG</div><div id="foodDetailToWarung" style="font-size:13px;font-weight:800">-</div></div>
              <div style="flex:1;background:var(--card2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:9px" class="muted">KE PEMESAN</div><div id="foodDetailToCust" style="font-size:13px;font-weight:800">-</div></div>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;justify-content:space-between">
              <span style="font-size:10px" class="muted">⏱️ <span id="foodModalSearchTimer">00:00</span> / <span id="foodModalTimeout">05:00</span></span>
              <span style="font-size:10px" class="muted">#${order.id.slice(0,8)}</span>
            </div>
          </div>
          <div id="foodDetailActions" style="margin-top:12px"></div>
          <button id="btnCancelFoodDetail" style="width:100%;margin-top:10px;background:var(--card);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Pesanan</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    document.getElementById('btnCloseFoodDetail')?.addEventListener('click', ()=>{ div.remove(); });
    document.getElementById('btnCancelFoodDetail')?.addEventListener('click', async ()=>{
      if(!confirm('Batalkan?')) return;
      try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', orderId); }catch(e){}
      div.remove(); clearFoodTracking();
    });

    function renderDetailActions(o){
      const box = document.getElementById('foodDetailActions');
      if(!box) return;
      if(o.status==='searching_driver'){
        box.innerHTML = `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:11px;color:#92400e">🔍 Mencari driver terdekat dari warung... Driver & pemesan harus sepakat dulu, baru warung masak.</div>`;
      } else if(o.status==='driver_assigned' || o.status==='accepted' || o.status==='preparing'){
        box.innerHTML = `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">✅ Driver sudah sepakat. Warung sedang masak 🍳</div>`;
      } else if(o.status==='ready'){
        box.innerHTML = `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍱 Makanan siap! Driver akan ambil di warung</div>`;
      } else if(o.status==='picked'){
        box.innerHTML = `<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:10px;padding:10px;font-size:11px;color:#1e40af">🚚 Driver OTW antar ke kamu</div>`;
      }
    }
    renderDetailActions(order);

    // Subscribe
    if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
    foodOrderChannel = supabase.channel('food-detail-'+orderId)
      .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, payload=>{
        const o=payload.new; if(!o) return;
        const sEl = document.getElementById('foodDetailStatus');
        if(sEl) sEl.textContent = statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(['completed','cancelled'].includes(o.status)){
          setTimeout(()=>{ div.remove(); clearFoodTracking(); if(o.status==='completed'){ alert('✅ Pesanan makanan selesai!'); } }, 800);
        }
      }).subscribe();

    // Polling jarak driver
    if(foodTrackingInterval) clearInterval(foodTrackingInterval);
    foodTrackingInterval = setInterval(async ()=>{
      try{
        const { data: o } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
        if(!o) return;
        const sEl = document.getElementById('foodDetailStatus');
        if(sEl) sEl.textContent = statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(o.driver_id && o.pickup_lat){
          try{
            const { data: loc } = await supabase.from('driver_locations').select('lat,lng').eq('driver_id', o.driver_id).maybeSingle();
            if(loc && loc.lat){
              const toWarung = haversineKm(loc.lat, loc.lng, o.pickup_lat, o.pickup_lng);
              const toCust = o.dest_lat ? haversineKm(loc.lat, loc.lng, o.dest_lat, o.dest_lng) : 0;
              const elW = document.getElementById('foodDetailToWarung');
              const elC = document.getElementById('foodDetailToCust');
              const elD = document.getElementById('foodDetailDistance');
              if(elW) elW.textContent = toWarung.toFixed(2)+' km';
              if(elC) elC.textContent = toCust.toFixed(2)+' km';
              if(elD){
                if(['driver_assigned','preparing','ready'].includes(o.status)){
                  elD.textContent = `Driver ${toWarung.toFixed(2)} km dari warung`;
                } else if(o.status==='picked'){
                  elD.textContent = `Driver ${toCust.toFixed(2)} km dari kamu`;
                } else if(o.status==='searching_driver'){
                  elD.textContent = `Mencari driver terdekat dari warung`;
                }
              }
            }
          }catch(e){}
        }
        if(['completed','cancelled'].includes(o.status)){
          clearInterval(foodTrackingInterval); foodTrackingInterval=null;
        }
      }catch(e){}
    }, 4000);

    if(order.status==='searching_driver') startFoodUnifiedTimer(orderId);

  }catch(e){
    console.error('openFoodTrackingDetailModal fail', e);
    alert('Gagal buka tracking: '+e.message);
  }
}

function subscribeFoodOrder(orderId){
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  foodOrderChannel = supabase.channel('food-order-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, async payload=>{
      const o=payload.new; if(!o) return;
      if(['completed','cancelled'].includes(o.status)){
        clearFoodTracking(); hideFoodTrackingUI();
        if(o.status==='cancelled'){ alert('❌ Pesanan makanan dibatalkan'); }
        if(o.status==='completed'){ alert('✅ Pesanan selesai!'); }
        return;
      }
      // Jika driver baru assigned
      if(o.driver_id && !foodDriverLocChannel){
        const driver = await fetchDriverProfileFood(o.driver_id);
        renderFoodActiveOrder(o, driver);
        subscribeFoodDriverLocation(o.driver_id);
      } else {
        renderFoodActiveOrder(o);
      }
    }).subscribe();
}

function subscribeFoodDriverLocation(driverId){
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  foodDriverLocChannel = supabase.channel('food-driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:'driver_id=eq.'+driverId }, payload=>{ if(payload.new) updateFoodDriverDistance(payload.new); })
    .subscribe();
}

function updateFoodDriverDistance(driverLoc){
  if(!driverLoc) return;
  // Ambil pickup dari localStorage atau dari order terakhir tidak disimpan, jadi pakai foodCurrentOrderId
  // Kita coba ambil dari card? Untuk simpel, kita hitung dari food order yang ada di memory tidak, jadi kita fetch order lagi? Untuk sekarang tampilkan jarak saja
  const el = document.getElementById('foodTrackingDistance');
  if(el){
    if(driverLoc.lat && driverLoc.lng){
      el.textContent = `📍 Driver online - ${driverLoc.lat.toFixed(4)}, ${driverLoc.lng.toFixed(4)}`;
    } else {
      el.textContent = `📍 Driver online`;
    }
  }
  const elDetail = document.getElementById('foodDetailDistance');
  if(elDetail && driverLoc.lat){
    elDetail.textContent = `📍 Driver ${driverLoc.lat.toFixed(4)}, ${driverLoc.lng.toFixed(4)}`;
  }
}

if(typeof window !== 'undefined'){
  window.startFoodTracking = startFoodTracking;
  window.clearFoodTracking = clearFoodTracking;
  window.openFoodTrackingDetailModal = openFoodTrackingDetailModal;
  window.showFoodTrackingLockModal = showFoodTrackingLockModal;
}

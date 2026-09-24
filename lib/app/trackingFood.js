// =================================================================================
// BLOK 6: BLOK TRACKING FOOD - TETAP MODAL (LOCK + DETAIL)
// =================================================================================
let foodOrderChannel = null;
let foodDriverLocChannel = null;
let foodTrackingInterval = null;
let foodOrderPollInterval = null;
let foodAutoTimer = null;
let foodCurrentOrderId = null;
let foodSearchStart = null;
const FOOD_TIMEOUT = 5*60;

async function fetchDriverProfileFood(driverId){
  try{
    const { data } = await supabase.from('users').select('id,name,hp,jenis_kendaraan,nopol').eq('id', driverId).maybeSingle();
    return data;
  }catch(e){ return null; }
}

export function showFoodTrackingLockModal(order){
  let modal = document.getElementById('foodTrackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'foodTrackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const mapStatus = {
    searching_driver: 'Mencari Driver...',
    driver_assigned: 'Menunggu Konfirmasi Driver',
    accepted: 'Driver Terima - Menunggu Warung Masak',
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
          <button id="btnCompleteFoodFromLock" style="background:#0ea5e9;color:white;border:none;padding:10px;border-radius:10px;font-weight:700;font-size:12px;display:none">✅ Selesai Pesanan</button>
          <button id="btnCancelFoodFromLock" style="background:var(--card);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Pesanan</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoFoodTracking')?.addEventListener('click', ()=>{ div.remove(); if(order.id) openFoodTrackingDetailModal(order.id); });
  const completeBtn = document.getElementById('btnCompleteFoodFromLock');
  if(completeBtn && order.status==='picked'){ completeBtn.style.display='block'; completeBtn.addEventListener('click', async ()=>{ if(!confirm('Selesaikan pesanan?')) return; try{ await supabase.from('food_orders').update({status:'completed'}).eq('id', order.id); }catch(e){} clearFoodTracking(); div.remove(); alert('✅ Pesanan selesai!'); }); }
  document.getElementById('btnCancelFoodFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan?')) return;
    try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
    clearFoodTracking(); hideFoodTrackingUI(); div.remove();
  });
}
export function hideFoodTrackingLockModal(){ const m=document.getElementById('foodTrackingLockModal'); if(m) m.remove(); }
export function hideFoodTrackingUI(){ const el=document.getElementById('foodActiveTracking'); if(el) el.style.display='none'; }
export function renderFoodActiveOrder(order, driver){}
export function startFoodUnifiedTimer(orderId){
  if(foodAutoTimer) clearInterval(foodAutoTimer);
  const startKey='food_auto_start_'+orderId;
  let start=parseInt(localStorage.getItem(startKey)||Date.now().toString());
  foodAutoTimer=setInterval(async ()=>{
    const elapsed=Math.floor((Date.now()-start)/1000);
    const remaining=FOOD_TIMEOUT-elapsed;
    const el=document.getElementById('foodAutoTimerText');
    if(el) el.textContent = remaining>0 ? `Auto batal dalam ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}` : 'Membatalkan...';
    if(remaining<=0){
      clearInterval(foodAutoTimer);
      try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', orderId); }catch(e){}
      clearFoodTracking(); alert('❌ Pesanan dibatalkan otomatis (5 menit tidak ada driver)');
    }
  }, 1000);
}

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
    const { data: order } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(!order || ['completed','cancelled'].includes(order.status)){
      clearFoodTracking(); return;
    }
    if(!document.getElementById('foodTrackingDetailModal')){
      showFoodTrackingLockModal(order);
    }
    subscribeFoodOrder(orderId);
    if(order.driver_id) subscribeFoodDriverLocation(order.driver_id);
    if(order.status==='searching_driver') startFoodUnifiedTimer(orderId);
  }catch(e){ console.error('loadFoodActiveTracking fail', e); }
}

export async function openFoodTrackingDetailModal(orderId){
  try{
    hideFoodTrackingLockModal();
    let modal=document.getElementById('foodTrackingDetailModal');
    if(modal) modal.remove();
    const { data: order } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(!order) throw new Error('Order tidak ditemukan');
    let driver=null;
    if(order.driver_id) driver=await fetchDriverProfileFood(order.driver_id);
    const statusMap={
      searching_driver:'Mencari Driver...',
      driver_assigned:'Driver Ditemukan',
      accepted:'Driver Sepakat',
      preparing:'Warung Masak',
      ready:'Makanan Siap',
      picked:'Driver OTW Antar',
      completed:'Selesai',
      cancelled:'Dibatalkan'
    };
    const theme=getAppTheme();
    const div=document.createElement('div');
    div.id='foodTrackingDetailModal';
    div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    div.innerHTML=`
      <div style="background:var(--card);width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:20px 20px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,0.3)">
        <div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div style="font-weight:800">🍔 Tracking Makanan #${order.id.slice(0,6).toUpperCase()}</div><div id="foodDetailStatus" style="font-size:11px;background:${theme.primary};color:white;padding:3px 8px;border-radius:99px;display:inline-block;margin-top:4px">${statusMap[order.status]||order.status}</div></div>
            <button onclick="document.getElementById('foodTrackingDetailModal').remove()" class="btn secondary" style="width:auto">✕</button>
          </div>
        </div>
        <div style="padding:16px">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-weight:700;font-size:12px">🏪 Warung: ${order.store_name||''}</div>
            <div style="font-size:11px" class="muted">${order.pickup_text||''}</div>
            <div style="margin-top:8px;font-weight:700;font-size:12px">🎯 Tujuan: ${order.dest_text||order.alamat_tujuan||''}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
              <span class="muted" style="font-size:11px">📍 Ke warung: <b id="foodDetailToWarung">-</b></span>
              <span class="muted" style="font-size:11px">🚚 Ke kamu: <b id="foodDetailToCust">-</b></span>
            </div>
            <div id="foodDetailDistance" class="muted" style="font-size:11px;margin-top:6px;background:var(--bg);padding:6px 10px;border-radius:8px">Menghitung jarak driver...</div>
            <div id="foodAutoTimerText" style="font-size:11px;color:#ef4444;margin-top:6px;font-weight:700"></div>
          </div>
          <div style="margin-top:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px">
            <div style="font-weight:800;font-size:12px">👤 Driver</div>
            <div id="foodDriverInfo" style="margin-top:6px;font-size:12px">${driver?`${driver.name} - ${driver.nopol||''} (${driver.jenis_kendaraan||'motor'})<br/><span class=muted>${driver.hp||''}</span>`:'<span class=muted>Belum ada driver</span>'}</div>
          </div>
          <div style="margin-top:12px">
            <div style="font-weight:800;font-size:12px;margin-bottom:6px">📦 Pesanan</div>
            <div style="font-size:11px">${(order.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${i.name} x${i.qty}</span><b>Rp ${Number(i.harga*i.qty).toLocaleString()}</b></div>`).join('')}</div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;font-weight:800"><span>Total</span><span>Rp ${Number(order.total||0).toLocaleString()}</span></div>
          </div>
          <div id="foodDetailActions" style="margin-top:16px"></div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button id="btnCancelFoodDetail" style="flex:1;background:var(--card);border:1px solid var(--border);color:#ef4444;padding:12px;border-radius:10px;font-weight:700">❌ Batal</button>
            <button id="btnCompleteFoodDetail" style="flex:1;background:#16a34a;color:white;border:none;padding:12px;border-radius:10px;font-weight:800;display:none">✅ Selesai</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    function renderDetailActions(o){
      const box=document.getElementById('foodDetailActions');
      if(!box) return;
      if(o.status==='searching_driver'){
        box.innerHTML=`<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:11px;color:#92400e">🔍 Broadcast ke semua driver... Menunggu driver terdekat terima order.</div>`;
      } else if(o.status==='driver_assigned'){
        box.innerHTML=`<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:10px;font-size:11px;color:#854d0e">⏳ Driver <b>${o.driver_id?o.driver_id.slice(0,6):''}</b> sudah dipilih, menunggu konfirmasi driver...<br><small>Driver belum klik Terima. Jika driver menolak, order kembali mencari.</small></div>`;
      } else if(o.status==='accepted'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">✅ Driver sudah terima order! Menunggu warung konfirmasi & masak 🍳</div>`;
      } else if(o.status==='preparing'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍳 Warung sedang masak pesanan kamu...</div>`;
      } else if(o.status==='ready'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍱 Makanan siap! Driver akan ambil di warung</div>`;
      } else if(o.status==='picked'){
        box.innerHTML=`<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:10px;padding:10px;font-size:11px;color:#1e40af">🚚 Driver OTW antar ke kamu</div>`;
        const btnC=document.getElementById('btnCompleteFoodDetail'); if(btnC) btnC.style.display='block';
      }
    }
    renderDetailActions(order);
    document.getElementById('btnCancelFoodDetail')?.addEventListener('click', async ()=>{
      if(!confirm('Batalkan pesanan?')) return;
      try{ await supabase.from('food_orders').update({status:'cancelled'}).eq('id', orderId); }catch(e){}
      clearFoodTracking(); div.remove();
    });
    document.getElementById('btnCompleteFoodDetail')?.addEventListener('click', async ()=>{
      if(!confirm('Selesaikan pesanan?')) return;
      try{ await supabase.from('food_orders').update({status:'completed'}).eq('id', orderId); }catch(e){}
      clearFoodTracking(); div.remove(); alert('✅ Selesai');
    });
    if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
    foodOrderChannel = supabase.channel('food-detail-'+orderId)
      .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, payload=>{
        const o=payload.new; if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(['completed','cancelled'].includes(o.status)){ setTimeout(()=>{ div.remove(); clearFoodTracking(); }, 800); }
      }).subscribe();
    if(foodTrackingInterval) clearInterval(foodTrackingInterval);
    foodTrackingInterval=setInterval(async ()=>{
      try{
        const { data: o } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
        if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(o.driver_id && o.pickup_lat){
          const { data: loc } = await supabase.from('driver_locations').select('lat,lng').eq('driver_id', o.driver_id).maybeSingle();
          if(loc?.lat){
            const toWarung=haversineKm(loc.lat, loc.lng, o.pickup_lat, o.pickup_lng);
            const toCust=o.dest_lat?haversineKm(loc.lat, loc.lng, o.dest_lat, o.dest_lng):0;
            const elW=document.getElementById('foodDetailToWarung'); if(elW) elW.textContent=toWarung.toFixed(2)+' km';
            const elC=document.getElementById('foodDetailToCust'); if(elC) elC.textContent=toCust.toFixed(2)+' km';
            const elD=document.getElementById('foodDetailDistance');
            if(elD){
              if(['driver_assigned','preparing','ready'].includes(o.status)) elD.textContent=`Driver ${toWarung.toFixed(2)} km dari warung`;
              else if(o.status==='picked') elD.textContent=`Driver ${toCust.toFixed(2)} km dari kamu`;
            }
          }
        }
        if(['completed','cancelled'].includes(o.status)){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
      }catch(e){}
    }, 4000);
    if(order.status==='searching_driver') startFoodUnifiedTimer(orderId);
  }catch(e){ console.error('openFoodTrackingDetailModal fail', e); alert('Gagal buka tracking: '+e.message); }
}

function subscribeFoodOrder(orderId){
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  foodOrderChannel = supabase.channel('food-order-'+orderId)
    .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, async payload=>{
      const o=payload.new; if(!o) return;
      if(['completed','cancelled'].includes(o.status)){
        clearFoodTracking(); hideFoodTrackingUI();
        if(o.status==='cancelled') alert('❌ Pesanan makanan dibatalkan');
        if(o.status==='completed') alert('✅ Pesanan selesai!');
        return;
      }
      if(o.driver_id && !foodDriverLocChannel){
        const driver=await fetchDriverProfileFood(o.driver_id);
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
  const el=document.getElementById('foodTrackingDistance');
  if(el && driverLoc?.lat) el.textContent=`📍 Driver ${driverLoc.lat.toFixed(4)}, ${driverLoc.lng.toFixed(4)}`;
  const elDetail=document.getElementById('foodDetailDistance');
  if(elDetail && driverLoc?.lat) elDetail.textContent=`📍 Driver ${driverLoc.lat.toFixed(4)}, ${driverLoc.lng.toFixed(4)}`;
}

// EXPORT GLOBAL - Biar bisa dipanggil dari storeViews
if(typeof window !== 'undefined'){
  window.trackingFood = {
    startFoodTracking,
    clearFoodTracking,
    openFoodTrackingDetailModal,
    showFoodTrackingLockModal,
    loadFoodActiveTracking
  };
  window.startFoodTracking = startFoodTracking;
  window.clearFoodTracking = clearFoodTracking;
  window.openFoodTrackingDetailModal = openFoodTrackingDetailModal;
  window.showFoodTrackingLockModal = showFoodTrackingLockModal;
}

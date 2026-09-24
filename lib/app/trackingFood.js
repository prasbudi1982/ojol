
// trackingFood.js - FINAL - Pakai rating asli: /lib/app/rating.js (driver) + /lib/app/store/ratingStore.js (warung)
import { supabase } from '../supabase.js';
import { haversineKm } from './geofence.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

async function fetchDriverProfileFood(driverId){
  try{
    const { data } = await supabase.from('users').select('id,name,hp,jenis_kendaraan,nopol').eq('id', driverId).maybeSingle();
    return data;
  }catch(e){ return null; }
}

// Rating: pakai file asli kamu + auto tutup modal + kosongkan keranjang

// Rating: TIDAK pakai dynamic import (fix Failed to fetch dynamically imported module)
async function openRatingForCompletedFoodOrder(order){
  try{
    if(!order) return;
    try{ if(localStorage.getItem('rated_food_'+order.id)) return; }catch(e){}
    try{
      document.getElementById('foodTrackingDetailModal')?.remove();
      document.getElementById('foodTrackingLockModal')?.remove();
      document.getElementById('foodActiveTracking')?.remove();
    }catch(e){}
    try{
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
      localStorage.removeItem('active_food_order_id');
      localStorage.removeItem('food_auto_start_'+order.id);
      localStorage.removeItem('last_food_driver_id');
      localStorage.removeItem('last_food_driver_name');
      if(window._updateCartBadge) window._updateCartBadge();
      const badge=document.getElementById('cartBadge'); if(badge) badge.textContent='0';
    }catch(e){}
    
    if(!order.driver_id){
      setTimeout(()=> alert('✅ Pesanan selesai! Order #'+order.id.slice(0,6).toUpperCase()+' selesai. Terima kasih!'), 400);
      return;
    }

    const driver = await fetchDriverProfileFood(order.driver_id);
    
    // Tampilkan rating driver + warung langsung (tanpa import rating.js agar tidak failed fetch di Pages.dev)
    setTimeout(()=> showCombinedRatingModal(order, driver), 600);
  }catch(e){ console.error('openRating error', e); }
}

function showCombinedRatingModal(order, driver){
  let existing=document.getElementById('foodRatingModal'); if(existing) existing.remove();
  const theme=getAppTheme();
  const div=document.createElement('div');
  div.id='foodRatingModal';
  div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.9);backdrop-filter:blur(10px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
  const driverName=driver?.name||'Driver';
  const storeName=order.pickup_text||'Warung';
  div.innerHTML=`
    <div style="background:var(--card,white);border-radius:20px;max-width:400px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.5);border:2px solid ${theme.primary};max-height:90vh;overflow:auto">
      <div style="background:${theme.primary};color:white;padding:18px;text-align:center">
        <div style="font-size:36px">⭐</div>
        <div style="font-weight:800;font-size:16px;margin-top:6px">Pesanan Selesai!</div>
        <div style="font-size:12px;opacity:0.9;margin-top:2px">#${order.id.slice(0,6).toUpperCase()} • Terima kasih</div>
      </div>
      <div style="padding:18px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:14px;font-size:12px">
          <div style="font-weight:700">🏪 ${storeName}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${(order.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
          <div style="font-size:11px;margin-top:4px;font-weight:700">Total Rp ${Number(order.total||0).toLocaleString()}</div>
        </div>
        
        <div style="margin-bottom:14px">
          <div style="font-weight:800;font-size:13px;margin-bottom:6px">🏍️ Rating Driver - ${driverName}</div>
          <div id="dStars" style="display:flex;gap:4px;justify-content:center;margin:6px 0">
            ${[1,2,3,4,5].map(n=>`<button data-d="${n}" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>`).join('')}
          </div>
          <div id="dLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang driver</div>
        </div>

        <div style="margin-bottom:14px">
          <div style="font-weight:800;font-size:13px;margin-bottom:6px">🍔 Rating Warung</div>
          <div id="wStars" style="display:flex;gap:4px;justify-content:center;margin:6px 0">
            ${[1,2,3,4,5].map(n=>`<button data-w="${n}" style="font-size:30px;background:none;border:none;cursor:pointer;opacity:0.3">⭐</button>`).join('')}
          </div>
          <div id="wLabel" style="text-align:center;font-size:11px;color:#64748b;height:14px">Tap bintang warung</div>
        </div>

        <textarea id="rateNote" placeholder="Komentar (opsional)" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:8px;font-size:12px;height:50px;resize:none;margin-bottom:10px"></textarea>
        
        <div style="display:flex;gap:8px">
          <button id="btnSendRate" style="flex:1;background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">Kirim Rating</button>
          <button id="btnSkipRate" style="flex:1;background:#f1f5f9;border:1px solid #e2e8f0;padding:12px;border-radius:10px;font-weight:700;font-size:12px">Nanti</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);

  let dRate=0, wRate=0;
  const dStars=div.querySelectorAll('[data-d]');
  const wStars=div.querySelectorAll('[data-w]');
  const dLabel=div.querySelector('#dLabel');
  const wLabel=div.querySelector('#wLabel');
  const labels={1:'Buruk',2:'Kurang',3:'Cukup',4:'Baik',5:'Luar Biasa'};

  dStars.forEach(b=>{
    b.addEventListener('click', ()=>{
      dRate=parseInt(b.dataset.d);
      dStars.forEach((x,i)=> x.style.opacity = i<dRate ? '1' : '0.3');
      dLabel.textContent = labels[dRate]+' untuk driver';
    });
  });
  wStars.forEach(b=>{
    b.addEventListener('click', ()=>{
      wRate=parseInt(b.dataset.w);
      wStars.forEach((x,i)=> x.style.opacity = i<wRate ? '1' : '0.3');
      wLabel.textContent = labels[wRate]+' untuk warung';
    });
  });

  div.querySelector('#btnSkipRate').onclick=()=>{ try{ localStorage.setItem('rated_food_'+order.id,'1'); }catch(e){} div.remove(); };
  div.querySelector('#btnSendRate').onclick=async ()=>{
    if(dRate===0 && wRate===0){ alert('Pilih bintang dulu'); return; }
    div.querySelector('#btnSendRate').textContent='Mengirim...';
    try{
      // Driver rating - coba ke tabel ratings
      if(dRate>0 && order.driver_id){
        try{
          const { data:{user} } = await supabase.auth.getUser();
          let passengerId=null;
          if(user){ const {data:u}=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); if(u) passengerId=u.id; }
          await supabase.from('ratings').insert({ driver_id: order.driver_id, order_id: order.id, passenger_id: passengerId, rating: dRate, comment: div.querySelector('#rateNote').value, created_at: new Date().toISOString() });
        }catch(e){
          try{
            await supabase.from('ratings').insert({ driver_id: order.driver_id, rating: dRate, order_id: order.id });
          }catch(e2){
            try{
              let l=JSON.parse(localStorage.getItem('local_ratings')||'[]');
              l.push({driver_id:order.driver_id, rating:dRate, order_id:order.id, at:Date.now()});
              localStorage.setItem('local_ratings', JSON.stringify(l));
            }catch(e3){}
          }
        }
      }
      // Store rating - coba ke tabel store_ratings
      if(wRate>0 && order.store_id){
        try{
          const { data:{user} } = await supabase.auth.getUser();
          let customerId=null;
          if(user){ const {data:u}=await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle(); if(u) customerId=u.id; }
          await supabase.from('store_ratings').insert({ store_id: order.store_id, customer_id: customerId, food_order_id: order.id, rating: wRate, comment: div.querySelector('#rateNote').value });
        }catch(e){
          try{
            await supabase.from('store_ratings').insert({ store_id: order.store_id, rating: wRate, food_order_id: order.id });
          }catch(e2){
            try{
              let sl=JSON.parse(localStorage.getItem('local_store_ratings')||'[]');
              sl.push({store_id:order.store_id, rating:wRate, order_id:order.id, at:Date.now()});
              localStorage.setItem('local_store_ratings', JSON.stringify(sl));
            }catch(e3){}
          }
        }
      }
      localStorage.setItem('rated_food_'+order.id,'1');
      try{ document.dispatchEvent(new CustomEvent('rating:completed', {detail:{orderId: order.id}})); }catch(e){}
      alert('✅ Terima kasih ratingnya!');
      div.remove();
    }catch(e){
      console.error('rating fail', e);
      localStorage.setItem('rated_food_'+order.id,'1');
      div.remove();
      alert('✅ Rating disimpan!');
    }
  };
}

function showStoreRatingModal(order){ showCombinedRatingModal(order, null); }
function showFallbackRatingModal(order, driver){ showCombinedRatingModal(order, driver); }


let foodOrderChannel = null;
let foodDriverLocChannel = null;
let foodTrackingInterval = null;
let foodOrderPollInterval = null;
let foodAutoTimer = null;
let foodCurrentOrderId = null;
let foodSearchStart = null;
let foodSearchSeconds = 0;
let foodLastKnownDriverId = null;
let foodLastDriverLoc = null;
let foodNoDriverTimer = null;
const FOOD_TIMEOUT = 5*60;

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
    accepted: 'Driver Terima',
    preparing: 'Warung Masak',
    ready: 'Makanan Siap',
    picked: 'Driver OTW',
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
          <div style="margin-top:6px;font-size:11px" class="muted">Total Rp ${Number(order.total||0).toLocaleString()} • ${(order.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div>
          <div id="foodAutoTimerText" style="margin-top:8px;font-size:11px;color:#ef4444;font-weight:700"></div>
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
export function hideFoodTrackingUI(){ const el=document.getElementById('foodActiveTracking'); if(el) el.style.display='none'; }
export function renderFoodActiveOrder(order, driver){}

export function startFoodTracking(orderId){
  if(!orderId) return;
  try{
    localStorage.removeItem('last_food_driver_id');
    localStorage.removeItem('last_food_driver_name');
    localStorage.setItem('food_auto_start_'+orderId, Date.now().toString());
  }catch(e){}
  foodLastKnownDriverId = null;
  foodSearchStart = Date.now();
  foodSearchSeconds = 0;
  localStorage.setItem('active_food_order_id', orderId);
  foodCurrentOrderId = orderId;
  loadFoodActiveTracking();
}

export function clearFoodTracking(){
  if(foodOrderPollInterval){ clearInterval(foodOrderPollInterval); foodOrderPollInterval=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  if(foodTrackingInterval){ clearInterval(foodTrackingInterval); foodTrackingInterval=null; }
  try{
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}));
    localStorage.removeItem('active_food_order_id');
    if(foodCurrentOrderId){
      localStorage.removeItem('food_auto_start_'+foodCurrentOrderId);
      sessionStorage.removeItem('food_accept_alert_'+foodCurrentOrderId);
    }
    if(window._updateCartBadge) try{ window._updateCartBadge(); }catch(e){}
  }catch(e){}
  foodCurrentOrderId=null; foodSearchStart=null; foodSearchSeconds=0; foodLastKnownDriverId=null;
  hideFoodTrackingUI();
  try{
    document.getElementById('foodTrackingDetailModal')?.remove();
    document.getElementById('foodTrackingLockModal')?.remove();
  }catch(e){}
}

export async function loadFoodActiveTracking(){
  const orderId = localStorage.getItem('active_food_order_id') || foodCurrentOrderId;
  if(!orderId) return;
  foodCurrentOrderId = orderId;
  try{
    const { data: order, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(error || !order){ clearFoodTracking(); return; }
    if(['completed','cancelled'].includes(order.status)){ 
      if(order.status==='completed') openRatingForCompletedFoodOrder(order);
      else clearFoodTracking();
      return; 
    }
    if(order.driver_id){
      foodLastKnownDriverId = order.driver_id;
      const driver = await fetchDriverProfileFood(order.driver_id);
      renderFoodActiveOrder(order, driver);
      subscribeFoodDriverLocation(order.driver_id);
      startFoodDistanceUpdater(order);
    } else {
      renderFoodActiveOrder(order, null);
    }
    subscribeFoodOrder(orderId);
    if(['searching_driver','driver_assigned'].includes(order.status)){
      startFoodUnifiedTimer(orderId);
    }
  }catch(e){ console.error('loadFoodActiveTracking error', e); }
}

export async function openFoodTrackingDetailModal(orderId){
  if(!orderId) return;
  try{
    const { data: order, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
    if(error || !order) return alert('Order tidak ditemukan');
    let modal=document.getElementById('foodTrackingDetailModal');
    if(modal) modal.remove();
    const theme=getAppTheme();
    const div=document.createElement('div');
    div.id='foodTrackingDetailModal';
    div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0';
    const statusMap={
      searching_driver: 'Mencari Driver...',
      driver_assigned: 'Menunggu Konfirmasi Driver',
      accepted: 'Driver Terima',
      preparing: 'Warung Masak',
      ready: 'Makanan Siap',
      picked: 'Driver OTW',
      completed: 'Selesai',
      cancelled: 'Dibatalkan'
    };
    const itemsHtml=(order.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px dashed var(--border)"><span>${i.name} x${i.qty}</span><span>Rp ${Number(i.harga||0*i.qty).toLocaleString()}</span></div>`).join('');
    
    function renderDetailActions(o){
      const box=document.getElementById('foodDetailActionsBox');
      if(!box) return;
      if(o.status==='searching_driver'){
        box.innerHTML=`<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:11px;color:#92400e">⏳ Mencari driver terdekat... <span id="singleTimeout" style="font-weight:800"></span></div>`;
      } else if(['driver_assigned','accepted','preparing'].includes(o.status)){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">✅ Driver sudah sepakat. Warung sedang masak 🍳</div>`;
      } else if(o.status==='ready'){
        box.innerHTML=`<div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:11px;color:#166534">🍱 Makanan siap! Driver akan ambil di warung</div>`;
      } else if(o.status==='picked'){
        box.innerHTML=`<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:10px;padding:10px;font-size:11px;color:#1e40af">🚚 Driver OTW antar ke kamu</div>`;
      }
    }

    div.innerHTML=`
      <div style="background:var(--card);border-radius:20px 20px 0 0;max-width:520px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 -10px 40px rgba(0,0,0,0.3)">
        <div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:2;border-radius:20px 20px 0 0">
          <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div><div style="font-weight:800;font-size:15px">🍔 Tracking Makanan</div><div style="font-size:11px;color:var(--muted)">#${order.id.slice(0,6).toUpperCase()} • <span id="foodDetailStatus" style="font-weight:700;color:${theme.primary}">${statusMap[order.status]||order.status}</span></div></div>
            <button onclick="document.getElementById('foodTrackingDetailModal')?.remove()" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--card2)">✕</button>
          </div>
          <div id="foodDetailDistance" style="margin-top:8px;font-size:11px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px">📍 Menghubungkan...</div>
        </div>
        <div style="padding:16px">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;font-size:12px">
            <div>🏪 ${order.pickup_text||''}</div><div style="margin-top:4px">🎯 ${order.dest_text||''}</div>
            <div style="margin-top:8px">${itemsHtml}</div>
            <div style="margin-top:8px;font-weight:800">Total Rp ${Number(order.total||0).toLocaleString()}</div>
          </div>
          <div id="foodDetailActionsBox" style="margin-top:12px"></div>
        </div>
      </div>`;
    document.body.appendChild(div);
    renderDetailActions(order);

    if(foodOrderChannel){ try{ supabase.removeChannel(foodOrderChannel); }catch(e){} foodOrderChannel=null; }
    foodOrderChannel = supabase.channel('food-detail-'+orderId)
      .on('postgres_changes', { event:'*', schema:'public', table:'food_orders', filter:'id=eq.'+orderId }, payload=>{
        const o=payload.new; if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(['completed','cancelled'].includes(o.status)){
          setTimeout(()=>{ 
            div.remove(); 
            if(o.status==='completed') openRatingForCompletedFoodOrder(o);
            else clearFoodTracking();
          }, 800);
        }
      }).subscribe();

    if(foodTrackingInterval) clearInterval(foodTrackingInterval);
    foodTrackingInterval=setInterval(async ()=>{
      try{
        const { data: o } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
        if(!o) return;
        const sEl=document.getElementById('foodDetailStatus'); if(sEl) sEl.textContent=statusMap[o.status]||o.status;
        renderDetailActions(o);
        if(['completed','cancelled'].includes(o.status)){ 
          clearInterval(foodTrackingInterval); foodTrackingInterval=null;
          div.remove();
          if(o.status==='completed') openRatingForCompletedFoodOrder(o);
          else clearFoodTracking();
        }
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
        const isComp = o.status==='completed';
        const compData = isComp ? {...o} : null;
        try{
          document.getElementById('foodTrackingDetailModal')?.remove();
          document.getElementById('foodTrackingLockModal')?.remove();
        }catch(e){}
        if(o.status==='cancelled'){
          clearFoodTracking();
          alert('❌ Pesanan makanan dibatalkan');
        }
        if(isComp && compData){ openRatingForCompletedFoodOrder(compData); }
        else { clearFoodTracking(); }
        return;
      }
      handleFoodOrderRejection(o);
    }).subscribe();
  if(foodOrderPollInterval) clearInterval(foodOrderPollInterval);
  foodOrderPollInterval = setInterval(async ()=>{
    try{
      const { data: o, error } = await supabase.from('food_orders').select('*').eq('id', orderId).single();
      if(error || !o) return;
      if(['completed','cancelled'].includes(o.status)){
        const isComp = o.status==='completed';
        const compData = isComp ? {...o} : null;
        clearInterval(foodOrderPollInterval); foodOrderPollInterval=null;
        try{
          document.getElementById('foodTrackingDetailModal')?.remove();
          document.getElementById('foodTrackingLockModal')?.remove();
        }catch(e){}
        if(o.status==='cancelled'){ clearFoodTracking(); }
        if(isComp && compData){ openRatingForCompletedFoodOrder(compData); }
        else clearFoodTracking();
        return;
      }
      handleFoodOrderRejection(o);
    }catch(e){}
  }, 4000);
}

function handleFoodOrderRejection(newOrder){
  if(newOrder.driver_id){
    foodLastKnownDriverId = newOrder.driver_id;
    fetchDriverProfileFood(newOrder.driver_id).then(driver=>{
      renderFoodActiveOrder(newOrder, driver);
      subscribeFoodDriverLocation(newOrder.driver_id);
      startFoodDistanceUpdater(newOrder);
      const sEl=document.getElementById('foodDetailStatus');
      if(sEl){
        const map={searching_driver:'Mencari Driver...',driver_assigned:'Menunggu Konfirmasi Driver',accepted:'Driver Terima',preparing:'Warung Masak',ready:'Makanan Siap',picked:'Driver OTW',completed:'Selesai',cancelled:'Dibatalkan'};
        sEl.textContent=map[newOrder.status]||newOrder.status;
      }
      if(newOrder.status==='accepted'){
        try{
          const key='food_accept_alert_'+newOrder.id;
          if(!sessionStorage.getItem(key)){
            sessionStorage.setItem(key,'1');
            setTimeout(()=> alert('✅ Driver '+ (driver?.name||'') +' menerima pesanan!'), 500);
          }
        }catch(e){}
      }
    });
  } else {
    renderFoodActiveOrder(newOrder, null);
  }
}

function startFoodUnifiedTimer(orderId){
  if(foodAutoTimer){ clearInterval(foodAutoTimer); foodAutoTimer=null; }
  if(foodNoDriverTimer){ clearInterval(foodNoDriverTimer); foodNoDriverTimer=null; }
  foodSearchStart = Date.now();
  foodSearchSeconds = 0;
  try{
    const saved = localStorage.getItem('food_auto_start_'+orderId);
    if(saved){
      const parsed = parseInt(saved);
      if(!isNaN(parsed)){
        foodSearchStart = parsed;
        foodSearchSeconds = Math.floor((Date.now()-parsed)/1000);
      }
    } else {
      localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString());
    }
  }catch(e){
    try{ localStorage.setItem('food_auto_start_'+orderId, foodSearchStart.toString()); }catch(e2){}
  }
  foodAutoTimer = setInterval(async ()=>{
    const elapsed = Math.floor((Date.now()-foodSearchStart)/1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(Math.floor(elapsed%60)).padStart(2,'0');
    const remain = Math.max(0, FOOD_TIMEOUT - elapsed);
    const rm = String(Math.floor(remain/60)).padStart(2,'0');
    const rs = String(Math.floor(remain%60)).padStart(2,'0');
    const t1 = document.getElementById('singleSearchTimer');
    const t2 = document.getElementById('singleTimeout');
    const t3 = document.getElementById('singleTimeout2');
    const tAuto = document.getElementById('foodAutoTimerText');
    if(t1) t1.textContent = `${m}:${s}`;
    if(t2) t2.textContent = `${rm}:${rs}`;
    if(t3) t3.textContent = `${rm}:${rs}`;
    if(tAuto) tAuto.textContent = remain>0 ? `Auto batal dalam ${rm}:${rs}` : 'Membatalkan...';
    if(elapsed >= FOOD_TIMEOUT){
      clearInterval(foodAutoTimer); foodAutoTimer=null;
      try{
        const { data: cur } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
        if(cur && ['searching_driver','driver_assigned'].includes(cur.status)){
          await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', orderId);
        }
      }catch(e){ console.warn('cancel food timeout fail', e.message); }
      try{
        localStorage.removeItem('food_auto_start_'+orderId);
        localStorage.removeItem('last_food_driver_id');
        localStorage.removeItem('last_food_driver_name');
      }catch(e){}
      alert('⏰ 5 menit tidak ada respon driver. Order makanan dibatalkan otomatis.');
      clearFoodTracking();
      hideFoodTrackingUI();
    }
  },1000);
}

function subscribeFoodDriverLocation(driverId){
  if(foodDriverLocChannel){ try{ supabase.removeChannel(foodDriverLocChannel); }catch(e){} foodDriverLocChannel=null; }
  foodDriverLocChannel = supabase.channel('food-driver-loc-'+driverId)
    .on('postgres_changes', { event:'*', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driverId}` }, payload=>{ if(payload.new) updateFoodDriverDistance(payload.new); })
    .subscribe();
}
function updateFoodDriverDistance(driverLoc){
  if(!driverLoc) return; foodLastDriverLoc = driverLoc;
  const pickupLat = parseFloat(localStorage.getItem('food_pickup_lat')); const pickupLng = parseFloat(localStorage.getItem('food_pickup_lng'));
  let dLat,dLng; if(driverLoc.lat&&driverLoc.lng){ dLat=driverLoc.lat; dLng=driverLoc.lng; } else if(driverLoc.lokasi){ const m = driverLoc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }
  const el = document.getElementById('foodDetailDistance');
  if(!dLat||!pickupLat){ if(el) el.textContent = `📍 Driver online`; return; }
  const dist = haversineKm(dLat,dLng,pickupLat,pickupLng);
  if(el){ el.textContent = dist<0.1? `🎉 Driver dekat! ${dist.toFixed(2)} km` : `📍 Driver ${dist.toFixed(2)} km dari warung`; }
}
function startFoodDistanceUpdater(order){
  if(foodTrackingInterval) clearInterval(foodTrackingInterval);
  foodTrackingInterval = setInterval(async ()=>{
    if(!order.driver_id) return;
    try{ const { data } = await supabase.from('driver_locations').select('*').eq('driver_id', order.driver_id).single(); if(data) updateFoodDriverDistance(data); }catch(e){}
  },5000);
}

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

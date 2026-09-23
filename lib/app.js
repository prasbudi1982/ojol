
// app.js - FINAL OPSI A - Pisah trackingFood.js + Peta Food berfungsi + Batalkan & Selesai + 5 Driver Terdekat (mirip order.js)
// Struktur sama kayak Ojol: driver.js clean, tracking.js ojek, trackingFood.js food

import { supabase } from './app/supabase.js';
import { SURUH_CENTER, ACTIVE_KECAMATAN_NAME } from './app/config.js';
import { isInSuruhBbox, getActiveKecamatanName } from './app/geofence.js';
import { getSession, getProfile, deleteAccount } from './app/user.js';
import * as order from './app/order.js';
window.order = order;
import * as map from './app/map.js';
window.mapModule = map; window.updateOrderEstimate = order.updateOrderEstimate;
import { viewLogin, viewHome, viewOnboarding } from './app/views.js';
import { viewPassenger } from './app/order.js';
import { viewDriver } from './app/driver.js';
import { viewProfile } from './app/user.js';
import { viewAdminDashboard, viewAdminSettings } from './app/admin.js';
import * as push from './app/push.js';
import * as tracking from './app/tracking.js';
window.tracking = tracking;
import * as driver from './app/driver.js';
import * as trackingFood from './app/trackingFood.js';
window.trackingFood = trackingFood;
import * as admin from './app/admin.js';
import * as report from './app/report.js';
import * as history from './app/history.js';
import * as rating from './app/rating.js';

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let nearbyChannel = null;
let pushChannel = null;
let storeMods = null;
let lastStoreError = '';

async function getStoreMods(){
  if(storeMods) return storeMods;
  try{
    const [idx, views] = await Promise.all([
      import('./app/store/index.js'),
      import('./app/storeViews.js')
    ]);
    storeMods = { ...idx, ...views };
    try{ idx.initStores?.(); }catch(e){ console.warn('initStores', e.message); lastStoreError = e.message; }
    window.cartStore = idx.cartStore; // expose for map
    window.warungStore = idx.warungStore;
    window.productStore = idx.productStore;
    window.foodOrderStore = idx.foodOrderStore;
    return storeMods;
  }catch(e){
    lastStoreError = (e.message||e) + '\n' + (e.stack||'');
    console.warn('[store] belum siap:', e);
    try{ localStorage.setItem('last_store_error', lastStoreError); }catch(e2){}
    return null;
  }
}

async function fetchRemoteSettings(){
  try{
    const { data, error } = await supabase.from('app_settings').select('settings').eq('id',1).maybeSingle();
    if(!error && data && data.settings){
      const remote = data.settings;
      const localRaw = localStorage.getItem('app_settings');
      let local = {};
      try{ local = localRaw ? JSON.parse(localRaw) : {}; }catch(e){}
      const merged = { ...local, ...remote };
      if(JSON.stringify(merged) !== localRaw){
        localStorage.setItem('app_settings', JSON.stringify(remote));
        if(remote.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', remote.activeKecamatanCode);
      }
      return remote;
    }
  }catch(e){ console.log('Remote settings fetch failed', e.message); }
  return null;
}

function applyLiveTheme(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(!saved) return;
    const s = JSON.parse(saved);
    const root = document.documentElement;
    if(s.primaryColor) root.style.setProperty('--primary', s.primaryColor);
    if(s.secondaryColor) root.style.setProperty('--secondary', s.secondaryColor);
    if(s.appName) {
      document.title = s.appName;
      const brand = document.querySelector('.brand');
      if(brand) brand.textContent = '🛵 ' + s.appName.toUpperCase();
    }
  }catch(e){}
}

async function render(){
  await fetchRemoteSettings();
  applyLiveTheme();
  const hash = location.hash || '#/';
  const { data: sess } = await supabase.auth.getSession();
  const session = sess?.session;
  if(!session && hash !== '#/login' && hash !== '#/onboarding'){
    const onboarded = localStorage.getItem('onboarded');
    if(!onboarded){ location.hash = '#/onboarding'; return; }
    location.hash = '#/login'; return;
  }
  try{
    if(session){
      const prof = await getProfile();
      currentProfile = prof;
      if(userBadge) userBadge.textContent = prof?.name||prof?.email||'User';
    }
  }catch(e){ currentProfile=null; }

  let html = '';
  try{
    if(hash.startsWith('#/login')) html = viewLogin();
    else if(hash.startsWith('#/onboarding')) html = viewOnboarding();
    else if(hash.startsWith('#/passenger')) html = viewPassenger(currentProfile);
    else if(hash.startsWith('#/driver')) html = viewDriver(currentProfile);
    else if(hash.startsWith('#/profile')) html = viewProfile(currentProfile);
    else if(hash.startsWith('#/admin') && hash.includes('settings')) html = viewAdminSettings();
    else if(hash.startsWith('#/admin')) html = viewAdminDashboard();
    else if(hash.startsWith('#/store')){
      const mods = await getStoreMods();
      if(!mods){ html = `<div class="card"><h3>🍔 Food</h3><p class="muted">Loading store... ${lastStoreError?'<br/><small>'+lastStoreError+'</small>':''}</p><button onclick="location.reload()" class="btn primary">Reload</button></div>`; }
      else {
        if(hash.startsWith('#/store/detail/')){ const id=hash.split('/')[3]; html = await mods.viewStoreDetail(id); }
        else if(hash.startsWith('#/store/cart')) html = await mods.viewStoreCart();
        else if(hash.startsWith('#/store/my')) html = await mods.viewMyStore();
        else if(hash.startsWith('#/store/products')) html = await mods.viewStoreProducts();
        else if(hash.startsWith('#/store/orders')) html = await mods.viewStoreOrders();
        else html = await mods.viewStoreList();
      }
    }
    else if(hash.startsWith('#/history')) html = await history.viewHistory(currentProfile);
    else html = viewHome(currentProfile);
  }catch(e){
    console.error('render error', e);
    html = `<div class="card"><h3>Error</h3><p class="muted">${e.message}</p><pre style="font-size:10px;white-space:pre-wrap">${e.stack||''}</pre><button onclick="location.reload()" class="btn primary">Reload</button></div>`;
  }
  if(routerEl) routerEl.innerHTML = html;
  afterRender(hash);
}

function afterRender(hash){
  // Ojek handlers
  if(hash.startsWith('#/passenger')){
    order.initPassenger?.(currentProfile);
    tracking.loadActiveTracking?.();
  }
  if(hash.startsWith('#/driver')){
    driver.initDriverPage?.(currentProfile);
  }
  if(hash.startsWith('#/store')){
    initStorePage(hash);
  }
  // Global click delegation untuk driver accept ojek
  document.removeEventListener('click', handleGlobalClick);
  document.addEventListener('click', handleGlobalClick);
}

async function handleGlobalClick(e){
  // Ojek accept
  const acceptBtn = e.target.closest('[data-driver-accept]');
  if(acceptBtn){
    e.preventDefault();
    const orderId = acceptBtn.getAttribute('data-driver-accept');
    try{
      const { data, error } = await supabase.from('orders').update({ status:'accepted', driver_id: currentProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
      if(error) throw error;
      alert('✅ Order ojek diterima!');
      driver.loadDriverOrders?.(currentProfile, false);
    }catch(err){ alert('Gagal terima: '+err.message); }
    return;
  }
  const rejectBtn = e.target.closest('[data-driver-reject]');
  if(rejectBtn){
    e.preventDefault();
    const orderId = rejectBtn.getAttribute('data-driver-reject');
    try{
      let rej=[]; try{ rej=JSON.parse(localStorage.getItem('rejected_orders_'+currentProfile.id)||'[]'); }catch(e){}
      rej.push(orderId);
      localStorage.setItem('rejected_orders_'+currentProfile.id, JSON.stringify(rej));
      alert('Order ditolak');
      driver.loadDriverOrders?.(currentProfile, false);
    }catch(err){}
    return;
  }

  // Food accept - driver terima dulu baru warung masak
  const foodAcceptBtn = e.target.closest('[data-food-accept]');
  if(foodAcceptBtn){
    e.preventDefault();
    const orderId = foodAcceptBtn.getAttribute('data-food-accept');
    try{
      const { data, error } = await supabase.from('food_orders').update({ driver_id: currentProfile.id, status: 'driver_assigned' }).eq('id', orderId).eq('status','searching_driver').select().single();
      if(error) throw error;
      alert('✅ Order makanan diterima! Kamu & pemesan sepakat, warung dapat notif masak. Tracking modal terbuka.');
      // Buka modal tracking seperti tracking.js ojol
      trackingFood.openFoodTrackingDetailModal(orderId);
      driver.loadFoodOrdersForDriver?.(currentProfile, false);
    }catch(err){ alert('Gagal terima food: '+err.message); }
    return;
  }

  // Food picked & complete - driver actions dari modal tracking & dari list
  const foodPickedBtn = e.target.closest('[data-food-picked]');
  if(foodPickedBtn){
    e.preventDefault();
    const orderId = foodPickedBtn.getAttribute('data-food-picked');
    if(!confirm('Konfirmasi sudah ambil makanan di warung? OTW antar ke pemesan')) return;
    try{
      await supabase.from('food_orders').update({ status:'picked' }).eq('id', orderId);
      alert('✅ OTW antar ke pemesan');
      trackingFood.openFoodTrackingDetailModal(orderId);
    }catch(err){ alert(err.message); }
    return;
  }
  const foodPickedWarungBtn = e.target.closest('[data-food-picked-warung]');
  if(foodPickedWarungBtn){
    e.preventDefault();
    const orderId = foodPickedWarungBtn.getAttribute('data-food-picked-warung');
    // Cek apakah warung sudah ready?
    try{
      const { data: o } = await supabase.from('food_orders').select('status').eq('id', orderId).single();
      if(o && o.status!=='ready'){
        if(!confirm('Makanan belum ready dari warung (status: '+o.status+'). Tetap ambil?')) return;
      }
      await supabase.from('food_orders').update({ status:'picked' }).eq('id', orderId);
      alert('✅ Ambil & OTW antar');
      trackingFood.openFoodTrackingDetailModal(orderId);
    }catch(err){ alert(err.message); }
    return;
  }
  const foodCompleteBtn = e.target.closest('[data-food-complete]');
  if(foodCompleteBtn){
    e.preventDefault();
    const orderId = foodCompleteBtn.getAttribute('data-food-complete');
    if(!confirm('Selesaikan pesanan makanan? Pemesan akan dapat notif selesai')) return;
    try{
      await supabase.from('food_orders').update({ status:'completed' }).eq('id', orderId);
      alert('✅ Pesanan selesai! Terima kasih');
      trackingFood.clearFoodTracking();
      driver.loadFoodOrdersForDriver?.(currentProfile, false);
      const modal = document.getElementById('foodTrackingDetailModal');
      if(modal) modal.remove();
    }catch(err){ alert(err.message); }
    return;
  }

  // Food driver list cepat - 5 driver terdekat seperti order.js
  const orderFoodDriverBtn = e.target.closest('[data-order-food-driver]');
  if(orderFoodDriverBtn){
    e.preventDefault();
    const driverId = orderFoodDriverBtn.getAttribute('data-order-food-driver');
    const orderId = orderFoodDriverBtn.getAttribute('data-order-id');
    if(!confirm('Pilih driver ini? Driver & pemesan sepakat, warung akan dapat notif masak')) return;
    try{
      await supabase.from('food_orders').update({ driver_id: driverId, status:'driver_assigned' }).eq('id', orderId);
      alert('✅ Driver dipilih! Warung dapat notif masak');
      trackingFood.startFoodTracking(orderId);
      trackingFood.openFoodTrackingDetailModal(orderId);
    }catch(err){ alert(err.message); }
    return;
  }
}

// ===== STORE PAGE INIT - Peta berfungsi + 5 Driver Terdekat + Batal & Selesai =====
async function initStorePage(hash){
  const mods = await getStoreMods();
  if(!mods) return;
  // Cart badge
  try{
    const c = mods.cartStore?.getState?.().items?.reduce((a,b)=>a+b.qty,0)||0;
    const badge = document.getElementById('cartBadge');
    if(badge){ badge.textContent=c; badge.style.display=c>0?'block':'none'; }
  }catch(e){}

  // Auto load active food tracking jika ada
  try{
    const activeFoodId = localStorage.getItem('active_food_order_id');
    if(activeFoodId){
      trackingFood.loadFoodActiveTracking();
      // Jika di cart page, tampilkan tracking card
      if(hash.includes('/store/cart')){
        const card = document.getElementById('foodActiveOrderCard');
        if(card) card.style.display='block';
      }
    }
  }catch(e){}

  // Bind map picker untuk Food - DEST (alamat antar)
  const btnPickDest = document.getElementById('btnPickDest');
  if(btnPickDest){
    btnPickDest.addEventListener('click', async (ev)=>{
      ev.preventDefault();
      try{
        // Pakai map.js yang sudah ada untuk Ojek, sama seperti btnOpenMap di order.js
        if(window.mapModule && window.mapModule.openMapPicker){
          // openMapPicker dengan callback untuk dest
          window.mapModule.openMapPicker('dest', async (picked)=>{
            // picked = { lat, lng, address }
            try{
              const raw = localStorage.getItem('ojol_cart_v2_food');
              if(raw){
                const s = JSON.parse(raw);
                s.dest = { lat: picked.lat, lng: picked.lng, text: picked.address||picked.text||'' };
                // Hitung jarak dari warung
                if(s.pickup && s.pickup.lat){
                  const R=6371; const dLat=(picked.lat - s.pickup.lat)*Math.PI/180; const dLng=(picked.lng - s.pickup.lng)*Math.PI/180;
                  const a=Math.sin(dLat/2)**2 + Math.cos(s.pickup.lat*Math.PI/180)*Math.cos(picked.lat*Math.PI/180)*Math.sin(dLng/2)**2;
                  s.distanceKm = 2*R*Math.asin(Math.sqrt(a));
                }
                localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
                // Update UI tanpa reload
                const destTextEl = document.getElementById('destText');
                if(destTextEl) destTextEl.value = s.dest.text;
                // Reload untuk update totals
                setTimeout(()=> location.reload(), 300);
              }
            }catch(e){ console.error(e); }
          });
        } else if(window.openMapPicker){
          window.openMapPicker('dest');
        } else {
          // Fallback manual
          const lat = prompt('Lat tujuan:'); const lng = prompt('Lng tujuan:'); const text = prompt('Alamat:');
          if(lat && lng){
            try{
              const raw=localStorage.getItem('ojol_cart_v2_food');
              if(raw){ const s=JSON.parse(raw); s.dest={ lat:parseFloat(lat), lng:parseFloat(lng), text:text||'' }; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s)); location.reload(); }
            }catch(e){}
          }
        }
      }catch(e){ alert('Peta error: '+e.message); }
    });
  }

  // Bind warung location picker
  const btnPickWarung = document.getElementById('btnPickWarungLoc');
  if(btnPickWarung){
    btnPickWarung.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if(window.mapModule && window.mapModule.openMapPicker){
        window.mapModule.openMapPicker('warung', (picked)=>{
          const latEl = document.getElementById('sLat');
          const lngEl = document.getElementById('sLng');
          const alamatEl = document.getElementById('sAlamat');
          if(latEl) latEl.value = picked.lat;
          if(lngEl) lngEl.value = picked.lng;
          if(alamatEl && picked.address) alamatEl.value = picked.address;
        });
      } else {
        alert('Map module belum siap');
      }
    });
  }

  // Checkout Food - Cari 5 Driver Terdekat seperti order.js
  const btnCheckout = document.getElementById('btnCheckout');
  if(btnCheckout){
    btnCheckout.addEventListener('click', async (ev)=>{
      ev.preventDefault();
      await handleFoodCheckout();
    });
  }
}

async function handleFoodCheckout(){
  try{
    const mods = await getStoreMods();
    if(!mods) return alert('Store belum siap');
    const profile = await getProfile();
    if(!profile){ alert('Harus login'); return; }
    const state = mods.cartStore.getState();
    if(!state.items.length){ alert('Keranjang kosong'); return; }
    if(!state.dest.lat || !state.dest.lng){
      alert('📍 Pilih lokasi antar di peta dulu! Tap 📍 Pilih di Peta');
      return;
    }
    const destText = document.getElementById('destText')?.value?.trim() || state.dest.text||'';
    if(destText.length<5){ alert('Alamat antar harus lengkap'); return; }
    // Update dest text
    try{
      const raw = localStorage.getItem('ojol_cart_v2_food');
      if(raw){ const s=JSON.parse(raw); s.dest.text=destText; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s)); }
    }catch(e){}

    const btn = document.getElementById('btnCheckout');
    if(btn){ btn.disabled=true; btn.textContent='⏳ Membuat pesanan...'; }

    const payload = mods.cartStore._actions.buildFoodOrderPayload(profile.id);
    payload.status = 'searching_driver';
    payload.dest_text = destText;
    console.log('Checkout payload', payload);

    const { data: order, error } = await supabase.from('food_orders').insert(payload).select().single();
    if(error) throw error;

    mods.cartStore._actions.clear();
    try{ localStorage.setItem('active_food_order_id', order.id); localStorage.setItem('last_food_order_id', order.id); }catch(e){}

    // Mulai tracking seperti tracking.js Ojol
    trackingFood.startFoodTracking(order.id);
    
    // Tampilkan modal dengan 5 driver terdekat - sama seperti renderDriverList di order.js
    await showFoodCheckoutWithNearbyDrivers(order, state.pickup.lat, state.pickup.lng, state.storeName||'');

    if(btn){ btn.disabled=false; btn.textContent='✅ Checkout - Cari Driver Terdekat'; }

  }catch(e){
    console.error(e);
    alert('Checkout gagal: '+e.message);
    const btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='✅ Checkout - Cari Driver Terdekat'; }
  }
}

async function showFoodCheckoutWithNearbyDrivers(order, pickupLat, pickupLng, storeName){
  // Buat modal seperti order.js tapi untuk food
  let old = document.getElementById('foodCheckoutDriversModal');
  if(old) old.remove();

  const theme = (()=>{ try{ const s=JSON.parse(localStorage.getItem('app_settings')||'{}'); return { primary: s.primaryColor||'#16a34a' }; }catch(e){ return { primary:'#16a34a' }; } })();

  const div = document.createElement('div');
  div.id = 'foodCheckoutDriversModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0';
  div.innerHTML = `
    <div style="background:var(--card);width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:20px 20px 0 0;border-top:2px solid ${theme.primary}">
      <div style="padding:16px 16px 8px;position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--border);z-index:1">
        <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:800;font-size:16px">🍔 Pesanan Dibuat #${order.id.slice(0,6).toUpperCase()}</div>
            <div style="font-size:12px" class="muted">Rp ${Number(order.total||0).toLocaleString()} • Warung ${storeName} • Cari driver terdekat</div>
            <div style="font-size:11px;margin-top:4px" class="muted">⏱️ Timer 5 menit auto batal jika tidak ada driver (sama kayak Ojol)</div>
          </div>
          <button id="btnCloseFoodCheckout" style="background:var(--card2);border:1px solid var(--border);padding:8px 12px;border-radius:10px">✕</button>
        </div>
      </div>
      <div style="padding:16px">
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">
          <div style="font-size:12px;font-weight:700">📍 Tracking Aktif</div>
          <div style="font-size:11px;margin-top:4px" class="muted">Status: <b id="foodCheckoutStatus">Mencari driver...</b></div>
          <div style="font-size:11px;margin-top:2px" class="muted">ID: ${order.id.slice(0,8)} • <span id="foodCheckoutTimer">00:00</span> / <span id="foodCheckoutTimeout">05:00</span></div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button id="btnFoodCheckoutTracking" style="flex:1;background:${theme.primary};color:white;border:none;padding:10px;border-radius:10px;font-weight:700">📍 Detail Tracking</button>
            <button id="btnFoodCheckoutCancel" style="flex:1;background:var(--card);border:1px solid #ef4444;color:#ef4444;padding:10px;border-radius:10px;font-weight:700">❌ Batalkan Pesanan</button>
          </div>
          <button id="btnFoodCheckoutComplete" style="width:100%;margin-top:8px;background:#0ea5e9;color:white;border:none;padding:10px;border-radius:10px;font-weight:700;display:none">✅ Tandai Selesai (Driver sudah antar)</button>
        </div>

        <div style="font-size:13px;font-weight:800;margin-bottom:8px">🏍️ 5 Driver Terdekat dari Warung (opsi cepat - sama kayak order.js Ojol)</div>
        <div id="foodNearbyDriversList" style="margin-bottom:12px">
          <div style="padding:20px;text-align:center" class="muted">🔍 Mencari driver terdekat dari warung...</div>
        </div>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:11px;color:#92400e">
          <b>ℹ️ Flow Baru:</b> Driver & pemesan sepakat → Driver terima → Warung baru dapat notif masak → Driver ambil → Antar → Selesai. Jika 5 menit tidak ada driver, auto batal seperti Ojol.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  document.getElementById('btnCloseFoodCheckout')?.addEventListener('click', ()=> div.remove());
  document.getElementById('btnFoodCheckoutTracking')?.addEventListener('click', ()=> { trackingFood.openFoodTrackingDetailModal(order.id); });
  document.getElementById('btnFoodCheckoutCancel')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan pesanan makanan?')) return;
    try{ await supabase.from('food_orders').update({ status:'cancelled' }).eq('id', order.id); }catch(e){}
    trackingFood.clearFoodTracking();
    div.remove();
    alert('❌ Pesanan dibatalkan');
    location.hash='#/store';
  });
  document.getElementById('btnFoodCheckoutComplete')?.addEventListener('click', async ()=>{
    if(!confirm('Tandai pesanan selesai?')) return;
    try{ await supabase.from('food_orders').update({ status:'completed' }).eq('id', order.id); }catch(e){}
    trackingFood.clearFoodTracking();
    div.remove();
    alert('✅ Pesanan selesai!');
    location.hash='#/store';
  });

  // Load 5 driver terdekat - sama logic dengan searchNearby di order.js
  await load5NearbyDriversForFood(order, pickupLat, pickupLng);
}

async function load5NearbyDriversForFood(order, pickupLat, pickupLng){
  const listEl = document.getElementById('foodNearbyDriversList');
  const statusEl = document.getElementById('foodCheckoutStatus');
  if(!listEl) return;
  if(statusEl) statusEl.textContent = '🔍 Mencari driver terdekat dari warung...';
  try{
    const tenMinAgo = new Date(Date.now()-10*60*1000).toISOString();
    const { data: locs, error: locErr } = await supabase.from('driver_locations').select('*').gte('updated_at', tenMinAgo).limit(50);
    if(locErr) throw locErr;
    if(!locs || !locs.length){
      listEl.innerHTML = `<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center" class="muted">Tidak ada driver online. Order tetap aktif, menunggu driver lihat di dashboard driver.<br/><br/>Timer 5 menit akan auto batal jika tidak ada driver seperti Ojol.</div>`;
      if(statusEl) statusEl.textContent = 'Menunggu driver online...';
      return;
    }
    const driverIds = locs.map(l=>l.driver_id).filter(Boolean);
    const { data: users } = await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor').in('id', driverIds);
    const drivers = locs.map(loc=>{
      const u = users ? users.find(x=>x.id===loc.driver_id) : null;
      if(!u) return null; if((u.role||'').toLowerCase()!=='driver') return null;
      let dLat=null,dLng=null;
      if(loc.lat && loc.lng){ dLat=loc.lat; dLng=loc.lng; }
      else if(loc.lokasi){ try{ const m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} }
      if(!dLat) return null;
      const dist = (()=>{ const R=6371; const dLatR=(pickupLat-dLat)*Math.PI/180; const dLngR=(pickupLng-dLng)*Math.PI/180; const a=Math.sin(dLatR/2)**2 + Math.cos(dLat*Math.PI/180)*Math.cos(pickupLat*Math.PI/180)*Math.sin(dLngR/2)**2; return 2*R*Math.asin(Math.sqrt(a)); })();
      return { ...u, driver_id: u.id, distance_km: dist, lat:dLat, lng:dLng, location_updated: loc.updated_at };
    }).filter(Boolean).sort((a,b)=>a.distance_km-b.distance_km).slice(0,5);

    if(!drivers.length){
      listEl.innerHTML = `<div class="muted" style="padding:12px">Tidak ada driver terdekat</div>`;
      return;
    }
    if(statusEl) statusEl.textContent = `Ditemukan ${drivers.length} driver terdekat - pilih cepat di bawah`;

    // Render sama kayak renderDriverList di order.js
    listEl.innerHTML = drivers.map(d=>{
      const vehIcon = (d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
      const wa = d.hp ? `https://wa.me/${d.hp.replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}` : null;
      return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:800;font-size:14px">${d.name}</span>
            <span style="background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:8px;font-size:10px">${vehIcon} ${(d.jenis_kendaraan||'motor').toUpperCase()}</span>
            <span style="background:#22c55e;color:#052e16;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">📍 ${d.distance_km.toFixed(2)} km dari warung</span>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--muted)">${d.nopol||''} • ${d.tipe_motor||'Beat'} • update ${new Date(d.location_updated).toLocaleTimeString('id-ID')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:112px;justify-content:center">
          <button data-order-food-driver="${d.driver_id}" data-order-id="${order.id}" style="background:#22c55e;color:#052e16;border:none;padding:10px 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer">✅ Pilih Cepat</button>
          ${wa?`<a href="${wa}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>`:''}
        </div>
      </div>`;
    }).join('');

    // Simpan queue seperti di order.js setAutoQueue
    try{
      localStorage.setItem('food_auto_queue_'+order.id, JSON.stringify(drivers));
      localStorage.setItem('food_auto_index_'+order.id, '0');
    }catch(e){}

  }catch(e){
    console.error('load5NearbyDrivers fail', e);
    listEl.innerHTML = `<div class="muted">Error: ${e.message}</div>`;
  }
}

// ===== Init =====
window.addEventListener('hashchange', render);
window.addEventListener('load', async ()=>{
  await fetchRemoteSettings();
  applyLiveTheme();
  render();
  // Subscribe tracking
  tracking.loadActiveTracking?.();
  trackingFood.loadFoodActiveTracking?.();
});


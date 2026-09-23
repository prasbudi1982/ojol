// lib/app.js - FINAL - OJOL ORIGINAL + STORE LAZY (login tidak diubah)
// Prinsip: login flow 100% ikut yang sudah berjalan di lib/app/views.js & user.js
// Store hanya tambahan, tidak pernah block render login

import { supabase } from './app/supabase.js';
import { SURUH_CENTER, ACTIVE_KECAMATAN_NAME } from './app/config.js';
import { isInSuruhBbox, getActiveKecamatanName } from './app/geofence.js';
import { getSession, getProfile, deleteAccount } from './app/user.js';
import * as order from './app/order.js';
window.order = order;
import * as map from './app/map.js';
window.mapModule = map;
window.updateOrderEstimate = order.updateOrderEstimate;
import { viewLogin, viewHome, viewOnboarding } from './app/views.js';
import { viewPassenger } from './app/order.js';
import { viewDriver } from './app/driver.js';
import { viewProfile } from './app/user.js';
import { viewAdminDashboard, viewAdminSettings } from './app/admin.js';
import * as push from './app/push.js';
import * as tracking from './app/tracking.js';
window.tracking = tracking;
import * as driver from './app/driver.js';
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

// --- STORE: lazy only, tidak pernah import di top-level ---
async function getStoreMods(){
  if(storeMods) return storeMods;
  try{
    const [idx, views] = await Promise.all([
      import('./app/store/index.js'),
      import('./app/storeViews.js')
    ]);
    storeMods = { ...idx, ...views };
    // init di background, jangan await blocking
    try{ idx.initStores?.(); }catch(e){ console.warn('initStores', e.message); }
    return storeMods;
  }catch(e){
    // file belum ada atau error -> kembalikan null, tapi JANGAN bikin blank
    console.warn('[store] belum siap:', e.message);
    return null;
  }
}

// --- NAV: support role merchant tanpa ganggu guest/passenger ---
function updateBottomNav(profile){
  const nav = document.getElementById('bottomNav') || document.querySelector('.bottom-nav');
  if(!nav) return;
  const raw = profile?.role || 'guest';
  const role = raw === 'warung' ? 'merchant' : raw;

  // Jika nav lama tidak punya data-role (versi sebelum store), jangan sembunyikan apa pun
  const hasRoleAttr = nav.querySelector('a[data-role]');
  if(!hasRoleAttr){
    // nav lama -> biarkan semua tampil (login tetap jalan)
    return;
  }

  nav.querySelectorAll('a[data-role]').forEach(a=>{
    const allowed = (a.getAttribute('data-role')||'').split(' ').filter(Boolean);
    if(allowed.length===0){ a.style.display=''; return; }
    let show = allowed.includes('all') || allowed.includes(role);
    // guest boleh lihat home & food untuk browsing, tapi login tetap ada
    if(role==='guest' && (a.dataset.nav==='home' || a.dataset.nav==='store' || a.dataset.nav==='login')) show = true;
    a.style.display = show ? '' : 'none';
  });

  if(role==='admin'){
    nav.querySelectorAll('a[data-role]').forEach(a=>{
      const ok = (a.dataset.role||'').includes('admin') || a.dataset.nav==='profile';
      a.style.display = ok ? '' : 'none';
    });
  }

  // cart badge (kalau ada)
  try{
    const rawCart = localStorage.getItem('ojol_cart_v2_food');
    if(rawCart){
      const cart = JSON.parse(rawCart);
      const count = (cart.items||[]).reduce((s,i)=>s+(i.qty||0),0);
      const badge = document.getElementById('cartBadge');
      if(badge){ badge.textContent = count; badge.style.display = count>0?'block':'none'; }
    }
  }catch(e){}
}

async function render(){
  const hash = location.hash || '#/';

  // --- SESSION: tetap flow asli ---
  let session = null;
  try{ session = await getSession(); }catch(e){ console.warn('getSession', e); }

  if(!session && hash !== '#/login' && hash !== '#/'){
    location.hash = '#/login';
    // jangan return blank, tetap render login
  }

  if(session){
    try{
      currentProfile = await getProfile();
      if(currentProfile && userBadge){
        const roleLabel = currentProfile.role === 'merchant' ? 'Warung' : currentProfile.role;
        userBadge.textContent = `${currentProfile?.name||''} • ${roleLabel}`;
        userBadge.classList.remove('hidden');
      }
    }catch(e){ console.warn('getProfile', e); }
  }

  updateBottomNav(currentProfile);

  // --- ADMIN GUARD: tetap seperti asli, tambah guard merchant ---
  if(currentProfile){
    const role = currentProfile.role === 'warung' ? 'merchant' : currentProfile.role;
    if(role === 'admin'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/driver')||hash==='#/'||hash===''||hash.startsWith('#/history')||hash.startsWith('#/store')){
        location.hash = '#/admin'; return;
      }
    } else if(role === 'driver'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/admin')||hash.startsWith('#/store/my')||hash.startsWith('#/store/products')||hash.startsWith('#/store/orders')){
        location.hash = '#/'; return;
      }
    } else if(role === 'merchant'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/driver')||hash.startsWith('#/admin')){
        location.hash = '#/store/my'; return;
      }
    } else {
      // passenger
      if(hash.startsWith('#/driver')||hash.startsWith('#/admin')||hash.startsWith('#/store/my')||hash.startsWith('#/store/products')||hash.startsWith('#/store/orders')){
        location.hash = '#/'; return;
      }
    }
  }

  // --- PUSH: tetap asli, tidak ubah ---
  if(currentProfile && !pushChannel){
    try{ pushChannel = push.listenRealtimeOrders(currentProfile); }catch(e){}
  }

  let html = '';
  try{
    if(hash.startsWith('#/admin')){
      if(hash.startsWith('#/admin/settings')) html = await viewAdminSettings();
      else html = await viewAdminDashboard();
    } else if(hash.startsWith('#/store')){
      // STORE: hanya di sini baru load module, login tidak kena dampak
      const mods = await getStoreMods();
      if(!mods){
        // kalau modul belum ada, jangan blank, kasih info + link home/login
        html = `
          <div class="card">
            <h2>🍔 Food</h2>
            <p class="muted">Modul Food belum terpasang. Ini tidak mengganggu login Ojol.</p>
            <p class="muted" style="font-size:11px">Pastikan ada file:<br>lib/app/store/index.js<br>lib/app/storeViews.js</p>
            <a href="#/" class="btn primary">Kembali Home</a>
          </div>`;
      } else {
        if(hash === '#/store' || hash === '#/store/') html = await mods.viewStoreList();
        else if(hash.startsWith('#/store/cart')) html = await mods.viewStoreCart();
        else if(hash.startsWith('#/store/my')) html = await mods.viewMyStore();
        else if(hash.startsWith('#/store/products')) html = await mods.viewStoreProducts();
        else if(hash.startsWith('#/store/orders')) html = await mods.viewStoreOrders();
        else if(hash.startsWith('#/store/detail/')){
          const id = hash.split('/').pop().split('?')[0];
          html = await mods.viewStoreDetail(id);
        } else html = await mods.viewStoreList();
      }
    } else if(hash.startsWith('#/passenger')){
      html = await viewPassenger();
    } else if(hash.startsWith('#/driver')){
      html = await viewDriver();
    } else if(hash.startsWith('#/profile')){
      html = await viewProfile();
    } else if(hash.startsWith('#/history')){
      html = await history.viewHistory(currentProfile);
    } else if(hash.startsWith('#/login')){
      html = await viewLogin();
    } else {
      // home: kalau merchant, arahkan ke warungku, kalau tidak tetap home asli
      if(currentProfile?.role === 'merchant' || currentProfile?.role === 'warung'){
        const mods = await getStoreMods();
        html = mods ? await mods.viewMyStore() : await viewHome();
      } else {
        html = await viewHome();
      }
    }
  }catch(e){
    console.error('render content error', e);
    // JANGAN blank, tampilkan error + tombol login
    html = `
      <div class="card">
        <h2>Gagal load halaman</h2>
        <p class="muted">${e.message}</p>
        <pre style="font-size:11px;white-space:pre-wrap;background:var(--card2);padding:8px;border-radius:8px">${e.stack||''}</pre>
        <a href="#/login" class="btn primary">Ke Login</a>
      </div>`;
  }

  if(routerEl) routerEl.innerHTML = html;

  // init halaman spesifik (tetap flow asli)
  if(hash.startsWith('#/passenger')){
    try{ await order.initPassengerPage(); }catch(e){}
  }
  if(hash.startsWith('#/driver')){
    try{ await driver.initDriverPage(currentProfile); }catch(e){}
  }
}

// --- Event handlers asli, tidak ubah flow login ---
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnCloseMap')){
    const m = document.getElementById('mapModal');
    if(m) m.style.display='none';
    document.body.style.overflow='';
    return;
  }

  if(e.target.closest('[data-driver-accept]')){
    e.preventDefault();
    const btn = e.target.closest('[data-driver-accept]');
    const orderId = btn.getAttribute('data-driver-accept');
    const orig = btn.textContent;
    try{
      btn.disabled=true; btn.textContent='⏳ Mengambil...';
      let { data: od } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(od.status!=='pending'){ alert('Order sudah diambil driver lain'); await driver.loadDriverOrders(currentProfile); return; }
      await supabase.from('orders').update({ status:'accepted', driver_id: currentProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId);
      alert('✅ Order diterima! Hubungi penumpang.');
      await driver.loadDriverOrders(currentProfile);
    }catch(err){ alert('Gagal: '+err.message); btn.disabled=false; btn.textContent=orig; }
    return;
  }

  if(e.target.closest('[data-driver-reject]')){
    e.preventDefault();
    const btn = e.target.closest('[data-driver-reject]');
    const orderId = btn.getAttribute('data-driver-reject');
    try{
      const key = `rejected_orders_${currentProfile.id}`;
      const rej = JSON.parse(localStorage.getItem(key)||'[]');
      rej.push(orderId);
      localStorage.setItem(key, JSON.stringify(rej));
      alert('✅ Order ditolak.');
      await driver.loadDriverOrders(currentProfile);
    }catch(err){ alert(err.message); }
    return;
  }

  if(e.target.closest('[data-driver-picked]')){
    e.preventDefault();
    const id = e.target.closest('[data-driver-picked]').getAttribute('data-driver-picked');
    try{ await supabase.from('orders').update({ status:'picked' }).eq('id', id); await driver.loadDriverOrders(currentProfile); }catch(err){ alert(err.message); }
    return;
  }

  if(e.target.closest('[data-driver-complete]')){
    e.preventDefault();
    const id = e.target.closest('[data-driver-complete]').getAttribute('data-driver-complete');
    if(!confirm('Selesaikan order?')) return;
    try{ await supabase.from('orders').update({ status:'completed' }).eq('id', id); await driver.loadDriverOrders(currentProfile); }catch(err){ alert(err.message); }
    return;
  }

  if(e.target.closest('#btnCancelTracking')){
    if(!confirm('Batalkan order & hentikan tracking?')) return;
    const oid = localStorage.getItem('active_order_id');
    if(oid){ try{ await supabase.from('orders').update({status:'cancelled'}).eq('id', oid); }catch(e){} }
    try{ tracking.clearActiveTracking(); }catch(e){}
    const c = document.getElementById('activeOrderCard');
    if(c) c.style.display='none';
    return;
  }

  if(e.target.closest('#btnCompleteOrder')){
    if(!confirm('Konfirmasi driver sudah sampai & order selesai?')) return;
    const oid = localStorage.getItem('active_order_id');
    if(oid){ try{ await supabase.from('orders').update({status:'completed'}).eq('id', oid); }catch(e){} }
    try{ tracking.clearActiveTracking(); }catch(e){}
    location.hash='#/';
    return;
  }

  if(e.target.closest('[data-rate-driver]')){
    const did = e.target.closest('[data-rate-driver]').getAttribute('data-rate-driver');
    const oid = e.target.closest('[data-rate-driver]').getAttribute('data-rate-order');
    const name = e.target.closest('[data-rate-driver]').getAttribute('data-rate-name');
    rating.openRatingModal(did, name, oid);
    return;
  }
});

window.addEventListener('hashchange', ()=>{
  if(nearbyChannel) supabase.removeChannel(nearbyChannel);
  render();
});
window.addEventListener('DOMContentLoaded', render);

// PWA (tetap asli)
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js', { scope:'./' }).catch(()=>{});
  });
}

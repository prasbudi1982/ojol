
// lib/app.js - FINAL ANTI-BLANK - kembali ke versi normal + store lazy
import { supabase } from './app/supabase.js';
import { SURUH_CENTER } from './app/config.js';
import { getSession, getProfile } from './app/user.js';
import * as order from './app/order.js';
import * as map from './app/map.js';
import { viewLogin, viewHome } from './app/views.js';
import { viewPassenger } from './app/order.js';
import { viewDriver } from './app/driver.js';
import { viewProfile } from './app/user.js';
import { viewAdminDashboard, viewAdminSettings } from './app/admin.js';
import * as push from './app/push.js';
import * as tracking from './app/tracking.js';
import * as driver from './app/driver.js';
import * as history from './app/history.js';
import * as rating from './app/rating.js';

window.order = order;
window.mapModule = map;
window.tracking = tracking;
window.updateOrderEstimate = order.updateOrderEstimate;

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let pushChannel = null;
let storeMods = null;

async function loadStores(){
  if(storeMods) return storeMods;
  try{
    const idx = await import('./app/store/index.js');
    const views = await import('./app/storeViews.js');
    storeMods = {...idx, ...views};
    idx.initStores().catch(()=>{});
    return storeMods;
  }catch(e){
    console.warn('store not ready:', e.message);
    return null;
  }
}

function updateNav(profile){
  const nav = document.getElementById('bottomNav') || document.querySelector('.bottom-nav');
  if(!nav) return;
  const role = (profile?.role==='warung' ? 'merchant' : (profile?.role||'guest'));
  nav.querySelectorAll('a[data-role]').forEach(a=>{
    const allowed = (a.getAttribute('data-role')||'').split(' ').filter(Boolean);
    let show = allowed.includes('all') || allowed.includes(role);
    if(role==='guest' && (a.dataset.nav==='home' || a.dataset.nav==='store' || a.dataset.nav==='login')) show = true;
    a.style.display = show ? '' : 'none';
  });
  if(role==='admin'){
    nav.querySelectorAll('a[data-role]').forEach(a=>{
      const ok = (a.dataset.role||'').includes('admin') || a.dataset.nav==='profile';
      a.style.display = ok ? '' : 'none';
    });
  }
}

async function render(){
  try{
    const hash = location.hash||'#/';
    let session = null;
    try{ session = await getSession(); }catch(e){ console.warn('session err', e); }
    if(!session && hash!=='#/login' && hash!=='#/'){
      location.hash = '#/login';
    }
    if(session){
      try{
        currentProfile = await getProfile();
        if(currentProfile && userBadge){
          userBadge.textContent = `${currentProfile.name||''} • ${currentProfile.role}`;
          userBadge.classList.remove('hidden');
        }
      }catch(e){ console.warn('profile err', e); }
    }
    updateNav(currentProfile);
    loadStores();

    let html = '';
    if(hash.startsWith('#/admin')){
      html = hash.startsWith('#/admin/settings') ? await viewAdminSettings() : await viewAdminDashboard();
    } else if(hash.startsWith('#/store')){
      const m = await loadStores();
      if(!m){
        html = `<div class="card"><h2>🍔 Food</h2><p class="muted">Modul Food belum terpasang. Pastikan lib/app/store/index.js dan lib/app/storeViews.js ada.</p><a href="#/" class="btn primary">Home</a></div>`;
      } else {
        if(hash==='#/store') html = await m.viewStoreList();
        else if(hash.startsWith('#/store/cart')) html = await m.viewStoreCart();
        else if(hash.startsWith('#/store/my')) html = await m.viewMyStore();
        else if(hash.startsWith('#/store/products')) html = await m.viewStoreProducts();
        else if(hash.startsWith('#/store/orders')) html = await m.viewStoreOrders();
        else if(hash.startsWith('#/store/detail/')){ const id = hash.split('/').pop(); html = await m.viewStoreDetail(id); }
        else html = await m.viewStoreList();
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
      html = await viewHome();
    }
    if(routerEl) routerEl.innerHTML = html;
    if(hash.startsWith('#/passenger')){ try{ await order.initPassengerPage(); }catch(e){} }
    if(hash.startsWith('#/driver')){ try{ await driver.initDriverPage(currentProfile); }catch(e){} }
  }catch(e){
    console.error('render fatal', e);
    if(routerEl) routerEl.innerHTML = `<div class="card"><h2>Error: ${e.message}</h2><pre style="font-size:11px;white-space:pre-wrap;background:var(--card2);padding:8px;border-radius:8px">${e.stack||''}</pre><button onclick="localStorage.clear(); location.hash='#/login'; location.reload()" class="btn primary">Reset & Login</button></div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// Google login global - works even if viewLogin innerHTML script blocked
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#btnGoogleLogin');
  if(!btn) return;
  e.preventDefault();
  const status = document.getElementById('loginStatus');
  try{
    if(status) status.textContent = '⏳ Menghubungkan Google...';
    btn.disabled = true;
    const redirectTo = location.origin + location.pathname;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } }
    });
    if(error) throw error;
    if(data?.url) location.href = data.url;
  }catch(err){
    console.error(err);
    if(status) status.textContent = '❌ ' + err.message;
    alert('Google login gagal: ' + err.message);
    btn.disabled = false;
  }
});

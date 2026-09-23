
// lib/app.js - ANTI BLANK FIX
import { supabase } from './app/supabase.js';
import { SURUH_CENTER } from './app/config.js';
import { getSession, getProfile } from './app/user.js';
import * as order from './app/order.js';
window.order = order;
import * as map from './app/map.js';
window.mapModule = map; window.updateOrderEstimate = order.updateOrderEstimate;
import { viewLogin, viewHome } from './app/views.js';
import { viewPassenger } from './app/order.js';
import { viewDriver } from './app/driver.js';
import { viewProfile } from './app/user.js';
import { viewAdminDashboard, viewAdminSettings } from './app/admin.js';
import * as push from './app/push.js';
import * as tracking from './app/tracking.js';
window.tracking = tracking;
import * as driver from './app/driver.js';
import * as history from './app/history.js';
import * as rating from './app/rating.js';

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
    console.warn('store not ready', e.message);
    return null;
  }
}
function updateNav(profile){
  const nav = document.getElementById('bottomNav') || document.querySelector('.bottom-nav');
  if(!nav) return;
  const role = (profile?.role==='warung' ? 'merchant' : (profile?.role||'guest'));
  nav.querySelectorAll('a[data-role]').forEach(a=>{
    const allowed = (a.dataset.role||'').split(' ');
    let show = allowed.includes('all') || allowed.includes(role);
    if(role==='guest' && (a.dataset.nav==='home' || a.dataset.nav==='store')) show = true;
    a.style.display = show ? '' : 'none';
  });
  if(role==='admin'){
    nav.querySelectorAll('a[data-role]').forEach(a=>{
      const ok = (a.dataset.role||'').includes('admin') || a.dataset.nav==='profile';
      a.style.display = ok ? '' : 'none';
    });
  }
  try{
    const cart = JSON.parse(localStorage.getItem('ojol_cart_v2_food')||'{}');
    const c = (cart.items||[]).reduce((s,i)=>s+(i.qty||0),0);
    const b = document.getElementById('cartBadge');
    if(b){ b.textContent=c; b.style.display=c>0?'block':'none'; }
  }catch(e){}
}

async function render(){
  try{
    const hash = location.hash||'#/';
    let session = null;
    try{ session = await getSession(); }catch(e){}
    if(!session && hash!=='#/login' && hash!=='#/'){
      location.hash='#/login';
    }
    if(session){
      try{
        currentProfile = await getProfile();
        if(currentProfile){
          userBadge.textContent = `${currentProfile.name||''} • ${currentProfile.role}`;
          userBadge.classList.remove('hidden');
        }
      }catch(e){}
    }
    updateNav(currentProfile);
    // background load
    loadStores();

    let html='';
    if(hash.startsWith('#/admin')){
      html = hash.startsWith('#/admin/settings') ? await viewAdminSettings() : await viewAdminDashboard();
    } else if(hash.startsWith('#/store')){
      const m = await loadStores();
      if(!m){
        html = `<div class="card"><h2>🍔 Food</h2><p class="muted">Modul store belum terpasang.</p><p class="muted" style="font-size:11px">Pastikan file lib/app/store/index.js dan lib/app/storeViews.js ada.</p><a href="#/" class="btn primary">Home</a></div>`;
      } else {
        if(hash==='#/store') html = await m.viewStoreList();
        else if(hash.startsWith('#/store/cart')) html = await m.viewStoreCart();
        else if(hash.startsWith('#/store/my')) html = await m.viewMyStore();
        else if(hash.startsWith('#/store/products')) html = await m.viewStoreProducts();
        else if(hash.startsWith('#/store/orders')) html = await m.viewStoreOrders();
        else if(hash.startsWith('#/store/detail/')){
          const id = hash.split('/').pop();
          html = await m.viewStoreDetail(id);
        } else html = await m.viewStoreList();
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
      if(currentProfile?.role==='merchant' || currentProfile?.role==='warung'){
        const m = await loadStores();
        html = m ? await m.viewMyStore() : await viewHome();
      } else {
        html = await viewHome();
      }
    }
    routerEl.innerHTML = html;
    if(hash.startsWith('#/passenger')){ try{ await order.initPassengerPage(); }catch(e){} }
    if(hash.startsWith('#/driver')){ try{ await driver.initDriverPage(currentProfile); }catch(e){} }
  }catch(e){
    console.error(e);
    routerEl.innerHTML = `<div class="card"><h2>Error</h2><p class="muted">${e.message}</p><pre style="font-size:10px;background:var(--card2);padding:8px;border-radius:8px;white-space:pre-wrap">${e.stack||''}</pre><button onclick="localStorage.clear(); location.hash='#/login'; location.reload()" class="btn primary">Reset & Login</button></div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
\n
// Global Google login handler fallback (jika viewLogin script tidak jalan karena innerHTML)
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnGoogleLogin')){
    e.preventDefault();
    const btn = e.target.closest('#btnGoogleLogin');
    const status = document.getElementById('loginStatus');
    try{
      if(status) status.textContent='⏳ Menghubungkan Google...';
      btn.disabled=true;
      const redirectTo = location.origin + location.pathname;
      const { error, data } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { access_type:'offline', prompt:'consent' } }
      });
      if(error) throw error;
      if(data?.url) location.href = data.url;
    }catch(err){
      console.error(err);
      if(status) status.textContent='❌ '+err.message;
      alert('Google login gagal: '+err.message);
      btn.disabled=false;
    }
  }
});
// Handle PKCE callback di root
(async ()=>{
  try{
    const hash = location.hash;
    const search = location.search;
    if(hash.includes('access_token') || search.includes('code=')){
      console.log('OAuth callback detected, exchanging session...');
      const { data, error } = await supabase.auth.getSession();
      if(!error && data.session){
        console.log('Session OK, redirect to home');
        location.hash = '#/';
        setTimeout(()=>location.reload(), 500);
      } else {
        // try exchange code
        const { error: err2 } = await supabase.auth.exchangeCodeForSession ? await supabase.auth.exchangeCodeForSession(location.href) : {};
        if(!err2){
          location.hash='#/';
          location.reload();
        }
      }
    }
  }catch(e){ console.warn('oauth callback handling', e.message); }
})();

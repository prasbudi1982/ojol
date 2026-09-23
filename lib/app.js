// lib/app.js - FINAL LENGKAP - MINI OJOL + FOOD DELIVERY + MERCHANT
// Isolasi: /lib/app/*.js tetap fix, store di /lib/app/store/ (mulai pengembangan disini)

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
import * as admin from './app/admin.js';
import * as report from './app/report.js';
import * as history from './app/history.js';
import * as rating from './app/rating.js';

// NEW STORE MODULES
import { initStores, authStore, orderStore, warungStore, cartStore, foodOrderStore } from './app/store/index.js';
import { viewStoreList, viewStoreDetail, viewStoreCart, viewMyStore, viewStoreProducts, viewStoreOrders } from './app/storeViews.js';

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let nearbyChannel = null;
let pushChannel = null;

// ===== Remote Settings =====
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
        if(remote.activeKecamatanCode){
          localStorage.setItem('active_kecamatan_code', remote.activeKecamatanCode);
        }
        console.log('✅ Remote settings loaded:', remote.appName, remote.activeKecamatanCode);
      }
      return remote;
    }
  }catch(e){
    console.log('Remote settings fetch failed', e.message);
  }
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

// ===== Bottom Nav Role Handling - FINAL =====
function updateBottomNav(profile){
  const nav = document.getElementById('bottomNav');
  if(!nav) return;
  const role = profile?.role || 'guest'; // passenger, driver, merchant, admin, warung
  // merchant alias warung
  const effectiveRole = (role==='warung' ? 'merchant' : role);
  const allLinks = nav.querySelectorAll('a[data-role]');

  allLinks.forEach(link=>{
    const allowed = link.getAttribute('data-role')||'';
    const roles = allowed.split(' ').map(s=>s.trim());
    let show = false;
    if(roles.includes('all')) show = true;
    else if(roles.includes(effectiveRole)) show = true;
    else if(effectiveRole==='guest' && (roles.includes('passenger') || roles.includes('driver'))) {
      // guest bisa lihat Food untuk browsing
      if(link.getAttribute('data-nav')==='store' || link.getAttribute('data-nav')==='home') show = true;
    }
    link.style.display = show ? '' : 'none';
  });

  // Admin override
  if(effectiveRole==='admin'){
    allLinks.forEach(link=>{
      const allowed = link.getAttribute('data-role')||'';
      const isAdminLink = allowed.includes('admin');
      const isProfile = link.getAttribute('data-nav')==='profile';
      link.style.display = (isAdminLink || isProfile) ? '' : 'none';
    });
  }

  // Cart badge
  try{
    const raw = localStorage.getItem('ojol_cart_v2_food');
    if(raw){
      const cart = JSON.parse(raw);
      const items = cart.items||[];
      const count = items.reduce((a,b)=>a+(b.qty||0),0);
      const badge = document.getElementById('cartBadge');
      if(badge){ badge.textContent = count; badge.style.display = count>0?'block':'none'; }
    }
  }catch(e){}
}

function highlightActiveNav(){
  const hash = location.hash||'#/';
  document.querySelectorAll('.bottom-nav a').forEach(a=>{
    a.classList.remove('active');
    const href = a.getAttribute('href');
    if(!href) return;
    if(a.style.display==='none') return;
    if(hash===href) a.classList.add('active');
    else if(href!=='#/' && hash.startsWith(href+'/')) a.classList.add('active');
  });
  // Home special
  if(hash==='#/' || hash===''){
    document.querySelector('a[href="#/"]')?.classList.add('active');
  }
  // Store list active for detail
  if(hash.startsWith('#/store/detail') || hash==='#/store/cart'){
    document.querySelector('a[href="#/store"]')?.classList.add('active');
  }
}

// ===== Render & Routing FINAL =====
async function render(){
  // init stores non-blocking
  try{ await initStores(); }catch(e){}
  try{ await fetchRemoteSettings(); }catch(e){}
  applyLiveTheme();

  const hash=location.hash||'#/';
  const session=await getSession();

  if(!session && hash!=='#/login' && hash!=='#/'){ location.hash='#/login'; return; }
  if(session){
    try{
      currentProfile=await getProfile();
      if(currentProfile){
        const roleLabel = currentProfile.role==='merchant' ? 'Warung' : currentProfile.role;
        userBadge.textContent=`${currentProfile?.name||''} • ${roleLabel}`;
        userBadge.classList.remove('hidden');
        authStore._actions?.setProfile?.(currentProfile);
      }
    }catch(e){}
  }

  updateBottomNav(currentProfile);
  highlightActiveNav();

  // Setup push realtime listener once per session
  if(currentProfile && !pushChannel){
    try{ pushChannel = push.listenRealtimeOrders(currentProfile); }catch(e){}
  }

  // Admin guard sudah di handle updateBottomNav, tapi tetap redirect hash yang tidak boleh
  if(currentProfile){
    const role = currentProfile.role==='warung' ? 'merchant' : currentProfile.role;
    if(role==='admin'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/driver')||hash==='#/'||hash===''||hash.startsWith('#/history')||hash.startsWith('#/store')){
        location.hash='#/admin'; return;
      }
    } else if(role==='driver'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/admin')||hash.startsWith('#/store/my')||hash.startsWith('#/store/products')||hash.startsWith('#/store/orders')){
        location.hash='#/'; return;
      }
    } else if(role==='merchant'){
      if(hash.startsWith('#/passenger')||hash.startsWith('#/driver')||hash.startsWith('#/admin')){
        location.hash='#/store/my'; return;
      }
    } else { // passenger
      if(hash.startsWith('#/driver')||hash.startsWith('#/admin')||hash.startsWith('#/store/my')||hash.startsWith('#/store/products')||hash.startsWith('#/store/orders')){
        location.hash='#/'; return;
      }
    }
  }

  let html='';
  if(hash.startsWith('#/admin')){
    if(hash.startsWith('#/admin/settings')) html = await viewAdminSettings();
    else html = await viewAdminDashboard();
  } else if(hash.startsWith('#/store')){
    // FOOD DELIVERY ROUTES - isolasi dari ojol orders
    if(hash==='#/store' || hash==='#/store/') html = await viewStoreList();
    else if(hash.startsWith('#/store/cart')) html = await viewStoreCart();
    else if(hash.startsWith('#/store/my')) html = await viewMyStore();
    else if(hash.startsWith('#/store/products')) html = await viewStoreProducts();
    else if(hash.startsWith('#/store/orders')) html = await viewStoreOrders();
    else if(hash.startsWith('#/store/detail/')){
      const id = hash.split('/').pop().split('?')[0];
      html = await viewStoreDetail(id);
    } else {
      html = await viewStoreList();
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
    // Home - beda per role
    if(currentProfile?.role==='merchant' || currentProfile?.role==='warung'){
      html = await viewMyStore(); // merchant home = warungku
    } else {
      html = await viewHome();
    }
  }

  routerEl.innerHTML = html;

  // Re-init map & order logic if passenger page
  if(hash.startsWith('#/passenger')){
    try{ await order.initPassengerPage(); }catch(e){}
  }
  if(hash.startsWith('#/driver')){
    try{ await driver.initDriverPage(currentProfile); }catch(e){}
  }
  // Bind store views events
  if(hash.startsWith('#/store')){
    bindStoreEvents();
  }

  highlightActiveNav();
}

function bindStoreEvents(){
  // Create Store
  const btnCreate = document.getElementById('btnCreateStore');
  if(btnCreate){
    btnCreate.onclick = async ()=>{
      const name = document.getElementById('sName')?.value?.trim();
      const alamat = document.getElementById('sAlamat')?.value?.trim();
      const wa = document.getElementById('sWa')?.value?.trim();
      const lat = parseFloat(document.getElementById('sLat')?.value);
      const lng = parseFloat(document.getElementById('sLng')?.value);
      if(!name){ alert('Nama warung wajib'); return; }
      try{
        btnCreate.disabled=true; btnCreate.textContent='Menyimpan...';
        const payload = {
          owner_id: currentProfile.id,
          name,
          alamat_text: alamat,
          wa_number: wa,
          lat: isNaN(lat)? SURUH_CENTER.lat : lat,
          lng: isNaN(lng)? SURUH_CENTER.lng : lng,
          is_open: true,
          kecamatan_code: localStorage.getItem('active_kecamatan_code')||'3503071'
        };
        await warungStore._actions.createStore(payload);
        alert('✅ Warung dibuat');
        location.hash='#/store/my';
        render();
      }catch(e){ alert('Gagal: '+e.message); btnCreate.disabled=false; btnCreate.textContent='Buat Warung'; }
    };
  }
  const btnUpdate = document.getElementById('btnUpdateStore');
  if(btnUpdate){
    btnUpdate.onclick = async ()=>{
      try{
        const my = warungStore.getState().myStore;
        if(!my) return;
        btnUpdate.disabled=true;
        const patch = {
          name: document.getElementById('sName')?.value?.trim(),
          alamat_text: document.getElementById('sAlamat')?.value?.trim(),
          wa_number: document.getElementById('sWa')?.value?.trim(),
          foto_url: document.getElementById('sFoto')?.value?.trim(),
          is_open: document.getElementById('sOpen')?.value==='true'
        };
        await warungStore._actions.updateStore(my.id, patch);
        alert('✅ Disimpan');
        btnUpdate.disabled=false;
      }catch(e){ alert(e.message); btnUpdate.disabled=false; }
    };
  }
  // Add Product
  const btnAddProd = document.getElementById('btnAddProduct');
  if(btnAddProd){
    btnAddProd.onclick = async ()=>{
      try{
        const my = warungStore.getState().myStore;
        const name = document.getElementById('pName')?.value?.trim();
        const harga = parseInt(document.getElementById('pHarga')?.value);
        const kategori = document.getElementById('pKategori')?.value||'Makanan';
        const stok = parseInt(document.getElementById('pStok')?.value)||100;
        if(!name || !harga){ alert('Nama & harga wajib'); return; }
        btnAddProd.disabled=true;
        await productStore._actions.createProduct({
          store_id: my.id,
          name,
          harga,
          stok,
          kategori,
          is_available: true
        });
        document.getElementById('pName').value=''; document.getElementById('pHarga').value='';
        btnAddProd.disabled=false;
        render();
      }catch(e){ alert(e.message); btnAddProd.disabled=false; }
    };
  }

  // Cart Checkout
  const btnCheckout = document.getElementById('btnCheckout');
  if(btnCheckout){
    btnCheckout.onclick = async ()=>{
      const destText = document.getElementById('destText')?.value?.trim();
      if(!destText){ alert('Isi alamat antar'); return; }
      const cartState = cartStore.getState();
      if(cartState.items.length===0){ alert('Keranjang kosong'); return; }
      // set dest text, lat lng dari cart sudah ada atau pakai center
      if(!cartState.dest.lat){
        // fallback: pakai currentProfile location atau suruh center
        cartStore._actions.setDest({ lat: SURUH_CENTER.lat, lng: SURUH_CENTER.lng, text: destText });
      } else {
        cartStore._actions.setDest({ ...cartState.dest, text: destText });
      }
      try{
        btnCheckout.disabled=true; btnCheckout.textContent='Memesan...';
        const payload = cartStore._actions.buildFoodOrderPayload(currentProfile.id);
        const order = await foodOrderStore._actions.createFromCart(payload);
        cartStore._actions.clear();
        alert('✅ Pesanan dibuat #'+order.id.slice(0,8)+' - Mencari driver...');
        location.hash='#/history';
      }catch(e){ alert('Gagal checkout: '+e.message); btnCheckout.disabled=false; btnCheckout.textContent='✅ Checkout - Cari Driver'; }
    };
  }

  // Pick Dest via map
  const btnPickDest = document.getElementById('btnPickDest');
  if(btnPickDest){
    btnPickDest.onclick = ()=>{
      if(window.mapModule && window.mapModule.openMapPicker){
        window.mapModule.openMapPicker((lat,lng,address)=>{
          cartStore._actions.setDest({ lat, lng, text: address||document.getElementById('destText')?.value||'' });
          const el = document.getElementById('destText');
          if(el && address) el.value = address;
          alert('Lokasi antar dipilih: '+lat.toFixed(5)+','+lng.toFixed(5));
          render();
        }, 'dest');
      } else {
        alert('Map picker belum siap');
      }
    };
  }

  // Global helpers untuk toggle/delete product
  window.toggleProd = async (id, isAvailable)=>{
    try{ await productStore._actions.updateProduct(id, { is_available: isAvailable }); render(); }catch(e){ alert(e.message); }
  };
  window.delProd = async (id)=>{
    if(!confirm('Hapus menu ini?')) return;
    try{ await productStore._actions.deleteProduct(id); render(); }catch(e){ alert(e.message); }
  };
  window.addToCart = async (pid)=>{
    // handled in view, but fallback
    try{
      const prods = productStore.getState().products;
      const p = prods.find(x=>x.id===pid);
      if(p){ cartStore._actions.addItem(p,1); updateBottomNav(currentProfile); alert('Ditambah: '+p.name); }
    }catch(e){}
  };
}

// ===== Global Click Handler (ojol existing + food) =====
document.addEventListener('click', async (e)=>{
  // Close map modal
  if(e.target.closest('#btnCloseMap')){
    document.getElementById('mapModal').style.display='none';
    document.body.style.overflow='';
    return;
  }

  // === DRIVER OJOL HANDLERS (tetap) ===
  if(e.target.closest('[data-driver-accept]')){
    e.preventDefault();
    const btn = e.target.closest('[data-driver-accept]');
    const orderId = btn.getAttribute('data-driver-accept');
    const origText = btn.textContent;
    try{
      btn.disabled=true; btn.textContent='⏳ Mengambil...';
      let { data: orderData } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if(orderData.status!=='pending'){ alert('Order sudah diambil driver lain'); await driver.loadDriverOrders(currentProfile); return; }
      let r = await supabase.from('orders').update({ status: 'accepted', driver_id: currentProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId);
      if(r.error && r.error.message.includes('updated_at')){ await supabase.from('orders').update({ status: 'accepted', driver_id: currentProfile.id }).eq('id', orderId); }
      // broadcast
      try{
        const ch = supabase.channel('order_'+orderId);
        ch.subscribe(async (status)=>{
          if(status==='SUBSCRIBED'){
            await ch.send({ type:'broadcast', event:'driver_accepted', payload:{ driverName: currentProfile.name, driverId: currentProfile.id, orderId } });
          }
        });
        setTimeout(async()=>{ try{ await ch.send({ type:'broadcast', event:'driver_accepted', payload:{ driverName: currentProfile.name||'Driver', driverId: currentProfile.id, orderId } }); }catch(e){} }, 400);
      }catch(e){}
      alert('✅ Order diterima! Hubungi penumpang.');
      await driver.loadDriverOrders(currentProfile);
    }catch(err){ alert('Gagal: '+err.message); btn.disabled=false; btn.textContent=origText; }
    return;
  }

  if(e.target.closest('[data-driver-reject]')){
    e.preventDefault();
    const btn = e.target.closest('[data-driver-reject]');
    const orderId = btn.getAttribute('data-driver-reject');
    const origText = btn.textContent;
    try{
      btn.disabled=true; btn.textContent='⏳ Menolak...';
      const rejectedKey = `rejected_orders_${currentProfile.id}`;
      const rejected = JSON.parse(localStorage.getItem(rejectedKey)||'[]');
      rejected.push(orderId); localStorage.setItem(rejectedKey, JSON.stringify(rejected));
      try{
        const ch = supabase.channel('order_'+orderId);
        ch.subscribe(async (status)=>{
          if(status==='SUBSCRIBED'){ await ch.send({ type:'broadcast', event:'driver_rejected', payload:{ driverName: currentProfile.name||'Driver', driverId: currentProfile.id, orderId } }); }
        });
        setTimeout(async()=>{ try{ await ch.send({ type:'broadcast', event:'driver_rejected', payload:{ driverName: currentProfile.name||'Driver', driverId: currentProfile.id, orderId } }); }catch(e){} }, 400);
      }catch(e){ console.warn('broadcast failed', e.message); }
      alert('✅ Order ditolak. Kamu tidak akan menerima order ini lagi.');
      await driver.loadDriverOrders(currentProfile);
    }catch(e){ console.error('Reject error', e); alert('❌ Gagal tolak: '+e.message); btn.disabled=false; btn.textContent=origText; }
    return;
  }

  if(e.target.closest('[data-driver-picked]')){
    e.preventDefault();
    const orderId = e.target.closest('[data-driver-picked]').getAttribute('data-driver-picked');
    try{
      let r = await supabase.from('orders').update({ status: 'picked', picked_at: new Date().toISOString() }).eq('id', orderId);
      if(r.error && r.error.message.includes('updated_at')){ await supabase.from('orders').update({ status: 'picked' }).eq('id', orderId); }
      alert('🚗 Penumpang sudah dijemput - OTW ke tujuan');
      await driver.loadDriverOrders(currentProfile);
    }catch(e){ alert(e.message); }
    return;
  }

  if(e.target.closest('[data-driver-complete]')){
    e.preventDefault();
    const orderId = e.target.closest('[data-driver-complete]').getAttribute('data-driver-complete');
    if(!confirm('Selesaikan order? Penumpang akan diminta rating.')) return;
    try{
      let r2 = await supabase.from('orders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', orderId);
      if(r2.error && r2.error.message.includes('updated_at')){ await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId); }
      alert('✅ Order selesai - Penumpang akan diminta beri rating ⭐');
      document.getElementById('driverActiveOrderCard').style.display='none';
      await driver.loadDriverOrders(currentProfile);
    }catch(e){ alert(e.message); }
    return;
  }

  if(e.target.closest('#btnCancelTracking')){
    if(!confirm('Batalkan order & hentikan tracking?')) return;
    const oid = localStorage.getItem('active_order_id');
    if(oid){ try{ await supabase.from('orders').update({status:'cancelled'}).eq('id', oid); }catch(e){} }
    tracking.clearActiveTracking();
    document.getElementById('activeOrderCard').style.display='none';
    document.getElementById('driverList').style.display='block';
    alert('Tracking dihentikan');
    return;
  }

  if(e.target.closest('#btnCompleteOrder')){
    if(!confirm('Konfirmasi driver sudah sampai & order selesai?')) return;
    const oid = localStorage.getItem('active_order_id');
    let orderData = null;
    if(oid){
      try{ const { data } = await supabase.from('orders').select('*').eq('id', oid).single(); orderData = data; }catch(e){}
      try{ await supabase.from('orders').update({status:'completed'}).eq('id', oid); }catch(e){}
    }
    try{ tracking.clearActiveTracking(); }catch(e){}
    try{ tracking.hideTrackingUI(); }catch(e){}
    const trackModal = document.getElementById('trackingDetailModal');
    if(trackModal) trackModal.style.display='none';
    document.body.style.overflow='';
    if(orderData && orderData.driver_id){
      try{
        const { data: drv } = await supabase.from('users').select('name').eq('id', orderData.driver_id).maybeSingle();
        rating.openRatingModal(orderData.driver_id, drv?.name||'Driver', oid);
        return;
      }catch(e){
        rating.openRatingModal(orderData.driver_id, 'Driver', oid);
        return;
      }
    } else {
      alert('✅ Terima kasih - order selesai');
      location.hash='#/';
    }
    return;
  }

  if(e.target.closest('[data-rate-driver]')){
    e.preventDefault();
    const driverId = e.target.closest('[data-rate-driver]').getAttribute('data-rate-driver');
    const orderId = e.target.closest('[data-rate-driver]').getAttribute('data-rate-order');
    const name = e.target.closest('[data-rate-driver]').getAttribute('data-rate-name');
    rating.openRatingModal(driverId, name, orderId);
    return;
  }
});

window.addEventListener('hashchange', ()=>{ if(nearbyChannel) supabase.removeChannel(nearbyChannel); const h=location.hash||'#/'; if(!h.startsWith('#/passenger')){ /* keep tracking in bg */ } render(); });
window.addEventListener('DOMContentLoaded', render);

// ===== PWA v6.0 =====
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('installBanner');
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  if (!dismissed || (Date.now() - parseInt(dismissed)) > 7*24*60*60*1000) {
    setTimeout(() => banner?.classList.add('show'), 2000);
  }
});
window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner')?.classList.remove('show');
  deferredPrompt = null;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('SW registered', reg.scope))
      .catch(err => console.log('SW fail', err));
  });
}
document.addEventListener('click', async (e) => {
  if (e.target.closest('#btnInstallApp')) {
    const banner = document.getElementById('installBanner');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner?.classList.remove('show');
    } else {
      alert('Untuk install: di Android tap menu ⋮ > Install App, di iPhone tap Share > Add to Home Screen');
    }
  }
  if (e.target.closest('#btnCloseInstall')) {
    document.getElementById('installBanner')?.classList.remove('show');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }
});

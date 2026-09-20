// app.js v16 - SKEMA BENAR: Admin=Dashboard+Pengaturan, Driver=Driver, Penumpang=Penumpang
import { supabase } from './app/supabase.js';
import { isInSuruhBbox } from './app/geofence.js';
import { getSession, getProfile } from './app/user.js';
import * as order from './app/order.js';
import * as map from './app/map.js';
import { viewLogin, viewHome, viewOnboarding, viewPassenger, viewDriver, viewProfile, viewBannedInfo, viewAdminDashboard, viewAdminSettings } from './app/views.js';
import * as reportMod from './app/report.js';
import * as push from './app/push.js';
import * as tracking from './app/tracking.js';

const adminMod = {
  async getAppSettings(){
    try{
      const { data, error } = await supabase.from('app_settings').select('*').eq('id','main').single();
      if(!error && data && data.settings) return {...data.settings, _source:'database'};
    }catch{}
    try{
      const ls = JSON.parse(localStorage.getItem('admin_settings')||'null');
      if(ls) return {...ls, _source:'localStorage'};
    }catch{}
    return {
      app_name: 'OJOL SURUH',
      wilayah_name: 'Kecamatan Suruh',
      kabupaten_name: 'Kabupaten Trenggalek',
      coverage_radius_km: 15,
      suruh_center: { lat: -8.1111679, lng: 111.6064513 },
      suruh_bbox: { minLat: -8.20, maxLat: -8.02, minLng: 111.52, maxLng: 111.70 },
      trenggalek_bbox: { minLat: -8.50, maxLat: -7.95, minLng: 111.32, maxLng: 111.90 },
      tarif_motor_base: 3000,
      tarif_motor_perkm: 2500,
      tarif_motor_min: 5000,
      tarif_mobil_base: 8000,
      tarif_mobil_perkm: 5500,
      tarif_mobil_min: 15000,
      pp_multiplier: 1.6,
      _source: 'default'
    };
  },
  async saveAppSettings(newSettings){
    localStorage.setItem('admin_settings', JSON.stringify(newSettings));
    try{
      const { error } = await supabase.from('app_settings').upsert({ id: 'main', settings: newSettings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if(error) throw error;
      return { ok: true, source: 'database' };
    }catch(e){
      return { ok: true, source: 'localStorage', error: e.message };
    }
  },
  async getDashboardStats(){
    let totalUsers=0, totalDrivers=0, totalPassengers=0, driversOnline=0, totalOrders=0, totalReports=0, totalBanned=0;
    try{ const {count}=await supabase.from('users').select('*',{count:'exact',head:true}); totalUsers=count||0; }catch{}
    try{ const {count}=await supabase.from('users').select('*',{count:'exact',head:true}).eq('role','driver'); totalDrivers=count||0; }catch{}
    try{ const {count}=await supabase.from('users').select('*',{count:'exact',head:true}).eq('role','passenger'); totalPassengers=count||0; }catch{}
    try{ const {count}=await supabase.from('users').select('*',{count:'exact',head:true}).eq('status','online'); driversOnline=count||0; }catch{}
    try{ const {count}=await supabase.from('orders').select('*',{count:'exact',head:true}); totalOrders=count||0; }catch{}
    try{ const {count}=await supabase.from('reports').select('*',{count:'exact',head:true}); totalReports=count||0; }catch{}
    try{ const {count}=await supabase.from('banned_users').select('*',{count:'exact',head:true}).eq('is_active',true); totalBanned=count||0; }catch{}
    return { totalUsers, totalDrivers, totalPassengers, driversOnline, totalOrders, totalReports, totalBanned };
  },
  async getAllUsers(limit=100){
    const { data, error } = await supabase.from('users').select('*').order('created_at',{ascending:false}).limit(limit);
    if(error) throw error; return data;
  },
  async updateUserRole(userId, newRole){
    const { data, error } = await supabase.from('users').update({ role: newRole }).eq('id', userId).select().single();
    if(error) throw error; return data;
  },
  async getRecentOrders(limit=20){
    const { data } = await supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(limit);
    return data||[];
  }
};

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let pushChannel = null;

async function updateBrand(){
  try{
    const s = await adminMod.getAppSettings();
    const el = document.getElementById('appBrand');
    if(el && s.app_name) el.textContent = '🛵 ' + s.app_name.toUpperCase();
  }catch{}
}

function applyBottomNav(role){
  const navHome = document.getElementById('navHome');
  const navPass = document.getElementById('navPassenger');
  const navDriver = document.getElementById('navDriver');
  const navDash = document.getElementById('navAdminDash');
  const navSet = document.getElementById('navAdminSet');
  const navProf = document.getElementById('navProfile');
  // hide all first
  [navHome, navPass, navDriver, navDash, navSet, navProf].forEach(el=>{ if(el) el.style.display='none'; });
  if(!role){
    if(navHome) navHome.style.display='flex';
    if(navPass) navPass.style.display='flex';
    if(navDriver) navDriver.style.display='flex';
    if(navProf) navProf.style.display='flex';
    return;
  }
  const r = role.toLowerCase();
  if(r==='passenger'){
    if(navHome) navHome.style.display='flex';
    if(navPass) navPass.style.display='flex';
    if(navProf) navProf.style.display='flex';
  } else if(r==='driver'){
    if(navHome) navHome.style.display='flex';
    if(navDriver) navDriver.style.display='flex';
    if(navProf) navProf.style.display='flex';
  } else if(r==='admin'){
    if(navHome) navHome.style.display='flex';
    if(navDash) navDash.style.display='flex';
    if(navSet) navSet.style.display='flex';
    if(navProf) navProf.style.display='flex';
  }
  // active state
  const hash = location.hash||'#/';
  document.querySelectorAll('.bottom-nav a').forEach(a=>{
    a.classList.remove('active');
    if(a.getAttribute('href')===hash) a.classList.add('active');
    if(hash.startsWith('#/admin') && a.id==='navAdminDash' && hash==='#/admin') a.classList.add('active');
    if(hash.startsWith('#/admin/settings') && a.id==='navAdminSet') a.classList.add('active');
  });
}

async function render(){
  const hash=location.hash||'#/';
  const session=await getSession();
  updateBrand();
  if(!session && hash!=='#/login' && hash!=='#/'){ location.hash='#/login'; return; }
  if(session){
    try{
      currentProfile=await getProfile();
      userBadge.textContent=`${currentProfile?.name||''} • ${currentProfile?.role}`;
      userBadge.classList.remove('hidden');
    }catch(e){
      if(e.code==='BANNED' || String(e.message).toLowerCase().includes('banned')){
        routerEl.innerHTML = viewBannedInfo(e.bannedDetail||{reason:e.message}) + `<div class="card"><button id="btnForceLogout" class="btn secondary">Logout & Ganti Akun</button></div>`;
        userBadge.textContent='BANNED'; userBadge.classList.remove('hidden');
        return;
      }
    }
  }
  const role = currentProfile?.role||null;
  applyBottomNav(role);

  if(role){
    const r = role.toLowerCase();
    if(r==='passenger' && (hash.startsWith('#/driver') || hash.startsWith('#/admin'))){ location.hash='#/'; return; }
    if(r==='driver' && (hash.startsWith('#/passenger') || hash.startsWith('#/admin'))){ location.hash='#/'; return; }
    if(r==='admin' && (hash.startsWith('#/passenger') || hash.startsWith('#/driver'))){ location.hash='#/'; return; }
  }

  if(!pushChannel && currentProfile){
    try{ pushChannel = push.listenRealtimeOrders(currentProfile); }catch{}
  }

  let html='';
  if(hash==='#/login') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash==='#/' || hash==='') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash.startsWith('#/onboarding')) html=viewOnboarding(currentProfile);
  else if(hash.startsWith('#/passenger')) html=viewPassenger(currentProfile);
  else if(hash.startsWith('#/driver')) html=viewDriver(currentProfile);
  else if(hash.startsWith('#/profile')) html=viewProfile(currentProfile);
  else if(hash.startsWith('#/admin')){
    if((currentProfile?.role||'').toLowerCase()!=='admin'){
      html='<div class="card"><h3>🔒 Akses Ditolak</h3><p class="muted">Hanya admin</p></div>';
    } else if(hash.startsWith('#/admin/settings')){
      html='<div class="card"><p class="muted">⏳ Memuat pengaturan...</p></div>';
      routerEl.innerHTML=html;
      try{
        const settings = await adminMod.getAppSettings();
        routerEl.innerHTML = viewAdminSettings(settings);
      }catch(e){ routerEl.innerHTML = `<div class="card">❌ ${e.message}</div>`; }
      applyBottomNav(role);
      return;
    } else {
      html='<div class="card"><p class="muted">⏳ Memuat dashboard...</p></div>';
      routerEl.innerHTML=html;
      try{
        const [stats, users, reports, banned, orders] = await Promise.all([
          adminMod.getDashboardStats(),
          adminMod.getAllUsers(50),
          reportMod.getReports().catch(()=>[]),
          reportMod.getBannedUsers().catch(()=>[]),
          adminMod.getRecentOrders(10)
        ]);
        routerEl.innerHTML = viewAdminDashboard(stats, users, reports, banned, orders);
      }catch(e){ routerEl.innerHTML = `<div class="card">❌ ${e.message}</div>`; }
      applyBottomNav(role);
      return;
    }
  }
  routerEl.innerHTML=html;
  applyBottomNav(role);
}

// events
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnGoogle')){
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    if(error) alert(error.message);
  }
  if(e.target.closest('#btnLogout')){
    await supabase.auth.signOut(); location.hash='#/login'; location.reload();
  }
  if(e.target.closest('#btnForceLogout')){
    await supabase.auth.signOut(); location.hash='#/login'; location.reload();
  }
  if(e.target.closest('#btnSaveOnboard')){
    const name=document.getElementById('displayName')?.value;
    if(!name) return alert('Isi nama');
    try{
      await supabase.from('users').update({ name }).eq('google_id', currentProfile.google_id);
      alert('Saved'); location.hash='#/';
    }catch(err){ alert(err.message); }
  }
  if(e.target.closest('#btnSearchNearby')){
    order.searchNearby();
  }
  if(e.target.closest('#btnRefreshPickup')){
    order.refreshPickupField();
  }
  if(e.target.closest('#btnOpenMap')){
    map.openMapPicker();
  }
  if(e.target.closest('#btnOrder')){
    const vehicle=document.querySelector('input[name="vehicleType"]:checked')?.value||'motor';
    const driverId=document.getElementById('btnOrder')?.dataset.driverId||null;
    await order.createOrder(driverId, currentProfile);
  }
  if(e.target.closest('[data-order-driver]')){
    const btn=e.target.closest('[data-order-driver]');
    const driverId=btn.getAttribute('data-order-driver');
    await order.createOrder(driverId, currentProfile);
  }
  if(e.target.closest('#btnGoOnline')){
    const btn=e.target.closest('#btnGoOnline');
    try{
      const status = btn.dataset.status;
      if(status==='online'){
        await supabase.from('users').update({ status: 'offline' }).eq('id', currentProfile.id);
        await supabase.from('driver_locations').delete().eq('driver_id', currentProfile.id);
        btn.textContent='🔴 Go Online'; btn.dataset.status='offline'; btn.className='btn offline-active';
      } else {
        await supabase.from('users').update({ status: 'online' }).eq('id', currentProfile.id);
        const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:5000}));
        await supabase.from('driver_locations').upsert({ driver_id: currentProfile.id, lat: pos.coords.latitude, lng: pos.coords.longitude, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });
        btn.textContent='🟢 Online'; btn.dataset.status='online'; btn.className='btn online-active';
      }
    }catch(err){ alert(err.message); }
  }
  if(e.target.closest('[data-change-role]')){
    const sel=e.target.closest('[data-change-role]');
    const userId=sel.getAttribute('data-change-role'); const newRole=sel.value;
    if(!confirm(`Ganti role jadi ${newRole}?`)) return;
    try{ await adminMod.updateUserRole(userId, newRole); alert('OK'); }catch(err){ alert(err.message); }
  }
  if(e.target.closest('#btnSaveSettings')){
    e.preventDefault();
    const statusEl=document.getElementById('settingsStatus');
    if(statusEl) statusEl.textContent='⏳ Menyimpan ke database...';
    try{
      const newSettings={
        app_name: document.getElementById('setAppName')?.value||'OJOL SURUH',
        wilayah_name: document.getElementById('setWilayah')?.value||'Kecamatan Suruh',
        kabupaten_name: document.getElementById('setKabupaten')?.value||'Kabupaten Trenggalek',
        coverage_radius_km: parseFloat(document.getElementById('setRadius')?.value||15),
        suruh_center: { lat: parseFloat(document.getElementById('setCenterLat')?.value||-8.1111679), lng: parseFloat(document.getElementById('setCenterLng')?.value||111.6064513) },
        suruh_bbox: { minLat: parseFloat(document.getElementById('setBboxMinLat')?.value||-8.20), maxLat: parseFloat(document.getElementById('setBboxMaxLat')?.value||-8.02), minLng: parseFloat(document.getElementById('setBboxMinLng')?.value||111.52), maxLng: parseFloat(document.getElementById('setBboxMaxLng')?.value||111.70) },
        trenggalek_bbox: { minLat: parseFloat(document.getElementById('setKabMinLat')?.value||-8.50), maxLat: parseFloat(document.getElementById('setKabMaxLat')?.value||-7.95), minLng: parseFloat(document.getElementById('setKabMinLng')?.value||111.32), maxLng: parseFloat(document.getElementById('setKabMaxLng')?.value||111.90) },
        tarif_motor_base: parseInt(document.getElementById('setMotorBase')?.value||3000),
        tarif_motor_perkm: parseInt(document.getElementById('setMotorPerKm')?.value||2500),
        tarif_motor_min: parseInt(document.getElementById('setMotorMin')?.value||5000),
        tarif_mobil_base: parseInt(document.getElementById('setMobilBase')?.value||8000),
        tarif_mobil_perkm: parseInt(document.getElementById('setMobilPerKm')?.value||5500),
        tarif_mobil_min: parseInt(document.getElementById('setMobilMin')?.value||15000),
        pp_multiplier: parseFloat(document.getElementById('setPP')?.value||1.6)
      };
      const res=await adminMod.saveAppSettings(newSettings);
      if(statusEl) statusEl.textContent = res.source==='database' ? '✅ Tersimpan di DATABASE - HP lain akan berubah' : '⚠️ Tersimpan lokal, DB gagal: '+(res.error||'');
      alert(res.source==='database' ? '✅ Tersimpan di DATABASE!' : 'Tersimpan lokal, cek SQL tabel app_settings');
      updateBrand();
    }catch(err){ if(statusEl) statusEl.textContent='❌ '+err.message; alert(err.message); }
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(()=>{});
  });
}

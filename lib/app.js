// app.js - Entry point modular, FINAL logic tetap
import { supabase } from './app/supabase.js';
import { SURUH_CENTER, ACTIVE_KECAMATAN_NAME } from './app/config.js';
import { isInSuruhBbox, getActiveKecamatanName } from './app/geofence.js';
import { getSession, getProfile, deleteAccount } from './app/user.js';
import * as order from './app/order.js';
window.order = order; // expose for map picker fix
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
      import('./app/store/storeViews.js')
    ]);
    storeMods = { ...idx, ...views };
    try{ idx.initStores?.(); }catch(e){}
    return storeMods;
  }catch(e){
    lastStoreError = (e.message||e);
    console.warn('[store] belum siap', e);
    return null;
  }
}


// ===== Render & Routing =====
async function fetchRemoteSettings(){
  try{
    // Coba ambil dari Supabase app_settings id=1 (global)
    const { data, error } = await supabase.from('app_settings').select('settings').eq('id',1).maybeSingle();
    if(!error && data && data.settings){
      const remote = data.settings;
      // Merge dengan yang ada di localStorage, remote menang jika lebih baru
      const localRaw = localStorage.getItem('app_settings');
      let local = {};
      try{ local = localRaw ? JSON.parse(localRaw) : {}; }catch(e){}
      // Jika remote punya updated_at atau beda, simpan ke localStorage
      const merged = { ...local, ...remote };
      // Simpan jika beda
      if(JSON.stringify(merged) !== localRaw){
        localStorage.setItem('app_settings', JSON.stringify(remote));
        if(remote.activeKecamatanCode){
          localStorage.setItem('active_kecamatan_code', remote.activeKecamatanCode);
        }
        console.log('✅ Remote settings loaded from Supabase:', remote.appName, remote.activeKecamatanCode);
      }
      return remote;
    }
  }catch(e){
    console.log('Remote settings fetch failed, pakai localStorage', e.message);
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

async function render(){
  // 1. Coba fetch remote settings dulu (penting setelah hapus data penjelajahan)
  try{
    await fetchRemoteSettings();
  }catch(e){}
  // 2. Apply theme dari localStorage (sudah termasuk remote jika ada)
  applyLiveTheme();


  const hash=location.hash||'#/'; const session=await getSession();
  if(!session && hash!=='#/login' && hash!=='#/'){ location.hash='#/login'; return; }
  if(session){ try{ currentProfile=await getProfile(); userBadge.textContent=`${currentProfile?.name||''} • ${currentProfile?.role}`; userBadge.classList.remove('hidden'); }catch(e){} }
  const navHome=document.querySelector('a[href="#/"]'); const navPass=document.querySelector('a[href="#/passenger"]'); const navDriver=document.querySelector('a[href="#/driver"]'); const navProfile=document.querySelector('a[href="#/profile"]'); const navAdminChk=document.querySelector('a[href="#/admin"]'); const navAdminSet=document.querySelector('a[href="#/admin/settings"]'); const navHist=document.querySelector('a[href="#/history"]');
  if(currentProfile){
    if(currentProfile.role==='admin'){ if(navHome) navHome.style.display='none'; if(navPass) navPass.style.display='none'; if(navDriver) navDriver.style.display='none'; if(navProfile) navProfile.style.display='none'; if(navHist) navHist.style.display='none'; if(navAdminChk) navAdminChk.style.display=''; if(navAdminSet) navAdminSet.style.display=''; if(hash.startsWith('#/passenger')||hash.startsWith('#/driver')||hash.startsWith('#/profile')||hash==='#/'||hash===''||hash.startsWith('#/history')){ location.hash='#/admin'; return; } }
    else if(currentProfile.role==='driver'){ if(navHome) navHome.style.display=''; if(navPass) navPass.style.display='none'; if(navDriver) navDriver.style.display=''; if(navProfile) navProfile.style.display=''; if(navHist) navHist.style.display=''; if(navAdminChk) navAdminChk.style.display='none'; if(navAdminSet) navAdminSet.style.display='none'; if(hash.startsWith('#/passenger')||hash.startsWith('#/admin')){ location.hash='#/'; return; } }
    else { if(navHome) navHome.style.display=''; if(navDriver) navDriver.style.display='none'; if(navPass) navPass.style.display=''; if(navProfile) navProfile.style.display=''; if(navHist) navHist.style.display=''; if(navAdminChk) navAdminChk.style.display='none'; if(navAdminSet) navAdminSet.style.display='none'; if(hash.startsWith('#/driver')||hash.startsWith('#/admin')){ location.hash='#/'; return; } }
  } else { if(navHome) navHome.style.display=''; if(navPass) navPass.style.display=''; if(navDriver) navDriver.style.display=''; if(navProfile) navProfile.style.display=''; if(navHist) navHist.style.display='none'; }

  // Setup push realtime listener once per session
  if(currentProfile && !pushChannel){
    try{ pushChannel = push.listenRealtimeOrders(currentProfile); }catch(e){}
  }

  // Admin guard - sembunyikan Home & Profil untuk admin sesuai request
  const isAdmin = currentProfile?.role==='admin';
  const navAdmin = document.querySelector('a[href="#/admin"]');
  const navAdminS = document.querySelector('a[href="#/admin/settings"]');
  const navHomeG = document.querySelector('a[href="#/"]');
  const navProfG = document.querySelector('a[href="#/profile"]');
  if(navAdmin) navAdmin.style.display = isAdmin ? '' : 'none';
  if(navAdminS) navAdminS.style.display = isAdmin ? '' : 'none';
  if(isAdmin){ if(navHomeG) navHomeG.style.display='none'; if(navProfG) navProfG.style.display='none'; }

    let html='';
  if(hash.startsWith('#/store')){
    const mods = await getStoreMods();
    if(!mods){
      html = `<div class="card"><h2>🍔 Food</h2><p class="muted">Modul Food belum siap: ${lastStoreError||'file tidak ada'}</p><a href="#/" class="btn primary">Home</a></div>`;
    } else {
      try{
        if(hash==='#/store' || hash==='#/store/') html = await mods.viewStoreList();
        else if(hash.startsWith('#/store/cart')) html = await mods.viewStoreCart();
        else if(hash.startsWith('#/store/my')) html = await mods.viewMyStore();
        else if(hash.startsWith('#/store/products')) html = await mods.viewStoreProducts();
        else if(hash.startsWith('#/store/orders')) html = await mods.viewStoreOrders();
        else if(hash.startsWith('#/store/detail/')){ const id = hash.split('/').pop().split('?')[0]; html = await mods.viewStoreDetail(id); }
        else html = await mods.viewStoreList();
      }catch(e){
        html = `<div class="card"><h2>🍔 Food Error</h2><p class="muted">${e.message}</p></div>`;
      }
    }
  } else if(hash.startsWith('#/admin')){
    if(!isAdmin){ html='<div class="card" style="border:1px solid #ef4444">⛔ Akses ditolak - hanya admin</div>'; }
    else if(hash==='#/admin/settings' || hash==='#/admin/setting'){
      const settings = admin.getAppSettings();
      html = viewAdminSettings(settings, currentProfile);
    } else {
      html = viewAdminDashboard();
    }
  } else if(hash.startsWith('#/history')){
    if(!currentProfile){
      html='<div class="card">Login dulu untuk lihat histori<br/><a href="#/login" class="btn primary">Login</a></div>';
    } else {
      try{
        if(currentProfile.role==='driver'){
          const orders = await history.getDriverHistory(currentProfile.id, 20);
          html = history.viewHistoryDriver(orders);
        } else {
          const orders = await history.getPassengerHistory(currentProfile.id, 20);
          html = history.viewHistoryPassanger(orders);
        }
      }catch(e){
        html=`<div class="card">❌ Gagal load histori: ${e.message}<br/><span style="font-size:11px">Cek Supabase: orders harus punya passenger_id & driver_id</span></div>`;
      }
    }
  } else if(hash==='#/login') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash==='#/' || hash==='') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash.startsWith('#/onboarding')) html=viewOnboarding(currentProfile);
  else if(hash.startsWith('#/passenger')) html=viewPassenger(currentProfile);
  else if(hash.startsWith('#/driver')) html=viewDriver(currentProfile);
  else if(hash.startsWith('#/profile')) html=viewProfile(currentProfile);
  else html='<div class="card">404 - Halaman tidak ditemukan<br/><a href="#/">Home</a> • <a href="#/history">Histori</a></div>';
  routerEl.innerHTML=html;
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active', a.getAttribute('href')===hash));

  // Admin Dashboard hooks
  if(hash.startsWith('#/admin') && currentProfile?.role==='admin'){
    setTimeout(async ()=>{
      try{
        const stats = await admin.getAdminStats();
        const elTotal=document.getElementById('statTotal'); if(elTotal) elTotal.textContent=stats.total;
        const elActive=document.getElementById('statActive'); if(elActive) elActive.textContent=stats.active;
        const elOffline=document.getElementById('statOffline'); if(elOffline) elOffline.textContent=stats.offline;
        const elBanned=document.getElementById('statBanned'); if(elBanned) elBanned.textContent=stats.banned;
        const elDrivers=document.getElementById('statDrivers'); if(elDrivers) elDrivers.textContent=stats.drivers;
        const elPass=document.getElementById('statPassengers'); if(elPass) elPass.textContent=stats.passengers;
        const elOrders=document.getElementById('statOrders'); if(elOrders) elOrders.textContent=stats.ordersToday;
        const users = await admin.getUsersList('all','');
        renderAdminUserList(users);
        const reports = await admin.getReports();
        renderAdminReports(reports);
        const kecBox = document.getElementById('kecamatanButtons');
        if(kecBox){
          const { KECAMATAN_DATA, ACTIVE_KECAMATAN_CODE } = await import('./app/config.js');
          // Dropdown hemat halaman - ganti tombol banyak jadi 1 select
          kecBox.innerHTML = `<select id="kecDropdown" style="width:100%;padding:8px;border-radius:8px"><option value="">-- Pilih Kecamatan --</option>`+Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${code}" ${code===ACTIVE_KECAMATAN_CODE?'selected':''}>${info.name}</option>`).join('')+`</select><p class="muted" style="font-size:10px;margin-top:4px">Pilih lalu simpan di Setting untuk hemat tempat</p>`;
          const dd = document.getElementById('kecDropdown');
          if(dd) dd.addEventListener('change', (ev)=>{
            const code = ev.target.value;
            if(code){ localStorage.setItem('active_kecamatan_code', code); alert('Wilayah diubah ke '+KECAMATAN_DATA[code].name+' - buka Setting > Simpan untuk permanen, lalu reload'); }
          });
        }
        const sqlBox=document.getElementById('adminSqlBox'); if(sqlBox) sqlBox.textContent=admin.ADMIN_SQL;
      }catch(e){ console.error('admin load error', e); }
    }, 300);
  }

  function renderAdminUserList(users){
    const box=document.getElementById('adminUserList');
    const count=document.getElementById('userCount');
    if(!box) return;
    if(count) count.textContent=`(${users.length})`;
    if(!users.length){ box.innerHTML='<div style="padding:8px">Tidak ada user</div>'; return; }
    box.innerHTML = users.map(u=>{
      const banned = u.banned || u.status==='banned';
      return `<div class="admin-list-item" style="${banned?'background:rgba(239,68,68,0.1)':''}">
        <div style="flex:1">
          <b>${u.name||'Tanpa Nama'}</b> <span class="admin-badge ${'admin'===u.role?'badge-admin':u.role==='driver'?'badge-driver':'badge-passenger'}">${u.role}</span> ${banned?'<span class="admin-badge badge-banned">BANNED</span>':''}
          <div class="muted" style="font-size:11px">${u.email||''} • ${u.hp||''} • ${u.status||''}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button data-admin-detail="${u.id}" class="btn secondary" style="font-size:10px;padding:4px 6px">Detail</button>
          ${banned?`<button data-admin-unban="${u.id}" class="btn secondary" style="font-size:10px;padding:4px 6px;background:#dcfce7">Unban</button>`:`<button data-admin-ban="${u.id}" class="btn secondary" style="font-size:10px;padding:4px 6px;background:#fee2e2">Ban</button>`}
        </div>
      </div>`;
    }).join('');
  }

  function renderAdminReports(reports){
    const box=document.getElementById('adminReportList');
    if(!box) return;
    if(!reports.length){ box.innerHTML='<div style="padding:8px;font-size:12px">Belum ada laporan. Tombol 🚩 Laporkan ada di list driver & tracking.</div>'; return; }
    box.innerHTML = reports.map(r=>`
      <div class="card" style="margin:0 0 6px;padding:8px;border-color:rgba(239,68,68,0.3)">
        <div style="font-size:12px"><b>${r.reported_name||r.reported_id||''}</b> dilaporkan • Alasan: <b>${r.reason||''}</b> • Status: ${r.status||'pending'}</div>
        <div style="font-size:11px;color:#666">${r.description||''}</div>
        <div style="font-size:10px;color:#999">Oleh ${r.reporter_name||r.reporter_id||''} • ${r.created_at?new Date(r.created_at).toLocaleString():''}</div>
        <div style="margin-top:4px;display:flex;gap:4px">
          <button data-admin-ban="${r.reported_id}" class="btn secondary" style="font-size:10px;padding:2px 6px;background:#fee2e2">🔨 Ban</button>
          <button data-admin-report-resolve="${r.id}" class="btn secondary" style="font-size:10px;padding:2px 6px">✅ Selesai</button>
        </div>
      </div>
    `).join('');
  }

  // Disclaimer dropdown toggle text (Home page)

  const discDetails = document.getElementById('disclaimerDetails');
  const discSummary = document.getElementById('btnDisclaimerMore');
  if(discDetails && discSummary){
    discDetails.addEventListener('toggle', ()=>{
      if(discDetails.open){
        discSummary.innerHTML = '🔼 Tutup <span style="font-size:10px">▲</span>';
      } else {
        discSummary.innerHTML = '📖 Baca selengkapnya <span style="font-size:10px">▼</span>';
      }
    });
  }

  // Driver online logic + highlight tombol (v6.1) + ORDER MASUK HANDLER
  if(hash.startsWith('#/driver') && currentProfile){
    const btnOn=document.getElementById('btnOnline'); const btnOff=document.getElementById('btnOffline');
    function setDriverHighlight(status){
      if(!btnOn || !btnOff) return;
      if(status==='online'){
        btnOn.className='btn online-active';
        btnOff.className='btn secondary';
      }else{
        btnOn.className='btn secondary';
        btnOff.className='btn offline-active';
      }
      const s=document.getElementById('drvStatus'); if(s) s.textContent=status;
    }
    // set awal sesuai DB
    setDriverHighlight(currentProfile.status||'offline');
    // Init driver orders list & realtime
    try{ driver.initDriverPage(currentProfile); }catch(e){ console.warn('initDriverPage fail', e); }

    if(btnOn) btnOn.onclick=async ()=>{
      if(currentProfile.role==='driver' && (!currentProfile.nopol || !currentProfile.tipe_sim || !currentProfile.hp || !currentProfile.jenis_kendaraan)){ alert('Lengkapi Jenis Kendaraan, Nopol, SIM, HP di Profil dulu'); location.hash='#/profile'; return; }
      let firstLat=null, firstLng=null;
      try{ 
        const posChk = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:8000})); 
        firstLat = posChk.coords.latitude; firstLng = posChk.coords.longitude;
        if(!isInSuruhBbox(firstLat, firstLng)){ alert('⛔ Kamu di luar Kecamatan ' + (getActiveKecamatanName?getActiveKecamatanName():ACTIVE_KECAMATAN_NAME||'Suruh')); return; }
        // SET LOKASI DRIVER LANGSUNG - jangan tunggu watchPosition
        const geoFirst = `SRID=4326;POINT(${firstLng} ${firstLat})`;
        try{
          await supabase.from('driver_locations').upsert({driver_id:currentProfile.id, lokasi:geoFirst, heading:posChk.coords.heading||0, speed_kmh:0, updated_at:new Date().toISOString()}, {onConflict:'driver_id'});
          await supabase.from('users').update({lokasi:geoFirst, last_lat:firstLat, last_lng:firstLng}).eq('id',currentProfile.id);
        }catch(e){ console.warn('set lokasi awal gagal', e.message); }
      }catch(e){ alert('Aktifkan GPS - tidak bisa dapat lokasi'); return; }
      await supabase.from('users').update({status:'online'}).eq('id',currentProfile.id);
      setDriverHighlight('online');
      try{ driver.initDriverPage(currentProfile); }catch(e){}
      const watchId=navigator.geolocation.watchPosition(async pos=>{
        const {latitude:lat, longitude:lng, heading, speed, accuracy}=pos.coords;
        if(!isInSuruhBbox(lat,lng)){ setDriverHighlight('luar '+ (getActiveKecamatanName?getActiveKecamatanName():ACTIVE_KECAMATAN_NAME||'Suruh') +' - offline'); alert('⛔ Keluar dari '+ (getActiveKecamatanName?getActiveKecamatanName():ACTIVE_KECAMATAN_NAME||'Suruh') +'. Auto offline.'); await supabase.from('users').update({status:'offline'}).eq('id',currentProfile.id); setDriverHighlight('offline'); if(window._watchId) navigator.geolocation.clearWatch(window._watchId); return; }
        const speedKmh=speed? speed*3.6:0;
        const sp=document.getElementById('kpiSpeed'); if(sp) sp.textContent=speedKmh.toFixed(1);
        const hd=document.getElementById('kpiHead'); if(hd) hd.textContent=(heading||0).toFixed(0)+'°';
        const up=document.getElementById('kpiUpd'); if(up) up.textContent=new Date().toLocaleTimeString();
        const latEl=document.getElementById('kpiLat'); if(latEl) latEl.textContent=lat.toFixed(5);
        const lngEl=document.getElementById('kpiLng'); if(lngEl) lngEl.textContent=lng.toFixed(5);
        const accEl=document.getElementById('kpiAcc'); if(accEl) accEl.textContent=`${(accuracy||0).toFixed(0)}m`;
        const locText=document.getElementById('driverLocText'); if(locText) locText.textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const geo=`SRID=4326;POINT(${lng} ${lat})`;
        try{
          await supabase.from('driver_locations').upsert({driver_id:currentProfile.id, lokasi:geo, heading:heading||0, speed_kmh:speedKmh, updated_at:new Date().toISOString()}, {onConflict:'driver_id'});
          await supabase.from('users').update({lokasi:geo, last_lat:lat, last_lng:lng}).eq('id',currentProfile.id);
        }catch(e){}
      }, e=>alert('GPS error: '+e.message), {enableHighAccuracy:true, maximumAge:0, timeout:10000});
      window._watchId=watchId;
    };
    if(btnOff) btnOff.onclick=async ()=>{ 
      if(window._watchId) navigator.geolocation.clearWatch(window._watchId); 
      await supabase.from('users').update({status:'offline'}).eq('id',currentProfile.id); 
      setDriverHighlight('offline');
      try{ driver.clearDriverOrdersSubscription(); }catch(e){}
    };
  }

  // Passenger hooks
  if(hash.startsWith('#/passenger')){
    setTimeout(()=>{ tracking.loadActiveTracking(); },800);
    setTimeout(order.searchNearby,500); setTimeout(order.refreshPickupField,600);
    setTimeout(()=>{
      const destEl=document.getElementById('dest');
      if(destEl){
        destEl.addEventListener('input', (e)=>{ clearTimeout(order.destDebounce); order.setDestDebounce(setTimeout(()=>order.searchDestLive(e.target.value, map),150)); });
        destEl.addEventListener('focus', (e)=>{
          // Jangan auto-show kalau baru saja pilih suggestion (prevent loop)
          if(destEl.dataset.justSelected === 'true'){
            destEl.dataset.justSelected = 'false';
            return;
          }
          if(destEl.value.length>=1) order.searchDestLive(destEl.value, map);
        });
      }
      const tripRadios=document.querySelectorAll('input[name="tripType"]'); tripRadios.forEach(r=>r.addEventListener('change',order.updateOrderEstimate));
      const vehRadios=document.querySelectorAll('input[name="vehicleType"]'); vehRadios.forEach(r=>r.addEventListener('change', (e)=>{
        // update UI border
        const labelMotor=document.getElementById('labelMotor'); const labelMobil=document.getElementById('labelMobil');
        if(labelMotor) labelMotor.style.border = e.target.value==='motor'?'2px solid #22c55e':'1px solid var(--border)';
        if(labelMobil) labelMobil.style.border = e.target.value==='mobil'?'2px solid #22c55e':'1px solid var(--border)';
        if(labelMotor) labelMotor.style.background = e.target.value==='motor'?'rgba(34,197,94,0.1)':'transparent';
        if(labelMobil) labelMobil.style.background = e.target.value==='mobil'?'rgba(34,197,94,0.1)':'transparent';
        order.updateOrderEstimate();
      }));
    },800);
  }
  if(hash.startsWith('#/profile')){
    const roleSel=document.getElementById('profileRole');
    if(roleSel){ roleSel.addEventListener('change', e=>{
      const v=e.target.value;
      const df=document.getElementById('profileDriverFields');
      const pf=document.getElementById('profilePassengerFields');
      const mf=document.getElementById('profileMerchantFields');
      if(df) df.style.display=v==='driver'?'block':'none';
      if(pf) pf.style.display=v==='passenger'?'block':'none';
      if(mf) mf.style.display=(v==='merchant'||v==='warung')?'block':'none';
    }); }
    // driver jenis kendaraan UI toggle border
    const jenisRadios=document.querySelectorAll('input[name="jenisKendaraan"]');
    jenisRadios.forEach(r=>r.addEventListener('change', ()=>{
      // simple re-render border handled via CSS? keep minimal
    }));
    // push status
    setTimeout(async ()=>{
      const ps = document.getElementById('pushStatus');
      const perm = await push.getPermissionStatus();
      const enabled = localStorage.getItem('push-enabled');
      if(ps) ps.textContent = `Permission: ${perm} • ${enabled?'✅ Aktif':'❌ Nonaktif'} • ${'serviceWorker' in navigator?'SW OK':'SW NO'}`;
    },300);
  }
}

// ===== Global Click Handler (jaga form flex:4 rule) =====
// Global handler untuk hide dest suggestions - single listener
document.addEventListener('click', (e)=>{
  const box=document.getElementById('destSuggestions');
  if(box && box.style.display!=='none'){
    if(!e.target.closest('#dest') && !e.target.closest('#destSuggestions')){
      box.style.display='none';
    }
  }
});

document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnGoogle')){
    const st = document.getElementById('loginStatus');
    if(st) st.textContent='⏳ Membuka Google...';
    try{
      const { error } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + location.pathname } });
      if(error) throw error;
    }catch(err){
      if(st) st.textContent='❌ '+err.message;
      alert('Login gagal di incognito: '+err.message);
    }
    return;
  }
  if(e.target.closest('#btnLogout')){ if(!confirm('Yakin logout?')) return; if(nearbyChannel) supabase.removeChannel(nearbyChannel); if(pushChannel) supabase.removeChannel(pushChannel); await supabase.auth.signOut(); localStorage.clear(); location.hash='#/login'; location.reload(); }
  if(e.target.closest('#btnEnablePush')){
    const st = document.getElementById('pushStatus');
    const btn = e.target.closest('#btnEnablePush');
    if(st) st.textContent='⏳ Meminta izin... (tunggu popup browser di atas)';
    if(btn) btn.disabled = true;
    try{
      const sub = await push.subscribeUser(currentProfile?.id);
      if(st) st.textContent = '✅ Push aktif! Endpoint: ' + (sub?.endpoint||'').slice(0,40)+'...';
    }catch(err){
      console.error(err);
      if(st) st.textContent = '❌ '+err.message;
      if(err.message.includes('Diblokir permanen')){
        alert('❌ Izin Diblokir! Buka Chrome > Settings > Site Settings > Notifications > Allow domain ini');
      }else if(err.message.includes('WhatsApp') || err.message.includes('Facebook') || err.message.includes('Browser tidak support')){
        alert('❌ Kamu buka dari WA/FB browser! Tap titik 3 > Buka di Chrome');
      }else{
        alert('❌ Gagal: '+err.message+'\nFallback realtime tetap jalan kalau app dibuka.');
      }
    }finally{
      if(btn) btn.disabled = false;
    }
  }
  if(e.target.closest('#btnDisablePush')){
    const st = document.getElementById('pushStatus');
    if(st) st.textContent='⏳ Mematikan...';
    await push.unsubscribeUser();
    if(st) st.textContent='❌ Push dimatikan';
  }
  if(e.target.closest('#btnEditProfile')){
    const form = document.getElementById('profileEditForm');
    if(form){
      form.style.display = form.style.display==='none' ? 'block' : 'none';
      if(form.style.display==='block') form.scrollIntoView({behavior:'smooth'});
    }
    return;
  }
  if(e.target.closest('#btnCancelEdit')){
    const form = document.getElementById('profileEditForm');
    if(form) form.style.display='none';
    return;
  }
  if(e.target.closest('#btnSaveOnboard')){
    const name=document.getElementById('displayName')?.value?.trim(); if(!name) return alert('Nama wajib');
    const st=document.getElementById('saveStatus'); st.textContent='Menyimpan...';
    try{ const {data,error}=await supabase.from('users').update({name}).eq('id',currentProfile.id).select().single(); if(error) throw error; currentProfile=data; st.textContent='✅'; location.hash='#/profile'; }catch(err){ st.textContent='❌ '+err.message; }
  }
  if(e.target.closest('#btnSaveProfileRole')){
    const name=document.getElementById('editName')?.value?.trim(); const role=document.getElementById('profileRole')?.value;
    const hp=document.getElementById('profileHp')?.value?.trim()||null;
    const desa=document.getElementById('profileDesa')?.value?.trim()||null;
    const alamat=document.getElementById('profileAlamat')?.value?.trim()||null;
    const catatan=document.getElementById('profileCatatan')?.value?.trim()||null;
    const jenisKendaraan=document.querySelector('input[name="jenisKendaraan"]:checked')?.value||'motor';
    const nopol=document.getElementById('profileNopol')?.value?.trim()||null; const tipeSim=document.getElementById('profileSim')?.value||null; const tipe=document.getElementById('profileTipe')?.value?.trim()||null;
    const st=document.getElementById('profileStatus');
    if(!name) return alert('Nama wajib');
    if(!hp) return alert('HP WA wajib diisi (penumpang & driver)');
    if(role==='driver'){ if(!jenisKendaraan) return alert('Pilih jenis kendaraan motor/mobil'); if(!nopol) return alert('Nopol wajib untuk driver'); if(!tipeSim) return alert('SIM wajib untuk driver'); }
    if(role==='passenger'){ if(!desa) return alert('Desa wajib untuk penumpang'); if(!alamat) return alert('Alamat wajib untuk penumpang'); }
    st.textContent='Menyimpan...';
    try{
      const patch={
        name, role, status:'active',
        hp:hp,
        desa: role==='passenger'?desa:null,
        alamat: role==='passenger'?alamat:null,
        catatan: role==='passenger'?catatan:null,
        jenis_kendaraan: role==='driver'?jenisKendaraan:null,
        nopol: role==='driver'?nopol:null,
        tipe_sim: role==='driver'?tipeSim:null,
        tipe_motor: role==='driver'?tipe:null,
      };
      const {data,error}=await supabase.from('users').update(patch).eq('id',currentProfile.id).select().single(); if(error) throw error;
      currentProfile=data; userBadge.textContent=`${data.name} • ${data.role}`; st.textContent='✅ Profil disimpan'; setTimeout(()=>{ location.hash='#/'; }, 600);
    }catch(err){ st.textContent='❌ '+err.message; }
  }
  if(e.target.closest('#btnDeleteAccount')){
    const confirmInput=document.getElementById('confirmDelete')?.value?.trim();
    const delSt=document.getElementById('deleteStatus');
    if(confirmInput!=='HAPUS'){ if(delSt) delSt.textContent='❌ Ketik HAPUS persis huruf besar'; return alert('Ketik HAPUS untuk konfirmasi'); }
    if(!confirm('YAKIN HAPUS AKUN PERMANEN? Semua data akan hilang!')) return;
    if(!confirm('Konfirmasi terakhir - hapus akun '+currentProfile.name+'?')) return;
    if(delSt) delSt.textContent='⏳ Menghapus...';
    try{
      await deleteAccount(currentProfile.id);
      alert('Akun dihapus');
      localStorage.clear();
      location.hash='#/login'; location.reload();
    }catch(err){ if(delSt) delSt.textContent='❌ '+err.message; alert('Gagal hapus: '+err.message); }
    return;
  }
  if(e.target.closest('#btnOpenMap')){ e.preventDefault(); await map.openMapPicker(); return; }
  if(e.target.closest('#btnCloseMap')){ e.preventDefault(); map.closeMapPicker(); return; }
  if(e.target.closest('#btnConfirmMap')){ e.preventDefault(); map.confirmMapLocation(order.updateOrderEstimate); return; }
  if(e.target.closest('#btnOpenGoogle')){ e.preventDefault(); if(map.mapSelected.lat){ window.open(`https://www.google.com/maps?q=${map.mapSelected.lat},${map.mapSelected.lng}&z=18`, '_blank'); } else { window.open(`https://www.google.com/maps/@${SURUH_CENTER.lat},${SURUH_CENTER.lng},13z`, '_blank'); } return; }
  if(e.target.closest('#btnRefreshPickup')) await order.refreshPickupField();
  if(e.target.closest('#btnEstimate')) await order.updateOrderEstimate();
  if(e.target.closest('#btnOrder')) await order.createOrder(null, currentProfile);
  if(e.target.closest('[data-order-driver]')){ const driverId=e.target.closest('[data-order-driver]').getAttribute('data-order-driver'); await order.createOrder(driverId, currentProfile); }
  if(e.target.closest('#btnFind')) await order.searchNearby();
  if(e.target.closest('[data-report-user]')){
    const btn = e.target.closest('[data-report-user]');
    const reportedId = btn.getAttribute('data-report-user');
    const reportedName = btn.getAttribute('data-report-name')||'User';
    const reportedRole = btn.getAttribute('data-report-role')||'';
    const orderId = btn.getAttribute('data-report-order')||null;
    report.openReportModal(reportedId, reportedName, reportedRole, orderId);
    return;
  }
  if(e.target.closest('#btnCloseReport') || e.target.closest('#btnCancelReport')){
    e.preventDefault(); report.closeReportModal(); return;
  }
  if(e.target.closest('#btnSubmitReport')){
    e.preventDefault(); await report.submitReport(currentProfile); return;
  }
  if(e.target.closest('[data-admin-ban]')){
    const uid = e.target.closest('[data-admin-ban]').getAttribute('data-admin-ban');
    const reason = prompt('Alasan ban:','Pelanggaran laporan');
    if(reason===null) return;
    if(confirm('Ban user '+uid+'?')){ await admin.banUser(uid, reason); alert('User dibanned'); location.reload(); }
    return;
  }
  if(e.target.closest('[data-admin-unban]')){
    const uid = e.target.closest('[data-admin-unban]').getAttribute('data-admin-unban');
    if(confirm('Unban user '+uid+'?')){ await admin.unbanUser(uid); alert('User di-unban'); location.reload(); }
    return;
  }
  if(e.target.closest('[data-admin-detail]')){
    const uid = e.target.closest('[data-admin-detail]').getAttribute('data-admin-detail');
    const detail = await admin.getUserDetail(uid);
    const box=document.getElementById('adminUserDetail');
    if(box && detail){
      box.style.display='block';
      box.innerHTML = `<b>${detail.user.name}</b> (${detail.user.role})<br><span style="font-size:11px">${detail.user.email||''}<br>${detail.user.hp||''}<br>Status:${detail.user.status} ${detail.user.banned?'BANNED:'+detail.user.banned_reason:''}<br>Nopol:${detail.user.nopol||''} SIM:${detail.user.tipe_sim||''}<br>Desa:${detail.user.desa||''} Alamat:${detail.user.alamat||''}</span><br><br><div style="display:flex;gap:4px"><button data-report-user="${detail.user.id}" data-report-name="${detail.user.name}" data-report-role="${detail.user.role}" class="btn secondary" style="font-size:11px;background:#fef2f2">🚩 Laporkan</button><button data-admin-ban="${detail.user.id}" class="btn secondary" style="font-size:11px;background:#fee2e2">Ban</button></div>`;
    }
    return;
  }
  if(e.target.closest('#btnAdminRefresh')){
    e.preventDefault(); location.reload(); return;
  }
  if(e.target.closest('#btnSaveSettings')){
    e.preventDefault();
    const newSet = {
      appName: document.getElementById('setAppName')?.value||'Ojol Trenggalek',
      appShortName: document.getElementById('setAppShort')?.value||'Ojol',
      primaryColor: document.getElementById('setPrimary')?.value||'#16a34a',
      secondaryColor: document.getElementById('setSecondary')?.value||'#f59e0b',
      disclaimerTitle: document.getElementById('setDiscTitle')?.value||'',
      disclaimerText: document.getElementById('setDiscText')?.value||'',
      footerText: document.getElementById('setFooter')?.value||'',
      activeKecamatanCode: document.getElementById('setKecamatan')?.value||'3503071'
    };
    // Simpan khusus untuk wilayah agar config.js langsung baca
    try{ localStorage.setItem('active_kecamatan_code', newSet.activeKecamatanCode); }catch(e){}
    const ok = await admin.saveAppSettings(newSet);
    const st=document.getElementById('settingStatus'); if(st) st.textContent= ok ? '✅ Disimpan - reload untuk apply wilayah & disclaimer' : '❌ Gagal';
    if(ok){ setTimeout(()=>location.reload(), 800); }
    return;
  }
  if(e.target.closest('#btnGoProfile')){
    e.preventDefault(); location.hash='#/profile'; return;
  }
  if(e.target.closest('#btnResetSettings')){
    e.preventDefault(); localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); alert('Reset, refresh halaman'); location.reload(); return;
  }
  if(e.target.closest('[data-kec]')){
    const code = e.target.closest('[data-kec]').getAttribute('data-kec');
    if(code){
      try{ localStorage.setItem('active_kecamatan_code', code); }catch(e){}
      if(confirm('Ganti wilayah ke '+code+'? Reload sekarang?')) location.reload();
    }
    return;
  }
  // Dropdown kecamatan di dashboard (hemat halaman)
  if(e.target.closest('#kecDropdown')){
    return; // handled via change listener
  }
  if(e.target.closest('#btnToggleDisc')){
    e.preventDefault();
    const btn = e.target.closest('#btnToggleDisc');
    const wrapper = document.getElementById('discWrapper');
    const fade = document.getElementById('discFade');
    const textSpan = document.getElementById('btnToggleDiscText');
    const iconSpan = document.getElementById('btnToggleDiscIcon');
    if(!wrapper) return;
    const isExpanded = btn.getAttribute('data-expanded') === 'true';
    if(isExpanded){
      wrapper.style.maxHeight = '110px';
      wrapper.setAttribute('data-collapsed','true');
      if(fade) fade.style.display = 'block';
      btn.setAttribute('data-expanded','false');
      if(textSpan) textSpan.textContent = '📖 Baca selengkapnya';
      if(iconSpan) iconSpan.textContent = '▼';
    } else {
      wrapper.style.maxHeight = wrapper.scrollHeight + 20 + 'px';
      wrapper.setAttribute('data-collapsed','false');
      if(fade) fade.style.display = 'none';
      btn.setAttribute('data-expanded','true');
      if(textSpan) textSpan.textContent = '🔼 Tutup';
      if(iconSpan) iconSpan.textContent = '▲';
    }
    return;
  }
  if(e.target.closest('#btnRefreshDriverOrders')){
    e.preventDefault();
    try{ await driver.loadDriverOrders(currentProfile); }catch(e){ console.warn(e); }
    return;
  }
  if(e.target.closest('[data-driver-accept]')){
    e.preventDefault();
    const orderId = e.target.closest('[data-driver-accept]').getAttribute('data-driver-accept');
    if(!orderId) return;
    if(!confirm('Terima order ini?')) return;
    const btn = e.target.closest('[data-driver-accept]');
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳ Menerima...';
    try{
      // Coba update lengkap dulu
      let res = await supabase.from('orders').update({ status: 'accepted', driver_id: currentProfile.id, accepted_at: new Date().toISOString() }).eq('id', orderId).select().single();
      // Jika error karena updated_at atau accepted_at tidak ada, coba tanpa itu
      if(res.error && (res.error.message.includes('updated_at') || res.error.message.includes('accepted_at') || res.error.message.includes('has no field'))){
        console.warn('Accept error trigger, coba tanpa timestamp', res.error.message);
        res = await supabase.from('orders').update({ status: 'accepted', driver_id: currentProfile.id }).eq('id', orderId).select().single();
      }
      // Jika masih error, coba hanya status
      if(res.error && res.error.message.includes('updated_at')){
        res = await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId).select().single();
        // Update driver_id terpisah kalau perlu
        if(!res.error){
          await supabase.from('orders').update({ driver_id: currentProfile.id }).eq('id', orderId);
        }
      }
      if(res.error) throw res.error;
      alert('✅ Order diterima! Hubungi penumpang via WA, OTW ke pickup');
      await driver.loadDriverOrders(currentProfile);
      // Tampilkan active order untuk driver
      const card = document.getElementById('driverActiveOrderCard');
      if(card){
        card.style.display = 'block';
        card.innerHTML = `<div class="card" style="border:2px solid #16a34a;background:#f0fdf4"><b>✅ Order Aktif: ${res.data.pickup_text||res.data.pickup} → ${res.data.dest_text||res.data.destination}</b><br/><span style="font-size:12px">Status: accepted • Rp ${res.data.estimated_cost||0}</span><div style="margin-top:8px;display:flex;gap:6px"><button data-driver-picked="${res.data.id}" class="btn primary" style="background:#16a34a">🚗 Sudah Jemput</button><button data-driver-complete="${res.data.id}" class="btn secondary">✅ Selesai</button></div></div>`;
      }
    }catch(err){
      alert('❌ Gagal terima: '+err.message);
      btn.disabled = false; btn.textContent = '✅ Terima';
    }
    return;
  }
  if(e.target.closest('[data-driver-reject]')){
    e.preventDefault();
    const orderId = e.target.closest('[data-driver-reject]').getAttribute('data-driver-reject');
    const btn = e.target.closest('[data-driver-reject]');
    if(!confirm('Tolak order ini? Order tidak akan muncul lagi untuk kamu, penumpang akan cari driver lain.')) return;
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = '⏳...';
    try{
      const { data: cur, error: curErr } = await supabase.from('orders').select('driver_id, status').eq('id', orderId).single();
      if(curErr) throw curErr;

      // 1. Non-aktifkan driver khusus untuk order ID ini (simpan di localStorage agar tidak muncul lagi)
      try{
        const key = 'rejected_orders_'+currentProfile.id;
        const rejected = JSON.parse(localStorage.getItem(key)||'[]');
        if(!rejected.includes(orderId)){ rejected.push(orderId); localStorage.setItem(key, JSON.stringify(rejected)); }
      }catch(e){}

      // FIX SEDERHANA: jika driver menolak, order otomatis dibatalkan & tutup tracking
      console.log('Reject order', orderId, '-> set cancelled');
      try{
        const { error } = await supabase.from('orders').update({ status: 'cancelled', cancel_reason: 'Driver menolak order' }).eq('id', orderId);
        if(error) throw error;
      }catch(e){
        console.warn('Update cancelled failed', e.message);
        try{ await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId); }catch(e2){ console.warn(e2.message); }
      }

      // 2. Broadcast penolakan agar kartu "menunggu driver" penumpang langsung tampil pesan
      try{
        const ch = supabase.channel('order-tracking-'+orderId);
        ch.subscribe(async (status)=>{
          if(status === 'SUBSCRIBED'){
            await ch.send({ type: 'broadcast', event: 'driver_rejected', payload: { driverName: currentProfile.name||'Driver', driverId: currentProfile.id, orderId } });
          }
        });
        setTimeout(async()=>{ try{ await ch.send({ type: 'broadcast', event: 'driver_rejected', payload: { driverName: currentProfile.name||'Driver', driverId: currentProfile.id, orderId } }); }catch(e){} }, 400);
      }catch(e){ console.warn('broadcast failed', e.message); }

      alert('✅ Order ditolak. Kamu tidak akan menerima order ini lagi. Penumpang sedang mencari driver lain.');
      await driver.loadDriverOrders(currentProfile);
    }catch(e){ 
      console.error('Reject error', e);
      alert('❌ Gagal tolak: '+e.message); 
      btn.disabled = false; btn.textContent = origText;
    }
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
      // Driver selesai - penumpang akan dapat modal rating otomatis via realtime subscription
      alert('✅ Order selesai - Penumpang akan diminta beri rating ⭐');
      document.getElementById('driverActiveOrderCard').style.display='none';
      await driver.loadDriverOrders(currentProfile);
    }catch(e){ alert(e.message); }
    return;
  }
  if(e.target.closest('#btnCancelTracking')){

    if(!confirm('Batalkan order & hentikan tracking?')) return;
    const oid = localStorage.getItem('active_order_id');
    if(oid){
      try{ await supabase.from('orders').update({status:'cancelled'}).eq('id', oid); }catch(e){}
    }
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
      try{ 
        const { data } = await supabase.from('orders').select('*').eq('id', oid).single();
        orderData = data;
      }catch(e){}
      try{ await supabase.from('orders').update({status:'completed'}).eq('id', oid); }catch(e){}
    }
    // Pastikan tracking modal tertutup dulu
    try{ tracking.clearActiveTracking(); }catch(e){}
    try{ tracking.hideTrackingUI(); }catch(e){}
    // Hapus sisa modal tracking jika masih ada
    const trackModal = document.getElementById('trackingDetailModal');
    if(trackModal) trackModal.style.display='none';
    document.body.style.overflow='';
    
    if(orderData && orderData.driver_id){
      try{
        const { data: drv } = await supabase.from('users').select('name').eq('id', orderData.driver_id).maybeSingle();
        console.log('Opening rating modal for', orderData.driver_id, drv?.name);
        rating.openRatingModal(orderData.driver_id, drv?.name||'Driver', oid);
        // Jangan redirect dulu, biar modal rating terlihat
        return;
      }catch(e){
        console.error('Rating modal error', e);
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

  // --- PICKERS FIX - semua di dalam click handler biar tidak blank ---
  if(e.target.closest('#btnPickMerchantMap')){
    e.preventDefault();
    try{
      if(window.mapModule && window.mapModule.openMapPicker) window.mapModule.openMapPicker('merchant');
      else if(window.openMapPicker) window.openMapPicker('merchant');
      else if(window.openMerchantMapPicker) window.openMerchantMapPicker();
    }catch(err){ alert('Map error: '+err.message); }
    return;
  }
  if(e.target.closest('#btnPickWarungLoc')){
    e.preventDefault();
    try{
      if(window.mapModule && window.mapModule.openMapPicker) window.mapModule.openMapPicker('warung');
      else if(window.openMapPicker) window.openMapPicker('warung');
    }catch(err){ alert(err.message); }
    return;
  }
  if(e.target.closest('#btnPickDest')){
    e.preventDefault();
    try{
      if(window.mapModule && window.mapModule.openMapPicker) window.mapModule.openMapPicker('food_dest');
      else if(window.openMapPicker) window.openMapPicker('food_dest');
    }catch(err){ alert(err.message); }
    return;
  }
  if(e.target.closest('#btnUseMyLocation')){
    e.preventDefault();
    if(!navigator.geolocation){ alert('GPS tidak support'); return; }
    navigator.geolocation.getCurrentPosition((pos)=>{
      const lat=pos.coords.latitude, lng=pos.coords.longitude;
      try{
        const raw=localStorage.getItem('ojol_cart_v2_food');
        if(raw){
          let s=JSON.parse(raw);
          s.dest={lat:lat,lng:lng,text:s.dest.text||''};
          localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
          location.reload();
        }
      }catch(e){ alert(e.message); }
    }, (err)=>alert('GPS: '+err.message), { enableHighAccuracy:true, timeout:8000 });
    return;
  }

});





window.addEventListener('hashchange', ()=>{ if(nearbyChannel) supabase.removeChannel(nearbyChannel); 
  const h=location.hash||'#/'; if(!h.startsWith('#/passenger')){ /* keep tracking in bg */ } render(); });
window.addEventListener('DOMContentLoaded', render);


// ===== PWA - v6.0 Standard Clean =====
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


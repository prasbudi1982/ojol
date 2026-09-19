// app.js - Entry point modular, FINAL logic tetap
import { supabase } from './app/supabase.js';
import { SURUH_CENTER } from './app/config.js';
import { isInSuruhBbox } from './app/geofence.js';
import { getSession, getProfile, deleteAccount } from './app/user.js';
import * as order from './app/order.js';
import * as map from './app/map.js';
import { viewLogin, viewHome, viewOnboarding, viewPassenger, viewDriver, viewProfile } from './app/views.js';
import * as push from './app/push.js';

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let nearbyChannel = null;
let pushChannel = null;

// ===== Render & Routing =====
async function render(){
  const hash=location.hash||'#/'; const session=await getSession();
  if(!session && hash!=='#/login' && hash!=='#/'){ location.hash='#/login'; return; }
  if(session){ try{ currentProfile=await getProfile(); userBadge.textContent=`${currentProfile?.name||''} • ${currentProfile?.role}`; userBadge.classList.remove('hidden'); }catch(e){} }
  const navPass=document.querySelector('a[href="#/passenger"]'); const navDriver=document.querySelector('a[href="#/driver"]');
  if(currentProfile){
    if(currentProfile.role==='driver'){ if(navPass) navPass.style.display='none'; if(navDriver) navDriver.style.display=''; if(hash.startsWith('#/passenger')){ location.hash='#/'; return; } }
    else { if(navDriver) navDriver.style.display='none'; if(navPass) navPass.style.display=''; if(hash.startsWith('#/driver')){ location.hash='#/'; return; } }
  } else { if(navPass) navPass.style.display=''; if(navDriver) navDriver.style.display=''; }

  // Setup push realtime listener once per session
  if(currentProfile && !pushChannel){
    try{ pushChannel = push.listenRealtimeOrders(currentProfile); }catch(e){}
  }

  let html='';
  if(hash==='#/login') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash==='#/' || hash==='') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash.startsWith('#/onboarding')) html=viewOnboarding(currentProfile);
  else if(hash.startsWith('#/passenger')) html=viewPassenger(currentProfile);
  else if(hash.startsWith('#/driver')) html=viewDriver(currentProfile);
  else if(hash.startsWith('#/profile')) html=viewProfile(currentProfile);
  else html='<div class="card">404</div>';
  routerEl.innerHTML=html;
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active', a.getAttribute('href')===hash));

  // Driver online logic (tetap di sini karena butuh currentProfile)
  if(hash.startsWith('#/driver') && currentProfile){
    const btnOn=document.getElementById('btnOnline'); const btnOff=document.getElementById('btnOffline');
    if(btnOn) btnOn.onclick=async ()=>{
      if(currentProfile.role==='driver' && (!currentProfile.nopol || !currentProfile.tipe_sim || !currentProfile.hp || !currentProfile.jenis_kendaraan)){ alert('Lengkapi Jenis Kendaraan, Nopol, SIM, HP di Profil dulu'); location.hash='#/profile'; return; }
      try{ const posChk = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true, timeout:5000})); if(!isInSuruhBbox(posChk.coords.latitude, posChk.coords.longitude)){ alert('⛔ Kamu di luar Kecamatan Suruh'); return; } }catch(e){ alert('Aktifkan GPS'); return; }
      await supabase.from('users').update({status:'online'}).eq('id',currentProfile.id);
      const s=document.getElementById('drvStatus'); if(s) s.textContent='online';
      const watchId=navigator.geolocation.watchPosition(async pos=>{
        const {latitude:lat, longitude:lng, heading, speed}=pos.coords;
        if(!isInSuruhBbox(lat,lng)){ const s=document.getElementById('drvStatus'); if(s) s.textContent='luar Suruh - offline'; alert('⛔ Keluar dari Suruh. Auto offline.'); await supabase.from('users').update({status:'offline'}).eq('id',currentProfile.id); if(window._watchId) navigator.geolocation.clearWatch(window._watchId); return; }
        const speedKmh=speed? speed*3.6:0;
        const sp=document.getElementById('kpiSpeed'); if(sp) sp.textContent=speedKmh.toFixed(1);
        const hd=document.getElementById('kpiHead'); if(hd) hd.textContent=(heading||0).toFixed(0)+'°';
        const up=document.getElementById('kpiUpd'); if(up) up.textContent=new Date().toLocaleTimeString();
        const geo=`SRID=4326;POINT(${lng} ${lat})`;
        await supabase.from('driver_locations').upsert({driver_id:currentProfile.id, lokasi:geo, heading:heading||0, speed_kmh:speedKmh, updated_at:new Date().toISOString()}, {onConflict:'driver_id'});
        await supabase.from('users').update({lokasi:geo}).eq('id',currentProfile.id);
      }, e=>alert(e.message), {enableHighAccuracy:true});
      window._watchId=watchId;
    };
    if(btnOff) btnOff.onclick=async ()=>{ if(window._watchId) navigator.geolocation.clearWatch(window._watchId); await supabase.from('users').update({status:'offline'}).eq('id',currentProfile.id); const s=document.getElementById('drvStatus'); if(s) s.textContent='offline'; };
  }

  // Passenger hooks
  if(hash.startsWith('#/passenger')){
    setTimeout(order.searchNearby,500); setTimeout(order.refreshPickupField,600);
    setTimeout(()=>{
      const destEl=document.getElementById('dest');
      if(destEl){
        destEl.addEventListener('input', (e)=>{ clearTimeout(order.destDebounce); order.setDestDebounce(setTimeout(()=>order.searchDestLive(e.target.value, map),150)); });
        destEl.addEventListener('focus', ()=>{ if(destEl.value.length>=1) order.searchDestLive(destEl.value, map); });
        document.addEventListener('click', (e)=>{ const box=document.getElementById('destSuggestions'); if(box && !e.target.closest('#dest') && !e.target.closest('#destSuggestions')) box.style.display='none'; });
      }
      const tripRadios=document.querySelectorAll('input[name="tripType"]'); tripRadios.forEach(r=>r.addEventListener('change',order.updateOrderEstimate));
      const vehRadios=document.querySelectorAll('input[name="vehicleType"]'); vehRadios.forEach(r=>r.addEventListener('change', (e)=>{
        // update UI border
        const labelMotor=document.getElementById('labelMotor'); const labelMobil=document.getElementById('labelMobil');
        if(labelMotor) labelMotor.style.border = e.target.value==='motor'?'2px solid #22c55e':'1px solid #334155';
        if(labelMobil) labelMobil.style.border = e.target.value==='mobil'?'2px solid #22c55e':'1px solid #334155';
        if(labelMotor) labelMotor.style.background = e.target.value==='motor'?'rgba(34,197,94,0.1)':'transparent';
        if(labelMobil) labelMobil.style.background = e.target.value==='mobil'?'rgba(34,197,94,0.1)':'transparent';
        order.updateOrderEstimate();
      }));
    },800);
  }
  if(hash.startsWith('#/profile')){
    const roleSel=document.getElementById('profileRole');
    if(roleSel){ roleSel.addEventListener('change', e=>{ const df=document.getElementById('profileDriverFields'); const pf=document.getElementById('profilePassengerFields'); if(df) df.style.display=e.target.value==='driver'?'block':'none'; if(pf) pf.style.display=e.target.value==='passenger'?'block':'none'; }); }
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
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnGoogle')) await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + location.pathname } });
  if(e.target.closest('#btnLogout')){ if(!confirm('Yakin logout?')) return; if(nearbyChannel) supabase.removeChannel(nearbyChannel); if(pushChannel) supabase.removeChannel(pushChannel); await supabase.auth.signOut(); localStorage.clear(); location.hash='#/login'; location.reload(); }
  if(e.target.closest('#btnEnablePush')){
    const st = document.getElementById('pushStatus');
    if(st) st.textContent='⏳ Meminta izin...';
    const sub = await push.subscribeUser(currentProfile?.id);
    if(st) st.textContent = sub ? '✅ Push aktif! Cek notifikasi.' : '❌ Gagal aktifkan';
  }
  if(e.target.closest('#btnDisablePush')){
    const st = document.getElementById('pushStatus');
    if(st) st.textContent='⏳ Mematikan...';
    await push.unsubscribeUser();
    if(st) st.textContent='❌ Push dimatikan';
  }
  if(e.target.closest('#btnTestPush')){
    push.showLocalNotification('🧪 Test OJOL Suruh', 'Notifikasi push work! Motor Rp 2.500/km, Mobil Rp 5.500/km', '/#/');
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
});

window.addEventListener('hashchange', ()=>{ if(nearbyChannel) supabase.removeChannel(nearbyChannel); render(); });
window.addEventListener('DOMContentLoaded', render);


// ===== PWA - Service Worker & Install Prompt =====
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('installBanner');
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  // tampilkan banner setelah 3 detik jika belum pernah dismiss dalam 7 hari
  if(!dismissed || (Date.now() - parseInt(dismissed)) > 7*24*60*60*1000){
    setTimeout(()=>{ if(banner) banner.classList.add('show'); }, 3000);
  }
});

window.addEventListener('appinstalled', ()=>{
  const banner = document.getElementById('installBanner');
  if(banner) banner.classList.remove('show');
  deferredPrompt = null;
  console.log('PWA installed');
});

// Register Service Worker
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      console.log('SW registered', reg.scope);
    }).catch(err=>console.log('SW fail', err));
  });
}

// Handle install banner buttons (delegated via global click handler sudah ada, tapi tambah khusus)
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnInstallApp')){
    const banner = document.getElementById('installBanner');
    if(deferredPrompt){
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install outcome', outcome);
      deferredPrompt = null;
      if(banner) banner.classList.remove('show');
    } else {
      // Fallback iOS manual instruction
      alert('Untuk install di iPhone: tap Share ⬆️ lalu Add to Home Screen. Di Android: tap menu ⋮ lalu Install App.');
    }
  }
  if(e.target.closest('#btnCloseInstall')){
    const banner = document.getElementById('installBanner');
    if(banner) banner.classList.remove('show');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }
});


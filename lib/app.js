// app.js - Entry point modular + Admin & Report Module v2 (tanpa merubah fungsi lain)
import { supabase } from './app/supabase.js';
import { SURUH_CENTER } from './app/config.js';
import { isInSuruhBbox } from './app/geofence.js';
import { getSession, getProfile } from './app/user.js';
import * as order from './app/order.js';
import * as map from './app/map.js';
import { viewLogin, viewHome, viewOnboarding, viewPassenger, viewDriver, viewProfile, viewReportModal, viewBannedInfo, viewAdminReports } from './app/views.js';
import * as reportMod from './app/report.js';

const routerEl = document.getElementById('router');
const userBadge = document.getElementById('userBadge');
let currentProfile = null;
let nearbyChannel = null;

// ===== Render & Routing =====
async function render(){
  const hash=location.hash||'#/'; const session=await getSession();
  if(!session && hash!=='#/login' && hash!=='#/'){ location.hash='#/login'; return; }
  if(session){ 
    try{ 
      currentProfile=await getProfile(); 
      userBadge.textContent=`${currentProfile?.name||''} • ${currentProfile?.role}`; 
      userBadge.classList.remove('hidden'); 
    }catch(e){
      if(e.code==='BANNED' || String(e.message).includes('banned') || String(e.message).toLowerCase().includes('banned')){
        routerEl.innerHTML = viewBannedInfo(e.bannedDetail||{reason:e.message}) + `<div class="card"><button id="btnForceLogout" class="btn secondary">Logout & Ganti Akun</button></div>`;
        userBadge.textContent='BANNED'; userBadge.classList.remove('hidden');
        document.querySelectorAll('[data-nav]').forEach(a=>a.classList.remove('active'));
        return;
      }
      console.warn('getProfile fail', e.message);
    } 
  }
  const navPass=document.querySelector('a[href="#/passenger"]'); const navDriver=document.querySelector('a[href="#/driver"]');
  const navAdmin=document.getElementById('navAdmin');
  if(currentProfile){
    if(currentProfile.role==='driver'){ if(navPass) navPass.style.display='none'; if(navDriver) navDriver.style.display=''; if(hash.startsWith('#/passenger')){ location.hash='#/'; return; } }
    else if(currentProfile.role==='admin'){ if(navPass) navPass.style.display=''; if(navDriver) navDriver.style.display=''; if(navAdmin) navAdmin.style.display=''; }
    else { if(navDriver) navDriver.style.display='none'; if(navPass) navPass.style.display=''; if(navAdmin) navAdmin.style.display='none'; if(hash.startsWith('#/driver')){ location.hash='#/'; return; } }
  } else { if(navPass) navPass.style.display=''; if(navDriver) navDriver.style.display=''; if(navAdmin) navAdmin.style.display='none'; }

  let html='';
  if(hash==='#/login') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash==='#/' || hash==='') html=session? viewHome(currentProfile) : viewLogin();
  else if(hash.startsWith('#/onboarding')) html=viewOnboarding(currentProfile);
  else if(hash.startsWith('#/passenger')) html=viewPassenger(currentProfile);
  else if(hash.startsWith('#/driver')) html=viewDriver(currentProfile);
  else if(hash.startsWith('#/profile')) html=viewProfile(currentProfile);
  else if(hash.startsWith('#/admin') || hash.startsWith('#/reports')){
    if(currentProfile?.role!=='admin'){
      html='<div class="card"><h3>🔒 Akses Ditolak</h3><p class="muted">Hanya admin yang bisa akses. Jalankan di Supabase SQL:<br/><code>update users set role=\'admin\' where email=\'emailmu@gmail.com\'</code></p><p class="muted" style="font-size:11px">Lalu refresh & login lagi.</p></div>';
    } else {
      html='<div class="card"><p class="muted">⏳ Memuat laporan & banned list...</p></div>';
      setTimeout(async ()=>{
        try{
          const [reports, banned] = await Promise.all([reportMod.getReports(), reportMod.getBannedUsers()]);
          routerEl.innerHTML = viewAdminReports(reports, banned);
        }catch(e){ routerEl.innerHTML = `<div class="card">❌ ${e.message}</div>`; }
      }, 100);
    }
  }
  else html='<div class="card">404</div>';
  routerEl.innerHTML=html;
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active', a.getAttribute('href')===hash));
}

// ===== Global Click Handler =====
document.addEventListener('click', async (e)=>{
  if(e.target.closest('#btnGoogle')) await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + location.pathname } });
  if(e.target.closest('#btnLogout') || e.target.closest('#btnForceLogout')){ if(!confirm('Yakin logout?')) return; if(nearbyChannel) supabase.removeChannel(nearbyChannel); await supabase.auth.signOut(); localStorage.clear(); location.hash='#/login'; location.reload(); }
  if(e.target.closest('#btnSaveOnboard')){
    const name=document.getElementById('displayName')?.value?.trim(); if(!name) return alert('Nama wajib');
    const st=document.getElementById('saveStatus'); st.textContent='Menyimpan...';
    try{ const {data,error}=await supabase.from('users').update({name}).eq('id',currentProfile.id).select().single(); if(error) throw error; currentProfile=data; st.textContent='✅'; location.hash='#/profile'; }catch(err){ st.textContent='❌ '+err.message; }
  }
  if(e.target.closest('#btnSaveProfileRole')){
    const name=document.getElementById('editName')?.value?.trim(); const role=document.getElementById('profileRole')?.value;
    const nopol=document.getElementById('profileNopol')?.value?.trim()||null; const tipeSim=document.getElementById('profileSim')?.value||null; const tipe=document.getElementById('profileTipe')?.value?.trim()||null; const hp=document.getElementById('profileHp')?.value?.trim()||null;
    const st=document.getElementById('profileStatus'); if(!name) return alert('Nama wajib'); if(role==='driver'){ if(!nopol) return alert('Nopol wajib'); if(!tipeSim) return alert('SIM wajib'); if(!hp) return alert('HP wajib'); }
    st.textContent='Menyimpan...';
    try{ const patch={name, role, status:'active', nopol: role==='driver'?nopol:null, tipe_sim: role==='driver'?tipeSim:null, tipe_motor: role==='driver'?tipe:null, hp:hp}; const {data,error}=await supabase.from('users').update(patch).eq('id',currentProfile.id).select().single(); if(error) throw error; currentProfile=data; userBadge.textContent=`${data.name} • ${data.role}`; st.textContent='✅ Profil disimpan'; setTimeout(()=>{ location.hash='#/'; }, 600); }catch(err){ st.textContent='❌ '+err.message; }
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

  // ===== MODUL LAPORKAN =====
  if(e.target.closest('[data-report-user]')){
    e.preventDefault();
    const btn = e.target.closest('[data-report-user]');
    const uid = btn.getAttribute('data-report-user');
    const name = btn.getAttribute('data-report-name')||'Pengguna';
    const gId = btn.getAttribute('data-report-google')||'';
    const email = btn.getAttribute('data-report-email')||'';
    const existing = document.getElementById('reportModal');
    if(existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', viewReportModal(name, uid, gId, email));
    return;
  }
  if(e.target.closest('#btnCloseReport') || e.target.closest('#btnCloseReport2')){
    e.preventDefault();
    const m = document.getElementById('reportModal');
    if(m) m.remove();
    return;
  }
  if(e.target.closest('#btnSubmitReport')){
    e.preventDefault();
    const tid = document.getElementById('reportTargetId')?.value;
    const tg = document.getElementById('reportTargetGoogle')?.value;
    const tem = document.getElementById('reportTargetEmail')?.value;
    const tname = document.getElementById('reportTargetName')?.value;
    await reportMod.submitReportFromUI(tid, tg, tem, tname);
    return;
  }
  // ===== ADMIN BANNED =====
  if(e.target.closest('[data-ban-google]')){
    e.preventDefault();
    const b = e.target.closest('[data-ban-google]');
    const gId = b.getAttribute('data-ban-google');
    const email = b.getAttribute('data-ban-email');
    const reportId = b.getAttribute('data-ban-report');
    const reason = b.getAttribute('data-ban-reason')||'Melanggar aturan';
    if(!confirm(`BANNED Google Account permanen?\nID: ${gId||email}\nAlasan: ${reason}\n\nUser tidak bisa login lagi!`)) return;
    try{
      await reportMod.banUser({ googleId: gId||null, email: email||null, reason, reportId });
      alert('✅ Berhasil banned');
      location.reload();
    }catch(err){ alert('Gagal: '+err.message); }
    return;
  }
  if(e.target.closest('[data-mark-reviewed]')){
    e.preventDefault();
    const id = e.target.closest('[data-mark-reviewed]').getAttribute('data-mark-reviewed');
    try{ await supabase.from('reports').update({status:'reviewed'}).eq('id', id); alert('Reviewed'); location.reload(); }catch(err){ alert(err.message); }
    return;
  }
  if(e.target.closest('[data-unban-google]')){
    e.preventDefault();
    const gId = e.target.closest('[data-unban-google]').getAttribute('data-unban-google');
    if(!confirm(`Unban ${gId}?`)) return;
    try{ await reportMod.unbanUser(gId); alert('Unbanned'); location.reload(); }catch(err){ alert(err.message); }
    return;
  }
});

window.addEventListener('hashchange', ()=>{ if(nearbyChannel) supabase.removeChannel(nearbyChannel); render(); });
window.addEventListener('DOMContentLoaded', render);

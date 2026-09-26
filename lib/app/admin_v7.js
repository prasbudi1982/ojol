// admin_v7.js - FINAL COMBINED - 1 tombol Detail + Modal 100% muncul + auto hapus tombol Ban
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

console.log('ADMIN v7.0 - FINAL 1 BUTTON + MODAL');

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

// Inject CSS + Modal + Observer yang hapus tombol kedua selamanya
(function initFix(){
  if(document.getElementById('adminV7CSS')) return;
  const css=document.createElement('style'); css.id='adminV7CSS';
  css.textContent=`
  #adminUserModal{position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,0.85)!important;display:none!important;align-items:center!important;justify-content:center!important;padding:16px!important}
  #adminUserModal.show{display:flex!important}
  #adminUserModal .modal-card{width:100%!important;max-width:480px!important;max-height:90vh!important;overflow:auto!important;background:#1e293b!important;border:1px solid #334155!important;border-radius:16px!important;padding:16px!important;color:#fff!important;position:relative!important}
  /* Backup: sembunyikan tombol kedua kalau ada yang lolos */
  #adminUserList .admin-list-item button:nth-child(2),
  #adminUserList .admin-list-item .admin-actions button:nth-child(2),
  #adminUserList .admin-list-item button:last-child:nth-child(2){display:none !important;}
  `;
  document.head.appendChild(css);
  
  // Modal element
  if(!document.getElementById('adminUserModal')){
    const m=document.createElement('div'); m.id='adminUserModal';
    m.innerHTML=`<div class="modal-card"><button onclick="closeAdminModal()" style="position:absolute;right:10px;top:10px;background:#334155;color:#fff;border:0;padding:8px 12px;border-radius:8px">✕</button><div id="adminUserModalContent"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{ if(e.target.id==='adminUserModal') closeAdminModal(); });
  }
  // Observer hapus tombol Ban selamanya
  const obs=new MutationObserver(()=>{
    document.querySelectorAll('#adminUserList .admin-list-item').forEach(item=>{
      const btns=item.querySelectorAll('button');
      if(btns.length>1){
        btns.forEach((b,i)=>{ if(i>0) b.remove(); });
      }
    });
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
})();

function ensureModal(){
  let m=document.getElementById('adminUserModal');
  if(!m){
    m=document.createElement('div'); m.id='adminUserModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;padding:16px;';
    m.innerHTML=`<div class="modal-card" style="width:100%;max-width:480px;max-height:90vh;overflow:auto;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:16px;color:#fff;position:relative"><button onclick="closeAdminModal()" style="position:absolute;right:10px;top:10px;background:#334155;color:#fff;border:0;padding:8px 12px;border-radius:8px">✕</button><div id="adminUserModalContent"></div></div>`;
    document.body.appendChild(m);
  }
  return m;
}

export async function getAdminStats(){
  try{
    const cnt=async(fn)=>{ let q=supabase.from('users').select('id',{count:'exact',head:true}); if(fn) q=fn(q); const {count}=await q; return count||0; };
    const [total,active,offline,banned,drivers,passengers,admins]=await Promise.all([cnt(),cnt(q=>q.in('status',['active','online'])),cnt(q=>q.eq('status','offline')),cnt(q=>q.eq('banned',true)),cnt(q=>q.eq('role','driver')),cnt(q=>q.eq('role','passenger')),cnt(q=>q.eq('role','admin'))]);
    let ordersToday=0; try{ const s=new Date(); s.setHours(0,0,0,0); const {count}=await supabase.from('orders').select('id',{count:'exact',head:true}).gte('created_at',s.toISOString()); ordersToday=count||0; }catch(e){}
    return {total,active,offline,banned,drivers,passengers,admins,ordersToday};
  }catch(e){ return {total:0,active:0,offline:0,banned:0,drivers:0,passengers:0,admins:0,ordersToday:0}; }
}
export async function getUsersList(f='all',s=''){
  try{
    let q=supabase.from('users').select('*').order('created_at',{ascending:false}).limit(100);
    if(f==='active') q=q.in('status',['active','online']); else if(f==='offline') q=q.eq('status','offline'); else if(f==='banned') q=q.eq('banned',true); else if(f==='driver') q=q.eq('role','driver'); else if(f==='passenger') q=q.eq('role','passenger'); else if(f==='admin') q=q.eq('role','admin');
    if(s){ const c=s.replace(/[%_,]/g,'').trim().slice(0,50); if(c) q=q.or(`name.ilike.%${c}%,email.ilike.%${c}%,hp.ilike.%${c}%`); }
    const {data,error}=await q; if(error) throw error; return data||[];
  }catch(e){ return []; }
}
export async function getUserDetail(userId){
  try{
    const {data,error}=await supabase.from('users').select('*').eq('id',userId).single(); if(error) throw error;
    const {data:aP}=await supabase.from('orders').select('id,status,created_at,total_fare').eq('passenger_id',userId).order('created_at',{ascending:false}).limit(10);
    const {data:aD}=await supabase.from('orders').select('id,status,created_at,total_fare').eq('driver_id',userId).order('created_at',{ascending:false}).limit(10);
    const orders=[...(aP||[]),...(aD||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,20);
    return {user:data, orders};
  }catch(e){ return {error:e.message}; }
}
export async function banUser(id,r='Pelanggaran'){ const {error,data}=await supabase.from('users').update({banned:true,status:'banned',banned_reason:r,banned_at:new Date().toISOString()}).eq('id',id).select(); if(error) throw error; if(!data?.length) throw new Error('RLS'); try{await supabase.from('banned_logs').insert({user_id:id,reason:r});}catch(e){} return true; }
export async function unbanUser(id){ const {error,data}=await supabase.from('users').update({banned:false,status:'active',banned_reason:null,banned_at:null}).eq('id',id).select(); if(error) throw error; if(!data?.length) throw new Error('RLS'); return true; }
export async function getReports(){ try{ const {data,error}=await supabase.from('reports').select('*, reporter:reporter_id(name), reported:reported_id(name,email,role)').order('created_at',{ascending:false}).limit(50); if(error) throw error; return data||[]; }catch(e){ try{ const {data}=await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50); return data||[]; }catch(err){ return []; } } }
export function getAppSettings(){ try{ const s=localStorage.getItem('app_settings'); if(s) return {...APP_SETTINGS_DEFAULT,...JSON.parse(s)}; }catch(e){} return APP_SETTINGS_DEFAULT; }
export async function saveAppSettings(ns){ localStorage.setItem('app_settings',JSON.stringify(ns)); if(ns.activeKecamatanCode) localStorage.setItem('active_kecamatan_code',ns.activeKecamatanCode); try{ await supabase.from('app_settings').upsert({id:1,settings:ns,updated_at:new Date().toISOString()},{onConflict:'id'}); }catch(e){} applyAppTheme(ns); setTimeout(()=>location.reload(),350); return true; }
export function applyAppTheme(s){ try{ const r=document.documentElement; if(s.primaryColor) r.style.setProperty('--primary',s.primaryColor); if(s.secondaryColor) r.style.setProperty('--secondary',s.secondaryColor); if(s.appName) document.title=s.appName; }catch(e){} }

export function viewAdminDashboard(stats=null){
  const kec=getActiveKecamatanLive();
  return `<div class="admin-page"><div style="background:#22c55e;color:#000;padding:6px;border-radius:8px;font-size:11px;text-align:center;font-weight:800;margin-bottom:8px">ADMIN v7.0 FINAL - 1 BUTTON + MODAL OK</div><h2>📊 Admin - ${escapeHtml(kec.name)}</h2><div class="admin-stats"><div class="stat-card"><b>TOTAL USER</b><div id="statTotal">${stats?.total??'-'}</div></div><div class="stat-card"><b>AKTIF</b><div id="statActive">${stats?.active??'-'}</div></div><div class="stat-card"><b>OFFLINE</b><div id="statOffline">${stats?.offline??'-'}</div></div><div class="stat-card"><b>BANNED</b><div id="statBanned">${stats?.banned??'-'}</div></div><div class="stat-card"><b>DRIVER</b><div id="statDrivers">${stats?.drivers??'-'}</div></div><div class="stat-card"><b>PENUMPANG</b><div id="statPassengers">${stats?.passengers??'-'}</div></div><div class="stat-card"><b>ORDER HARI INI</b><div id="statOrders">${stats?.ordersToday??'-'}</div></div></div><div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:140px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button></div><div style="margin-top:12px"><h3>👥 List User (<span id="userCount"></span>)</h3><div id="adminUserList">Loading...</div><h3 style="margin-top:16px">🚩 Laporan & Detail</h3><div id="adminReportList">Loading...</div></div></div>`;
}
export function viewAdminSettings(settings, profile=null){
  const s = settings||getAppSettings(); const p = profile||{}; const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${code}" ${s.activeKecamatanCode===code?'selected':''}>${info.name}</option>`).join('');
  return `<div class="admin-page"><h2>⚙️ Setting</h2><div class="card"><h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4><label>Kecamatan Aktif<select id="setKecamatan" class="input">${kecOptions}</select></label><p class="muted" style="font-size:11px;margin-top:6px">Ganti wilayah tanpa edit file.</p></div><div class="card"><h4 style="margin:0 0 12px">💰 Setting Tarif</h4><p class="muted" style="font-size:11px;margin:0 0 10px">Tarif live - langsung dipakai hitungTarif(). Kosongkan = pakai default.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label style="font-size:12px">🏍️ Motor - Base Fare</label><input id="setMotorBase" type="number" class="input" value="${s.tarifMotorBase||3000}"></div><div><label style="font-size:12px">🏍️ Motor - Per Km</label><input id="setMotorPerKm" type="number" class="input" value="${s.tarifMotorPerKm||2500}"></div><div><label style="font-size:12px">🏍️ Motor - Minimal</label><input id="setMotorMin" type="number" class="input" value="${s.tarifMotorMin||5000}"></div><div><label style="font-size:12px">🔄 PP Multiplier</label><input id="setPpMultiplier" type="number" step="0.1" class="input" value="${s.ppMultiplier||1.6}"></div><div><label style="font-size:12px">🚗 Mobil - Base Fare</label><input id="setMobilBase" type="number" class="input" value="${s.tarifMobilBase||8000}"></div><div><label style="font-size:12px">🚗 Mobil - Per Km</label><input id="setMobilPerKm" type="number" class="input" value="${s.tarifMobilPerKm||5500}"></div><div style="grid-column:1 / -1"><label style="font-size:12px">🚗 Mobil - Minimal</label><input id="setMobilMin" type="number" class="input" value="${s.tarifMobilMin||15000}"></div></div><div class="card" style="margin:12px 0 0;background:var(--card2);border-style:dashed"><div style="font-size:11px" class="muted">Preview hitung:</div><div style="font-size:12px;margin-top:4px">Motor 5km = <b id="previewMotor">-</b> | Mobil 5km = <b id="previewMobil">-</b></div></div></div><div class="card"><h4 style="margin:0 0 10px">🎨 Tampilan</h4><label>Nama App</label><input id="setAppName" class="input" value="${(s.appName||'').replace(/"/g,'&quot;')}"><label>Nama Pendek</label><input id="setAppShort" class="input" value="${(s.appShortName||'').replace(/"/g,'&quot;')}"><div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#22c55e'}" class="input" style="height:42px;padding:4px"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}" class="input" style="height:42px;padding:4px"></div></div><label>Judul Disclaimer</label><input id="setDiscTitle" class="input" value="${(s.disclaimerTitle||'').replace(/"/g,'&quot;')}"><label>Isi Disclaimer</label><textarea id="setDiscText" class="input" style="min-height:120px">${s.disclaimerText||''}</textarea><label>Footer</label><input id="setFooter" class="input" value="${(s.footerText||'').replace(/"/g,'&quot;')}"><div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Semua</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div><div id="settingStatus" class="status"></div></div><div class="card"><h4 style="margin:0 0 8px">👑 Admin</h4><div class="muted" style="font-size:12px">Nama: <b>${p?.name||'-'}</b><br>Email: ${p?.email||'-'}<br>Role: ${p?.role||'-'}</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Profil</button></div></div></div>`;
}

function renderUserList(users){
  const el=document.getElementById('adminUserList'); const cnt=document.getElementById('userCount'); if(!el) return; if(cnt) cnt.textContent=users.length;
  if(!users.length){ el.innerHTML=`<div>Tidak ada user</div>`; return; }
  el.innerHTML=users.map(u=>{
    const isB=u.banned||u.status==='banned'; const badge=isB?'badge-banned':u.role==='admin'?'badge-admin':u.role==='driver'?'badge-driver':'badge-passenger';
    return `<div class="admin-list-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #334155"><div><div style="font-weight:800">${escapeHtml(u.name||'Tanpa Nama')} <span class="admin-badge ${badge}">${isB?'BANNED':escapeHtml(u.role)}</span></div><div style="font-size:11px;color:#94a3b8">${escapeHtml(u.email||'-')} • ${escapeHtml(u.hp||'')} • ${escapeHtml(u.status||'')}</div></div><button class="btn primary" style="width:auto;padding:8px 16px" onclick="adminViewUser('${escapeAttr(u.id)}')">Detail</button></div>`;
  }).join('');
}
function renderReports(reports){
  const el=document.getElementById('adminReportList'); if(!el) return;
  if(!reports.length){ el.innerHTML=`<div class="muted">Belum ada laporan</div>`; return; }
  el.innerHTML=reports.map(r=>{
    const status=(r.status||'pending').toLowerCase(); const rep=r.reported||{}; const reporter=r.reporter||{};
    return `<div style="border-radius:12px;padding:12px;margin-bottom:10px;background:#1e293b;border:1px solid #334155;border-left:4px solid ${status==='pending'?'#f59e0b':status==='banned'?'#ef4444':'#22c55e'}"><div style="display:flex;justify-content:space-between"><b>🚩 ${escapeHtml(rep.name||r.reported_id?.toString().slice(0,8)||'User')}</b><span class="admin-badge">${escapeHtml(status)}</span></div><div style="font-size:11px;color:#94a3b8">Oleh ${escapeHtml(reporter.name||'Anonim')} • ${new Date(r.created_at).toLocaleString('id-ID')}</div><div style="font-size:12px;margin-top:6px"><b>${escapeHtml(r.reason||'')}</b> ${escapeHtml(r.description||'')}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn secondary" style="flex:1" onclick="adminViewUser('${escapeAttr(r.reported_id)}')">👁️ Lihat</button><button class="btn secondary" style="flex:1" onclick="adminBanFromReport('${escapeAttr(r.reported_id)}','${escapeAttr(r.id)}')">🚫 Ban</button><button class="btn secondary" style="flex:1" onclick="adminReviewReport('${escapeAttr(r.id)}')">✅ Selesai</button></div></div>`;
  }).join('');
}

window.closeAdminModal=function(){ const m=document.getElementById('adminUserModal'); if(m){ m.style.display='none'; } document.body.style.overflow=''; };
window.adminViewUser=async function(id){
  const modal=ensureModal(); const box=document.getElementById('adminUserModalContent');
  modal.style.display='flex'; document.body.style.overflow='hidden';
  box.innerHTML='<div style="padding:20px;text-align:center">⏳ Loading...<br><small>'+escapeHtml(id.slice(0,8))+'</small></div>';
  try{
    const res=await getUserDetail(id);
    if(res.error){ box.innerHTML='<div style="color:#f87171">Error: '+escapeHtml(res.error)+'</div><button onclick="closeAdminModal()" style="margin-top:10px;width:100%;padding:10px;background:#334155;color:#fff;border:0;border-radius:10px">Tutup</button>'; return; }
    const u=res.user; const isB=u.banned||u.status==='banned'; const cleanHp=(u.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62');
    box.innerHTML=`<h3>👤 ${escapeHtml(u.name||'-')}</h3><div style="margin-top:10px;font-size:13px;display:grid;gap:6px"><div>Email: <b>${escapeHtml(u.email||'-')}</b></div><div>HP: <b>${escapeHtml(u.hp||'-')}</b></div><div>Role: <b>${escapeHtml(u.role||'-')}</b> • Status: <b>${escapeHtml(u.status||'-')}</b></div><div>Daftar: ${new Date(u.created_at).toLocaleString('id-ID')}</div>${u.banned_reason?`<div style="background:#450a0a;padding:8px;border-radius:8px">Ban: ${escapeHtml(u.banned_reason)}</div>`:''}</div><div style="margin-top:12px"><b>📦 ${res.orders.length} Order</b><div style="max-height:150px;overflow:auto;margin-top:6px">${res.orders.map(o=>`<div style="padding:6px 0;border-bottom:1px solid #334155;display:flex;justify-content:space-between;font-size:12px"><span>${new Date(o.created_at).toLocaleDateString('id-ID')} ${escapeHtml(o.status)}</span><span>Rp${(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('')||'Tidak ada'}</div></div><div style="margin-top:16px;display:flex;gap:8px">${isB?`<button onclick="adminUnbanUser('${escapeAttr(u.id)}')" style="flex:1;background:#22c55e;color:#000;padding:12px;border:0;border-radius:10px;font-weight:800">✅ UNBAN</button>`:`<button onclick="adminBanUser('${escapeAttr(u.id)}')" style="flex:1;background:#ef4444;color:#fff;padding:12px;border:0;border-radius:10px;font-weight:800">🚫 BAN</button>`}<button onclick="window.open('https://wa.me/${cleanHp}','_blank')" style="flex:1;background:#334155;color:#fff;padding:12px;border:0;border-radius:10px">💬 WA</button></div><button onclick="closeAdminModal()" style="width:100%;margin-top:8px;background:#111827;color:#fff;padding:10px;border:1px solid #334155;border-radius:10px">Tutup</button>`;
  }catch(e){ box.innerHTML='<div style="color:#ef4444">Exception: '+escapeHtml(e.message)+'</div>'; }
};
window.adminBanUser=async function(id){ const r=prompt('Alasan ban?','Pelanggaran'); if(r===null) return; if(!confirm('Yakin BAN?')) return; try{ await banUser(id,r); alert('Banned'); closeAdminModal(); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal '+e.message); } };
window.adminUnbanUser=async function(id){ if(!confirm('Yakin UNBAN?')) return; try{ await unbanUser(id); alert('Unbanned'); closeAdminModal(); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal '+e.message); } };
window.adminBanFromReport=async function(uid,rid){ const r=prompt('Alasan?','Laporan valid'); if(!r) return; try{ await banUser(uid,r); await supabase.from('reports').update({status:'banned'}).eq('id',rid); alert('Banned'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert(e.message); } };
window.adminReviewReport=async function(rid){ if(!confirm('Tolak laporan?')) return; try{ await supabase.from('reports').update({status:'reviewed'}).eq('id',rid); const rep=await getReports(); renderReports(rep); }catch(e){ alert(e.message); } };

export async function initAdminPage(){
  ensureModal();
  const stats=await getAdminStats(); const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('statTotal',stats.total); set('statActive',stats.active); set('statOffline',stats.offline); set('statBanned',stats.banned); set('statDrivers',stats.drivers); set('statPassengers',stats.passengers); set('statOrders',stats.ordersToday);
  const loadUsers=async()=>{ const f=document.getElementById('adminFilter')?.value||'all'; const s=document.getElementById('adminSearch')?.value||''; renderUserList(await getUsersList(f,s)); };
  const loadReports=async()=>{ renderReports(await getReports()); };
  await Promise.all([loadUsers(),loadReports()]);
  document.getElementById('adminSearch')?.addEventListener('input',()=>{ clearTimeout(window._admT); window._admT=setTimeout(loadUsers,300); });
  document.getElementById('adminFilter')?.addEventListener('change',loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click',async()=>{ const st=await getAdminStats(); set('statTotal',st.total); set('statActive',st.active); set('statOffline',st.offline); set('statBanned',st.banned); set('statDrivers',st.drivers); set('statPassengers',st.passengers); set('statOrders',st.ordersToday); await Promise.all([loadUsers(),loadReports()]); });
}
export async function initAdminSettingsPage(){
  const cur=getAppSettings();
  const calcPreview=()=>{
    const getVal=(id, def)=>{ const el=document.getElementById(id); const v=el?parseFloat(el.value):def; return isNaN(v)?def:v; };
    const mBase=getVal('setMotorBase', cur.tarifMotorBase||3000); const mPer=getVal('setMotorPerKm', cur.tarifMotorPerKm||2500); const mMin=getVal('setMotorMin', cur.tarifMotorMin||5000);
    const mbBase=getVal('setMobilBase', cur.tarifMobilBase||8000); const mbPer=getVal('setMobilPerKm', cur.tarifMobilPerKm||5500); const mbMin=getVal('setMobilMin', cur.tarifMobilMin||15000);
    const dist=5; let motorCost=mBase + dist*mPer; motorCost=Math.max(motorCost, mMin); motorCost=Math.round(motorCost/500)*500;
    let mobilCost=mbBase + dist*mbPer; mobilCost=Math.max(mobilCost, mbMin); mobilCost=Math.round(mobilCost/500)*500;
    const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
    const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');
  };
  ['setMotorBase','setMotorPerKm','setMotorMin','setMobilBase','setMobilPerKm','setMobilMin','setPpMultiplier'].forEach(id=>{ document.getElementById(id)?.addEventListener('input', calcPreview); }); calcPreview();
  const btnSave=document.getElementById('btnSaveSettings'); const btnReset=document.getElementById('btnResetSettings'); const statusEl=document.getElementById('settingStatus');
  if(btnSave){ btnSave.onclick=async()=>{ const parseNum=(id, def)=>{ const el=document.getElementById(id); if(!el) return def; const v=parseFloat(el.value); return isNaN(v)?def:v; }; const ns={...cur, activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode, appName: document.getElementById('setAppName')?.value || cur.appName, appShortName: document.getElementById('setAppShort')?.value || cur.appShortName, primaryColor: document.getElementById('setPrimary')?.value || cur.primaryColor, secondaryColor: document.getElementById('setSecondary')?.value || cur.secondaryColor, disclaimerTitle: document.getElementById('setDiscTitle')?.value || cur.disclaimerTitle, disclaimerText: document.getElementById('setDiscText')?.value || cur.disclaimerText, footerText: document.getElementById('setFooter')?.value || cur.footerText, tarifMotorBase: parseNum('setMotorBase', 3000), tarifMotorPerKm: parseNum('setMotorPerKm', 2500), tarifMotorMin: parseNum('setMotorMin', 5000), tarifMobilBase: parseNum('setMobilBase', 8000), tarifMobilPerKm: parseNum('setMobilPerKm', 5500), tarifMobilMin: parseNum('setMobilMin', 15000), ppMultiplier: parseNum('setPpMultiplier', 1.6), }; if(statusEl) statusEl.textContent='⏳ Menyimpan...'; btnSave.disabled=true; btnSave.textContent='Menyimpan...'; try{ await saveAppSettings(ns); if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='var(--primary)'; } }catch(e){ if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='var(--danger)'; } btnSave.disabled=false; btnSave.textContent='💾 Simpan Semua'; } }; }
  if(btnReset){ btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); }; }
  document.getElementById('btnLogout')?.addEventListener('click', async()=>{ try{ await supabase.auth.signOut(); }catch(e){} localStorage.clear(); location.href='/'; });
  document.getElementById('btnGoProfile')?.addEventListener('click', ()=>{ location.hash='#/profile'; });
}

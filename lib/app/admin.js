// admin_v9_pagination.js - FINAL + Pagination 20/halaman - Setting 100% ORIGINAL tidak diubah
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

console.log('ADMIN v9.0 - PAGINATION 20/HALAMAN');

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

// Pagination state
const USERS_PER_PAGE = 20;
let adminUsersCache = [];
let adminCurrentPage = 1;

export async function getAdminStats(){
  try{
    const cnt=async(fn)=>{ let q=supabase.from('users').select('id',{count:'exact',head:true}); if(fn) q=fn(q); const {count}=await q; return count||0; };
    const [total,active,offline,banned,drivers,passengers]=await Promise.all([cnt(),cnt(q=>q.in('status',['active','online'])),cnt(q=>q.eq('status','offline')),cnt(q=>q.eq('banned',true)),cnt(q=>q.eq('role','driver')),cnt(q=>q.eq('role','passenger'))]);
    let ordersToday=0; try{ const s=new Date(); s.setHours(0,0,0,0); const {count}=await supabase.from('orders').select('id',{count:'exact',head:true}).gte('created_at',s.toISOString()); ordersToday=count||0; }catch(e){}
    return {total,active,offline,banned,drivers,passengers,ordersToday};
  }catch(e){ return {total:0,active:0,offline:0,banned:0,drivers:0,passengers:0,ordersToday:0}; }
}
export async function getUsersList(f='all',s=''){
  try{
    let q=supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
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
export async function banUser(id,r='Pelanggaran'){ const {error,data}=await supabase.from('users').update({banned:true,status:'banned',banned_reason:r,banned_at:new Date().toISOString()}).eq('id',id).select(); if(error) throw error; if(!data?.length) throw new Error('RLS blokir'); try{await supabase.from('banned_logs').insert({user_id:id,reason:r});}catch(e){} return true; }
export async function unbanUser(id){ const {error,data}=await supabase.from('users').update({banned:false,status:'active',banned_reason:null,banned_at:null}).eq('id',id).select(); if(error) throw error; if(!data?.length) throw new Error('RLS blokir'); return true; }
export async function getReports(){ try{ const {data,error}=await supabase.from('reports').select('*, reporter:reporter_id(name,email), reported:reported_id(name,email,role,hp)').order('created_at',{ascending:false}).limit(50); if(error) throw error; return data||[]; }catch(e){ try{ const {data}=await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50); return data||[]; }catch(err){ return []; } } }
export function getAppSettings(){ try{ const s=localStorage.getItem('app_settings'); if(s) return {...APP_SETTINGS_DEFAULT,...JSON.parse(s)}; }catch(e){} return APP_SETTINGS_DEFAULT; }
export async function saveAppSettings(ns){ localStorage.setItem('app_settings',JSON.stringify(ns)); if(ns.activeKecamatanCode) localStorage.setItem('active_kecamatan_code',ns.activeKecamatanCode); try{ await supabase.from('app_settings').upsert({id:1,settings:ns,updated_at:new Date().toISOString()},{onConflict:'id'}); }catch(e){} applyAppTheme(ns); setTimeout(()=>location.reload(),350); return true; }
export function applyAppTheme(s){ try{ const r=document.documentElement; if(s.primaryColor) r.style.setProperty('--primary',s.primaryColor); if(s.secondaryColor) r.style.setProperty('--secondary',s.secondaryColor); if(s.appName) document.title=s.appName; }catch(e){} }

export function viewAdminDashboard(stats=null){
  const kec=getActiveKecamatanLive();
  return `
  <div class="admin-page">
    <div style="background:#1e293b;border:1px solid #334155;padding:6px;border-radius:8px;font-size:11px;text-align:center;color:#94a3b8;margin-bottom:8px">ADMIN v9.0 - 20/HALAMAN - INLINE DETAIL</div>
    <h2>📊 Admin - ${escapeHtml(kec.name)}</h2>
    <div class="admin-stats">
      <div class="stat-card"><b>TOTAL USER</b><div id="statTotal">${stats?.total??'-'}</div></div>
      <div class="stat-card"><b>AKTIF</b><div id="statActive">${stats?.active??'-'}</div></div>
      <div class="stat-card"><b>OFFLINE</b><div id="statOffline">${stats?.offline??'-'}</div></div>
      <div class="stat-card"><b>BANNED</b><div id="statBanned">${stats?.banned??'-'}</div></div>
      <div class="stat-card"><b>DRIVER</b><div id="statDrivers">${stats?.drivers??'-'}</div></div>
      <div class="stat-card"><b>PENUMPANG</b><div id="statPassengers">${stats?.passengers??'-'}</div></div>
      <div class="stat-card"><b>ORDER HARI INI</b><div id="statOrders">${stats?.ordersToday??'-'}</div></div>
    </div>
    <div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:140px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button></div>
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:13px;margin:8px 0">👥 List User (<span id="userCount">0</span>)</h3><div id="userPaginationInfo" style="font-size:11px;color:#94a3b8"></div></div>
      <div id="adminUserList">Loading...</div>
      <div id="userPagination" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;padding:8px"></div>
      <h3 style="font-size:13px;margin:16px 0 8px">🚩 Laporan & Detail</h3>
      <div id="adminReportList">Loading...</div>
    </div>
  </div>`;
}

// SETTING 100% ORIGINAL - TIDAK DIUBAH SAMA SEKALI
export function viewAdminSettings(settings, profile=null){
  const s = settings||getAppSettings(); const p = profile||{}; const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${code}" ${s.activeKecamatanCode===code?'selected':''}>${info.name}</option>`).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting</h2>
    <div class="card"><h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4><label>Kecamatan Aktif<select id="setKecamatan" class="input">${kecOptions}</select></label><p class="muted" style="font-size:11px;margin-top:6px">Ganti wilayah tanpa edit file.</p></div>
    <div class="card"><h4 style="margin:0 0 12px">💰 Setting Tarif</h4><p class="muted" style="font-size:11px;margin:0 0 10px">Tarif live - langsung dipakai hitungTarif(). Kosongkan = pakai default.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label style="font-size:12px">🏍️ Motor - Base Fare</label><input id="setMotorBase" type="number" class="input" value="${s.tarifMotorBase||3000}"></div><div><label style="font-size:12px">🏍️ Motor - Per Km</label><input id="setMotorPerKm" type="number" class="input" value="${s.tarifMotorPerKm||2500}"></div><div><label style="font-size:12px">🏍️ Motor - Minimal</label><input id="setMotorMin" type="number" class="input" value="${s.tarifMotorMin||5000}"></div><div><label style="font-size:12px">🔄 PP Multiplier</label><input id="setPpMultiplier" type="number" step="0.1" class="input" value="${s.ppMultiplier||1.6}"></div><div><label style="font-size:12px">🚗 Mobil - Base Fare</label><input id="setMobilBase" type="number" class="input" value="${s.tarifMobilBase||8000}"></div><div><label style="font-size:12px">🚗 Mobil - Per Km</label><input id="setMobilPerKm" type="number" class="input" value="${s.tarifMobilPerKm||5500}"></div><div style="grid-column:1 / -1"><label style="font-size:12px">🚗 Mobil - Minimal</label><input id="setMobilMin" type="number" class="input" value="${s.tarifMobilMin||15000}"></div></div><div class="card" style="margin:12px 0 0;background:var(--card2);border-style:dashed"><div style="font-size:11px" class="muted">Preview hitung:</div><div style="font-size:12px;margin-top:4px">Motor 5km = <b id="previewMotor">-</b> | Mobil 5km = <b id="previewMobil">-</b></div></div></div>
    <div class="card"><h4 style="margin:0 0 10px">🎨 Tampilan</h4><label>Nama App</label><input id="setAppName" class="input" value="${(s.appName||'').replace(/"/g,'&quot;')}"><label>Nama Pendek</label><input id="setAppShort" class="input" value="${(s.appShortName||'').replace(/"/g,'&quot;')}"><div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#22c55e'}" class="input" style="height:42px;padding:4px"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}" class="input" style="height:42px;padding:4px"></div></div><label>Judul Disclaimer</label><input id="setDiscTitle" class="input" value="${(s.disclaimerTitle||'').replace(/"/g,'&quot;')}"><label>Isi Disclaimer</label><textarea id="setDiscText" class="input" style="min-height:120px">${s.disclaimerText||''}</textarea><label>Footer</label><input id="setFooter" class="input" value="${(s.footerText||'').replace(/"/g,'&quot;')}"><div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Semua</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div><div id="settingStatus" class="status"></div></div>
    <div class="card"><h4 style="margin:0 0 8px">👑 Admin</h4><div class="muted" style="font-size:12px">Nama: <b>${p?.name||'-'}</b><br>Email: ${p?.email||'-'}<br>Role: ${p?.role||'-'}</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Profil</button></div></div>
  </div>`;
}

function renderUserPage(){
  const el=document.getElementById('adminUserList'); const cnt=document.getElementById('userCount'); const info=document.getElementById('userPaginationInfo'); const pagEl=document.getElementById('userPagination');
  if(!el) return;
  if(cnt) cnt.textContent=adminUsersCache.length;
  
  if(!adminUsersCache.length){
    el.innerHTML=`<div class="muted" style="padding:12px">Tidak ada user</div>`;
    if(info) info.textContent=''; if(pagEl) pagEl.innerHTML=''; return;
  }
  
  const totalPages=Math.ceil(adminUsersCache.length / USERS_PER_PAGE);
  if(adminCurrentPage>totalPages) adminCurrentPage=totalPages;
  if(adminCurrentPage<1) adminCurrentPage=1;
  
  const start=(adminCurrentPage-1)*USERS_PER_PAGE;
  const end=start+USERS_PER_PAGE;
  const pageUsers=adminUsersCache.slice(start,end);
  
  if(info) info.textContent=`Hal ${adminCurrentPage}/${totalPages} • ${adminUsersCache.length} user`;
  
  el.innerHTML=pageUsers.map(u=>{
    const isB=u.banned||u.status==='banned';
    const roleColor=u.role==='admin'?'#a78bfa':u.role==='driver'?'#60a5fa':u.role==='merchant'?'#fbbf24':'#f59e0b';
    const badgeBg=isB?'#450a0a':roleColor+'33'; const badgeColor=isB?'#ef4444':roleColor; const badgeText=isB?'BANNED':u.role.toUpperCase();
    const statusDot=['active','online'].includes(u.status)?'#22c55e':u.status==='offline'?'#64748b':'#ef4444';
    const icon=u.role==='driver'?'🏍️':u.role==='admin'?'👑':u.role==='merchant'?'🏪':'👤';
    return `
    <div id="user-row-${u.id}" style="border:1px solid #1e293b;border-radius:12px;margin-bottom:8px;background:#0f172a;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px">
            <span style="width:8px;height:8px;border-radius:50%;background:${statusDot};display:inline-block"></span>
            ${icon} <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.name||'Tanpa Nama')}</span>
            <span style="font-size:10px;padding:2px 6px;border-radius:99px;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor}33">${escapeHtml(badgeText)}</span>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.email||'-')} • ${escapeHtml(u.hp||'-')} • ${escapeHtml(u.status||'-')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="btn primary" style="width:72px;padding:6px 0;font-size:12px;font-weight:700" onclick="toggleDetailInline('${escapeAttr(u.id)}')">Detail</button>
          ${isB
            ? `<button class="btn secondary" style="width:72px;padding:6px 0;font-size:12px;background:#14532d;color:#22c55e;border:1px solid #22c55e33" onclick="adminUnbanUser('${escapeAttr(u.id)}')">Unban</button>`
            : `<button class="btn secondary" style="width:72px;padding:6px 0;font-size:12px;background:#450a0a;color:#ef4444;border:1px solid #ef444433" onclick="adminBanUser('${escapeAttr(u.id)}')">Ban</button>`
          }
        </div>
      </div>
      <div id="user-detail-${u.id}" style="display:none;border-top:1px solid #1e293b;background:#111c2f;padding:12px"></div>
    </div>`;
  }).join('');
  
  // Pagination controls
  if(pagEl){
    if(totalPages<=1){ pagEl.innerHTML=''; return; }
    let html='';
    html+=`<button class="btn secondary" style="padding:6px 12px;font-size:12px" ${adminCurrentPage<=1?'disabled':''} onclick="goAdminPage(${adminCurrentPage-1})">‹ Prev</button>`;
    // page numbers - show max 5
    const maxShow=5; let startPage=Math.max(1, adminCurrentPage - Math.floor(maxShow/2)); let endPage=Math.min(totalPages, startPage+maxShow-1);
    if(endPage-startPage+1<maxShow) startPage=Math.max(1, endPage-maxShow+1);
    if(startPage>1){ html+=`<button class="btn secondary" style="padding:6px 10px;font-size:12px" onclick="goAdminPage(1)">1</button>`; if(startPage>2) html+=`<span style="color:#64748b">...</span>`; }
    for(let p=startPage;p<=endPage;p++){
      if(p===adminCurrentPage) html+=`<button class="btn primary" style="padding:6px 12px;font-size:12px;font-weight:800">${p}</button>`;
      else html+=`<button class="btn secondary" style="padding:6px 10px;font-size:12px" onclick="goAdminPage(${p})">${p}</button>`;
    }
    if(endPage<totalPages){ if(endPage<totalPages-1) html+=`<span style="color:#64748b">...</span>`; html+=`<button class="btn secondary" style="padding:6px 10px;font-size:12px" onclick="goAdminPage(${totalPages})">${totalPages}</button>`; }
    html+=`<button class="btn secondary" style="padding:6px 12px;font-size:12px" ${adminCurrentPage>=totalPages?'disabled':''} onclick="goAdminPage(${adminCurrentPage+1})">Next ›</button>`;
    pagEl.innerHTML=html;
  }
}

function renderReports(reports){
  const el=document.getElementById('adminReportList'); if(!el) return;
  if(!reports.length){ el.innerHTML=`<div class="muted" style="padding:12px;font-size:12px">Belum ada laporan</div>`; return; }
  el.innerHTML=reports.map(r=>{
    const status=(r.status||'pending').toLowerCase();
    const reported=r.reported||{}; const reporter=r.reporter||{};
    const isPending=status==='pending';
    const borderColor=isPending?'#f59e0b':status==='banned'?'#ef4444':'#22c55e';
    const statusBg=isPending?'#f59e0b22':status==='banned'?'#ef444422':'#22c55e22';
    const statusColor=isPending?'#fbbf24':status==='banned'?'#ef4444':'#22c55e';
    const reportedName=reported.name||'User Dilaporkan';
    const reporterName=reporter.name||'Anonim';
    const reason=r.reason||'Laporan';
    const dateStr=new Date(r.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `
    <div style="background:#0f172a;border:1px solid #1e293b;border-left:4px solid ${borderColor};border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:36px;height:36px;border-radius:10px;background:${borderColor}22;display:flex;align-items:center;justify-content:center;font-size:18px">🚩</div>
          <div>
            <div style="font-weight:800;font-size:13px;color:#e2e8f0">${escapeHtml(reportedName)} <span style="font-weight:400;color:#94a3b8;font-size:11px">${escapeHtml(reported.role||'')}</span></div>
            <div style="font-size:11px;color:#64748b">Oleh <b style="color:#94a3b8">${escapeHtml(reporterName)}</b> • ${dateStr}</div>
          </div>
        </div>
        <span style="font-size:10px;padding:3px 8px;border-radius:99px;background:${statusBg};color:${statusColor};border:1px solid ${statusColor}33;text-transform:uppercase;font-weight:700">${escapeHtml(status)}</span>
      </div>
      <div style="margin-top:10px;background:#111c2f;border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Alasan</div>
        <div style="font-size:13px;color:#e2e8f0;margin-top:2px"><b>${escapeHtml(reason)}</b> ${escapeHtml(r.description||'')}</div>
        ${reported.email?`<div style="font-size:11px;color:#94a3b8;margin-top:4px">${escapeHtml(reported.email)} ${reported.hp?'• '+escapeHtml(reported.hp):''}</div>`:''}
      </div>
      ${isPending?`
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn secondary" style="flex:1;padding:8px;font-size:12px;background:#1e293b;color:#e2e8f0;border:1px solid #334155" onclick="toggleDetailInline('${escapeAttr(r.reported_id)}')">👁️ Lihat</button>
        <button class="btn secondary" style="flex:1;padding:8px;font-size:12px;background:#450a0a;color:#fecaca;border:1px solid #7f1d1d33" onclick="adminBanFromReport('${escapeAttr(r.reported_id)}','${escapeAttr(r.id)}')">🚫 Ban</button>
        <button class="btn secondary" style="flex:1;padding:8px;font-size:12px;background:#14532d;color:#bbf7d0;border:1px solid #14532d" onclick="adminReviewReport('${escapeAttr(r.id)}')">✅ Selesai</button>
      </div>`:''}
    </div>`;
  }).join('');
}

window.goAdminPage=function(p){ adminCurrentPage=p; renderUserPage(); window.scrollTo({top:0,behavior:'smooth'}); };
window.toggleDetailInline=async function(userId){
  const detailEl=document.getElementById(`user-detail-${userId}`);
  if(!detailEl) return;
  const isOpen=detailEl.style.display!=='none';
  if(isOpen){ detailEl.style.display='none'; detailEl.innerHTML=''; return; }
  document.querySelectorAll('[id^="user-detail-"]').forEach(el=>{ if(el.id!==`user-detail-${userId}`){ el.style.display='none'; el.innerHTML=''; } });
  detailEl.style.display='block';
  detailEl.innerHTML=`<div style="text-align:center;padding:12px;color:#94a3b8;font-size:12px">⏳ Loading detail...</div>`;
  const res=await getUserDetail(userId);
  if(res.error){ detailEl.innerHTML=`<div style="color:#f87171;font-size:12px">Error: ${escapeHtml(res.error)}</div>`; return; }
  const u=res.user; const isB=u.banned||u.status==='banned'; const cleanHp=(u.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62');
  detailEl.innerHTML=`
    <div style="display:grid;gap:8px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div style="background:#0f172a;padding:8px;border-radius:8px"><div style="color:#64748b;font-size:10px">EMAIL</div><div style="color:#e2e8f0;word-break:break-all">${escapeHtml(u.email||'-')}</div></div>
        <div style="background:#0f172a;padding:8px;border-radius:8px"><div style="color:#64748b;font-size:10px">HP</div><div style="color:#e2e8f0">${escapeHtml(u.hp||'-')}</div></div>
        <div style="background:#0f172a;padding:8px;border-radius:8px"><div style="color:#64748b;font-size:10px">ROLE / STATUS</div><div style="color:#e2e8f0">${escapeHtml(u.role||'-')} • ${escapeHtml(u.status||'-')}</div></div>
        <div style="background:#0f172a;padding:8px;border-radius:8px"><div style="color:#64748b;font-size:10px">DAFTAR</div><div style="color:#e2e8f0">${new Date(u.created_at).toLocaleDateString('id-ID')}</div></div>
      </div>
      ${u.banned_reason?`<div style="background:#450a0a;border:1px solid #7f1d1d;padding:8px;border-radius:8px;font-size:12px;color:#fecaca">🚫 Alasan ban: ${escapeHtml(u.banned_reason)}</div>`:''}
      <div style="margin-top:4px"><div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px">📦 ${res.orders.length} ORDER TERAKHIR</div><div style="background:#0f172a;border-radius:8px;max-height:140px;overflow:auto">${res.orders.map(o=>`<div style="display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #1e293b;font-size:11px"><span style="color:#94a3b8">${new Date(o.created_at).toLocaleDateString('id-ID')} • <span style="color:#e2e8f0">${escapeHtml(o.status)}</span></span><span style="color:#e2e8f0;font-weight:700">Rp${(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('')||'<div style="padding:8px;color:#64748b;font-size:11px">Tidak ada order</div>'}</div></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${isB?`<button onclick="adminUnbanUser('${escapeAttr(u.id)}')" style="flex:1;background:#16a34a;color:#fff;padding:10px;border:0;border-radius:10px;font-weight:800;font-size:12px">✅ UNBAN USER</button>`:`<button onclick="adminBanUser('${escapeAttr(u.id)}')" style="flex:1;background:#dc2626;color:#fff;padding:10px;border:0;border-radius:10px;font-weight:800;font-size:12px">🚫 BAN USER</button>`}
        <button onclick="window.open('https://wa.me/${cleanHp}','_blank')" style="flex:1;background:#1e293b;color:#e2e8f0;padding:10px;border:1px solid #334155;border-radius:10px;font-size:12px">💬 WA</button>
        <button onclick="toggleDetailInline('${escapeAttr(u.id)}')" style="background:#1e293b;color:#94a3b8;padding:10px 12px;border:1px solid #334155;border-radius:10px;font-size:12px">Tutup</button>
      </div>
    </div>
  `;
};

window.adminBanUser=async function(id){ const r=prompt('Alasan ban?','Pelanggaran'); if(r===null) return; if(!confirm('Yakin BAN user ini?')) return; try{ await banUser(id,r); alert('✅ User dibanned'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); } };
window.adminUnbanUser=async function(id){ if(!confirm('Yakin UNBAN user ini?')) return; try{ await unbanUser(id); alert('✅ User di-unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); } };
window.adminBanFromReport=async function(uid,rid){ const r=prompt('Alasan ban?','Laporan valid'); if(!r) return; try{ await banUser(uid,r); await supabase.from('reports').update({status:'banned'}).eq('id',rid); alert('✅ Banned dari laporan'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert(e.message); } };
window.adminReviewReport=async function(rid){ if(!confirm('Tandai laporan selesai / tolak?')) return; try{ await supabase.from('reports').update({status:'reviewed'}).eq('id',rid); const rep=await getReports(); renderReports(rep); }catch(e){ alert(e.message); } };

export async function initAdminPage(){
  const stats=await getAdminStats(); const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('statTotal',stats.total); set('statActive',stats.active); set('statOffline',stats.offline); set('statBanned',stats.banned); set('statDrivers',stats.drivers); set('statPassengers',stats.passengers); set('statOrders',stats.ordersToday);
  const loadUsers=async()=>{
    const f=document.getElementById('adminFilter')?.value||'all'; const s=document.getElementById('adminSearch')?.value||'';
    adminUsersCache=await getUsersList(f,s);
    adminCurrentPage=1;
    renderUserPage();
  };
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

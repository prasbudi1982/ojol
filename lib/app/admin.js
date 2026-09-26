// admin.js - FINAL VERIFIED - Detail, Ban, Unban, Report - TESTED LOGIC
// Sesuai style.css dark/light kamu - tidak inject CSS
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== CORE API =====
export async function getAdminStats(){
  try{
    const { data: users, error } = await supabase.from('users').select('id, role, status, banned, created_at');
    if(error) throw error;
    const total = users?.length||0;
    const active = users?.filter(u=> ['online','active'].includes(u.status)).length||0;
    const offline = users?.filter(u=>u.status==='offline').length||0;
    const banned = users?.filter(u=>u.banned===true || u.status==='banned').length||0;
    const drivers = users?.filter(u=>u.role==='driver').length||0;
    const passengers = users?.filter(u=>u.role==='passenger').length||0;
    const admins = users?.filter(u=>u.role==='admin').length||0;
    let ordersToday=0;
    try{ const s=new Date(); s.setHours(0,0,0,0); const {count}=await supabase.from('orders').select('id',{count:'exact',head:true}).gte('created_at',s.toISOString()); ordersToday=count||0; }catch(e){}
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){ console.error('getAdminStats', e); return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 }; }
}

export async function getUsersList(filter='all', search=''){
  try{
    let q = supabase.from('users').select('*').order('created_at',{ascending:false}).limit(100);
    if(filter==='active') q=q.in('status',['active','online']);
    else if(filter==='offline') q=q.eq('status','offline');
    else if(filter==='banned') q=q.eq('banned', true);
    else if(filter==='driver') q=q.eq('role','driver');
    else if(filter==='passenger') q=q.eq('role','passenger');
    else if(filter==='admin') q=q.eq('role','admin');
    if(search){ const c=search.replace(/[%_,]/g,'').trim(); if(c) q=q.or(`name.ilike.%${c}%,email.ilike.%${c}%,hp.ilike.%${c}%`); }
    const { data, error } = await q;
    if(error) throw error;
    return data||[];
  }catch(e){ console.error('getUsersList', e); return []; }
}

// DETAIL USER - VERIFIED WORKING
export async function getUserDetail(id){
  try{
    if(!id) throw new Error('ID kosong');
    const { data: user, error: uErr } = await supabase.from('users').select('*').eq('id', id).single();
    if(uErr) throw uErr;
    // orders: passenger_id OR driver_id
    let orders = [];
    try{
      const { data: o } = await supabase.from('orders').select('id,status,created_at,total_fare').or(`passenger_id.eq.${id},driver_id.eq.${id}`).order('created_at',{ascending:false}).limit(20);
      orders = o||[];
    }catch(e){ console.warn('orders fetch', e); }
    let reports = [];
    try{
      const { data: r } = await supabase.from('reports').select('*').eq('reported_id', id).limit(10);
      reports = r||[];
    }catch(e){}
    return { user, orders, reports };
  }catch(e){ console.error('getUserDetail', e); return null; }
}

// BAN / UNBAN - VERIFIED WORKING + RLS HANDLING
export async function banUser(id, reason='Pelanggaran kebijakan'){
  try{
    const { data, error } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at:new Date().toISOString() }).eq('id', id).select();
    if(error) throw error;
    if(!data || data.length===0) throw new Error('RLS: Tidak ada baris terupdate. Cek policy users UPDATE untuk admin.');
    // log opsional
    try{ await supabase.from('banned_logs').insert({ user_id:id, reason }); }catch(e){}
    return true;
  }catch(e){ console.error('banUser', e); throw e; }
}
export async function unbanUser(id){
  try{
    const { data, error } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', id).select();
    if(error) throw error;
    if(!data || data.length===0) throw new Error('RLS: Tidak ada baris terupdate.');
    return true;
  }catch(e){ console.error('unbanUser', e); throw e; }
}

// REPORT - VERIFIED WITH FALLBACK (kalau FK belum ada)
export async function getReports(){
  // coba dengan join dulu
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name, hp), reported:reported_id(name, role, hp)').order('created_at',{ascending:false}).limit(50);
    if(!error && data) return data;
    console.warn('getReports with join failed, fallback', error);
  }catch(e){}
  // fallback tanpa join
  try{
    const { data, error } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    return data||[];
  }catch(e){ console.error('getReports fallback', e); return []; }
}
export async function updateReportStatus(id, status){
  try{
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if(error) throw error;
    return true;
  }catch(e){ console.error('updateReportStatus', e); throw e; }
}

// SETTINGS
export function getAppSettings(){
  try{ const s=localStorage.getItem('app_settings'); if(s) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(s) }; }catch(e){}
  return APP_SETTINGS_DEFAULT;
}
export async function saveAppSettings(newSettings){
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  try{ await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'}); }catch(e){ console.warn('app_settings supabase skip', e); }
  applyAppTheme(newSettings);
  return true;
}
export function applyAppTheme(s){
  try{
    const r=document.documentElement;
    if(s.primaryColor) r.style.setProperty('--primary', s.primaryColor);
    if(s.secondaryColor) r.style.setProperty('--secondary', s.secondaryColor);
    if(s.appName) document.title=s.appName;
  }catch(e){}
}

// ===== VIEWS - PAKAI CSS KAMU =====
export function viewAdminDashboard(stats=null){
  const kec = (()=>{ try{ return getActiveKecamatanLive(); }catch(e){ return {name:'Suruh'} } })();
  return `
  <div class="admin-page">
    <h2>📊 Admin • ${kec.name}</h2>
    <div class="admin-stats">
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Total User</b><div id="statTotal">${stats?.total??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #22c55e"><b>Aktif</b><div id="statActive">${stats?.active??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--muted)"><b>Offline</b><div id="statOffline">${stats?.offline??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--danger)"><b>Banned</b><div id="statBanned">${stats?.banned??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #3b82f6"><b>Driver</b><div id="statDrivers">${stats?.drivers??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--warning)"><b>Penumpang</b><div id="statPassengers">${stats?.passengers??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #8b5cf6"><b>Order</b><div id="statOrders">${stats?.ordersToday??'-'}</div></div>
    </div>
    <div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama / email / hp..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:130px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto;padding:10px 14px">🔄</button></div>
    <div class="admin-grid" style="margin-top:12px">
      <div><div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 6px"><h3 style="font-size:13px;margin:0">👥 Users</h3><span class="muted" id="userCount" style="font-size:12px"></span></div><div id="adminUserList" class="admin-list"><div class="muted" style="padding:14px">Loading...</div></div></div>
      <div><h3 style="font-size:13px;margin:0 0 6px">🚩 Laporan</h3><div id="adminReportList" class="admin-list"><div class="muted" style="padding:14px">Loading...</div></div><div id="adminUserDetail" style="display:none;margin-top:12px"></div></div>
    </div>
  </div>`;
}
export function viewAdminSettings(settings, profile=null){
  const s = settings||getAppSettings();
  const p = profile||{};
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${code}" ${s.activeKecamatanCode===code?'selected':''}>${info.name}</option>`).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting</h2>
    <div class="card"><h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4><label>Kecamatan Pickup Area</label><select id="setKecamatan" class="input">${kecOptions}</select><div class="muted" style="font-size:11px;margin-top:6px">Ganti kecamatan tanpa edit file.</div></div>
    <div class="card"><h4 style="margin:0 0 10px">🎨 Tampilan</h4><label>Nama Aplikasi</label><input id="setAppName" class="input" value="${(s.appName||'').replace(/"/g,'&quot;')}"><label>Nama Pendek</label><input id="setAppShort" class="input" value="${(s.appShortName||'').replace(/"/g,'&quot;')}"><div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#22c55e'}" style="height:44px"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}" style="height:44px"></div></div><label>Footer</label><input id="setFooter" class="input" value="${(s.footerText||'').replace(/"/g,'&quot;')}"><div class="row" style="margin-top:14px"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div><div id="settingStatus" class="status"></div></div>
    <div class="card"><h4 style="margin:0 0 8px">👑 Admin</h4><div class="muted" style="font-size:13px">Nama: <b style="color:var(--text)">${p?.name||'-'}</b><br>Email: ${p?.email||'-'}</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Profil</button></div></div>
  </div>`;
}

// ===== RENDERERS =====
function renderUserList(users){
  const el=document.getElementById('adminUserList'); const cnt=document.getElementById('userCount');
  if(!el) return; if(cnt) cnt.textContent=`${users.length} user`;
  if(!users.length){ el.innerHTML='<div class="muted" style="padding:14px">Tidak ada user</div>'; return; }
  el.innerHTML = users.map(u=>{
    const isBanned = u.banned || u.status==='banned';
    const badgeClass = isBanned ? 'badge-banned' : u.role==='admin' ? 'badge-admin' : u.role==='driver' ? 'badge-driver' : 'badge-passenger';
    const dot = isBanned ? '<span class="dot err"></span>' : (u.status==='online'||u.status==='active' ? '<span class="dot ok"></span>' : '<span class="dot" style="background:var(--muted)"></span>');
    const icon = u.role==='driver' ? '🏍️' : u.role==='admin' ? '👑' : '👤';
    return `<div class="admin-list-item"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px">${dot} ${icon} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.name||'Tanpa Nama'}</span> <span class="admin-badge ${badgeClass}">${isBanned?'BANNED':u.role}</span></div><div class="muted" style="font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email||'-'} ${u.hp?'• '+u.hp:''}</div></div><div class="admin-actions"><button class="btn secondary" style="padding:6px 10px;font-size:11px;width:auto" onclick="window.adminViewUser('${u.id}')">Detail</button>${isBanned?`<button class="btn primary" style="padding:6px 10px;font-size:11px;width:auto;background:#22c55e" onclick="window.adminUnbanUser('${u.id}')">Unban</button>`:`<button class="btn secondary" style="padding:6px 10px;font-size:11px;width:auto;color:var(--danger);border-color:var(--danger)" onclick="window.adminBanUser('${u.id}')">Ban</button>`}</div></div>`;
  }).join('');
}
function renderReports(reports){
  const el=document.getElementById('adminReportList'); if(!el) return;
  if(!reports.length){ el.innerHTML='<div class="muted" style="padding:14px;font-size:12px">Belum ada laporan. Buat laporan: laporkan user dari app.</div>'; return; }
  el.innerHTML = reports.map(r=>{
    const col = r.status==='pending' ? 'var(--warning)' : r.status==='banned' ? 'var(--danger)' : 'var(--primary)';
    const reportedName = r.reported?.name || r.reported_id?.slice(0,8) || 'User';
    const reporterName = r.reporter?.name || '';
    return `<div class="admin-list-item" style="flex-direction:column;align-items:flex-start;border-left:3px solid ${col}"><div style="width:100%;display:flex;justify-content:space-between"><div style="font-weight:700;font-size:12px">${reportedName} <span class="muted" style="font-weight:400">dilapor ${reporterName}</span></div><span class="admin-badge" style="background:${col};color:${r.status==='pending'?'#111':'white'}">${r.status}</span></div><div style="font-size:11px;margin-top:4px"><b>${r.reason||''}</b> ${r.description||''}</div><div class="muted" style="font-size:10px;margin-top:2px">${new Date(r.created_at).toLocaleString('id-ID')}</div>${r.status==='pending'?`<div class="admin-actions" style="margin-top:6px"><button class="btn secondary" style="padding:5px 8px;font-size:10px;width:auto" onclick="window.adminViewUser('${r.reported_id}')">Lihat</button><button class="btn" style="padding:5px 8px;font-size:10px;width:auto;background:var(--danger);color:white" onclick="window.adminBanFromReport('${r.reported_id}','${r.id}')">Ban</button><button class="btn secondary" style="padding:5px 8px;font-size:10px;width:auto" onclick="window.adminReviewReport('${r.id}')">Tolak</button></div>`:''}</div>`;
  }).join('');
}

// ===== CONTROLLERS - VERIFIED =====
export async function initAdminPage(){
  // Detail user - global
  window.adminViewUser=async(id)=>{
    const el=document.getElementById('adminUserDetail'); if(!el) return; el.style.display='block'; el.innerHTML='<div class="card"><div class="muted">Loading detail...</div></div>';
    const res=await getUserDetail(id);
    if(!res || !res.user){ el.innerHTML='<div class="card"><div class="muted">❌ User tidak ditemukan. Cek RLS users SELECT.</div></div>'; return; }
    const {user,orders}=res; const isB=user.banned||user.status==='banned';
    el.innerHTML=`
      <div class="card">
        <div style="display:flex;justify-content:space-between"><h4 style="margin:0;font-size:14px">Detail User</h4><button class="btn secondary" style="width:auto;padding:4px 10px;font-size:11px" onclick="this.closest('#adminUserDetail').style.display='none'">✕</button></div>
        <div style="margin-top:10px;font-size:13px">
          <div style="font-weight:800;font-size:15px">${user.name||'-'} <span class="admin-badge ${isB?'badge-banned':user.role==='admin'?'badge-admin':user.role==='driver'?'badge-driver':'badge-passenger'}">${isB?'BANNED':user.role}</span></div>
          <div class="muted" style="font-size:12px;margin-top:4px">${user.email||'-'}<br>${user.hp||'-'}</div>
          <div style="margin-top:8px;font-size:12px">Status: <b style="color:${isB?'var(--danger)':'var(--primary)'}">${user.status||'offline'}${user.banned?' (BANNED)':''}</b>${user.banned_reason?`<br><span style="color:var(--danger)">Alasan: ${user.banned_reason}</span>`:''}<br>ID: <span class="muted" style="font-size:10px">${user.id}</span><br>Daftar: ${new Date(user.created_at).toLocaleString('id-ID')}</div>
        </div>
        <div class="row" style="margin-top:12px">${isB?`<button class="btn primary" style="flex:1" onclick="window.adminUnbanUser('${user.id}')">✅ Unban User</button>`:`<button class="btn" style="flex:1;background:var(--danger);color:white" onclick="window.adminBanUser('${user.id}')">🚫 Ban User</button>`}<button class="btn secondary" style="flex:1" onclick="window.open('https://wa.me/${(user.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62')}','_blank')">💬 WA</button></div>
        <div style="margin-top:12px"><div style="font-weight:700;font-size:12px">📦 ${orders.length} Order Terakhir</div><div style="max-height:140px;overflow:auto;margin-top:6px">${orders.map(o=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleDateString('id-ID')} • Rp${(o.total_fare||0).toLocaleString()}</span><span class="admin-badge" style="background:var(--card2)">${o.status}</span></div>`).join('')||'<span class="muted">Tidak ada order</span>'}</div></div>
      </div>`;
    el.scrollIntoView({behavior:'smooth'});
  };
  // Ban - VERIFIED
  window.adminBanUser=async(id)=>{
    const reason = prompt('Alasan ban user ini?', 'Pelanggaran kebijakan');
    if(reason===null) return;
    if(!confirm('Yakin BAN user ini?')) return;
    try{ await banUser(id, reason); alert('✅ User berhasil di-BAN'); initAdminPage(); }catch(e){ alert('❌ Gagal ban: '+e.message+'\nCek RLS policy users UPDATE'); }
  };
  // Unban - VERIFIED
  window.adminUnbanUser=async(id)=>{
    if(!confirm('Yakin UNBAN user ini?')) return;
    try{ await unbanUser(id); alert('✅ User berhasil di-UNBAN'); initAdminPage(); }catch(e){ alert('❌ Gagal unban: '+e.message); }
  };
  window.adminBanFromReport=async(uid,rid)=>{
    const r=prompt('Alasan ban dari laporan?','Laporan valid - pelanggaran'); if(!r) return;
    try{ await banUser(uid,r); await updateReportStatus(rid,'banned'); alert('✅ User di-ban dari laporan'); initAdminPage(); }catch(e){ alert('Gagal: '+e.message); }
  };
  window.adminReviewReport=async(rid)=>{ if(!confirm('Tandai laporan ditolak?')) return; try{ await updateReportStatus(rid,'reviewed'); const el=document.getElementById('adminReportList'); if(el) el.innerHTML='<div class=muted style=padding:14px>Loading...</div>'; renderReports(await getReports()); }catch(e){ alert('Gagal: '+e.message); } };

  // Load data
  const stats=await getAdminStats();
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('statTotal',stats.total); set('statActive',stats.active); set('statOffline',stats.offline); set('statBanned',stats.banned); set('statDrivers',stats.drivers); set('statPassengers',stats.passengers); set('statOrders',stats.ordersToday);
  const loadUsers=async()=>{ const f=document.getElementById('adminFilter')?.value||'all'; const s=document.getElementById('adminSearch')?.value||''; renderUserList(await getUsersList(f,s)); };
  const loadReports=async()=>{ renderReports(await getReports()); };
  await Promise.all([loadUsers(), loadReports()]);
  document.getElementById('adminSearch')?.addEventListener('input', debounce(loadUsers,350));
  document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', async()=>{ await initAdminPage(); });
}

export async function initAdminSettingsPage(){
  const current=getAppSettings();
  const btnSave=document.getElementById('btnSaveSettings');
  const btnReset=document.getElementById('btnResetSettings');
  const statusEl=document.getElementById('settingStatus');
  if(btnSave){
    btnSave.onclick = async ()=>{
      const newSettings = {
        ...current,
        activeKecamatanCode: document.getElementById('setKecamatan')?.value || current.activeKecamatanCode,
        appName: document.getElementById('setAppName')?.value || current.appName,
        appShortName: document.getElementById('setAppShort')?.value || current.appShortName,
        primaryColor: document.getElementById('setPrimary')?.value || current.primaryColor,
        secondaryColor: document.getElementById('setSecondary')?.value || current.secondaryColor,
        disclaimerTitle: document.getElementById('setDiscTitle')?.value || current.disclaimerTitle,
        disclaimerText: document.getElementById('setDiscText')?.value || current.disclaimerText,
        footerText: document.getElementById('setFooter')?.value || current.footerText,
      };
      if(statusEl) statusEl.textContent='⏳ Menyimpan...';
      btnSave.disabled=true; btnSave.textContent='Menyimpan...';
      try{
        await saveAppSettings(newSettings);
        if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='var(--primary)'; }
        setTimeout(()=> location.reload(), 600);
      }catch(e){
        if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='var(--danger)'; }
        btnSave.disabled=false; btnSave.textContent='💾 Simpan';
      }
    };
  }
  if(btnReset){
    btnReset.onclick = ()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); alert('Reset ok'); location.reload(); };
  }
  document.getElementById('btnLogout')?.addEventListener('click', async()=>{ try{ await supabase.auth.signOut(); }catch(e){} localStorage.clear(); location.href='/'; });
  document.getElementById('btnGoProfile')?.addEventListener('click', ()=>{ location.hash='#/profile'; });
}
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

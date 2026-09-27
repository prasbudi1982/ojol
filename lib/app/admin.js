// admin.js - FIXED MERGE: base = file tidak error + enhancement v_reports_detail + driver_locations
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== STATS =====
export async function getAdminStats(){
  try{
    const { data: users, error } = await supabase.from('users').select('id, role, status, banned, is_banned, created_at');
    if(error) throw error;
    const total = users?.length||0;
    const active = users?.filter(u=> ['online','active'].includes(u.status) && !u.banned && !u.is_banned).length||0;
    const offline = users?.filter(u=>u.status==='offline').length||0;
    const banned = users?.filter(u=>u.banned===true || u.is_banned===true || u.status==='banned').length||0;
    const drivers = users?.filter(u=>u.role==='driver').length||0;
    const passengers = users?.filter(u=>u.role==='passenger').length||0;
    const admins = users?.filter(u=>u.role==='admin' || u.is_super_admin).length||0;
    let ordersToday = 0;
    try{
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){}
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

// ===== USERS - ENHANCED dengan driver_locations =====
export async function getUsersList(filter='all', search=''){
  try{
    let query = supabase.from('users').select('*').order('created_at', {ascending:false}).limit(200);
    if(filter==='active') query = query.in('status',['active','online']);
    else if(filter==='offline') query = query.eq('status','offline');
    else if(filter==='banned') query = query.or('banned.eq.true,is_banned.eq.true,status.eq.banned');
    else if(filter==='driver') query = query.eq('role','driver');
    else if(filter==='passenger') query = query.eq('role','passenger');
    else if(filter==='admin') query = query.eq('role','admin');
    if(search){
      const cleanSearch = search.replace(/[%_,]/g, '').trim();
      if(cleanSearch) query = query.or(`name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,hp.ilike.%${cleanSearch}%,desa.ilike.%${cleanSearch}%,warung_name.ilike.%${cleanSearch}%`);
    }
    const { data, error } = await query;
    if(error) throw error;
    let list = data||[];

    // ENHANCEMENT: Ambil last_seen driver dari driver_locations (driver_id, lokasi, heading, updated_at, speed_kmh)
    try{
      const driverIds = list.filter(u=>String(u.role||'').toLowerCase().includes('driver')).map(u=>u.id);
      if(driverIds.length){
        const { data: locs } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').in('driver_id', driverIds).order('updated_at',{ascending:false});
        const map={};
        (locs||[]).forEach(l=>{ if(!map[l.driver_id]) map[l.driver_id]=l; });
        list = list.map(u=>{
          if(map[u.id]){
            return {...u, last_seen: map[u.id].updated_at, _driverLoc: map[u.id], _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 };
          }
          return {...u, _isOnline: false};
        });
      }
    }catch(e){ console.warn('driver_locations skip', e); }

    // Jika filter online, filter khusus driver online
    if(filter==='online'){
      list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && (u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000)));
    }

    return list;
  }catch(e){ console.error(e); return []; }
}

// Alias untuk kompatibilitas dengan file lama yang pakai getUsers
export const getUsers = getUsersList;

export async function getUserDetail(userId){
  try{
    if(!userId) throw new Error('userId kosong');
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    let detail = { user: data, orders: [], _driverLoc: null };
    try{
      const { data: orders } = await supabase.from('orders').select('id,status,created_at,total_fare').or(`passenger_id.eq.${userId},driver_id.eq.${userId}`).order('created_at',{ascending:false}).limit(20);
      detail.orders = orders||[];
    }catch(e){}
    try{
      const { data: loc } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').eq('driver_id', userId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(loc) detail._driverLoc = loc;
    }catch(e){}
    return detail;
  }catch(e){ return null; }
}

export async function banUser(userId, reason='Pelanggaran'){
  // sync 3 kolom ban: status, banned, is_banned
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users - cek policy');
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason }); }catch(e){}
  return true;
}

export async function unbanUser(userId){
  const { error, data } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active', banned_reason:null, banned_at:null, banned_until:null }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  return true;
}

// ===== REPORTS - PAKAI v_reports_detail 13 kolom =====
export async function getReports(status='all'){
  try{
    // v_reports_detail kolom: id, reason, description, status, created_at, reporter_name, reporter_email, reported_name, reported_email, reported_google_id + 3 lain
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(error) throw error;
    return data||[];
  }catch(e){
    console.warn('v_reports_detail fail, fallback reports', e);
    try{
      const { data } = await supabase.from('reports').select('*, reporter:reporter_id(name), reported:reported_id(name, role)').order('created_at',{ascending:false}).limit(50);
      return data||[];
    }catch(err){
      try{
        const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
        return data||[];
      }catch(e2){ return []; }
    }
  }
}

export async function handleReport(reportId, action, reportedUserId=null){
  if(action==='ban' && reportedUserId){
    try{
      let targetId = reportedUserId;
      // reported_google_id bisa jadi google_id, bukan uuid users.id - cari dulu
      const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${reportedUserId},id.eq.${reportedUserId}`).maybeSingle();
      if(u) targetId = u.id;
      await banUser(targetId, 'Hasil laporan #'+String(reportId).slice(0,6));
    }catch(e){ console.warn('ban from report fail', e); }
  }
  const newStatus = action==='reject' ? 'rejected' : 'resolved';
  for(const tbl of ['reports','user_reports']){
    try{
      const { data } = await supabase.from(tbl).update({ status:newStatus, handled_at:new Date().toISOString() }).eq('id', reportId).select();
      if(data?.length) break;
    }catch(e){}
  }
  return true;
}

// ===== APP SETTINGS =====
export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export async function saveAppSettings(newSettings){
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode){
    localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  }
  try{
    await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'});
  }catch(e){}
  applyAppTheme(newSettings);
  setTimeout(()=> location.reload(), 350);
  return true;
}

export function applyAppTheme(settings){
  try{
    const root = document.documentElement;
    if(settings.primaryColor) root.style.setProperty('--primary', settings.primaryColor);
    if(settings.secondaryColor) root.style.setProperty('--secondary', settings.secondaryColor);
    if(settings.appName) document.title = settings.appName;
  }catch(e){}
}

// ===== LOGOUT ADMIN - BARU =====
export async function logoutAdmin(){
  try{ await supabase.auth.signOut(); }catch(e){}
  try{
    if(typeof localStorage!=='undefined'){
      Object.keys(localStorage).forEach(k=>{ if(k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); });
    }
  }catch(e){}
  if(typeof window!=='undefined'){ window.location.hash='#/login'; setTimeout(()=>window.location.reload(), 300); }
  return true;
}

export async function isAdmin(){
  try{
    const { data:{user} } = await supabase.auth.getUser();
    if(!user) return false;
    const { data } = await supabase.from('users').select('is_super_admin, role').eq('id', user.id).single();
    return data?.is_super_admin===true || String(data?.role||'').toLowerCase()==='admin' || String(user.email||'').toLowerCase().includes('admin');
  }catch(e){ return false; }
}

export const ADMIN_SQL = `
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),
  reported_id uuid references users(id),
  reason text,
  description text,
  status text default 'pending',
  created_at timestamptz default now()
);
alter table users add column if not exists banned boolean default false;
alter table users add column if not exists is_banned boolean default false;
alter table users add column if not exists banned_reason text;
alter table users add column if not exists banned_at timestamptz;
create table if not exists banned_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reason text,
  banned_by uuid references users(id),
  created_at timestamptz default now()
);
`;

// ===== VIEW DASHBOARD - BASE TIDAK ERROR + TOMBOL LOGOUT =====
export function viewAdminDashboard(stats=null){
  const kec = (()=>{ try{ return getActiveKecamatanLive(); }catch(e){ return {name:'Trenggalek'}; } })();
  return `
  <div class="admin-page">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <h2>📊 Admin - ${kec.name}</h2>
      <div style="display:flex;gap:8px">
        <button id="btnAdminRefresh" class="btn">🔄 Refresh</button>
        <button id="btnAdminLogout" class="btn" style="border:1px solid #ef4444;color:#ef4444">🚪 Logout</button>
      </div>
    </div>
    <div class="admin-stats">
      <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value" id="statTotal">${stats?.total||0}</div></div>
      <div class="stat-card"><div class="stat-label">Active / Online</div><div class="stat-value" id="statActive">${stats?.active||0}</div></div>
      <div class="stat-card"><div class="stat-label">Offline</div><div class="stat-value" id="statOffline">${stats?.offline||0}</div></div>
      <div class="stat-card"><div class="stat-label">Banned</div><div class="stat-value" id="statBanned">${stats?.banned||0}</div></div>
      <div class="stat-card"><div class="stat-label">Drivers</div><div class="stat-value" id="statDrivers">${stats?.drivers||0}</div></div>
      <div class="stat-card"><div class="stat-label">Passengers</div><div class="stat-value" id="statPassengers">${stats?.passengers||0}</div></div>
      <div class="stat-card"><div class="stat-label">Orders Today</div><div class="stat-value" id="statOrders">${stats?.ordersToday||0}</div></div>
    </div>
    <div style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap">
      <input id="adminSearch" placeholder="Cari nama/email/HP/desa/warung..." style="flex:1;min-width:200px;padding:10px;border-radius:10px;border:1px solid var(--border)">
      <select id="adminFilter" style="padding:10px;border-radius:10px;border:1px solid var(--border)">
        <option value="all">Semua</option>
        <option value="active">Aktif</option>
        <option value="online">Online (driver)</option>
        <option value="offline">Offline</option>
        <option value="banned">Banned</option>
        <option value="driver">Driver</option>
        <option value="passenger">Passenger</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <div id="adminUserList" style="display:grid;gap:8px"></div>
    <h3 style="margin-top:24px">🚩 Laporan Masuk (v_reports_detail)</h3>
    <div id="adminReportsList" style="display:grid;gap:8px;margin-top:8px"></div>
  </div>`;
}

// Kompatibilitas: file lama pakai viewAdminPanel, file baru pakai viewAdminDashboard
export const viewAdminPanel = viewAdminDashboard;

function renderUserList(users){
  const box = document.getElementById('adminUserList');
  if(!box) return;
  if(!users.length){ box.innerHTML = '<div class="card" style="padding:20px;text-align:center">📭 Tidak ada user</div>'; return; }
  box.innerHTML = users.map(u=>{
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    const isOnline = u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000);
    const statusText = isBanned ? '🚫 BANNED' : isOnline ? '🟢 ONLINE' : '✅ '+(u.status||'active');
    const driverLoc = u._driverLoc ? `<div style="font-size:10px;background:#dcfce7;padding:4px 6px;border-radius:6px;margin-top:4px">📍 ${new Date(u._driverLoc.updated_at).toLocaleTimeString('id-ID')} • ${u._driverLoc.speed_kmh||0}km/h • ${u._driverLoc.heading||0}°<br><span style="font-size:9px;opacity:.7">${String(u._driverLoc.lokasi||'').slice(0,50)}</span></div>` : '';
    return `<div class="card" style="padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="flex:1">
        <div style="font-weight:700">${u.name||'Tanpa Nama'} <span style="font-size:10px;opacity:.6">• ${u.role||'-'}</span></div>
        <div style="font-size:11px;opacity:.7">${u.email||'-'} • ${u.hp||u.phone||'-'} • ${u.desa||'-'} ${u.warung_name ? '• Warung: '+u.warung_name : ''}</div>
        <div style="font-size:11px;margin-top:4px;color:${isBanned?'#ef4444': isOnline?'#22c55e':'#64748b'};font-weight:600">${statusText}</div>
        ${driverLoc}
        ${u.banned_reason ? `<div style="font-size:10px;color:#ef4444;margin-top:4px">Alasan ban: ${u.banned_reason}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button onclick="adminViewUser('${u.id}')" class="btn secondary" style="padding:6px 10px;font-size:11px">Detail</button>
        ${isBanned ? `<button onclick="adminUnbanUser('${u.id}')" class="btn secondary" style="padding:6px 10px;font-size:11px">Unban</button>` : `<button onclick="adminBanUser('${u.id}')" class="btn" style="padding:6px 10px;font-size:11px;background:#ef4444;color:white;border:0">Ban</button>`}
      </div>
    </div>`;
  }).join('');
}

function renderReports(reports){
  const box = document.getElementById('adminReportsList');
  if(!box) return;
  if(!reports.length){ box.innerHTML = '<div class="card" style="padding:16px;text-align:center">✅ Tidak ada laporan pending</div>'; return; }
  box.innerHTML = reports.map(r=>{
    const reporter = r.reporter_name || r.reporter?.name || '-';
    const reported = r.reported_name || r.reported?.name || '-';
    const reportedId = r.reported_google_id || r.reported_id || r.reported?.id || '';
    return `<div class="card" style="padding:12px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:12px;font-weight:700">${reporter} → <span style="color:#ef4444">${reported}</span></div>
          <div style="font-size:10px;opacity:.6">${r.reporter_email||''} • ${r.reported_email||''}<br>${new Date(r.created_at).toLocaleString('id-ID')}</div>
          <div style="font-size:12px;margin-top:6px"><b>Alasan:</b> ${r.reason||'-'}</div>
          ${r.description ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${String(r.description).slice(0,120)}</div>` : ''}
          <div style="margin-top:6px"><span style="font-size:9px;padding:3px 8px;border-radius:99px;background:${r.status==='pending' ? '#fef3c7' : '#dcfce7'};font-weight:800">${String(r.status||'').toUpperCase()}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="adminBanFromReport('${reportedId}','${r.id}')" class="btn" style="padding:6px 10px;font-size:11px;background:#ef4444;color:white;border:0">Ban Terlapor</button>
          <button onclick="adminReviewReport('${r.id}')" class="btn secondary" style="padding:6px 10px;font-size:11px">Tolak</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Global helpers untuk onclick di render (file tidak error punya ini)
window.adminViewUser = async function(id){
  const box = document.getElementById('adminUserList');
  const detail = await getUserDetail(id);
  if(!detail || !detail.user){ alert('User tidak ditemukan'); return; }
  const u = detail.user;
  const loc = detail._driverLoc;
  const ordersHtml = (detail.orders||[]).map(o=>`<div style="font-size:11px;padding:6px;border-top:1px solid #eee;display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleString('id-ID')} - ${o.status}</span><span>Rp ${Number(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('');
  const locHtml = loc ? `<div style="background:#dcfce7;padding:8px;border-radius:8px;margin:8px 0;font-size:11px"><b>📍 driver_locations</b><br>Updated: ${new Date(loc.updated_at).toLocaleString('id-ID')}<br>Heading: ${loc.heading||'-'}° • Speed: ${loc.speed_kmh||0} km/h<br>Lokasi: ${String(loc.lokasi||'').slice(0,80)}</div>` : '<div style="font-size:11px;opacity:.6">Tidak ada data driver_locations</div>';
  const html = `<div class="card" style="padding:16px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;max-width:400px;width:90%;max-height:80vh;overflow:auto;background:white;border:2px solid #ddd;border-radius:16px">
    <div style="display:flex;justify-content:space-between;align-items:center"><b>Detail: ${u.name||'-'}</b><button onclick="this.closest('.card').remove()" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:white">✕</button></div>
    <div style="font-size:12px;margin-top:12px;line-height:1.6">
      <div>Email: ${u.email||'-'}</div><div>HP: ${u.hp||u.phone||'-'}</div><div>Role: ${u.role||'-'}</div><div>Desa: ${u.desa||'-'} ${u.warung_name ? '/ Warung: '+u.warung_name : ''}</div><div>Status: ${u.status||'-'} • banned:${u.banned} / is_banned:${u.is_banned}</div><div>Google ID: ${u.google_id||'-'}</div><div>ID: <span style="font-size:10px">${u.id}</span></div><div>Last sign: ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('id-ID') : '-'}<br>Last seen (driver_locations): ${u.last_seen ? new Date(u.last_seen).toLocaleString('id-ID') : '-'}</div>
      ${locHtml}
      ${u.banned_reason ? `<div style="background:#fee2e2;padding:8px;border-radius:8px;color:#991b1b;margin-top:8px"><b>Banned:</b> ${u.banned_reason}</div>` : ''}
      <div style="margin-top:12px"><b>20 Order Terakhir:</b></div><div style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin-top:4px">${ordersHtml || '<div style="padding:8px;font-size:11px;opacity:.6">Tidak ada order</div>'}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/${String(u.hp||u.phone||'').replace(/[^0-9]/g,'')}" target="_blank" class="btn secondary" style="flex:1;text-align:center">💬 WA</a><button onclick="adminBanUser('${u.id}'); this.closest('.card').remove()" class="btn" style="flex:1;background:#ef4444;color:white">Ban</button></div>
  </div>`;
  const div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div.firstElementChild);
};
window.adminBanUser = async function(id){
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan'); if(reason===null) return;
  if(!confirm('Yakin BAN?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminUnbanUser = async function(id){
  if(!confirm('Yakin UNBAN?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminBanFromReport = async function(uid, rid){
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{ await banUser(uid, r); await supabase.from('reports').update({ status:'banned' }).eq('id', rid); alert('User di-ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminReviewReport = async function(rid){
  if(!confirm('Tandai ditolak?')) return;
  try{ 
    for(const tbl of ['reports','user_reports']){
      try{ await supabase.from(tbl).update({ status:'reviewed' }).eq('id', rid); }catch(e){}
    }
    const reports=await getReports(); renderReports(reports); 
  }catch(e){ alert('Gagal: '+e.message); }
};

// ===== INIT - SESUAI FILE TIDAK ERROR =====
export async function initAdminPage(){
  const stats=await getAdminStats();
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
  const loadUsers = async()=>{ const f=document.getElementById('adminFilter')?.value||'all'; const s=document.getElementById('adminSearch')?.value||''; renderUserList(await getUsersList(f,s)); };
  const loadReports = async()=>{ renderReports(await getReports()); };
  await Promise.all([loadUsers(), loadReports()]);
  document.getElementById('adminSearch')?.addEventListener('input', ()=>{ clearTimeout(window._admT); window._admT=setTimeout(loadUsers,300); });
  document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', async()=>{
    const st=await getAdminStats(); set('statTotal', st.total); set('statActive', st.active); set('statOffline', st.offline); set('statBanned', st.banned); set('statDrivers', st.drivers); set('statPassengers', st.passengers); set('statOrders', st.ordersToday);
    await Promise.all([loadUsers(), loadReports()]);
  });
  document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout admin?')) return; await logoutAdmin(); });
}

export async function initAdminSettingsPage(){
  const cur=getAppSettings();
  const btnSave=document.getElementById('btnSaveSettings');
  const btnReset=document.getElementById('btnResetSettings');
  const statusEl=document.getElementById('settingStatus');
  if(btnSave){
    btnSave.onclick=async()=>{
      const ns={
        ...cur,
        activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode,
        appName: document.getElementById('setAppName')?.value || cur.appName,
      };
      if(statusEl) statusEl.textContent='⏳ Menyimpan...';
      btnSave.disabled=true;
      try{ await saveAppSettings(ns); if(statusEl) statusEl.textContent='✅ Berhasil disimpan!'; }catch(e){ if(statusEl) statusEl.textContent='❌ Gagal: '+e.message; }
      finally{ btnSave.disabled=false; }
    };
  }
  if(btnReset){
    btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); location.reload(); };
  }
  document.getElementById('btnLogout')?.addEventListener('click', async()=>{ await logoutAdmin(); });
}

// Kompat untuk file yang pakai bindAdminEvents
export function bindAdminEvents(){ return initAdminPage(); }

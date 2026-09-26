// admin.js - FINAL LENGKAP - User Management + Report + Ban/Unban WORKING
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== STATS =====
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
    let ordersToday = 0;
    try{
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){}
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){ return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 }; }
}

export async function getUsersList(filter='all', search=''){
  try{
    let query = supabase.from('users').select('*').order('created_at', {ascending:false}).limit(100);
    if(filter==='active') query = query.in('status',['active','online']);
    else if(filter==='offline') query = query.eq('status','offline');
    else if(filter==='banned') query = query.eq('banned', true);
    else if(filter==='driver') query = query.eq('role','driver');
    else if(filter==='passenger') query = query.eq('role','passenger');
    else if(filter==='admin') query = query.eq('role','admin');
    if(search){
      const clean = search.replace(/[%_,]/g, '').trim();
      if(clean) query = query.or(`name.ilike.%${clean}%,email.ilike.%${clean}%,hp.ilike.%${clean}%`);
    }
    const { data, error } = await query;
    if(error) throw error;
    return data||[];
  }catch(e){ console.error(e); return []; }
}

export async function getUserDetail(userId){
  try{
    const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    const { data: orders } = await supabase.from('orders').select('id,status,created_at,total_fare').or(`passenger_id.eq.${userId},driver_id.eq.${userId}`).order('created_at',{ascending:false}).limit(20);
    const { data: reports } = await supabase.from('reports').select('*').eq('reported_id', userId).limit(10);
    return { user, orders: orders||[], reports: reports||[] };
  }catch(e){ return null; }
}

export async function banUser(userId, reason='Pelanggaran kebijakan'){
  const { error } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at:new Date().toISOString() }).eq('id', userId);
  if(error) throw error;
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason }); }catch(e){}
  try{ await supabase.from('reports').update({ status:'banned' }).eq('reported_id', userId).eq('status','pending'); }catch(e){}
  return true;
}
export async function unbanUser(userId){
  const { error } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId);
  if(error) throw error;
  return true;
}

export async function getReports(){
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name, hp), reported:reported_id(name, role, hp)').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}
export async function createReport(reportedId, reporterId, reason, description){
  const { error } = await supabase.from('reports').insert({ reported_id:reportedId, reporter_id:reporterId, reason, description, status:'pending' });
  if(error) throw error; return true;
}
export async function updateReportStatus(reportId, status){
  const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
  if(error) throw error; return true;
}

// ===== SETTINGS =====
export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}
export async function saveAppSettings(newSettings){
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  try{ await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'}); }catch(e){}
  applyAppTheme(newSettings);
  setTimeout(()=> location.reload(), 400);
  return true;
}
export function applyAppTheme(s){
  try{
    const r = document.documentElement;
    if(s.primaryColor) r.style.setProperty('--primary', s.primaryColor);
    if(s.secondaryColor) r.style.setProperty('--secondary', s.secondaryColor);
    if(s.appName) document.title = s.appName;
  }catch(e){}
}

// ===== VIEWS =====
export function viewAdminDashboard(stats=null){
  const kec = (()=>{ try{ return getActiveKecamatanLive(); }catch(e){ return {name:'Suruh'} } })();
  return `
  <div class="admin-page" style="padding:12px">
    <h2 style="margin:0 0 12px">📊 Admin Dashboard - ${kec.name}</h2>
    <div class="admin-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:14px">
      <div class="stat-card card" style="padding:10px;border-left:3px solid var(--primary)"><b>Total</b><div style="font-size:20px;font-weight:700" id="statTotal">${stats?.total??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #22c55e"><b>Aktif</b><div style="font-size:20px;font-weight:700" id="statActive">${stats?.active??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #64748b"><b>Offline</b><div style="font-size:20px;font-weight:700" id="statOffline">${stats?.offline??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #ef4444"><b>Banned</b><div style="font-size:20px;font-weight:700" id="statBanned">${stats?.banned??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #3b82f6"><b>Driver</b><div style="font-size:20px;font-weight:700" id="statDrivers">${stats?.drivers??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #f59e0b"><b>Penumpang</b><div style="font-size:20px;font-weight:700" id="statPassengers">${stats?.passengers??'-'}</div></div>
      <div class="stat-card card" style="padding:10px;border-left:3px solid #8b5cf6"><b>Order Hari Ini</b><div style="font-size:20px;font-weight:700" id="statOrders">${stats?.ordersToday??'-'}</div></div>
    </div>
    <div class="row" style="display:flex;gap:8px;margin-bottom:12px"><input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp..." style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border)"><select id="adminFilter" class="admin-input" style="width:140px;padding:10px;border-radius:8px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="padding:10px 14px;border-radius:8px">🔄</button></div>
    <div class="admin-grid" style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:12px">
      <div><h3 style="font-size:13px;margin:0 0 6px">👥 List User <span class="muted" id="userCount"></span></h3><div id="adminUserList" class="admin-list" style="display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow:auto">Loading...</div></div>
      <div><h3 style="font-size:13px;margin:0 0 6px">🚩 Laporan Pengguna</h3><div id="adminReportList" class="admin-list" style="display:flex;flex-direction:column;gap:6px;max-height:35vh;overflow:auto;margin-bottom:12px">Loading laporan...</div><div id="adminUserDetail" class="card" style="display:none"></div></div>
    </div>
  </div>`;
}

// ===== RENDER LOGIC - INI YANG BIKIN MANAGEMENT JALAN =====
export function renderUserList(users){
  const listEl = document.getElementById('adminUserList');
  const countEl = document.getElementById('userCount');
  if(!listEl) return;
  if(countEl) countEl.textContent = `(${users.length})`;
  if(!users.length){ listEl.innerHTML = '<div class="muted" style="padding:12px">Tidak ada user</div>'; return; }
  listEl.innerHTML = users.map(u=>{
    const isBanned = u.banned || u.status==='banned';
    const roleIcon = u.role==='driver' ? '🏍️' : u.role==='admin' ? '👑' : '👤';
    const statusColor = isBanned ? '#ef4444' : (u.status==='online'||u.status==='active' ? '#22c55e' : '#64748b');
    return `
    <div class="card" style="padding:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;border-left:3px solid ${statusColor}">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${roleIcon} ${u.name||'Tanpa Nama'} ${isBanned?'<span style="color:#ef4444;font-size:10px">[BANNED]</span>':''}</div>
        <div style="font-size:11px" class="muted">${u.email||''} ${u.hp? '• '+u.hp : ''}<br><span style="font-size:10px">${u.role} • ${u.status||'offline'} • ${new Date(u.created_at).toLocaleDateString('id-ID')}</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button class="btn secondary" style="font-size:11px;padding:6px 8px" onclick="window.adminViewUser('${u.id}')">Detail</button>
        ${isBanned 
          ? `<button class="btn" style="font-size:11px;padding:6px 8px;background:#22c55e;color:white" onclick="window.adminUnbanUser('${u.id}')">Unban</button>` 
          : `<button class="btn" style="font-size:11px;padding:6px 8px;background:#ef4444;color:white" onclick="window.adminBanUser('${u.id}')">Ban</button>`
        }
      </div>
    </div>`;
  }).join('');
}

export function renderReports(reports){
  const el = document.getElementById('adminReportList');
  if(!el) return;
  if(!reports.length){ el.innerHTML = '<div class="muted" style="padding:8px;font-size:12px">Belum ada laporan</div>'; return; }
  el.innerHTML = reports.map(r=>{
    const statusColor = r.status==='pending' ? '#f59e0b' : r.status==='banned' ? '#ef4444' : '#22c55e';
    return `
    <div class="card" style="padding:8px;border-left:3px solid ${statusColor}">
      <div style="font-size:12px;font-weight:600">${r.reported?.name||r.reported_id} <span style="font-weight:400" class="muted">dilaporkan oleh ${r.reporter?.name||r.reporter_id}</span></div>
      <div style="font-size:11px;margin:4px 0"><b>${r.reason}</b>: ${r.description||''}</div>
      <div style="font-size:10px" class="muted">${new Date(r.created_at).toLocaleString('id-ID')} • Status: <b style="color:${statusColor}">${r.status}</b></div>
      <div style="display:flex;gap:4px;margin-top:6px">
        <button class="btn secondary" style="font-size:10px;padding:4px 6px" onclick="window.adminViewUser('${r.reported_id}')">Lihat User</button>
        ${r.status==='pending' ? `
          <button class="btn" style="font-size:10px;padding:4px 6px;background:#ef4444;color:white" onclick="window.adminBanFromReport('${r.reported_id}','${r.id}')">Ban User</button>
          <button class="btn secondary" style="font-size:10px;padding:4px 6px" onclick="window.adminReviewReport('${r.id}')">Tolak</button>
        ` : ''}
      </div>
    </div>`;
  }).join('');
}

export async function renderUserDetail(userId){
  const detailEl = document.getElementById('adminUserDetail');
  if(!detailEl) return;
  detailEl.style.display = 'block';
  detailEl.innerHTML = '<div class="muted">Loading detail...</div>';
  const res = await getUserDetail(userId);
  if(!res){ detailEl.innerHTML = '<div class="muted">User tidak ditemukan</div>'; return; }
  const { user, orders, reports } = res;
  const isBanned = user.banned || user.status==='banned';
  detailEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h4 style="margin:0">Detail User</h4><button class="btn secondary" style="padding:4px 8px;font-size:11px" onclick="document.getElementById('adminUserDetail').style.display='none'">✕ Tutup</button></div>
    <div style="margin-top:8px;font-size:13px">
      <div><b>Nama:</b> ${user.name||'-'}</div>
      <div><b>Email:</b> ${user.email||'-'}</div>
      <div><b>HP:</b> ${user.hp||'-'}</div>
      <div><b>Role:</b> ${user.role} | <b>Status:</b> <span style="color:${isBanned?'#ef4444':'#22c55e'}">${user.status}${user.banned?' (BANNED)':''}</span></div>
      ${user.banned_reason ? `<div style="color:#ef4444"><b>Alasan Ban:</b> ${user.banned_reason}</div>` : ''}
      <div><b>Daftar:</b> ${new Date(user.created_at).toLocaleString('id-ID')}</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:6px">
      ${isBanned 
        ? `<button class="btn" style="background:#22c55e;color:white;flex:1" onclick="window.adminUnbanUser('${user.id}')">✅ Unban User</button>`
        : `<button class="btn" style="background:#ef4444;color:white;flex:1" onclick="window.adminBanUserPrompt('${user.id}')">🚫 Ban User</button>`
      }
      <button class="btn secondary" style="flex:1" onclick="window.adminViewUserWa('${user.hp}')">💬 WA</button>
    </div>
    <div style="margin-top:12px"><b style="font-size:12px">📦 ${orders.length} Order Terakhir</b><div style="max-height:120px;overflow:auto;font-size:11px;margin-top:4px">${orders.length? orders.map(o=>`<div style="padding:4px 0;border-bottom:1px solid var(--border)">${new Date(o.created_at).toLocaleDateString()} • ${o.status} • Rp${(o.total_fare||0).toLocaleString('id-ID')}</div>`).join('') : '<span class=muted>Tidak ada order</span>'}</div></div>
    ${reports.length? `<div style="margin-top:8px"><b style="font-size:12px">🚩 ${reports.length} Laporan</b><div style="font-size:11px">${reports.map(r=>`<div>${r.reason} - ${r.status}</div>`).join('')}</div></div>` : ''}
  `;
}

// ===== CONTROLLER - INIT ADMIN PAGE =====
export async function initAdminPage(){
  const stats = await getAdminStats();
  // update stat cards if exist
  const setText = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  setText('statTotal', stats.total);
  setText('statActive', stats.active);
  setText('statOffline', stats.offline);
  setText('statBanned', stats.banned);
  setText('statDrivers', stats.drivers);
  setText('statPassengers', stats.passengers);
  setText('statOrders', stats.ordersToday);

  const loadUsers = async ()=>{
    const filter = document.getElementById('adminFilter')?.value || 'all';
    const search = document.getElementById('adminSearch')?.value || '';
    const users = await getUsersList(filter, search);
    renderUserList(users);
  };
  const loadReports = async ()=>{
    const reports = await getReports();
    renderReports(reports);
  };

  await Promise.all([loadUsers(), loadReports()]);

  // Listeners
  document.getElementById('adminSearch')?.addEventListener('input', debounce(loadUsers, 400));
  document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', async ()=>{
    const s = await getAdminStats(); setText('statTotal', s.total); setText('statActive', s.active); setText('statOffline', s.offline); setText('statBanned', s.banned); setText('statDrivers', s.drivers); setText('statPassengers', s.passengers); setText('statOrders', s.ordersToday);
    await Promise.all([loadUsers(), loadReports()]);
  });

  // Global functions for inline onclick
  window.adminViewUser = async (id)=>{ await renderUserDetail(id); };
  window.adminBanUser = async (id)=>{
    const reason = prompt('Alasan ban user ini?', 'Pelanggaran kebijakan');
    if(reason===null) return;
    if(!confirm('Yakin ban user '+id+'?')) return;
    const ok = await banUser(id, reason);
    if(ok){ alert('User berhasil di-ban'); loadUsers(); loadReports(); const d=document.getElementById('adminUserDetail'); if(d&&d.style.display!=='none') renderUserDetail(id); }
  };
  window.adminBanUserPrompt = window.adminBanUser;
  window.adminUnbanUser = async (id)=>{
    if(!confirm('Yakin unban user ini?')) return;
    const ok = await unbanUser(id);
    if(ok){ alert('User berhasil di-unban'); loadUsers(); const d=document.getElementById('adminUserDetail'); if(d&&d.style.display!=='none') renderUserDetail(id); }
  };
  window.adminBanFromReport = async (userId, reportId)=>{
    const reason = prompt('Alasan ban dari laporan?', 'Laporan valid - pelanggaran');
    if(!reason) return;
    await banUser(userId, reason);
    await updateReportStatus(reportId, 'banned');
    alert('User di-ban dari laporan'); loadUsers(); loadReports();
  };
  window.adminReviewReport = async (reportId)=>{
    if(!confirm('Tandai laporan sebagai ditinjau/ditolak?')) return;
    await updateReportStatus(reportId, 'reviewed');
    loadReports();
  };
  window.adminViewUserWa = (hp)=>{
    if(!hp) return alert('No HP kosong');
    let clean = hp.replace(/[^0-9]/g,''); if(clean.startsWith('0')) clean='62'+clean.slice(1);
    window.open('https://wa.me/'+clean, '_blank');
  };
}

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

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
alter table users add column if not exists banned_reason text;
alter table users add column if not exists banned_at timestamptz;
create table if not exists banned_logs (id uuid primary key default gen_random_uuid(), user_id uuid references users(id), reason text, banned_by uuid references users(id), created_at timestamptz default now());
create table if not exists app_settings (id int primary key, settings jsonb, updated_at timestamptz default now());
-- RLS biar admin bisa akses
alter table reports enable row level security; create policy "allow all reports" on reports for all using (true) with check (true);
alter table banned_logs enable row level security; create policy "allow all banned_logs" on banned_logs for all using (true) with check (true);
alter table app_settings enable row level security; create policy "allow all app_settings" on app_settings for all using (true) with check (true);
`;

export function viewAdminSettings(s,p){ /* tetap pakai yang lama */ const { KECAMATAN_DATA } = require?.('./config.js') || {}; return `<div>Pakai viewAdminSettings dari file sebelumnya</div>`; }

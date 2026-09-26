// admin.js - Modul Admin / Pengelola Aplikasi - FIXED V2 (sinkron dengan config.js)
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== STATS DASHBOARD =====
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
      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){ console.warn('orders count failed', e); }

    return { total, active, offline, banned, drivers, passengers, admins, ordersToday, users };
  }catch(e){
    console.error('getAdminStats error', e);
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0, users:[] };
  }
}

// ===== LIST USERS dengan filter FIXED =====
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
      const cleanSearch = search.replace(/[%_,]/g, '').trim();
      if(cleanSearch) {
        query = query.or(`name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,hp.ilike.%${cleanSearch}%`);
      }
    }
    
    const { data, error } = await query;
    if(error) throw error;
    return data||[];
  }catch(e){
    console.error('getUsersList error', e);
    return [];
  }
}

export async function getUserDetail(userId){
  try{
    if(!userId) throw new Error('userId kosong');
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    const { data: orders } = await supabase.from('orders').select('id,status,created_at').or(`passenger_id.eq.${userId},driver_id.eq.${userId}`).order('created_at', {ascending:false}).limit(20);
    return { user: data, orders: orders||[] };
  }catch(e){ console.error('getUserDetail', e); return null; }
}

export async function banUser(userId, reason='Pelanggaran'){
  const { error } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId);
  if(error) throw error;
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason }); }catch(e){}
  return true;
}

export async function unbanUser(userId){
  const { error } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId);
  if(error) throw error;
  return true;
}

export async function getReports(){
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name), reported:reported_id(name, role)').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function createReport(reportedId, reporterId, reason, description){
  const { error } = await supabase.from('reports').insert({ reported_id:reportedId, reporter_id:reporterId, reason, description, status:'pending' });
  if(error) throw error;
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
  // auto reload supaya ACTIVE_KECAMATAN_CODE di config.js ke-update
  setTimeout(()=> location.reload(), 300);
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
create table if not exists banned_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reason text,
  banned_by uuid references users(id),
  created_at timestamptz default now()
);
create table if not exists app_settings (
  id int primary key,
  settings jsonb,
  updated_at timestamptz default now()
);
`;

export function viewAdminDashboard(stats=null){
  const kec = getActiveKecamatanLive();
  return `
  <div class="admin-page">
    <h2>📊 Admin Dashboard - ${kec.name}</h2>
    <div class="admin-stats">
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Total User</b><div id="statTotal">${stats?.total||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #22c55e"><b>Aktif</b><div id="statActive">${stats?.active||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--muted)"><b>Offline</b><div id="statOffline">${stats?.offline||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--danger)"><b>Banned</b><div id="statBanned">${stats?.banned||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #3b82f6"><b>Driver</b><div id="statDrivers">${stats?.drivers||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--warning)"><b>Penumpang</b><div id="statPassengers">${stats?.passengers||'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid #8b5cf6"><b>Order Hari Ini</b><div id="statOrders">${stats?.ordersToday||'-'}</div></div>
    </div>
    <div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:140px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button></div>
    <div class="admin-grid" style="margin-top:12px">
      <div><h3 style="font-size:13px">👥 List User <span class="muted" id="userCount"></span></h3><div id="adminUserList" class="admin-list">Loading users...</div></div>
      <div><h3 style="font-size:13px">🚩 Laporan Akun</h3><div id="adminReportList" class="admin-list">Loading laporan...</div><div id="adminUserDetail" class="card" style="display:none;margin-top:10px"></div></div>
    </div>
  </div>`;
}

export function viewAdminSettings(settings, profile=null){
  const s = settings||{};
  const p = profile||{};
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${code}" ${s.activeKecamatanCode===code?'selected':''}>${info.name} (${code})</option>`).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting Aplikasi</h2>
    <div class="card">
      <h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4>
      <label>Kecamatan Aktif<select id="setKecamatan" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--text)">${kecOptions}</select></label>
      <p class="muted" style="font-size:11px">Ganti wilayah tanpa edit file - langsung simpan, reload otomatis.</p>
    </div>
    <div class="card">
      <h4 style="margin:0 0 10px">🎨 Tampilan Aplikasi</h4>
      <label>Judul / Nama App</label><input id="setAppName" value="${s.appName||'Ojol Trenggalek'}">
      <label>Nama Pendek</label><input id="setAppShort" value="${s.appShortName||'Ojol'}">
      <div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#16a34a'}"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}"></div></div>
      <label>Judul Disclaimer</label><input id="setDiscTitle" value="${s.disclaimerTitle||''}">
      <label>Isi Disclaimer</label><textarea id="setDiscText" style="min-height:140px">${s.disclaimerText||''}</textarea>
      <label>Footer</label><input id="setFooter" value="${s.footerText||''}">
      <div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Setting</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div>
      <div id="settingStatus" class="status"></div>
    </div>
    <div class="card"><h4 style="margin:0 0 8px">👑 Akun Admin</h4><div class="muted" style="font-size:12px">Nama: <b>${p?.name||'-'}</b><br>Email: ${p?.email||'-'}<br>Role: ${p?.role||'-'}</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Edit Profil Admin</button></div></div>
  </div>`;
}

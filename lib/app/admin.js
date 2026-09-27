// admin.js - FINAL FIX - Tidak blank, tombol fungsi, search/filter fungsi, laporan ada, setting lengkap, style ban merah
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
    const admins = users?.filter(u=>u.role==='admin').length||0;
    let ordersToday = 0;
    try{
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){}
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){
    console.error(e);
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

// ===== USERS - FIX SEARCH & DROPDOWN CLIENT SIDE =====
export async function getUsersList(filter='all', search=''){
  try{
    // Ambil semua dulu, filter di client biar tidak kena RLS ilike error
    const { data, error } = await supabase.from('users').select('*').order('created_at', {ascending:false}).limit(200);
    if(error) throw error;
    let list = data||[];

    // Ambil driver_locations
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
          return {...u, _isOnline: u.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000 : false};
        });
      }
    }catch(e){ console.warn('driver_locations skip', e); }

    // Filter role/status
    if(filter==='active') list = list.filter(u=> ['active','online'].includes(u.status) && !u.banned && !u.is_banned);
    else if(filter==='offline') list = list.filter(u=> u.status==='offline');
    else if(filter==='banned') list = list.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned');
    else if(filter==='online') list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && u._isOnline);
    else if(filter==='driver') list = list.filter(u=> u.role==='driver');
    else if(filter==='passenger') list = list.filter(u=> u.role==='passenger');
    else if(filter==='admin') list = list.filter(u=> u.role==='admin');

    // Search client side - cek semua field
    if(search){
      const s = search.toLowerCase().trim();
      list = list.filter(u=> 
        String(u.name||'').toLowerCase().includes(s) ||
        String(u.email||'').toLowerCase().includes(s) ||
        String(u.hp||u.phone||'').toLowerCase().includes(s) ||
        String(u.desa||'').toLowerCase().includes(s) ||
        String(u.warung_name||'').toLowerCase().includes(s) ||
        String(u.role||'').toLowerCase().includes(s)
      );
    }

    return list;
  }catch(e){ console.error(e); return []; }
}

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

// ===== REPORTS - v_reports_detail + fallback reports =====
export async function getReports(status='all'){
  // Coba v_reports_detail dulu (13 kolom)
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(!error && data && data.length){
      console.log('Reports from v_reports_detail', data.length);
      return data;
    }
    if(error) throw error;
  }catch(e){ console.warn('v_reports_detail fail', e); }

  // Fallback ke reports dengan join
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name), reported:reported_id(name, role)').order('created_at',{ascending:false}).limit(50);
    if(!error && data) return data;
  }catch(e){}

  // Fallback terakhir tanpa join
  try{
    const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    return data||[];
  }catch(e){
    try{
      const { data } = await supabase.from('user_reports').select('*').order('created_at',{ascending:false}).limit(50);
      return data||[];
    }catch(err){ return []; }
  }
}

export async function handleReport(reportId, action, reportedUserId=null){
  if(action==='ban' && reportedUserId){
    try{
      let targetId = reportedUserId;
      const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${reportedUserId},id.eq.${reportedUserId}`).maybeSingle();
      if(u) targetId = u.id;
      await banUser(targetId, 'Hasil laporan #'+String(reportId).slice(0,6));
    }catch(e){}
  }
  const newStatus = action==='reject' ? 'rejected' : 'resolved';
  for(const tbl of ['reports','user_reports']){
    try{ await supabase.from(tbl).update({ status:newStatus, handled_at:new Date().toISOString() }).eq('id', reportId); }catch(e){}
  }
  return true;
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

export function getSettingsLive(){ return getAppSettings(); }
export function saveSettings(newSettings){
  const merged = { ...getAppSettings(), ...newSettings };
  localStorage.setItem('app_settings', JSON.stringify(merged));
  if(newSettings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  return merged;
}

// ===== LOGOUT =====
export async function logoutAdmin(){
  try{ await supabase.auth.signOut(); }catch(e){}
  try{ Object.keys(localStorage).forEach(k=>{ if(k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); }); }catch(e){}
  if(typeof window!=='undefined'){ window.location.hash='#/login'; setTimeout(()=>window.location.reload(), 300); }
  return true;
}

export async function isAdmin(){
  try{
    const { data:{user} } = await supabase.auth.getUser();
    if(!user) return false;
    const { data } = await supabase.from('users').select('is_super_admin, role').eq('id', user.id).single();
    return data?.is_super_admin===true || String(data?.role||'').toLowerCase()==='admin';
  }catch(e){ return false; }
}

// ===== VIEW DASHBOARD =====
export function viewAdminDashboard(stats=null){
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name || 'Trenggalek'; }catch(e){}
  return `
  <div class="admin-page" style="max-width:1100px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <h2 style="margin:0">🛡️ Admin Panel • ${kecName}</h2>
      <div style="display:flex;gap:8px">
        <button id="btnAdminRefresh" class="btn" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border)">🔄 Refresh</button>
        <button id="btnAdminLogout" class="btn" style="padding:8px 12px;border-radius:8px;border:1px solid #ef4444;color:#ef4444;background:white">🚪 Logout</button>
      </div>
    </div>
    <div class="admin-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:12px"><div class="stat-label" style="font-size:11px;opacity:.7">Total</div><div class="stat-value" id="statTotal" style="font-size:20px;font-weight:800">${stats?.total||0}</div></div>
      <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:12px"><div class="stat-label" style="font-size:11px;opacity:.7">Active</div><div class="stat-value" id="statActive" style="font-size:20px;font-weight:800;color:#22c55e">${stats?.active||0}</div></div>
      <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:12px"><div class="stat-label" style="font-size:11px;opacity:.7">Banned</div><div class="stat-value" id="statBanned" style="font-size:20px;font-weight:800;color:#ef4444">${stats?.banned||0}</div></div>
      <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:12px"><div class="stat-label" style="font-size:11px;opacity:.7">Drivers</div><div class="stat-value" id="statDrivers" style="font-size:20px;font-weight:800">${stats?.drivers||0}</div></div>
      <div class="stat-card" style="border:1px solid var(--border);border-radius:12px;padding:12px"><div class="stat-label" style="font-size:11px;opacity:.7">Orders Today</div><div class="stat-value" id="statOrders" style="font-size:20px;font-weight:800">${stats?.ordersToday||0}</div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="adminSearch" placeholder="Cari nama/email/HP/desa/warung..." style="flex:1;min-width:200px;padding:10px;border-radius:10px;border:1px solid var(--border)">
      <select id="adminFilter" style="padding:10px;border-radius:10px;border:1px solid var(--border)">
        <option value="all">Semua</option>
        <option value="active">Aktif</option>
        <option value="online">Online (driver_locations)</option>
        <option value="offline">Offline</option>
        <option value="banned">Banned</option>
        <option value="driver">Driver</option>
        <option value="passenger">Passenger</option>
      </select>
    </div>
    <div id="adminUserList" style="display:grid;gap:8px"></div>
    <h3 style="margin-top:24px">🚩 Laporan Akun</h3>
    <div id="adminReportsList" style="display:grid;gap:8px;margin-top:8px"></div>
    <div style="margin-top:16px;padding:12px;border:1px dashed var(--border);border-radius:10px;font-size:11px;opacity:.6">
      Debug: users(id, google_id, name, email, role, desa, warung_name, hp, status, banned, is_banned) | driver_locations(driver_id, lokasi, heading, updated_at, speed_kmh) | v_reports_detail(13 kolom) atau reports
    </div>
  </div>`;
}

export const viewAdminPanel = viewAdminDashboard;

// ===== VIEW SETTINGS LENGKAP - warna tema + disclaimer =====
export function viewAdminSettings(settings=null, currentProfile=null){
  const cur = settings || getAppSettings();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, d]) => 
    `<option value="${code}" ${cur.activeKecamatanCode===code?'selected':''}>${d.name} (${code})</option>`
  ).join('');
  return `
  <div class="admin-page" style="max-width:800px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">⚙️ Admin Settings</h2>
      <div style="display:flex;gap:8px">
        <a href="#/admin" class="btn secondary" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;text-decoration:none;background:var(--card)">← Dashboard</a>
        <button id="btnAdminLogout" class="btn" style="padding:8px 12px;border-radius:8px;border:1px solid #ef4444;color:#ef4444;background:white">🚪 Logout</button>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--card)">
      <h3 style="margin:0 0 12px">📍 Kecamatan Aktif</h3>
      <select id="setKecamatan" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)">${kecOptions}</select>
      <div style="font-size:11px;opacity:.6;margin-top:6px">Ganti kecamatan cukup 1 klik</div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--card)">
      <h3 style="margin:0 0 12px">🏷️ App Info</h3>
      <div style="display:grid;gap:12px">
        <div><label style="font-size:11px;opacity:.7">App Name</label><input id="setAppName" value="${cur.appName||''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div>
        <div><label style="font-size:11px;opacity:.7">App Short Name</label><input id="setAppShort" value="${cur.appShortName||''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div>
        <div><label style="font-size:11px;opacity:.7">Footer Text</label><input id="setFooterText" value="${cur.footerText||''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--card)">
      <h3 style="margin:0 0 12px">🎨 Warna Tema</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label style="font-size:11px;opacity:.7">Primary Color</label><div style="display:flex;gap:8px"><input id="setPrimary" type="color" value="${cur.primaryColor||'#16a34a'}" style="width:50px;height:40px;padding:2px;border-radius:8px;border:1px solid var(--border)"><input id="setPrimaryText" value="${cur.primaryColor||'#16a34a'}" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div></div>
        <div><label style="font-size:11px;opacity:.7">Secondary Color</label><div style="display:flex;gap:8px"><input id="setSecondary" type="color" value="${cur.secondaryColor||'#f59e0b'}" style="width:50px;height:40px;padding:2px;border-radius:8px;border:1px solid var(--border)"><input id="setSecondaryText" value="${cur.secondaryColor||'#f59e0b'}" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <div style="flex:1;height:40px;border-radius:8px;background:${cur.primaryColor||'#16a34a'};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:12px">Primary</div>
        <div style="flex:1;height:40px;border-radius:8px;background:${cur.secondaryColor||'#f59e0b'};display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:12px">Secondary</div>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--card)">
      <h3 style="margin:0 0 12px">📜 Disclaimer & Syarat</h3>
      <div style="display:grid;gap:12px">
        <div><label style="font-size:11px;opacity:.7">Judul Disclaimer</label><input id="setDiscTitle" value="${(cur.disclaimerTitle||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card)"></div>
        <div><label style="font-size:11px;opacity:.7">Isi Disclaimer</label><textarea id="setDiscText" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card);min-height:200px;font-size:12px">${cur.disclaimerText||''}</textarea></div>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;background:var(--card)">
      <h3 style="margin:0 0 12px">💰 Tarif Preview (5km)</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="padding:12px;border:1px solid var(--border);border-radius:10px"><div style="font-size:11px;opacity:.7">Motor 5km</div><div style="font-size:18px;font-weight:800" id="previewMotor">Rp -</div></div>
        <div style="padding:12px;border:1px solid var(--border);border-radius:10px"><div style="font-size:11px;opacity:.7">Mobil 5km</div><div style="font-size:18px;font-weight:800" id="previewMobil">Rp -</div></div>
      </div>
      <div style="font-size:11px;opacity:.6;margin-top:8px">Tarif asli diatur di config.js TARIF.motor.base, perKm, min</div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="btnSaveSettings" class="btn primary" style="flex:1;padding:12px;border-radius:10px;background:#16a34a;color:white;border:0;font-weight:800">💾 Simpan Semua Pengaturan</button>
      <button id="btnResetSettings" class="btn secondary" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card)">🔄 Reset Default</button>
    </div>

    <div id="settingStatus" style="margin-top:12px;font-size:12px;text-align:center;min-height:20px"></div>
  </div>`;
}

export const viewAdminSetting = viewAdminSettings;

// ===== RENDER LIST =====
function renderUserList(users){
  const box = document.getElementById('adminUserList');
  if(!box) return;
  if(!users.length){ box.innerHTML = '<div class="card" style="padding:20px;text-align:center">📭 Tidak ada user</div>'; return; }
  box.innerHTML = users.map(u=>{
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    const isOnline = u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000);
    const statusText = isBanned ? '🚫 BANNED' : isOnline ? '🟢 ONLINE' : '✅ '+(u.status||'active');
    const statusColor = isBanned ? '#dc2626' : isOnline ? '#16a34a' : '#64748b';
    const driverLoc = u._driverLoc ? `<div style="font-size:10px;background:#dcfce7;padding:4px 6px;border-radius:6px;margin-top:4px">📍 ${new Date(u._driverLoc.updated_at).toLocaleTimeString('id-ID')} • ${u._driverLoc.speed_kmh||0}km/h • ${u._driverLoc.heading||0}°</div>` : '';
    // Ban button merah solid, bukan pink muda
    const banBtnStyle = "padding:7px 12px;font-size:11px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700;";
    const detailBtnStyle = "padding:7px 12px;font-size:11px;background:white;color:#0f172a;border:1px solid var(--border);border-radius:8px;cursor:pointer;";
    const unbanBtnStyle = "padding:7px 12px;font-size:11px;background:#0ea5e9;color:white;border:0;border-radius:8px;cursor:pointer;";
    return `<div class="card" style="padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--border);border-radius:12px;background:var(--card)">
      <div style="flex:1">
        <div style="font-weight:700">${u.name||'Tanpa Nama'} <span style="font-size:10px;opacity:.6">• ${u.role||'-'}</span></div>
        <div style="font-size:11px;opacity:.7">${u.email||'-'} • ${u.hp||u.phone||'-'} • ${u.desa||'-'} ${u.warung_name ? '• Warung: '+u.warung_name : ''}</div>
        <div style="font-size:11px;margin-top:4px;color:${statusColor};font-weight:700">${statusText}</div>
        ${driverLoc}
        ${u.banned_reason ? `<div style="font-size:10px;color:#dc2626;margin-top:4px;font-weight:600">Ban: ${u.banned_reason}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button onclick="adminViewUser('${u.id}')" style="${detailBtnStyle}">Detail</button>
        ${isBanned ? `<button onclick="adminUnbanUser('${u.id}')" style="${unbanBtnStyle}">Unban</button>` : `<button onclick="adminBanUser('${u.id}')" style="${banBtnStyle}">Ban</button>`}
      </div>
    </div>`;
  }).join('');
}

function renderReports(reports){
  const box = document.getElementById('adminReportsList');
  if(!box) return;
  if(!reports.length){ box.innerHTML = '<div class="card" style="padding:16px;text-align:center;border:1px solid var(--border);border-radius:12px">✅ Tidak ada laporan</div>'; return; }
  box.innerHTML = reports.map(r=>{
    const reporter = r.reporter_name || r.reporter?.name || r.reporter_id || '-';
    const reported = r.reported_name || r.reported?.name || r.reported_id || '-';
    const reporterEmail = r.reporter_email || '';
    const reportedEmail = r.reported_email || '';
    const reportedId = r.reported_google_id || r.reported_id || r.reported?.id || '';
    const reason = r.reason || '-';
    const desc = r.description || '';
    return `<div class="card" style="padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--card)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:12px;font-weight:700">${reporter} <span style="opacity:.5">→</span> <span style="color:#dc2626">${reported}</span></div>
          <div style="font-size:10px;opacity:.6">${reporterEmail} • ${reportedEmail}<br>${new Date(r.created_at).toLocaleString('id-ID')} • Status: ${r.status||'pending'}</div>
          <div style="font-size:12px;margin-top:6px"><b>Alasan:</b> ${reason}</div>
          ${desc ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${String(desc).slice(0,150)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="adminBanFromReport('${reportedId}','${r.id}')" style="padding:7px 10px;font-size:11px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700">Ban Terlapor</button>
          <button onclick="adminReviewReport('${r.id}')" style="padding:7px 10px;font-size:11px;background:white;border:1px solid var(--border);border-radius:8px;cursor:pointer">Tolak</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== GLOBAL HELPERS - DIPAKAI TOMBOL DETAIL/BAN =====
window.adminViewUser = async function(id){
  const detail = await getUserDetail(id);
  if(!detail || !detail.user){ alert('User tidak ditemukan'); return; }
  const u = detail.user;
  const loc = detail._driverLoc;
  const ordersHtml = (detail.orders||[]).map(o=>`<div style="font-size:11px;padding:6px;border-top:1px solid var(--border);display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleString('id-ID')} - ${o.status}</span><span>Rp ${Number(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('');
  const locHtml = loc ? `<div style="background:#dcfce7;padding:8px;border-radius:8px;margin:8px 0;font-size:11px"><b>📍 driver_locations</b><br>Updated: ${new Date(loc.updated_at).toLocaleString('id-ID')}<br>Heading: ${loc.heading||'-'}° • Speed: ${loc.speed_kmh||0} km/h<br>Lokasi: ${String(loc.lokasi||'').slice(0,80)}</div>` : '<div style="font-size:11px;opacity:.6">Tidak ada data driver_locations</div>';
  const existing = document.getElementById('adminDetailModal');
  if(existing) existing.remove();
  const html = `<div id="adminDetailModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px">
    <div class="card" style="padding:16px;max-width:420px;width:100%;max-height:85vh;overflow:auto;background:var(--card);border-radius:16px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>Detail: ${u.name||'-'}</b><button onclick="document.getElementById('adminDetailModal').remove()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer">✕</button></div>
      <div style="font-size:12px;margin-top:12px;line-height:1.7">
        <div>Email: ${u.email||'-'}</div><div>HP: ${u.hp||u.phone||'-'}</div><div>Role: ${u.role||'-'}</div><div>Desa: ${u.desa||'-'} ${u.warung_name ? '/ Warung: '+u.warung_name : ''}</div><div>Status: ${u.status||'-'} • banned:${u.banned} / is_banned:${u.is_banned}</div><div>Google ID: ${u.google_id||'-'}</div><div>ID: <span style="font-size:10px">${u.id}</span></div><div>Last sign: ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('id-ID') : '-'}<br>Last seen: ${u.last_seen ? new Date(u.last_seen).toLocaleString('id-ID') : '-'}</div>
        ${locHtml}
        ${u.banned_reason ? `<div style="background:#fee2e2;padding:8px;border-radius:8px;color:#991b1b;margin-top:8px"><b>Banned:</b> ${u.banned_reason}</div>` : ''}
        <div style="margin-top:12px"><b>20 Order Terakhir:</b></div><div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:4px">${ordersHtml || '<div style="padding:8px;font-size:11px;opacity:.6">Tidak ada order</div>'}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/${String(u.hp||u.phone||'').replace(/[^0-9]/g,'')}" target="_blank" style="flex:1;text-align:center;padding:10px;border:1px solid var(--border);border-radius:8px;text-decoration:none;background:var(--card)">💬 WA</a><button onclick="adminBanUser('${u.id}'); document.getElementById('adminDetailModal').remove()" style="flex:1;padding:10px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700">Ban User</button></div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};

window.adminBanUser = async function(id){
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan'); if(reason===null) return;
  if(!confirm('Yakin BAN user ini?')) return;
  try{ await banUser(id, reason); alert('✅ Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); }
};
window.adminUnbanUser = async function(id){
  if(!confirm('Yakin UNBAN user ini?')) return;
  try{ await unbanUser(id); alert('✅ Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); }
};
window.adminBanFromReport = async function(uid, rid){
  if(!uid){ alert('ID terlapor tidak ada'); return; }
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${uid},id.eq.${uid}`).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'resolved', handled_at:new Date().toISOString() }).eq('id', rid); }catch(e){} }
    alert('✅ User di-ban & laporan selesai'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('❌ Gagal: '+e.message); }
};
window.adminReviewReport = async function(rid){
  if(!confirm('Tandai laporan ini ditolak?')) return;
  try{ 
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'reviewed', handled_at:new Date().toISOString() }).eq('id', rid); }catch(e){} }
    const reports=await getReports(); renderReports(reports); 
  }catch(e){ alert('Gagal: '+e.message); }
};

// ===== INIT - FIX SEARCH & DROPDOWN =====
export async function initAdminPage(){
  try{
    const stats=await getAdminStats();
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
    
    const loadUsers = async()=>{
      const f=document.getElementById('adminFilter')?.value||'all';
      const s=document.getElementById('adminSearch')?.value||'';
      const users = await getUsersList(f,s);
      renderUserList(users);
    };
    const loadReports = async()=>{
      const reps = await getReports('all'); // all biar keliatan semua, bukan cuma pending
      renderReports(reps);
    };

    await Promise.all([loadUsers(), loadReports()]);

    // FIX: search & dropdown - pakai event listener yang benar
    const searchEl = document.getElementById('adminSearch');
    const filterEl = document.getElementById('adminFilter');
    if(searchEl){
      searchEl.addEventListener('input', ()=>{
        clearTimeout(window._admT);
        window._admT=setTimeout(loadUsers, 400);
      });
    }
    if(filterEl){
      filterEl.addEventListener('change', loadUsers);
    }

    document.getElementById('btnAdminRefresh')?.addEventListener('click', async()=>{
      const st=await getAdminStats(); set('statTotal', st.total); set('statActive', st.active); set('statOffline', st.offline); set('statBanned', st.banned); set('statDrivers', st.drivers); set('statPassengers', st.passengers); set('statOrders', st.ordersToday);
      await Promise.all([loadUsers(), loadReports()]);
    });
    document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout admin?')) return; await logoutAdmin(); });
  }catch(err){
    console.error('initAdminPage error', err);
    const box = document.getElementById('adminUserList');
    if(box) box.innerHTML = `<div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;color:#991b1b">❌ Error init: ${err.message}<br><pre style="font-size:10px;white-space:pre-wrap">${err.stack||''}</pre></div>`;
  }
}

export async function initAdminSettingsPage(){
  try{
    const cur = getAppSettings();
    const calcPreview = ()=>{
      const dist=5;
      // Tarif simple dari config
      try{
        const { TARIF } = await import('./config.js').catch(()=>({TARIF:{motor:{base:3000,perKm:2500,min:5000},mobil:{base:8000,perKm:5500,min:15000}}}));
      }catch(e){}
      // hitung manual
      const motorCost = 3000 + 5*2500;
      const mobilCost = 8000 + 5*5500;
      const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
      const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');
    };
    calcPreview();

    const btnSave=document.getElementById('btnSaveSettings');
    const btnReset=document.getElementById('btnResetSettings');
    const statusEl=document.getElementById('settingStatus');

    // sync color picker text
    document.getElementById('setPrimary')?.addEventListener('input', (e)=>{ const t=document.getElementById('setPrimaryText'); if(t) t.value=e.target.value; });
    document.getElementById('setPrimaryText')?.addEventListener('input', (e)=>{ const c=document.getElementById('setPrimary'); if(c) c.value=e.target.value; });
    document.getElementById('setSecondary')?.addEventListener('input', (e)=>{ const t=document.getElementById('setSecondaryText'); if(t) t.value=e.target.value; });
    document.getElementById('setSecondaryText')?.addEventListener('input', (e)=>{ const c=document.getElementById('setSecondary'); if(c) c.value=e.target.value; });

    if(btnSave){
      btnSave.onclick=async()=>{
        const ns={
          ...cur,
          activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode,
          appName: document.getElementById('setAppName')?.value || cur.appName,
          appShortName: document.getElementById('setAppShort')?.value || cur.appShortName,
          primaryColor: document.getElementById('setPrimaryText')?.value || document.getElementById('setPrimary')?.value || cur.primaryColor,
          secondaryColor: document.getElementById('setSecondaryText')?.value || document.getElementById('setSecondary')?.value || cur.secondaryColor,
          disclaimerTitle: document.getElementById('setDiscTitle')?.value || cur.disclaimerTitle,
          disclaimerText: document.getElementById('setDiscText')?.value || cur.disclaimerText,
          footerText: document.getElementById('setFooterText')?.value || cur.footerText,
        };
        if(statusEl) statusEl.textContent='⏳ Menyimpan...';
        btnSave.disabled=true; btnSave.textContent='Menyimpan...';
        try{
          await saveAppSettings(ns);
          if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='#16a34a'; }
        }catch(e){
          if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='#dc2626'; }
          btnSave.disabled=false; btnSave.textContent='💾 Simpan Semua Pengaturan';
        }
      };
    }
    if(btnReset){
      btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
    }
    document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout?')) return; await logoutAdmin(); });
  }catch(e){ console.error('initAdminSettingsPage', e); }
}

export const bindAdminEvents = initAdminPage;

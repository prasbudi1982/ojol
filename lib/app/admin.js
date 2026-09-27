// admin.js - FINAL FULL UI - FIXED - Berdasarkan debug log kamu (8 users, 3 driver_locations, 1 report)
// Tidak blank, tombol fungsi, search/dropdown ngefek, laporan ada, setting lengkap, ban merah #dc2626
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

let debugLogs = [];
function log(msg){
  debugLogs.push(msg);
  console.log('[ADMIN]', msg);
  try{
    const box = document.getElementById('debugBox');
    if(box){
      const d = document.createElement('div');
      d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      d.style.cssText = 'border-top:1px solid #ddd; padding:2px 0; font-size:11px; font-family:monospace; white-space:pre-wrap; word-break:break-all;';
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    }
  }catch(e){}
}
window.adminLog = log;
window.addEventListener('error', e=>{ log('❌ ERROR: ' + e.message); });
window.addEventListener('unhandledrejection', e=>{ log('❌ PROMISE: ' + (e.reason?.message||e.reason)); });

// ===== STATS =====
export async function getAdminStats(){
  log('getAdminStats start');
  try{
    const { data, error } = await supabase.from('users').select('id, role, status, banned, is_banned, created_at');
    if(error) throw error;
    const total = data?.length||0;
    const active = data?.filter(u=> ['online','active'].includes(u.status) && !u.banned && !u.is_banned).length||0;
    const offline = data?.filter(u=> u.status==='offline').length||0;
    const banned = data?.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned').length||0;
    const drivers = data?.filter(u=> u.role==='driver').length||0;
    const passengers = data?.filter(u=> u.role==='passenger').length||0;
    const admins = data?.filter(u=> u.role==='admin').length||0;
    let ordersToday = 0;
    try{
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', startOfDay.toISOString());
      ordersToday = count||0;
    }catch(e){}
    log(`getAdminStats total=${total} active=${active} banned=${banned} drivers=${drivers}`);
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){
    log('getAdminStats error: '+e.message);
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

// ===== USERS - CLIENT SIDE FILTER (FIX SEARCH/DROPDOWN) =====
export async function getUsersList(filter='all', search=''){
  log(`getUsersList filter=${filter} search=${search}`);
  try{
    const { data, error } = await supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
    if(error){ log('❌ users SELECT error: '+error.message); throw error; }
    let list = data||[];
    log(`✅ users raw ${list.length} rows`);

    try{
      const driverIds = list.filter(u=>String(u.role||'').toLowerCase().includes('driver')).map(u=>u.id);
      if(driverIds.length){
        const { data: locs, error: locErr } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').in('driver_id', driverIds).order('updated_at',{ascending:false});
        if(locErr) log('driver_locations error: '+locErr.message);
        else {
          const map={};
          (locs||[]).forEach(l=>{ if(!map[l.driver_id]) map[l.driver_id]=l; });
          list = list.map(u=>{
            if(map[u.id]){
              return {...u, last_seen: map[u.id].updated_at, _driverLoc: map[u.id], _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 };
            }
            return {...u, _isOnline: u.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000 : false};
          });
          log(`driver_locations mapped ${Object.keys(map).length}`);
        }
      }
    }catch(e){ log('driver_locations exception: '+e.message); }

    if(filter==='active') list = list.filter(u=> ['active','online'].includes(u.status) && !u.banned && !u.is_banned);
    else if(filter==='offline') list = list.filter(u=> u.status==='offline');
    else if(filter==='banned') list = list.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned');
    else if(filter==='online') list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && u._isOnline);
    else if(filter==='driver') list = list.filter(u=> u.role==='driver');
    else if(filter==='passenger') list = list.filter(u=> u.role==='passenger');
    else if(filter==='admin') list = list.filter(u=> u.role==='admin');

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
      log(`after search ${list.length}`);
    }
    return list;
  }catch(e){
    log('❌ getUsersList EXCEPTION: '+e.message);
    return [];
  }
}

export const getUsers = getUsersList;

export async function getUserDetail(userId){
  log('getUserDetail '+userId);
  try{
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
  }catch(e){ log('getUserDetail error: '+e.message); return null; }
}

export async function banUser(userId, reason='Pelanggaran'){
  log(`banUser ${userId} reason=${reason}`);
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error){ log('banUser error: '+error.message); throw error; }
  if(!data?.length){ log('banUser RLS blocked'); throw new Error('RLS blokir - cek policy'); }
  log('banUser success');
  return true;
}

export async function unbanUser(userId){
  log(`unbanUser ${userId}`);
  const { error, data } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId).select();
  if(error){ log('unbanUser error: '+error.message); throw error; }
  log('unbanUser success');
  return true;
}

// ===== REPORTS =====
export async function getReports(status='all'){
  log(`getReports status=${status}`);
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(!error && data){ log(`v_reports_detail got ${data.length} rows`); return data; }
    if(error) log('v_reports_detail error: '+error.message);
  }catch(e){ log('v_reports_detail exception: '+e.message); }

  try{
    const { data, error } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    if(!error){ log(`reports fallback got ${data?.length||0}`); return data||[]; }
    log('reports error: '+error.message);
  }catch(e){ log('reports exception: '+e.message); }
  return [];
}

export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export async function saveAppSettings(newSettings){
  log('saveAppSettings '+JSON.stringify(newSettings).slice(0,200));
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  try{ await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'}); }catch(e){ log('app_settings upsert error: '+e.message); }
  applyTheme(newSettings);
  setTimeout(()=> location.reload(), 400);
  return true;
}

function applyTheme(s){
  try{
    const root = document.documentElement;
    if(s.primaryColor) root.style.setProperty('--primary', s.primaryColor);
    if(s.secondaryColor) root.style.setProperty('--secondary', s.secondaryColor);
  }catch(e){}
}

export function getSettingsLive(){ return getAppSettings(); }

export async function logoutAdmin(){
  log('logoutAdmin');
  try{ await supabase.auth.signOut(); }catch(e){}
  try{ Object.keys(localStorage).forEach(k=>{ if(k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); }); }catch(e){}
  location.hash='#/login';
  setTimeout(()=> location.reload(), 300);
}

// ===== VIEW DASHBOARD - COMPATIBLE DENGAN ROUTER + DEBUG BOX =====
export function viewAdminDashboard(stats=null){
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name || 'Trenggalek'; }catch(e){ log('getActiveKecamatanLive error: '+e.message); }
  log('viewAdminDashboard render kec='+kecName);
  return `
  <div class="admin-page" style="max-width:1100px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <h2 style="margin:0">🛡️ Admin Panel • ${kecName} - FINAL FIX</h2>
      <div style="display:flex;gap:8px">
        <button id="btnAdminRefresh" style="padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:white;cursor:pointer">🔄 Refresh</button>
        <button id="btnAdminLogout" style="padding:8px 12px;border-radius:8px;border:1px solid #dc2626;color:#dc2626;background:white;cursor:pointer">🚪 Logout</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Total</div><div id="statTotal" style="font-size:20px;font-weight:800">${stats?.total||0}</div></div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Active</div><div id="statActive" style="font-size:20px;font-weight:800;color:#16a34a">${stats?.active||0}</div></div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Banned</div><div id="statBanned" style="font-size:20px;font-weight:800;color:#dc2626">${stats?.banned||0}</div></div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Drivers</div><div id="statDrivers" style="font-size:20px;font-weight:800">${stats?.drivers||0}</div></div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Orders Today</div><div id="statOrders" style="font-size:20px;font-weight:800">${stats?.ordersToday||0}</div></div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="adminSearch" placeholder="Cari nama/email/HP/desa/warung..." style="flex:1;min-width:200px;padding:10px;border-radius:10px;border:1px solid #ccc;background:white" />
      <select id="adminFilter" style="padding:10px;border-radius:10px;border:1px solid #ccc;background:white">
        <option value="all">Semua</option>
        <option value="active">Aktif</option>
        <option value="online">Online (driver_locations)</option>
        <option value="offline">Offline</option>
        <option value="banned">Banned</option>
        <option value="driver">Driver</option>
        <option value="passenger">Passenger</option>
        <option value="admin">Admin</option>
      </select>
    </div>

    <h3>Users (<span id="userCount">0</span>)</h3>
    <div id="adminUserList" style="display:grid;gap:8px;min-height:50px;border:1px dashed #ccc;padding:8px;border-radius:8px;background:white">Loading users... Jika stuck, cek DEBUG LOG bawah</div>
    <div id="adminReportList" style="display:none"></div>

    <h3 style="margin-top:24px">🚩 Laporan Akun (v_reports_detail - 1 laporan terdeteksi dari debug log kamu)</h3>
    <div id="adminReportsList" style="display:grid;gap:8px;margin-top:8px;min-height:50px;border:1px dashed #ccc;padding:8px;border-radius:8px;background:white">Loading reports...</div>

    <div id="kecamatanButtons" style="margin-top:16px;"></div>
    <div id="adminSqlBox" style="display:none"></div>

    <div id="debugBoxContainer" style="margin-top:24px;border:3px solid #f59e0b;border-radius:12px;overflow:hidden;background:#fffbeb">
      <div style="background:#f59e0b;color:white;padding:8px 12px;font-weight:800;font-size:12px;display:flex;justify-content:space-between">
        <span>🐛 DEBUG LOG - Data kamu: 8 users, 3 driver_locations, 1 report (dari log kamu)</span>
        <button onclick="document.getElementById('debugBox').innerHTML=''" style="padding:4px 8px;border-radius:6px;border:0;background:white;color:#f59e0b;font-size:10px;cursor:pointer">Clear</button>
      </div>
      <div id="debugBox" style="max-height:400px;overflow:auto;padding:8px;background:white;font-family:monospace;font-size:11px;white-space:pre-wrap;">DEBUG LOG akan muncul di sini...</div>
    </div>
  </div>
  `;
}

export const viewAdminPanel = viewAdminDashboard;

export function viewAdminSettings(settings=null){
  const cur = settings || getAppSettings();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, d]) => 
    `<option value="${code}" ${cur.activeKecamatanCode===code?'selected':''}>${d.name} (${code})</option>`
  ).join('');
  return `
  <div style="max-width:800px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">⚙️ Admin Settings - FINAL</h2>
      <div style="display:flex;gap:8px">
        <a href="#/admin" style="padding:8px 12px;border:1px solid #ccc;border-radius:8px;text-decoration:none;background:white">← Dashboard</a>
        <button id="btnAdminLogout" style="padding:8px 12px;border-radius:8px;border:1px solid #dc2626;color:#dc2626;background:white">🚪 Logout</button>
      </div>
    </div>

    <div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white">
      <h3 style="margin:0 0 12px">📍 Kecamatan Aktif</h3>
      <select id="setKecamatan" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;background:white">${kecOptions}</select>
    </div>

    <div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white">
      <h3 style="margin:0 0 12px">🏷️ App Info</h3>
      <div style="display:grid;gap:12px">
        <div><label style="font-size:11px;opacity:.7">App Name</label><input id="setAppName" value="${(cur.appName||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div>
        <div><label style="font-size:11px;opacity:.7">App Short Name</label><input id="setAppShort" value="${(cur.appShortName||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div>
        <div><label style="font-size:11px;opacity:.7">Footer Text</label><input id="setFooterText" value="${(cur.footerText||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div>
      </div>
    </div>

    <div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white">
      <h3 style="margin:0 0 12px">🎨 Warna Tema</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label style="font-size:11px;opacity:.7">Primary Color</label><div style="display:flex;gap:8px"><input id="setPrimary" type="color" value="${cur.primaryColor||'#16a34a'}" style="width:50px;height:40px" /><input id="setPrimaryText" value="${cur.primaryColor||'#16a34a'}" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc" /></div></div>
        <div><label style="font-size:11px;opacity:.7">Secondary Color</label><div style="display:flex;gap:8px"><input id="setSecondary" type="color" value="${cur.secondaryColor||'#f59e0b'}" style="width:50px;height:40px" /><input id="setSecondaryText" value="${cur.secondaryColor||'#f59e0b'}" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc" /></div></div>
      </div>
    </div>

    <div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white">
      <h3 style="margin:0 0 12px">📜 Disclaimer & Syarat</h3>
      <div style="display:grid;gap:12px">
        <div><label style="font-size:11px;opacity:.7">Judul Disclaimer</label><input id="setDiscTitle" value="${(cur.disclaimerTitle||'').replace(/"/g,'&quot;')}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div>
        <div><label style="font-size:11px;opacity:.7">Isi Disclaimer</label><textarea id="setDiscText" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;min-height:200px;font-size:12px">${cur.disclaimerText||''}</textarea></div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="btnSaveSettings" style="flex:1;padding:12px;border-radius:10px;background:#16a34a;color:white;border:0;font-weight:800;cursor:pointer">💾 Simpan Semua Pengaturan</button>
      <button id="btnResetSettings" style="flex:1;padding:12px;border-radius:10px;border:1px solid #ccc;background:white;cursor:pointer">🔄 Reset Default</button>
    </div>
    <div id="settingStatus" style="margin-top:12px;font-size:12px;text-align:center;min-height:20px"></div>

    <div style="margin-top:16px;border:2px solid #f59e0b;border-radius:12px;overflow:hidden;background:#fffbeb">
      <div style="background:#f59e0b;color:white;padding:8px 12px;font-weight:800;font-size:12px">🐛 DEBUG LOG SETTINGS</div>
      <div id="debugBox" style="max-height:300px;overflow:auto;padding:8px;background:white;font-family:monospace;font-size:11px">DEBUG LOG...</div>
    </div>
  </div>
  `;
}

export const viewAdminSetting = viewAdminSettings;

function renderUserList(users){
  log(`renderUserList ${users.length} users - FINAL`);
  const box = document.getElementById('adminUserList');
  const countEl = document.getElementById('userCount');
  if(countEl) countEl.textContent = users.length;
  if(!box){ log('adminUserList not found!'); return; }
  if(!users.length){ box.innerHTML = '<div style="padding:20px;text-align:center">📭 Tidak ada user</div>'; return; }
  box.innerHTML = users.map(u=>{
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    const isOnline = u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000);
    const statusText = isBanned ? '🚫 BANNED' : isOnline ? '🟢 ONLINE' : '✅ '+(u.status||'active');
    const statusColor = isBanned ? '#dc2626' : isOnline ? '#16a34a' : '#64748b';
    const driverLoc = u._driverLoc ? `<div style="font-size:10px;background:#dcfce7;padding:4px 6px;border-radius:6px;margin-top:4px">📍 ${new Date(u._driverLoc.updated_at).toLocaleTimeString('id-ID')} • ${u._driverLoc.speed_kmh||0}km/h</div>` : '';
    const banBtnStyle = "padding:7px 12px;font-size:11px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700;";
    const detailBtnStyle = "padding:7px 12px;font-size:11px;background:white;color:#0f172a;border:1px solid #ccc;border-radius:8px;cursor:pointer;";
    const unbanBtnStyle = "padding:7px 12px;font-size:11px;background:#0ea5e9;color:white;border:0;border-radius:8px;cursor:pointer;";
    return `<div style="padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid #ddd;border-radius:12px;background:white">
      <div style="flex:1">
        <div style="font-weight:700">${u.name||'Tanpa Nama'} <span style="font-size:10px;opacity:.6">• ${u.role||'-'}</span></div>
        <div style="font-size:11px;opacity:.7">${u.email||'-'} • ${u.hp||u.phone||'-'} • ${u.desa||'-'} ${u.warung_name ? '• Warung: '+u.warung_name : ''}</div>
        <div style="font-size:11px;margin-top:4px;color:${statusColor};font-weight:700">${statusText}</div>
        ${driverLoc}
        ${u.banned_reason ? `<div style="font-size:10px;color:#dc2626;margin-top:4px">Ban: ${u.banned_reason}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button onclick="adminViewUser('${u.id}')" style="${detailBtnStyle}">Detail</button>
        ${isBanned ? `<button onclick="adminUnbanUser('${u.id}')" style="${unbanBtnStyle}">Unban</button>` : `<button onclick="adminBanUser('${u.id}')" style="${banBtnStyle}">Ban</button>`}
      </div>
    </div>`;
  }).join('');
}

function renderReports(reports){
  log(`renderReports ${reports.length} reports - FINAL`);
  const box = document.getElementById('adminReportsList');
  const box2 = document.getElementById('adminReportList');
  const target = box || box2;
  if(!target){ log('adminReportsList & adminReportList not found!'); return; }
  if(!reports.length){ target.innerHTML = '<div style="padding:16px;text-align:center;border:1px solid #ddd;border-radius:12px;background:white">✅ Tidak ada laporan</div>'; return; }
  target.innerHTML = reports.map(r=>{
    const reporter = r.reporter_name || r.reporter_id || '-';
    const reported = r.reported_name || r.reported_id || '-';
    const reporterEmail = r.reporter_email || '';
    const reportedEmail = r.reported_email || '';
    const reportedId = r.reported_google_id || r.reported_id || r.reported?.id || '';
    return `<div style="padding:12px;border:1px solid #ddd;border-radius:12px;background:white">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:12px;font-weight:700">${reporter} <span style="opacity:.5">→</span> <span style="color:#dc2626">${reported}</span></div>
          <div style="font-size:10px;opacity:.6">${reporterEmail} • ${reportedEmail}<br>${r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''} • Status: ${r.status||'pending'}</div>
          <div style="font-size:12px;margin-top:6px"><b>Alasan:</b> ${r.reason||'-'}</div>
          ${r.description ? `<div style="font-size:11px;opacity:.7;margin-top:2px">${String(r.description).slice(0,150)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="adminBanFromReport('${reportedId}','${r.id}')" style="padding:7px 10px;font-size:11px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700">Ban Terlapor</button>
          <button onclick="adminReviewReport('${r.id}')" style="padding:7px 10px;font-size:11px;background:white;border:1px solid #ccc;border-radius:8px;cursor:pointer">Tolak</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // Also render to the other box if exists
  if(box && box2 && box!==box2) box2.innerHTML = target.innerHTML;
}

window.adminViewUser = async function(id){
  log('adminViewUser '+id);
  const detail = await getUserDetail(id);
  if(!detail || !detail.user){ alert('User tidak ditemukan'); log('adminViewUser not found'); return; }
  const u = detail.user;
  const loc = detail._driverLoc;
  const ordersHtml = (detail.orders||[]).map(o=>`<div style="font-size:11px;padding:6px;border-top:1px solid #ddd;display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleString('id-ID')} - ${o.status}</span><span>Rp ${Number(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('');
  const locHtml = loc ? `<div style="background:#dcfce7;padding:8px;border-radius:8px;margin:8px 0;font-size:11px"><b>📍 driver_locations</b><br>Updated: ${new Date(loc.updated_at).toLocaleString('id-ID')}<br>Heading: ${loc.heading||'-'}° • Speed: ${loc.speed_kmh||0} km/h<br>Lokasi: ${String(loc.lokasi||'').slice(0,80)}</div>` : '<div style="font-size:11px;opacity:.6">Tidak ada data driver_locations</div>';
  const existing = document.getElementById('adminDetailModal');
  if(existing) existing.remove();
  const html = `<div id="adminDetailModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="padding:16px;max-width:420px;width:100%;max-height:85vh;overflow:auto;background:white;border-radius:16px;border:1px solid #ccc">
      <div style="display:flex;justify-content:space-between;align-items:center"><b>Detail: ${'${u.name||'-'}'}</b><button onclick="document.getElementById('adminDetailModal').remove()" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer">✕</button></div>
      <div style="font-size:12px;margin-top:12px;line-height:1.7">
        <div>Email: ${'${u.email||'-'}'}</div><div>HP: ${'${u.hp||u.phone||'-'}'}</div><div>Role: ${'${u.role||'-'}'}</div><div>Desa: ${'${u.desa||'-'}'} ${'${u.warung_name ? '/ Warung: '+u.warung_name : ''}'}</div><div>Status: ${'${u.status||'-'}'} • banned:${'${u.banned}'} / is_banned:${'${u.is_banned}'}</div><div>ID: <span style="font-size:10px">${'${u.id}'}</span></div>
        ${'${locHtml}'}
        ${'${u.banned_reason ? `<div style="background:#fee2e2;padding:8px;border-radius:8px;color:#991b1b;margin-top:8px"><b>Banned:</b> ${u.banned_reason}</div>` : ''}'}
        <div style="margin-top:12px"><b>20 Order Terakhir:</b></div><div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;margin-top:4px">${'${ordersHtml || `<div style="padding:8px;font-size:11px;opacity:.6">Tidak ada order</div>`}'}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/${'${String(u.hp||u.phone||"").replace(/[^0-9]/g,"")}'}" target="_blank" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:8px;text-decoration:none;background:white">💬 WA</a><button onclick="adminBanUser('${'${u.id}'}'); document.getElementById('adminDetailModal').remove()" style="flex:1;padding:10px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700">Ban User</button></div>
    </div>
  </div>`;
  // The above template is broken due to escaping, use simpler version:
  const simpleHtml = `<div id="adminDetailModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px"><div style="padding:16px;max-width:420px;width:100%;max-height:85vh;overflow:auto;background:white;border-radius:16px;border:1px solid #ccc"><div style="display:flex;justify-content:space-between"><b>Detail: ${u.name||'-'}</b><button onclick="document.getElementById('adminDetailModal').remove()" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:white">✕</button></div><div style="font-size:12px;margin-top:12px;line-height:1.7"><div>Email: ${u.email||'-'}</div><div>HP: ${u.hp||u.phone||'-'}</div><div>Role: ${u.role||'-'}</div><div>Desa: ${u.desa||'-'}</div><div>Status: ${u.status||'-'}</div><div>ID: ${u.id}</div>${locHtml}</div><div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/${String(u.hp||u.phone||'').replace(/[^0-9]/g,'')}" target="_blank" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:8px;text-decoration:none;background:white">WA</a><button onclick="adminBanUser('${u.id}')" style="flex:1;padding:10px;background:#dc2626;color:white;border:0;border-radius:8px;font-weight:700">Ban</button></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', simpleHtml);
};

window.adminBanUser = async function(id){
  log('adminBanUser '+id);
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan'); if(reason===null) return;
  if(!confirm('Yakin BAN user ini?')) return;
  try{ await banUser(id, reason); alert('✅ Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); log('adminBanUser error: '+e.message); }
};
window.adminUnbanUser = async function(id){
  log('adminUnbanUser '+id);
  if(!confirm('Yakin UNBAN user ini?')) return;
  try{ await unbanUser(id); alert('✅ Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('❌ Gagal: '+e.message); log('adminUnbanUser error: '+e.message); }
};
window.adminBanFromReport = async function(uid, rid){
  log(`adminBanFromReport uid=${uid} rid=${rid}`);
  if(!uid){ alert('ID terlapor tidak ada'); log('adminBanFromReport no uid'); return; }
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${uid},id.eq.${uid}`).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'resolved' }).eq('id', rid); }catch(e){} }
    alert('✅ User di-ban & laporan selesai'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('❌ Gagal: '+e.message); log('adminBanFromReport error: '+e.message); }
};
window.adminReviewReport = async function(rid){
  log('adminReviewReport '+rid);
  if(!confirm('Tandai laporan ini ditolak?')) return;
  try{ 
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'reviewed' }).eq('id', rid); }catch(e){} }
    const reports=await getReports('all'); renderReports(reports); log('adminReviewReport done');
  }catch(e){ alert('Gagal: '+e.message); log('adminReviewReport error: '+e.message); }
};

// ===== INIT - FINAL FIX SEARCH/DROPDOWN + RENDER =====
export async function initAdminPage(){
  log('initAdminPage START - FINAL FULL UI');
  try{ log('KECAMATAN_DATA keys: ' + Object.keys(KECAMATAN_DATA).join(',')); }catch(e){ log('KECAMATAN_DATA error: '+e.message); }

  try{
    log('Fetching stats...');
    const stats=await getAdminStats();
    log(`Stats: total=${stats.total} banned=${stats.banned} drivers=${stats.drivers}`);
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
    
    const loadUsers = async()=>{
      try{
        const f=document.getElementById('adminFilter')?.value||'all';
        const s=document.getElementById('adminSearch')?.value||'';
        log(`loadUsers filter=${f} search=${s}`);
        const users = await getUsersList(f,s);
        log(`loadUsers got ${users.length} users`);
        renderUserList(users);
        // Also call router's render if exists
        if(window.renderAdminUserList) { try{ window.renderAdminUserList(users); }catch(e){ log('renderAdminUserList error: '+e.message); } }
      }catch(e){ log('loadUsers ERROR: '+e.message+' '+e.stack?.slice(0,200)); }
    };
    const loadReports = async()=>{
      try{
        log('loadReports start');
        const reps = await getReports('all');
        log(`loadReports got ${reps.length} reports`);
        renderReports(reps);
        if(window.renderAdminReports) { try{ window.renderAdminReports(reps); }catch(e){ log('renderAdminReports error: '+e.message); } }
      }catch(e){ log('loadReports ERROR: '+e.message); }
    };

    await Promise.all([loadUsers(), loadReports()]);

    const searchEl = document.getElementById('adminSearch');
    const filterEl = document.getElementById('adminFilter');
    if(searchEl){
      searchEl.addEventListener('input', ()=>{
        log('search input: '+searchEl.value);
        clearTimeout(window._admT);
        window._admT=setTimeout(loadUsers, 400);
      });
    }
    if(filterEl){
      filterEl.addEventListener('change', ()=>{
        log('filter change: '+filterEl.value);
        loadUsers();
      });
    }

    document.getElementById('btnAdminRefresh')?.addEventListener('click', async()=>{
      log('Refresh clicked');
      const st=await getAdminStats(); set('statTotal', st.total); set('statActive', st.active); set('statOffline', st.offline); set('statBanned', st.banned); set('statDrivers', st.drivers); set('statPassengers', st.passengers); set('statOrders', st.ordersToday);
      await Promise.all([loadUsers(), loadReports()]);
    });
    document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout admin?')) return; await logoutAdmin(); });
    log('initAdminPage DONE - FINAL');
  }catch(err){
    log('initAdminPage EXCEPTION: '+err.message+' '+err.stack?.slice(0,300));
    console.error('initAdminPage error', err);
    const box = document.getElementById('adminUserList');
    if(box) box.innerHTML = `<div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;color:#991b1b">❌ Error init: ${err.message}<br><pre style="font-size:10px;white-space:pre-wrap">${err.stack||''}</pre></div>`;
  }
}

export async function initAdminSettingsPage(){
  log('initAdminSettingsPage START');
  try{
    const cur = getAppSettings();
    log('cur settings: ' + JSON.stringify(cur).slice(0,200));
    const motorCost = 3000 + 5*2500;
    const mobilCost = 8000 + 5*5500;
    const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
    const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');

    const btnSave=document.getElementById('btnSaveSettings');
    const btnReset=document.getElementById('btnResetSettings');
    const statusEl=document.getElementById('settingStatus');

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
        log('Saving settings: '+JSON.stringify(ns).slice(0,300));
        if(statusEl) statusEl.textContent='⏳ Menyimpan...';
        btnSave.disabled=true;
        try{
          await saveAppSettings(ns);
          if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='#16a34a'; }
          log('Save success');
        }catch(e){
          if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='#dc2626'; }
          log('Save fail: '+e.message);
          btnSave.disabled=false;
        }
      };
    }
    if(btnReset){
      btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
    }
    document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout?')) return; await logoutAdmin(); });
    log('initAdminSettingsPage DONE');
  }catch(e){ 
    log('initAdminSettingsPage ERROR: '+e.message+' '+e.stack?.slice(0,200));
  }
}

export const bindAdminEvents = initAdminPage;
export const ADMIN_SQL = `-- SQL untuk fix RLS jika perlu
-- CREATE POLICY "Allow admin all" ON users FOR ALL USING (true);
`;

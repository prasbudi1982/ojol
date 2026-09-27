// admin.js - FINAL FIX BLANK - Tanpa top-level await
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT as CFG_DEFAULT, KECAMATAN_DATA as CFG_KEC, getActiveKecamatanLive as CFG_LIVE } from './config.js';


// ===== DEBUG BOX =====
function addDebugLog(msg){
  try{
    const box = document.getElementById('adminDebugBox');
    if(!box) return;
    const time = new Date().toLocaleTimeString('id-ID');
    const line = document.createElement('div');
    line.style.cssText = "font-size:10px;padding:4px 0;border-top:1px solid #eee;white-space:pre-wrap;word-break:break-all";
    line.textContent = `[${time}] ${msg}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    console.log('[ADMIN DEBUG]', msg);
  }catch(e){}
}
window.adminDebugLog = addDebugLog;

// Fallback aman kalau config kosong
const APP_SETTINGS_DEFAULT = CFG_DEFAULT || { appName: 'Ojol Trenggalek', activeKecamatanCode: '3503071' };
const KECAMATAN_DATA = CFG_KEC || { '3503071': { name: 'Suruh' } };
const getActiveKecamatanLive = CFG_LIVE || (() => ({ code: '3503071', name: 'Suruh' }));


// ===== STATS =====
export async function getAdminStats(){
  try{
    const { data: users } = await supabase.from('users').select('id, role, status, banned, is_banned, created_at');
    const total = users?.length||0;
    const active = users?.filter(u=> ['online','active'].includes(u.status)).length||0;
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
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

// ===== USERS + driver_locations =====
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

    // Ambil last_seen dari driver_locations: driver_id uuid, lokasi USER-DEFINED, heading, updated_at, speed_kmh
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

    if(filter==='online'){
      list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && (u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000)));
    }

    if(search && !search.includes('%')){
      // sudah difilter di query, tapi filter lagi untuk warung_name yang mungkin tidak ikut ilike
      const s = search.toLowerCase();
      list = list.filter(u=> String(u.name||'').toLowerCase().includes(s) || String(u.email||'').toLowerCase().includes(s));
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
  if(!data?.length) throw new Error('RLS blokir update users');
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason }); }catch(e){}
  return true;
}

export async function unbanUser(userId){
  const { error, data } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active', banned_reason:null, banned_at:null, banned_until:null }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  return true;
}

// ===== REPORTS - v_reports_detail 13 kolom =====
export async function getReports(status='pending'){
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(error) throw error;
    return data||[];
  }catch(e){
    console.warn('v_reports_detail fail', e);
    try{
      const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
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
    try{
      await supabase.from(tbl).update({ status:newStatus, handled_at:new Date().toISOString() }).eq('id', reportId);
    }catch(e){}
  }
  return true;
}

// ===== SETTINGS =====
export function getSettingsLive(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}
export const getAppSettings = getSettingsLive;

export async function saveAppSettings(newSettings){
  localStorage.setItem('app_settings', JSON.stringify(newSettings));
  if(newSettings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
  try{ await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'}); }catch(e){}
  return true;
}

export function saveSettings(newSettings){
  const merged = { ...getSettingsLive(), ...newSettings };
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

// ===== VIEW - TIDAK ERROR =====
export function viewAdminDashboard(stats=null){
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name || 'Trenggalek'; }catch(e){}
  return `
  <div class="admin-page" style="max-width:1100px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <h2 style="margin:0">🛡️ Admin Panel • ${kecName}</h2>
      <div style="display:flex;gap:8px">
        <button id="btnAdminRefresh" class="btn">🔄 Refresh</button>
        <button id="btnAdminLogout" class="btn" style="border:1px solid #ef4444;color:#ef4444">🚪 Logout</button>
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
    <h3 style="margin-top:24px">🚩 Laporan (v_reports_detail - ${status || 'pending'})</h3>
    <div id="adminReportsList" style="display:grid;gap:8px;margin-top:8px"></div>
    <div style="margin-top:16px;padding:12px;border:1px dashed var(--border);border-radius:10px;font-size:11px;opacity:.6">
      Schema: users(id, google_id, name, email, role, desa, warung_name, hp, status, banned, is_banned) | driver_locations(driver_id, lokasi, heading, updated_at, speed_kmh) | v_reports_detail(13 kolom)
    </div>
  </div>`;
}

export const viewAdminPanel = viewAdminDashboard;

function renderUserList(users){
  const box = document.getElementById('adminUserList');
  if(!box) return;
  if(!users.length){ box.innerHTML = '<div class="card" style="padding:20px;text-align:center">📭 Tidak ada user</div>'; return; }
  box.innerHTML = users.map(u=>{
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    const isOnline = u._isOnline || (u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000);
    const statusText = isBanned ? '🚫 BANNED' : isOnline ? '🟢 ONLINE' : '✅ '+(u.status||'active');
    const driverLoc = u._driverLoc ? `<div style="font-size:10px;background:#dcfce7;padding:4px 6px;border-radius:6px;margin-top:4px">📍 ${new Date(u._driverLoc.updated_at).toLocaleTimeString('id-ID')} • ${u._driverLoc.speed_kmh||0}km/h • ${u._driverLoc.heading||0}°</div>` : '';
    return `<div class="card" style="padding:12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid var(--border);border-radius:12px">
      <div style="flex:1">
        <div style="font-weight:700">${u.name||'Tanpa Nama'} <span style="font-size:10px;opacity:.6">• ${u.role||'-'}</span></div>
        <div style="font-size:11px;opacity:.7">${u.email||'-'} • ${u.hp||u.phone||'-'} • ${u.desa||'-'} ${u.warung_name ? '• Warung: '+u.warung_name : ''}</div>
        <div style="font-size:11px;margin-top:4px;color:${isBanned?'#ef4444': isOnline?'#22c55e':'#64748b'};font-weight:600">${statusText}</div>
        ${driverLoc}
        ${u.banned_reason ? `<div style="font-size:10px;color:#ef4444;margin-top:4px">Ban: ${u.banned_reason}</div>` : ''}
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
    const reporter = r.reporter_name || '-';
    const reported = r.reported_name || '-';
    const reportedId = r.reported_google_id || r.reported_id || '';
    return `<div class="card" style="padding:12px;border:1px solid var(--border);border-radius:12px">
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


// ===== SETTINGS VIEW - DIPAKAI ROUTER #/admin/settings =====
export function viewAdminSettings(settings=null, currentProfile=null){
  const cur = settings || getAppSettings();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, d]) => 
    `<option value="${code}" ${cur.activeKecamatanCode===code?'selected':''}>${d.name} (${code})</option>`
  ).join('');
  return `
  <div class="admin-page" style="max-width:800px;margin:0 auto;padding:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2>⚙️ Admin Settings</h2>
      <div style="display:flex;gap:8px">
        <a href="#/admin" class="btn secondary" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;text-decoration:none">← Dashboard</a>
        <button id="btnAdminLogout" class="btn" style="border:1px solid #ef4444;color:#ef4444;padding:8px 12px;border-radius:8px">🚪 Logout</button>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px">
      <h3 style="margin:0 0 12px">📍 Kecamatan Aktif</h3>
      <select id="setKecamatan" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border)">${kecOptions}</select>
      <div style="font-size:11px;opacity:.6;margin-top:6px">Ganti kecamatan cukup 1 klik, semua order akan pakai center & bbox kecamatan ini</div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px">
      <h3 style="margin:0 0 12px">🏷️ App Info</h3>
      <div style="display:grid;gap:10px">
        <div><label style="font-size:11px;opacity:.7">App Name</label><input id="setAppName" value="${cur.appName||''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border)"></div>
        <div><label style="font-size:11px;opacity:.7">Footer Text</label><input id="setFooterText" value="${cur.footerText||''}" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border)"></div>
      </div>
    </div>

    <div class="card" style="padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px">
      <h3 style="margin:0 0 12px">💰 Tarif (preview di dashboard)</h3>
      <div style="font-size:12px;line-height:1.6;opacity:.8">
        Tarif diatur di config.js - TARIF.motor.base, perKm, min<br>
        Untuk ubah tarif, edit file app/config.js langsung
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="btnSaveSettings" class="btn primary" style="flex:1;padding:12px;border-radius:10px;background:var(--primary);color:white;border:0;font-weight:800">💾 Simpan Setting</button>
      <button id="btnResetSettings" class="btn secondary" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border)">🔄 Reset Default</button>
    </div>

    <div id="settingStatus" style="margin-top:12px;font-size:12px;text-align:center;min-height:20px"></div>

    <div style="margin-top:24px;padding:12px;border:1px dashed var(--border);border-radius:10px;font-size:11px;opacity:.6">
      <b>Schema Info:</b><br>
      users: id, google_id, name, email, role, desa, warung_name, hp, status, banned, is_banned<br>
      driver_locations: driver_id, lokasi (POINT), heading, updated_at, speed_kmh → Online = updated_at < 10 menit<br>
      v_reports_detail: 13 kolom (reporter_name, reporter_email, reported_name, reported_email, reported_google_id, reason, description, status, created_at)<br>
      Current user: ${currentProfile?.email||'-'} • ${currentProfile?.role||'-'} • is_super_admin:${currentProfile?.is_super_admin||false}
    </div>
  </div>`;
}

// Alias lama
export const viewAdminSetting = viewAdminSettings;


// Global helpers
window.adminViewUser = async function(id){
  const detail = await getUserDetail(id);
  if(!detail || !detail.user){ alert('User tidak ditemukan'); return; }
  const u = detail.user;
  const loc = detail._driverLoc;
  const ordersHtml = (detail.orders||[]).map(o=>`<div style="font-size:11px;padding:6px;border-top:1px solid #eee;display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleString('id-ID')} - ${o.status}</span><span>Rp ${Number(o.total_fare||0).toLocaleString('id-ID')}</span></div>`).join('');
  const locHtml = loc ? `<div style="background:#dcfce7;padding:8px;border-radius:8px;margin:8px 0;font-size:11px"><b>📍 driver_locations</b><br>Updated: ${new Date(loc.updated_at).toLocaleString('id-ID')}<br>Heading: ${loc.heading||'-'}° • Speed: ${loc.speed_kmh||0} km/h<br>Lokasi: ${String(loc.lokasi||'').slice(0,80)}</div>` : '<div style="font-size:11px;opacity:.6">Tidak ada data driver_locations (hanya driver)</div>';
  const html = `<div id="adminDetailModal" class="card" style="padding:16px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;max-width:400px;width:90%;max-height:80vh;overflow:auto;background:var(--card);border:2px solid var(--border);border-radius:16px">
    <div style="display:flex;justify-content:space-between;align-items:center"><b>Detail: ${u.name||'-'}</b><button onclick="document.getElementById('adminDetailModal').remove()" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card)">✕</button></div>
    <div style="font-size:12px;margin-top:12px;line-height:1.6">
      <div>Email: ${u.email||'-'}</div><div>HP: ${u.hp||u.phone||'-'}</div><div>Role: ${u.role||'-'}</div><div>Desa: ${u.desa||'-'} ${u.warung_name ? '/ Warung: '+u.warung_name : ''}</div><div>Status: ${u.status||'-'} • banned:${u.banned} / is_banned:${u.is_banned}</div><div>Google ID: ${u.google_id||'-'}</div><div>ID: <span style="font-size:10px">${u.id}</span></div><div>Last seen: ${u.last_seen ? new Date(u.last_seen).toLocaleString('id-ID') : '-'}</div>
      ${locHtml}
      ${u.banned_reason ? `<div style="background:#fee2e2;padding:8px;border-radius:8px;color:#991b1b;margin-top:8px"><b>Banned:</b> ${u.banned_reason}</div>` : ''}
      <div style="margin-top:12px"><b>20 Order Terakhir:</b></div><div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:4px">${ordersHtml || '<div style="padding:8px;font-size:11px;opacity:.6">Tidak ada order</div>'}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/${String(u.hp||u.phone||'').replace(/[^0-9]/g,'')}" target="_blank" class="btn secondary" style="flex:1;text-align:center">💬 WA</a><button onclick="adminBanUser('${u.id}'); document.getElementById('adminDetailModal').remove()" class="btn" style="flex:1;background:#ef4444;color:white">Ban</button></div>
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
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${uid},id.eq.${uid}`).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'resolved' }).eq('id', rid); }catch(e){} }
    alert('User di-ban'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('Gagal: '+e.message); }
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

// ===== INIT =====
export async function initAdminPage(){
  addDebugLog('initAdminPage start - router loaded');
  try{ addDebugLog('KECAMATAN_DATA keys: ' + Object.keys(KECAMATAN_DATA).join(',')); }catch(e){ addDebugLog('KECAMATAN_DATA error: '+e.message); }
  try{ addDebugLog('APP_SETTINGS_DEFAULT: ' + JSON.stringify(APP_SETTINGS_DEFAULT).slice(0,200)); }catch(e){}

  try{
    addDebugLog('Fetching stats...');
    const stats=await getAdminStats();
    addDebugLog('Stats: total='+stats.total+' banned='+stats.banned);
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
    const loadUsers = async()=>{
      try{
        const f=document.getElementById('adminFilter')?.value||'all';
        const s=document.getElementById('adminSearch')?.value||'';
        addDebugLog('loadUsers filter='+f+' search='+s);
        const users = await getUsersList(f,s);
        addDebugLog('loadUsers got '+users.length+' users');
        renderUserList(users);
      }catch(e){ addDebugLog('loadUsers ERROR: '+e.message); }
    };
    const loadReports = async()=>{
      try{
        addDebugLog('loadReports start');
        const reps = await getReports('all');
        addDebugLog('loadReports got '+reps.length+' reports');
        renderReports(reps);
      }catch(e){ addDebugLog('loadReports ERROR: '+e.message); }
    };
    await Promise.all([loadUsers(), loadReports()]);
    document.getElementById('adminSearch')?.addEventListener('input', ()=>{ clearTimeout(window._admT); window._admT=setTimeout(loadUsers,300); });
    document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
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

export const bindAdminEvents = initAdminPage;

export async function initAdminSettingsPage(){
  try{
    addDebugLog('initAdminSettingsPage start');
    const cur = getAppSettings();
    addDebugLog('cur settings: ' + JSON.stringify(cur).slice(0,200));
    
    // Preview tarif simple
    const motorCost = 3000 + 5*2500;
    const mobilCost = 8000 + 5*5500;
    const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
    const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');
    addDebugLog('preview tarif ok');

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
        addDebugLog('Saving settings: ' + JSON.stringify(ns).slice(0,300));
        if(statusEl) statusEl.textContent='⏳ Menyimpan...';
        btnSave.disabled=true;
        try{
          await saveAppSettings(ns);
          if(statusEl){ statusEl.textContent='✅ Berhasil disimpan! Reload...'; statusEl.style.color='#16a34a'; }
          addDebugLog('Save success');
        }catch(e){
          if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='#dc2626'; }
          addDebugLog('Save fail: ' + e.message);
          btnSave.disabled=false;
        }
      };
    }
    if(btnReset){
      btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
    }
    document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{ if(!confirm('Logout?')) return; await logoutAdmin(); });
    addDebugLog('initAdminSettingsPage done');
  }catch(e){ 
    console.error('initAdminSettingsPage', e);
    addDebugLog('initAdminSettingsPage ERROR: ' + e.message + ' ' + e.stack);
  }
}


// admin.js - FINAL CLEAN - NO SYNTAX ERROR - COMPATIBLE ROUTER - 8 users, 1 report dari debug log kamu
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

function log(msg){
  console.log('[ADMIN]', msg);
  try{
    const box = document.getElementById('debugBox');
    if(box){
      const d = document.createElement('div');
      d.textContent = '['+new Date().toLocaleTimeString()+'] '+msg;
      d.style.cssText='border-top:1px solid #ddd;padding:2px 0;font-size:11px;font-family:monospace;white-space:pre-wrap;';
      box.appendChild(d);
    }
  }catch(e){}
}
window.addEventListener('error', e=>{ log('ERROR: '+e.message); });
window.addEventListener('unhandledrejection', e=>{ log('PROMISE: '+(e.reason?.message||e.reason)); });

export async function getAdminStats(){
  log('getAdminStats');
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
    log('stats total='+total+' banned='+banned+' drivers='+drivers);
    return { total, active, offline, banned, drivers, passengers, admins, ordersToday };
  }catch(e){
    log('getAdminStats error: '+e.message);
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0 };
  }
}

export async function getUsersList(filter='all', search=''){
  log('getUsersList filter='+filter+' search='+search);
  try{
    const { data, error } = await supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
    if(error){ log('users error: '+error.message); throw error; }
    let list = data||[];
    log('users raw '+list.length);
    try{
      const driverIds = list.filter(u=> String(u.role||'').toLowerCase().includes('driver')).map(u=>u.id);
      if(driverIds.length){
        const { data: locs } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').in('driver_id', driverIds).order('updated_at',{ascending:false});
        const map={};
        (locs||[]).forEach(l=>{ if(!map[l.driver_id]) map[l.driver_id]=l; });
        list = list.map(u=>{
          if(map[u.id]) return { ...u, last_seen: map[u.id].updated_at, _driverLoc: map[u.id], _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 };
          return { ...u, _isOnline: u.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000 : false };
        });
        log('driver_locations mapped '+Object.keys(map).length);
      }
    }catch(e){ log('driver_locations skip: '+e.message); }
    if(filter==='active') list = list.filter(u=> ['active','online'].includes(u.status) && !u.banned && !u.is_banned);
    else if(filter==='offline') list = list.filter(u=> u.status==='offline');
    else if(filter==='banned') list = list.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned');
    else if(filter==='online') list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && u._isOnline);
    else if(filter==='driver') list = list.filter(u=> u.role==='driver');
    else if(filter==='passenger') list = list.filter(u=> u.role==='passenger');
    else if(filter==='admin') list = list.filter(u=> u.role==='admin');
    if(search){
      const s = search.toLowerCase().trim();
      list = list.filter(u=> String(u.name||'').toLowerCase().includes(s) || String(u.email||'').toLowerCase().includes(s) || String(u.hp||'').toLowerCase().includes(s) || String(u.desa||'').toLowerCase().includes(s) || String(u.warung_name||'').toLowerCase().includes(s));
      log('after search '+list.length);
    }
    return list;
  }catch(e){
    log('getUsersList exception: '+e.message);
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
      const { data: orders } = await supabase.from('orders').select('id,status,created_at,total_fare').or('passenger_id.eq.'+userId+',driver_id.eq.'+userId).order('created_at',{ascending:false}).limit(20);
      detail.orders = orders||[];
    }catch(e){}
    try{
      const { data: loc } = await supabase.from('driver_locations').select('driver_id, lokasi, heading, updated_at, speed_kmh').eq('driver_id', userId).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(loc) detail._driverLoc = loc;
    }catch(e){}
    return detail;
  }catch(e){ log('getUserDetail error: '+e.message); return null; }
}

export async function banUser(userId, reason){
  log('banUser '+userId);
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error){ log('banUser error: '+error.message); throw error; }
  if(!data?.length){ log('banUser RLS blocked'); throw new Error('RLS blokir'); }
  log('banUser success');
  return true;
}

export async function unbanUser(userId){
  log('unbanUser '+userId);
  const { error, data } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId).select();
  if(error){ log('unbanUser error: '+error.message); throw error; }
  log('unbanUser success');
  return true;
}

export async function getReports(status){
  if(status===undefined) status='all';
  log('getReports status='+status);
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(!error && data){ log('v_reports_detail got '+data.length); return data; }
    if(error) log('v_reports_detail error: '+error.message);
  }catch(e){ log('v_reports_detail exception: '+e.message); }
  try{
    const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    log('reports fallback got '+(data?.length||0));
    return data||[];
  }catch(e){ log('reports exception: '+e.message); return []; }
}

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
  setTimeout(()=> location.reload(), 400);
  return true;
}
export function getSettingsLive(){ return getAppSettings(); }

export async function logoutAdmin(){
  try{ await supabase.auth.signOut(); }catch(e){}
  location.hash='#/login';
  setTimeout(()=> location.reload(), 300);
}

// VIEW - COMPATIBLE DENGAN ROUTER KAMU (IDs yang router cari: statTotal, adminUserList, adminReportList, kecamatanButtons, adminSqlBox)
export function viewAdminDashboard(stats){
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name || 'Trenggalek'; }catch(e){}
  log('viewAdminDashboard render');
  return '<div class="admin-page" style="max-width:1100px;margin:0 auto;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px">'
    + '<h2 style="margin:0">Admin Panel - '+kecName+' - FIX BLANK</h2>'
    + '<div style="display:flex;gap:8px"><button id="btnAdminRefresh" style="padding:8px 12px;border-radius:8px;border:1px solid #ccc;background:white">Refresh</button><button id="btnAdminLogout" style="padding:8px 12px;border-radius:8px;border:1px solid #dc2626;color:#dc2626;background:white">Logout</button></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">'
    + '<div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Total</div><div id="statTotal" style="font-size:20px;font-weight:800">'+(stats?.total||0)+'</div></div>'
    + '<div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Active</div><div id="statActive" style="font-size:20px;font-weight:800;color:#16a34a">'+(stats?.active||0)+'</div></div>'
    + '<div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Banned</div><div id="statBanned" style="font-size:20px;font-weight:800;color:#dc2626">'+(stats?.banned||0)+'</div></div>'
    + '<div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Drivers</div><div id="statDrivers" style="font-size:20px;font-weight:800">'+(stats?.drivers||0)+'</div></div>'
    + '<div style="border:1px solid #ddd;border-radius:12px;padding:12px;background:white"><div style="font-size:11px;opacity:.7">Orders Today</div><div id="statOrders" style="font-size:20px;font-weight:800">'+(stats?.ordersToday||0)+'</div></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
    + '<input id="adminSearch" placeholder="Cari nama/email/HP/desa/warung..." style="flex:1;min-width:200px;padding:10px;border-radius:10px;border:1px solid #ccc;background:white" />'
    + '<select id="adminFilter" style="padding:10px;border-radius:10px;border:1px solid #ccc;background:white"><option value="all">Semua</option><option value="active">Aktif</option><option value="online">Online</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Passenger</option><option value="admin">Admin</option></select>'
    + '</div>'
    + '<h3>Users (<span id="userCount">0</span>)</h3>'
    + '<div id="adminUserList" style="display:grid;gap:8px;min-height:50px;border:1px dashed #ccc;padding:8px;border-radius:8px;background:white">Loading users... (8 users dari debug log kamu)</div>'
    + '<div id="adminReportList" style="display:none"></div>'
    + '<h3 style="margin-top:24px">Laporan Akun</h3>'
    + '<div id="adminReportsList" style="display:grid;gap:8px;margin-top:8px;min-height:50px;border:1px dashed #ccc;padding:8px;border-radius:8px;background:white">Loading reports... (1 report dari debug log kamu)</div>'
    + '<div id="kecamatanButtons" style="margin-top:16px;"></div>'
    + '<div id="adminSqlBox" style="display:none"></div>'
    + '<div style="margin-top:24px;border:3px solid #f59e0b;border-radius:12px;overflow:hidden;background:#fffbeb"><div style="background:#f59e0b;color:white;padding:8px 12px;font-weight:800;font-size:12px;display:flex;justify-content:space-between"><span>DEBUG LOG - 8 users, 3 driver_locations, 1 report (dari log kamu)</span><button onclick="document.getElementById(\'debugBox\').innerHTML=\'\'" style="padding:4px 8px;border-radius:6px;border:0;background:white;color:#f59e0b;font-size:10px">Clear</button></div><div id="debugBox" style="max-height:400px;overflow:auto;padding:8px;background:white;font-family:monospace;font-size:11px;white-space:pre-wrap;">DEBUG LOG akan muncul di sini... Jika kosong, berarti initAdminPage tidak dipanggil</div></div>'
    + '</div>';
}

export function viewAdminSettings(settings){
  const cur = settings || getAppSettings();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(function(entry){ var code=entry[0]; var d=entry[1]; return '<option value="'+code+'" '+(cur.activeKecamatanCode===code?'selected':'')+'>'+d.name+' ('+code+')</option>'; }).join('');
  return '<div style="max-width:800px;margin:0 auto;padding:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h2>Admin Settings</h2><div style="display:flex;gap:8px"><a href="#/admin" style="padding:8px 12px;border:1px solid #ccc;border-radius:8px;text-decoration:none;background:white">Dashboard</a><button id="btnAdminLogout" style="padding:8px 12px;border-radius:8px;border:1px solid #dc2626;color:#dc2626;background:white">Logout</button></div></div>'
    + '<div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white"><h3 style="margin:0 0 12px">Kecamatan Aktif</h3><select id="setKecamatan" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc">'+kecOptions+'</select></div>'
    + '<div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white"><h3>App Info</h3><div style="display:grid;gap:12px"><div><label>App Name</label><input id="setAppName" value="'+(cur.appName||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div><div><label>Footer</label><input id="setFooterText" value="'+(cur.footerText||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div></div></div>'
    + '<div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white"><h3>Warna Tema</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label>Primary</label><div style="display:flex;gap:8px"><input id="setPrimary" type="color" value="'+(cur.primaryColor||'#16a34a')+'" style="width:50px;height:40px" /><input id="setPrimaryText" value="'+(cur.primaryColor||'#16a34a')+'" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc" /></div></div><div><label>Secondary</label><div style="display:flex;gap:8px"><input id="setSecondary" type="color" value="'+(cur.secondaryColor||'#f59e0b')+'" style="width:50px;height:40px" /><input id="setSecondaryText" value="'+(cur.secondaryColor||'#f59e0b')+'" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ccc" /></div></div></div></div>'
    + '<div style="padding:16px;border:1px solid #ddd;border-radius:12px;margin-bottom:12px;background:white"><h3>Disclaimer</h3><div style="display:grid;gap:12px"><div><label>Judul</label><input id="setDiscTitle" value="'+(cur.disclaimerTitle||'').replace(/"/g,'&quot;')+'" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc" /></div><div><label>Isi</label><textarea id="setDiscText" style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;min-height:150px">'+(cur.disclaimerText||'')+'</textarea></div></div></div>'
    + '<div style="display:flex;gap:8px;margin-top:16px"><button id="btnSaveSettings" style="flex:1;padding:12px;border-radius:10px;background:#16a34a;color:white;border:0;font-weight:800">Simpan</button><button id="btnResetSettings" style="flex:1;padding:12px;border-radius:10px;border:1px solid #ccc;background:white">Reset</button></div>'
    + '<div id="settingStatus" style="margin-top:12px;text-align:center"></div>'
    + '<div style="margin-top:16px;border:2px solid #f59e0b;border-radius:12px;overflow:hidden;background:#fffbeb"><div style="background:#f59e0b;color:white;padding:8px 12px;font-weight:800">DEBUG LOG SETTINGS</div><div id="debugBox" style="max-height:300px;overflow:auto;padding:8px;background:white;font-family:monospace;font-size:11px">DEBUG LOG...</div></div>'
    + '</div>';
}
export const viewAdminPanel = viewAdminDashboard;
export const viewAdminSetting = viewAdminSettings;

function renderUserList(users){
  log('renderUserList '+users.length);
  const box = document.getElementById('adminUserList');
  const countEl = document.getElementById('userCount');
  if(countEl) countEl.textContent = users.length;
  if(!box){ log('adminUserList not found!'); return; }
  if(!users.length){ box.innerHTML = '<div style="padding:20px;text-align:center">Tidak ada user</div>'; return; }
  box.innerHTML = users.map(function(u){
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    const isOnline = u._isOnline;
    const statusText = isBanned ? 'BANNED' : isOnline ? 'ONLINE' : (u.status||'active');
    const statusColor = isBanned ? '#dc2626' : isOnline ? '#16a34a' : '#64748b';
    const banStyle = 'padding:7px 12px;font-size:11px;background:#dc2626;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700;';
    const detailStyle = 'padding:7px 12px;font-size:11px;background:white;color:#0f172a;border:1px solid #ccc;border-radius:8px;cursor:pointer;';
    return '<div style="padding:12px;display:flex;justify-content:space-between;gap:12px;border:1px solid #ddd;border-radius:12px;background:white">'
      + '<div style="flex:1"><div style="font-weight:700">'+(u.name||'Tanpa Nama')+' <span style="font-size:10px;opacity:.6">• '+(u.role||'-')+'</span></div><div style="font-size:11px;opacity:.7">'+(u.email||'-')+' • '+(u.hp||'-')+' • '+(u.desa||'-')+'</div><div style="font-size:11px;margin-top:4px;color:'+statusColor+';font-weight:700">'+statusText+'</div></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px"><button onclick="adminViewUser(\''+u.id+'\')" style="'+detailStyle+'">Detail</button>'+(isBanned ? '<button onclick="adminUnbanUser(\''+u.id+'\')" style="padding:7px 12px;background:#0ea5e9;color:white;border:0;border-radius:8px">Unban</button>' : '<button onclick="adminBanUser(\''+u.id+'\')" style="'+banStyle+'">Ban</button>')+'</div>'
      + '</div>';
  }).join('');
}

function renderReports(reports){
  log('renderReports '+reports.length);
  const box = document.getElementById('adminReportsList');
  const box2 = document.getElementById('adminReportList');
  const target = box || box2;
  if(!target){ log('reports container not found'); return; }
  if(!reports.length){ target.innerHTML = '<div style="padding:16px;text-align:center;border:1px solid #ddd;border-radius:12px;background:white">Tidak ada laporan</div>'; return; }
  target.innerHTML = reports.map(function(r){
    const reporter = r.reporter_name || r.reporter_id || '-';
    const reported = r.reported_name || r.reported_id || '-';
    const reportedId = r.reported_google_id || r.reported_id || '';
    return '<div style="padding:12px;border:1px solid #ddd;border-radius:12px;background:white"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1"><div style="font-size:12px;font-weight:700">'+reporter+' → <span style="color:#dc2626">'+reported+'</span></div><div style="font-size:10px;opacity:.6">'+(r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : '')+' • '+ (r.status||'pending')+'</div><div style="font-size:12px;margin-top:6px"><b>Alasan:</b> '+(r.reason||'-')+'</div></div><div style="display:flex;flex-direction:column;gap:6px"><button onclick="adminBanFromReport(\''+reportedId+'\',\''+r.id+'\')" style="padding:7px 10px;background:#dc2626;color:white;border:0;border-radius:8px;font-weight:700">Ban Terlapor</button><button onclick="adminReviewReport(\''+r.id+'\')" style="padding:7px 10px;background:white;border:1px solid #ccc;border-radius:8px">Tolak</button></div></div></div>';
  }).join('');
  if(box && box2 && box!==box2) box2.innerHTML = target.innerHTML;
}

window.adminViewUser = async function(id){
  log('adminViewUser '+id);
  try{
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if(error) throw error;
    const u = data;
    const html = '<div id="adminDetailModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px"><div style="padding:16px;max-width:420px;width:100%;max-height:85vh;overflow:auto;background:white;border-radius:16px"><div style="display:flex;justify-content:space-between"><b>Detail: '+(u.name||'-')+'</b><button onclick="document.getElementById(\'adminDetailModal\').remove()" style="padding:6px 10px;border:1px solid #ccc;border-radius:8px">X</button></div><div style="font-size:12px;margin-top:12px"><div>Email: '+(u.email||'-')+'</div><div>HP: '+(u.hp||'-')+'</div><div>Role: '+(u.role||'-')+'</div><div>Status: '+(u.status||'-')+'</div><div>ID: '+u.id+'</div></div><div style="display:flex;gap:8px;margin-top:12px"><a href="https://wa.me/'+String(u.hp||'').replace(/[^0-9]/g,'')+'" target="_blank" style="flex:1;text-align:center;padding:10px;border:1px solid #ccc;border-radius:8px;text-decoration:none">WA</a><button onclick="adminBanUser(\''+u.id+'\')" style="flex:1;padding:10px;background:#dc2626;color:white;border:0;border-radius:8px;font-weight:700">Ban</button></div></div></div>';
    const old = document.getElementById('adminDetailModal');
    if(old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }catch(e){ log('adminViewUser error: '+e.message); alert('Gagal: '+e.message); }
};

window.adminBanUser = async function(id){
  log('adminBanUser '+id);
  const reason = prompt('Alasan ban?', 'Pelanggaran kebijakan');
  if(reason===null) return;
  if(!confirm('Yakin BAN?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); log('ban error: '+e.message); }
};

window.adminUnbanUser = async function(id){
  log('adminUnbanUser '+id);
  if(!confirm('Yakin UNBAN?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

window.adminBanFromReport = async function(uid, rid){
  log('adminBanFromReport uid='+uid+' rid='+rid);
  const r = prompt('Alasan ban?', 'Laporan valid');
  if(!r) return;
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or('google_id.eq.'+uid+',id.eq.'+uid).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'resolved' }).eq('id', rid); }catch(e){} }
    alert('User di-ban'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('Gagal: '+e.message); }
};

window.adminReviewReport = async function(rid){
  log('adminReviewReport '+rid);
  if(!confirm('Tandai ditolak?')) return;
  try{ 
    for(const tbl of ['reports','user_reports']){ try{ await supabase.from(tbl).update({ status:'reviewed' }).eq('id', rid); }catch(e){} }
    const reps = await getReports('all');
    renderReports(reps);
  }catch(e){ alert('Gagal: '+e.message); }
};

export async function initAdminPage(){
  log('initAdminPage START - FINAL CLEAN');
  try{
    const stats = await getAdminStats();
    const set = function(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; };
    set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers); set('statOrders', stats.ordersToday);
    const loadUsers = async function(){
      try{
        const f = document.getElementById('adminFilter')?.value||'all';
        const s = document.getElementById('adminSearch')?.value||'';
        log('loadUsers filter='+f+' search='+s);
        const users = await getUsersList(f,s);
        log('loadUsers got '+users.length);
        renderUserList(users);
      }catch(e){ log('loadUsers ERROR: '+e.message); }
    };
    const loadReports = async function(){
      try{
        log('loadReports start');
        const reps = await getReports('all');
        log('loadReports got '+reps.length);
        renderReports(reps);
      }catch(e){ log('loadReports ERROR: '+e.message); }
    };
    await Promise.all([loadUsers(), loadReports()]);
    const searchEl = document.getElementById('adminSearch');
    const filterEl = document.getElementById('adminFilter');
    if(searchEl){
      searchEl.addEventListener('input', function(){
        log('search input: '+searchEl.value);
        clearTimeout(window._admT);
        window._admT=setTimeout(loadUsers, 400);
      });
    }
    if(filterEl){
      filterEl.addEventListener('change', function(){
        log('filter change: '+filterEl.value);
        loadUsers();
      });
    }
    document.getElementById('btnAdminRefresh')?.addEventListener('click', async function(){
      log('Refresh clicked');
      const st = await getAdminStats();
      set('statTotal', st.total); set('statActive', st.active); set('statOffline', st.offline); set('statBanned', st.banned); set('statDrivers', st.drivers); set('statPassengers', st.passengers); set('statOrders', st.ordersToday);
      await Promise.all([loadUsers(), loadReports()]);
    });
    document.getElementById('btnAdminLogout')?.addEventListener('click', async function(){ if(!confirm('Logout?')) return; await logoutAdmin(); });
    log('initAdminPage DONE - FINAL CLEAN - NO BLANK');
  }catch(err){
    log('initAdminPage EXCEPTION: '+err.message);
    const box = document.getElementById('adminUserList');
    if(box) box.innerHTML = '<div style="padding:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;color:#991b1b">Error init: '+err.message+'</div>';
  }
}

export async function initAdminSettingsPage(){
  log('initAdminSettingsPage START');
  try{
    const cur = getAppSettings();
    const btnSave = document.getElementById('btnSaveSettings');
    const btnReset = document.getElementById('btnResetSettings');
    const statusEl = document.getElementById('settingStatus');
    document.getElementById('setPrimary')?.addEventListener('input', function(e){ const t=document.getElementById('setPrimaryText'); if(t) t.value=e.target.value; });
    document.getElementById('setPrimaryText')?.addEventListener('input', function(e){ const c=document.getElementById('setPrimary'); if(c) c.value=e.target.value; });
    document.getElementById('setSecondary')?.addEventListener('input', function(e){ const t=document.getElementById('setSecondaryText'); if(t) t.value=e.target.value; });
    document.getElementById('setSecondaryText')?.addEventListener('input', function(e){ const c=document.getElementById('setSecondary'); if(c) c.value=e.target.value; });
    if(btnSave){
      btnSave.onclick = async function(){
        const ns = {
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
        if(statusEl) statusEl.textContent='Menyimpan...';
        btnSave.disabled=true;
        try{
          await saveAppSettings(ns);
          if(statusEl){ statusEl.textContent='Berhasil disimpan! Reload...'; statusEl.style.color='#16a34a'; }
        }catch(e){
          if(statusEl){ statusEl.textContent='Gagal: '+e.message; statusEl.style.color='#dc2626'; }
          btnSave.disabled=false;
        }
      };
    }
    if(btnReset){
      btnReset.onclick = function(){ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
    }
    document.getElementById('btnAdminLogout')?.addEventListener('click', async function(){ if(!confirm('Logout?')) return; await logoutAdmin(); });
    log('initAdminSettingsPage DONE');
  }catch(e){ log('initAdminSettingsPage error: '+e.message); }
}

export const bindAdminEvents = initAdminPage;
export const ADMIN_SQL = '-- SQL fix RLS';

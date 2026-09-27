// admin.js - VERSI MINIMALIS TEST - TANPA STYLE UI + DEBUG LOG
// Tujuan: tes apakah blank karena style/template literal atau logic
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

function log(msg){
  try{
    const box = document.getElementById('debugBox');
    if(box){
      const d = document.createElement('div');
      d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      d.style.borderTop = '1px solid #ddd';
      d.style.padding = '2px 0';
      d.style.fontSize = '11px';
      d.style.fontFamily = 'monospace';
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    }
    console.log('[ADMIN MIN]', msg);
  }catch(e){}
}
window.adminLog = log;

window.addEventListener('error', e=>{
  log('❌ ERROR: ' + e.message + ' at ' + e.filename + ':' + e.lineno);
});
window.addEventListener('unhandledrejection', e=>{
  log('❌ PROMISE: ' + (e.reason?.message||e.reason));
});

// ===== USERS =====
export async function getUsersList(filter='all', search=''){
  log(`getUsersList filter=${filter} search=${search}`);
  try{
    const { data, error } = await supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
    if(error){ log('getUsersList error: '+error.message); throw error; }
    let list = data||[];
    log(`getUsersList raw ${list.length} users`);

    // driver_locations - optional
    try{
      const driverIds = list.filter(u=>String(u.role||'').toLowerCase().includes('driver')).map(u=>u.id);
      if(driverIds.length){
        const { data: locs } = await supabase.from('driver_locations').select('driver_id, updated_at').in('driver_id', driverIds);
        const map={};
        (locs||[]).forEach(l=>{ if(!map[l.driver_id]) map[l.driver_id]=l; });
        list = list.map(u=>{
          if(map[u.id]){
            return {...u, _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 };
          }
          return {...u, _isOnline: false};
        });
        log(`driver_locations mapped ${Object.keys(map).length}`);
      }
    }catch(e){ log('driver_locations skip: '+e.message); }

    if(filter==='active') list = list.filter(u=> ['active','online'].includes(u.status) && !u.banned && !u.is_banned);
    else if(filter==='offline') list = list.filter(u=> u.status==='offline');
    else if(filter==='banned') list = list.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned');
    else if(filter==='online') list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && u._isOnline);
    else if(filter==='driver') list = list.filter(u=> u.role==='driver');
    else if(filter==='passenger') list = list.filter(u=> u.role==='passenger');

    if(search){
      const s = search.toLowerCase().trim();
      list = list.filter(u=> 
        String(u.name||'').toLowerCase().includes(s) ||
        String(u.email||'').toLowerCase().includes(s) ||
        String(u.hp||'').toLowerCase().includes(s) ||
        String(u.desa||'').toLowerCase().includes(s)
      );
      log(`after search ${list.length} users`);
    }
    return list;
  }catch(e){
    log('getUsersList EXCEPTION: '+e.message);
    return [];
  }
}

export async function getReports(status='all'){
  log(`getReports status=${status}`);
  try{
    let q = supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(!error && data && data.length){ log(`v_reports_detail got ${data.length}`); return data; }
    if(error) log('v_reports_detail error: '+error.message);
  }catch(e){ log('v_reports_detail exception: '+e.message); }

  try{
    const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    log(`reports fallback got ${data?.length||0}`);
    return data||[];
  }catch(e){
    log('reports fallback error: '+e.message);
    return [];
  }
}

export async function banUser(userId, reason='Pelanggaran'){
  log(`banUser ${userId} reason=${reason}`);
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error){ log('banUser error: '+error.message); throw error; }
  if(!data?.length){ log('banUser RLS blocked'); throw new Error('RLS blokir'); }
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

export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){ log('getAppSettings error: '+e.message); }
  return APP_SETTINGS_DEFAULT;
}

export function viewAdminDashboard(){
  log('viewAdminDashboard called');
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name; }catch(e){ log('getActiveKecamatanLive error: '+e.message); }
  return `
  <div>
    <h2>ADMIN PANEL MINIMALIS - ${kecName}</h2>
    <div>
      <input id="adminSearch" placeholder="Cari..." />
      <select id="adminFilter">
        <option value="all">Semua</option>
        <option value="active">Aktif</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
        <option value="banned">Banned</option>
        <option value="driver">Driver</option>
        <option value="passenger">Passenger</option>
      </select>
      <button id="btnAdminRefresh">Refresh</button>
      <button id="btnAdminLogout">Logout</button>
    </div>
    <hr>
    <div id="stats">Loading stats...</div>
    <hr>
    <h3>Users</h3>
    <div id="adminUserList">Loading users...</div>
    <hr>
    <h3>Laporan</h3>
    <div id="adminReportsList">Loading reports...</div>
    <hr>
    <h3>DEBUG LOG</h3>
    <div id="debugBox" style="border:2px solid orange; max-height:400px; overflow:auto; padding:8px; background:#fffbeb;"></div>
    <div style="margin-top:10px; font-size:10px;">
      <div>URL: ${location.href}</div>
      <div>Time: ${new Date().toISOString()}</div>
    </div>
  </div>
  `;
}

export function viewAdminSettings(settings=null){
  log('viewAdminSettings called');
  const cur = settings || getAppSettings();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, d]) => 
    `<option value="${code}" ${cur.activeKecamatanCode===code?'selected':''}>${d.name}</option>`
  ).join('');
  return `
  <div>
    <h2>SETTINGS MINIMALIS</h2>
    <a href="#/admin">← Dashboard</a>
    <div>
      <label>Kecamatan</label>
      <select id="setKecamatan">${kecOptions}</select>
    </div>
    <div>
      <label>App Name</label>
      <input id="setAppName" value="${cur.appName||''}" />
    </div>
    <div>
      <label>Footer</label>
      <input id="setFooterText" value="${cur.footerText||''}" />
    </div>
    <button id="btnSaveSettings">Simpan</button>
    <button id="btnResetSettings">Reset</button>
    <div id="settingStatus"></div>
    <hr>
    <h3>DEBUG LOG</h3>
    <div id="debugBox" style="border:2px solid orange; max-height:400px; overflow:auto; padding:8px; background:#fffbeb;"></div>
  </div>
  `;
}

export const viewAdminPanel = viewAdminDashboard;
export const viewAdminSetting = viewAdminSettings;

function renderUserList(users){
  log(`renderUserList ${users.length} users`);
  const box = document.getElementById('adminUserList');
  if(!box){ log('adminUserList not found'); return; }
  if(!users.length){ box.innerHTML = 'Tidak ada user'; return; }
  box.innerHTML = users.map(u=>{
    const isBanned = u.banned===true || u.is_banned===true || u.status==='banned';
    return `
      <div style="border:1px solid #ccc; padding:6px; margin:4px 0;">
        <div>${u.name||'-'} - ${u.role||'-'} - ${u.status||'-'} ${isBanned?'BANNED':''} ${u._isOnline?'ONLINE':''}</div>
        <div>${u.email||'-'} - ${u.hp||'-'} - ${u.desa||'-'}</div>
        <div>
          <button onclick="adminViewUser('${u.id}')">Detail</button>
          ${isBanned ? `<button onclick="adminUnbanUser('${u.id}')">Unban</button>` : `<button onclick="adminBanUser('${u.id}')">Ban</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function renderReports(reports){
  log(`renderReports ${reports.length} reports`);
  const box = document.getElementById('adminReportsList');
  if(!box){ log('adminReportsList not found'); return; }
  if(!reports.length){ box.innerHTML = 'Tidak ada laporan'; return; }
  box.innerHTML = reports.map(r=>{
    const reporter = r.reporter_name || r.reporter_id || '-';
    const reported = r.reported_name || r.reported_id || '-';
    return `
      <div style="border:1px solid #ccc; padding:6px; margin:4px 0;">
        <div>${reporter} → ${reported} - ${r.status||''}</div>
        <div>Alasan: ${r.reason||'-'}</div>
        <div>${r.description||''}</div>
        <div><button onclick="adminBanFromReport('${r.reported_google_id||r.reported_id||''}','${r.id}')">Ban Terlapor</button> <button onclick="adminReviewReport('${r.id}')">Tolak</button></div>
      </div>
    `;
  }).join('');
}

window.adminViewUser = async function(id){
  log('adminViewUser ' + id);
  try{
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if(error) throw error;
    alert(`User: ${data.name}\nEmail: ${data.email}\nRole: ${data.role}\nStatus: ${data.status}\nBanned: ${data.banned}/${data.is_banned}`);
  }catch(e){ log('adminViewUser error: '+e.message); alert('Gagal: '+e.message); }
};

window.adminBanUser = async function(id){
  log('adminBanUser ' + id);
  const reason = prompt('Alasan ban?', 'Pelanggaran'); if(reason===null) return;
  if(!confirm('Yakin BAN?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

window.adminUnbanUser = async function(id){
  log('adminUnbanUser ' + id);
  if(!confirm('Yakin UNBAN?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

window.adminBanFromReport = async function(uid, rid){
  log(`adminBanFromReport uid=${uid} rid=${rid}`);
  if(!uid){ alert('ID terlapor kosong'); return; }
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or(`google_id.eq.${uid},id.eq.${uid}`).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    await supabase.from('reports').update({ status:'resolved' }).eq('id', rid);
    alert('Berhasil'); document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ log('adminBanFromReport error: '+e.message); alert('Gagal: '+e.message); }
};

window.adminReviewReport = async function(rid){
  log('adminReviewReport ' + rid);
  try{ await supabase.from('reports').update({ status:'reviewed' }).eq('id', rid); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};

export async function initAdminPage(){
  log('initAdminPage START');
  try{
    const { data: users } = await supabase.from('users').select('id').limit(1);
    log('supabase connection OK, users table accessible');
  }catch(e){ log('supabase connection FAIL: '+e.message); }

  const statsBox = document.getElementById('stats');
  if(statsBox){
    try{
      const { data: users } = await supabase.from('users').select('id, role, status, banned, is_banned');
      const total = users?.length||0;
      const banned = users?.filter(u=>u.banned||u.is_banned||u.status==='banned').length||0;
      statsBox.textContent = `Total: ${total} | Banned: ${banned}`;
      log(`stats total=${total} banned=${banned}`);
    }catch(e){ log('stats error: '+e.message); statsBox.textContent = 'Stats error: '+e.message; }
  }

  const loadUsers = async()=>{
    try{
      const f=document.getElementById('adminFilter')?.value||'all';
      const s=document.getElementById('adminSearch')?.value||'';
      log(`loadUsers filter=${f} search=${s}`);
      const users = await getUsersList(f,s);
      renderUserList(users);
    }catch(e){ log('loadUsers error: '+e.message); }
  };

  const loadReports = async()=>{
    try{
      log('loadReports start');
      const reps = await getReports('all');
      renderReports(reps);
    }catch(e){ log('loadReports error: '+e.message); }
  };

  await loadUsers();
  await loadReports();

  document.getElementById('adminSearch')?.addEventListener('input', ()=>{
    log('search input: '+document.getElementById('adminSearch').value);
    clearTimeout(window._admT);
    window._admT=setTimeout(loadUsers, 400);
  });

  document.getElementById('adminFilter')?.addEventListener('change', ()=>{
    log('filter change: '+document.getElementById('adminFilter').value);
    loadUsers();
  });

  document.getElementById('btnAdminRefresh')?.addEventListener('click', async()=>{
    log('Refresh clicked');
    await loadUsers();
    await loadReports();
  });

  document.getElementById('btnAdminLogout')?.addEventListener('click', async()=>{
    log('Logout clicked');
    if(!confirm('Logout?')) return;
    try{ await supabase.auth.signOut(); }catch(e){}
    location.hash='#/login';
  });

  log('initAdminPage DONE');
}

export async function initAdminSettingsPage(){
  log('initAdminSettingsPage START');
  const btnSave=document.getElementById('btnSaveSettings');
  const btnReset=document.getElementById('btnResetSettings');
  if(btnSave){
    btnSave.onclick=async()=>{
      log('Save settings clicked');
      const cur = getAppSettings();
      const ns = {
        ...cur,
        activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode,
        appName: document.getElementById('setAppName')?.value || cur.appName,
        footerText: document.getElementById('setFooterText')?.value || cur.footerText,
      };
      localStorage.setItem('app_settings', JSON.stringify(ns));
      log('Settings saved: '+JSON.stringify(ns).slice(0,200));
      alert('Saved');
      location.reload();
    };
  }
  if(btnReset){
    btnReset.onclick=()=>{
      log('Reset clicked');
      localStorage.removeItem('app_settings');
      location.reload();
    };
  }
  log('initAdminSettingsPage DONE');
}

export const bindAdminEvents = initAdminPage;
export const getUsers = getUsersList;

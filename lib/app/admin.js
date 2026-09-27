// admin.js - MINIMALIS V2 - SELF-CONTAINED + DEBUG LOG YANG PASTI MUNCUL
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

let debugLogs = [];
function log(msg){
  debugLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
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
function flushLogs(){
  try{
    const box = document.getElementById('debugBox');
    if(box && debugLogs.length){
      box.innerHTML = '';
      debugLogs.forEach(msg=>{
        const d = document.createElement('div');
        d.textContent = msg;
        d.style.cssText = 'border-top:1px solid #ddd; padding:2px 0; font-size:11px; font-family:monospace; white-space:pre-wrap;';
        box.appendChild(d);
      });
    }
  }catch(e){}
}
window.adminLog = log;
window.addEventListener('error', e=>{ log('❌ ERROR: ' + e.message + ' at ' + e.filename + ':' + e.lineno); });
window.addEventListener('unhandledrejection', e=>{ log('❌ PROMISE: ' + (e.reason?.message||e.reason)); });

export async function getUsersList(filter='all', search=''){
  log(`getUsersList filter=${filter} search=${search}`);
  try{
    const { data, error } = await supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
    if(error){ log('❌ users SELECT error: '+error.message+' code='+error.code+' details='+error.details); throw error; }
    let list = data||[];
    log(`✅ users raw ${list.length} rows`);

    // driver_locations optional
    try{
      const driverIds = list.filter(u=>String(u.role||'').toLowerCase().includes('driver')).map(u=>u.id);
      if(driverIds.length){
        const { data: locs, error: locErr } = await supabase.from('driver_locations').select('driver_id, updated_at, speed_kmh').in('driver_id', driverIds);
        if(locErr) log('driver_locations error: '+locErr.message);
        else {
          const map={};
          (locs||[]).forEach(l=>{ if(!map[l.driver_id]) map[l.driver_id]=l; });
          list = list.map(u=> map[u.id] ? {...u, _isOnline: (Date.now() - new Date(map[u.id].updated_at).getTime()) < 10*60*1000 } : {...u, _isOnline:false});
          log(`driver_locations mapped ${Object.keys(map).length}`);
        }
      }
    }catch(e){ log('driver_locations exception: '+e.message); }

    // filter
    if(filter==='active') list = list.filter(u=> ['active','online'].includes(u.status) && !u.banned && !u.is_banned);
    else if(filter==='offline') list = list.filter(u=> u.status==='offline');
    else if(filter==='banned') list = list.filter(u=> u.banned===true || u.is_banned===true || u.status==='banned');
    else if(filter==='online') list = list.filter(u=> String(u.role||'').toLowerCase().includes('driver') && u._isOnline);
    else if(filter==='driver') list = list.filter(u=> u.role==='driver');
    else if(filter==='passenger') list = list.filter(u=> u.role==='passenger');

    if(search){
      const s = search.toLowerCase().trim();
      list = list.filter(u=> String(u.name||'').toLowerCase().includes(s) || String(u.email||'').toLowerCase().includes(s) || String(u.hp||'').toLowerCase().includes(s));
      log(`after search ${list.length}`);
    }
    return list;
  }catch(e){
    log('❌ getUsersList EXCEPTION: '+e.message+' stack='+e.stack?.slice(0,200));
    return [];
  }
}

export async function getReports(status='all'){
  log(`getReports status=${status}`);
  try{
    const { data, error } = await supabase.from('v_reports_detail').select('*').order('created_at',{ascending:false}).limit(80);
    if(error){ log('v_reports_detail error: '+error.message); throw error; }
    log(`v_reports_detail got ${data?.length||0} rows`);
    if(data && data.length) return data;
  }catch(e){ log('v_reports_detail exception: '+e.message); }

  try{
    const { data, error } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    if(error){ log('reports error: '+error.message); throw error; }
    log(`reports fallback got ${data?.length||0}`);
    return data||[];
  }catch(e){
    log('reports exception: '+e.message);
    return [];
  }
}

export async function getAdminStats(){
  log('getAdminStats start');
  try{
    const { data, error } = await supabase.from('users').select('id, role, status, banned, is_banned');
    if(error) throw error;
    const total = data?.length||0;
    const banned = data?.filter(u=>u.banned||u.is_banned||u.status==='banned').length||0;
    log(`getAdminStats total=${total} banned=${banned}`);
    return { total, active:0, offline:0, banned, drivers:0, passengers:0, admins:0, ordersToday:0, totalUsers:total };
  }catch(e){
    log('getAdminStats error: '+e.message);
    return { total:0, banned:0 };
  }
}

export async function banUser(userId, reason='Pelanggaran'){
  log(`banUser ${userId}`);
  const { error, data } = await supabase.from('users').update({ banned:true, is_banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error){ log('banUser error: '+error.message); throw error; }
  if(!data?.length){ log('banUser RLS blocked'); throw new Error('RLS blokir'); }
  log('banUser success');
  return true;
}

export async function unbanUser(userId){
  log(`unbanUser ${userId}`);
  const { error } = await supabase.from('users').update({ banned:false, is_banned:false, status:'active' }).eq('id', userId);
  if(error){ log('unbanUser error: '+error.message); throw error; }
  log('unbanUser success');
  return true;
}

export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export function viewAdminDashboard(){
  let kecName = 'Trenggalek';
  try{ kecName = getActiveKecamatanLive().name; }catch(e){}
  log('viewAdminDashboard render kec='+kecName);
  return `
  <div style="padding:12px;">
    <h2>MINIMALIS V2 - ${kecName} - SELF TEST</h2>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <input id="adminSearch" placeholder="Cari..." style="padding:8px; flex:1; min-width:120px;" />
      <select id="adminFilter" style="padding:8px;">
        <option value="all">Semua</option>
        <option value="active">Aktif</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
        <option value="banned">Banned</option>
        <option value="driver">Driver</option>
      </select>
      <button id="btnAdminRefresh">Refresh</button>
      <button id="btnAdminLogout">Logout</button>
    </div>

    <div style="margin-top:12px; padding:8px; border:1px solid #ccc;">
      <b>Stats:</b> <span id="stats">Loading stats... (jika stuck, cek DEBUG LOG)</span>
      <div id="statTotal" style="display:none"></div>
      <div id="statBanned" style="display:none"></div>
    </div>

    <h3>Users (<span id="userCount">0</span>)</h3>
    <div id="adminUserList">Loading users... Jika stuck >5 detik, cek DEBUG LOG di bawah - kemungkinan RLS blokir tabel users</div>
    <div id="adminReportList" style="display:none"></div>

    <h3>Laporan</h3>
    <div id="adminReportsList">Loading reports... Jika stuck, cek DEBUG LOG</div>

    <h3>DEBUG LOG - INI YANG PENTING</h3>
    <div id="debugBox" style="border:3px solid orange; background:#fffbeb; max-height:500px; overflow:auto; padding:8px; font-family:monospace; font-size:11px; white-space:pre-wrap;">
      DEBUG LOG akan muncul di sini... Jika kosong, berarti initAdminPage tidak dipanggil
    </div>

    <div style="margin-top:12px; font-size:10px; opacity:0.7;">
      URL: ${location.href}<br>
      Time: ${new Date().toISOString()}<br>
      KEC_DATA: ${Object.keys(KECAMATAN_DATA||{}).length} keys<br>
      Supabase: ${typeof supabase !== 'undefined' ? 'loaded' : 'NOT loaded'}<br>
    </div>

    <script>
      // Self-contained init - tidak tergantung router
      (function(){
        console.log('Minimalis V2 inline script start');
        function log2(m){
          try{
            const box = document.getElementById('debugBox');
            if(box){
              const d = document.createElement('div');
              d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + m;
              d.style.borderTop = '1px solid #ddd';
              d.style.padding = '2px 0';
              box.appendChild(d);
            }
          }catch(e){}
          console.log(m);
        }
        log2('Inline script running - DOM ready');
        
        // Flush previous logs
        setTimeout(()=>{
          try{
            if(window.adminLog){
              window.adminLog('Flush - inline script ready');
            }
          }catch(e){}
        }, 100);

        // Auto-load after 500ms
        setTimeout(async ()=>{
          log2('Auto-load start');
          try{
            // Import admin module dynamically for self-test
            const admin = await import('./app/admin.js');
            log2('admin module imported');
            if(admin.getAdminStats){
              const stats = await admin.getAdminStats();
              const el = document.getElementById('stats');
              if(el) el.textContent = 'Total: ' + (stats.total||stats.totalUsers||0) + ' | Banned: ' + (stats.banned||0);
              log2('Stats loaded: total=' + (stats.total||0));
            }
            if(admin.getUsersList){
              const users = await admin.getUsersList('all','');
              log2('Users loaded: ' + users.length);
              const box = document.getElementById('adminUserList');
              if(box){
                if(users.length===0) box.innerHTML = 'Tidak ada user - cek RLS atau tabel kosong. Lihat DEBUG LOG untuk error.';
                else box.innerHTML = users.map(u=> '<div style=\"border:1px solid #ccc; margin:4px 0; padding:4px;\">' + (u.name||'-') + ' - ' + (u.role||'-') + ' - ' + (u.status||'-') + ' <button onclick=\"adminViewUser(\'' + u.id + '\')\">Detail</button> ' + (u.banned ? '<button onclick=\"adminUnbanUser(\'' + u.id + '\')\">Unban</button>' : '<button onclick=\"adminBanUser(\'' + u.id + '\')\">Ban</button>') + '</div>').join('');
              }
            }
            if(admin.getReports){
              const reps = await admin.getReports('all');
              log2('Reports loaded: ' + reps.length);
              const box = document.getElementById('adminReportsList');
              if(box){
                if(reps.length===0) box.innerHTML = 'Tidak ada laporan';
                else box.innerHTML = reps.map(r=> '<div style=\"border:1px solid #ccc; margin:4px 0; padding:4px;\">' + (r.reporter_name||'-') + ' → ' + (r.reported_name||'-') + ' - ' + (r.reason||'-') + '</div>').join('');
              }
            }
          }catch(e){
            log2('❌ Auto-load ERROR: ' + e.message + ' ' + e.stack);
          }
        }, 800);
      })();
    </script>
  </div>
  `;
}

export function viewAdminSettings(settings=null){
  const cur = settings || getAppSettings();
  return `
  <div style="padding:12px;">
    <h2>SETTINGS MINIMALIS V2</h2>
    <a href="#/admin">← Dashboard</a>
    <div>App Name: <input id="setAppName" value="${cur.appName||''}" /></div>
    <div>Footer: <input id="setFooterText" value="${cur.footerText||''}" /></div>
    <button id="btnSaveSettings">Simpan</button>
    <button id="btnResetSettings">Reset</button>
    <div id="settingStatus"></div>
    <div id="debugBox" style="border:3px solid orange; background:#fffbeb; max-height:400px; overflow:auto; padding:8px; margin-top:12px;"></div>
  </div>
  `;
}

export const viewAdminPanel = viewAdminDashboard;
export const viewAdminSetting = viewAdminSettings;

// Global helpers
window.adminViewUser = async function(id){
  log('adminViewUser ' + id);
  try{
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if(error) throw error;
    alert('User: ' + data.name + '\nEmail: ' + data.email + '\nRole: ' + data.role);
  }catch(e){ log('adminViewUser error: '+e.message); alert('Error: '+e.message); }
};
window.adminBanUser = async function(id){
  log('adminBanUser ' + id);
  const reason = prompt('Alasan ban?','Pelanggaran'); if(!reason) return;
  if(!confirm('Yakin BAN?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); location.reload(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminUnbanUser = async function(id){
  log('adminUnbanUser ' + id);
  if(!confirm('Yakin UNBAN?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); location.reload(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminBanFromReport = async function(uid, rid){
  log('adminBanFromReport uid='+uid);
  const r=prompt('Alasan ban?','Laporan valid'); if(!r) return;
  try{
    let targetId = uid;
    const { data: u } = await supabase.from('users').select('id').or('google_id.eq.'+uid+',id.eq.'+uid).maybeSingle();
    if(u) targetId = u.id;
    await banUser(targetId, r);
    await supabase.from('reports').update({ status:'resolved' }).eq('id', rid);
    alert('Berhasil'); location.reload();
  }catch(e){ alert('Gagal: '+e.message); }
};
window.adminReviewReport = async function(rid){
  log('adminReviewReport '+rid);
  try{ await supabase.from('reports').update({ status:'reviewed' }).eq('id', rid); location.reload(); }catch(e){ alert('Gagal: '+e.message); }
};

export async function initAdminPage(){
  log('initAdminPage CALLED - jika ini muncul di DEBUG LOG, berarti router memanggil initAdminPage');
  flushLogs();
  const loadUsers = async()=>{
    try{
      const f=document.getElementById('adminFilter')?.value||'all';
      const s=document.getElementById('adminSearch')?.value||'';
      log('loadUsers filter='+f+' search='+s);
      const users = await getUsersList(f,s);
      const box = document.getElementById('adminUserList');
      if(box){
        if(users.length===0) box.innerHTML = 'Tidak ada user - RLS mungkin blokir. Cek DEBUG LOG';
        else {
          box.innerHTML = users.map(u=> '<div style=\"border:1px solid #ccc; margin:4px 0; padding:4px;\">' + (u.name||'-') + ' - ' + (u.role||'-') + ' <button onclick=\"adminViewUser(\'' + u.id + '\')\">Detail</button></div>').join('');
          const countEl = document.getElementById('userCount');
          if(countEl) countEl.textContent = users.length;
        }
      }
    }catch(e){ log('loadUsers error: '+e.message); }
  };
  const loadReports = async()=>{
    try{
      const reps = await getReports('all');
      const box = document.getElementById('adminReportsList');
      if(box){
        box.innerHTML = reps.length ? reps.map(r=> '<div>'+ (r.reporter_name||'-') + ' → ' + (r.reported_name||'-') + '</div>').join('') : 'Tidak ada laporan';
      }
    }catch(e){ log('loadReports error: '+e.message); }
  };
  await loadUsers();
  await loadReports();
  document.getElementById('adminSearch')?.addEventListener('input', ()=>{
    clearTimeout(window._admT);
    window._admT=setTimeout(loadUsers, 400);
  });
  document.getElementById('adminFilter')?.addEventListener('change', loadUsers);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', loadUsers);
  log('initAdminPage DONE');
  flushLogs();
}

export async function initAdminSettingsPage(){
  log('initAdminSettingsPage called');
  flushLogs();
}

export const bindAdminEvents = initAdminPage;
export const getUsers = getUsersList;

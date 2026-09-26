// admin.js - REBUILD FROM SCRATCH - Clean, matches style.css kamu
// Fitur: List user, Detail user, Ban, Unban, Laporan, Setting
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// --- API ---
export async function getAdminStats(){
  const { data: users } = await supabase.from('users').select('id, role, status, banned');
  const total = users?.length||0;
  return {
    total,
    active: users?.filter(u=>['active','online'].includes(u.status)).length||0,
    offline: users?.filter(u=>u.status==='offline').length||0,
    banned: users?.filter(u=>u.banned).length||0,
    drivers: users?.filter(u=>u.role==='driver').length||0,
    passengers: users?.filter(u=>u.role==='passenger').length||0,
  };
}

export async function getUsersList(filter='all', search=''){
  let q = supabase.from('users').select('*').order('created_at',{ascending:false}).limit(100);
  if(filter==='active') q=q.in('status',['active','online']);
  if(filter==='offline') q=q.eq('status','offline');
  if(filter==='banned') q=q.eq('banned', true);
  if(filter==='driver') q=q.eq('role','driver');
  if(filter==='passenger') q=q.eq('role','passenger');
  if(filter==='admin') q=q.eq('role','admin');
  if(search){
    const c=search.replace(/[%_,]/g,'').trim();
    if(c) q=q.or(`name.ilike.%${c}%,email.ilike.%${c}%,hp.ilike.%${c}%`);
  }
  const { data } = await q;
  return data||[];
}

export async function getUserDetail(id){
  const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
  if(!user) return null;
  const { data: orders } = await supabase.from('orders').select('id,status,created_at,total_fare').or(`passenger_id.eq.${id},driver_id.eq.${id}`).order('created_at',{ascending:false}).limit(15);
  return { user, orders: orders||[] };
}

export async function banUser(id, reason){
  const { error, data } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at:new Date().toISOString() }).eq('id', id).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update');
  return true;
}

export async function unbanUser(id){
  const { error, data } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', id).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update');
  return true;
}

export async function getReports(){
  try{
    const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
    return data||[];
  }catch(e){ return []; }
}

export function getAppSettings(){
  try{ const s=localStorage.getItem('app_settings'); if(s) return {...APP_SETTINGS_DEFAULT, ...JSON.parse(s)}; }catch(e){}
  return APP_SETTINGS_DEFAULT;
}
export async function saveAppSettings(s){
  localStorage.setItem('app_settings', JSON.stringify(s));
  if(s.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', s.activeKecamatanCode);
  try{ await supabase.from('app_settings').upsert({ id:1, settings:s }, {onConflict:'id'}); }catch(e){}
  const r=document.documentElement;
  if(s.primaryColor) r.style.setProperty('--primary', s.primaryColor);
  return true;
}

// --- VIEW DASHBOARD - pakai class dari CSS kamu ---
export function viewAdminDashboard(stats){
  const kec = (()=>{ try{ return getActiveKecamatanLive(); }catch(e){ return {name:'Suruh'} } })();
  return `
  <div class="admin-page">
    <h2>📊 Admin • ${kec.name}</h2>
    <div class="admin-stats">
      <div class="stat-card"><b>Total</b><div id="statTotal">${stats?.total??0}</div></div>
      <div class="stat-card"><b>Aktif</b><div id="statActive">${stats?.active??0}</div></div>
      <div class="stat-card"><b>Offline</b><div id="statOffline">${stats?.offline??0}</div></div>
      <div class="stat-card"><b>Banned</b><div id="statBanned">${stats?.banned??0}</div></div>
      <div class="stat-card"><b>Driver</b><div id="statDrivers">${stats?.drivers??0}</div></div>
      <div class="stat-card"><b>Penumpang</b><div id="statPassengers">${stats?.passengers??0}</div></div>
    </div>

    <div class="row">
      <input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp" style="flex:1">
      <select id="adminFilter" class="admin-input" style="width:130px">
        <option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option>
      </select>
      <button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button>
    </div>

    <div class="admin-grid" style="margin-top:12px">
      <div>
        <h3 style="font-size:13px">👥 Users <span class="muted" id="userCount"></span></h3>
        <div id="adminUserList" class="admin-list"></div>
      </div>
      <div>
        <h3 style="font-size:13px">📋 Detail & Laporan</h3>
        <div id="adminUserDetail" class="card" style="display:none"></div>
        <div id="adminReportList" class="admin-list" style="margin-top:10px"></div>
      </div>
    </div>
  </div>`;
}

export function viewAdminSettings(s){
  s=s||getAppSettings();
  const opts = Object.entries(KECAMATAN_DATA).map(([k,v])=>`<option value="${k}" ${s.activeKecamatanCode===k?'selected':''}>${v.name}</option>`).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting</h2>
    <div class="card">
      <label>Kecamatan Aktif</label><select id="setKecamatan" class="input">${opts}</select>
      <label style="margin-top:12px">Nama Aplikasi</label><input id="setAppName" class="input" value="${s.appName||''}">
      <label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#22c55e'}" style="height:44px">
      <div class="row" style="margin-top:12px"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div>
      <div id="settingStatus" class="status"></div>
    </div>
  </div>`;
}

// --- RENDER ---
function renderUserList(users){
  const el=document.getElementById('adminUserList');
  const cnt=document.getElementById('userCount');
  if(!el) return;
  if(cnt) cnt.textContent=`(${users.length})`;
  if(!users.length){ el.innerHTML=`<div class="admin-list-item"><span class="muted">Tidak ada user</span></div>`; return; }
  
  el.innerHTML = users.map(u=>{
    const isBanned = u.banned;
    const badgeClass = isBanned ? 'badge-banned' : u.role==='driver' ? 'badge-driver' : u.role==='admin' ? 'badge-admin' : 'badge-passenger';
    const dotClass = isBanned ? 'err' : (['active','online'].includes(u.status) ? 'ok' : '');
    const dotStyle = dotClass ? '' : 'style="background:var(--muted)"';
    return `
    <div class="admin-list-item">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px"><span class="dot ${dotClass}" ${dotStyle}></span>${u.name||'Tanpa Nama'} <span class="admin-badge ${badgeClass}">${isBanned?'BANNED':u.role}</span></div>
        <div class="muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.email||''} ${u.hp?'• '+u.hp:''}</div>
      </div>
      <div class="admin-actions">
        <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="adminViewUser('${u.id}')">Detail</button>
        ${isBanned 
          ? `<button class="btn primary" style="width:auto;padding:6px 10px;font-size:11px" onclick="adminUnbanUser('${u.id}')">Unban</button>`
          : `<button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;color:var(--danger);border-color:var(--danger)" onclick="adminBanUser('${u.id}')">Ban</button>`
        }
      </div>
    </div>`;
  }).join('');
}

// --- GLOBAL FUNCTIONS - INI YANG BIKIN DETAIL & BAN JALAN ---
// Taruh di window biar onclick di HTML bisa panggil

window.adminViewUser = async function(id){
  const box=document.getElementById('adminUserDetail');
  if(!box) return;
  box.style.display='block';
  box.innerHTML='<div class="muted">Loading detail...</div>';
  const res=await getUserDetail(id);
  if(!res){ box.innerHTML='<div class="muted">User tidak ditemukan</div>'; return; }
  const u=res.user;
  const isB=u.banned;
  box.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center"><b>Detail User</b><button class="btn secondary" style="width:auto;padding:4px 8px;font-size:11px" onclick="this.closest('.card').style.display='none'">✕</button></div>
    <div style="margin-top:10px">
      <div style="font-weight:800;font-size:15px">${u.name||'-'} <span class="admin-badge ${isB?'badge-banned':u.role==='admin'?'badge-admin':u.role==='driver'?'badge-driver':'badge-passenger'}">${isB?'BANNED':u.role}</span></div>
      <div class="muted" style="font-size:12px;margin-top:4px">${u.email||'-'}<br>${u.hp||'-'}<br>Status: <b style="color:${isB?'var(--danger)':'var(--primary)'}">${u.status||'-'}</b>${u.banned_reason?`<br><span style="color:var(--danger)">Alasan: ${u.banned_reason}</span>`:''}</div>
      <div class="muted" style="font-size:10px;margin-top:6px">ID: ${u.id}<br>Daftar: ${new Date(u.created_at).toLocaleString('id-ID')}</div>
    </div>
    <div class="row" style="margin-top:12px">
      ${isB ? `<button class="btn primary" style="flex:1" onclick="adminUnbanUser('${u.id}')">✅ Unban</button>` : `<button class="btn secondary" style="flex:1;color:var(--danger);border-color:var(--danger)" onclick="adminBanUser('${u.id}')">🚫 Ban</button>`}
      <button class="btn secondary" style="flex:1" onclick="window.open('https://wa.me/${(u.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62')}','_blank')">💬 WA</button>
    </div>
    <div style="margin-top:12px"><b style="font-size:12px">📦 ${res.orders.length} Order</b><div style="max-height:120px;overflow:auto;margin-top:6px">${res.orders.map(o=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;display:flex;justify-content:space-between"><span>${new Date(o.created_at).toLocaleDateString('id-ID')}</span><span>${o.status}</span></div>`).join('')||'<span class=muted>Tidak ada</span>'}</div></div>
  `;
  box.scrollIntoView({behavior:'smooth'});
};

window.adminBanUser = async function(id){
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan');
  if(reason===null) return;
  if(!confirm('Yakin ban user ini?')) return;
  try{
    await banUser(id, reason);
    alert('Berhasil ban');
    document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('Gagal ban: '+e.message); }
};

window.adminUnbanUser = async function(id){
  if(!confirm('Yakin unban?')) return;
  try{
    await unbanUser(id);
    alert('Berhasil unban');
    document.getElementById('btnAdminRefresh')?.click();
  }catch(e){ alert('Gagal unban: '+e.message); }
};

// --- INIT ---
export async function initAdminPage(){
  const stats=await getAdminStats();
  const set=(i,v)=>{ const e=document.getElementById(i); if(e) e.textContent=v; };
  set('statTotal', stats.total); set('statActive', stats.active); set('statOffline', stats.offline); set('statBanned', stats.banned); set('statDrivers', stats.drivers); set('statPassengers', stats.passengers);
  
  const load=async()=>{
    const f=document.getElementById('adminFilter')?.value||'all';
    const s=document.getElementById('adminSearch')?.value||'';
    renderUserList(await getUsersList(f,s));
    const reports=await getReports();
    const rEl=document.getElementById('adminReportList');
    if(rEl){
      if(!reports.length) rEl.innerHTML='<div class="admin-list-item"><span class="muted" style="font-size:12px">Belum ada laporan</span></div>';
      else rEl.innerHTML=reports.map(r=>`<div class="admin-list-item"><div style="font-size:12px"><b>${r.reason||'Laporan'}</b><br><span class="muted" style="font-size:10px">${new Date(r.created_at).toLocaleDateString()}</span></div><span class="admin-badge" style="background:var(--warning);color:#111">${r.status}</span></div>`).join('');
    }
  };
  
  await load();
  document.getElementById('adminSearch')?.addEventListener('input', ()=>{ clearTimeout(window._t); window._t=setTimeout(load,300); });
  document.getElementById('adminFilter')?.addEventListener('change', load);
  document.getElementById('btnAdminRefresh')?.addEventListener('click', load);
}

export async function initAdminSettingsPage(){
  const cur=getAppSettings();
  document.getElementById('btnSaveSettings')?.addEventListener('click', async()=>{
    const ns={...cur, activeKecamatanCode: document.getElementById('setKecamatan')?.value, appName: document.getElementById('setAppName')?.value, primaryColor: document.getElementById('setPrimary')?.value };
    const st=document.getElementById('settingStatus');
    if(st) st.textContent='Menyimpan...';
    await saveAppSettings(ns);
    if(st) st.textContent='✅ Berhasil disimpan';
    setTimeout(()=>location.reload(),600);
  });
  document.getElementById('btnResetSettings')?.addEventListener('click', ()=>{ if(confirm('Reset?')){ localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); } });
}

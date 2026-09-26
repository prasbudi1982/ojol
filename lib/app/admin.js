// admin.js - FIXED - Modal Detail User + Report Improved + Setting Lengkap Aman
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT, KECAMATAN_DATA, getActiveKecamatanLive } from './config.js';

// ===== Helper Escape XSS =====
function escapeHtml(str){
  if(str==null) return '';
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g,'&quot;'); }

// ===== STATS - Pakai count biar ringan =====
export async function getAdminStats(){
  try{
    const counts = async (filterFn) => {
      let q = supabase.from('users').select('id', {count:'exact', head:true});
      if(filterFn) q = filterFn(q);
      const { count } = await q;
      return count||0;
    };
    const [total, active, offline, banned, drivers, passengers, admins] = await Promise.all([
      counts(),
      counts(q=>q.in('status',['active','online'])),
      counts(q=>q.eq('status','offline')),
      counts(q=>q.eq('banned', true)),
      counts(q=>q.eq('role','driver')),
      counts(q=>q.eq('role','passenger')),
      counts(q=>q.eq('role','admin')),
    ]);
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
      const cleanSearch = search.replace(/[%_,]/g, '').trim().slice(0,50);
      if(cleanSearch) query = query.or(`name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,hp.ilike.%${cleanSearch}%`);
    }
    const { data, error } = await query;
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function getUserDetail(userId){
  try{
    if(!userId) throw new Error('userId kosong');
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    // Aman: 2 query terpisah, hindari .or string interpolation
    const { data: asPassenger } = await supabase.from('orders').select('id,status,created_at,total_fare').eq('passenger_id', userId).order('created_at',{ascending:false}).limit(10);
    const { data: asDriver } = await supabase.from('orders').select('id,status,created_at,total_fare').eq('driver_id', userId).order('created_at',{ascending:false}).limit(10);
    const orders = [...(asPassenger||[]), ...(asDriver||[])].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,20);
    return { user: data, orders };
  }catch(e){ return null; }
}

export async function banUser(userId, reason='Pelanggaran'){
  const { error, data } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at: new Date().toISOString() }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  try{ await supabase.from('banned_logs').insert({ user_id:userId, reason }); }catch(e){}
  return true;
}
export async function unbanUser(userId){
  const { error, data } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId).select();
  if(error) throw error;
  if(!data?.length) throw new Error('RLS blokir update users');
  return true;
}

export async function getReports(){
  try{
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name, email), reported:reported_id(name, email, role, hp)').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    return data||[];
  }catch(e){
    try{
      const { data } = await supabase.from('reports').select('*').order('created_at',{ascending:false}).limit(50);
      return data||[];
    }catch(err){ return []; }
  }
}

// ===== APP SETTINGS - Tetap Lengkap =====
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

// ===== VIEW DASHBOARD =====
export function viewAdminDashboard(stats=null){
  const kec = getActiveKecamatanLive();
  return `
  <div class="admin-page">
    <h2>📊 Admin - ${escapeHtml(kec.name)}</h2>
    <div class="admin-stats">
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Total User</b><div id="statTotal">${stats?.total??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--primary)"><b>Aktif</b><div id="statActive">${stats?.active??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--muted)"><b>Offline</b><div id="statOffline">${stats?.offline??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--danger)"><b>Banned</b><div id="statBanned">${stats?.banned??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Driver</b><div id="statDrivers">${stats?.drivers??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Penumpang</b><div id="statPassengers">${stats?.passengers??'-'}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--border)"><b>Order Hari Ini</b><div id="statOrders">${stats?.ordersToday??'-'}</div></div>
    </div>
    <div class="row"><input id="adminSearch" class="admin-input" placeholder="Cari nama/email/hp..." style="flex:1"><select id="adminFilter" class="admin-input" style="width:140px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select><button id="btnAdminRefresh" class="btn secondary" style="width:auto">🔄</button></div>
    <div class="admin-grid" style="margin-top:12px">
      <div><h3 style="font-size:13px">👥 List User <span class="muted" id="userCount"></span></h3><div id="adminUserList" class="admin-list">Loading...</div></div>
      <div><h3 style="font-size:13px">🚩 Laporan Akun</h3><div id="adminReportList" class="admin-list">Loading...</div></div>
    </div>
  </div>

  <!-- MODAL DETAIL USER -->
  <div id="adminUserModal" class="modal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);align-items:center;justify-content:center;padding:16px">
    <div class="card" style="width:100%;max-width:480px;max-height:85vh;overflow:auto;position:relative">
      <button onclick="closeAdminModal()" class="btn secondary" style="position:absolute;right:10px;top:10px;width:auto;padding:6px 10px">✕</button>
      <div id="adminUserModalContent">Loading...</div>
    </div>
  </div>
  `;
}

// ===== VIEW SETTINGS - FITUR TETAP LENGKAP =====
export function viewAdminSettings(settings, profile=null){
  const s = settings||getAppSettings();
  const p = profile||{};
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, info])=>`<option value="${escapeAttr(code)}" ${s.activeKecamatanCode===code?'selected':''}>${escapeHtml(info.name)}</option>`).join('');
  return `
  <div class="admin-page">
    <h2>⚙️ Setting</h2>

    <div class="card">
      <h4 style="margin:0 0 10px">📍 Wilayah Aktif</h4>
      <label>Kecamatan Aktif
        <select id="setKecamatan" class="input">${kecOptions}</select>
      </label>
      <p class="muted" style="font-size:11px;margin-top:6px">Ganti wilayah tanpa edit file.</p>
    </div>

    <div class="card">
      <h4 style="margin:0 0 12px">💰 Setting Tarif</h4>
      <p class="muted" style="font-size:11px;margin:0 0 10px">Tarif live - langsung dipakai hitungTarif(). Kosongkan = pakai default.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:12px">🏍️ Motor - Base Fare</label>
          <input id="setMotorBase" type="number" class="input" value="${s.tarifMotorBase||3000}" placeholder="3000">
        </div>
        <div>
          <label style="font-size:12px">🏍️ Motor - Per Km</label>
          <input id="setMotorPerKm" type="number" class="input" value="${s.tarifMotorPerKm||2500}" placeholder="2500">
        </div>
        <div>
          <label style="font-size:12px">🏍️ Motor - Minimal</label>
          <input id="setMotorMin" type="number" class="input" value="${s.tarifMotorMin||5000}" placeholder="5000">
        </div>
        <div>
          <label style="font-size:12px">🔄 PP Multiplier</label>
          <input id="setPpMultiplier" type="number" step="0.1" class="input" value="${s.ppMultiplier||1.6}" placeholder="1.6">
        </div>
        <div>
          <label style="font-size:12px">🚗 Mobil - Base Fare</label>
          <input id="setMobilBase" type="number" class="input" value="${s.tarifMobilBase||8000}" placeholder="8000">
        </div>
        <div>
          <label style="font-size:12px">🚗 Mobil - Per Km</label>
          <input id="setMobilPerKm" type="number" class="input" value="${s.tarifMobilPerKm||5500}" placeholder="5500">
        </div>
        <div style="grid-column:1 / -1">
          <label style="font-size:12px">🚗 Mobil - Minimal</label>
          <input id="setMobilMin" type="number" class="input" value="${s.tarifMobilMin||15000}" placeholder="15000">
        </div>
      </div>
      <div class="card" style="margin:12px 0 0;background:var(--card2);border-style:dashed">
        <div style="font-size:11px" class="muted">Preview hitung:</div>
        <div style="font-size:12px;margin-top:4px">Motor 5km = <b id="previewMotor">-</b> | Mobil 5km = <b id="previewMobil">-</b></div>
      </div>
    </div>

    <div class="card">
      <h4 style="margin:0 0 10px">🎨 Tampilan</h4>
      <label>Nama App</label><input id="setAppName" class="input" value="${escapeAttr(s.appName||'')}">
      <label>Nama Pendek</label><input id="setAppShort" class="input" value="${escapeAttr(s.appShortName||'')}">
      <div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${escapeAttr(s.primaryColor||'#22c55e')}" class="input" style="height:42px;padding:4px"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${escapeAttr(s.secondaryColor||'#f59e0b')}" class="input" style="height:42px;padding:4px"></div></div>
      <label>Judul Disclaimer</label><input id="setDiscTitle" class="input" value="${escapeAttr(s.disclaimerTitle||'')}">
      <label>Isi Disclaimer</label><textarea id="setDiscText" class="input" style="min-height:120px">${escapeHtml(s.disclaimerText||'')}</textarea>
      <label>Footer</label><input id="setFooter" class="input" value="${escapeAttr(s.footerText||'')}">
      <div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Semua</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div>
      <div id="settingStatus" class="status"></div>
    </div>

    <div class="card"><h4 style="margin:0 0 8px">👑 Admin</h4><div class="muted" style="font-size:12px">Nama: <b style="color:var(--text)">${escapeHtml(p?.name||'-')}</b><br>Email: ${escapeHtml(p?.email||'-')}<br>Role: ${escapeHtml(p?.role||'-')}</div><div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Profil</button></div></div>
  </div>`;
}

// ===== RENDERERS =====
function renderUserList(users){
  const el=document.getElementById('adminUserList');
  const cnt=document.getElementById('userCount');
  if(!el) return;
  if(cnt) cnt.textContent=`(${users.length})`;
  if(!users.length){ el.innerHTML=`<div class="admin-list-item"><span class="muted">Tidak ada user</span></div>`; return; }
  el.innerHTML = users.map(u=>{
    const isBanned = u.banned || u.status==='banned';
    const badgeClass = isBanned ? 'badge-banned' : u.role==='admin' ? 'badge-admin' : u.role==='driver' ? 'badge-driver' : 'badge-passenger';
    const dotClass = isBanned ? 'err' : (['active','online'].includes(u.status) ? 'ok' : '');
    const icon = u.role==='driver' ? '🏍️' : u.role==='admin' ? '👑' : '👤';
    return `<div class="admin-list-item"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px"><span class="dot ${dotClass}" ${dotClass?'':`style="background:var(--muted)"`}></span>${icon} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.name||'Tanpa Nama')}</span> <span class="admin-badge ${badgeClass}">${isBanned?'BANNED':escapeHtml(u.role)}</span></div><div class="muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.email||'-')} ${u.hp?'• '+escapeHtml(u.hp):''}</div></div><div class="admin-actions"><button class="btn primary" style="width:auto;padding:6px 12px;font-size:11px" onclick="adminViewUser('${escapeAttr(u.id)}')">Detail</button></div></div>`;
  }).join('');
}

function renderReports(reports){
  const el=document.getElementById('adminReportList'); if(!el) return;
  if(!reports.length){ el.innerHTML=`<div class="admin-list-item"><span class="muted" style="font-size:12px">Belum ada laporan</span></div>`; return; }
  el.innerHTML = reports.map(r=>{
    const status = (r.status||'pending').toLowerCase();
    const col = status==='pending' ? 'var(--warning)' : status==='banned' ? 'var(--danger)' : 'var(--primary)';
    const reported = r.reported || {};
    const reporter = r.reporter || {};
    const reportedName = escapeHtml(reported.name || r.reported_id?.toString().slice(0,8) || 'User');
    const reporterName = escapeHtml(reporter.name || 'Anonim');
    const created = new Date(r.created_at).toLocaleString('id-ID');
    return `<div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:6px;border-left:3px solid ${col};padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:14px">🚩</div>
          <div>
            <div style="font-weight:800;font-size:13px">${reportedName} <span class="muted" style="font-weight:400;font-size:11px">dilaporkan oleh ${reporterName}</span></div>
            <div class="muted" style="font-size:10px">${created} • ${escapeHtml(reported.role||'user')} ${reported.email? '• '+escapeHtml(reported.email):''}</div>
          </div>
        </div>
        <span class="admin-badge" style="background:${col};color:${status==='pending'?'#111':'white'};height:fit-content">${escapeHtml(status)}</span>
      </div>
      <div style="background:var(--card2);border-radius:8px;padding:8px 10px">
        <div style="font-size:12px"><b>Alasan:</b> ${escapeHtml(r.reason||'-')}</div>
        ${r.description? `<div style="font-size:11px;margin-top:4px" class="muted">${escapeHtml(r.description)}</div>`:''}
      </div>
      ${status==='pending'?`<div class="row" style="margin-top:2px">
        <button class="btn secondary" style="flex:1;padding:7px;font-size:11px" onclick="adminViewUser('${escapeAttr(r.reported_id)}')">👁️ Detail Akun</button>
        <button class="btn secondary" style="flex:1;padding:7px;font-size:11px;color:var(--danger)" onclick="adminBanFromReport('${escapeAttr(r.reported_id)}','${escapeAttr(r.id)}')">🚫 Ban</button>
        <button class="btn secondary" style="flex:1;padding:7px;font-size:11px" onclick="adminReviewReport('${escapeAttr(r.id)}')">✅ Tolak Laporan</button>
      </div>`:''}
    </div>`;
  }).join('');
}

// ===== MODAL LOGIC =====
window.closeAdminModal = function(){
  const m=document.getElementById('adminUserModal');
  if(m){ m.style.display='none'; }
};

window.adminViewUser = async function(id){
  const modal=document.getElementById('adminUserModal');
  const box=document.getElementById('adminUserModalContent');
  if(!modal||!box) return;
  modal.style.display='flex';
  box.innerHTML='<div class="muted" style="padding:24px;text-align:center">⏳ Loading detail user...</div>';
  const res=await getUserDetail(id);
  if(!res){ box.innerHTML='<div class="muted" style="padding:16px">User tidak ditemukan</div>'; return; }
  const u=res.user; const isB=u.banned||u.status==='banned';
  const cleanHp = (u.hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62');
  box.innerHTML=`
    <div style="padding-right:36px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:48px;height:48px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">${escapeHtml((u.name||'U')[0].toUpperCase())}</div>
        <div>
          <div style="font-weight:800;font-size:16px">${escapeHtml(u.name||'-')} <span class="admin-badge ${isB?'badge-banned':u.role==='admin'?'badge-admin':u.role==='driver'?'badge-driver':'badge-passenger'}" style="vertical-align:middle">${isB?'BANNED':escapeHtml(u.role)}</span></div>
          <div class="muted" style="font-size:12px">Status: <b style="color:${isB?'var(--danger)':'var(--primary)'}">${escapeHtml(u.status||'-')}</b> • ID: ${escapeHtml(u.id.slice(0,8))}</div>
        </div>
      </div>
      <div style="margin-top:14px;display:grid;gap:8px;font-size:13px">
        <div><span class="muted">Email:</span> <b>${escapeHtml(u.email||'-')}</b></div>
        <div><span class="muted">HP:</span> <b>${escapeHtml(u.hp||'-')}</b></div>
        <div><span class="muted">Daftar:</span> ${new Date(u.created_at).toLocaleString('id-ID')}</div>
        ${u.banned_reason?`<div style="background:rgba(239,68,68,.1);border:1px solid var(--danger);border-radius:8px;padding:8px"><b style="color:var(--danger)">Alasan Ban:</b> ${escapeHtml(u.banned_reason)}<br><span class="muted" style="font-size:11px">${u.banned_at? new Date(u.banned_at).toLocaleString('id-ID'):''}</span></div>`:''}
      </div>
      <div style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">📦 ${res.orders.length} Order Terbaru</b></div>
        <div style="max-height:180px;overflow:auto;margin-top:8px;border:1px solid var(--border);border-radius:8px">
          ${res.orders.length? res.orders.map(o=>`<div style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;align-items:center"><div><div>${new Date(o.created_at).toLocaleDateString('id-ID')} • ${escapeHtml(o.status)}</div><div class="muted" style="font-size:11px">Rp${(o.total_fare||0).toLocaleString('id-ID')}</div></div><span class="admin-badge ${o.status==='completed'?'badge-passenger':''}">${escapeHtml(o.status)}</span></div>`).join('') : '<div class="muted" style="padding:12px;text-align:center">Tidak ada order</div>'}
        </div>
      </div>
      <div style="margin-top:18px;display:grid;gap:8px">
        <div class="row" style="gap:8px">
          ${isB?`<button class="btn primary" style="flex:1" onclick="adminUnbanUser('${escapeAttr(u.id)}')">✅ Unban User</button>`:`<button class="btn secondary" style="flex:1;color:var(--danger);border-color:var(--danger)" onclick="adminBanUser('${escapeAttr(u.id)}')">🚫 Ban User</button>`}
          <button class="btn secondary" style="flex:1" onclick="window.open('https://wa.me/${cleanHp}','_blank')">💬 WA</button>
        </div>
        <button class="btn secondary" style="width:100%" onclick="closeAdminModal()">Tutup</button>
      </div>
    </div>
  `;
};

window.adminBanUser = async function(id){
  const reason=prompt('Alasan ban?', 'Pelanggaran kebijakan'); if(reason===null) return;
  if(!confirm('Yakin BAN user ini?')) return;
  try{ await banUser(id, reason); alert('Berhasil ban'); closeAdminModal(); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminUnbanUser = async function(id){
  if(!confirm('Yakin UNBAN user ini?')) return;
  try{ await unbanUser(id); alert('Berhasil unban'); closeAdminModal(); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminBanFromReport = async function(uid, rid){
  const r=prompt('Alasan ban?', 'Laporan valid'); if(!r) return;
  try{ await banUser(uid, r); await supabase.from('reports').update({ status:'banned' }).eq('id', rid); alert('User di-ban dari laporan'); document.getElementById('btnAdminRefresh')?.click(); }catch(e){ alert('Gagal: '+e.message); }
};
window.adminReviewReport = async function(rid){
  if(!confirm('Tandai laporan sebagai ditolak?')) return;
  try{ await supabase.from('reports').update({ status:'reviewed' }).eq('id', rid); const reports=await getReports(); renderReports(reports); }catch(e){ alert('Gagal: '+e.message); }
};

// ===== INIT =====
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
  // close modal klik luar
  document.getElementById('adminUserModal')?.addEventListener('click', (e)=>{ if(e.target.id==='adminUserModal') closeAdminModal(); });
}

export async function initAdminSettingsPage(){
  const cur=getAppSettings();
  const calcPreview=()=>{
    const getVal=(id, def)=>{ const el=document.getElementById(id); const v=el?parseFloat(el.value):def; return isNaN(v)?def:v; };
    const mBase=getVal('setMotorBase', cur.tarifMotorBase||3000);
    const mPer=getVal('setMotorPerKm', cur.tarifMotorPerKm||2500);
    const mMin=getVal('setMotorMin', cur.tarifMotorMin||5000);
    const mbBase=getVal('setMobilBase', cur.tarifMobilBase||8000);
    const mbPer=getVal('setMobilPerKm', cur.tarifMobilPerKm||5500);
    const mbMin=getVal('setMobilMin', cur.tarifMobilMin||15000);
    const dist=5;
    let motorCost=mBase + dist*mPer; motorCost=Math.max(motorCost, mMin); motorCost=Math.round(motorCost/500)*500;
    let mobilCost=mbBase + dist*mbPer; mobilCost=Math.max(mobilCost, mbMin); mobilCost=Math.round(mobilCost/500)*500;
    const elM=document.getElementById('previewMotor'); if(elM) elM.textContent='Rp'+motorCost.toLocaleString('id-ID');
    const elMb=document.getElementById('previewMobil'); if(elMb) elMb.textContent='Rp'+mobilCost.toLocaleString('id-ID');
  };
  ['setMotorBase','setMotorPerKm','setMotorMin','setMobilBase','setMobilPerKm','setMobilMin','setPpMultiplier'].forEach(id=>{
    document.getElementById(id)?.addEventListener('input', calcPreview);
  });
  calcPreview();

  const btnSave=document.getElementById('btnSaveSettings');
  const btnReset=document.getElementById('btnResetSettings');
  const statusEl=document.getElementById('settingStatus');
  if(btnSave){
    btnSave.onclick=async()=>{
      const parseNum=(id, def)=>{ const el=document.getElementById(id); if(!el) return def; const v=parseFloat(el.value); return isNaN(v)?def:v; };
      const ns={
        ...cur,
        activeKecamatanCode: document.getElementById('setKecamatan')?.value || cur.activeKecamatanCode,
        appName: document.getElementById('setAppName')?.value || cur.appName,
        appShortName: document.getElementById('setAppShort')?.value || cur.appShortName,
        primaryColor: document.getElementById('setPrimary')?.value || cur.primaryColor,
        secondaryColor: document.getElementById('setSecondary')?.value || cur.secondaryColor,
        disclaimerTitle: document.getElementById('setDiscTitle')?.value || cur.disclaimerTitle,
        disclaimerText: document.getElementById('setDiscText')?.value || cur.disclaimerText,
        footerText: document.getElementById('setFooter')?.value || cur.footerText,
        tarifMotorBase: parseNum('setMotorBase', 3000),
        tarifMotorPerKm: parseNum('setMotorPerKm', 2500),
        tarifMotorMin: parseNum('setMotorMin', 5000),
        tarifMobilBase: parseNum('setMobilBase', 8000),
        tarifMobilPerKm: parseNum('setMobilPerKm', 5500),
        tarifMobilMin: parseNum('setMobilMin', 15000),
        ppMultiplier: parseNum('setPpMultiplier', 1.6),
      };
      if(statusEl) statusEl.textContent='⏳ Menyimpan...';
      btnSave.disabled=true; btnSave.textContent='Menyimpan...';
      try{
        await saveAppSettings(ns);
        if(statusEl){ statusEl.textContent='✅ Berhasil disimpan!'; statusEl.style.color='var(--primary)'; }
        setTimeout(()=> location.reload(), 600);
      }catch(e){
        if(statusEl){ statusEl.textContent='❌ Gagal: '+e.message; statusEl.style.color='var(--danger)'; }
        btnSave.disabled=false; btnSave.textContent='💾 Simpan Semua';
      }
    };
  }
  if(btnReset){
    btnReset.onclick=()=>{ if(!confirm('Reset ke default?')) return; localStorage.removeItem('app_settings'); localStorage.removeItem('active_kecamatan_code'); location.reload(); };
  }
  document.getElementById('btnLogout')?.addEventListener('click', async()=>{ try{ await supabase.auth.signOut(); }catch(e){} localStorage.clear(); location.href='/'; });
  document.getElementById('btnGoProfile')?.addEventListener('click', ()=>{ location.hash='#/profile'; });
}

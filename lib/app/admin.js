// admin.js - Modul Admin Ojol Trenggalek
// Fitur: User (aktif/online/banned/detail/ban/unban), Laporan (ban/tolak/selesai), History, Setting
// Dependencies: supabase.js, config.js (KECAMATAN_DATA, APP_SETTINGS_DEFAULT, getTarifLive, hitungTarif)

import { supabase } from './supabase.js';
import { KECAMATAN_DATA, APP_SETTINGS_DEFAULT, getTarifLive, hitungTarif, getActiveKecamatanLive } from './config.js';

// ===================== USERS =====================
export async function getUsers(filter='all', search=''){
  let query = supabase.from('users').select('*').order('created_at',{ascending:false}).limit(200);
  const { data, error } = await query;
  if(error) throw error;
  let list = data || [];

  // Ambil last_seen driver dari driver_locations
  // Schema: driver_id uuid, lokasi USER-DEFINED (geography), heading double, updated_at timestamptz, speed_kmh numeric
  try{
    const driverIds = list.filter(u => (u.role||'').toLowerCase().includes('driver')).map(u => u.id).filter(Boolean);
    if(driverIds.length){
      const { data: locs, error: locErr } = await supabase.from('driver_locations')
        .select('driver_id, lokasi, heading, updated_at, speed_kmh')
        .in('driver_id', driverIds)
        .order('updated_at',{ascending:false});
      if(!locErr && locs){
        const locMap = {};
        // ambil yang paling baru per driver_id (karena bisa multiple rows)
        (locs||[]).forEach(l => {
          if(!locMap[l.driver_id]){
            locMap[l.driver_id] = l;
          }
        });
        list = list.map(u => {
          if(locMap[u.id]){
            const loc = locMap[u.id];
            return { 
              ...u, 
              last_seen: loc.updated_at, 
              _driverLoc: loc,
              _lat: loc.lokasi ? null : null // lokasi akan diparse di detail jika perlu
            };
          }
          return u;
        });
      }
    }
  }catch(e){
    console.warn('driver_locations fetch fail', e);
  }

  // Normalisasi banned: cek status, banned, is_banned
  list = list.map(u => ({
    ...u,
    _isBanned: (u.status==='banned') || u.banned===true || u.is_banned===true,
    _isOnline: u.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) < 10*60*1000 : false,
    _lastSeenSource: u._driverLoc ? 'driver_locations.updated_at' : (u.last_seen ? 'users.last_seen' : (u.last_sign_in_at ? 'last_sign_in_at' : '-'))
  }));

  if(filter==='banned'){
    list = list.filter(u => u._isBanned);
  } else if(filter==='active'){
    list = list.filter(u => !u._isBanned);
  } else if(filter==='online'){
    list = list.filter(u => {
      const isDriver = (u.role||'').toLowerCase().includes('driver');
      if(isDriver) return u._isOnline && !u._isBanned;
      return false;
    });
  }

  if(search){
    const s = search.toLowerCase();
    list = list.filter(u => 
      (u.name||'').toLowerCase().includes(s) ||
      (u.email||'').toLowerCase().includes(s) ||
      (u.desa||'').toLowerCase().includes(s) ||
      (u.role||'').toLowerCase().includes(s) ||
      (u.hp||'').toLowerCase().includes(s) ||
      (u.warung_name||'').toLowerCase().includes(s)
    );
  }
  return list;
}


export async function banUser(userId, reason='Pelanggaran kebijakan'){
  const { error } = await supabase.from('users').update({
    status:'banned',
    banned_reason: reason,
    banned_at: new Date().toISOString()
  }).eq('id', userId);
  if(error) throw error;
  // log
  try{
    await supabase.from('user_reports').insert({
      reported_id: userId,
      reason,
      category: 'admin_action',
      action: 'ban',
      status: 'resolved',
      created_at: new Date().toISOString()
    });
  }catch(e){}
  return true;
}

export async function unbanUser(userId){
  const { error } = await supabase.from('users').update({
    status:'active',
    banned_reason: null,
    banned_at: null
  }).eq('id', userId);
  if(error) throw error;
  return true;
}

export async function getUserDetail(userId){
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if(error) throw error;
  return data;
}

// ===================== LAPORAN =====================
export async function getReports(status='all'){
  try{
    let q = supabase.from('user_reports').select('*').order('created_at',{ascending:false}).limit(80);
    if(status!=='all') q = q.eq('status', status);
    const { data, error } = await q;
    if(error) throw error;
    return data||[];
  }catch(e){
    console.warn('user_reports belum ada', e);
    return [];
  }
}

export async function handleReport(reportId, action, reportedUserId=null){
  // action: ban | reject | done
  if(action==='ban' && reportedUserId){
    await banUser(reportedUserId, 'Hasil laporan #'+String(reportId).slice(0,6));
  }
  const newStatus = action==='reject' ? 'rejected' : 'resolved';
  const { error } = await supabase.from('user_reports').update({
    status: newStatus,
    action,
    handled_at: new Date().toISOString()
  }).eq('id', reportId);
  if(error) throw error;
  return true;
}

// ===================== HISTORY =====================
export async function getHistoryStats(){
  const today = new Date(); today.setHours(0,0,0,0);
  const iso = today.toISOString();
  const [ojolRes, foodRes] = await Promise.all([
    supabase.from('orders').select('id,total,status').gte('created_at', iso),
    supabase.from('food_orders').select('id,total,status').gte('created_at', iso)
  ]);
  const ojolData = ojolRes.data||[];
  const foodData = foodRes.data||[];
  const revenue = [...ojolData, ...foodData].reduce((s,o)=> s + Number(o.total||o.estimated_cost||0), 0);
  return {
    totalToday: ojolData.length + foodData.length,
    ojolToday: ojolData.length,
    foodToday: foodData.length,
    revenueToday: revenue
  };
}

export async function getLastTransactions(limit=20){
  const [ojol, food] = await Promise.all([
    supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(limit),
    supabase.from('food_orders').select('*').order('created_at',{ascending:false}).limit(limit)
  ]);
  const combined = [
    ...(ojol.data||[]).map(o=>({...o,_type:'ojol'})),
    ...(food.data||[]).map(o=>({...o,_type:'food'}))
  ].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0, limit);
  return combined;
}

// ===================== SETTING =====================
export function getSettingsLive(){
  try{
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_settings') : null;
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export function saveSettings(newSettings){
  const merged = { ...getSettingsLive(), ...newSettings };
  if(typeof localStorage !== 'undefined'){
    localStorage.setItem('app_settings', JSON.stringify(merged));
    if(newSettings.activeKecamatanCode){
      localStorage.setItem('active_kecamatan_code', newSettings.activeKecamatanCode);
    }
  }
  return merged;
}

// ===================== UI RENDER =====================

// ===================== AUTH ADMIN =====================
export async function logoutAdmin(){
  try{
    // cek apakah super admin
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Logout admin:', session?.user?.email);
  }catch(e){}
  try{
    await supabase.auth.signOut();
  }catch(e){ console.warn('signOut fail', e); }
  try{
    if(typeof localStorage !== 'undefined'){
      // hapus session admin saja, jangan hapus app_settings kalau mau dipertahankan
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      localStorage.removeItem('supabase.auth.token');
      // optional: clear semua supabase keys
      Object.keys(localStorage).forEach(k=>{
        if(k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k);
      });
    }
  }catch(e){}
  // redirect ke login / home
  if(typeof window !== 'undefined'){
    window.location.hash = '#/login';
    setTimeout(()=> window.location.reload(), 300);
  }
  return true;
}

export async function isAdmin(){
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return false;
    const { data } = await supabase.from('users').select('is_super_admin, role').eq('id', user.id).single();
    return data?.is_super_admin===true || (data?.role||'').toLowerCase()==='admin' || (user.email||'').includes('admin');
  }catch(e){ return false; }
}


export function viewAdminPanel(){
  const s = getSettingsLive();
  const activeKec = getActiveKecamatanLive();
  const kecOptions = Object.entries(KECAMATAN_DATA).map(([code, d]) => 
    `<option value="${code}" ${s.activeKecamatanCode===code?'selected':''}>${d.name}</option>`
  ).join('');
  const tarif = getTarifLive();
  const previewMotor = hitungTarif(5,'motor','oneway');
  const previewMobil = hitungTarif(5,'mobil','oneway');

  return `
  <div id="adminPanel" style="max-width:1100px;margin:0 auto;padding:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="margin:0;font-size:18px;font-weight:800">🛡️ Admin Panel <span class="muted" style="font-size:11px;font-weight:400">• ${activeKec.name} • ${s.appName}</span></h2>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge" style="background:var(--card2);border:1px solid var(--border)">v2 - config baru</span>
        <button id="btnAdminLogout" class="btn secondary" style="padding:6px 12px;font-size:11px;width:auto;background:#1e293b;color:#f87171;border:1px solid #ef4444">🚪 Logout</button>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
      <button data-admin-tab="users" class="btn primary" style="white-space:nowrap">👥 Users</button>
      <button data-admin-tab="reports" class="btn secondary" style="white-space:nowrap;opacity:1">🚩 Laporan</button>
      <button data-admin-tab="history" class="btn secondary" style="white-space:nowrap;opacity:1">📜 History</button>
      <button data-admin-tab="setting" class="btn secondary" style="white-space:nowrap;opacity:1">⚙️ Setting</button>
    </div>

    <div id="adminContent">
      <div class="card" style="text-align:center;padding:20px"><span class="muted">Pilih tab untuk memuat data</span></div>
    </div>

    <!-- Modal Detail -->
    <div id="adminUserModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:20px;max-width:420px;width:100%;overflow:hidden">
        <div style="padding:16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)"><b id="modalTitle">Detail User</b><button id="closeModal" class="btn secondary" style="width:auto;padding:6px 10px">✕</button></div>
        <div id="modalBody" style="padding:16px;font-size:13px;line-height:1.6"></div>
      </div>
    </div>
  </div>

  <div id="adminTemplates" style="display:none">
    <div data-tpl="settingForm">
      <div class="card">
        <h3 style="margin:0 0 12px">⚙️ Konfigurasi Aplikasi</h3>
        <label>Nama Aplikasi<input id="setAppName" value="${s.appName}" placeholder="Ojol Trenggalek"></label>
        <label>Kecamatan Aktif<select id="setKecActive">${kecOptions}</select><span class="muted" style="font-size:10px">Live: ${activeKec.name} • Center ${activeKec.center.lat.toFixed(4)}, ${activeKec.center.lng.toFixed(4)}</span></label>
        <div class="row"><label style="flex:1">Primary Color<input id="setPrimary" type="color" value="${s.primaryColor}"></label><label style="flex:1">Secondary<input id="setSecondary" type="color" value="${s.secondaryColor}"></label></div>
        <h4 style="margin:16px 0 8px;font-size:13px">🏍️ Tarif Motor</h4>
        <div class="row"><label style="flex:1">Base<input id="setMotorBase" type="number" value="${s.tarifMotorBase}"></label><label style="flex:1">Per Km<input id="setMotorPerKm" type="number" value="${s.tarifMotorPerKm}"></label><label style="flex:1">Min<input id="setMotorMin" type="number" value="${s.tarifMotorMin}"></label></div>
        <h4 style="margin:16px 0 8px;font-size:13px">🚗 Tarif Mobil</h4>
        <div class="row"><label style="flex:1">Base<input id="setMobilBase" type="number" value="${s.tarifMobilBase}"></label><label style="flex:1">Per Km<input id="setMobilPerKm" type="number" value="${s.tarifMobilPerKm}"></label><label style="flex:1">Min<input id="setMobilMin" type="number" value="${s.tarifMobilMin}"></label></div>
        <label>PP Multiplier (Pulang Pergi)<input id="setPP" type="number" step="0.1" value="${s.ppMultiplier}"><span class="muted" style="font-size:10px">Contoh 1.6 = 60% tambahan</span></label>
        <div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:10px;margin-top:10px">
          <b style="font-size:11px">Preview 5km:</b><br><span style="font-size:12px">Motor Rp ${previewMotor.toLocaleString('id-ID')} | Mobil Rp ${previewMobil.toLocaleString('id-ID')}</span><br><span class="muted" style="font-size:10px">Base + (jarak × perKm) × multiplier PP</span>
        </div>
        <label style="margin-top:16px">Footer Text<input id="setFooter" value="${s.footerText}"></label>
        <label>Disclaimer<textarea id="setDisclaimer" rows="4">${s.disclaimerText||''}</textarea></label>
        <button id="btnSaveSetting" class="btn primary" style="margin-top:14px">💾 Simpan Setting</button>
        <p id="settingStatus" class="muted" style="font-size:11px;margin-top:8px"></p>
      </div>
    </div>
  </div>
  `;
}

function renderUsersTable(users){
  if(!users.length) return `<div class="card" style="text-align:center;padding:24px">📭 Tidak ada user</div>`;
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="padding:12px;display:flex;gap:8px"><input id="adminUserSearch" placeholder="Cari nama/email/desa..." style="flex:1"><select id="adminUserFilter"><option value="all">Semua</option><option value="active">Aktif</option><option value="online">Online</option><option value="banned">Banned</option></select></div>
    <div style="overflow:auto"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="background:var(--card2)"><th style="text-align:left;padding:10px 12px">User</th><th style="padding:10px">Role</th><th style="padding:10px">Status</th><th style="padding:10px">Desa</th><th style="padding:10px">Aksi</th></tr></thead><tbody>
    ${users.map(u=>{
      const st = u.status||'active';
      const isOnline = u.last_seen && (Date.now() - new Date(u.last_seen).getTime()) < 5*60*1000;
      const statusLabel = st==='banned' ? '🚫 BANNED' : isOnline ? '🟢 ONLINE' : '✅ AKTIF';
      const statusColor = st==='banned' ? '#ef4444' : isOnline ? '#22c55e' : 'var(--muted)';
      return `<tr style="border-top:1px solid var(--border)">
        <td style="padding:10px 12px"><div style="font-weight:700">${u.name||'Tanpa Nama'}</div><div style="font-size:10px;color:var(--muted)">${u.email||'-'}<br>${u.hp||''}</div></td>
        <td style="padding:10px;text-align:center"><span class="badge">${u.role||'passenger'}</span></td>
        <td style="padding:10px;text-align:center"><span style="font-size:10px;font-weight:800;color:${statusColor}">${statusLabel}</span><br><span style="font-size:9px;color:var(--muted)">${u.last_seen ? new Date(u.last_seen).toLocaleTimeString('id-ID') : ''}</span></td>
        <td style="padding:10px;text-align:center;font-size:11px">${u.desa||'-'}</td>
        <td style="padding:10px"><div style="display:flex;gap:6px;flex-wrap:wrap"><button data-user-detail="${u.id}" class="btn secondary" style="padding:5px 8px;font-size:10px;width:auto">Detail</button>${st==='banned'?`<button data-user-unban="${u.id}" class="btn secondary" style="padding:5px 8px;font-size:10px;width:auto">Unban</button>`:`<button data-user-ban="${u.id}" class="btn" style="padding:5px 8px;font-size:10px;width:auto;background:#ef4444;color:white">Ban</button>`}</div></td>
      </tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}

function renderReportsTable(reports){
  if(!reports.length) return `<div class="card" style="text-align:center;padding:24px">✅ Tidak ada laporan pending<br><span class="muted" style="font-size:11px">Semua aman di ${getActiveKecamatanLive().name}</span></div>`;
  return `<div class="card" style="padding:0;overflow:hidden"><div style="overflow:auto"><table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="background:var(--card2)"><th style="text-align:left;padding:10px">Terlapor</th><th style="padding:10px">Alasan</th><th style="padding:10px">Kategori</th><th style="padding:10px">Aksi</th></tr></thead><tbody>
    ${reports.map(r=>`<tr style="border-top:1px solid var(--border)"><td style="padding:10px"><div style="font-weight:700">${(r.reported_id||'').toString().slice(0,8)}</div><div style="font-size:9px;color:var(--muted)">${r.reporter_id ? 'Pelapor: '+String(r.reporter_id).slice(0,6) : ''}<br>${new Date(r.created_at).toLocaleString('id-ID')}</div></td><td style="padding:10px;max-width:160px;word-break:break-word">${r.reason||'-'}</td><td style="padding:10px"><span class="badge" style="font-size:9px">${r.category||'umum'}</span><br><span style="font-size:9px;color:var(--muted)">${r.status||'pending'}</span></td><td style="padding:10px"><div style="display:flex;gap:4px;flex-wrap:wrap"><button data-report-ban="${r.id}" data-reported="${r.reported_id}" class="btn" style="padding:4px 7px;font-size:10px;width:auto;background:#ef4444;color:white">Ban</button><button data-report-reject="${r.id}" class="btn secondary" style="padding:4px 7px;font-size:10px;width:auto">Tolak</button><button data-report-done="${r.id}" class="btn secondary" style="padding:4px 7px;font-size:10px;width:auto">Selesai</button></div></td></tr>`).join('')}
  </tbody></table></div></div>`;
}

function renderHistory(stats, last){
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    <div class="card" style="border-left:4px solid #22c55e"><div class="muted" style="font-size:10px">TRANSAKSI HARI INI</div><div style="font-size:20px;font-weight:800;margin-top:4px">${stats.totalToday}</div><div style="font-size:11px;color:var(--muted)">🏍️ ${stats.ojolToday} ojol + 🍔 ${stats.foodToday} food</div></div>
    <div class="card" style="border-left:4px solid #f59e0b"><div class="muted" style="font-size:10px">ESTIMASI PENDAPATAN</div><div style="font-size:18px;font-weight:800;margin-top:4px">Rp ${Number(stats.revenueToday).toLocaleString('id-ID')}</div><div style="font-size:11px;color:var(--muted)">Hari ini</div></div>
  </div>
  <div class="card" style="padding:0;overflow:hidden"><div style="padding:12px"><b style="font-size:13px">📜 ${last.length} Transaksi Terakhir</b></div><div style="overflow:auto"><table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="background:var(--card2)"><th style="padding:8px;text-align:left">Waktu</th><th style="padding:8px">Tipe</th><th style="padding:8px">Total</th><th style="padding:8px">Status</th></tr></thead><tbody>
  ${last.map(o=>{
    const date = new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const isFood = o._type==='food';
    const badge = isFood ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:6px;font-size:9px">FOOD</span>' : '<span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:6px;font-size:9px">OJOL</span>';
    const total = Number(o.total||o.estimated_cost||0).toLocaleString('id-ID');
    return `<tr style="border-top:1px solid var(--border)"><td style="padding:8px">${date}</td><td style="padding:8px;text-align:center">${badge}</td><td style="padding:8px;font-weight:700">Rp ${total}</td><td style="padding:8px"><span style="font-size:10px;padding:2px 6px;border-radius:6px;background:${o.status==='completed'?'#dcfce7':'#fee2e2'};color:${o.status==='completed'?'#166534':'#991b1b'}">${(o.status||'-').toUpperCase()}</span></td></tr>`;
  }).join('')}
  </tbody></table></div></div>`;
}

// ===================== EVENT BINDING =====================
export function bindAdminEvents(){
  if(window._adminBound) return; window._adminBound = true;

  document.addEventListener('click', async (e)=>{
    // Tabs
    const tab = e.target.closest('[data-admin-tab]');
    if(tab){
      const type = tab.getAttribute('data-admin-tab');
      document.querySelectorAll('[data-admin-tab]').forEach(b=>{
        b.className = b.getAttribute('data-admin-tab')===type ? 'btn primary' : 'btn secondary';
        b.style.opacity = '1';
      });
      const con = document.getElementById('adminContent');
      if(!con) return;
      con.innerHTML = '<div class="card" style="text-align:center;padding:20px">⏳ Memuat...</div>';
      try{
        if(type==='users'){
          const users = await getUsers('all','');
          con.innerHTML = renderUsersTable(users);
        }else if(type==='reports'){
          const reps = await getReports('pending');
          con.innerHTML = renderReportsTable(reps);
        }else if(type==='history'){
          const [stats, last] = await Promise.all([getHistoryStats(), getLastTransactions(20)]);
          con.innerHTML = renderHistory(stats, last);
        }else if(type==='setting'){
          const tpl = document.querySelector('[data-tpl="settingForm"]');
          con.innerHTML = tpl ? tpl.innerHTML : '<div class="card">Setting form tidak ditemukan</div>';
          // re-bind save after render
          setTimeout(()=>{
            const btn = document.getElementById('btnSaveSetting');
            if(btn){
              btn.onclick = ()=>{
                const ns = {
                  appName: document.getElementById('setAppName')?.value,
                  activeKecamatanCode: document.getElementById('setKecActive')?.value,
                  primaryColor: document.getElementById('setPrimary')?.value,
                  secondaryColor: document.getElementById('setSecondary')?.value,
                  tarifMotorBase: Number(document.getElementById('setMotorBase')?.value),
                  tarifMotorPerKm: Number(document.getElementById('setMotorPerKm')?.value),
                  tarifMotorMin: Number(document.getElementById('setMotorMin')?.value),
                  tarifMobilBase: Number(document.getElementById('setMobilBase')?.value),
                  tarifMobilPerKm: Number(document.getElementById('setMobilPerKm')?.value),
                  tarifMobilMin: Number(document.getElementById('setMobilMin')?.value),
                  ppMultiplier: Number(document.getElementById('setPP')?.value),
                  footerText: document.getElementById('setFooter')?.value,
                  disclaimerText: document.getElementById('setDisclaimer')?.value
                };
                saveSettings(ns);
                const st = document.getElementById('settingStatus');
                if(st){ st.textContent = '✅ Tersimpan! Reload untuk apply kecamatan baru.'; st.style.color='#22c55e'; }
                // update preview
                try{
                  const live = getTarifLive();
                  // preview recalc not needed now
                }catch(e){}
              };
            }
          }, 50);
        }
      }catch(err){
        con.innerHTML = `<div class="card">❌ Error: ${err.message}</div>`;
      }
      return;
    }

    // User actions
    const detailBtn = e.target.closest('[data-user-detail]');
    if(detailBtn){
      const id = detailBtn.getAttribute('data-user-detail');
      try{
        const u = await getUserDetail(id);
        const modal = document.getElementById('adminUserModal');
        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        if(modal && body){
          if(title) title.textContent = u.name||'Detail User';
          body.innerHTML = `
            <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
              <div style="width:48px;height:48px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:800">${(u.name||'U').charAt(0)}</div>
              <div><div style="font-weight:800">${u.name||'-'}</div><div style="font-size:11px;color:var(--muted)">${u.role||'-'} • ${u.status||'active'} • ${u.desa||'-'}</div></div>
            </div>
            <div style="display:grid;gap:8px;font-size:12px">
              <div><span class="muted">Email:</span> ${u.email||'-'}</div>
              <div><span class="muted">HP:</span> ${u.hp||'-'}</div>
              <div><span class="muted">Alamat:</span> ${u.alamat||u.address||'-'}</div>
              <div><span class="muted">Koordinat:</span> ${u.merchant_lat||u.lat||'-'}, ${u.merchant_lng||u.lng||'-'}</div>
              ${u._driverLoc ? `<div style="background:#dcfce7;padding:8px;border-radius:8px;margin-top:6px"><div style="font-weight:700;font-size:11px">📍 driver_locations</div><div style="font-size:10px">Updated: ${new Date(u._driverLoc.updated_at).toLocaleString('id-ID')}<br>Heading: ${u._driverLoc.heading||'-'}° • Speed: ${u._driverLoc.speed_kmh||0} km/h<br>Lokasi: ${u._driverLoc.lokasi ? (typeof u._driverLoc.lokasi==='string' ? u._driverLoc.lokasi.slice(0,60) : JSON.stringify(u._driverLoc.lokasi).slice(0,60)) : '-'}</div></div>` : '<div style="font-size:10px;color:var(--muted);margin-top:6px">Tidak ada data driver_locations</div>'}
              <div><span class="muted">ID:</span> ${u.id}</div>
              <div><span class="muted">Last Seen:</span> ${u.last_seen ? new Date(u.last_seen).toLocaleString('id-ID') : '-'}</div>
              ${u.banned_reason ? `<div style="background:#fee2e2;padding:8px;border-radius:8px;color:#991b1b"><b>Banned:</b> ${u.banned_reason}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;margin-top:16px">
              <a href="https://wa.me/${(u.hp||'').replace(/[^0-9]/g,'')}" target="_blank" class="btn secondary" style="flex:1;text-align:center">💬 WA</a>
              ${u.status==='banned'?`<button data-user-unban="${u.id}" class="btn primary" style="flex:1">Unban</button>`:`<button data-user-ban="${u.id}" class="btn" style="flex:1;background:#ef4444;color:white">Ban User</button>`}
            </div>
          `;
          modal.style.display='flex';
        }
      }catch(err){ alert('Gagal load detail: '+err.message); }
      return;
    }

    const banBtn = e.target.closest('[data-user-ban]');
    if(banBtn){
      const id = banBtn.getAttribute('data-user-ban');
      const reason = prompt('Alasan ban?','Pelanggaran kebijakan');
      if(reason===null) return;
      banBtn.textContent='...';
      try{ await banUser(id, reason); alert('User dibanned'); location.reload(); }catch(err){ alert('Gagal: '+err.message); banBtn.textContent='Ban'; }
      return;
    }
    const unbanBtn = e.target.closest('[data-user-unban]');
    if(unbanBtn){
      const id = unbanBtn.getAttribute('data-user-unban');
      if(!confirm('Unban user ini?')) return;
      unbanBtn.textContent='...';
      try{ await unbanUser(id); alert('User di-unban'); location.reload(); }catch(err){ alert('Gagal: '+err.message); }
      return;
    }

    // Report actions
    const rBan = e.target.closest('[data-report-ban]');
    if(rBan){
      const rid = rBan.getAttribute('data-report-ban');
      const reported = rBan.getAttribute('data-reported');
      if(!confirm('Ban terlapor dari laporan ini?')) return;
      rBan.textContent='...';
      try{ await handleReport(rid,'ban',reported); alert('Terlapor dibanned & laporan selesai'); rBan.closest('tr')?.remove(); }catch(err){ alert(err.message); }
      return;
    }
    const rReject = e.target.closest('[data-report-reject]');
    if(rReject){
      const rid = rReject.getAttribute('data-report-reject');
      if(!confirm('Tolak laporan ini?')) return;
      try{ await handleReport(rid,'reject'); alert('Laporan ditolak'); rReject.closest('tr')?.remove(); }catch(err){ alert(err.message); }
      return;
    }
    const rDone = e.target.closest('[data-report-done]');
    if(rDone){
      const rid = rDone.getAttribute('data-report-done');
      try{ await handleReport(rid,'done'); rDone.closest('tr')?.remove(); }catch(err){ alert(err.message); }
      return;
    }

    const logoutBtn = e.target.closest('#btnAdminLogout');
    if(logoutBtn){
      if(!confirm('Logout dari Admin Panel?')) return;
      logoutBtn.textContent='...';
      await logoutAdmin();
      return;
    }

    const closeModal = e.target.closest('#closeModal');
    if(closeModal){
      const m = document.getElementById('adminUserModal');
      if(m) m.style.display='none';
    }
  });

  // close modal click outside
  document.addEventListener('click', (e)=>{
    const modal = document.getElementById('adminUserModal');
    if(modal && e.target===modal) modal.style.display='none';
  });

  // filter & search for users
  document.addEventListener('change', async (e)=>{
    if(e.target.id==='adminUserFilter'){
      const filter = e.target.value;
      const search = document.getElementById('adminUserSearch')?.value||'';
      try{
        const users = await getUsers(filter, search);
        const con = document.getElementById('adminContent');
        if(con) con.innerHTML = renderUsersTable(users);
        // restore filter value
        setTimeout(()=>{ const f=document.getElementById('adminUserFilter'); if(f) f.value=filter; const s=document.getElementById('adminUserSearch'); if(s){ s.value=search; s.focus(); } }, 50);
      }catch(err){}
    }
  });
  document.addEventListener('input', async (e)=>{
    if(e.target.id==='adminUserSearch'){
      const search = e.target.value;
      const filter = document.getElementById('adminUserFilter')?.value||'all';
      // debounce simple
      clearTimeout(window._adminSearchT);
      window._adminSearchT = setTimeout(async ()=>{
        try{
          const users = await getUsers(filter, search);
          const con = document.getElementById('adminContent');
          if(con){
            const oldFilter = filter;
            const oldSearch = search;
            con.innerHTML = renderUsersTable(users);
            setTimeout(()=>{ const f=document.getElementById('adminUserFilter'); if(f) f.value=oldFilter; const s=document.getElementById('adminUserSearch'); if(s){ s.value=oldSearch; s.focus(); const l=s.value.length; s.setSelectionRange(l,l); } }, 10);
          }
        }catch(err){}
      }, 400);
    }
  });
}

// views.js - FINAL sesuai style.css dark theme + login original + admin setting dengan logout & push
import { ACTIVE_KECAMATAN_NAME, APP_SETTINGS } from './config.js';

export function viewLogin(){
  return `
  <div style="max-width:420px;margin:40px auto;text-align:center;padding:0 4px">
    <div style="font-size:48px;margin-bottom:12px">🛵</div>
    <h1 style="margin:0;font-weight:800;letter-spacing:.5px">${APP_SETTINGS?.appName||'OJOL SURUH'}</h1>
    <p class="muted" style="margin:8px 0 20px;font-size:13px">Ojek Online Kecamatan ${ACTIVE_KECAMATAN_NAME||'Suruh'} • Pickup ${ACTIVE_KECAMATAN_NAME||'Suruh'}, tujuan se-Trenggalek</p>
    <div class="card" style="text-align:left">
      <p style="font-size:13px;margin:0 0 12px">Login untuk lanjut sebagai penumpang atau driver</p>
      <button id="btnGoogle" class="btn google">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Login dengan Google
      </button>
      <p class="muted" style="font-size:11px;margin-top:10px">Jika di mode samaran/incognito tombol tidak bisa, buka di tab biasa atau aktifkan third-party cookies</p>
      <div id="loginStatus" class="status muted"></div>
    </div>
    <div class="muted" style="margin-top:14px;font-size:11px">${APP_SETTINGS?.footerText||''}</div>
  </div>`;
}

export function viewHome(p){
  const role = p?.role||'penumpang';
  const name = p?.name||'Warga';
  return `
  <div>
    <div class="card" style="background:linear-gradient(135deg,var(--primary-2),var(--primary));color:#052e16;border:none">
      <div style="font-size:12px;opacity:.9">Halo, ${name} • ${role}</div>
      <div style="font-size:20px;font-weight:800;margin:4px 0">Mau kemana hari ini?</div>
      <div style="font-size:11px;opacity:.9">Wilayah aktif: ${ACTIVE_KECAMATAN_NAME||'Suruh'} • Tujuan: se-Kabupaten Trenggalek</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <a href="#/passenger"><div class="card" style="text-align:center;margin:0"><div style="font-size:28px">🧍</div><b>Pesan Ojol</b><div class="muted" style="font-size:11px">Penumpang</div></div></a>
      <a href="#/driver"><div class="card" style="text-align:center;margin:0"><div style="font-size:28px">🏍️</div><b>Jadi Driver</b><div class="muted" style="font-size:11px">Online & cari order</div></div></a>
    </div>
    <details id="disclaimerDetails" class="card"><summary id="btnDisclaimerMore" style="cursor:pointer;font-size:13px;font-weight:600">📖 Baca selengkapnya</summary><div class="muted" style="margin-top:8px;font-size:12px"><b>${APP_SETTINGS?.disclaimerTitle||''}</b><br>${APP_SETTINGS?.disclaimerText||''}</div></details>
    <div class="muted" style="text-align:center;margin-top:12px;font-size:10px">${APP_SETTINGS?.footerText||''}</div>
  </div>`;
}

export function viewOnboarding(p){
  return `<div class="card">Lengkapi profil dulu di <a href="#/profile" style="color:var(--primary)">Profil</a></div>`;
}

export function viewPassenger(p){
  return `
  <div>
    <h3 style="margin:0 0 10px">🧍 Penumpang - ${ACTIVE_KECAMATAN_NAME||'Suruh'}</h3>
    <div class="card">
      <label>📍 Pickup (otomatis)</label>
      <div class="row" style="margin-top:6px"><input id="pickup" placeholder="Mendeteksi lokasi..."><button id="btnRefreshPickup" class="btn secondary" style="width:auto;padding:10px 12px">📍</button><button id="btnOpenMap" class="btn secondary" style="width:auto;padding:10px 12px">🗺️</button></div>
      <div class="muted" style="font-size:11px;margin-top:6px"><span id="pickupLive">📡 live</span> • <span id="myLoc"></span></div>
      <label style="margin-top:12px">🎯 Tujuan (dalam Trenggalek)</label>
      <input id="dest" placeholder="Ketik tujuan, mis: Pasar Suruh...">
      <div id="destSuggestions" style="display:none" class="card" style="margin:6px 0 0;max-height:150px;overflow:auto"></div>
      <div class="muted" style="font-size:11px;margin-top:4px"><span id="destLive">🔍 ketik 1 huruf</span></div>
      <label style="margin-top:12px">Jenis Perjalanan</label>
      <div class="row"><label class="card" style="flex:1;margin:0;padding:10px;display:flex;gap:6px;align-items:center"><input type="radio" name="tripType" value="oneway" checked> Sekali Jalan</label><label class="card" style="flex:1;margin:0;padding:10px;display:flex;gap:6px;align-items:center"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
      <label style="margin-top:12px">Kendaraan</label>
      <div class="row">
        <label id="labelMotor" class="card" style="flex:1;margin:0;padding:10px;border:2px solid var(--primary);background:rgba(34,197,94,0.1)"><input type="radio" name="vehicleType" value="motor" checked> 🏍️ Motor</label>
        <label id="labelMobil" class="card" style="flex:1;margin:0;padding:10px"><input type="radio" name="vehicleType" value="mobil"> 🚗 Mobil</label>
      </div>
      <div id="estimateCard" style="display:none" class="card" style="border:1px dashed var(--primary);background:rgba(34,197,94,0.08)"><div style="font-size:12px">📏 <span id="estimateDistance">-</span> • <span id="estimateType">-</span> • <span id="estimateVehicle">-</span></div><div style="font-weight:800;margin-top:4px">💰 <span id="estimateCost">-</span></div><button id="btnEstimate" class="btn secondary" style="margin-top:8px">🔄 Hitung Ulang</button></div>
      <button id="btnOrder" class="btn primary" style="display:none;margin-top:12px">🚀 Order Sekarang</button>
    </div>
    <div id="activeOrderCard" style="display:none"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 6px"><b>Driver Terdekat</b><span id="searchInfo" class="muted" style="font-size:11px"></span></div>
    <button id="btnFind" class="btn secondary" style="width:auto;padding:8px 12px;font-size:12px">🔄 Cari Driver</button>
    <div id="driverList" class="list" style="margin-top:10px"></div>
  </div>`;
}

export function viewDriver(p){
  const status = p?.status||'offline';
  return `
  <div>
    <h3 style="margin:0 0 10px">🏍️ Driver Panel - ${ACTIVE_KECAMATAN_NAME||'Suruh'}</h3>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><div>Status: <b id="drvStatus">${status}</b></div><div class="muted" style="font-size:11px"><span id="kpiSpeed">0</span> km/h • <span id="kpiHead">0°</span> • <span id="kpiUpd">-</span></div></div>
      <div class="row"><button id="btnOnline" class="btn secondary" style="flex:1">🟢 Online</button><button id="btnOffline" class="btn secondary" style="flex:1">🔴 Offline</button></div>
      <div class="muted" style="font-size:11px;margin-top:8px">Driver hanya bisa online di dalam Kecamatan ${ACTIVE_KECAMATAN_NAME||'Suruh'}.</div>
    </div>
    <div class="card"><h4 style="margin:0 0 8px">📥 Order Masuk</h4><div id="driverOrders" class="muted">Menunggu order...</div></div>
  </div>`;
}

export function viewProfile(p){
  const role = p?.role||'passenger';
  const isDriver = role==='driver';
  const isAdmin = role==='admin';
  return `
  <div>
    <div class="card" style="background:var(--card2)">
      <div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:800">${p?.name||'-'}</div><div class="muted" style="font-size:11px">${p?.email||''} • ${p?.role||''} ${p?.banned?'<span class="admin-badge badge-banned">BANNED</span>':''}</div></div><button id="btnEditProfile" class="btn secondary" style="width:auto;padding:6px 12px;font-size:12px">✏️ Edit</button></div>
      <div class="muted" style="font-size:12px;margin-top:10px;line-height:1.6">🧍 ${isDriver?'Driver':isAdmin?'Admin':'Penumpang'} • HP: ${p?.hp||'-'}<br>Desa: ${p?.desa||'-'}<br>Alamat: ${p?.alamat||'-'}<br>ID: ${p?.id? p.id.slice(0,8):'-'}</div>
      <button id="btnLogout" class="btn secondary" style="margin-top:14px">Logout</button>
    </div>
    <div id="profileEditForm" style="display:none" class="card">
      <h4 style="margin:0 0 8px">Edit Profil</h4>
      <label>Nama</label><input id="profileName" value="${p?.name||''}">
      <label>HP WA</label><input id="profileHp" value="${p?.hp||''}" placeholder="08...">
      <label>Role</label><select id="profileRole"><option value="passenger" ${role==='passenger'?'selected':''}>Penumpang</option><option value="driver" ${role==='driver'?'selected':''}>Driver</option><option value="admin" ${isAdmin?'selected':''}>Admin</option></select>
      <div id="profilePassengerFields" style="display:${isDriver?'none':'block'}">
        <label>Desa</label><input id="profileDesa" value="${p?.desa||''}">
        <label>Alamat</label><input id="profileAlamat" value="${p?.alamat||''}">
        <label>Catatan</label><input id="profileCatatan" value="${p?.catatan||''}">
      </div>
      <div id="profileDriverFields" style="display:${isDriver?'block':'none'}">
        <div class="muted" style="margin-bottom:6px">Jenis Kendaraan</div>
        <div class="row" style="margin:0"><label class="card" style="flex:1;margin:0"><input type="radio" name="jenisKendaraan" value="motor" ${(p?.jenis_kendaraan||'motor')==='motor'?'checked':''}> Motor</label><label class="card" style="flex:1;margin:0"><input type="radio" name="jenisKendaraan" value="mobil" ${(p?.jenis_kendaraan||'')==='mobil'?'checked':''}> Mobil</label></div>
        <label>Nopol</label><input id="profileNopol" value="${p?.nopol||''}">
        <label>SIM</label><select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p?.tipe_sim==='A'?'selected':''}>SIM A</option><option value="C" ${p?.tipe_sim==='C'?'selected':''}>SIM C</option><option value="A,C" ${p?.tipe_sim==='A,C'?'selected':''}>A & C</option></select>
        <label>Tipe Motor/Mobil</label><input id="profileTipe" value="${p?.tipe_motor||''}" placeholder="Vario, Avanza...">
      </div>
      <button id="btnSaveProfile" class="btn primary" style="margin-top:10px">💾 Simpan Profil</button>
      <div id="profileStatus" class="status"></div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <h4 style="color:var(--danger);margin:0 0 8px">Hapus Akun</h4>
        <input id="confirmDelete" placeholder="Ketik HAPUS">
        <button id="btnDeleteAccount" class="btn secondary" style="border-color:var(--danger);color:var(--danger);margin-top:6px">Hapus Permanen</button>
        <div id="deleteStatus" class="status"></div>
      </div>
    </div>
    <div class="card" id="profilePushCard">
      <h4 style="margin:0 0 6px">🔔 Notifikasi Push</h4>
      <div class="muted" style="font-size:11px">Aktifkan biar dapat notifikasi order masuk walau HP terkunci.</div>
      <div class="row"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan</button><button id="btnDisablePush" class="btn secondary" style="flex:1">Matikan</button></div>
      <div id="pushStatus" class="status muted"></div>
    </div>
  </div>`;
}

export function viewAdminDashboard(stats=null){
  return `
  <div class="admin-page">
    <h2>📊 Admin Dashboard</h2>
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
  return `
  <div class="admin-page">
    <h2>⚙️ Setting Aplikasi</h2>
    <div class="card">
      <h4 style="margin:0 0 10px">🎨 Tampilan Aplikasi</h4>
      <label>Judul / Nama App</label><input id="setAppName" value="${s.appName||'Ojol Trenggalek'}">
      <label>Nama Pendek</label><input id="setAppShort" value="${s.appShortName||'Ojol'}">
      <div class="row"><div style="flex:1"><label>Warna Primary</label><input id="setPrimary" type="color" value="${s.primaryColor||'#16a34a'}"></div><div style="flex:1"><label>Warna Secondary</label><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}"></div></div>
      <label>Judul Disclaimer</label><input id="setDiscTitle" value="${s.disclaimerTitle||''}">
      <label>Isi Disclaimer</label><textarea id="setDiscText" style="min-height:100px">${s.disclaimerText||''}</textarea>
      <label>Footer</label><input id="setFooter" value="${s.footerText||''}">
      <div class="row"><button id="btnSaveSettings" class="btn primary" style="flex:1">💾 Simpan Setting</button><button id="btnResetSettings" class="btn secondary" style="flex:1">Reset</button></div>
      <div id="settingStatus" class="status"></div>
    </div>
    <div class="card">
      <h4 style="margin:0 0 8px">🔔 Notifikasi Push (Admin)</h4>
      <div class="muted" style="font-size:11px">Aktifkan agar admin dapat notifikasi laporan & order bermasalah walau HP terkunci.</div>
      <div class="row"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan Notifikasi</button><button id="btnDisablePush" class="btn secondary" style="flex:1">Matikan</button></div>
      <div id="pushStatus" class="status muted"></div>
    </div>
    <div class="card">
      <h4 style="margin:0 0 8px">👑 Akun Admin</h4>
      <div class="muted" style="font-size:12px;line-height:1.6">Nama: <b>${p?.name||'-'}</b><br>Email: ${p?.email||'-'}<br>Role: ${p?.role||'-'}<br>ID: ${p?.id? p.id.slice(0,8):'-'}</div>
      <div class="row"><button id="btnLogout" class="btn secondary" style="flex:1">Logout</button><button id="btnGoProfile" class="btn secondary" style="flex:1">Edit Profil Admin</button></div>
    </div>
    <div class="card"><h4 style="margin:0 0 8px">🔧 Kecamatan Aktif</h4><div id="kecamatanButtons" style="display:flex;gap:6px;flex-wrap:wrap"></div><div class="muted" style="font-size:11px;margin-top:6px">Ganti di <code>config.js</code> ACTIVE_KECAMATAN_CODE</div></div>
    <div class="card" style="background:rgba(245,158,11,0.08)"><h4 style="margin:0 0 8px">📜 SQL Setup Admin</h4><pre id="adminSqlBox" style="font-size:10px;white-space:pre-wrap;background:var(--card2);padding:10px;border-radius:10px;border:1px solid var(--border);max-height:200px;overflow:auto">Loading...</pre></div>
  </div>`;
}

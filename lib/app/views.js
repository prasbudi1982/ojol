// views.js - REAL TEMPLATES FINAL - login, home, passenger, driver, profile, admin
import { ACTIVE_KECAMATAN_NAME, APP_SETTINGS } from './config.js';

export function viewLogin(){
  return `
  <div style="padding:16px;max-width:420px;margin:40px auto;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">🛵</div>
    <h1 style="margin:0">${APP_SETTINGS?.appName||'OJOL SURUH'}</h1>
    <p style="font-size:12px;color:#666;margin:8px 0 20px">Ojek Online Kecamatan ${ACTIVE_KECAMATAN_NAME||'Suruh'} • Pickup ${ACTIVE_KECAMATAN_NAME||'Suruh'}, tujuan se-Trenggalek</p>
    <div class="card" style="padding:16px;border:1px solid #eee;border-radius:16px;background:white">
      <p style="font-size:13px">Login untuk lanjut sebagai penumpang atau driver</p>
      <button id="btnGoogle" class="btn primary" style="width:100%;padding:12px;border-radius:12px;background:#16a34a;color:white;border:none;font-weight:bold;display:flex;align-items:center;justify-content:center;gap:8px">
        <span>🔐</span> Login dengan Google
      </button>
      <p style="font-size:10px;color:#999;margin-top:8px">Jika tombol tidak bisa diklik di mode samaran/incognito, buka di tab biasa atau aktifkan third-party cookies.<br>Chrome Incognito → titik 3 → Settings → Privacy → Allow third-party cookies</p>
      <div id="loginStatus" style="font-size:11px;margin-top:8px;color:#666"></div>
    </div>
    <div style="margin-top:12px;font-size:11px;color:#666">
      <a href="#/" style="color:#16a34a">Home</a> • ${APP_SETTINGS?.footerText||''}
    </div>
  </div>`;
}

export function viewHome(p){
  const role = p?.role||'penumpang';
  const name = p?.name||'Warga';
  return `
  <div style="padding:12px">
    <div class="card" style="padding:12px;border-radius:16px;background:linear-gradient(135deg,#16a34a,#22c55e);color:white">
      <div style="font-size:12px;opacity:0.9">Halo, ${name} • ${role}</div>
      <div style="font-size:20px;font-weight:bold;margin:4px 0">Mau kemana hari ini?</div>
      <div style="font-size:11px;opacity:0.9">Wilayah aktif: ${ACTIVE_KECAMATAN_NAME||'Suruh'} • Tujuan: se-Kabupaten Trenggalek</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <a href="#/passenger" style="text-decoration:none"><div class="card" style="padding:12px;border:1px solid #eee;border-radius:12px;text-align:center;background:white"><div style="font-size:28px">🧍</div><b>Pesan Ojol</b><div style="font-size:11px;color:#666">Penumpang</div></div></a>
      <a href="#/driver" style="text-decoration:none"><div class="card" style="padding:12px;border:1px solid #eee;border-radius:12px;text-align:center;background:white"><div style="font-size:28px">🏍️</div><b>Jadi Driver</b><div style="font-size:11px;color:#666">Online & cari order</div></div></a>
    </div>
    <details id="disclaimerDetails" style="margin-top:16px;border:1px solid #eee;border-radius:12px;padding:10px;background:white"><summary id="btnDisclaimerMore" style="cursor:pointer;font-size:12px">📖 Baca selengkapnya <span style="font-size:10px">▼</span></summary><div style="font-size:11px;margin-top:8px;color:#444"><b>${APP_SETTINGS?.disclaimerTitle||''}</b><br>${APP_SETTINGS?.disclaimerText||''}</div></details>
    <div style="margin-top:12px;font-size:10px;color:#999;text-align:center">${APP_SETTINGS?.footerText||''}</div>
  </div>`;
}

export function viewOnboarding(p){
  return `<div style="padding:12px"><div class="card" style="padding:12px;border-radius:12px">Lengkapi profil dulu di <a href="#/profile">Profil</a></div></div>`;
}

export function viewPassenger(p){
  return `
  <div style="padding:12px">
    <h3 style="margin:0 0 8px">🧍 Penumpang - ${ACTIVE_KECAMATAN_NAME||'Suruh'}</h3>
    <div class="card" style="padding:12px;border:1px solid #eee;border-radius:12px;background:white;margin-bottom:10px">
      <label style="font-size:12px">📍 Pickup (otomatis)</label>
      <div style="display:flex;gap:6px;margin-top:4px"><input id="pickup" placeholder="Mendeteksi lokasi..." style="flex:1;padding:8px;border-radius:8px;border:1px solid #ccc"><button id="btnRefreshPickup" style="padding:8px;border-radius:8px;border:1px solid #ccc">📍</button><button id="btnOpenMap" style="padding:8px;border-radius:8px;border:1px solid #ccc">🗺️</button></div>
      <div style="font-size:10px;color:#666;margin-top:4px"><span id="pickupLive">📡 live</span> • <span id="myLoc"></span></div>
      
      <label style="font-size:12px;margin-top:10px;display:block">🎯 Tujuan (dalam Trenggalek)</label>
      <input id="dest" placeholder="Ketik tujuan, mis: Pasar Suruh..." style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-top:4px">
      <div id="destSuggestions" style="display:none;border:1px solid #eee;border-radius:8px;margin-top:4px;max-height:150px;overflow:auto;background:white"></div>
      <div style="font-size:10px;color:#666;margin-top:2px"><span id="destLive">🔍 ketik 1 huruf</span></div>
      
      <div style="margin-top:10px">
        <div style="font-size:12px">Jenis Perjalanan</div>
        <div style="display:flex;gap:6px;margin-top:4px"><label style="flex:1;padding:6px;border:1px solid #ccc;border-radius:8px;font-size:12px"><input type="radio" name="tripType" value="oneway" checked> Sekali Jalan</label><label style="flex:1;padding:6px;border:1px solid #ccc;border-radius:8px;font-size:12px"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
      </div>
      <div style="margin-top:10px">
        <div style="font-size:12px">Kendaraan</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <label id="labelMotor" style="flex:1;padding:8px;border:2px solid #22c55e;border-radius:8px;background:rgba(34,197,94,0.1);font-size:12px"><input type="radio" name="vehicleType" value="motor" checked> 🏍️ Motor</label>
          <label id="labelMobil" style="flex:1;padding:8px;border:1px solid #334155;border-radius:8px;font-size:12px"><input type="radio" name="vehicleType" value="mobil"> 🚗 Mobil</label>
        </div>
      </div>
      <div id="estimateCard" style="display:none;margin-top:10px;padding:8px;border:1px dashed #16a34a;border-radius:8px;background:#f0fdf4">
        <div style="font-size:12px">📏 <span id="estimateDistance">-</span> • <span id="estimateType">-</span> • <span id="estimateVehicle">-</span></div>
        <div style="font-weight:bold;margin-top:2px">💰 <span id="estimateCost">-</span></div>
        <button id="btnEstimate" style="margin-top:6px;padding:6px 10px;border-radius:8px;border:1px solid #16a34a;background:white;font-size:11px">🔄 Hitung Ulang</button>
      </div>
      <button id="btnOrder" class="btn primary" style="width:100%;margin-top:10px;padding:10px;border-radius:12px;background:#16a34a;color:white;border:none;font-weight:bold;display:none">🚀 Order Sekarang</button>
    </div>
    <div id="activeOrderCard" style="display:none;margin-bottom:10px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Driver Terdekat</b><span id="searchInfo" style="font-size:11px;color:#666"></span></div>
    <div style="margin-bottom:6px"><button id="btnFind" class="btn secondary" style="padding:6px 10px;border-radius:8px;font-size:11px">🔄 Cari Driver</button></div>
    <div id="driverList" style="display:flex;flex-direction:column;gap:8px"></div>
  </div>`;
}

export function viewDriver(p){
  const status = p?.status||'offline';
  return `
  <div style="padding:12px">
    <h3 style="margin:0 0 8px">🏍️ Driver Panel - ${ACTIVE_KECAMATAN_NAME||'Suruh'}</h3>
    <div class="card" style="padding:12px;border:1px solid #eee;border-radius:12px;background:white">
      <div style="display:flex;justify-content:space-between;align-items:center"><div>Status: <b id="drvStatus">${status}</b></div><div style="font-size:11px"><span id="kpiSpeed">0</span> km/h • <span id="kpiHead">0°</span> • <span id="kpiUpd">-</span></div></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button id="btnOnline" class="btn secondary" style="flex:1;padding:10px;border-radius:10px">🟢 Online</button><button id="btnOffline" class="btn secondary" style="flex:1;padding:10px;border-radius:10px">🔴 Offline</button></div>
      <div style="font-size:10px;color:#666;margin-top:6px">Driver hanya bisa online di dalam Kecamatan ${ACTIVE_KECAMATAN_NAME||'Suruh'}. Lokasi realtime akan di-share.</div>
    </div>
    <div style="margin-top:12px"><h4>📥 Order Masuk</h4><div id="driverOrders" style="margin-top:6px">Menunggu order...</div></div>
  </div>`;
}

export function viewProfile(p){
  const role = p?.role||'passenger';
  const isDriver = role==='driver';
  const isAdmin = role==='admin';
  return `
  <div style="padding:12px">
    <div class="card" style="padding:12px;border-radius:16px;background:#151c25;color:white;border:1px solid #263240">
      <div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:bold">${p?.name||'-'}</div><div style="font-size:11px;color:#8aa0b8">${p?.email||''} • ${p?.role||''} ${p?.banned?'<span style="background:#ef4444;color:white;padding:2px 6px;border-radius:8px">BANNED</span>':''}</div></div><button id="btnEditProfile" style="background:#1d2633;color:white;border:1px solid #334155;padding:6px 10px;border-radius:8px;font-size:11px">✏️ Edit</button></div>
      <div style="font-size:11px;margin-top:8px;color:#8aa0b8">🧍 ${isDriver?'Driver':isAdmin?'Admin': 'Penumpang'} • HP: ${p?.hp||'-'}<br>Desa: ${p?.desa||'-'}<br>Alamat: ${p?.alamat||'-'}<br>ID: ${p?.id? p.id.slice(0,8):'-'}</div>
      <button id="btnLogout" style="width:100%;margin-top:12px;padding:10px;border-radius:10px;background:#1d2633;color:#e6edf5;border:1px solid #263240">Logout</button>
    </div>
    
    <div id="profileEditForm" style="display:none;margin-top:12px" class="card">
      <h4>Edit Profil</h4>
      <label style="font-size:12px">Nama</label><input id="profileName" value="${p?.name||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
      <label style="font-size:12px">HP WA</label><input id="profileHp" value="${p?.hp||''}" placeholder="08..." style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
      <label style="font-size:12px">Role</label><select id="profileRole" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
        <option value="passenger" ${role==='passenger'?'selected':''}>Penumpang</option>
        <option value="driver" ${role==='driver'?'selected':''}>Driver</option>
        <option value="admin" ${isAdmin?'selected':''}>Admin</option>
      </select>
      
      <div id="profilePassengerFields" style="display:${isDriver?'none':'block'}">
        <label style="font-size:12px">Desa</label><input id="profileDesa" value="${p?.desa||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
        <label style="font-size:12px">Alamat</label><input id="profileAlamat" value="${p?.alamat||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
        <label style="font-size:12px">Catatan</label><input id="profileCatatan" value="${p?.catatan||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
      </div>
      
      <div id="profileDriverFields" style="display:${isDriver?'block':'none'}">
        <div style="font-size:12px;margin-bottom:4px">Jenis Kendaraan</div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <label style="flex:1;padding:6px;border:1px solid #ccc;border-radius:8px"><input type="radio" name="jenisKendaraan" value="motor" ${(p?.jenis_kendaraan||'motor')==='motor'?'checked':''}> Motor</label>
          <label style="flex:1;padding:6px;border:1px solid #ccc;border-radius:8px"><input type="radio" name="jenisKendaraan" value="mobil" ${(p?.jenis_kendaraan||'')==='mobil'?'checked':''}> Mobil</label>
        </div>
        <label style="font-size:12px">Nopol</label><input id="profileNopol" value="${p?.nopol||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
        <label style="font-size:12px">SIM</label><select id="profileSim" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px"><option value="">Pilih SIM</option><option value="A" ${p?.tipe_sim==='A'?'selected':''}>SIM A (Mobil)</option><option value="C" ${p?.tipe_sim==='C'?'selected':''}>SIM C (Motor)</option><option value="A,C" ${p?.tipe_sim==='A,C'?'selected':''}>A & C</option></select>
        <label style="font-size:12px">Tipe Motor/Mobil</label><input id="profileTipe" value="${p?.tipe_motor||''}" placeholder="Vario, Avanza..." style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:8px">
      </div>
      
      <button id="btnSaveProfile" class="btn primary" style="width:100%;padding:10px;border-radius:10px;background:#16a34a;color:white;border:none">💾 Simpan Profil</button>
      <div id="profileStatus" style="font-size:11px;margin-top:6px"></div>
      
      <div style="margin-top:16px;border-top:1px solid #eee;padding-top:10px">
        <h4 style="color:#ef4444">Hapus Akun</h4>
        <input id="confirmDelete" placeholder="Ketik HAPUS" style="width:100%;padding:8px;border-radius:8px;border:1px solid #fecaca;margin-bottom:6px">
        <button id="btnDeleteAccount" style="width:100%;padding:8px;border-radius:8px;background:#fee2e2;border:1px solid #fecaca;color:#ef4444">Hapus Permanen</button>
        <div id="deleteStatus" style="font-size:11px;margin-top:4px"></div>
      </div>
    </div>
    
    <div style="margin-top:12px" class="card">
      <h4>🔔 Notifikasi Push</h4>
      <div style="font-size:11px;color:#666">Aktifkan biar dapat notifikasi order masuk (driver) & driver ditemukan (penumpang) walau HP terkunci.</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button id="btnEnablePush" style="flex:1;padding:10px;border-radius:10px;background:#22c55e;color:#052e16;border:none;font-weight:bold">🔔 Aktifkan Notifikasi</button><button id="btnDisablePush" style="flex:1;padding:10px;border-radius:10px;background:#1d2633;color:white;border:1px solid #334155">Matikan</button></div>
      <div id="pushStatus" style="font-size:10px;margin-top:6px;color:#666"></div>
    </div>
  </div>`;
}

// ===== ADMIN VIEWS =====
export function viewAdminDashboard(stats=null){
  return `
  <div class="admin-page" style="padding:12px">
    <h2>📊 Admin Dashboard</h2>
    <div id="adminStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0">
      <div class="card" style="border-left:4px solid #16a34a"><b>Total User</b><div style="font-size:24px" id="statTotal">${stats?.total||'-'}</div></div>
      <div class="card" style="border-left:4px solid #22c55e"><b>Aktif</b><div style="font-size:24px;color:#16a34a" id="statActive">${stats?.active||'-'}</div></div>
      <div class="card" style="border-left:4px solid #6b7280"><b>Offline</b><div style="font-size:24px" id="statOffline">${stats?.offline||'-'}</div></div>
      <div class="card" style="border-left:4px solid #ef4444"><b>Banned</b><div style="font-size:24px;color:#ef4444" id="statBanned">${stats?.banned||'-'}</div></div>
      <div class="card" style="border-left:4px solid #3b82f6"><b>Driver</b><div style="font-size:20px" id="statDrivers">${stats?.drivers||'-'}</div></div>
      <div class="card" style="border-left:4px solid #f59e0b"><b>Penumpang</b><div style="font-size:20px" id="statPassengers">${stats?.passengers||'-'}</div></div>
      <div class="card" style="border-left:4px solid #8b5cf6"><b>Order Hari Ini</b><div style="font-size:20px" id="statOrders">${stats?.ordersToday||'-'}</div></div>
    </div>
    <div style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap">
      <input id="adminSearch" placeholder="Cari nama/email/hp..." style="flex:1;min-width:180px;padding:8px;border-radius:8px;border:1px solid #ccc">
      <select id="adminFilter" style="padding:8px;border-radius:8px"><option value="all">Semua</option><option value="active">Aktif</option><option value="offline">Offline</option><option value="banned">Banned</option><option value="driver">Driver</option><option value="passenger">Penumpang</option><option value="admin">Admin</option></select>
      <button id="btnAdminRefresh" class="btn secondary">🔄 Refresh</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><h3>👥 List User <span style="font-size:11px;color:#666" id="userCount"></span></h3><div id="adminUserList" style="max-height:60vh;overflow:auto;border:1px solid #eee;border-radius:12px">Loading users...</div></div>
      <div><h3>🚩 Laporan Akun</h3><div id="adminReportList" style="max-height:60vh;overflow:auto;border:1px solid #fee2e2;border-radius:12px;background:#fef2f2;padding:8px">Loading laporan...</div><div id="adminUserDetail" style="margin-top:12px;border:1px solid #ddd;border-radius:12px;padding:10px;display:none"></div></div>
    </div>
  </div>`;
}

export function viewAdminSettings(settings){
  const s = settings||{};
  return `
  <div class="admin-page" style="padding:12px;max-width:600px">
    <h2>⚙️ Setting Aplikasi</h2>
    <div class="card" style="margin-top:12px">
      <label><b>Judul / Nama App</b><br><input id="setAppName" value="${s.appName||'Ojol Trenggalek'}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Nama Pendek</b><br><input id="setAppShort" value="${s.appShortName||'Ojol'}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Warna Primary</b><br><input id="setPrimary" type="color" value="${s.primaryColor||'#16a34a'}" style="width:60px;height:40px"></label><br><br>
      <label><b>Warna Secondary</b><br><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}" style="width:60px;height:40px"></label><br><br>
      <label><b>Judul Disclaimer</b><br><input id="setDiscTitle" value="${s.disclaimerTitle||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Isi Disclaimer</b><br><textarea id="setDiscText" style="width:100%;height:100px;padding:8px;border-radius:8px;border:1px solid #ccc">${s.disclaimerText||''}</textarea></label><br><br>
      <label><b>Footer</b><br><input id="setFooter" value="${s.footerText||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <div style="display:flex;gap:8px"><button id="btnSaveSettings" class="btn primary" style="flex:1;background:${s.primaryColor||'#16a34a'}">💾 Simpan</button><button id="btnResetSettings" class="btn secondary">Reset</button></div>
      <div id="settingStatus" style="margin-top:8px;font-size:12px"></div>
    </div>
    <div class="card" style="margin-top:16px"><h4>🔧 Kecamatan Aktif</h4><div id="kecamatanButtons" style="display:flex;gap:6px;flex-wrap:wrap"></div></div>
    <div class="card" style="margin-top:16px;background:#fef3c7"><h4>📜 SQL Setup Admin</h4><pre id="adminSqlBox" style="font-size:10px;white-space:pre-wrap;background:white;padding:8px;border-radius:8px;max-height:200px;overflow:auto">Loading...</pre></div>
  </div>`;
}

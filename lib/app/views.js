// views.js - FINAL v6.2 restored - greeting menarik + map picker fix + disclaimer konek admin
import { ACTIVE_KECAMATAN_NAME, APP_SETTINGS } from './config.js';

export function viewLogin(){
  return `
  <div style="max-width:380px;margin:60px auto;text-align:center">
    <div style="font-size:48px">🛵</div>
    <h1 style="margin:8px 0">OJOL SURUH</h1>
    <div class="card">
      <button id="btnGoogle" class="btn google">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Login dengan Google
      </button>
      <div id="loginStatus" class="status muted" style="margin-top:8px"></div>
    </div>
  </div>`;
}

export function viewHome(p){
  if(!p) return viewLogin();
  const hour = new Date().getHours();
  const greet = hour<11 ? 'Selamat Pagi' : hour<15 ? 'Selamat Siang' : hour<18 ? 'Selamat Sore' : 'Selamat Malam';
  const firstName = (p.name||'Warga').split(' ')[0];
  const roleIcon = p.role==='driver' ? '🏍️' : p.role==='admin' ? '👑' : '🧍';
  const roleLabel = p.role==='driver' ? 'Driver' : p.role==='admin' ? 'Admin' : 'Penumpang';
  const discTitle = APP_SETTINGS?.disclaimerTitle || 'DISCLAIMER & SYARAT KETENTUAN LAYANAN';
  const discText = APP_SETTINGS?.disclaimerText || '';
  return `
  <div class="card" style="background:linear-gradient(135deg,var(--primary-2) 0%,var(--primary) 50%,#86efac 100%);color:#052e16;border:none;padding:18px 18px 16px;position:relative;overflow:hidden;box-shadow:0 8px 24px rgba(34,197,94,0.25)">
    <div style="position:absolute;right:-8px;top:-12px;font-size:88px;opacity:0.14;transform:rotate(-12deg)">🛵</div>
    <div style="position:absolute;left:-20px;bottom:-20px;width:80px;height:80px;background:rgba(255,255,255,0.18);border-radius:50%"></div>
    <div style="position:relative">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;opacity:0.8;background:rgba(5,46,22,0.12);padding:4px 10px;border-radius:99px">${greet.toUpperCase()} • ${ACTIVE_KECAMATAN_NAME||'Suruh'}</div>
        <div style="background:rgba(255,255,255,0.9);padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;display:flex;gap:5px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.08)">${roleIcon} ${roleLabel}</div>
      </div>
      <div style="font-size:24px;font-weight:900;line-height:1.1;margin:6px 0 2px;letter-spacing:-0.5px">${greet}, ${firstName}! 👋</div>
      <div style="font-size:14px;font-weight:600;opacity:0.9;margin-top:4px">Mau kemana hari ini?</div>
      <div style="display:flex;gap:8px;margin-top:14px">
        ${p.role==='passenger' ? `<a href="#/passenger" class="btn" style="flex:1;background:#052e16;color:white;text-align:center;padding:11px;border-radius:12px;font-weight:800;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.15)">🧍 Pesan Ojol</a>` : p.role==='driver' ? `<a href="#/driver" class="btn" style="flex:1;background:#052e16;color:white;text-align:center;padding:11px;border-radius:12px;font-weight:800;font-size:13px">🏍️ Go Online</a>` : `<a href="#/admin" class="btn" style="flex:1;background:#052e16;color:white;text-align:center;padding:11px;border-radius:12px;font-weight:800;font-size:13px">👑 Dashboard</a>`}
        <a href="#/profile" class="btn" style="background:rgba(255,255,255,0.9);color:#052e16;text-align:center;padding:11px 14px;border-radius:12px;font-weight:800;font-size:13px">👤</a>
      </div>
    </div>
  </div>
  <div class="card" style="border-left:5px solid #f59e0b;background:rgba(245,158,11,0.09)">
  <h4 style="margin:0 0 10px;color:#fbbf24">📜 ${discTitle}</h4>
  <div style="font-size:12.5px;line-height:1.7;white-space:pre-wrap" class="muted">${discText.slice(0,200)}${discText.length>200?'...':''}</div>
  <details id="disclaimerDetails" style="margin-top:10px">
    <summary id="btnDisclaimerMore" style="cursor:pointer;color:#fbbf24;font-weight:700;font-size:12.5px;list-style:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #f59e0b;border-radius:8px;background:rgba(245,158,11,0.15)">📖 Baca selengkapnya <span style="font-size:10px">▼</span></summary>
    <div style="font-size:12.5px;line-height:1.8;margin-top:12px;white-space:pre-wrap" class="muted">${discText}<span style="font-size:11px;color:#8aa0b8;display:block;margin-top:14px;border-top:1px solid #334155;padding-top:8px">Dengan menekan tombol Pesan Ojol / Go Online, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh poin di atas tanpa paksaan.</span></div>
  </details>
</div>
<div class="muted" style="text-align:center;margin-top:10px;font-size:10px">${APP_SETTINGS?.footerText||''}</div>`;
}


export function viewOnboarding(p){
  return `<div class="card"><h3>👋 Halo ${p?.name||''}</h3><p class="muted">Lengkapi nama dulu, pengaturan role ada di tab Profil.</p><label>Nama Tampilan<input id="displayName" value="${p?.name||''}"></label><div class="row"><button id="btnSaveOnboard" class="btn primary">💾 Simpan</button><a href="#/profile" class="btn secondary">Ke Profil</a></div><p id="saveStatus" class="muted"></p></div>`;
}

export function viewPassenger(currentProfile){
  return `<div class="card"><h3>🧍 Order Ojol - ${currentProfile?.name||''}</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
  <label>Pickup <span class="muted" style="font-size:10px" id="pickupLive">📡 live</span>
    <div class="row" style="gap:8px;align-items:center"><input id="pickup" placeholder="Lokasi jemput..." style="flex:4;min-width:0"><button id="btnRefreshPickup" class="btn secondary" style="flex:0 0 48px;padding:8px 0">📍</button></div>
  </label>
  <label>Tujuan <span class="muted" style="font-size:10px" id="destLive">🔍 ketik 1 huruf</span>
    <div class="row" style="gap:8px;align-items:center"><input id="dest" placeholder="Ketik tujuan di Trenggalek..." style="flex:4;min-width:0"><button id="btnOpenMap" class="btn secondary" style="flex:0 0 64px;padding:8px 0">🗺️ Map</button></div>
    <div id="destSuggestions" style="display:none;max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:8px;margin-top:6px;background:#0f172a"></div>
  </label>
  <label>Pilih Kendaraan</label>
  <div class="row" style="gap:8px;margin-top:6px">
    <label style="flex:1;border:2px solid #22c55e;border-radius:12px;padding:10px;text-align:center;cursor:pointer;background:rgba(34,197,94,0.1)" id="labelMotor"><input type="radio" name="vehicleType" value="motor" checked style="display:none"><span style="font-size:20px">🏍️</span><br/><b>Motor</b><br/><span class="muted" style="font-size:10px">Hemat • Rp 2.500/km</span></label>
    <label style="flex:1;border:1px solid #334155;border-radius:12px;padding:10px;text-align:center;cursor:pointer" id="labelMobil"><input type="radio" name="vehicleType" value="mobil" style="display:none"><span style="font-size:20px">🚗</span><br/><b>Mobil</b><br/><span class="muted" style="font-size:10px">Nyaman • Rp 5.500/km</span></label>
  </div>
  <div class="row" style="margin-top:8px"><label style="flex:1"><input type="radio" name="tripType" value="oneway" checked> Antar Saja</label><label style="flex:1"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
  <div id="estimateCard" style="display:none;margin-top:12px;border:1px dashed #475569;padding:10px;border-radius:8px"><p style="font-size:12px">Jarak: <b id="estimateDistance">-</b> • <span id="estimateType">-</span> • <span id="estimateVehicle">-</span> • Biaya: <b id="estimateCost">-</b></p><p class="muted" id="searchInfo" style="font-size:11px"></p></div>
  <button id="btnOrder" class="btn primary" style="display:none;margin-top:12px">🚀 Order Sekarang</button>
  <div id="driverList" style="margin-top:12px"></div>
  <div id="activeOrderCard" style="display:none;margin-top:16px" class="card tracking-card"></div>
  </div>`;
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️';
  const isOnline = (p.status === 'online');
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon} ${p.jenis_kendaraan||'motor'}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • ${vehIcon} ${p.jenis_kendaraan||''} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Jenis Kendaraan, Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div><div class="card"><h4 style="margin:0 0 8px">📥 Order Masuk</h4><div id="driverOrders" class="muted" style="font-size:12px">Menunggu order...</div></div>`;
}

export function viewProfile(p){
  if(!p) return `<div class="card">Belum login</div>`;
  const isDriver = p.role==='driver';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  return `<div class="card"><h3>👤 Profil Saya</h3>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1"><b style="font-size:15px">${p.name||''}</b><br/><span class="muted" style="font-size:11px;line-height:1.6">📧 ${p.email}<br/>${isDriver?'🏍️ Driver':'🧍 Penumpang'} • HP: ${hp||'-'}<br/>${!isDriver?`Desa: ${desa||'-'}<br/>Alamat: ${alamat||'-'}`:`${p.jenis_kendaraan||''} • ${p.nopol||''} • SIM ${p.tipe_sim||''}`}<br/>ID: ${String(p.id).slice(0,8)}</span></div>
      <button id="btnEditProfile" class="btn secondary" style="width:auto;padding:8px 14px;flex-shrink:0">✏️ Edit</button>
    </div>
    <div class="row"><button id="btnLogout" class="btn secondary">Logout</button></div>
  </div>
  <div id="profileEditForm" style="display:none" class="card"><h3>✏️ Edit Profil</h3>
    <label>Nama Lengkap<input id="editName" value="${p.name||''}" placeholder="Nama sesuai KTP"></label>
    <label>Peran / Role<select id="profileRole"><option value="passenger" ${!isDriver?'selected':''}>🧍 Penumpang</option><option value="driver" ${isDriver?'selected':''}>🏍️ Driver</option></select></label>
    <label>HP WA (wajib)<div class="row" style="gap:8px;align-items:center;margin-top:6px"><input id="profileHp" value="${hp}" placeholder="08xxx" style="flex:4;min-width:0"><span class="muted" style="flex:0 0 48px;font-size:10px">WA aktif</span></div></label>
    <div id="profilePassengerFields" style="display:${!isDriver?'block':'none'};border:1px solid #22c55e;padding:12px;border-radius:12px;margin-top:12px;background:rgba(34,197,94,0.06)">
      <b style="font-size:13px">🧍 Detail Penumpang</b>
      <label>Desa / Dusun di Suruh<input id="profileDesa" value="${desa}" placeholder="Contoh: Suruh, Nglongsor, Gamping"></label>
      <label>Alamat Lengkap / Patokan Rumah<textarea id="profileAlamat" rows="2" placeholder="Contoh: RT 02 RW 01, barat masjid, rumah cat hijau">${alamat}</textarea></label>
      <label>Catatan Jemput (opsional)<input id="profileCatatan" value="${p.catatan||''}" placeholder="Contoh: tunggu di depan warung"></label>
    </div>
    <div id="profileDriverFields" style="display:${isDriver?'block':'none'};border:1px solid #3b82f6;padding:12px;border-radius:12px;margin-top:12px;background:rgba(59,130,246,0.06)">
      <b style="font-size:13px">🏍️ Detail Driver</b>
      <label>Jenis Kendaraan (wajib)
        <div class="row" style="gap:8px;margin-top:6px">
          <label style="flex:1;border:${(p.jenis_kendaraan||'motor')==='motor'?'2px solid #22c55e':'1px solid #334155'};border-radius:10px;padding:8px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="motor" ${(p.jenis_kendaraan||'motor')==='motor'?'checked':''} style="display:none">🏍️<br/>Motor</label>
          <label style="flex:1;border:${p.jenis_kendaraan==='mobil'?'2px solid #22c55e':'1px solid #334155'};border-radius:10px;padding:8px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="mobil" ${p.jenis_kendaraan==='mobil'?'checked':''} style="display:none">🚗<br/>Mobil</label>
        </div>
      </label>
      <label>Nopol Kendaraan<input id="profileNopol" value="${p.nopol||''}" placeholder="AG 1234 XX"></label>
      <label>Tipe SIM<select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p.tipe_sim==='A'?'selected':''}>A - Mobil</option><option value="C" ${p.tipe_sim==='C'?'selected':''}>C - Motor</option><option value="B1" ${p.tipe_sim==='B1'?'selected':''}>B1</option><option value="B2" ${p.tipe_sim==='B2'?'selected':''}>B2</option></select></label>
      <label>Tipe Kendaraan Detail<input id="profileTipe" value="${p.tipe_motor||''}" placeholder="Contoh: Vario 125 Hitam / Avanza Putih"></label>
    </div>
    <div class="row" style="margin-top:14px"><button id="btnSaveProfileRole" class="btn primary">💾 Simpan Perubahan</button><button id="btnCancelEdit" class="btn secondary">Batal</button></div>
    <p id="profileStatus" class="muted" style="margin-top:8px"></p>
  </div>
  <div class="card" style="border:1px solid #22c55e;background:rgba(34,197,94,0.07)"><h4 style="margin:0 0 8px">🔔 Notifikasi Push</h4><p class="muted" style="font-size:11px;line-height:1.5">Aktifkan biar dapat notifikasi order masuk (driver) & driver ditemukan (penumpang) walau HP terkunci.</p><div class="row" style="gap:8px"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan Notifikasi</button><button id="btnDisablePush" class="btn secondary" style="flex:0 0 80px">Matikan</button></div><p id="pushStatus" class="muted" style="font-size:11px;margin-top:6px"></p></div>
  <div class="card" style="border:1px solid #ef4444;background:rgba(239,68,68,0.06)"><h4 style="color:#ef4444;margin:0 0 8px">🗑️ Zona Bahaya - Hapus Akun</h4><p class="muted" style="font-size:11px;line-height:1.5">Menghapus akun akan menghapus semua data profil, lokasi driver, dan order terkait. Tidak bisa dibatalkan. Ketik <b>HAPUS</b> untuk konfirmasi.</p><label>Konfirmasi ketik HAPUS<input id="confirmDelete" placeholder="HAPUS" style="border-color:#ef4444"></label><button id="btnDeleteAccount" class="btn" style="background:#ef4444;color:white;margin-top:8px">🗑️ Hapus Akun Permanen</button><p id="deleteStatus" class="muted" style="font-size:11px;margin-top:6px"></p></div>`;
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

// views.js - template HTML (placeholder, pakai punyamu yang asli)
export function viewLogin(){ return `<div class="card">Login dengan Google</div>`; }
export function viewHome(p){ return `<div>Home - ${p?.name||''}</div>`; }
export function viewOnboarding(){ return `<div>Onboarding</div>`; }
export function viewPassenger(){ return `<div>Passenger view - pickup, dest, driverList</div>`; }
export function viewDriver(){ return `<div>Driver view - btnOnline, btnOffline</div>`; }
export function viewProfile(p){ return `<div>Profile - ${p?.name||''}</div>`; }


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
      <div>
        <h3>👥 List User <span style="font-size:11px;color:#666" id="userCount"></span></h3>
        <div id="adminUserList" style="max-height:60vh;overflow:auto;border:1px solid #eee;border-radius:12px">Loading users...</div>
      </div>
      <div>
        <h3>🚩 Laporan Akun</h3>
        <div id="adminReportList" style="max-height:60vh;overflow:auto;border:1px solid #fee2e2;border-radius:12px;background:#fef2f2">Belum ada fitur lapor (tombol lapor akan ada di detail user & order).<br><br>SQL untuk buat tabel reports ada di admin.js ADMIN_SQL.</div>
        <div id="adminUserDetail" style="margin-top:12px;border:1px solid #ddd;border-radius:12px;padding:10px;display:none"></div>
      </div>
    </div>
  </div>`;
}

export function viewAdminSettings(settings){
  const s = settings||{};
  return `
  <div class="admin-page" style="padding:12px;max-width:600px">
    <h2>⚙️ Setting Aplikasi</h2>
    <p class="muted" style="font-size:12px">Ubah nama app, warna tombol, disclaimer. Disimpan di localStorage & tabel app_settings jika ada.</p>
    
    <div class="card" style="margin-top:12px">
      <label><b>Judul / Nama App</b><br><input id="setAppName" value="${s.appName||'Ojol Trenggalek'}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Nama Pendek</b><br><input id="setAppShort" value="${s.appShortName||'Ojol'}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Warna Primary (tombol utama)</b><br><input id="setPrimary" type="color" value="${s.primaryColor||'#16a34a'}" style="width:60px;height:40px"><span style="margin-left:8px">${s.primaryColor||'#16a34a'}</span></label><br><br>
      <label><b>Warna Secondary</b><br><input id="setSecondary" type="color" value="${s.secondaryColor||'#f59e0b'}" style="width:60px;height:40px"><span>${s.secondaryColor||'#f59e0b'}</span></label><br><br>
      <label><b>Judul Disclaimer</b><br><input id="setDiscTitle" value="${s.disclaimerTitle||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      <label><b>Isi Disclaimer Text</b><br><textarea id="setDiscText" style="width:100%;height:120px;padding:8px;border-radius:8px;border:1px solid #ccc">${s.disclaimerText||''}</textarea></label><br><br>
      <label><b>Footer Text</b><br><input id="setFooter" value="${s.footerText||''}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc"></label><br><br>
      
      <div style="display:flex;gap:8px">
        <button id="btnSaveSettings" class="btn primary" style="background:${s.primaryColor||'#16a34a'};flex:1">💾 Simpan Setting</button>
        <button id="btnResetSettings" class="btn secondary">Reset Default</button>
      </div>
      <div id="settingStatus" style="margin-top:8px;font-size:12px"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h4>🔧 Ubah Kecamatan Aktif (config.js)</h4>
      <p style="font-size:12px">Ganti kecamatan pickup di <code>config.js</code> baris <code>ACTIVE_KECAMATAN_CODE</code><br>Contoh: 3503071=Suruh, 3503090=Durenan, 3503010=Panggul</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px" id="kecamatanButtons"></div>
    </div>

    <div class="card" style="margin-top:16px;background:#fef3c7">
      <h4>📜 SQL Setup Admin (copy ke Supabase SQL Editor)</h4>
      <pre style="font-size:10px;white-space:pre-wrap;background:#fff;padding:8px;border-radius:8px;max-height:200px;overflow:auto" id="adminSqlBox">Loading...</pre>
    </div>
  </div>`;
}

// views.js v16 - SKEMA BENAR
export function viewLogin(){ return `<div class="card"><h2>🛵 OJOL</h2><p class="muted">Login Google 1x.</p><button id="btnGoogle" class="btn google"><img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20"/> Lanjut dengan Google</button></div>`; }

export function viewHome(p){
  if(!p) return viewLogin();
  const hour = new Date().getHours(); const greet = hour<11 ? 'Selamat Pagi' : hour<15 ? 'Selamat Siang' : hour<18 ? 'Selamat Sore' : 'Selamat Malam';
  const role = (p.role||'').toLowerCase();
  if(role==='admin'){
    return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Kamu login sebagai <b style="color:#22c55e">admin</b></p>
    <div class="row" style="margin-top:12px">
      <a href="#/admin" class="btn primary" style="flex:1;text-align:center;background:linear-gradient(135deg,#22c55e,#16a34a)">📊 Dashboard</a>
      <a href="#/admin/settings" class="btn secondary" style="flex:1;text-align:center">⚙️ Pengaturan</a>
    </div>
    <a href="#/profile" class="btn secondary" style="margin-top:10px;text-align:center;display:block">👤 Profil</a>
    </div>`;
  }
  if(role==='driver'){
    return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Driver • ${p.status||'offline'}</p>
    <div class="row" style="margin-top:12px"><button id="btnGoOnline" class="btn ${p.status==='online'?'online-active':'offline-active'}" data-status="${p.status||'offline'}">${p.status==='online'?'🟢 Online':'🔴 Go Online'}</button><a href="#/profile" class="btn secondary" style="flex:1;text-align:center">👤 Profil</a></div></div>`;
  }
  return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Penumpang</p>
  <div class="row" style="margin-top:12px"><a href="#/passenger" class="btn primary" style="flex:1;text-align:center">🧍 Pesan Ojol</a><a href="#/profile" class="btn secondary" style="flex:1;text-align:center">👤 Profil</a></div></div>`;
}

export function viewOnboarding(p){ return `<div class="card"><h3>👋 Halo ${p?.name||''}</h3><label>Nama Tampilan<input id="displayName" value="${p?.name||''}"></label><div class="row"><button id="btnSaveOnboard" class="btn primary">💾 Simpan</button></div></div>`; }

export function viewPassenger(currentProfile){
  return `<div class="card"><h3>🧍 Order Ojol</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
  <label>Pickup <div class="row" style="gap:8px"><input id="pickup" placeholder="Lokasi jemput..." style="flex:4"><button id="btnRefreshPickup" class="btn secondary" style="flex:0 0 48px">📍</button></div></label>
  <label>Tujuan <div class="row" style="gap:8px"><input id="dest" placeholder="Tujuan di Trenggalek..." style="flex:4"><button id="btnOpenMap" class="btn secondary" style="flex:0 0 64px">🗺️ Map</button></div><div id="destSuggestions" style="display:none"></div></label>
  <div class="row" style="gap:8px;margin-top:6px"><label style="flex:1;border:2px solid #22c55e;border-radius:12px;padding:10px;text-align:center"><input type="radio" name="vehicleType" value="motor" checked style="display:none"><span>🏍️</span><br/><b>Motor</b></label><label style="flex:1;border:1px solid #334155;border-radius:12px;padding:10px;text-align:center"><input type="radio" name="vehicleType" value="mobil" style="display:none"><span>🚗</span><br/><b>Mobil</b></label></div>
  <div id="estimateCard" style="display:none;margin-top:12px"><p>Jarak: <b id="estDistance">-</b> • Biaya: <b id="estCost">-</b></p><p class="muted" id="searchInfo"></p><button id="btnOrder" class="btn primary" style="margin-top:8px">✅ Pesan Sekarang</button></div>
  <div id="driverList" style="margin-top:12px"></div></div>`;
}

export function viewDriver(p){
  return `<div class="card"><h3>🏍️ Driver - ${p?.name||''}</h3><p class="muted">Status: <b>${p?.status||'offline'}</b></p><button id="btnGoOnline" class="btn ${p?.status==='online'?'online-active':'offline-active'}" data-status="${p?.status||'offline'}" style="margin-top:12px">${p?.status==='online'?'🟢 Online - Tap untuk Offline':'🔴 Go Online'}</button><p class="muted" style="font-size:11px;margin-top:8px">Aktifkan GPS, status online akan share lokasi ke penumpang.</p></div><div id="driverOrders" class="card"><h4>📦 Order Masuk</h4><p class="muted">Belum ada order</p></div>`;
}

export function viewProfile(p){
  return `<div class="card"><h3>👤 Profil</h3><p><b>${p?.name||''}</b><br/><span class="muted">${p?.email||''} • ${p?.role||''}</span></p><div class="row" style="margin-top:12px"><button id="btnLogout" class="btn secondary">Logout</button></div></div>`;
}

export function viewBannedInfo(b){
  return `<div class="card" style="border:1px solid #ef4444"><h3>🚫 Akun Dibanned</h3><p>${b?.reason||'Melanggar aturan'}</p></div>`;
}

export function viewReportModal(){ return ''; }

export function viewAdminDashboard(stats={}, users=[], reports=[], banned=[], orders=[]){
  const s=stats;
  return `
  <div class="card"><h3>📊 Dashboard Admin</h3><p class="muted">Ringkasan - source: database</p>
    <div class="kpi">
      <div><b>${s.totalUsers||0}</b><span class="muted" style="font-size:10px">Total User</span></div>
      <div><b>${s.totalDrivers||0}</b><span class="muted" style="font-size:10px">Driver</span></div>
      <div><b>${s.driversOnline||0}</b><span class="muted" style="font-size:10px">Online</span></div>
    </div>
    <div class="kpi">
      <div><b>${s.totalPassengers||0}</b><span class="muted" style="font-size:10px">Penumpang</span></div>
      <div><b>${s.totalOrders||0}</b><span class="muted" style="font-size:10px">Orders</span></div>
      <div><b>${s.totalReports||0}</b><span class="muted" style="font-size:10px">Laporan</span></div>
    </div>
  </div>
  <div class="card"><h4>👥 Manajemen User (${users.length})</h4>
    ${users.map(u=>`<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin:8px 0;display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:13px">${u.name||''}</b><br/><span class="muted" style="font-size:11px">${u.email||''} • ${u.role}</span></div><select data-change-role="${u.id}" style="width:110px"><option value="passenger" ${u.role==='passenger'?'selected':''}>passenger</option><option value="driver" ${u.role==='driver'?'selected':''}>driver</option><option value="admin" ${u.role==='admin'?'selected':''}>admin</option></select></div>`).join('')||'<p class="muted">Tidak ada user</p>'}
  </div>
  <div class="card"><div class="row"><a href="#/admin" class="btn primary" style="flex:1">📊 Dashboard</a><a href="#/admin/settings" class="btn secondary" style="flex:1">⚙️ Pengaturan</a></div></div>
  `;
}

export function viewAdminSettings(s={}){
  return `
  <div class="card"><h3>⚙️ Pengaturan - Simpan ke Database</h3><p class="muted">Source: ${s._source||'default'} • Edit lalu Simpan, HP lain akan berubah</p><div class="row"><a href="#/admin" class="btn secondary" style="flex:1">📊 Dashboard</a><a href="#/admin/settings" class="btn primary" style="flex:1">⚙️ Pengaturan</a></div></div>
  <div class="card"><h4>🏷️ Identitas Aplikasi</h4><label>Nama Aplikasi<input id="setAppName" value="${s.app_name||'OJOL SURUH'}" /></label><label>Nama Wilayah<input id="setWilayah" value="${s.wilayah_name||'Kecamatan Suruh'}" /></label><label>Nama Kabupaten<input id="setKabupaten" value="${s.kabupaten_name||'Kabupaten Trenggalek'}" /></label></div>
  <div class="card" style="border:1px solid #22c55e"><h4>🗺️ Coverage</h4><label>Radius Suruh km<input id="setRadius" type="number" value="${s.coverage_radius_km||15}" /></label><div class="row"><label style="flex:1">Center Lat<input id="setCenterLat" type="number" value="${s.suruh_center?.lat||-8.1111679}" /></label><label style="flex:1">Center Lng<input id="setCenterLng" type="number" value="${s.suruh_center?.lng||111.6064513}" /></label></div></div>
  <div class="card" style="border:1px solid #f59e0b"><h4>💰 Tarif</h4><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label>Motor Base<input id="setMotorBase" type="number" value="${s.tarif_motor_base||3000}" /></label><label>Motor PerKm<input id="setMotorPerKm" type="number" value="${s.tarif_motor_perkm||2500}" /></label><label>Motor Min<input id="setMotorMin" type="number" value="${s.tarif_motor_min||5000}" /></label></div><div><label>Mobil Base<input id="setMobilBase" type="number" value="${s.tarif_mobil_base||8000}" /></label><label>Mobil PerKm<input id="setMobilPerKm" type="number" value="${s.tarif_mobil_perkm||5500}" /></label><label>Mobil Min<input id="setMobilMin" type="number" value="${s.tarif_mobil_min||15000}" /></label></div></div><label>PP Multiplier<input id="setPP" type="number" step="0.1" value="${s.pp_multiplier||1.6}" /></label></div>
  <div class="card"><button id="btnSaveSettings" class="btn primary" style="width:100%">💾 Simpan ke Database</button><p id="settingsStatus" class="muted" style="font-size:11px;margin-top:8px"></p><p class="muted" style="font-size:10px">Tersimpan di Supabase tabel app_settings, semua HP akan lihat perubahan nama aplikasi.</p></div>
  `;
}

export function viewAdminReports(reports=[], banned=[]){
  return `<div class="card"><h4>🚩 Laporan</h4><p class="muted">${reports.length} laporan</p></div>`;
}

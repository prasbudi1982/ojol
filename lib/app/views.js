// views.js - Semua template UI
export function viewLogin(){ return `<div class="card"><h2>🛵 OJOL</h2><p class="muted">Jembatan penumpang & driver. Login Google 1x.</p><button id="btnGoogle" class="btn google"><img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20"/> Lanjut dengan Google</button></div>`; }

export function viewHome(p){
  if(!p) return viewLogin();
  const hour = new Date().getHours(); const greet = hour<11 ? 'Selamat Pagi' : hour<15 ? 'Selamat Siang' : hour<18 ? 'Selamat Sore' : 'Selamat Malam';
  return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Kamu login sebagai <b>${p.role}</b></p><div class="row" style="margin-top:12px">${p.role==='passenger' ? `<a href="#/passenger" class="btn primary" style="flex:1;text-align:center">🧍 Pesan Ojol</a>` : `<a href="#/driver" class="btn primary" style="flex:1;text-align:center">🏍️ Go Online</a>`}<a href="#/profile" class="btn secondary" style="flex:1;text-align:center">👤 Profil</a></div></div><div class="card" style="border-left:4px solid #f59e0b"><h4>⚠️ Disclaimer - Aplikasi Hanya Jembatan</h4><p style="font-size:13px;line-height:1.6" class="muted">Aplikasi OJOL Kecamatan Suruh ini <b>hanya jembatan</b> untuk warga Suruh, Trenggalek. <b>Pickup dikunci Suruh, Tujuan hanya Kabupaten Trenggalek</b>.<br/><br/>• Pengelola <b>tidak bertanggung jawab</b> atas penyalahgunaan, penipuan, kecelakaan, kehilangan barang, atau tindakan melawan hukum.<br/>• Kesepakatan harga, rute, keselamatan tanggung jawab pribadi penumpang & driver.<br/>• Selalu verifikasi identitas, plat nomor, dan WA sebelum berangkat.</p></div>`;
}

export function viewOnboarding(p){ return `<div class="card"><h3>👋 Halo ${p?.name||''}</h3><p class="muted">Lengkapi nama dulu, pengaturan role ada di tab Profil.</p><label>Nama Tampilan<input id="displayName" value="${p?.name||''}"></label><div class="row"><button id="btnSaveOnboard" class="btn primary">💾 Simpan</button><a href="#/profile" class="btn secondary">Ke Profil</a></div><p id="saveStatus" class="muted"></p></div>`; }

export function viewPassenger(currentProfile){
  return `<div class="card"><h3>🧍 Order Ojol - ${currentProfile?.name||''}</h3><p class="muted" style="font-size:12px">📍 <span id="myLoc">mendeteksi lokasi...</span></p>
  <label>Pickup <span class="muted" style="font-size:10px" id="pickupLive">📡 live</span>
    <div class="row" style="gap:8px;align-items:center"><input id="pickup" placeholder="Lokasi jemput..." style="flex:4;min-width:0"><button id="btnRefreshPickup" class="btn secondary" style="flex:0 0 48px;padding:8px 0">📍</button></div>
  </label>
  <label>Tujuan <span class="muted" style="font-size:10px" id="destLive">🔍 ketik 1 huruf</span>
    <div class="row" style="gap:8px;align-items:center"><input id="dest" placeholder="Ketik tujuan di Trenggalek..." style="flex:4;min-width:0"><button id="btnOpenMap" class="btn secondary" style="flex:0 0 64px;padding:8px 0">🗺️ Map</button></div>
    <div id="destSuggestions" style="display:none;max-height:220px;overflow-y:auto;border:1px solid #334155;border-radius:8px;margin-top:6px;background:#0f172a"></div>
  </label>
  <div class="row" style="margin-top:8px"><label style="flex:1"><input type="radio" name="tripType" value="oneway" checked> Antar Saja</label><label style="flex:1"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
  <div id="estimateCard" style="display:none;margin-top:12px;border:1px dashed #475569;padding:10px;border-radius:8px"><p style="font-size:12px">Jarak: <b id="estDistance">-</b> • <span id="estTripType">-</span> • Biaya: <b id="estCost">-</b></p><p class="muted" id="searchInfo" style="font-size:11px"></p></div>
  <div id="driverList" style="margin-top:12px"></div>
  </div>
  <!-- Map Modal -->
  <div id="mapModal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);flex-direction:column"><div style="background:#0f172a;padding:12px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center"><b>🗺️ Pilih Tujuan - Trenggalek</b><button id="btnCloseMap" class="btn secondary">✕</button></div><div id="leafletMap" style="height:50vh;min-height:300px;flex-shrink:0"></div><div style="flex:1;overflow-y:auto;background:#1e293b;padding:12px;border-top:3px solid #22c55e"><p id="mapSelectedAddress" style="font-size:12px">Tap peta...</p><p id="mapSelectedCoords" style="font-size:10px" class="muted"></p><p id="mapTrenggalekBadge" style="font-size:11px;padding:4px 8px;border-radius:6px;margin-top:6px;display:inline-block"></p><div class="row" style="margin-top:10px;gap:8px"><button id="btnOpenGoogle" class="btn secondary" style="flex:1">🌐 Google Maps</button><button id="btnConfirmMap" class="btn primary" style="flex:1;padding:14px;font-weight:bold;font-size:14px;display:block">✅ PAKAI LOKASI INI</button></div></div></div>`;
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp;
  return `<div class="card"><h3>🏍️ Driver - ${p.name}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn primary">🟢 Go Online</button><button id="btnOffline" class="btn secondary">🔴 Offline</button></div></div>`;
}

export function viewProfile(p){
  if(!p) return `<div class="card">Belum login</div>`;
  const isDriver = p.role==='driver';
  const isAdmin = p.role==='admin';
  return `<div class="card"><h3>👤 Profil - Pengaturan Role</h3>
    <label>Nama<input id="editName" value="${p.name||''}"></label>
    <p class="muted" style="font-size:12px">${p.email}<br/>Role DB: <b style="color:${isAdmin?'#22c55e':'#8aa0b8'}">${p.role||'-'}</b> • ID: ${String(p.id).slice(0,8)}</p>
    ${isAdmin?'<div style="background:rgba(34,197,94,0.15);border:1px solid #22c55e;border-radius:10px;padding:10px;margin:10px 0"><b>🛡️ Kamu Admin</b><br/><span class="muted" style="font-size:11px">Tab Admin harusnya muncul di bawah. Jika tidak, hard refresh (Ctrl+Shift+R).</span><br/><a href="#/admin" class="btn primary" style="margin-top:8px;display:inline-block;padding:8px 14px;width:auto">Buka Panel Admin</a></div>':'<div style="background:rgba(245,158,11,0.12);border:1px solid #f59e0b;border-radius:10px;padding:8px;margin:8px 0"><span class="muted" style="font-size:11px">Bukan admin? Set di Supabase: <code>update users set role=\'admin\' where email=\'${p.email}\'</code> lalu logout-login lagi.</span></div>'}
    <label>Peran / Role (hanya di sini)<select id="profileRole"><option value="passenger" ${p.role==='passenger'?'selected':''}>🧍 Penumpang</option><option value="driver" ${p.role==='driver'?'selected':''}>🏍️ Driver</option><option value="admin" ${isAdmin?'selected':''}>🛡️ Admin (khusus)</option></select></label>
    <div id="profileDriverFields" style="display:${isDriver?'block':'none'};border:1px solid #334155;padding:10px;border-radius:8px;margin-top:8px"><label>Nopol<input id="profileNopol" value="${p.nopol||''}"></label><label>Tipe SIM<select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p.tipe_sim==='A'?'selected':''}>A</option><option value="C" ${p.tipe_sim==='C'?'selected':''}>C</option><option value="B1" ${p.tipe_sim==='B1'?'selected':''}>B1</option></select></label><label>Tipe Motor<input id="profileTipe" value="${p.tipe_motor||''}"></label><label>HP WA<input id="profileHp" value="${p.hp||''}"></label></div>
    <div class="row" style="margin-top:12px"><button id="btnSaveProfileRole" class="btn primary">💾 Simpan</button><button id="btnLogout" class="btn secondary">Logout</button></div><p id="profileStatus" class="muted"></p></div>`;
}

export function viewReportModal(reportedName='', reportedId='', reportedGoogle='', reportedEmail=''){
  return `<div id="reportModal" class="modal open" style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;align-items:center;justify-content:center;padding:16px">
    <div class="modal-box" style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;max-width:420px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">🚩 Laporkan ${reportedName||'Pengguna'}</h3>
        <button id="btnCloseReport" class="btn secondary" style="width:auto;padding:6px 12px">✕</button>
      </div>
      <p class="muted" style="font-size:11px">Laporan direview admin. Pelanggar bisa di-banned Google Account permanen.</p>
      <label>Alasan<select id="reportReason"><option value="">Pilih alasan</option><option>Penipuan / Fraud</option><option>Pelecehan / Kekerasan</option><option>Nopol / Data Palsu</option><option>Tarif tidak wajar / Memeras</option><option>Keterlambatan parah / No-show</option><option>Barang hilang / Pencurian</option><option>Ujaran kebencian / SARA</option><option>Spam / Penyalahgunaan kontak</option><option>Lainnya</option></select></label>
      <label>Deskripsi (min 10 karakter)<textarea id="reportDesc" rows="3" placeholder="Kronologi, jam, bukti..."></textarea></label>
      <input type="hidden" id="reportTargetId" value="${reportedId}" />
      <input type="hidden" id="reportTargetGoogle" value="${reportedGoogle}" />
      <input type="hidden" id="reportTargetEmail" value="${reportedEmail}" />
      <input type="hidden" id="reportTargetName" value="${reportedName}" />
      <p id="reportStatus" class="muted" style="font-size:11px;margin-top:6px"></p>
      <div class="row" style="margin-top:10px"><button id="btnSubmitReport" class="btn" style="background:#f59e0b;color:#000;flex:1">🚩 Kirim Laporan</button><button id="btnCloseReport2" class="btn secondary" style="flex:0 0 80px">Batal</button></div>
    </div>
  </div>`;
}
export function viewBannedInfo(bannedDetail){
  if(!bannedDetail) return '<div class="card" style="border:2px solid #ef4444"><h3>🚫 Akun Diblokir</h3><p class="muted">Akun kamu dibanned.</p></div>';
  return `<div class="card" style="border:2px solid #ef4444;background:rgba(239,68,68,0.12)"><h3 style="color:#ef4444;margin:0 0 8px">🚫 Akun Diblokir Permanen</h3><p style="font-size:13px">Google: <b>${bannedDetail.email||bannedDetail.google_id||'-'}</b></p><p class="muted" style="font-size:11px">Alasan: ${bannedDetail.reason||'-'}<br/>Tanggal: ${bannedDetail.banned_at? new Date(bannedDetail.banned_at).toLocaleString('id-ID') : '-'}</p><p class="muted" style="font-size:11px">Hubungi admin jika salah. Kamu tidak bisa login lagi dengan Google ini.</p></div>`;
}
export function viewAdminReports(reports=[], bannedList=[]){
  const repHtml = reports.length ? reports.map(r=>`
    <div class="card" style="border:1px solid var(--border);padding:10px;margin:8px 0">
      <div style="display:flex;justify-content:space-between"><b>${r.reason||'-'}</b><span class="muted" style="font-size:10px">${new Date(r.created_at).toLocaleString('id-ID')}</span></div>
      <p style="font-size:12px;margin:6px 0">${r.description||''}</p>
      <p class="muted" style="font-size:10px">Pelapor: ${r.reporter?.name||r.reporter_id?.slice(0,8)} → Terlapor: ${r.reported?.name||r.reported_id?.slice(0,8)||r.reported_email||r.reported_google_id?.slice(0,8)} • <b>${r.status}</b></p>
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="btn" style="background:#ef4444;color:white;padding:8px 10px;font-size:11px" data-ban-google="${r.reported_google_id||r.reported?.google_id||''}" data-ban-email="${r.reported_email||r.reported?.email||''}" data-ban-report="${r.id}" data-ban-reason="${r.reason}">🚫 Banned Google Account</button>
        <button class="btn secondary" style="padding:8px 10px;font-size:11px" data-mark-reviewed="${r.id}">✅ Reviewed</button>
      </div>
    </div>
  `).join('') : '<p class="muted">Belum ada laporan.</p>';
  const bannedHtml = bannedList.length ? bannedList.map(b=>`
    <div class="card" style="border:1px solid #ef4444;padding:10px;margin:8px 0;background:rgba(239,68,68,0.06)">
      <b>${b.email||b.google_id?.slice(0,20)}</b> <span class="muted" style="font-size:10px">${new Date(b.banned_at).toLocaleString('id-ID')}</span><br/><span class="muted" style="font-size:11px">Alasan: ${b.reason}</span><br/>
      <button class="btn secondary" style="padding:6px 10px;font-size:11px;margin-top:6px" data-unban-google="${b.google_id}">♻️ Unban</button>
    </div>
  `).join('') : '<p class="muted">Tidak ada akun banned.</p>';
  return `<div class="card"><h3>🛡️ Admin Panel - Laporan & Banned</h3><p class="muted" style="font-size:11px">Role admin bisa banned Google Account permanen. User banned tidak bisa login lagi.</p><p class="muted" style="font-size:10px">Cara jadi admin: di Supabase SQL → update users set role='admin' where email='emailmu@gmail.com'</p></div><div class="card"><h4>🚩 Laporan Masuk (${reports.length})</h4><div id="adminReportsList">${repHtml}</div></div><div class="card"><h4>🚫 Daftar Banned (${bannedList.length})</h4><div id="adminBannedList">${bannedHtml}</div></div>`;
}

// views.js v6.2 - hapus Test, tambah Edit toggle, highlight driver tetap
export function viewLogin(){ return `<div class="card"><h2>🛵 OJOL</h2><p class="muted">Jembatan penumpang & driver. Login Google 1x.</p><button id="btnGoogle" class="btn google"><img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20"/> Lanjut dengan Google</button></div>`; }

export function viewHome(p){
  if(!p) return viewLogin();
  const hour = new Date().getHours(); const greet = hour<11 ? 'Selamat Pagi' : hour<15 ? 'Selamat Siang' : hour<18 ? 'Selamat Sore' : 'Selamat Malam';
  const isAdmin = (p.role||'').toLowerCase()==='admin';
  const isDriver = (p.role||'').toLowerCase()==='driver';
  return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Kamu login sebagai <b style="color:${isAdmin?'#22c55e':'inherit'}">${p.role}</b> ${isAdmin?'<span style="background:#22c55e;color:#000;padding:2px 8px;border-radius:99px;font-size:10px;margin-left:6px">ADMIN</span>':''}</p>
  <div class="row" style="margin-top:12px;flex-wrap:wrap">
    ${isAdmin ? `
      <a href="#/admin" class="btn primary" style="flex:1;text-align:center;background:linear-gradient(135deg,#22c55e,#16a34a)">🛡️ Panel Admin</a>
      <a href="#/driver" class="btn secondary" style="flex:1;text-align:center">🏍️ Driver</a>
      <a href="#/passenger" class="btn secondary" style="flex:1;text-align:center">🧍 Penumpang</a>
    ` : isDriver ? `
      <a href="#/driver" class="btn primary" style="flex:1;text-align:center">🏍️ Go Online</a>
    ` : `
      <a href="#/passenger" class="btn primary" style="flex:1;text-align:center">🧍 Pesan Ojol</a>
    `}
    <a href="#/profile" class="btn secondary" style="flex:1;text-align:center">👤 Profil</a>
  </div>
  ${isAdmin ? `<div style="margin-top:12px;padding:10px;background:rgba(34,197,94,0.12);border:1px solid #22c55e;border-radius:10px"><b style="font-size:12px">🛡️ Admin Aktif</b><br/><span class="muted" style="font-size:11px">Kamu bisa akses tab ADMIN di bawah. Di sana ada laporan & banned.</span></div>` : ''}
  </div><div class="card" style="border-left:5px solid #f59e0b;background:rgba(245,158,11,0.09)"><h4 style="margin:0 0 8px;color:#fbbf24">⚠️ PERHATIAN TEGAS - BACA SEBELUM ORDER</h4><p style="font-size:12.5px;line-height:1.7" class="muted"><b style="color:#e6edf5">APLIKASI INI HANYA JEMBATAN DIGITAL WARGA KECAMATAN SURUH.</b> BUKAN PERUSAHAAN TRANSPORTASI.<br/><br/><b style="color:#fbbf24">BATAS WILAYAH MUTLAK:</b> Pickup WAJIB di Kecamatan Suruh. Tujuan WAJIB di dalam Kabupaten Trenggalek.<br/><br/>• <b>LEPAS TANGGUNG JAWAB TOTAL:</b> Pengelola tidak bertanggung jawab atas penipuan, kecelakaan, kehilangan.<br/>• <b>RISIKO DITANGGUNG PRIBADI:</b> Harga Motor Rp 2.500/km, Mobil Rp 5.500/km tanggung jawab penumpang & driver.<br/>• <b>WAJIB VERIFIKASI:</b> Cek foto profil, plat AG, jenis kendaraan, chat WA sebelum naik.</p></div>`;
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
  <label>Pilih Kendaraan</label>
  <div class="row" style="gap:8px;margin-top:6px">
    <label style="flex:1;border:2px solid #22c55e;border-radius:12px;padding:10px;text-align:center;cursor:pointer;background:rgba(34,197,94,0.1)" id="labelMotor"><input type="radio" name="vehicleType" value="motor" checked style="display:none"><span style="font-size:20px">🏍️</span><br/><b>Motor</b><br/><span class="muted" style="font-size:10px">Hemat • Rp 2.500/km</span></label>
    <label style="flex:1;border:1px solid #334155;border-radius:12px;padding:10px;text-align:center;cursor:pointer" id="labelMobil"><input type="radio" name="vehicleType" value="mobil" style="display:none"><span style="font-size:20px">🚗</span><br/><b>Mobil</b><br/><span class="muted" style="font-size:10px">Nyaman • Rp 5.500/km</span></label>
  </div>
  <div class="row" style="margin-top:8px"><label style="flex:1"><input type="radio" name="tripType" value="oneway" checked> Antar Saja</label><label style="flex:1"><input type="radio" name="tripType" value="roundtrip"> PP x1.6</label></div>
  <div id="estimateCard" style="display:none;margin-top:12px;border:1px dashed #475569;padding:10px;border-radius:8px"><p style="font-size:12px">Jarak: <b id="estDistance">-</b> • <span id="estTripType">-</span> • <span id="estVehicle">-</span> • Biaya: <b id="estCost">-</b></p><p class="muted" id="searchInfo" style="font-size:11px"></p></div>
  <div id="driverList" style="margin-top:12px"></div>

  <!-- LIVE TRACKING v7.0 -->
  <div id="activeOrderCard" style="display:none;margin-top:16px" class="card tracking-card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h4 style="margin:0">📡 Tracking Driver Live</h4>
      <span id="trackLastUpdate" class="muted" style="font-size:10px">-</span>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin:10px 0">
      <b id="trackDriverName">Driver</b><br/>
      <span id="trackDriverVehicle" class="muted" style="font-size:11px">-</span><br/>
      <div class="kpi" style="margin-top:10px">
        <div><b id="trackDistance">-</b><span class="muted" style="font-size:10px">Jarak</span></div>
        <div><b id="trackETA">-</b><span class="muted" style="font-size:10px">ETA</span></div>
        <div><b id="trackSpeed">-</b><span class="muted" style="font-size:10px">Speed</span></div>
      </div>
      <p id="trackStatus" style="margin:8px 0 0;font-size:13px;font-weight:700">🚀 Driver menuju pickup</p>
    </div>
    <div id="trackingMap" style="height:0;display:none;border-radius:12px;overflow:hidden;border:1px solid var(--border);margin:10px 0"></div>
    <div class="row" style="gap:8px">
      <a id="trackWA" href="#" target="_blank" class="btn secondary" style="flex:1;text-align:center;display:none">💬 WA Driver</a>
      <a id="trackGmaps" href="#" target="_blank" class="btn secondary" style="flex:0 0 48px;text-align:center">🗺️</a>
      <button id="btnCancelTracking" class="btn" style="flex:1;background:#ef4444;color:white">❌ Batal</button>
      <button id="btnCompleteOrder" class="btn primary" style="flex:1">✅ Sampai</button>
    </div>
    <p class="muted" style="font-size:10px;margin-top:8px">📍 Lokasi driver update tiap 3-5 detik via GPS. Jangan tutup app biar tracking tetap jalan.</p>
  </div>

  <!-- LIVE TRACKING CARD v7.0 -->
  <div id="activeOrderCard" style="display:none;margin-top:16px" class="card tracking-card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h4 style="margin:0">📡 Tracking Driver Live</h4>
      <span id="trackLastUpdate" class="muted" style="font-size:10px">-</span>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin:10px 0">
      <b id="trackDriverName">Driver</b><br/>
      <span id="trackDriverVehicle" class="muted" style="font-size:11px">-</span><br/>
      <div class="kpi" style="margin-top:10px">
        <div><b id="trackDistance">-</b><span class="muted" style="font-size:10px">Jarak</span></div>
        <div><b id="trackETA">-</b><span class="muted" style="font-size:10px">ETA</span></div>
        <div><b id="trackSpeed">-</b><span class="muted" style="font-size:10px">Speed</span></div>
      </div>
      <p id="trackStatus" style="margin:8px 0 0;font-size:13px;font-weight:700">🚀 Driver menuju pickup</p>
    </div>
    <div id="trackingMap" style="height:0;display:none;border-radius:12px;overflow:hidden;border:1px solid var(--border);margin:10px 0"></div>
    <div class="row" style="gap:8px">
      <a id="trackWA" href="#" target="_blank" class="btn secondary" style="flex:1;text-align:center;display:none">💬 WA Driver</a>
      <a id="trackGmaps" href="#" target="_blank" class="btn secondary" style="flex:0 0 48px;text-align:center">🗺️</a>
      <button id="btnCancelTracking" class="btn" style="flex:1;background:#ef4444;color:white">❌ Batal</button>
      <button id="btnCompleteOrder" class="btn primary" style="flex:1">✅ Sampai</button>
    </div>
    <p class="muted" style="font-size:10px;margin-top:8px">📍 Lokasi driver update tiap 3-5 detik via GPS. Jangan tutup app biar tracking tetap jalan.</p>
  </div>
  </div>
  <div id="mapModal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);flex-direction:column"><div style="background:#0f172a;padding:12px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center"><b>🗺️ Pilih Tujuan - Trenggalek</b><button id="btnCloseMap" class="btn secondary">✕</button></div><div id="leafletMap" style="height:50vh;min-height:300px;flex-shrink:0"></div><div style="flex:1;overflow-y:auto;background:#1e293b;padding:12px;border-top:3px solid #22c55e"><p id="mapSelectedAddress" style="font-size:12px">Tap peta...</p><p id="mapSelectedCoords" style="font-size:10px" class="muted"></p><p id="mapTrenggalekBadge" style="font-size:11px;padding:4px 8px;border-radius:6px;margin-top:6px;display:inline-block"></p><div class="row" style="margin-top:10px;gap:8px"><button id="btnOpenGoogle" class="btn secondary" style="flex:1">🌐 Google Maps</button><button id="btnConfirmMap" class="btn primary" style="flex:1;padding:14px;font-weight:bold;font-size:14px;display:block">✅ PAKAI LOKASI INI</button></div></div></div>`;
}

export function viewDriver(p){
  if(!p) return `<div class="card">Loading...</div>`;
  if(p.role!=='driver'){ return `<div class="card"><h3>🏍️ Driver</h3><p class="muted">Kamu sebagai penumpang. Ubah role di Profil.</p><a href="#/profile" class="btn primary">⚙️ Ubah Role di Profil</a></div>`; }
  const isComplete = p?.nopol && p?.tipe_sim && p?.hp && p?.jenis_kendaraan;
  const vehIcon = p.jenis_kendaraan==='mobil'?'🚗':'🏍️';
  const isOnline = (p.status === 'online');
  return `<div class="card"><h3>🏍️ Driver - ${p.name} ${vehIcon} ${p.jenis_kendaraan||'motor'}</h3><p class="muted">${p.nopol||'Data belum lengkap'} • ${p.tipe_sim? 'SIM '+p.tipe_sim : 'SIM belum diisi'} • ${vehIcon} ${p.jenis_kendaraan||''} • Status: <b id="drvStatus">${p.status}</b></p>${!isComplete?'<p style="color:#ef4444;font-size:12px">⚠️ Lengkapi Jenis Kendaraan, Nopol, SIM, HP di tab Profil dulu</p>':''}<div class="kpi"><div><b id="kpiSpeed">0</b><span class="muted">km/h</span></div><div><b id="kpiHead">0°</b></div><div><b id="kpiUpd">-</b></div></div><div class="row"><button id="btnOnline" class="btn ${isOnline?'online-active':'secondary'}">🟢 Go Online</button><button id="btnOffline" class="btn ${!isOnline?'offline-active':'secondary'}">🔴 Offline</button></div></div>`;
}

export function viewProfile(p){
  if(!p) return `<div class="card">Belum login</div>`;
  const isDriver = p.role==='driver';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  return `<div class="card"><h3>👤 Profil Saya</h3><p class="muted" style="font-size:11px">Role: <b style="color:${(p.role||'').toLowerCase()==='admin'?'#22c55e':'#8aa0b8'}">${p.role}</b> ${ (p.role||'').toLowerCase()==='admin' ? '<a href="#/admin" class="btn primary" style="display:inline-block;width:auto;padding:4px 10px;font-size:11px;margin-left:6px">🛡️ Admin Panel</a>' : '' }</p>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1"><b style="font-size:15px">${p.name||''}</b><br/><span class="muted" style="font-size:11px;line-height:1.6">📧 ${p.email}<br/>${isDriver?'🏍️ Driver':'🧍 Penumpang'} • HP: ${hp||'-'}<br/>${!isDriver?`Desa: ${desa||'-'}<br/>Alamat: ${alamat||'-'}`:`${p.jenis_kendaraan||''} • ${p.nopol||''} • SIM ${p.tipe_sim||''}`}<br/>ID: ${String(p.id).slice(0,8)}</span></div>
      <button id="btnEditProfile" class="btn secondary" style="width:auto;padding:8px 14px;flex-shrink:0">✏️ Edit</button>
    </div>
    <div class="row"><button id="btnLogout" class="btn secondary">Logout</button></div>
  </div>
  <div id="profileEditForm" style="display:none" class="card"><h3>✏️ Edit Profil</h3>
    <label>Nama Lengkap<input id="editName" value="${p.name||''}" placeholder="Nama sesuai KTP"></label>
    <label>Peran / Role<select id="profileRole"><option value="passenger" ${p.role==='passenger'?'selected':''}>🧍 Penumpang</option><option value="driver" ${p.role==='driver'?'selected':''}>🏍️ Driver</option><option value="admin" ${p.role==='admin'?'selected':''}>🛡️ Admin</option></select></label>
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

export function viewReportModal(reportedName='', reportedId='', reportedGoogle='', reportedEmail=''){
  return `<div id="reportModal" class="modal open" style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;align-items:center;justify-content:center;padding:16px">
    <div class="modal-box" style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;max-width:420px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">🚩 Laporkan ${reportedName||'Pengguna'}</h3>
        <button id="btnCloseReport" class="btn secondary" style="width:auto;padding:6px 12px">✕</button>
      </div>
      <p class="muted" style="font-size:11px">Laporan direview admin.</p>
      <label>Alasan<select id="reportReason"><option value="">Pilih alasan</option><option>Penipuan / Fraud</option><option>Pelecehan / Kekerasan</option><option>Nopol / Data Palsu</option><option>Tarif tidak wajar / Memeras</option><option>Keterlambatan parah / No-show</option><option>Barang hilang / Pencurian</option><option>Ujaran kebencian / SARA</option><option>Spam</option><option>Lainnya</option></select></label>
      <label>Deskripsi<textarea id="reportDesc" rows="3"></textarea></label>
      <input type="hidden" id="reportTargetId" value="${reportedId}" />
      <input type="hidden" id="reportTargetGoogle" value="${reportedGoogle}" />
      <input type="hidden" id="reportTargetEmail" value="${reportedEmail}" />
      <input type="hidden" id="reportTargetName" value="${reportedName}" />
      <p id="reportStatus" class="muted"></p>
      <div class="row"><button id="btnSubmitReport" class="btn" style="background:#f59e0b;color:#000;flex:1">🚩 Kirim Laporan</button><button id="btnCloseReport2" class="btn secondary">Batal</button></div>
    </div>
  </div>`;
}
export function viewBannedInfo(bannedDetail){
  if(!bannedDetail) return '<div class="card" style="border:2px solid #ef4444"><h3>🚫 Akun Diblokir</h3></div>';
  return `<div class="card" style="border:2px solid #ef4444;background:rgba(239,68,68,0.12)"><h3 style="color:#ef4444">🚫 Akun Diblokir Permanen</h3><p>Google: <b>${bannedDetail.email||bannedDetail.google_id}</b></p><p class="muted">Alasan: ${bannedDetail.reason}</p></div>`;
}
export function viewAdminReports(reports=[], bannedList=[]){
  const repHtml = reports.length ? reports.map(r=>`<div class="card" style="padding:12px;margin:8px 0;border-left:4px solid #ef4444">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><b style="font-size:13px">🚩 ${r.reason}</b><span class="muted" style="font-size:10px">${new Date(r.created_at).toLocaleString('id-ID')}</span></div>
    <p style="font-size:12px;margin:8px 0;line-height:1.5">${r.description||'-'}</p>
    <p class="muted" style="font-size:11px">Pelapor: <b>${r.reporter?.name||r.reporter_id?.slice(0,8)||'-'}</b> (${r.reporter?.email||''})<br/>Terlapor: <b>${r.reported?.name||r.reported_email||r.reported_google_id?.slice(0,12)||r.reported_id?.slice(0,8)||'-'}</b> • Status: <b style="color:${r.status==='pending'?'#f59e0b':'#22c55e'}">${r.status}</b></p>
    <div class="row" style="gap:6px;margin-top:10px">
      <button class="btn" style="background:#ef4444;color:white;padding:10px;font-size:12px;flex:1" data-ban-google="${r.reported_google_id||r.reported?.google_id||''}" data-ban-email="${r.reported_email||r.reported?.email||''}" data-ban-report="${r.id}" data-ban-reason="${r.reason}">🚫 Banned Google Account Permanen</button>
      <button class="btn secondary" style="padding:10px;font-size:11px;flex:0 0 90px" data-mark-reviewed="${r.id}">✅ Reviewed</button>
    </div>
  </div>`).join('') : '<div class="card"><p class="muted">✅ Belum ada laporan. Semua aman.</p></div>';
  
  const bannedHtml = bannedList.length ? bannedList.map(b=>`<div class="card" style="border:1px solid #ef4444;padding:10px;margin:8px 0;background:rgba(239,68,68,0.06)">
    <div style="display:flex;justify-content:space-between"><b>${b.email||b.google_id?.slice(0,20)||'-'}</b><span class="muted" style="font-size:10px">${b.banned_at? new Date(b.banned_at).toLocaleString('id-ID') : '-'}</span></div>
    <p class="muted" style="font-size:11px;margin-top:4px">Alasan: ${b.reason||'-'}<br/>By: ${b.banner?.name||'-'}</p>
    <button class="btn secondary" style="padding:6px 10px;font-size:11px;margin-top:6px" data-unban-google="${b.google_id}">♻️ Unban / Pulihkan</button>
  </div>`).join('') : '<div class="card"><p class="muted">Tidak ada akun banned.</p></div>';

  return `
  <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e293b);border:2px solid #22c55e">
    <h3 style="margin:0">🛡️ Admin Panel - Kecamatan Suruh</h3>
    <p class="muted" style="font-size:12px;margin-top:6px;line-height:1.6">
      Login sebagai <b style="color:#22c55e">ADMIN</b>. Kamu punya akses penuh:<br/>
      • Lihat & tindak lanjuti laporan penipuan/pelecehan<br/>
      • Banned Google Account permanen (user tidak bisa login lagi)<br/>
      • Unban akun salah banned<br/>
      • Monitor semua order & user (coming soon)
    </p>
    <div class="kpi" style="margin-top:12px">
      <div><b>${reports.length}</b><span class="muted" style="font-size:10px">Laporan Pending</span></div>
      <div><b>${bannedList.length}</b><span class="muted" style="font-size:10px">Akun Banned</span></div>
      <div><b style="color:#22c55e">ON</b><span class="muted" style="font-size:10px">Admin Mode</span></div>
    </div>
    <div class="row" style="margin-top:12px;gap:8px">
      <a href="#/" class="btn secondary" style="flex:1;text-align:center">🏠 Home</a>
      <a href="#/passenger" class="btn secondary" style="flex:1;text-align:center">🧍 Penumpang</a>
      <a href="#/driver" class="btn secondary" style="flex:1;text-align:center">🏍️ Driver</a>
    </div>
  </div>

  <div class="card" style="border:1px solid #f59e0b">
    <h4 style="margin:0 0 6px">📋 Cara Kerja Admin</h4>
    <ol style="font-size:12px;line-height:1.7;margin:8px 0;padding-left:18px" class="muted">
      <li>Warga lapor driver/penumpang nakal via tombol 🚩 di daftar driver</li>
      <li>Laporan masuk sini dengan alasan & deskripsi</li>
      <li>Admin review, kalau valid klik <b>🚫 Banned Google Account</b></li>
      <li>User yang di-banned akan auto logout & tidak bisa login lagi dengan Google itu</li>
      <li>Data banned tersimpan di tabel <code>banned_users</code> + flag <code>users.is_banned</code></li>
    </ol>
  </div>

  <div class="card">
    <h4 style="margin:0 0 10px">🚩 Laporan Masuk (${reports.length})</h4>
    <div id="adminReportsList">${repHtml}</div>
  </div>

  <div class="card">
    <h4 style="margin:0 0 10px">🚫 Daftar Banned Permanen (${bannedList.length})</h4>
    <div id="adminBannedList">${bannedHtml}</div>
  </div>

  <div class="card" style="border:1px dashed #475569">
    <h4 style="margin:0 0 6px">🔧 SQL Admin</h4>
    <p class="muted" style="font-size:11px">Jadikan user lain admin:</p>
    <code style="font-size:11px;background:#0f172a;padding:8px;border-radius:8px;display:block;margin:6px 0">update public.users set role='admin' where email='email_lain@gmail.com';</code>
    <p class="muted" style="font-size:11px;margin-top:8px">Lihat semua user:</p>
    <code style="font-size:11px;background:#0f172a;padding:8px;border-radius:8px;display:block;margin:6px 0">select email, role, status, nopol, desa from public.users order by created_at desc limit 50;</code>
  </div>
  `;
}

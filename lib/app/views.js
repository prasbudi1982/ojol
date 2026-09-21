// views.js - MODUL TAMPILAN NON-KRITIS ONLY - home, greeting, disclaimer
// Tidak ada hubungan dengan modul penting (order, map, driver, admin, profile)
// Edit file ini aman, tidak akan bikin blank / map hilang

export function viewLogin(){ 
  return `<div class="card"><h2>🛵 OJOL</h2><p class="muted">Jembatan penumpang & driver. Login Google 1x.</p><button id="btnGoogle" class="btn google"><img src="https://www.svgrepo.com/show/475656/google-color.svg" width="20"/> Lanjut dengan Google</button></div>`; 
}

export function viewHome(p){
  if(!p) return viewLogin();
  const hour = new Date().getHours(); const greet = hour<11 ? 'Selamat Pagi' : hour<15 ? 'Selamat Siang' : hour<18 ? 'Selamat Sore' : 'Selamat Malam';
  return `<div class="card"><h2>${greet}, ${p.name} 👋</h2><p class="muted">Kamu login sebagai <b>${p.role}</b></p><div class="row" style="margin-top:12px">${p.role==='passenger' ? `<a href="#/passenger" class="btn primary" style="flex:1;text-align:center">🧍 Pesan Ojol</a>` : `<a href="#/driver" class="btn primary" style="flex:1;text-align:center">🏍️ Go Online</a>`}<a href="#/profile" class="btn secondary" style="flex:1;text-align:center">👤 Profil</a></div></div><div class="card" style="border-left:5px solid #f59e0b;background:rgba(245,158,11,0.09)">
  <h4 style="margin:0 0 10px;color:#fbbf24">📜 DISCLAIMER & SYARAT KETENTUAN LAYANAN</h4>
  <div style="font-size:12.5px;line-height:1.7" class="muted">
    <b style="color:#e6edf5">1. Sifat Layanan Non-Komersial</b><br/>
    Platform ini murni berfungsi sebagai media informasi dan direktori komunitas sosial yang menjembatani komunikasi antarmasyarakat. Pengelola tidak mengambil keuntungan finansial, memungut biaya pendaftaran, komisi transaksi, atau imbalan apa pun dari pengguna (penumpang) maupun penyedia jasa (pengemudi).
  </div>
  <details id="disclaimerDetails" style="margin-top:10px">
    <summary id="btnDisclaimerMore" style="cursor:pointer;color:#fbbf24;font-weight:700;font-size:12.5px;list-style:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid #f59e0b;border-radius:8px;background:rgba(245,158,11,0.15)">📖 Baca selengkapnya <span style="font-size:10px">▼</span></summary>
    <div style="font-size:12.5px;line-height:1.8;margin-top:12px" class="muted">
      <b style="color:#e6edf5;display:block;margin:10px 0 4px">2. Pembatasan Tanggung Jawab Hukum (Limitation of Liability)</b>
      Pengelola platform bukanlah perusahaan penyedia jasa transportasi (aplikator) maupun agen perantara. Estimasi biaya yang tercantum pada platform ini murni bersifat referensi non-mengikat. Segala bentuk negosiasi tarif, metode transaksi, kelayakan kendaraan, keselamatan fisik, kehilangan barang, hingga risiko kecelakaan atau tindak pidana yang terjadi selama perjalanan adalah tanggung jawab perdata dan pidana sepenuhnya secara mandiri antara penumpang dan pengemudi. Pengelola dibebaskan dari segala tuntutan hukum atau ganti rugi atas perselisihan yang timbul dari interaksi tersebut.
      <b style="color:#e6edf5;display:block;margin:12px 0 4px">3. Persetujuan Publikasi Data Pribadi</b>
      Seluruh data identitas dan nomor kontak WhatsApp pengemudi yang ditampilkan pada platform ini telah mendapatkan persetujuan tertulis secara sadar (express consent) dari masing-masing pemilik data untuk tujuan sosial. Pengelola tidak bertanggung jawab atas penyalahgunaan nomor kontak tersebut oleh pihak ketiga di luar ekosistem platform ini.
      <b style="color:#e6edf5;display:block;margin:12px 0 4px">4. Pernyataan Setuju Pengguna</b>
      Dengan mengakses, menggunakan, atau menghubungi kontak yang tertera di platform ini, Anda secara otomatis menyatakan tunduk, memahami, dan menyetujui seluruh ketentuan dalam Disclaimer ini tanpa paksaan.
      <span style="font-size:11px;color:#8aa0b8;display:block;margin-top:14px;border-top:1px solid #334155;padding-top:8px">Dengan menekan tombol Pesan Ojol / Go Online, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh poin di atas tanpa paksaan.</span>
    </div>
  </details>
</div>`;
}

export function viewOnboarding(p){ return `<div class="card"><h3>👋 Halo ${p?.name||''}</h3><p class="muted">Lengkapi nama dulu, pengaturan role ada di tab Profil.</p><label>Nama Tampilan<input id="displayName" value="${p?.name||''}"></label><div class="row"><button id="btnSaveOnboard" class="btn primary">💾 Simpan</button><a href="#/profile" class="btn secondary">Ke Profil</a></div><p id="saveStatus" class="muted"></p></div>`; }

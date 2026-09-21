// config.js - VERSI FLEKSIBEL STABIL - Ganti kecamatan cukup 1 baris, anti-error
// Support dropdown Admin Setting via localStorage
export const ACTIVE_KECAMATAN_CODE_DEFAULT = '3503071'; // default

export const KECAMATAN_DATA = {
  '3503010': { name: 'Panggul', center: { lat: -8.204, lng: 111.45 }, radiusKm: 15, bbox: { minLat: -8.30, maxLat: -8.10, minLng: 111.35, maxLng: 111.55 } },
  '3503020': { name: 'Munjungan', center: { lat: -8.25, lng: 111.58 }, radiusKm: 18, bbox: { minLat: -8.35, maxLat: -8.15, minLng: 111.45, maxLng: 111.70 } },
  '3503030': { name: 'Watulimo', center: { lat: -8.25, lng: 111.68 }, radiusKm: 15, bbox: { minLat: -8.35, maxLat: -8.15, minLng: 111.58, maxLng: 111.80 } },
  '3503040': { name: 'Kampak', center: { lat: -8.20, lng: 111.58 }, radiusKm: 12, bbox: { minLat: -8.28, maxLat: -8.12, minLng: 111.50, maxLng: 111.66 } },
  '3503050': { name: 'Dongko', center: { lat: -8.18, lng: 111.58 }, radiusKm: 14, bbox: { minLat: -8.28, maxLat: -8.08, minLng: 111.48, maxLng: 111.68 } },
  '3503060': { name: 'Pule', center: { lat: -8.05, lng: 111.55 }, radiusKm: 15, bbox: { minLat: -8.15, maxLat: -7.95, minLng: 111.45, maxLng: 111.65 } },
  '3503070': { name: 'Karangan', center: { lat: -8.07, lng: 111.62 }, radiusKm: 12, bbox: { minLat: -8.15, maxLat: -7.99, minLng: 111.54, maxLng: 111.70 } },
  '3503071': { name: 'Suruh', center: { lat: -8.1111679, lng: 111.6064513 }, radiusKm: 15, bbox: { minLat: -8.20, maxLat: -8.02, minLng: 111.52, maxLng: 111.70 } },
  '3503080': { name: 'Gandusari', center: { lat: -8.05, lng: 111.68 }, radiusKm: 12, bbox: { minLat: -8.12, maxLat: -7.98, minLng: 111.60, maxLng: 111.76 } },
  '3503090': { name: 'Durenan', center: { lat: -8.08, lng: 111.78 }, radiusKm: 12, bbox: { minLat: -8.15, maxLat: -8.00, minLng: 111.70, maxLng: 111.86 } },
  '3503100': { name: 'Pogalan', center: { lat: -8.07, lng: 111.73 }, radiusKm: 10, bbox: { minLat: -8.14, maxLat: -8.00, minLng: 111.65, maxLng: 111.81 } },
  '3503110': { name: 'Trenggalek Kota', center: { lat: -8.05, lng: 111.71 }, radiusKm: 10, bbox: { minLat: -8.12, maxLat: -7.98, minLng: 111.63, maxLng: 111.79 } },
  '3503120': { name: 'Tugu', center: { lat: -8.02, lng: 111.62 }, radiusKm: 12, bbox: { minLat: -8.10, maxLat: -7.94, minLng: 111.54, maxLng: 111.70 } },
  '3503130': { name: 'Bendungan', center: { lat: -7.98, lng: 111.70 }, radiusKm: 12, bbox: { minLat: -8.06, maxLat: -7.90, minLng: 111.62, maxLng: 111.78 } },
};

function getActiveCode(){
  try{
    if(typeof localStorage!=='undefined'){
      const c1 = localStorage.getItem('active_kecamatan_code');
      if(c1 && KECAMATAN_DATA[c1]) return c1;
      const saved = localStorage.getItem('app_settings');
      if(saved){
        const js = JSON.parse(saved);
        if(js.activeKecamatanCode && KECAMATAN_DATA[js.activeKecamatanCode]) return js.activeKecamatanCode;
      }
    }
  }catch(e){}
  return ACTIVE_KECAMATAN_CODE_DEFAULT;
}

export function getActiveKecamatanCodeLive(){
  return getActiveCode();
}

export function getActiveKecamatanLive(){
  const code = getActiveCode();
  return { code, ...(KECAMATAN_DATA[code] || KECAMATAN_DATA['3503071']) };
}

export const ACTIVE_KECAMATAN_CODE = typeof window!=='undefined' ? getActiveCode() : ACTIVE_KECAMATAN_CODE_DEFAULT;

const active = KECAMATAN_DATA[ACTIVE_KECAMATAN_CODE] || KECAMATAN_DATA['3503071'];


// Export nama lama biar kompatibel dengan file lama
export const ACTIVE_KECAMATAN_NAME = active.name;
export const ACTIVE_CENTER = active.center;
export const ACTIVE_BBOX = active.bbox;
export const ACTIVE_RADIUS_KM = active.radiusKm;

// Alias lama (SURUH_...) tetap ada biar map.js & geofence.js lama tidak error
export const SURUH_CENTER = active.center;
export const SURUH_BBOX = active.bbox;
export const SURUH_RADIUS_KM = active.radiusKm;

export const TRENGGALEK_BBOX = { minLat: -8.50, maxLat: -7.95, minLng: 111.32, maxLng: 111.90 };

// Tarif
export const VEHICLE_TYPES = {
  motor: { id: 'motor', label: 'Motor', icon: '🏍️', desc: '1 penumpang, cepat, hemat' },
  mobil: { id: 'mobil', label: 'Mobil', icon: '🚗', desc: '4 penumpang, nyaman, hujan aman' }
};
export const TARIF = {
  motor: { base: 3000, perKm: 2500, min: 5000, label: 'Motor' },
  mobil: { base: 8000, perKm: 5500, min: 15000, label: 'Mobil' },
  ppMultiplier: 1.6
};

// ===== APP SETTINGS - Bisa diubah via Admin Setting =====
export const APP_SETTINGS_DEFAULT = {
  activeKecamatanCode: '3503071',
  appName: 'Ojol Trenggalek',
  appShortName: 'Ojol',
  primaryColor: '#16a34a',
  secondaryColor: '#f59e0b',
  disclaimerTitle: 'DISCLAIMER & SYARAT KETENTUAN LAYANAN',
  disclaimerText: `1. Sifat Layanan Non-Komersial
Platform ini murni berfungsi sebagai media informasi dan direktori komunitas sosial yang menjembatani komunikasi antarmasyarakat. Pengelola tidak mengambil keuntungan finansial, memungut biaya pendaftaran, komisi transaksi, atau imbalan apa pun dari pengguna (penumpang) maupun penyedia jasa (pengemudi).

2. Pembatasan Tanggung Jawab Hukum (Limitation of Liability)
Pengelola platform bukanlah perusahaan penyedia jasa transportasi (aplikator) maupun agen perantara. Estimasi biaya yang tercantum pada platform ini murni bersifat referensi non-mengikat. Segala bentuk negosiasi tarif, metode transaksi, kelayakan kendaraan, keselamatan fisik, kehilangan barang, hingga risiko kecelakaan atau tindak pidana yang terjadi selama perjalanan adalah tanggung jawab perdata dan pidana sepenuhnya secara mandiri antara penumpang dan pengemudi. Pengelola dibebaskan dari segala tuntutan hukum atau ganti rugi atas perselisihan yang timbul dari interaksi tersebut.

3. Persetujuan Publikasi Data Pribadi
Seluruh data identitas dan nomor kontak WhatsApp pengemudi yang ditampilkan pada platform ini telah mendapatkan persetujuan tertulis secara sadar (express consent) dari masing-masing pemilik data untuk tujuan sosial. Pengelola tidak bertanggung jawab atas penyalahgunaan nomor kontak tersebut oleh pihak ketiga di luar ekosistem platform ini.

4. Pernyataan Setuju Pengguna
Dengan mengakses, menggunakan, atau menghubungi kontak yang tertera di platform ini, Anda secara otomatis menyatakan tunduk, memahami, dan menyetujui seluruh ketentuan dalam Disclaimer ini tanpa paksaan.

Dengan menekan tombol Pesan Ojol / Go Online, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh poin di atas tanpa paksaan.`,
  footerText: '© 2026 Ojol Trenggalek - Lokal, Aman, Terpercaya'
};

// Load dari localStorage jika admin sudah ubah (override default)
function loadAppSettings(){
  try{
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('app_settings') : null;
    if(saved){ return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) }; }
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}
export const APP_SETTINGS = typeof window !== 'undefined' ? loadAppSettings() : APP_SETTINGS_DEFAULT;

export const APP_NAME = APP_SETTINGS.appName;

export const VAPID_PUBLIC_KEY = '[STRIPPED 87 bytes]';
export const VAPID_PRIVATE_KEY = 'db9HbOgze3qPiNduA4cVTKpYMTD5erFNjx_WK5V6FZo';
export function hitungTarif(distanceKm, vehicleType='motor', tripType='oneway'){
  const t = TARIF[vehicleType] || TARIF.motor;
  let cost = t.base + (distanceKm * t.perKm);
  if(tripType==='roundtrip') cost *= TARIF.ppMultiplier;
  cost = Math.max(cost, t.min);
  cost = Math.round(cost/500)*500;
  return cost;
}

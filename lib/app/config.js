// config.js - VERSI FLEKSIBEL - Ganti kecamatan cukup edit 1 baris

// === PILIH KECAMATAN DI SINI - CUKUP GANTI CODE ===
export const ACTIVE_KECAMATAN_CODE = '3503071'; // <-- GANTI INI SAJA
// Daftar code (dari repo ganiadiw/trenggalek-geojson):
// 3503010 = Panggul, 3503020 = Munjungan, 3503030 = Watulimo, 3503040 = Kampak
// 3503050 = Dongko, 3503060 = Pule, 3503070 = Karangan, 3503071 = Suruh
// 3503080 = Gandusari, 3503090 = Durenan, 3503100 = Pogalan, 3503110 = Trenggalek
// 3503120 = Tugu, 3503130 = Bendungan

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

const active = KECAMATAN_DATA[ACTIVE_KECAMATAN_CODE];

// === EXPORT OTOMATIS - map.js & geofence.js tidak perlu diubah lagi ===
export const ACTIVE_KECAMATAN_NAME = active.name;
export const SURUH_CENTER = active.center; // tetap export nama lama biar map.js lama kompatibel
export const ACTIVE_CENTER = active.center;
export const SURUH_RADIUS_KM = active.radiusKm;
export const ACTIVE_RADIUS_KM = active.radiusKm;
export const SURUH_BBOX = active.bbox;
export const ACTIVE_BBOX = active.bbox;

// BBOX Kabupaten tetap
export const TRENGGALEK_BBOX = { minLat: -8.50, maxLat: -7.95, minLng: 111.32, maxLng: 111.90 };

// URL Polygon dinamis
export const POLYGON_URLS = {
  active: `https://cdn.jsdelivr.net/gh/ganiadiw/trenggalek-geojson@main/${ACTIVE_KECAMATAN_CODE}/${ACTIVE_KECAMATAN_CODE}.geojson`,
  suruh: `https://cdn.jsdelivr.net/gh/ganiadiw/trenggalek-geojson@main/${ACTIVE_KECAMATAN_CODE}/${ACTIVE_KECAMATAN_CODE}.geojson`,
  trenggalek: 'https://cdn.jsdelivr.net/gh/ganiadiw/trenggalek-geojson@main/3503.geojson'
};

// Tarif (tetap)
export const VEHICLE_TYPES = {
  motor: { id: 'motor', label: 'Motor', icon: '🏍️', desc: '1 penumpang, cepat, hemat' },
  mobil: { id: 'mobil', label: 'Mobil', icon: '🚗', desc: '4 penumpang, nyaman, hujan aman' }
};
export const TARIF = {
  motor: { base: 3000, perKm: 2500, min: 5000, label: 'Motor' },
  mobil: { base: 8000, perKm: 5500, min: 15000, label: 'Mobil' },
  ppMultiplier: 1.6
};
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

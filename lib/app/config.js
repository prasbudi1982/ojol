// config.js - Konstanta geofence Suruh & Trenggalek (LOCK) + Tarif Kendaraan
export const SURUH_CENTER = { lat: -8.1111679, lng: 111.6064513 };
export const SURUH_RADIUS_KM = 15;
export const SURUH_BBOX = { minLat: -8.20, maxLat: -8.02, minLng: 111.52, maxLng: 111.70 };
export const TRENGGALEK_BBOX = { minLat: -8.50, maxLat: -7.95, minLng: 111.32, maxLng: 111.90 };

// === TARIF KENDARAAN === disimpan di config.js sesuai request
export const VEHICLE_TYPES = {
  motor: { id: 'motor', label: 'Motor', icon: '🏍️', desc: '1 penumpang, cepat, hemat' },
  mobil: { id: 'mobil', label: 'Mobil', icon: '🚗', desc: '4 penumpang, nyaman, hujan aman' }
};

export const TARIF = {
  motor: { base: 3000, perKm: 2500, min: 5000, label: 'Motor' },
  mobil: { base: 8000, perKm: 5500, min: 15000, label: 'Mobil' },
  ppMultiplier: 1.6
};

// === PUSH NOTIF VAPID (generate sekali, jangan ganti-ganti) ===
export const VAPID_PUBLIC_KEY = 'BEBLUbyxR7dm1J4Fa-NJFoH2lTsDL2zCqevo3h1Jymy81Zio8vBbLqakuI5we3j5s85hUuidWdxLycQudoKp-ug';
export const VAPID_PRIVATE_KEY = 'db9HbOgze3qPiNduA4cVTKpYMTD5erFNjx_WK5V6FZo'; // simpan di Edge Function env, jangan expose di client production, tapi untuk demo ok

export function hitungTarif(distanceKm, vehicleType='motor', tripType='oneway'){
  const t = TARIF[vehicleType] || TARIF.motor;
  let cost = t.base + (distanceKm * t.perKm);
  if(tripType==='roundtrip') cost *= TARIF.ppMultiplier;
  cost = Math.max(cost, t.min);
  cost = Math.round(cost/500)*500;
  return cost;
}

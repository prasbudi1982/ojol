// geofence.js - VERSI FLEKSIBEL STABIL - Anti error, hanya BBOX
import { SURUH_CENTER, SURUH_RADIUS_KM, SURUH_BBOX, TRENGGALEK_BBOX, ACTIVE_KECAMATAN_NAME } from './config.js';

export function haversineKm2(lat1, lon1, lat2, lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
export function haversineKm(lat1, lon1, lat2, lon2){ return haversineKm2(lat1,lon1,lat2,lon2); }

// Cek Kecamatan Aktif (Bisa Suruh, Durenan, dll tergantung config)
export function isInSuruhBbox(lat,lng){
  if(!lat||!lng) return false;
  if(lat < SURUH_BBOX.minLat || lat > SURUH_BBOX.maxLat) return false;
  if(lng < SURUH_BBOX.minLng || lng > SURUH_BBOX.maxLng) return false;
  // Opsional: tambah filter radius biar tidak terlalu kotak
  const d = haversineKm2(lat,lng,SURUH_CENTER.lat,SURUH_CENTER.lng);
  return d <= SURUH_RADIUS_KM;
}

// Alias baru yang lebih jelas
export function isInActiveKecamatan(lat,lng){
  return isInSuruhBbox(lat,lng);
}

export function isInTrenggalekKab(lat,lng){
  if(!lat||!lng) return false;
  return lat >= TRENGGALEK_BBOX.minLat && lat <= TRENGGALEK_BBOX.maxLat && lng >= TRENGGALEK_BBOX.minLng && lng <= TRENGGALEK_BBOX.maxLng;
}

// Untuk info
export function getActiveKecamatanName(){
  return ACTIVE_KECAMATAN_NAME || 'Suruh';
}

// geofence.js - FINAL VERSI LIVE - bbox + radius check
import { KECAMATAN_DATA, TRENGGALEK_BBOX, getActiveKecamatanLive } from './config.js';

export function haversineKm2(lat1, lon1, lat2, lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
export function haversineKm(lat1, lon1, lat2, lon2){ return haversineKm2(lat1,lon1,lat2,lon2); }

function getActive(){
  try{
    const act = getActiveKecamatanLive();
    if(act && act.bbox && act.center) return act;
  }catch(e){}
  // fallback aman ke Suruh jika localStorage kosong
  return KECAMATAN_DATA['3503071'];
}

// isInSuruhBbox = nama legacy, tapi isinya cek kecamatan AKTIF (admin setting)
export function isInSuruhBbox(lat,lng){
  if(!lat||!lng) return false;
  const act = getActive();
  const bbox = act.bbox;
  const center = act.center;
  const radius = act.radiusKm ?? 15;
  // cek cepat bbox dulu
  if(lat < bbox.minLat || lat > bbox.maxLat) return false;
  if(lng < bbox.minLng || lng > bbox.maxLng) return false;
  // cek akurat radius lingkaran
  const d = haversineKm2(lat,lng,center.lat,center.lng);
  return d <= radius;
}

export function isInActiveKecamatan(lat,lng){ return isInSuruhBbox(lat,lng); }

export function isInTrenggalekKab(lat,lng){
  if(!lat||!lng) return false;
  return lat >= TRENGGALEK_BBOX.minLat && lat <= TRENGGALEK_BBOX.maxLat && lng >= TRENGGALEK_BBOX.minLng && lng <= TRENGGALEK_BBOX.maxLng;
}

export function getActiveKecamatanName(){ 
  try{ return getActive().name; }catch(e){ return 'Suruh'; }
}
export function getActiveBbox(){ return getActive().bbox; }
export function getActiveCenter(){ return getActive().center; }
export function getActiveRadius(){ return getActive().radiusKm; }

// Helper tambahan untuk admin
export function isInKecamatan(lat,lng,kode){
  const k = KECAMATAN_DATA[kode];
  if(!k) return false;
  if(lat < k.bbox.minLat || lat > k.bbox.maxLat) return false;
  if(lng < k.bbox.minLng || lng > k.bbox.maxLng) return false;
  return haversineKm2(lat,lng,k.center.lat,k.center.lng) <= k.radiusKm;
}

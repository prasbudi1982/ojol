// geofence.js - VERSI LIVE - baca wilayah aktif dari localStorage setiap cek
import { KECAMATAN_DATA, TRENGGALEK_BBOX, getActiveKecamatanLive, ACTIVE_KECAMATAN_NAME as DEFAULT_NAME, SURUH_BBOX as DEFAULT_BBOX, SURUH_CENTER as DEFAULT_CENTER, SURUH_RADIUS_KM as DEFAULT_RADIUS } from './config.js';

export function haversineKm2(lat1, lon1, lat2, lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
export function haversineKm(lat1, lon1, lat2, lon2){ return haversineKm2(lat1,lon1,lat2,lon2); }

function getActive(){
  try{
    return getActiveKecamatanLive();
  }catch(e){
    return { name: DEFAULT_NAME||'Suruh', center: DEFAULT_CENTER, bbox: DEFAULT_BBOX, radiusKm: DEFAULT_RADIUS, code: '3503071' };
  }
}

// Cek Kecamatan Aktif (Suruh, Durenan, dll tergantung setting admin)
export function isInSuruhBbox(lat,lng){
  if(!lat||!lng) return false;
  const act = getActive();
  const bbox = act.bbox || DEFAULT_BBOX;
  const center = act.center || DEFAULT_CENTER;
  const radius = act.radiusKm || act.radiusKm===0 ? act.radiusKm : DEFAULT_RADIUS;
  if(lat < bbox.minLat || lat > bbox.maxLat) return false;
  if(lng < bbox.minLng || lng > bbox.maxLng) return false;
  const d = haversineKm2(lat,lng,center.lat,center.lng);
  return d <= radius;
}

export function isInActiveKecamatan(lat,lng){ return isInSuruhBbox(lat,lng); }

export function isInTrenggalekKab(lat,lng){
  if(!lat||!lng) return false;
  return lat >= TRENGGALEK_BBOX.minLat && lat <= TRENGGALEK_BBOX.maxLat && lng >= TRENGGALEK_BBOX.minLng && lng <= TRENGGALEK_BBOX.maxLng;
}

export function getActiveKecamatanName(){ 
  try{
    return getActive().name || DEFAULT_NAME || 'Suruh';
  }catch(e){ return DEFAULT_NAME||'Suruh'; }
}

export function getActiveBbox(){
  try{ return getActive().bbox; }catch(e){ return DEFAULT_BBOX; }
}
export function getActiveCenter(){
  try{ return getActive().center; }catch(e){ return DEFAULT_CENTER; }
}

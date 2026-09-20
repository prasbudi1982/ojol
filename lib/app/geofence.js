// geofence.js - Logic cek lokasi AKURAT pakai Polygon GeoJSON
import { SURUH_CENTER, SURUH_RADIUS_KM, SURUH_BBOX, TRENGGALEK_BBOX, POLYGON_URLS } from './config.js';

// Cache polygon
let SURUH_POLYGON_CACHE = null;
let TRENGGALEK_POLYGON_CACHE = null;
let loadingPromise = null;

// Haversine untuk fallback
export function haversineKm2(lat1, lon1, lat2, lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
export function haversineKm(lat1, lon1, lat2, lon2){ return haversineKm2(lat1,lon1,lat2,lon2); }

// Point in Polygon - Ray Casting, support Polygon & MultiPolygon GeoJSON
export function isPointInPolygon(lat, lng, geojson) {
  if (!geojson) return false;
  let polygons = [];
  
  // Normalisasi format: bisa Feature, Geometry, atau array koordinat langsung
  if (geojson.type === 'Feature') {
    geojson = geojson.geometry;
  }
  if (geojson.type === 'Polygon') {
    polygons = [geojson.coordinates];
  } else if (geojson.type === 'MultiPolygon') {
    polygons = geojson.coordinates;
  } else if (Array.isArray(geojson) && geojson.length > 0 && typeof geojson[0][0] === 'number') {
    // Langsung array [[lng,lat],...]
    polygons = [[geojson]];
  } else if (Array.isArray(geojson) && Array.isArray(geojson[0])) {
    // [[ [lng,lat], ... ]]
    polygons = [geojson];
  }

  // Ray casting untuk setiap polygon
  for (const poly of polygons) {
    // poly = [ [ [lng,lat], [lng,lat], ... ], [hole], ... ] - ambil outer ring
    const outer = poly[0];
    if (!outer) continue;
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const xi = outer[i][0], yi = outer[i][1];
      const xj = outer[j][0], yj = outer[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi + 0.00000001) + xi);
      if (intersect) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// Load polygon dari CDN (async, dipanggil sekali)
export async function loadPolygons() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const [suruhRes, trengRes] = await Promise.all([
        fetch(POLYGON_URLS.suruh).then(r => r.json()).catch(()=>null),
        fetch(POLYGON_URLS.trenggalek).then(r => r.json()).catch(()=>null)
      ]);
      
      // Struktur repo ganiadiw: FeatureCollection dengan 1 feature
      if (suruhRes) {
        const feat = suruhRes.features ? suruhRes.features[0] : suruhRes;
        SURUH_POLYGON_CACHE = feat.geometry || feat;
        console.log('✅ Polygon Suruh loaded', SURUH_POLYGON_CACHE.type);
      }
      if (trengRes) {
        const feat = trengRes.features ? trengRes.features[0] : trengRes;
        TRENGGALEK_POLYGON_CACHE = feat.geometry || feat;
        console.log('✅ Polygon Trenggalek loaded');
      }
    } catch(e) {
      console.warn('Gagal load polygon, fallback ke BBOX', e);
    }
  })();
  return loadingPromise;
}

// Fungsi AKURAT - pakai polygon jika ada, fallback BBOX
export function isInSuruhBbox(lat,lng){
  if(!lat||!lng) return false;
  // Jika polygon sudah loaded, pakai polygon
  if (SURUH_POLYGON_CACHE) {
    return isPointInPolygon(lat, lng, SURUH_POLYGON_CACHE);
  }
  // Fallback: BBOX + radius (versi lama)
  if(lat < SURUH_BBOX.minLat || lat > SURUH_BBOX.maxLat) return false;
  if(lng < SURUH_BBOX.minLng || lng > SURUH_BBOX.maxLng) return false;
  const d = haversineKm2(lat,lng,SURUH_CENTER.lat,SURUH_CENTER.lng);
  return d <= SURUH_RADIUS_KM;
}

export function isInTrenggalekKab(lat,lng){
  if(!lat||!lng) return false;
  if (TRENGGALEK_POLYGON_CACHE) {
    return isPointInPolygon(lat, lng, TRENGGALEK_POLYGON_CACHE);
  }
  // Fallback BBOX
  return lat >= TRENGGALEK_BBOX.minLat && lat <= TRENGGALEK_BBOX.maxLat && lng >= TRENGGALEK_BBOX.minLng && lng <= TRENGGALEK_BBOX.maxLng;
}

// Alias untuk map.js baru
export const isInSuruhAkurat = isInSuruhBbox;
export const isInTrenggalekAkurat = isInTrenggalekKab;

// Getter untuk map.js biar bisa gambar polygon
export function getSuruhPolygon(){ return SURUH_POLYGON_CACHE; }
export function getTrenggalekPolygon(){ return TRENGGALEK_POLYGON_CACHE; }

// Auto-load saat import
loadPolygons();

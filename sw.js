
// sw.js - Service Worker OJOL Suruh PWA
const CACHE_NAME = 'ojol-suruh-v12-admin-full';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/lib/app.js',
  '/lib/app/config.js',
  '/lib/app/geofence.js',
  '/lib/app/map.js',
  '/lib/app/order.js',
  '/lib/app/user.js',
  '/lib/app/views.js',
  '/lib/app/supabase.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  // Bypass supabase, nominatim, google maps, cdn
  if(url.hostname.includes('supabase.co') || url.hostname.includes('nominatim.openstreetmap.org') || url.hostname.includes('google.com') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')){
    return;
  }
  // Network first for html, cache first for assets
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(r=>{
        const clone=r.clone();
        caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
        return r;
      }).catch(()=>caches.match('/index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached) return cached;
      return fetch(e.request).then(r=>{
        if(r.ok){
          const clone=r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
        }
        return r;
      });
    })
  );
});

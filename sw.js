// sw.js - v7 FORCE UPDATE - hapus cache lama
const CACHE_NAME = 'ojol-suruh-v7-' + Date.now();
const URLS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json'
  // Jangan cache lib/app.js biar selalu fresh untuk admin
];

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(URLS_TO_CACHE)));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.map(k=>{
        if(k!==CACHE_NAME){
          console.log('Delete old cache', k);
          return caches.delete(k);
        }
      })
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  // JANGAN cache file JS modular biar admin selalu fresh
  if(url.pathname.includes('/lib/app') || url.pathname.includes('app.js') || url.pathname.includes('views.js') || url.pathname.includes('config.js')){
    return e.respondWith(fetch(e.request, {cache:'no-store'}).catch(()=>caches.match(e.request)));
  }
  e.respondWith(
    fetch(e.request).then(res=>{
      // Cache hanya untuk static
      if(res.ok && e.request.method==='GET' && (url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json'))){
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c=>c.put(e.request, clone));
      }
      return res;
    }).catch(()=>caches.match(e.request))
  );
});

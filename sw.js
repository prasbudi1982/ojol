
// sw.js v5.2 FIX - anti hang serviceWorker.ready timeout
const CACHE_NAME = 'ojol-suruh-v5-fix';
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
  '/lib/app/push.js'
  // icons di-cache on-demand saja, biar install tidak gagal kalau file belum ada
];

self.addEventListener('install', (e)=>{
  console.log('[SW] install', CACHE_NAME);
  e.waitUntil(
    (async ()=>{
      const cache = await caches.open(CACHE_NAME);
      // cache satu per satu, skip yang gagal, jangan pakai addAll yang all-or-nothing
      for(const url of ASSETS){
        try{
          const req = new Request(url, {cache:'reload'});
          const res = await fetch(req);
          if(res.ok) await cache.put(req, res);
          else console.warn('[SW] skip not ok', url, res.status);
        }catch(err){
          console.warn('[SW] skip fail', url, err.message);
        }
      }
      // coba cache icon tapi jangan gagalkan
      try{ await cache.add('/icons/icon-192.png'); }catch(e){}
      try{ await cache.add('/icons/icon-512.png'); }catch(e){}
      try{ await cache.add('/icon-192.png'); }catch(e){}
      try{ await cache.add('/icon-512.png'); }catch(e){}
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e)=>{
  console.log('[SW] activate');
  e.waitUntil(
    (async ()=>{
      const keys = await caches.keys();
      await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  // jangan cache supabase & nominatim & cdn
  if(url.hostname.includes('supabase.co') || url.hostname.includes('nominatim.openstreetmap.org') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com') || url.hostname.includes('google.com')){
    return;
  }
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(r=>{
        const clone=r.clone();
        caches.open(CACHE_NAME).then(c=>c.put(e.request, clone)).catch(()=>{});
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
          caches.open(CACHE_NAME).then(c=>c.put(e.request, clone)).catch(()=>{});
        }
        return r;
      }).catch(()=> cached || Response.error());
    })
  );
});

// ===== PUSH NOTIFICATION =====
self.addEventListener('push', (e)=>{
  console.log('[SW] push received', e.data?.text());
  let data = { title: 'OJOL Suruh', body: 'Ada order baru!', url: '/#/driver' };
  try{
    if(e.data) data = { ...data, ...e.data.json() };
  }catch(err){}
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200,100,200,100,200],
    tag: data.tag || 'ojol-order',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/#/', order_id: data.order_id },
    actions: [
      { action: 'open', title: 'Buka Aplikasi' },
      { action: 'close', title: 'Tutup' }
    ]
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e)=>{
  e.notification.close();
  const url = e.notification.data?.url || '/#/';
  if(e.action==='close') return;
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(list=>{
      for(const c of list){
        if(c.url.includes(url) || c.url.includes('/#/')){ c.focus(); return; }
      }
      return clients.openWindow(url);
    })
  );
});

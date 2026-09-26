
// sw.js - ALWAYS ACTIVE - Force update push + background
const CACHE_NAME = 'ojol-suruh-v5-always-active';
const urlsToCache = ['/', '/index.html'];

self.addEventListener('install', event=>{
  console.log('SW install - always active');
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache=> cache.addAll(urlsToCache).catch(()=>{})));
});

self.addEventListener('activate', event=>{
  console.log('SW activate - always active, clear old cache');
  event.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.map(k=>{ if(k!==CACHE_NAME) return caches.delete(k); }))).then(()=> self.clients.claim())
  );
});

self.addEventListener('push', event=>{
  console.log('Push received - always active', event);
  let data = { title: 'Ojol Suruh', body: 'Ada notifikasi baru', url: '/#/' };
  try{
    if(event.data) data = event.data.json();
  }catch(e){
    try{ data.body = event.data.text(); }catch(e2){}
  }
  const title = data.title || 'Ojol Suruh';
  const options = {
    body: data.body || 'Ada notifikasi baru',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: [200,100,200],
    data: { url: data.url || '/#/' },
    tag: 'ojol-notif-'+Date.now(),
    requireInteraction: false,
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event=>{
  event.notification.close();
  const url = event.notification.data?.url || '/#/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list=>{
      for(let c of list){
        if(c.url.includes(self.location.origin) && 'focus' in c){
          c.navigate(url);
          return c.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', event=>{
  event.respondWith(
    caches.match(event.request).then(res=> res || fetch(event.request).catch(()=>{}))
  );
});

// Force update check tiap 1 jam
self.addEventListener('message', event=>{
  if(event.data === 'skipWaiting') self.skipWaiting();
});

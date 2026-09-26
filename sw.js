// sw.js - v7 FORCE UPDATE - hapus cache lama
// v7.1 - THEME ADAPTIF - force refresh CSS tema HP
const CACHE_NAME = 'ojol-suruh-v7.1-' + Date.now();
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


// ===== TAMBAHAN: PUSH EVENT - FIX NUMPUK + SOUND + BACKGROUND =====
// Ini yang bikin notif masuk walau app tidak dibuka
self.addEventListener('push', function(event){
  let data = {};
  try{ 
    data = event.data ? event.data.json() : {}; 
  }catch(e){ 
    try{
      data = { title: 'Ojol Suruh', body: event.data ? event.data.text() : 'Ada order baru' };
    }catch(e2){
      data = { title: 'Ojol Suruh', body: 'Ada update order' };
    }
  }
  const title = data.title || '📦 Ojol Suruh';
  const body = data.body || 'Ada order baru masuk';
  const url = data.url || '/#/driver';
  const orderId = data.orderId || data.id || '';

  // FIX NUMPUK: tag unik tiap notif biar tidak replace
  const uniqueTag = 'order-'+(orderId||'broadcast')+'-'+Date.now()+'-'+Math.floor(Math.random()*10000);

  const options = {
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200,100,200,100,200],
    data: { url: url, orderId: orderId, ts: Date.now() },
    tag: uniqueTag,
    renotify: true,
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/#/driver';
  const orderId = event.notification.data && event.notification.data.orderId ? event.notification.data.orderId : '';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList){
      // Jika ada window sudah buka, focus
      for(let i=0;i<clientList.length;i++){
        const client = clientList[i];
        if('focus' in client){
          client.postMessage({ type: 'NOTIF_CLICK', url: url, orderId: orderId });
          return client.focus();
        }
      }
      // Jika tidak ada, buka baru
      if(clients.openWindow){
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('notificationclose', function(event){
  // cleanup optional
  console.log('Notif closed', event.notification.tag);
});

// Message handler untuk showLocalNotification dari push.js (foreground)
self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'SHOW_NOTIF'){
    const { title, body, url, tag } = event.data;
    const uniqueTag = tag || 'order-'+Date.now()+'-'+Math.floor(Math.random()*10000);
    self.registration.showNotification(title, {
      body: body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200,100,200,100,200],
      data: { url: url||'/#/driver', ts: Date.now() },
      tag: uniqueTag,
      renotify: true,
      requireInteraction: true,
      silent: false
    });
  }
});

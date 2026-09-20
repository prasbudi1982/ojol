// sw.js v7 tracking - Standard Clean
const CACHE_NAME = 'ojol-suruh-v8-admin';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './lib/app.js',
  './lib/app/config.js',
  './lib/app/geofence.js',
  './lib/app/map.js',
  './lib/app/order.js',
  './lib/app/user.js',
  './lib/app/views.js',
  './lib/app/supabase.js',
  './lib/app/push.js',
  './lib/app/tracking.js',
  './lib/app/report.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co') || e.request.url.includes('nominatim.openstreetmap.org')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('push', e => {
  let data = { title: 'OJOL Suruh', body: 'Ada order baru!', url: './index.html#/driver' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch(err){}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200,100,200],
      data: { url: data.url }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './index.html#/';
  e.waitUntil(clients.openWindow(url));
});

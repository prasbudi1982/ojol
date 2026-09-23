// lib/app/store/appStore.js - Global UI & PWA & offline
import { createStore } from './core.js';
import { db } from './db.js';

export const appStore = createStore({
  isOnline: navigator.onLine,
  deferredPrompt: null,
  showInstallBanner: false,
  offlineQueueCount: 0,
  lastSync: null,
}, ({ getState, setState }) => ({
  init() {
    window.addEventListener('online', () => {
      setState({ isOnline: true });
      db.syncQueue().then(r => setState({ offlineQueueCount: r.remain, lastSync: new Date().toISOString() }));
    });
    window.addEventListener('offline', () => setState({ isOnline: false }));
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setState({ deferredPrompt: e });
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed || (Date.now() - parseInt(dismissed)) > 7*24*60*60*1000) {
        setTimeout(()=> setState({ showInstallBanner: true }), 2000);
      }
    });

    const q = db.queueGet();
    setState({ offlineQueueCount: q.length });
  },
  dismissInstall() {
    setState({ showInstallBanner: false });
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }
}));

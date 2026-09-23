// lib/app/store/index.js - ENTRY POINT STORE
// Import ini di lib/app.js agar modular, tapi tetap isolasi

import { authStore } from './authStore.js';
import { orderStore } from './orderStore.js';
import { driverStore } from './driverStore.js';
import { settingStore } from './settingStore.js';
import { appStore } from './appStore.js';
import { db } from './db.js';

export { authStore, orderStore, driverStore, settingStore, appStore, db };
export { createStore, withPersist } from './core.js';

// Init semua store sekali saat app start
export async function initStores() {
  try {
    appStore._actions?.init?.();
    // load settings remote (tahan 800ms max biar gak blocking render)
    const fetchWithTimeout = Promise.race([
      settingStore._actions.fetchRemote(),
      new Promise(res => setTimeout(()=>res(null), 800))
    ]);
    await fetchWithTimeout;
    settingStore._actions.applyTheme();

    // sync offline queue jika online
    if (navigator.onLine) {
      const r = await db.syncQueue();
      if (r.synced > 0) console.log(`✅ Synced ${r.synced} offline ops`);
    }
  } catch(e) {
    console.warn('initStores error', e.message);
  }
}

// Helper untuk debug di console: window.stores
if (typeof window !== 'undefined') {
  window.stores = { authStore, orderStore, driverStore, settingStore, appStore, db };
}

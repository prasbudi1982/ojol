// lib/app/store/db.js - Wrapper Supabase + offline queue + cache
import { supabase } from '../supabase.js';

const CACHE_PREFIX = 'ojol_store_cache_';
const QUEUE_KEY = 'ojol_store_queue';

export const db = {
  // Cache helpers
  cacheSet(key, data) {
    try { localStorage.setItem(CACHE_PREFIX+key, JSON.stringify({ t: Date.now(), d: data })); } catch(e){}
  },
  cacheGet(key, maxAgeMs = 5*60*1000) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX+key);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t > maxAgeMs) return null;
      return d;
    } catch(e){ return null; }
  },

  // Offline queue untuk write yang gagal
  queuePush(op) {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      q.push({ ...op, _ts: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch(e){}
  },
  queueGet() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); } catch(e){ return []; } },
  queueClear() { localStorage.removeItem(QUEUE_KEY); },

  async syncQueue() {
    const q = this.queueGet();
    if (!q.length) return { synced: 0 };
    let synced = 0;
    const remain = [];
    for (const op of q) {
      try {
        if (op.type === 'insert') {
          const { error } = await supabase.from(op.table).insert(op.payload);
          if (error) throw error;
        } else if (op.type === 'update') {
          const { error } = await supabase.from(op.table).update(op.payload).eq('id', op.id);
          if (error) throw error;
        } else if (op.type === 'delete') {
          const { error } = await supabase.from(op.table).delete().eq('id', op.id);
          if (error) throw error;
        }
        synced++;
      } catch(e) { remain.push(op); }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remain));
    return { synced, remain: remain.length };
  },

  // Generic safe fetch with cache fallback
  async safeSelect(table, queryBuilder, cacheKey) {
    try {
      const { data, error } = await queryBuilder;
      if (error) throw error;
      if (cacheKey) this.cacheSet(cacheKey, data);
      return data;
    } catch(e) {
      if (cacheKey) {
        const cached = this.cacheGet(cacheKey);
        if (cached) return cached;
      }
      throw e;
    }
  }
};

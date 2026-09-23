// lib/app/store/warungStore.js - sesuai tabel stores
import { createStore, withPersist } from './core.js';
import { supabase } from '../supabase.js';
import { db } from './db.js';

const initial = {
  myStore: null,          // store milik merchant login
  stores: [],             // list warung open (public)
  selectedStore: null,
  loading: false,
  error: null,
};

export const warungStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    // Ambil warung milik owner
    async fetchMyStore(ownerId) {
      setState({ loading: true, error: null });
      try {
        const { data, error } = await supabase.from('stores').select('*').eq('owner_id', ownerId).maybeSingle();
        if (error) throw error;
        setState({ myStore: data, loading: false });
        return data;
      } catch(e) {
        setState({ error: e.message, loading: false });
        return null;
      }
    },

    // Public list warung buka
    async fetchOpenStores(kecamatanCode = null) {
      setState({ loading: true });
      try {
        let q = supabase.from('stores').select('*').eq('is_open', true).order('created_at', { ascending: false });
        if (kecamatanCode) q = q.eq('kecamatan_code', kecamatanCode);
        const data = await db.safeSelect('stores', q, 'open_stores_'+(kecamatanCode||'all'));
        setState({ stores: data || [], loading: false });
        return data;
      } catch(e) {
        setState({ loading: false, error: e.message });
        return getState().stores;
      }
    },

    // CRUD warung
    async createStore(payload) {
      // payload: { owner_id, name, alamat_text, lat, lng, wa_number, foto_url, kecamatan_code }
      setState({ loading: true });
      try {
        payload.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('stores').insert(payload).select().single();
        if (error) throw error;
        setState({ myStore: data, loading: false });
        return data;
      } catch(e) {
        setState({ loading: false, error: e.message });
        throw e;
      }
    },

    async updateStore(id, patch) {
      setState({ loading: true });
      try {
        patch.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('stores').update(patch).eq('id', id).select().single();
        if (error) throw error;
        setState({ myStore: data, loading: false });
        return data;
      } catch(e) {
        setState({ loading: false, error: e.message });
        throw e;
      }
    },

    async toggleOpen(id, isOpen) {
      return getState()._actions?.updateStore ? 
        (await (await import('./warungStore.js')).warungStore._actions.updateStore(id, { is_open: isOpen })) :
        (await supabase.from('stores').update({ is_open: isOpen, updated_at: new Date().toISOString() }).eq('id', id));
    },

    setSelected(store) { setState({ selectedStore: store }); }
  })),
  'ojol_warung_store_v2',
  { include: ['myStore'] }
);

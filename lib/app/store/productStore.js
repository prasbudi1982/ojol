// lib/app/store/productStore.js - sesuai store_products
import { createStore } from './core.js';
import { supabase } from '../supabase.js';
import { db } from './db.js';

const initial = {
  products: [],         // produk untuk store_id tertentu
  myProducts: [],       // produk milik merchant
  kategoriList: ['Makanan','Minuman','Snack','Paket'],
  loading: false,
  error: null,
};

export const productStore = createStore(initial, ({ getState, setState }) => ({
  async fetchByStore(storeId, onlyAvailable = false) {
    setState({ loading: true });
    try {
      let q = supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
      if (onlyAvailable) q = q.eq('is_available', true);
      const data = await db.safeSelect('store_products', q, `products_${storeId}_${onlyAvailable}`);
      setState({ products: data || [], loading: false });
      return data;
    } catch(e) {
      setState({ loading: false, error: e.message });
      return getState().products;
    }
  },

  async fetchMyProducts(storeId) {
    setState({ loading: true });
    try {
      const { data, error } = await supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at', { ascending: false });
      if (error) throw error;
      setState({ myProducts: data || [], products: data || [], loading: false });
      return data;
    } catch(e) { setState({ loading: false, error: e.message }); throw e; }
  },

  async createProduct(payload) {
    // payload: store_id, name, harga (int), stok, is_available, kategori, deskripsi, foto_url
    setState({ loading: true });
    try {
      payload.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('store_products').insert(payload).select().single();
      if (error) throw error;
      setState({ myProducts: [data, ...getState().myProducts], loading: false });
      return data;
    } catch(e) { setState({ loading: false, error: e.message }); throw e; }
  },

  async updateProduct(id, patch) {
    try {
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('store_products').update(patch).eq('id', id).select().single();
      if (error) throw error;
      const upd = list => list.map(p => p.id===id ? data : p);
      setState({ myProducts: upd(getState().myProducts), products: upd(getState().products) });
      return data;
    } catch(e) { throw e; }
  },

  async deleteProduct(id) {
    try {
      const { error } = await supabase.from('store_products').delete().eq('id', id);
      if (error) throw error;
      setState({ myProducts: getState().myProducts.filter(p=>p.id!==id), products: getState().products.filter(p=>p.id!==id) });
    } catch(e) { throw e; }
  },

  async toggleAvailable(id, isAvailable) {
    return getState()._actions?.updateProduct ? await getState()._actions.updateProduct : null;
  }
}));

// wrapper biar bisa dipanggil productStore._actions.updateProduct
productStore._actions = productStore._actions || {};
productStore._actions.updateProduct = productStore.updateProduct;
productStore._actions.createProduct = productStore.createProduct;
productStore._actions.deleteProduct = productStore.deleteProduct;
productStore._actions.fetchByStore = productStore.fetchByStore;
productStore._actions.fetchMyProducts = productStore.fetchMyProducts;


// lib/app/store/index.js - SAFE FALLBACK - tidak bikin blank walau tabel belum ada
export const warungStore = {
  getState: () => ({ myStore: null, stores: [] }),
  _actions: {
    fetchOpenStores: async () => [],
    fetchMyStore: async () => null,
    createStore: async (p) => { throw new Error('store module belum full terpasang'); },
    updateStore: async () => null,
    setSelected: () => {}
  }
};
export const productStore = {
  getState: () => ({ products: [], myProducts: [] }),
  _actions: {
    fetchByStore: async () => [],
    fetchMyProducts: async () => [],
    createProduct: async () => { throw new Error('product module belum full'); },
    updateProduct: async () => null,
    deleteProduct: async () => null
  }
};
export const cartStore = {
  getState: () => ({ items: [], storeName: '', dest: { text: '' }, pickup: {} }),
  _actions: {
    setStore: () => {},
    setDest: () => {},
    addItem: () => {},
    updateQty: () => {},
    getTotals: () => ({ subtotal:0, delivery_fee:0, total:0, distance_km:0 }),
    buildFoodOrderPayload: (cid) => ({ customer_id: cid, items: [], total:0 }),
    clear: () => {}
  }
};
export const foodOrderStore = {
  _actions: {
    createFromCart: async () => { throw new Error('foodOrder module belum full'); },
    fetchIncomingOrders: async () => [],
    updateStatus: async () => null
  }
};
export const ratingStore = { _actions: { getStoreAvg: async () => ({ avg:0, count:0 }) } };
export const authStore = { _actions: { setProfile: () => {} } };
export async function initStores(){ console.log('initStores safe fallback'); }
export const orderStore = authStore;
export const driverStore = authStore;
export const settingStore = { _actions: { fetchRemote: async () => null, applyTheme: () => {} } };
export const appStore = { _actions: { init: () => {} } };
export const db = { safeSelect: async (t,q) => { const { data } = await q; return data||[]; }, haversine: () => 0 };
export function createStore(){ return { getState: () => ({}), _actions: {} }; }
export function withPersist(s){ return s; }

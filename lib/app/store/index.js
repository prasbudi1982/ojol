
// lib/app/store/index.js - FINAL - Food Delivery - tidak bikin blank, tabel boleh belum ada
import { supabase } from '../supabase.js';
import { SURUH_CENTER } from '../config.js';

// Helper haversine
function haversine(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

export const db = { haversine };

function createStore(initial){
  let state = initial;
  const listeners = new Set();
  return {
    getState: ()=> state,
    setState: (patch)=>{ state = {...state, ...patch}; listeners.forEach(l=>l(state)); },
    subscribe: (fn)=>{ listeners.add(fn); return ()=>listeners.delete(fn); }
  };
}

// --- warungStore ---
const warungStoreBase = createStore({ stores: [], myStore: null, selected: null });
export const warungStore = {
  ...warungStoreBase,
  _actions: {
    fetchOpenStores: async ()=>{
      try{
        const { data, error } = await supabase.from('stores').select('*').eq('is_open', true).order('created_at', {ascending:false}).limit(50);
        if(error) throw error;
        warungStoreBase.setState({ stores: data||[] });
        return data||[];
      }catch(e){
        console.warn('fetchOpenStores fail (tabel stores belum ada?):', e.message);
        warungStoreBase.setState({ stores: [] });
        return [];
      }
    },
    fetchMyStore: async (ownerId)=>{
      try{
        const { data, error } = await supabase.from('stores').select('*').eq('owner_id', ownerId).maybeSingle();
        if(error) throw error;
        warungStoreBase.setState({ myStore: data||null });
        return data||null;
      }catch(e){
        console.warn('fetchMyStore fail:', e.message);
        return null;
      }
    },
    createStore: async (payload)=>{
      const { data, error } = await supabase.from('stores').insert(payload).select().single();
      if(error) throw error;
      warungStoreBase.setState({ myStore: data });
      return data;
    },
    updateStore: async (id, patch)=>{
      const { data, error } = await supabase.from('stores').update(patch).eq('id', id).select().single();
      if(error) throw error;
      warungStoreBase.setState({ myStore: data });
      return data;
    },
    setSelected: (store)=> warungStoreBase.setState({ selected: store })
  }
};

// --- productStore ---
const productStoreBase = createStore({ products: [], myProducts: [] });
export const productStore = {
  ...productStoreBase,
  _actions: {
    fetchByStore: async (storeId, onlyAvailable=false)=>{
      try{
        let q = supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at');
        if(onlyAvailable) q = q.eq('is_available', true);
        const { data, error } = await q;
        if(error) throw error;
        productStoreBase.setState({ products: data||[] });
        return data||[];
      }catch(e){
        console.warn('fetchByStore fail:', e.message);
        productStoreBase.setState({ products: [] });
        return [];
      }
    },
    fetchMyProducts: async (storeId)=>{
      try{
        const { data, error } = await supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at', {ascending:false});
        if(error) throw error;
        productStoreBase.setState({ myProducts: data||[] });
        return data||[];
      }catch(e){
        console.warn('fetchMyProducts fail:', e.message);
        return [];
      }
    },
    createProduct: async (payload)=>{
      const { data, error } = await supabase.from('store_products').insert(payload).select().single();
      if(error) throw error;
      return data;
    },
    updateProduct: async (id, patch)=>{
      const { data, error } = await supabase.from('store_products').update(patch).eq('id', id).select().single();
      if(error) throw error;
      return data;
    },
    deleteProduct: async (id)=>{
      const { error } = await supabase.from('store_products').delete().eq('id', id);
      if(error) throw error;
    }
  }
};

// --- cartStore ---
const CART_KEY = 'ojol_cart_v2_food';
const cartBase = createStore({ items:[], storeId:null, storeName:'', pickup:{}, dest:{ text:'', lat:null, lng:null } });
function loadCart(){
  try{
    const raw = localStorage.getItem(CART_KEY);
    if(raw) {
      const p = JSON.parse(raw);
      cartBase.setState(p);
    }
  }catch(e){}
}
function saveCart(){
  try{ localStorage.setItem(CART_KEY, JSON.stringify(cartBase.getState())); }catch(e){}
}
loadCart();
export const cartStore = {
  ...cartBase,
  _actions: {
    setStore: (store)=>{
      const s = cartBase.getState();
      if(s.storeId && s.storeId!==store.id){
        if(!confirm('Ganti warung? Keranjang akan dikosongkan')) return;
        cartBase.setState({ items:[], storeId: store.id, storeName: store.name, pickup:{ lat: store.lat, lng: store.lng, text: store.alamat_text } });
      } else {
        cartBase.setState({ storeId: store.id, storeName: store.name, pickup:{ lat: store.lat, lng: store.lng, text: store.alamat_text||'' } });
      }
      saveCart();
    },
    setDest: (dest)=>{
      const s = cartBase.getState();
      cartBase.setState({ dest: {...s.dest, ...dest} });
      saveCart();
    },
    addItem: (product, qty=1)=>{
      const s = cartBase.getState();
      const exist = s.items.find(i=>i.product_id===product.id);
      let items;
      if(exist){
        items = s.items.map(i=> i.product_id===product.id ? {...i, qty: i.qty+qty} : i);
      } else {
        items = [...s.items, { product_id: product.id, name: product.name, harga: product.harga, qty }];
      }
      cartBase.setState({ items });
      saveCart();
    },
    updateQty: (productId, qty)=>{
      let items = cartBase.getState().items;
      if(qty<=0) items = items.filter(i=>i.product_id!==productId);
      else items = items.map(i=> i.product_id===productId ? {...i, qty} : i);
      cartBase.setState({ items });
      saveCart();
    },
    getTotals: ()=>{
      const s = cartBase.getState();
      const subtotal = s.items.reduce((a,b)=> a + (b.harga*b.qty), 0);
      let distance_km = 0;
      if(s.pickup.lat && s.dest.lat){
        distance_km = haversine(s.pickup.lat, s.pickup.lng, s.dest.lat, s.dest.lng);
      }
      const delivery_fee = Math.round( distance_km<=2 ? 8000 : 8000 + (distance_km-2)*2000 );
      const total = subtotal + (s.items.length? delivery_fee:0);
      return { subtotal, delivery_fee: s.items.length? delivery_fee:0, total: s.items.length? total: subtotal, distance_km: distance_km.toFixed(2), count: s.items.reduce((a,b)=>a+b.qty,0) };
    },
    buildFoodOrderPayload: (customerId)=>{
      const s = cartBase.getState();
      const totals = cartStore._actions.getTotals();
      return {
        customer_id: customerId,
        store_id: s.storeId,
        items: s.items,
        subtotal: totals.subtotal,
        delivery_fee: totals.delivery_fee,
        total: totals.total,
        distance_km: parseFloat(totals.distance_km)||0,
        pickup_lat: s.pickup.lat,
        pickup_lng: s.pickup.lng,
        pickup_text: s.pickup.text||'',
        dest_lat: s.dest.lat,
        dest_lng: s.dest.lng,
        dest_text: s.dest.text||'',
        status: 'searching_driver'
      };
    },
    clear: ()=>{ cartBase.setState({ items:[], storeId:null, storeName:'', pickup:{}, dest:{ text:'', lat:null, lng:null } }); saveCart(); localStorage.removeItem(CART_KEY); }
  }
};

// --- foodOrderStore ---
export const foodOrderStore = {
  _actions: {
    createFromCart: async (payload)=>{
      const { data, error } = await supabase.from('food_orders').insert(payload).select().single();
      if(error) throw error;
      return data;
    },
    fetchIncomingOrders: async (storeId)=>{
      try{
        const { data, error } = await supabase.from('food_orders').select('*').eq('store_id', storeId).order('created_at', {ascending:false}).limit(30);
        if(error) throw error;
        return data||[];
      }catch(e){ console.warn('fetchIncomingOrders fail:', e.message); return []; }
    },
    updateStatus: async (id, status)=>{
      const { data, error } = await supabase.from('food_orders').update({ status }).eq('id', id).select().single();
      if(error) throw error;
      return data;
    }
  }
};

export const ratingStore = {
  _actions: {
    getStoreAvg: async (storeId)=>{
      try{
        const { data, error } = await supabase.from('store_ratings').select('rating').eq('store_id', storeId);
        if(error) throw error;
        if(!data||!data.length) return { avg:0, count:0 };
        const sum = data.reduce((a,b)=>a+b.rating,0);
        return { avg: (sum/data.length).toFixed(1), count: data.length };
      }catch(e){ return { avg:0, count:0 }; }
    }
  }
};

export const authStore = { _actions: { setProfile: ()=>{} } };
export const orderStore = authStore;
export const driverStore = authStore;
export const settingStore = { _actions: { fetchRemote: async ()=>null, applyTheme: ()=>{} } };
export const appStore = { _actions: { init: ()=>{} } };
export const withPersist = (s)=>s;
export async function initStores(){ console.log('initStores OK - Food ready'); }

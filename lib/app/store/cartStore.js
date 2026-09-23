// lib/app/store/cartStore.js - Cart lokal untuk food delivery
import { createStore, withPersist } from './core.js';
import { db } from './db.js';

const initial = {
  storeId: null,
  storeName: null,
  pickup: { lat: null, lng: null, text: '' }, // lokasi warung
  items: [], // { product_id, name, harga, qty, foto_url, kategori }
  dest: { lat: null, lng: null, text: '' },   // alamat antar
  deliveryFeePerKm: 3000,
  deliveryFeeMin: 5000,
  distanceKm: 0,
};

function calcSubtotal(items){ return items.reduce((s,i)=>s+(i.harga*i.qty),0); }

export const cartStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    setStore(store) {
      // kalau ganti warung beda, kosongkan cart
      const cur = getState();
      if (cur.storeId && cur.storeId !== store.id) {
        if (!confirm(`Ganti warung ke ${store.name}? Keranjang lama akan dikosongkan.`)) return;
        setState({ storeId: store.id, storeName: store.name, pickup: { lat: store.lat, lng: store.lng, text: store.alamat_text }, items: [], dest: cur.dest, distanceKm: 0 });
      } else {
        setState({ storeId: store.id, storeName: store.name, pickup: { lat: store.lat, lng: store.lng, text: store.alamat_text } });
      }
      getState()._actions.recalcDistance();
    },

    setDest(dest) {
      // dest: { lat, lng, text }
      setState({ dest });
      getState()._actions.recalcDistance();
    },

    addItem(product, qty=1) {
      const s = getState();
      if (s.storeId && product.store_id && s.storeId !== product.store_id) {
        // panggil setStore dulu
        return;
      }
      const exist = s.items.find(i=>i.product_id===product.id);
      let next;
      if (exist) {
        next = s.items.map(i=> i.product_id===product.id ? {...i, qty: i.qty+qty} : i);
      } else {
        next = [...s.items, { product_id: product.id, name: product.name, harga: product.harga, qty, foto_url: product.foto_url, kategori: product.kategori }];
      }
      setState({ items: next });
    },

    updateQty(productId, qty) {
      let items = getState().items;
      if (qty <=0) items = items.filter(i=>i.product_id!==productId);
      else items = items.map(i=> i.product_id===productId ? {...i, qty} : i);
      setState({ items });
    },

    removeItem(productId) {
      setState({ items: getState().items.filter(i=>i.product_id!==productId) });
    },

    recalcDistance() {
      const { pickup, dest } = getState();
      if (pickup.lat && dest.lat) {
        const km = db.haversine(pickup.lat, pickup.lng, dest.lat, dest.lng);
        setState({ distanceKm: Math.round(km*10)/10 });
      }
    },

    getTotals() {
      const s = getState();
      const subtotal = calcSubtotal(s.items);
      const fee = s.distanceKm ? Math.max(s.deliveryFeeMin, Math.round(s.distanceKm * s.deliveryFeePerKm)) : 0;
      return { subtotal, delivery_fee: fee, total: subtotal+fee, distance_km: s.distanceKm, count: s.items.reduce((a,b)=>a+b.qty,0) };
    },

    clear() {
      setState({ items: [], storeId: null, storeName: null, distanceKm: 0, dest: { lat:null,lng:null,text:'' } });
    },

    // payload siap insert ke food_orders
    buildFoodOrderPayload(customerId) {
      const s = getState();
      const { subtotal, delivery_fee, total, distance_km } = s._actions.getTotals();
      return {
        customer_id: customerId,
        store_id: s.storeId,
        items: s.items, // jsonb
        subtotal,
        delivery_fee,
        total,
        distance_km,
        pickup_lat: s.pickup.lat,
        pickup_lng: s.pickup.lng,
        pickup_text: s.pickup.text,
        dest_lat: s.dest.lat,
        dest_lng: s.dest.lng,
        dest_text: s.dest.text,
        status: 'searching_driver'
      };
    }
  })),
  'ojol_cart_v2_food',
  { include: ['storeId','storeName','pickup','items','dest','distanceKm'] }
);

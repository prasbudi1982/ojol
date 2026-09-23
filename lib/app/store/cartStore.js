// lib/app/store/cartStore.js - FIXED V5 - support varian & addon dengan cartKey unik, fix bug 3x masuk & tidak bisa hapus
import { createStore, withPersist } from './core.js';
import { db } from './db.js';

const initial = {
  storeId: null,
  storeName: null,
  pickup: { lat: null, lng: null, text: '' },
  items: [], // { id/cartKey, product_id, cartKey, name, harga, qty, variant, variant_price_delta, addons: [], foto_url, kategori }
  dest: { lat: null, lng: null, text: '' },
  deliveryFeePerKm: 3000,
  deliveryFeeMin: 5000,
  distanceKm: 0,
};

function calcSubtotal(items){ return items.reduce((s,i)=>s+(Number(i.harga||0)*Number(i.qty||0)),0); }

export const cartStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    setStore(store) {
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
      setState({ dest });
      getState()._actions.recalcDistance();
    },

    addItem(product, qty=1){
      const s = getState();
      // product bisa berupa object lengkap dengan cartKey
      const cartKey = product.cartKey || product.id || product.product_id;
      const prodId = product.product_id || product.id;

      if (s.storeId && product.store_id && s.storeId !== product.store_id) {
        return;
      }

      // cari existing by cartKey (untuk varian/addon unik) atau fallback product_id jika tanpa varian
      const exist = s.items.find(i=> (i.cartKey||i.product_id||i.id) === cartKey || (!i.cartKey && i.product_id===prodId && !product.variant && !product.addons?.length));

      let next;
      if (exist) {
        next = s.items.map(i=> {
          const key = i.cartKey||i.product_id||i.id;
          if(key===cartKey){
            return {...i, qty: Number(i.qty||0)+Number(qty||1)};
          }
          // fallback untuk item lama tanpa cartKey
          if(!i.cartKey && i.product_id===prodId && !product.variant && !product.addons?.length){
            return {...i, qty: Number(i.qty||0)+Number(qty||1)};
          }
          return i;
        });
      } else {
        const newItem = {
          id: cartKey,
          product_id: prodId,
          cartKey: cartKey,
          name: product.name,
          harga: Number(product.harga||0),
          qty: Number(qty||1),
          variant: product.variant||'',
          variant_price_delta: Number(product.variant_price_delta||0),
          addons: product.addons||[],
          foto_url: product.foto_url||null,
          kategori: product.kategori||null,
          store_id: product.store_id||s.storeId||null
        };
        next = [...s.items, newItem];
      }
      setState({ items: next });
    },

    updateQty(cartKeyOrProductId, qty){
      let items = getState().items;
      // support cartKey, product_id, atau id
      if (qty <=0) {
        items = items.filter(i=>{
          const k = i.cartKey||i.product_id||i.id;
          return k !== cartKeyOrProductId && i.product_id !== cartKeyOrProductId && i.id !== cartKeyOrProductId;
        });
      } else {
        items = items.map(i=>{
          const k = i.cartKey||i.product_id||i.id;
          if(k===cartKeyOrProductId || i.product_id===cartKeyOrProductId || i.id===cartKeyOrProductId){
            return {...i, qty: Number(qty)};
          }
          return i;
        });
      }
      setState({ items });
    },

    removeItem(cartKeyOrProductId){
      const items = getState().items.filter(i=>{
        const k = i.cartKey||i.product_id||i.id;
        return k !== cartKeyOrProductId && i.product_id !== cartKeyOrProductId && i.id !== cartKeyOrProductId;
      });
      setState({ items });
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
      return { subtotal, delivery_fee: fee, total: subtotal+fee, distance_km: s.distanceKm, count: s.items.reduce((a,b)=>a+Number(b.qty||0),0) };
    },

    clear() {
      setState({ items: [], storeId: null, storeName: null, distanceKm: 0, dest: { lat:null,lng:null,text:'' } });
    },

    buildFoodOrderPayload(customerId) {
      const s = getState();
      const { subtotal, delivery_fee, total, distance_km } = s._actions.getTotals();
      return {
        customer_id: customerId,
        store_id: s.storeId,
        items: s.items,
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

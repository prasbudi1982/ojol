// lib/app/store/ratingStore.js - ratings driver + store_ratings warung
import { createStore } from './core.js';
import { supabase } from '../supabase.js';

const initial = {
  loading: false,
  error: null,
};

export const ratingStore = createStore(initial, ({ getState, setState }) => ({
  // Driver rating (ojol)
  async rateDriver({ driver_id, passenger_id, order_id, rating, comment }) {
    setState({ loading: true });
    try {
      const { data, error } = await supabase.from('ratings').insert({ driver_id, passenger_id, order_id, rating, comment }).select().single();
      if (error) throw error;
      setState({ loading: false });
      return data;
    } catch(e) { setState({ loading: false, error: e.message }); throw e; }
  },

  async fetchDriverRatings(driverId) {
    try {
      const { data } = await supabase.from('ratings').select('*').eq('driver_id', driverId).order('created_at',{ascending:false});
      return data || [];
    } catch(e) { return []; }
  },

  async getDriverAvg(driverId) {
    try {
      const { data } = await supabase.from('ratings').select('rating').eq('driver_id', driverId);
      if (!data?.length) return { avg: 0, count: 0 };
      const avg = data.reduce((s,r)=>s+r.rating,0)/data.length;
      return { avg: Math.round(avg*10)/10, count: data.length };
    } catch(e) { return { avg:0, count:0 }; }
  },

  // Store rating (warung)
  async rateStore({ store_id, customer_id, food_order_id, rating, comment }) {
    setState({ loading: true });
    try {
      // unique(food_order_id) di SQL, jadi 1 order hanya bisa rating sekali
      const { data, error } = await supabase.from('store_ratings').insert({ store_id, customer_id, food_order_id, rating, comment }).select().single();
      if (error) throw error;
      setState({ loading: false });
      return data;
    } catch(e) { setState({ loading: false, error: e.message }); throw e; }
  },

  async fetchStoreRatings(storeId) {
    try {
      const { data } = await supabase.from('store_ratings').select('*, users:customer_id(name)').eq('store_id', storeId).order('created_at',{ascending:false}).limit(50);
      return data || [];
    } catch(e) { return []; }
  },

  async getStoreAvg(storeId) {
    try {
      const { data } = await supabase.from('store_ratings').select('rating').eq('store_id', storeId);
      if (!data?.length) return { avg: 0, count: 0 };
      const avg = data.reduce((s,r)=>s+r.rating,0)/data.length;
      return { avg: Math.round(avg*10)/10, count: data.length };
    } catch(e) { return { avg:0, count:0 }; }
  },

  async hasRatedFoodOrder(foodOrderId) {
    try {
      const { data } = await supabase.from('store_ratings').select('id').eq('food_order_id', foodOrderId).maybeSingle();
      return !!data;
    } catch(e) { return false; }
  }
}));

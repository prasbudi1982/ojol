// lib/app/store/orderStore.js - Manajemen order penumpang & driver
import { createStore, withPersist } from './core.js';
import { supabase } from '../supabase.js';
import { db } from './db.js';

const initial = {
  activeOrder: null,       // order yang sedang tracking
  myOrders: [],            // history user
  nearbyOrders: [],        // untuk driver
  loading: false,
  error: null,
};

export const orderStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    setActiveOrder(order) {
      setState({ activeOrder: order });
      if (order?.id) localStorage.setItem('active_order_id', order.id);
    },
    clearActiveOrder() {
      setState({ activeOrder: null });
      localStorage.removeItem('active_order_id');
      localStorage.removeItem('ojol_active_tracking');
    },

    async fetchMyOrders(userId) {
      setState({ loading: true, error: null });
      try {
        const cacheKey = `my_orders_${userId}`;
        const data = await db.safeSelect(
          'orders',
          supabase.from('orders').select('*').eq('passenger_id', userId).order('created_at',{ascending:false}).limit(50),
          cacheKey
        );
        setState({ myOrders: data, loading: false });
        return data;
      } catch(e) {
        setState({ error: e.message, loading: false });
        throw e;
      }
    },

    async createOrder(payload) {
      setState({ loading: true });
      try {
        const { data, error } = await supabase.from('orders').insert(payload).select().single();
        if (error) throw error;
        setState({ activeOrder: data, loading: false });
        localStorage.setItem('active_order_id', data.id);
        return data;
      } catch(e) {
        // offline fallback: simpan ke queue
        db.queuePush({ type:'insert', table:'orders', payload });
        setState({ loading: false, error: e.message });
        throw e;
      }
    },

    async fetchNearbyOrders() {
      // untuk driver, ambil order status=pending di Suruh
      try {
        const { data } = await supabase.from('orders').select('*').eq('status','pending').order('created_at',{ascending:false}).limit(20);
        setState({ nearbyOrders: data || [] });
        return data;
      } catch(e) { return getState().nearbyOrders; }
    },

    subscribeMyOrders(userId, cb) {
      const ch = supabase.channel(`orders_pass_${userId}`)
        .on('postgres_changes',{event:'*', schema:'public', table:'orders', filter:`passenger_id=eq.${userId}`}, payload => {
          const { myOrders } = getState();
          if (payload.eventType === 'INSERT') setState({ myOrders: [payload.new, ...myOrders] });
          if (payload.eventType === 'UPDATE') {
            setState({ myOrders: myOrders.map(o=>o.id===payload.new.id?payload.new:o) });
            if (getState().activeOrder?.id === payload.new.id) setState({ activeOrder: payload.new });
          }
          cb?.(payload);
        }).subscribe();
      return () => supabase.removeChannel(ch);
    }
  })),
  'ojol_order_store',
  { include: ['activeOrder'] }
);

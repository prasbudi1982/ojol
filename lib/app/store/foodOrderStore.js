// lib/app/store/foodOrderStore.js - sesuai food_orders
import { createStore, withPersist } from './core.js';
import { supabase } from '../supabase.js';
import { db } from './db.js';

const initial = {
  activeFoodOrder: null,
  myFoodOrders: [],       // sebagai customer
  incomingOrders: [],     // sebagai merchant (pesanan masuk ke warungnya)
  driverFoodOrders: [],   // sebagai driver
  loading: false,
  error: null,
};

export const foodOrderStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    setActive(order) {
      setState({ activeFoodOrder: order });
      if (order?.id) localStorage.setItem('active_food_order_id', order.id);
    },
    clearActive() {
      setState({ activeFoodOrder: null });
      localStorage.removeItem('active_food_order_id');
    },

    async createFromCart(cartPayload) {
      setState({ loading: true });
      try {
        const { data, error } = await supabase.from('food_orders').insert(cartPayload).select().single();
        if (error) throw error;
        setState({ activeFoodOrder: data, myFoodOrders: [data, ...getState().myFoodOrders], loading: false });
        return data;
      } catch(e) {
        setState({ loading: false, error: e.message });
        db.queuePush({ type:'insert', table:'food_orders', payload: cartPayload });
        throw e;
      }
    },

    async fetchMyOrders(customerId) {
      setState({ loading: true });
      try {
        const { data, error } = await supabase.from('food_orders').select('*, stores(name, alamat_text)').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        setState({ myFoodOrders: data || [], loading: false });
        return data;
      } catch(e) { setState({ loading: false }); throw e; }
    },

    async fetchIncomingOrders(storeId) {
      // merchant lihat pesanan masuk
      setState({ loading: true });
      try {
        const { data, error } = await supabase.from('food_orders').select('*').eq('store_id', storeId).in('status',['searching_driver','preparing','ready']).order('created_at',{ascending:false});
        if (error) throw error;
        setState({ incomingOrders: data || [], loading: false });
        return data;
      } catch(e) { setState({ loading: false }); throw e; }
    },

    async fetchDriverFoodOrders(statusList = ['searching_driver']) {
      try {
        const { data } = await supabase.from('food_orders').select('*, stores(name, alamat_text, lat, lng)').in('status', statusList).order('created_at',{ascending:false}).limit(20);
        setState({ driverFoodOrders: data || [] });
        return data;
      } catch(e) { return []; }
    },

    async updateStatus(orderId, status, extraPatch = {}) {
      try {
        const patch = { status, updated_at: new Date().toISOString(), ...extraPatch };
        if (status==='accepted') patch.accepted_at = new Date().toISOString();
        if (status==='completed') patch.completed_at = new Date().toISOString();
        const { data, error } = await supabase.from('food_orders').update(patch).eq('id', orderId).select().single();
        if (error) throw error;
        // update local
        const upd = list => list.map(o=> o.id===orderId ? data : o);
        setState({
          myFoodOrders: upd(getState().myFoodOrders),
          incomingOrders: upd(getState().incomingOrders),
          driverFoodOrders: upd(getState().driverFoodOrders),
          activeFoodOrder: getState().activeFoodOrder?.id===orderId ? data : getState().activeFoodOrder
        });
        return data;
      } catch(e) { throw e; }
    },

    async acceptByDriver(orderId, driverId) {
      return getState()._actions.updateStatus(orderId, 'picked', { driver_id: driverId });
    },

    subscribeForStore(storeId, cb) {
      const ch = supabase.channel(`food_store_${storeId}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'food_orders',filter:`store_id=eq.${storeId}`}, p=>{
          const list = getState().incomingOrders;
          if (p.eventType==='INSERT') setState({ incomingOrders: [p.new, ...list] });
          if (p.eventType==='UPDATE') setState({ incomingOrders: list.map(o=>o.id===p.new.id?p.new:o) });
          cb?.(p);
        }).subscribe();
      return ()=>supabase.removeChannel(ch);
    },

    subscribeForCustomer(customerId, cb) {
      const ch = supabase.channel(`food_cust_${customerId}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'food_orders',filter:`customer_id=eq.${customerId}`}, p=>{
          cb?.(p);
          if (p.eventType==='UPDATE' && getState().activeFoodOrder?.id===p.new.id) setState({ activeFoodOrder: p.new });
        }).subscribe();
      return ()=>supabase.removeChannel(ch);
    }
  })),
  'ojol_food_order_v2',
  { include: ['activeFoodOrder'] }
);

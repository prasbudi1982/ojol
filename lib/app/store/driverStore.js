// lib/app/store/driverStore.js
import { createStore, withPersist } from './core.js';
import { supabase } from '../supabase.js';
import { db } from './db.js';

const initial = {
  isOnline: false,
  activeDriverOrder: null,
  incomeToday: 0,
  stats: { completed: 0, cancelled: 0 },
  loading: false,
};

export const driverStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    setOnline(status) {
      setState({ isOnline: !!status });
      localStorage.setItem('driver_online', status ? '1':'0');
    },
    async fetchStats(driverId) {
      try {
        const today = new Date().toISOString().slice(0,10);
        const { data, error } = await supabase.from('orders')
          .select('fare, status')
          .eq('driver_id', driverId)
          .gte('created_at', today);
        if (error) throw error;
        const completed = data.filter(o=>o.status==='completed');
        const income = completed.reduce((s,o)=>s+(o.fare||0),0);
        setState({ incomeToday: income, stats: { completed: completed.length, cancelled: data.filter(o=>o.status==='cancelled').length }});
      } catch(e){}
    },
    setActiveDriverOrder(order) { setState({ activeDriverOrder: order }); }
  })),
  'ojol_driver_store',
  { include: ['isOnline', 'activeDriverOrder'] }
);

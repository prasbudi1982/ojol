// lib/app/store/settingStore.js - Sinkron dengan app_settings Supabase
import { createStore, withPersist } from './core.js';
import { supabase } from '../supabase.js';

const initial = {
  appName: 'OJOL SURUH',
  primaryColor: null,
  secondaryColor: null,
  activeKecamatanCode: null,
  farePerKm: 3000,
  fareMin: 8000,
  loading: true,
};

export const settingStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    applyTheme() {
      const s = getState();
      const root = document.documentElement;
      if (s.primaryColor) root.style.setProperty('--primary', s.primaryColor);
      if (s.secondaryColor) root.style.setProperty('--secondary', s.secondaryColor);
      if (s.appName) {
        document.title = s.appName;
        const brand = document.querySelector('.brand');
        if (brand) brand.textContent = '🛵 ' + s.appName.toUpperCase();
      }
    },
    async fetchRemote() {
      setState({ loading: true });
      try {
        const { data } = await supabase.from('app_settings').select('settings').eq('id',1).maybeSingle();
        if (data?.settings) {
          setState({ ...data.settings, loading: false });
          localStorage.setItem('app_settings', JSON.stringify(data.settings));
          if (data.settings.activeKecamatanCode) localStorage.setItem('active_kecamatan_code', data.settings.activeKecamatanCode);
          getState(); // trigger
          // apply
          setTimeout(()=>{ 
            try{ 
              const inst = getState();
              const root = document.documentElement;
              if(inst.primaryColor) root.style.setProperty('--primary', inst.primaryColor);
            }catch(e){}
          },0);
          return data.settings;
        }
      } catch(e){}
      setState({ loading: false });
      return null;
    },
    setLocal(patch) { setState(patch); }
  })),
  'ojol_setting_store_v1',
  { exclude: ['loading'] }
);

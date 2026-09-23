// lib/app/store/authStore.js - State auth & profile
import { createStore, withPersist } from './core.js';
import { getSession, getProfile } from '../user.js';

const initial = {
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isDriver: false,
};

export const authStore = withPersist(
  createStore(initial, ({ getState, setState }) => ({
    async refresh() {
      setState({ loading: true });
      try {
        const session = await getSession();
        let profile = null;
        if (session) profile = await getProfile();
        setState({
          session,
          profile,
          isAdmin: profile?.role === 'admin',
          isDriver: profile?.role === 'driver',
          loading: false
        });
        return profile;
      } catch(e) {
        setState({ loading: false, session: null, profile: null });
        return null;
      }
    },
    setProfile(profile) {
      setState({ profile, isAdmin: profile?.role==='admin', isDriver: profile?.role==='driver' });
    },
    logout() {
      setState({ session: null, profile: null, isAdmin:false, isDriver:false });
    }
  })),
  'ojol_auth_store',
  { exclude: ['loading'] }
);

// lib/app/store/core.js - Core reactive store (Zustand-like) - FIX, jangan diubah sembarangan
// Isolasi: tidak tergantung module lain kecuali localStorage

export function createStore(initialState = {}, actionsFactory = null) {
  let state = { ...initialState };
  const listeners = new Set();

  const getState = () => ({ ...state });

  const setState = (partial, replace = false) => {
    const next = replace ? partial : { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    state = next;
    listeners.forEach(fn => fn(getState()));
  };

  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const actions = actionsFactory ? actionsFactory({ getState, setState, subscribe }) : {};

  return { getState, setState, subscribe, ...actions, _actions: actions };
}

// Helper: persist ke localStorage otomatis
export function withPersist(store, key, options = {}) {
  const { include, exclude } = options;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      store.setState(parsed, false);
    }
  } catch(e) {}

  store.subscribe((state) => {
    try {
      let toSave = state;
      if (include) toSave = Object.fromEntries(include.map(k => [k, state[k]]).filter(([,v]) => v !== undefined));
      if (exclude) {
        toSave = { ...state };
        exclude.forEach(k => delete toSave[k]);
      }
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch(e) {}
  });
  return store;
}

// store/stores.js - CRUD Warung + UI isolasi
import { supabase } from '../supabase.js';
import { isTableMissingError } from './db.js';
import { getFoodTheme } from './config.js';

export async function getMyStore(ownerId){
  try{
    const { data, error } = await supabase.from('stores').select('*').eq('owner_id', ownerId).maybeSingle();
    if(error && isTableMissingError(error)) return null;
    if(error) throw error;
    return data||null;
  }catch(e){ console.warn('getMyStore', e.message); return null; }
}

export async function getStoreById(id){
  const { data, error } = await supabase.from('stores').select('*').eq('id', id).single();
  if(error) throw error;
  return data;
}

export async function getNearbyStores(limit=20){
  try{
    const { data, error } = await supabase.from('stores').select('*').eq('is_open', true).order('created_at', {ascending:false}).limit(limit);
    if(error && isTableMissingError(error)) return [];
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function createOrUpdateStore(ownerId, payload){
  const existing = await getMyStore(ownerId);
  let result;
  if(existing){
    const { data, error } = await supabase.from('stores').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
    if(error) throw error;
    result = data;
  }else{
    const { data, error } = await supabase.from('stores').insert({ owner_id: ownerId, ...payload }).select().single();
    if(error) throw error;
    result = data;
  }
  // AUTO-SET ROLE MERCHANT - DB + localStorage biar tab langsung muncul
  try{
    const { data: u } = await supabase.from('users').select('role').eq('id', ownerId).maybeSingle();
    if(u && u.role!=='merchant' && u.role!=='admin'){
      await supabase.from('users').update({ role: 'merchant' }).eq('id', ownerId);
      console.log('✅ Role updated to merchant for', ownerId);
    }
    try{ 
      localStorage.setItem('is_merchant_'+ownerId, '1'); 
      localStorage.setItem('merchant_store_id', result.id);
      const cpRaw = localStorage.getItem('current_profile');
      if(cpRaw){
        const cp = JSON.parse(cpRaw);
        if(cp && cp.id===ownerId){ cp.role='merchant'; localStorage.setItem('current_profile', JSON.stringify(cp)); }
      }
    }catch(e){}
  }catch(e){ console.warn('auto merchant fail', e.message); }
  return result;
}

// ===== UI - satu file dengan logic =====
export function viewMyStoreForm(myStore, currentProfile){
  const theme = getFoodTheme();
  const isEdit = !!myStore;
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <h3>🏪 ${isEdit ? 'Warung Saya' : 'Daftar Jadi Warung'}</h3>
    <p class="muted" style="font-size:11px">Isolasi dari ojol - data warung cuma di modul store</p>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      <label>Nama Warung<input id="storeName" value="${myStore?.name||''}" placeholder="Warung Bu Anik" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
      <label>Alamat Warung<div style="display:flex;gap:6px"><input id="storeAlamat" value="${myStore?.alamat_text||''}" placeholder="Pasar Suruh, Trenggalek" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"><button id="btnPickStoreLocation" class="btn secondary" style="padding:8px 12px;border-radius:10px">🗺️ Map</button></div></label>
      <div style="display:flex;gap:8px">
        <label style="flex:1">Lat<input id="storeLat" value="${myStore?.lat||''}" placeholder="-8.111" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card2)"></label>
        <label style="flex:1">Lng<input id="storeLng" value="${myStore?.lng||''}" placeholder="111.606" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card2)"></label>
      </div>
      <label>No WA Warung<input id="storeWA" value="${myStore?.wa_number||currentProfile?.hp||''}" placeholder="0812xxxx" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="storeIsOpen" ${myStore?.is_open!==false?'checked':''}> Buka / Tutup Warung</label>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button id="btnSaveStore" class="btn primary" style="flex:1;background:${theme.primary};color:white;padding:12px;border-radius:12px;font-weight:800;border:none">💾 Simpan Warung</button>
        ${isEdit?`<button id="btnGotoProducts" class="btn secondary" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:12px;border-radius:12px">📦 Kelola Menu</button>`:''}
      </div>
    </div>
  </div>`;
}

export function viewStoreList(stores){
  const theme = getFoodTheme();
  if(!stores || stores.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">🍔</div><div style="margin-top:8px;font-weight:700">Belum ada warung buka</div><div style="font-size:11px;color:var(--muted)">Daftar warung akan muncul di sini. Warung tutup tidak tampil.</div><a href="#/store/my" class="btn primary" style="margin-top:12px;display:inline-block;background:${theme.primary};color:white;padding:10px 16px;border-radius:10px;text-decoration:none">🏪 Daftar Warung Saya</a></div>`;
  }
  return `<div class="card"><h3>🍔 Warung Buka (${stores.length})</h3><p class="muted" style="font-size:11px">App cuma hitung ongkir, harga dari warung. Rating warung ada bintang.</p><div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
    ${stores.map(s=>`
      <div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);display:flex;gap:12px;align-items:center">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:24px">🏪</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14px;color:var(--text)">${s.name} <span data-store-rating="${s.id}" style="font-size:10px;color:var(--muted)">⏳ rating...</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📍 ${s.alamat_text||'-'}</div>
          <div style="margin-top:4px"><span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700">● BUKA</span> <span style="font-size:10px;color:var(--muted)">${s.wa_number? '💬 WA tersedia':''}</span> <a href="#/store/history/${s.id}" style="font-size:10px;text-decoration:none;color:${theme.primary};margin-left:4px">📊 History</a></div>
        </div>
        <a href="#/store/${s.id}" style="background:${theme.primary};color:white;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:800;text-decoration:none">Lihat Menu</a>
      </div>
    `).join('')}
  </div></div>`;
}

export function viewStoreDetail(store, products){
  const theme = getFoodTheme();
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;gap:12px;align-items:center"><a href="#/store" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹</a><div><div style="font-weight:800;font-size:16px">${store.name} <span data-store-rating-detail="${store.id}" style="font-size:11px"></span></div><div style="font-size:11px;color:var(--muted)">📍 ${store.alamat_text||''}</div></div></div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <a href="https://www.google.com/maps?q=${store.lat},${store.lng}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none;color:var(--text)">🗺️ Lokasi Warung</a>
      ${store.wa_number?`<a href="https://wa.me/${store.wa_number.replace(/[^0-9]/g,'').replace(/^0/,'62')}" target="_blank" style="flex:1;background:#22c55e;color:white;padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA Warung</a>`:''}
    </div>
    <div style="margin-top:10px;display:flex;gap:6px">
      <a href="#/store/ratings/${store.id}" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none;color:var(--text)">⭐ Lihat Rating Warung</a>
      <a href="#/store/history/${store.id}" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none;color:var(--text)">📊 History Penjualan (Merchant)</a>
    </div>
  </div>
  <div class="card"><h4>📦 Menu (${products.length}) - Harga dari Warung</h4>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      ${products.length===0?'<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px">Warung belum isi menu</div>':products.map(p=>`
        <div style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center;background:var(--card)">
          <div style="flex:1"><div style="font-weight:700;font-size:13px">${p.name} ${!p.is_available?'<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:6px;font-size:9px">HABIS</span>':''}</div><div style="font-size:11px;color:var(--muted)">${p.deskripsi||''}</div><div style="margin-top:4px;font-weight:800;color:${theme.primary}">Rp ${Number(p.harga).toLocaleString('id-ID')}</div></div>
          <button data-add-cart="${p.id}" data-store="${store.id}" style="background:${p.is_available?theme.primary:'var(--border)'};color:${p.is_available?'white':'var(--muted)'};border:none;padding:8px 12px;border-radius:10px;font-weight:700;font-size:12px" ${!p.is_available?'disabled':''}>+ Keranjang</button>
        </div>
      `).join('')}
    </div>
    <a href="#/store/cart" style="margin-top:12px;display:block;background:${theme.primary};color:white;padding:12px;border-radius:12px;text-align:center;font-weight:800;text-decoration:none">🛒 Lihat Keranjang</a>
  </div>`;
}

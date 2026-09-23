// store/products.js - CRUD Menu + UI isolasi
import { supabase } from '../app/supabase.js';
import { isTableMissingError } from './db.js';
import { getFoodTheme } from './config.js';

export async function getProductsByStore(storeId){
  try{
    const { data, error } = await supabase.from('store_products').select('*').eq('store_id', storeId).order('created_at', {ascending:false});
    if(error && isTableMissingError(error)) return [];
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function addProduct(storeId, payload){
  const { data, error } = await supabase.from('store_products').insert({ store_id: storeId, ...payload }).select().single();
  if(error) throw error;
  return data;
}

export async function updateProduct(id, payload){
  const { data, error } = await supabase.from('store_products').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if(error) throw error;
  return data;
}

export async function deleteProduct(id){
  const { error } = await supabase.from('store_products').delete().eq('id', id);
  if(error) throw error;
}

export async function toggleAvailable(id, isAvailable){
  return updateProduct(id, { is_available: isAvailable });
}

// ===== UI per modul =====
export function viewMyProducts(store, products){
  const theme = getFoodTheme();
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center"><a href="#/store/my" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹ Warung</a><span style="font-weight:800">${store.name}</span><span></span></div>
    <h4 style="margin-top:12px">📦 Kelola Menu - Harga dari Warung</h4>
    <p class="muted" style="font-size:11px">App cuma hitung ongkir, harga menu murni dari sini</p>
    
    <div style="margin-top:12px;border:1px dashed var(--border);border-radius:12px;padding:12px;background:var(--card2)">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px">+ Tambah Menu</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="prodName" placeholder="Nama: Nasi Goreng" style="padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card)">
        <div style="display:flex;gap:8px"><input id="prodHarga" type="number" placeholder="Harga Rp" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card)"><input id="prodStok" type="number" placeholder="Stok" value="100" style="width:80px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card)"></div>
        <input id="prodDesc" placeholder="Deskripsi opsional" style="padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card)">
        <button id="btnAddProduct" data-store="${store.id}" style="background:${theme.primary};color:white;border:none;padding:10px;border-radius:10px;font-weight:800">💾 Tambah</button>
      </div>
    </div>

    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
      ${products.length===0?'<div style="text-align:center;padding:16px;color:var(--muted)">Belum ada menu</div>':products.map(p=>`
        <div style="border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--card);display:flex;gap:10px;align-items:center">
          <div style="flex:1"><div style="font-weight:700">${p.name}</div><div style="font-size:11px;color:var(--muted)">Rp ${Number(p.harga).toLocaleString('id-ID')} • Stok ${p.stok} • ${p.is_available?'✅ Tersedia':'❌ Habis'}</div></div>
          <div style="display:flex;gap:6px">
            <button data-toggle-prod="${p.id}" data-available="${!p.is_available}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card2);font-size:11px">${p.is_available?'Nonaktifkan':'Aktifkan'}</button>
            <button data-delete-prod="${p.id}" style="padding:6px 10px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;font-size:11px">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

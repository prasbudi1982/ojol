// store/products.js - CRUD Menu + UI isolasi - MERCHANT TAB KHUSUS
import { supabase } from '../supabase.js';
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

// ===== UI per modul - TAB KHUSUS MERCHANT =====
export function viewMyProducts(store, products){
  const theme = getFoodTheme();
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <a href="#/store/my" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹ Warungku</a>
      <div style="text-align:center"><div style="font-weight:800;font-size:14px">${store.name}</div><div style="font-size:10px;color:var(--muted)">ROLE MERCHANT • ${products.length} menu</div></div>
      <span style="background:${theme.primary};color:white;padding:4px 8px;border-radius:8px;font-size:10px;font-weight:800">MERCHANT</span>
    </div>

    <div style="margin-top:12px;display:flex;gap:6px">
      <a href="#/store/my" style="flex:1;background:var(--card2);border:1px solid var(--border);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none;color:var(--text)">🏪 Edit Warung</a>
      <a href="#/store/products" style="flex:1;background:${theme.primary};color:white;padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:800;text-decoration:none">📦 Kelola Menu</a>
    </div>

    <h4 style="margin-top:14px">📦 Kelola Menu - Tambah / Edit / Hapus</h4>
    <p class="muted" style="font-size:11px">Khusus role merchant. Harga murni dari sini, app cuma hitung ongkir.</p>
    
    <div style="margin-top:12px;border:2px solid ${theme.primary};border-radius:12px;padding:12px;background:var(--card)">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px;color:${theme.primary}">+ Tambah Menu Baru</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input id="prodName" placeholder="Nama: Nasi Goreng Spesial" style="padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)">
        <div style="display:flex;gap:8px">
          <input id="prodHarga" type="number" placeholder="Harga Rp 15000" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)">
          <input id="prodStok" type="number" placeholder="Stok" value="100" style="width:80px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)">
        </div>
        <div style="display:flex;gap:8px">
          <select id="prodKategori" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select>
          <label style="display:flex;align-items:center;gap:6px;font-size:11px"><input type="checkbox" id="prodAvail" checked> Tersedia</label>
        </div>
        <input id="prodDesc" placeholder="Deskripsi opsional" style="padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)">
        <button id="btnAddProduct" data-store="${store.id}" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,0.2)">💾 Tambah Menu</button>
      </div>
    </div>

    <div style="margin-top:16px">
      <div style="font-weight:800;font-size:13px;margin-bottom:8px">📋 Daftar Menu (${products.length}) - Tap Edit / Hapus</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${products.length===0?'<div style="text-align:center;padding:24px;color:var(--muted);border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">📭</div><div style="margin-top:6px">Belum ada menu</div><div style="font-size:11px">Tambah di atas, akan muncul di halaman Food pembeli</div></div>':products.map(p=>`
        <div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="width:44px;height:44px;border-radius:10px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:20px">🍱</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:13px;color:var(--text)">${p.name} ${!p.is_available?'<span style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:6px;font-size:9px">HABIS</span>':''}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${p.kategori||'Makanan'} • Rp ${Number(p.harga).toLocaleString('id-ID')} • Stok ${p.stok||0}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.deskripsi||''}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
            <button data-edit-prod="${p.id}" data-name="${(p.name||'').replace(/"/g,'&quot;')}" data-harga="${p.harga}" data-stok="${p.stok||0}" data-kategori="${p.kategori||'Makanan'}" data-desc="${(p.deskripsi||'').replace(/"/g,'&quot;')}" data-available="${p.is_available}" style="padding:8px;border-radius:8px;border:1px solid ${theme.primary};background:${theme.primary};color:white;font-size:11px;font-weight:700">✏️ Edit</button>
            <button data-toggle-prod="${p.id}" data-available="${!p.is_available}" style="padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card2);font-size:11px">${p.is_available?'⏸️ Nonaktifkan':'✅ Aktifkan'}</button>
            <button data-delete-prod="${p.id}" style="padding:8px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;font-size:11px;font-weight:700">🗑️ Hapus</button>
          </div>
        </div>
        `).join('')}
      </div>
    </div>

    <!-- EDIT MODAL -->
    <div id="editProdModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--card);border-radius:16px;max-width:400px;width:100%;border:1px solid var(--border);overflow:hidden">
        <div style="background:${theme.primary};color:white;padding:12px;display:flex;justify-content:space-between;align-items:center"><b>✏️ Edit Menu</b><button id="btnCloseEditProd" style="background:rgba(0,0,0,0.2);border:none;color:white;border-radius:50%;width:28px;height:28px">✕</button></div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:10px">
          <input type="hidden" id="editProdId">
          <label>Nama<input id="editProdName" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
          <div style="display:flex;gap:8px">
            <label style="flex:1">Harga<input id="editProdHarga" type="number" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
            <label style="width:80px">Stok<input id="editProdStok" type="number" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
          </div>
          <label>Kategori<select id="editProdKategori" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select></label>
          <label>Deskripsi<input id="editProdDesc" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2)"></label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="editProdAvail"> Tersedia</label>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button id="btnSaveEditProd" style="flex:1;background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800">💾 Simpan Perubahan</button>
            <button id="btnCancelEditProd" style="background:var(--card2);border:1px solid var(--border);padding:12px;border-radius:10px">Batal</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export async function toggleAvailable(id, isAvailable){
  return updateProduct(id, { is_available: isAvailable });
}

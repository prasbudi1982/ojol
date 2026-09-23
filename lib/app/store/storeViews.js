// lib/app/storeViews.js - FINAL - Food Delivery Merchant (tanpa dummy)
// Sesuai schema.sql: stores, store_products, food_orders, store_ratings
import { warungStore, productStore, cartStore, foodOrderStore, ratingStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { SURUH_CENTER } from '../config.js';

export async function viewStoreList(){
  let stores = [];
  try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ stores = []; }
  return `
    <div class="card">
      <h2>🍔 Warung Buka</h2>
      <p class="muted">Warung warga Suruh - Trenggalek. Tap untuk lihat menu.</p>
      <div class="list" id="storeList">
        ${stores.length ? stores.map(s=>`
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>${s.name}</b>
              <span style="font-size:10px;background:${s.is_open?'#16a34a':'#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open?'BUKA':'TUTUP'}</span>
            </div>
            <div class="muted" style="font-size:12px">${s.alamat_text||''}</div>
            <div style="display:flex;gap:8px">
              <a href="#/store/detail/${s.id}" class="btn primary" style="flex:1;text-align:center;padding:10px">Lihat Menu</a>
            </div>
          </div>
        `).join('') : `<div class="muted">Belum ada warung buka. Merchant bisa buat warung di tab Warungku.</div>`}
      </div>
    </div>
  `;
}

export async function viewStoreDetail(storeId){
  const { data: store, error } = await supabase.from('stores').select('*').eq('id', storeId).single();
  if(error || !store) return `<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>`;
  let products = [];
  try{ products = await productStore._actions.fetchByStore(storeId, true); }catch(e){}
  let avg = { avg:0, count:0 };
  try{ avg = await ratingStore._actions.getStoreAvg(storeId); }catch(e){}
  // set store ke cart agar pickup terisi
  try{ cartStore._actions.setStore(store); }catch(e){}
  return `
    <div class="card">
      <a href="#/store" class="muted">← Kembali ke Food</a>
      <h2 style="margin-top:8px">🏪 ${store.name}</h2>
      <div class="muted" style="font-size:12px">${store.alamat_text||''} ${store.wa_number ? '• WA '+store.wa_number : ''}</div>
      <div class="kpi" style="margin-top:10px">
        <div><b>${avg.avg||0}</b><span class="muted" style="font-size:10px">⭐ Rating</span></div>
        <div><b>${products.length}</b><span class="muted" style="font-size:10px">Menu</span></div>
        <div><b>${store.is_open?'Buka':'Tutup'}</b><span class="muted" style="font-size:10px">Status</span></div>
      </div>
      <h3 style="margin-top:14px">Menu</h3>
      <div class="list">
        ${products.length ? products.map(p=>`
          <div class="driver-card">
            <div style="flex:1"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga).toLocaleString('id-ID')} • ${p.kategori} • Stok ${p.stok}</div></div>
            <button class="btn primary" style="width:auto;padding:8px 12px" onclick="window._addCart && window._addCart('${p.id}')">+ 🛒</button>
          </div>
        `).join('') : `<div class="muted">Belum ada menu tersedia</div>`}
      </div>
      <div style="margin-top:14px">
        <a href="#/store/cart" class="btn primary">🛒 Lihat Keranjang (${(() => { try{ return cartStore.getState().items.reduce((a,b)=>a+b.qty,0); }catch(e){ return 0; } })()})</a>
      </div>
    </div>
  `;
}

export async function viewStoreCart(){
  const state = (()=>{ try{ return cartStore.getState(); }catch(e){ return { items:[], storeName:'', dest:{text:''}, pickup:{} }; } })();
  const totals = (()=>{ try{ return cartStore._actions.getTotals(); }catch(e){ return { subtotal:0, delivery_fee:0, total:0, distance_km:0, count:0 }; } })();
  return `
    <div class="card">
      <h2>🛒 Keranjang${state.storeName ? ' - '+state.storeName : ''}</h2>
      <div class="list">
        ${state.items.length ? state.items.map(i=>`
          <div class="driver-card">
            <div style="flex:1"><b>${i.name}</b><div class="muted">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = Rp ${Number(i.harga*i.qty).toLocaleString()}</div></div>
            <div style="display:flex;gap:6px">
              <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty-1})" class="btn secondary" style="width:36px;padding:8px">-</button>
              <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty+1})" class="btn secondary" style="width:36px;padding:8px">+</button>
            </div>
          </div>
        `).join('') : `<div class="muted">Keranjang kosong. Pilih warung di tab Food dulu.</div>`}
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px" class="muted">Subtotal Rp ${totals.subtotal.toLocaleString()} • Ongkir Rp ${totals.delivery_fee.toLocaleString()} (${totals.distance_km||0} km)</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ${totals.total.toLocaleString()}</div>
        <label style="margin-top:10px">Alamat Antar (lengkap)</label>
        <textarea id="destText" placeholder="Contoh: Ds Suruh RT 01 RW 02 depan masjid" style="min-height:70px">${state.dest.text||''}</textarea>
        <button id="btnPickDest" class="btn secondary" style="margin-top:8px">📍 Pilih Lokasi Antar di Peta</button>
        <button id="btnCheckout" class="btn primary" style="margin-top:12px" ${state.items.length?'':'disabled'}>✅ Checkout - Cari Driver</button>
      </div>
    </div>
  `;
}

export async function viewMyStore(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile) return `<div class="card"><p class="muted">Harus login</p></div>`;
  if(profile.role!=='merchant' && profile.role!=='warung') return `<div class="card"><h2>🏪 Warungku</h2><p class="muted">Halaman ini khusus role merchant. Role kamu: ${profile.role}. Hubungi admin untuk jadi merchant.</p></div>`;
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    return `
      <div class="card">
        <h2>🏪 Buat Warung</h2>
        <p class="muted">Buat warung pertama kamu. Data sesuai tabel stores.</p>
        <label>Nama Warung</label><input id="sName" placeholder="Warung Sego Bu Sri"/>
        <label>Alamat Lengkap</label><input id="sAlamat" placeholder="Ds Suruh RT..."/>
        <label>No WA</label><input id="sWa" placeholder="08..."/>
        <label>Lat (klik 📍 untuk isi otomatis)</label><input id="sLat" type="number" step="any" placeholder="-8.123"/>
        <label>Lng</label><input id="sLng" type="number" step="any" placeholder="111.71"/>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Pilih di Peta</button>
          <button id="btnCreateStore" class="btn primary" style="flex:1">Buat Warung</button>
        </div>
      </div>
    `;
  }
  let avg = { avg:0, count:0 };
  try{ avg = await ratingStore._actions.getStoreAvg(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>🏪 Warungku: ${myStore.name}</h2>
      <div class="muted" style="font-size:12px">⭐ ${avg.avg} (${avg.count} ulasan) • ${myStore.is_open?'BUKA':'TUTUP'} • ID ${myStore.id.slice(0,8)}</div>
      <label style="margin-top:10px">Nama Warung</label><input id="sName" value="${myStore.name||''}"/>
      <label>Alamat</label><input id="sAlamat" value="${(myStore.alamat_text||'').replace(/"/g,'&quot;')}"/>
      <label>No WA</label><input id="sWa" value="${myStore.wa_number||''}"/>
      <label>Foto URL (opsional)</label><input id="sFoto" value="${myStore.foto_url||''}"/>
      <label>Lat</label><input id="sLat" type="number" step="any" value="${myStore.lat||''}"/>
      <label>Lng</label><input id="sLng" type="number" step="any" value="${myStore.lng||''}"/>
      <label>Status</label><select id="sOpen"><option value="true" ${myStore.is_open?'selected':''}>Buka</option><option value="false" ${!myStore.is_open?'selected':''}>Tutup</option></select>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button>
        <button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button>
      </div>
    </div>
  `;
}

export async function viewStoreProducts(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(profile?.role!=='merchant' && profile?.role!=='warung') return `<div class="card"><p class="muted">Khusus merchant</p></div>`;
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore) return `<div class="card"><h2>📦 Menu</h2><p class="muted">Buat warung dulu di tab Warungku</p><a href="#/store/my" class="btn primary">Buat Warung</a></div>`;
  let prods = [];
  try{ prods = await productStore._actions.fetchMyProducts(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>📦 Menu - ${myStore.name}</h2>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:12px">
        <div style="display:flex;gap:8px">
          <input id="pName" placeholder="Nama menu" style="flex:2"/>
          <input id="pHarga" type="number" placeholder="Harga" style="flex:1"/>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <select id="pKategori" style="flex:1"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select>
          <input id="pStok" type="number" value="100" style="width:90px" placeholder="Stok"/>
          <button id="btnAddProduct" class="btn primary" style="width:auto;padding:10px 14px">+ Tambah</button>
        </div>
      </div>
      <div class="list">
        ${prods.length ? prods.map(p=>`
          <div class="driver-card">
            <div style="flex:1"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga).toLocaleString()} • ${p.kategori} • Stok ${p.stok} • ${p.is_available?'Tersedia':'Habis'}</div></div>
            <div style="display:flex;gap:4px">
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._toggleProd && window._toggleProd('${p.id}', ${!p.is_available})">${p.is_available?'Nonaktif':'Aktif'}</button>
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white;border-color:#ef4444" onclick="window._delProd && window._delProd('${p.id}')">Hapus</button>
            </div>
          </div>
        `).join('') : `<div class="muted">Belum ada menu. Tambah di atas.</div>`}
      </div>
    </div>
  `;
}

export async function viewStoreOrders(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(profile?.role!=='merchant' && profile?.role!=='warung') return `<div class="card"><p class="muted">Khusus merchant</p></div>`;
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore) return `<div class="card"><p class="muted">Buat warung dulu</p></div>`;
  let orders = [];
  try{ orders = await foodOrderStore._actions.fetchIncomingOrders(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>🔔 Pesanan Masuk - ${myStore.name}</h2>
      <p class="muted" style="font-size:12px">Status: searching_driver → preparing → ready → picked → completed</p>
      <div class="list" style="margin-top:10px">
        ${orders.length ? orders.map(o=>`
          <div class="card" style="margin:0;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between"><b>#${o.id.slice(0,8)}</b><span style="font-size:10px;background:#f59e0b;color:#111;padding:2px 8px;border-radius:99px">${o.status}</span></div>
            <div class="muted" style="font-size:11px">${new Date(o.created_at).toLocaleString('id-ID')} • Rp ${Number(o.total||0).toLocaleString()}</div>
            <div style="font-size:12px;margin-top:6px">${(o.items||[]).map(i=>`${i.name} x${i.qty}`).join(', ')}</div>
            <div class="muted" style="font-size:11px;margin-top:4px">Antar: ${o.dest_text||'-'}</div>
            <div style="display:flex;gap:6px;margin-top:10px">
              ${o.status==='searching_driver' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','preparing')">✅ Terima & Masak</button>` : ''}
              ${o.status==='preparing' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','ready')">🍱 Siap Diambil Driver</button>` : ''}
              ${o.status==='ready' ? `<span class="muted" style="font-size:11px">Menunggu driver pick</span>` : ''}
            </div>
          </div>
        `).join('') : `<div class="muted">Belum ada pesanan masuk</div>`}
      </div>
    </div>
  `;
}

// Global helpers untuk app.js anti-blank
if(typeof window !== 'undefined'){
  window._addCart = (pid)=>{
    try{
      const prods = productStore.getState().products;
      const p = prods.find(x=>x.id===pid);
      if(p){ cartStore._actions.addItem(p,1); alert('Ditambah: '+p.name); const b=document.getElementById('cartBadge'); if(b){ const c=cartStore.getState().items.reduce((a,b)=>a+b.qty,0); b.textContent=c; b.style.display=c>0?'block':'none'; } }
    }catch(e){ console.warn(e); }
  };
  window._cartQty = (pid, qty)=>{
    try{ cartStore._actions.updateQty(pid, qty); location.hash='#/store/cart'; setTimeout(()=>{ location.reload(); }, 100); }catch(e){}
  };
  window._toggleProd = async (id, avail)=>{
    try{ await productStore._actions.updateProduct(id, { is_available: avail }); const h=location.hash; location.hash='#/store/products'; setTimeout(()=>{ location.hash=h; location.reload(); }, 200); }catch(e){ alert(e.message); }
  };
  window._delProd = async (id)=>{
    if(!confirm('Hapus menu ini?')) return;
    try{ await productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); }
  };
  window._orderStatus = async (id, status)=>{
    if(!confirm('Ubah status jadi '+status+'?')) return;
    try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); }
  };
}

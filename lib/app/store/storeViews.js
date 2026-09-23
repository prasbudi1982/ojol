// lib/app/store/storeViews.js - FINAL V2 with Variasi & Addon
import { warungStore, productStore, cartStore, foodOrderStore, ratingStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';

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
  try{ cartStore._actions.setStore(store); }catch(e){}
  return `
    <div class="card">
      <a href="#/store" class="muted">← Kembali ke Food</a>
      <h2 style="margin-top:8px">🏪 ${store.name}</h2>
      <div class="muted" style="font-size:12px">${store.alamat_text||''} ${store.wa_number ? ' • WA '+store.wa_number : ''}</div>
      <div class="kpi" style="margin-top:10px">
        <div><b>${avg.avg||0}</b><span class="muted" style="font-size:10px">⭐ Rating</span></div>
        <div><b>${products.length}</b><span class="muted" style="font-size:10px">Menu</span></div>
        <div><b>${store.is_open?'Buka':'Tutup'}</b><span class="muted" style="font-size:10px">Status</span></div>
      </div>
      <h3 style="margin-top:14px">Menu</h3>
      <div class="list">
        ${products.length ? products.map(p=>{
          let vari = [];
          try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){ vari=[]; }
          let addons = [];
          try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){ addons=[]; }
          const variText = vari.length ? vari.map(v=>v.name+' '+(v.price_delta>0?'+Rp'+Number(v.price_delta).toLocaleString():'' )).join(', ') : '';
          const addonText = addons.length ? addons.map(a=>a.name+' +Rp'+Number(a.harga).toLocaleString()).join(', ') : '';
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga).toLocaleString()} • ${p.kategori} • Stok ${p.stok}</div>
              ${variText ? '<div style="font-size:11px;margin-top:4px">📦 Varian: '+variText+'</div>' : ''}
              ${addonText ? '<div style="font-size:11px;margin-top:2px">➕ Addon: '+addonText+'</div>' : ''}
              </div>
              <button class="btn primary" style="width:auto;height:40px;padding:8px 12px" onclick="window._addCart && window._addCart('${p.id}')">+ 🛒</button>
            </div>
            ${vari.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap">'+vari.map(v=>'<button class="btn secondary" style="font-size:11px;width:auto;padding:6px 10px" onclick="window._addCartVar && window._addCartVar(\''+p.id+'\',\''+v.name.replace(/'/g,'')+'\')">'+v.name+' '+(v.price_delta>0?'(+'+Number(v.price_delta).toLocaleString()+')':'')+'</button>').join('')+'</div>' : ''}
          </div>
        `}).join('') : `<div class="muted">Belum ada menu tersedia</div>`}
      </div>
      <div style="margin-top:14px">
        <a href="#/store/cart" class="btn primary">🛒 Lihat Keranjang</a>
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
        ${state.items.length ? state.items.map(i=>{
          const varText = i.variant ? ' • Varian: '+i.variant : '';
          const addText = i.addons && i.addons.length ? ' • Addon: '+i.addons.map(a=>a.name).join(', ') : '';
          return `
          <div class="driver-card">
            <div style="flex:1"><b>${i.name}${varText}</b><div class="muted" style="font-size:11px">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = Rp ${Number(i.harga*i.qty).toLocaleString()}${addText}</div>
            ${i.addons && i.addons.length ? '<div class="muted" style="font-size:10px">'+i.addons.map(a=>a.name+' +'+Number(a.harga).toLocaleString()).join(', ')+'</div>' : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty-1})" class="btn secondary" style="width:36px;padding:8px">-</button>
              <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty+1})" class="btn secondary" style="width:36px;padding:8px">+</button>
            </div>
          </div>
        `}).join('') : `<div class="muted">Keranjang kosong. Pilih warung di tab Food dulu.</div>`}
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
  if(profile.role!=='merchant' && profile.role!=='warung') return `<div class="card"><h2>🏪 Warungku</h2><p class="muted">Khusus merchant. Role kamu: ${profile.role}</p></div>`;
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{
      const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle();
      if(data) myStore = data;
    }catch(e){}
  }
  if(!myStore){
    return `
      <div class="card">
        <h2>🏪 Buat Warung</h2>
        <p class="muted">Belum ada warung. Buat dulu.</p>
        <label>Nama Warung</label><input id="sName" placeholder="Warung Sego Bu Sri" value="${profile.name||''}"/>
        <label>Alamat Lengkap</label><input id="sAlamat" placeholder="Ds Suruh RT..." value="${profile.alamat||''}"/>
        <label>No WA</label><input id="sWa" placeholder="08..." value="${profile.hp||''}"/>
        <label>Lat</label><input id="sLat" type="number" step="any" placeholder="-8.111"/>
        <label>Lng</label><input id="sLng" type="number" step="any" placeholder="111.60"/>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button>
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
      <div class="muted" style="font-size:12px">⭐ ${avg.avg} (${avg.count}) • ${myStore.is_open?'BUKA':'TUTUP'} • ID ${myStore.id.slice(0,8)}</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:8px;border-radius:8px;font-size:12px;margin-top:10px">Warung aktif. Atur menu di bawah.</div>
      <label style="margin-top:10px">Nama Warung</label><input id="sName" value="${myStore.name||''}"/>
      <label>Alamat</label><input id="sAlamat" value="${(myStore.alamat_text||'').replace(/"/g,'&quot;')}"/>
      <label>No WA</label><input id="sWa" value="${myStore.wa_number||''}"/>
      <label>Lat</label><input id="sLat" type="number" step="any" value="${myStore.lat||''}"/>
      <label>Lng</label><input id="sLng" type="number" step="any" value="${myStore.lng||''}"/>
      <label>Status</label><select id="sOpen"><option value="true" ${myStore.is_open?'selected':''}>Buka</option><option value="false" ${!myStore.is_open?'selected':''}>Tutup</option></select>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button>
        <button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button>
      </div>
      <div style="margin-top:12px"><a href="#/store/products" class="btn primary">📦 Kelola Menu + Varian & Addon</a></div>
    </div>
  `;
}

export async function viewStoreProducts(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(profile?.role!=='merchant' && profile?.role!=='warung') return `<div class="card"><p class="muted">Khusus merchant</p></div>`;
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return `<div class="card"><h2>📦 Menu</h2><p class="muted">Buat warung dulu di tab Warungku</p><a href="#/store/my" class="btn primary">Buat Warung</a></div>`;
  let prods = [];
  try{ prods = await productStore._actions.fetchMyProducts(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>📦 Menu - ${myStore.name} (Varian & Addon)</h2>
      <p class="muted" style="font-size:12px">Contoh: Nasi Goreng → Varian: Biasa, Jumbo (+5000), Seafood (+10000) → Addon: Telur ceplok (+3000)</p>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px">
        <label style="font-size:12px;font-weight:700">Nama Menu *</label>
        <input id="pName" placeholder="Nasi Goreng" style="margin-bottom:8px"/>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1"><label style="font-size:11px">Harga Dasar *</label><input id="pHarga" type="number" placeholder="15000"/></div>
          <div style="flex:1"><label style="font-size:11px">Kategori</label><select id="pKategori"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select></div>
          <div style="width:90px"><label style="font-size:11px">Stok</label><input id="pStok" type="number" value="100"/></div>
        </div>
        <label style="font-size:11px;font-weight:700">Varian (opsional) - format: Nama|HargaTambahan, pisah koma</label>
        <input id="pVariasi" placeholder="Biasa|0, Jumbo|5000, Seafood|10000" style="margin-bottom:6px"/>
        <div class="muted" style="font-size:10px;margin-bottom:8px">Contoh: Biasa|0 = harga dasar, Jumbo|5000 = dasar + 5000</div>
        
        <label style="font-size:11px;font-weight:700">Addon / Topping (opsional) - format: Nama|Harga</label>
        <input id="pAddons" placeholder="Telur ceplok|3000, Telur dadar|3000, Kerupuk|1000" style="margin-bottom:8px"/>
        
        <label style="font-size:11px">Deskripsi (opsional)</label>
        <input id="pDesc" placeholder="Nasi goreng spesial bumbu Suruh" style="margin-bottom:10px"/>
        
        <button id="btnAddProduct" class="btn primary" style="width:100%">+ Tambah Menu dengan Varian & Addon</button>
        <div id="pStatus" class="muted" style="font-size:11px;margin-top:6px"></div>
      </div>
      <h3 style="margin-top:6px">Daftar Menu (${prods.length})</h3>
      <div class="list">
        ${prods.length ? prods.map(p=>{
          let vari = [];
          try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||p.variasi||[]); }catch(e){ vari=[]; }
          let addons = [];
          try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){ addons=[]; }
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px;border-left:3px solid #16a34a">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga).toLocaleString()} • ${p.kategori} • Stok ${p.stok} • ${p.is_available?'Tersedia':'Habis'}</div>
              ${vari.length ? '<div style="font-size:11px;margin-top:4px">📦 Varian: '+vari.map(v=>v.name+' '+(v.price_delta!=0?'('+ (v.price_delta>0?'+':'' )+Number(v.price_delta).toLocaleString()+')':'')).join(', ')+'</div>' : ''}
              ${addons.length ? '<div style="font-size:11px;margin-top:2px">➕ Addon: '+addons.map(a=>a.name+' (+'+Number(a.harga).toLocaleString()+')').join(', ')+'</div>' : ''}
              ${p.deskripsi ? '<div class="muted" style="font-size:11px;margin-top:2px">'+p.deskripsi+'</div>' : ''}
              </div>
              <span style="font-size:10px;background:${p.is_available?'#16a34a':'#6b7280'};color:white;padding:3px 8px;border-radius:99px">${p.is_available?'AKTIF':'NONAKTIF'}</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._toggleProd && window._toggleProd('${p.id}', ${!p.is_available})">${p.is_available?'Nonaktif':'Aktifkan'}</button>
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._editProd && window._editProd('${p.id}')">Edit Varian/Addon</button>
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white;border-color:#ef4444" onclick="window._delProd && window._delProd('${p.id}')">Hapus</button>
            </div>
          </div>
        `}).join('') : `<div class="muted">Belum ada menu. Tambah di atas dengan contoh: Nasi Goreng → Varian Biasa/Jumbo/Seafood → Addon telur ceplok.</div>`}
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
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return `<div class="card"><p class="muted">Buat warung dulu</p></div>`;
  let orders = [];
  try{ orders = await foodOrderStore._actions.fetchIncomingOrders(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>🔔 Pesanan Masuk - ${myStore.name}</h2>
      <div class="list" style="margin-top:10px">
        ${orders.length ? orders.map(o=>`
          <div class="card" style="margin:0;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between"><b>#${o.id.slice(0,8)}</b><span style="font-size:10px;background:#f59e0b;color:#111;padding:2px 8px;border-radius:99px">${o.status}</span></div>
            <div class="muted" style="font-size:11px">${new Date(o.created_at).toLocaleString('id-ID')} • Rp ${Number(o.total||0).toLocaleString()}</div>
            <div style="font-size:12px;margin-top:6px">${(o.items||[]).map(i=>{
              let v = i.variant ? ' ('+i.variant+')' : '';
              let a = i.addons && i.addons.length ? ' + '+i.addons.map(x=>x.name).join(', ') : '';
              return i.name+v+a+' x'+i.qty
            }).join(', ')}</div>
            <div class="muted" style="font-size:11px;margin-top:4px">Antar: ${o.dest_text||'-'}</div>
            <div style="display:flex;gap:6px;margin-top:10px">
              ${o.status==='searching_driver' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','preparing')">✅ Terima & Masak</button>` : ''}
              ${o.status==='preparing' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','ready')">🍱 Siap Diambil Driver</button>` : ''}
            </div>
          </div>
        `).join('') : `<div class="muted">Belum ada pesanan masuk</div>`}
      </div>
    </div>
  `;
}

if(typeof window !== 'undefined'){
  window._addCart = (pid)=>{
    try{
      const prods = productStore.getState().products;
      const p = prods.find(x=>x.id===pid);
      if(p){ 
        // default varian pertama
        let vari = [];
        try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
        let harga = Number(p.harga);
        let variantName = '';
        if(vari.length){ variantName = vari[0].name; harga += Number(vari[0].price_delta||0); }
        const item = { ...p, harga, variant: variantName, addons: [] };
        cartStore._actions.addItem(item,1); 
        alert('Ditambah: '+p.name+(variantName?' ('+variantName+')':'')); 
      }
    }catch(e){ console.warn(e); }
  };
  window._addCartVar = (pid, vName)=>{
    try{
      const prods = productStore.getState().products;
      const p = prods.find(x=>x.id===pid);
      if(p){
        let vari = [];
        try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
        const v = vari.find(x=>x.name===vName);
        let harga = Number(p.harga) + Number(v?.price_delta||0);
        const item = { ...p, harga, variant: vName, addons: [] };
        cartStore._actions.addItem(item,1);
        alert('Ditambah: '+p.name+' ('+vName+')');
      }
    }catch(e){ console.warn(e); }
  };
  window._cartQty = (pid, qty)=>{
    try{ cartStore._actions.updateQty(pid, qty); location.hash='#/store/cart'; setTimeout(()=>{ location.reload(); }, 100); }catch(e){}
  };
  window._toggleProd = async (id, avail)=>{
    try{ await productStore._actions.updateProduct(id, { is_available: avail }); location.reload(); }catch(e){ alert(e.message); }
  };
  window._delProd = async (id)=>{
    if(!confirm('Hapus menu ini?')) return;
    try{ await productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); }
  };
  window._editProd = async (id)=>{
    try{
      const { data } = await supabase.from('store_products').select('*').eq('id', id).single();
      if(!data) return alert('Produk tidak ditemukan');
      let vari = [];
      try{ vari = typeof data.variants === 'string' ? JSON.parse(data.variants) : (data.variants||[]); }catch(e){}
      let addons = [];
      try{ addons = typeof data.addons === 'string' ? JSON.parse(data.addons) : (data.addons||[]); }catch(e){}
      const variStr = vari.map(v=>v.name+'|'+v.price_delta).join(', ');
      const addonStr = addons.map(a=>a.name+'|'+a.harga).join(', ');
      const newVari = prompt('Edit Varian (format Nama|HargaTambahan, pisah koma):', variStr);
      if(newVari===null) return;
      const newAddon = prompt('Edit Addon (format Nama|Harga, pisah koma):', addonStr);
      if(newAddon===null) return;
      // parse
      const parseVari = (str)=>{
        if(!str.trim()) return [];
        return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{
          const [n, pr] = part.split('|').map(x=>x.trim());
          return { name: n, price_delta: parseInt(pr||'0')||0 };
        });
      };
      const parseAddon = (str)=>{
        if(!str.trim()) return [];
        return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{
          const [n, pr] = part.split('|').map(x=>x.trim());
          return { name: n, harga: parseInt(pr||'0')||0 };
        });
      };
      const vParsed = parseVari(newVari);
      const aParsed = parseAddon(newAddon);
      await productStore._actions.updateProduct(id, { variants: vParsed, addons: aParsed });
      alert('✅ Varian & Addon diupdate');
      location.reload();
    }catch(e){ alert(e.message); }
  };
  window._orderStatus = async (id, status)=>{
    if(!confirm('Ubah status jadi '+status+'?')) return;
    try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); }
  };
}

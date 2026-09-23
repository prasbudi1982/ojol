// lib/app/store/storeViews.js - V3 - Food selection jelas: varian & addon masing2 ada tombol Tambah
import { warungStore, productStore, cartStore, foodOrderStore, ratingStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';

export async function viewStoreList(){
  let stores = [];
  try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ stores = []; }
  return `
    <div class="card">
      <h2>🍔 Warung Buka</h2>
      <p class="muted">Pilih warung, lalu pilih varian & addon langsung tambah ke keranjang.</p>
      <div class="list">
        ${stores.length ? stores.map(s=>`
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>${s.name}</b>
              <span style="font-size:10px;background:${s.is_open?'#16a34a':'#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open?'BUKA':'TUTUP'}</span>
            </div>
            <div class="muted" style="font-size:12px">${s.alamat_text||''}</div>
            <a href="#/store/detail/${s.id}" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a>
          </div>
        `).join('') : `<div class="muted">Belum ada warung buka.</div>`}
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
  const cartCount = (()=>{ try{ return cartStore.getState().items.reduce((a,b)=>a+b.qty,0); }catch(e){ return 0; } })();

  return `
    <div class="card">
      <a href="#/store" class="muted">← Kembali ke Food</a>
      <h2 style="margin-top:8px">🏪 ${store.name}</h2>
      <div class="muted" style="font-size:12px">${store.alamat_text||''}</div>
      <div class="kpi" style="margin-top:10px">
        <div><b>${avg.avg||0}</b><span class="muted" style="font-size:10px">⭐ Rating</span></div>
        <div><b>${products.length}</b><span class="muted" style="font-size:10px">Menu</span></div>
        <div><b>${store.is_open?'Buka':'Tutup'}</b><span class="muted" style="font-size:10px">Status</span></div>
      </div>
    </div>

    <div style="position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;margin:0 -12px;padding-left:12px;padding-right:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <b style="font-size:14px">🛒 Keranjang: ${cartCount} item</b>
      <a href="#/store/cart" class="btn primary" style="width:auto;padding:8px 14px;font-size:12px">Lihat Keranjang</a>
    </div>

    <div class="list" style="margin-top:12px">
      ${products.length ? products.map(p=>{
        let vari = [];
        try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||p.variasi||[]); }catch(e){ vari=[]; }
        // jika vari kosong, buat default varian biasa dengan harga 0
        if(!vari.length){ vari = [{ name: 'Biasa', price_delta: 0 }]; }
        let addons = [];
        try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){ addons=[]; }

        const basePrice = Number(p.harga);

        // helper format +0 / +5000
        const fmtDelta = (d)=>{
          const n = Number(d||0);
          if(n===0) return '(+0)';
          return '(+'+ (n>0?'+':'') + n.toLocaleString('id-ID') +')'.replace('++','+');
        };
        const fmtHarga = (h)=> 'Rp '+Number(h).toLocaleString('id-ID');

        return `
        <div class="card" style="margin:0;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:16px">
          <div style="padding:12px 14px;background:var(--card2);border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
              <div style="flex:1">
                <div style="font-size:16px;font-weight:800">${p.name}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">${fmtHarga(basePrice)} • ${p.kategori||'Makanan'} • Stok ${p.stok||0}</div>
                ${p.deskripsi ? '<div class="muted" style="font-size:11px;margin-top:4px">'+p.deskripsi+'</div>' : ''}
              </div>
              <div style="text-align:right">
                <div style="font-size:18px;font-weight:800;color:var(--primary)">${fmtHarga(basePrice)}</div>
                <div class="muted" style="font-size:10px">harga dasar</div>
              </div>
            </div>
          </div>

          <div style="padding:12px 14px">
            <div style="font-size:13px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:6px">📦 Variasi</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${vari.map(v=>{
                const totalHarga = basePrice + Number(v.price_delta||0);
                const label = p.name + ' ' + v.name.toLowerCase() + ' (' + (Number(v.price_delta||0)===0 ? '+0' : '+' + Number(v.price_delta||0).toLocaleString('id-ID')) + ')';
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:10px 12px">
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600">${p.name} ${v.name.toLowerCase()} <span class="muted" style="font-size:11px">(${Number(v.price_delta||0)===0 ? '+0' : '+'+Number(v.price_delta).toLocaleString('id-ID')})</span></div>
                    <div style="font-size:12px;color:var(--primary);font-weight:700;margin-top:2px">${fmtHarga(totalHarga)}</div>
                  </div>
                  <button class="btn primary" style="width:auto;padding:8px 14px;font-size:12px;white-space:nowrap" onclick="window._addCartVar && window._addCartVar('${p.id}','${(v.name||'').replace(/'/g,'')}')">+ Tambah</button>
                </div>
                `;
              }).join('')}
            </div>

            ${addons.length ? `
            <div style="font-size:13px;font-weight:800;margin:14px 0 8px;display:flex;align-items:center;gap:6px">➕ Addon / Topping</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${addons.map(a=>{
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:10px 12px">
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600">${a.name} <span class="muted" style="font-size:11px">(+${Number(a.harga).toLocaleString('id-ID')})</span></div>
                    <div style="font-size:11px" class="muted">Tambahan untuk ${p.name}</div>
                  </div>
                  <button class="btn secondary" style="width:auto;padding:8px 14px;font-size:12px;background:var(--card2);border:1px solid var(--border)" onclick="window._addAddon && window._addAddon('${p.id}','${(a.name||'').replace(/'/g,'')}')">+ Tambah</button>
                </div>
                `;
              }).join('')}
            </div>
            ` : `<div class="muted" style="font-size:11px;margin-top:12px">Tidak ada addon untuk menu ini</div>`}
          </div>
        </div>
        `;
      }).join('') : `<div class="card"><div class="muted">Belum ada menu tersedia</div></div>`}
    </div>

    <div class="card" style="margin-top:16px">
      <a href="#/store/cart" class="btn primary" style="text-align:center">🛒 Lihat Keranjang (${cartCount}) - Checkout</a>
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
          const varText = i.variant ? ' • '+i.variant : '';
          const addText = i.addons && i.addons.length ? ' • +'+i.addons.map(a=>a.name).join(', +') : '';
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1"><b>${i.name}${varText}</b><div class="muted" style="font-size:11px">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = Rp ${Number(i.harga*i.qty).toLocaleString()}${addText}</div>
              ${i.addons && i.addons.length ? '<div class="muted" style="font-size:10px;margin-top:2px">Addon: '+i.addons.map(a=>a.name+' (+'+Number(a.harga).toLocaleString()+')').join(', ')+'</div>' : ''}
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty-1})" class="btn secondary" style="width:36px;padding:8px">-</button>
                <div style="font-size:13px;font-weight:700;min-width:20px;text-align:center">${i.qty}</div>
                <button onclick="window._cartQty && window._cartQty('${i.product_id}', ${i.qty+1})" class="btn secondary" style="width:36px;padding:8px">+</button>
              </div>
            </div>
            ${i.variant ? '<div style="display:flex;gap:6px;flex-wrap:wrap"><span style="font-size:10px;background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:99px">📦 '+i.variant+'</span></div>' : ''}
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
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore){
    return `
      <div class="card">
        <h2>🏪 Buat Warung</h2>
        <p class="muted">Belum ada warung.</p>
        <label>Nama Warung</label><input id="sName" placeholder="Warung Sego Bu Sri"/>
        <label>Alamat</label><input id="sAlamat" placeholder="Ds Suruh RT..."/>
        <label>No WA</label><input id="sWa" placeholder="08..."/>
        <label>Lat</label><input id="sLat" type="number" step="any"/>
        <label>Lng</label><input id="sLng" type="number" step="any"/>
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
      <div class="muted" style="font-size:12px">⭐ ${avg.avg} (${avg.count}) • ${myStore.is_open?'BUKA':'TUTUP'}</div>
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
  if(!myStore) return `<div class="card"><h2>📦 Menu</h2><p class="muted">Buat warung dulu</p></div>`;
  let prods = [];
  try{ prods = await productStore._actions.fetchMyProducts(myStore.id); }catch(e){}
  return `
    <div class="card">
      <h2>📦 Kelola Menu</h2>
      <p class="muted" style="font-size:12px">Tambah varian seperti: Biasa|0, Jumbo|5000, Seafood|10000 dan addon seperti Telur ceplok|3000</p>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px">
        <label style="font-size:12px;font-weight:700">Nama Menu *</label>
        <input id="pName" placeholder="Nasi Goreng" style="margin-bottom:8px"/>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1"><label style="font-size:11px">Harga Dasar *</label><input id="pHarga" type="number" placeholder="10000"/></div>
          <div style="flex:1"><label style="font-size:11px">Kategori</label><select id="pKategori"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select></div>
          <div style="width:90px"><label style="font-size:11px">Stok</label><input id="pStok" type="number" value="100"/></div>
        </div>
        <label style="font-size:11px;font-weight:700">Varian - format: Nama|HargaTambahan, pisah koma</label>
        <input id="pVariasi" placeholder="Biasa|0, Jumbo|5000, Seafood|10000" style="margin-bottom:6px"/>
        <label style="font-size:11px;font-weight:700">Addon - format: Nama|Harga</label>
        <input id="pAddons" placeholder="Telur ceplok|3000, Telur dadar|3000" style="margin-bottom:8px"/>
        <button id="btnAddProduct" class="btn primary" style="width:100%">+ Tambah Menu</button>
        <div id="pStatus" class="muted" style="font-size:11px;margin-top:6px"></div>
      </div>
      <h3>Daftar Menu (${prods.length})</h3>
      <div class="list">
        ${prods.map(p=>{
          let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
          let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){}
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px">
            <div style="display:flex;justify-content:space-between">
              <div><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga).toLocaleString()} • ${p.kategori} • Stok ${p.stok}</div>
              ${vari.length ? '<div style="font-size:11px">📦 '+vari.map(v=>v.name+' ('+(v.price_delta>=0?'+':'' )+v.price_delta+')').join(', ')+'</div>' : ''}
              ${addons.length ? '<div style="font-size:11px">➕ '+addons.map(a=>a.name+' (+'+a.harga+')').join(', ')+'</div>' : ''}
              </div>
              <span style="font-size:10px;background:${p.is_available?'#16a34a':'#6b7280'};color:white;padding:3px 8px;border-radius:99px">${p.is_available?'AKTIF':'OFF'}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._toggleProd && window._toggleProd('${p.id}', ${!p.is_available})">Toggle</button>
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._editProd && window._editProd('${p.id}')">Edit</button>
              <button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white" onclick="window._delProd && window._delProd('${p.id}')">Hapus</button>
            </div>
          </div>
          `;
        }).join('')}
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
  if(!myStore){ try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){} }
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
              let a = i.addons && i.addons.length ? ' +'+i.addons.map(x=>x.name).join(', +') : '';
              return i.name+v+a+' x'+i.qty
            }).join(', ')}</div>
            <div style="display:flex;gap:6px;margin-top:10px">
              ${o.status==='searching_driver' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','preparing')">✅ Terima</button>` : ''}
              ${o.status==='preparing' ? `<button class="btn primary" style="width:auto;padding:8px 12px;font-size:12px" onclick="window._orderStatus && window._orderStatus('${o.id}','ready')">🍱 Siap</button>` : ''}
            </div>
          </div>
        `).join('') : `<div class="muted">Belum ada pesanan</div>`}
      </div>
    </div>
  `;
}

if(typeof window !== 'undefined'){
  const getProds = ()=>{ try{ return productStore.getState().products; }catch(e){ return []; } };
  window._addCartVar = (pid, vName)=>{
    try{
      const prods = getProds();
      const p = prods.find(x=>x.id===pid);
      if(!p) return alert('Produk tidak ditemukan');
      let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
      const v = vari.find(x=>x.name===vName);
      const harga = Number(p.harga) + Number(v?.price_delta||0);
      const item = { ...p, product_id: p.id, harga, variant: vName, variant_price_delta: Number(v?.price_delta||0), addons: [] };
      // unique key by product+variant
      item.cartKey = p.id + '::' + vName;
      cartStore._actions.addItem(item,1);
      const b=document.getElementById('cartBadge'); if(b){ const c=cartStore.getState().items.reduce((a,b)=>a+b.qty,0); b.textContent=c; b.style.display=c>0?'block':'none'; }
      alert('✅ Ditambah: '+p.name+' '+vName+' - Rp '+harga.toLocaleString());
    }catch(e){ console.warn(e); alert(e.message); }
  };
  window._addAddon = (pid, addonName)=>{
    try{
      const prods = getProds();
      const p = prods.find(x=>x.id===pid);
      if(!p) return;
      let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){}
      const a = addons.find(x=>x.name===addonName);
      if(!a) return alert('Addon tidak ditemukan');
      // cek apakah ada item dengan product_id sama di keranjang, jika ada tambah addon ke item terakhir
      const state = cartStore.getState();
      let target = [...state.items].reverse().find(it=>it.product_id===pid || it.id===pid);
      if(!target){
        // jika belum ada varian di keranjang, tambah dulu varian biasa
        window._addCartVar(pid, (()=>{
          let v=[]; try{ v=typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
          return v[0]?.name||'Biasa';
        })());
        // refresh target
        const newState = cartStore.getState();
        target = [...newState.items].reverse().find(it=>it.product_id===pid);
      }
      if(target){
        // tambah addon ke item tersebut
        const newAddons = [...(target.addons||[]), { name: a.name, harga: Number(a.harga) }];
        const newHarga = Number(target.harga) + Number(a.harga);
        // update qty? kita buat item baru dengan addon atau update existing
        // Untuk simple: update existing item dengan addons baru dan harga baru
        // Kita hapus item lama dan tambah baru dengan harga addon
        try{
          cartStore._actions.updateQty(target.product_id, 0); // hapus? tapi updateQty butuh variant key
        }catch(e){}
        // cara simple: tambah sebagai item terpisah addon
        const addonItem = { 
          id: pid+'::addon::'+addonName+'::'+Date.now(), 
          product_id: pid+'::addon::'+addonName, 
          name: p.name + ' + ' + a.name, 
          harga: Number(a.harga), 
          variant: target.variant||'', 
          addons: [{ name: a.name, harga: Number(a.harga) }],
          isAddon: true
        };
        cartStore._actions.addItem(addonItem,1);
        const b=document.getElementById('cartBadge'); if(b){ const c=cartStore.getState().items.reduce((a,b)=>a+b.qty,0); b.textContent=c; b.style.display=c>0?'block':'none'; }
        alert('✅ Addon ditambah: '+a.name+' (+Rp '+Number(a.harga).toLocaleString()+')');
      }
    }catch(e){ console.warn(e); alert(e.message); }
  };
  window._addCart = (pid)=>{ window._addCartVar(pid, 'Biasa'); };
  window._cartQty = (pid, qty)=>{
    try{ cartStore._actions.updateQty(pid, qty); location.hash='#/store/cart'; setTimeout(()=>{ location.reload(); }, 100); }catch(e){ 
      // fallback hapus manual
      try{
        const st = cartStore.getState();
        const filtered = st.items.filter(it=>it.product_id!==pid && it.id!==pid);
        cartStore.setState({ items: filtered });
        location.reload();
      }catch(e2){}
    }
  };
  window._toggleProd = async (id, avail)=>{ try{ await productStore._actions.updateProduct(id, { is_available: avail }); location.reload(); }catch(e){ alert(e.message); } };
  window._delProd = async (id)=>{ if(!confirm('Hapus menu ini?')) return; try{ await productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); } };
  window._editProd = async (id)=>{
    try{
      const { data } = await supabase.from('store_products').select('*').eq('id', id).single();
      if(!data) return alert('Produk tidak ditemukan');
      let vari = []; try{ vari = typeof data.variants === 'string' ? JSON.parse(data.variants) : (data.variants||[]); }catch(e){}
      let addons = []; try{ addons = typeof data.addons === 'string' ? JSON.parse(data.addons) : (data.addons||[]); }catch(e){}
      const variStr = vari.map(v=>v.name+'|'+v.price_delta).join(', ');
      const addonStr = addons.map(a=>a.name+'|'+a.harga).join(', ');
      const newVari = prompt('Edit Varian (Nama|HargaTambahan, pisah koma):\nContoh: Biasa|0, Jumbo|5000, Seafood|10000', variStr);
      if(newVari===null) return;
      const newAddon = prompt('Edit Addon (Nama|Harga):\nContoh: Telur ceplok|3000, Telur dadar|3000', addonStr);
      if(newAddon===null) return;
      const parseVari = (str)=>{ if(!str.trim()) return []; return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{ const [n, pr]=part.split('|').map(x=>x.trim()); return { name: n, price_delta: parseInt(pr||'0')||0 }; }); };
      const parseAddon = (str)=>{ if(!str.trim()) return []; return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{ const [n, pr]=part.split('|').map(x=>x.trim()); return { name: n, harga: parseInt(pr||'0')||0 }; }); };
      await productStore._actions.updateProduct(id, { variants: parseVari(newVari), addons: parseAddon(newAddon) });
      alert('✅ Varian & Addon diupdate'); location.reload();
    }catch(e){ alert(e.message); }
  };
  window._orderStatus = async (id, status)=>{ if(!confirm('Ubah jadi '+status+'?')) return; try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); } };
}

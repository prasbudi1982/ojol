// lib/app/store/storeViews.js - V5 - Fix addon bug: susun menu dulu baru 1 order ke keranjang
import { warungStore, productStore, cartStore, foodOrderStore, ratingStore } from './index.js';
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';

export async function viewStoreList(){
  let stores = [];
  try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ stores = []; }
  return `
    <div class="card">
      <h2>🍔 Warung Buka</h2>
      <p class="muted">Pilih warung, susun varian + addon, baru masuk keranjang sebagai 1 order.</p>
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
  const productsJson = JSON.stringify(products).replace(/</g,'\\u003c');
  return `
    <div class="card">
      <a href="#/store" class="muted">← Kembali ke Food</a>
      <h2 style="margin-top:8px">🏪 ${store.name}</h2>
      <div class="muted" style="font-size:12px">${store.alamat_text||''}</div>
    </div>
    <div class="list" style="margin-top:12px">
      ${products.length ? products.map(p=>{
        let vari = [];
        try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){ vari=[]; }
        if(!vari.length){ vari = [{ name: 'Biasa', price_delta: 0 }]; }
        let addons = [];
        try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){ addons=[]; }
        const base = Number(p.harga);
        const variPreview = vari.map(v=> v.name + (Number(v.price_delta||0)!==0 ? ' (+'+Number(v.price_delta).toLocaleString('id-ID')+')' : ' (+0)')).join(', ');
        const addonPreview = addons.map(a=> a.name + ' (+'+Number(a.harga).toLocaleString('id-ID')+')').join(', ');
        return `
        <div class="card" style="margin:0;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:16px">
          <div style="padding:12px 14px;background:var(--card2);border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;gap:10px">
              <div style="flex:1">
                <div style="font-size:16px;font-weight:800">${p.name}</div>
                <div class="muted" style="font-size:12px;margin-top:2px">Rp ${base.toLocaleString('id-ID')} • ${p.kategori||'Makanan'}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:16px;font-weight:800;color:var(--primary)">Rp ${base.toLocaleString('id-ID')}</div>
              </div>
            </div>
          </div>
          <div style="padding:12px 14px">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px">📦 Variasi: <span class="muted" style="font-weight:400">${variPreview}</span></div>
            ${addons.length ? '<div style="font-size:12px;font-weight:700;margin-bottom:8px">➕ Addon: <span class="muted" style="font-weight:400">'+addonPreview+'</span></div>' : '<div class="muted" style="font-size:11px;margin-bottom:8px">Tanpa addon</div>'}
            <button class="btn primary" style="width:100%;padding:12px;font-weight:800" onclick="window._openMenuBuilder && window._openMenuBuilder('${p.id}')">🍱 Pilih Varian & Addon</button>
          </div>
        </div>
        `;
      }).join('') : `<div class="card"><div class="muted">Belum ada menu</div></div>`}
    </div>
    <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center">
      <div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0;padding:0;box-shadow:0 -8px 32px rgba(0,0,0,.4)">
        <div style="padding:16px 16px 8px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);z-index:2;border-radius:20px 20px 0 0">
          <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div id="builderName" style="font-size:18px;font-weight:800">Nama Menu</div>
              <div id="builderBase" class="muted" style="font-size:12px">Rp 0</div>
            </div>
            <button onclick="window._closeMenuBuilder && window._closeMenuBuilder()" class="btn secondary" style="width:auto;padding:8px 12px">✕</button>
          </div>
        </div>
        <div style="padding:16px">
          <div style="font-size:14px;font-weight:800;margin-bottom:10px">📦 Pilih Variasi</div>
          <div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
          <div id="builderAddonHeader" style="font-size:14px;font-weight:800;margin-bottom:10px">➕ Pilih Addon / Topping (boleh banyak)</div>
          <div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="muted" style="font-size:12px">Qty</span>
              <div style="display:flex;align-items:center;gap:10px">
                <button id="builderQtyMinus" class="btn secondary" style="width:40px;height:40px;padding:0;border-radius:12px;font-size:18px">-</button>
                <span id="builderQty" style="font-size:18px;font-weight:800;min-width:24px;text-align:center">1</span>
                <button id="builderQtyPlus" class="btn secondary" style="width:40px;height:40px;padding:0;border-radius:12px;font-size:18px">+</button>
              </div>
            </div>
            <div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:10px">
              <div style="font-size:12px" class="muted" id="builderSummary">-</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;color:var(--primary)" id="builderTotal">Rp 0</div>
            </div>
          </div>
          <button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-size:15px;font-weight:800">+ Tambah ke Keranjang (1 order)</button>
          <div class="muted" style="font-size:10px;text-align:center;margin-top:8px">1 order = 1 baris di keranjang dengan varian + addon gabungan</div>
        </div>
      </div>
    </div>
    <script type="application/json" id="productsData">${productsJson}</script>
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
          const addons = i.addons||[];
          return `
          <div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px;border-left:3px solid var(--primary)">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <div style="flex:1">
                <b>${i.name}</b>
                ${i.variant ? '<div style="font-size:11px;margin-top:2px">📦 '+i.variant+' '+(i.variant_price_delta?'(+'+Number(i.variant_price_delta).toLocaleString()+')':'')+'</div>' : ''}
                ${addons.length ? '<div style="font-size:11px;margin-top:2px">➕ '+addons.map(a=>a.name+' (+'+Number(a.harga).toLocaleString()+')').join(', ')+'</div>' : ''}
                <div class="muted" style="font-size:11px;margin-top:4px">Rp ${Number(i.harga).toLocaleString()} x ${i.qty} = <b>Rp ${Number(i.harga*i.qty).toLocaleString()}</b></div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <button onclick="window._cartQty && window._cartQty('${i.cartKey||i.product_id||i.id}', ${i.qty-1})" class="btn secondary" style="width:36px;padding:8px">-</button>
                <div style="font-weight:700;min-width:20px;text-align:center">${i.qty}</div>
                <button onclick="window._cartQty && window._cartQty('${i.cartKey||i.product_id||i.id}', ${i.qty+1})" class="btn secondary" style="width:36px;padding:8px">+</button>
              </div>
            </div>
          </div>
        `}).join('') : `<div class="muted">Keranjang kosong.</div>`}
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px" class="muted">Subtotal Rp ${totals.subtotal.toLocaleString()} • Ongkir Rp ${totals.delivery_fee.toLocaleString()}</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ${totals.total.toLocaleString()}</div>
        <label style="margin-top:10px">Alamat Antar</label>
        <textarea id="destText" placeholder="Ds Suruh RT..." style="min-height:70px">${state.dest.text||''}</textarea>
        <button id="btnPickDest" class="btn secondary" style="margin-top:8px">📍 Pilih Lokasi di Peta</button>
        <button id="btnCheckout" class="btn primary" style="margin-top:12px" ${state.items.length?'':'disabled'}>✅ Checkout</button>
      </div>
    </div>
  `;
}

export async function viewMyStore(){ let profile=null; try{ profile=await getProfile(); }catch(e){} if(!profile) return '<div class="card"><p class="muted">Harus login</p></div>'; if(profile.role!=='merchant' && profile.role!=='warung') return '<div class="card"><h2>🏪 Warungku</h2><p class="muted">Khusus merchant</p></div>'; let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){} if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} } if(!myStore){ return '<div class="card"><h2>🏪 Buat Warung</h2><p class="muted">Belum ada warung</p><label>Nama</label><input id="sName"/><label>Alamat</label><input id="sAlamat"/><label>WA</label><input id="sWa"/><label>Lat</label><input id="sLat"/><label>Lng</label><input id="sLng"/><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnCreateStore" class="btn primary" style="flex:1">Buat Warung</button></div></div>'; } return '<div class="card"><h2>🏪 Warungku: '+myStore.name+'</h2><div class="muted" style="font-size:12px">'+(myStore.is_open?'BUKA':'TUTUP')+'</div><label>Nama</label><input id="sName" value="'+(myStore.name||'')+'"/><label>Alamat</label><input id="sAlamat" value="'+(myStore.alamat_text||'').replace(/"/g,'&quot;')+'"/><label>WA</label><input id="sWa" value="'+(myStore.wa_number||'')+'"/><label>Lat</label><input id="sLat" type="number" step="any" value="'+(myStore.lat||'')+'"/><label>Lng</label><input id="sLng" type="number" step="any" value="'+(myStore.lng||'')+'"/><label>Status</label><select id="sOpen"><option value="true" '+(myStore.is_open?'selected':'')+'>Buka</option><option value="false" '+(!myStore.is_open?'selected':'')+'>Tutup</option></select><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">📍 Peta</button><button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button></div><div style="margin-top:12px"><a href="#/store/products" class="btn primary">📦 Kelola Menu</a></div></div>'; }

export async function viewStoreProducts(){ let profile=null; try{ profile=await getProfile(); }catch(e){} if(profile?.role!=='merchant' && profile?.role!=='warung') return '<div class="card"><p class="muted">Khusus merchant</p></div>'; let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){} if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} } if(!myStore) return '<div class="card"><h2>📦 Menu</h2><p class="muted">Buat warung dulu</p></div>'; let prods=[]; try{ prods=await productStore._actions.fetchMyProducts(myStore.id); }catch(e){} return '<div class="card"><h2>📦 Kelola Menu</h2><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px"><label>Nama *</label><input id="pName" placeholder="Nasi Goreng"/><div style="display:flex;gap:8px"><div style="flex:1"><label>Harga *</label><input id="pHarga" type="number" placeholder="10000"/></div><div style="flex:1"><label>Kategori</label><select id="pKategori"><option>Makanan</option><option>Minuman</option><option>Snack</option><option>Paket</option></select></div><div style="width:90px"><label>Stok</label><input id="pStok" type="number" value="100"/></div></div><label>Varian - Nama|Tambahan</label><input id="pVariasi" placeholder="Biasa|0, Jumbo|5000, Seafood|10000"/><label>Addon - Nama|Harga</label><input id="pAddons" placeholder="Telur ceplok|3000, Telur dadar|3000"/><button id="btnAddProduct" class="btn primary" style="width:100%;margin-top:8px">+ Tambah Menu</button><div id="pStatus" class="muted" style="font-size:11px;margin-top:6px"></div></div><div class="list">'+prods.map(p=>'<div class="driver-card" style="flex-direction:column"><div><b>'+p.name+'</b><div class="muted" style="font-size:11px">Rp '+Number(p.harga).toLocaleString()+'</div></div><div style="display:flex;gap:6px"><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px" onclick="window._editProd && window._editProd(\''+p.id+'\')">Edit</button><button class="btn secondary" style="width:auto;padding:6px 10px;font-size:11px;background:#ef4444;color:white" onclick="window._delProd && window._delProd(\''+p.id+'\')">Hapus</button></div></div>').join('')+'</div></div>'; }

export async function viewStoreOrders(){ let profile=null; try{ profile=await getProfile(); }catch(e){} if(profile?.role!=='merchant' && profile?.role!=='warung') return '<div class="card"><p class="muted">Khusus merchant</p></div>'; let myStore=null; try{ myStore=await warungStore._actions.fetchMyStore(profile.id); }catch(e){} if(!myStore){ try{ const { data }=await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore=data; }catch(e){} } if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>'; let orders=[]; try{ orders=await foodOrderStore._actions.fetchIncomingOrders(myStore.id); }catch(e){} return '<div class="card"><h2>🔔 Pesanan Masuk</h2><div class="list">'+(orders.length ? orders.map(o=>'<div class="card" style="margin:0;border:1px solid var(--border)"><div style="display:flex;justify-content:space-between"><b>#'+o.id.slice(0,8)+'</b><span style="font-size:10px;background:#f59e0b;color:#111;padding:2px 8px;border-radius:99px">'+o.status+'</span></div><div class="muted" style="font-size:11px">'+new Date(o.created_at).toLocaleString('id-ID')+' • Rp '+Number(o.total||0).toLocaleString()+'</div><div style="font-size:12px;margin-top:6px">'+(o.items||[]).map(i=>{ let v=i.variant?' ('+i.variant+')':''; let a=i.addons&&i.addons.length?' +'+i.addons.map(x=>x.name).join(', +'):''; return i.name+v+a+' x'+i.qty }).join(', ')+'</div></div>').join('') : '<div class="muted">Belum ada pesanan</div>')+'</div></div>'; }


if(typeof window !== 'undefined'){
  let _builderState = { product: null, variant: null, addons: [], qty: 1 };

  window._openMenuBuilder = (pid)=>{
    try{
      const el = document.getElementById('productsData');
      const prods = el ? JSON.parse(el.textContent) : (productStore.getState().products||[]);
      const p = prods.find(x=>x.id===pid);
      if(!p) return alert('Produk tidak ditemukan');
      let vari = []; try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants||[]); }catch(e){}
      if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
      let addons = []; try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons||[]); }catch(e){}
      
      _builderState = { product: p, variant: vari[0], addons: [], qty: 1, variList: vari, addonList: addons };

      document.getElementById('builderName').textContent = p.name;
      document.getElementById('builderBase').textContent = 'Harga dasar Rp ' + Number(p.harga).toLocaleString('id-ID');

      const variContainer = document.getElementById('builderVariasi');
      variContainer.innerHTML = vari.map((v,i)=>{
        const total = Number(p.harga) + Number(v.price_delta||0);
        const checked = i===0 ? 'checked' : '';
        return '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="radio" name="builderVariant" value="'+v.name+'" '+checked+' onchange="window._builderPickVariant && window._builderPickVariant(\''+v.name.replace(/'/g,'')+'\')"><div><div style="font-size:13px;font-weight:600">'+p.name+' '+v.name.toLowerCase()+' <span class="muted" style="font-size:11px">('+(Number(v.price_delta||0)===0 ? '+0' : '+'+Number(v.price_delta).toLocaleString())+')</span></div><div style="font-size:12px;color:var(--primary);font-weight:700">Rp '+total.toLocaleString()+'</div></div></div></label>';
      }).join('');

      const addonContainer = document.getElementById('builderAddon');
      const addonHeader = document.getElementById('builderAddonHeader');
      if(!addons.length){
        addonHeader.style.display = 'none';
        addonContainer.innerHTML = '<div class="muted" style="font-size:11px">Tidak ada addon</div>';
      } else {
        addonHeader.style.display = 'block';
        addonContainer.innerHTML = addons.map(a=>{
          return '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px dashed var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="checkbox" value="'+a.name+'" onchange="window._builderToggleAddon && window._builderToggleAddon(\''+a.name.replace(/'/g,'')+'\')"><div><div style="font-size:13px;font-weight:600">'+a.name+' <span class="muted" style="font-size:11px">(+'+Number(a.harga).toLocaleString()+')</span></div></div></div><div style="font-size:12px;font-weight:700;color:var(--primary)">+'+Number(a.harga).toLocaleString()+'</div></label>';
        }).join('');
      }

      document.getElementById('builderQty').textContent = '1';

      // FIX: attach qty and add button handlers HERE, not in setTimeout, so no accumulation
      const minus = document.getElementById('builderQtyMinus');
      const plus = document.getElementById('builderQtyPlus');
      const addBtn = document.getElementById('builderAddBtn');
      if(minus) minus.onclick = ()=>{ if(_builderState.qty>1){ _builderState.qty--; document.getElementById('builderQty').textContent = _builderState.qty; window._updateBuilderTotal(); } };
      if(plus) plus.onclick = ()=>{ _builderState.qty++; document.getElementById('builderQty').textContent = _builderState.qty; window._updateBuilderTotal(); };
      if(addBtn){
        // overwrite, not addEventListener, so no duplicate
        addBtn.onclick = ()=>{
          try{
            const p = _builderState.product;
            const perItem = Number(p.harga) + Number(_builderState.variant?.price_delta||0) + _builderState.addons.reduce((s,a)=>s+Number(a.harga||0),0);
            const cartKey = p.id + '::' + (_builderState.variant?.name||'Biasa') + '::' + _builderState.addons.map(a=>a.name).sort().join('|');
            const item = { id: cartKey, product_id: p.id, cartKey: cartKey, name: p.name, harga: perItem, variant: _builderState.variant?.name||'Biasa', variant_price_delta: Number(_builderState.variant?.price_delta||0), addons: [..._builderState.addons], qty: _builderState.qty };
            // single add - no duplicate
            const state = cartStore.getState();
            const existing = state.items.find(it=> (it.cartKey||it.product_id||it.id) === cartKey);
            if(existing){
              cartStore._actions.updateQty(cartKey, Number(existing.qty||0) + Number(_builderState.qty||1));
            } else {
              cartStore._actions.addItem(item, Number(_builderState.qty||1));
            }
            const b=document.getElementById('cartBadge'); if(b){ const c=cartStore.getState().items.reduce((a,b)=>a+Number(b.qty||0),0); b.textContent=c; b.style.display=c>0?'block':'none'; }
            window._closeMenuBuilder();
            const addonList = _builderState.addons.length ? ' + ' + _builderState.addons.map(a=>a.name).join(', ') : '';
            alert('✅ 1 order ditambah:
' + p.name + ' ' + (_builderState.variant?.name||'') + addonList + ' x' + _builderState.qty + '
Rp ' + (perItem*_builderState.qty).toLocaleString());
          }catch(e){ alert(e.message); }
        };
      }

      window._updateBuilderTotal();
      document.getElementById('menuBuilderModal').style.display = 'flex';
    }catch(e){ alert(e.message); }
  };

  window._closeMenuBuilder = ()=>{ const m = document.getElementById('menuBuilderModal'); if(m) m.style.display = 'none'; };
  window._builderPickVariant = (vName)=>{ const v = _builderState.variList.find(x=>x.name===vName); if(v) _builderState.variant = v; window._updateBuilderTotal(); };
  window._builderToggleAddon = (aName)=>{
    const exists = _builderState.addons.find(x=>x.name===aName);
    if(exists){ _builderState.addons = _builderState.addons.filter(x=>x.name!==aName); }
    else { const a = _builderState.addonList.find(x=>x.name===aName); if(a) _builderState.addons.push({ name: a.name, harga: Number(a.harga) }); }
    window._updateBuilderTotal();
  };
  window._updateBuilderTotal = ()=>{
    if(!_builderState.product) return;
    const base = Number(_builderState.product.harga);
    const varDelta = Number(_builderState.variant?.price_delta||0);
    const addonSum = _builderState.addons.reduce((s,a)=>s+Number(a.harga||0),0);
    const perItem = base + varDelta + addonSum;
    const total = perItem * _builderState.qty;
    const varText = _builderState.variant ? _builderState.variant.name : '';
    const addonText = _builderState.addons.length ? ' + ' + _builderState.addons.map(a=>a.name).join(', +') : '';
    document.getElementById('builderSummary').textContent = _builderState.product.name + ' ' + varText + addonText + ' x' + _builderState.qty;
    document.getElementById('builderTotal').textContent = 'Rp ' + total.toLocaleString('id-ID') + ' (' + _builderState.qty + 'x Rp ' + perItem.toLocaleString('id-ID') + ')';
    document.getElementById('builderAddBtn').textContent = '+ Tambah ke Keranjang - Rp ' + total.toLocaleString('id-ID') + ' (1 order)';
  };

  // FIX: cart qty now uses cartKey and supports delete (qty 0)
  window._cartQty = (cartKey, qty)=>{
    try{
      const q = Number(qty);
      if(q<=0){
        if(confirm('Hapus item ini dari keranjang?')){
          cartStore._actions.removeItem(cartKey);
          location.reload();
        }
      } else {
        cartStore._actions.updateQty(cartKey, q);
        setTimeout(()=>location.reload(), 100);
      }
    }catch(e){
      try{
        cartStore._actions.removeItem(cartKey);
        location.reload();
      }catch(e2){ alert(e2.message); }
    }
  };

  window._removeCartItem = (cartKey)=>{
    if(!confirm('Hapus order ini?')) return;
    try{ cartStore._actions.removeItem(cartKey); location.reload(); }catch(e){ alert(e.message); }
  };

  window._toggleProd = async (id, avail)=>{ try{ await productStore._actions.updateProduct(id, { is_available: avail }); location.reload(); }catch(e){ alert(e.message); } };
  window._delProd = async (id)=>{ if(!confirm('Hapus?')) return; try{ await productStore._actions.deleteProduct(id); location.reload(); }catch(e){ alert(e.message); } };
  window._editProd = async (id)=>{
    try{
      const { data } = await supabase.from('store_products').select('*').eq('id', id).single();
      if(!data) return;
      let vari = []; try{ vari = typeof data.variants === 'string' ? JSON.parse(data.variants) : (data.variants||[]); }catch(e){}
      let addons = []; try{ addons = typeof data.addons === 'string' ? JSON.parse(data.addons) : (data.addons||[]); }catch(e){}
      const variStr = vari.map(v=>v.name+'|'+v.price_delta).join(', ');
      const addonStr = addons.map(a=>a.name+'|'+a.harga).join(', ');
      const newVari = prompt('Edit Varian:', variStr); if(newVari===null) return;
      const newAddon = prompt('Edit Addon:', addonStr); if(newAddon===null) return;
      const parseVari = (str)=>{ if(!str.trim()) return []; return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{ const [n, pr]=part.split('|').map(x=>x.trim()); return { name: n, price_delta: parseInt(pr||'0')||0 }; }); };
      const parseAddon = (str)=>{ if(!str.trim()) return []; return str.split(',').map(s=>s.trim()).filter(Boolean).map(part=>{ const [n, pr]=part.split('|').map(x=>x.trim()); return { name: n, harga: parseInt(pr||'0')||0 }; }); };
      await productStore._actions.updateProduct(id, { variants: parseVari(newVari), addons: parseAddon(newAddon) });
      location.reload();
    }catch(e){ alert(e.message); }
  };
  window._orderStatus = async (id, status)=>{ if(!confirm('Ubah jadi '+status+'?')) return; try{ await foodOrderStore._actions.updateStatus(id, status); location.reload(); }catch(e){ alert(e.message); } };
}

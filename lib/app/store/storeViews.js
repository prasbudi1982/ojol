
// FILE: lib/app/store/storeViews.js - FIX WARUNGKU & KELOLA MENU + VARIAN & ADDON (RESTORE)
// - File asli: file4760533940745668490.js (punya varian & addon)
// - Sekarang: Warungku & Kelola Menu berfungsi + varian & addon bisa ditambah/edit
// - Cart: 5 driver inline tanpa modal + tracking modal di lib/app/trackingFood.js
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

function calcHav(lat1,lng1,lat2,lng2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// VIEW STORE LIST
export async function viewStoreList(){
  try{
    let stores=[];
    try{ stores=await warungStore._actions.fetchOpenStores(); }catch(e){ const {data}=await supabase.from('stores').select('*').eq('is_open',true).limit(30); stores=data||[]; }
    const cards=stores.map(s=>`<div class="driver-card" style="flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><b>${s.name}</b><span style="font-size:10px;background:${s.is_open?'#16a34a':'#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open?'BUKA':'TUTUP'}</span></div><div class="muted" style="font-size:11px">${s.alamat_text||''}</div><a href="#/store/detail/${s.id}" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a></div>`).join('');
    return `<div class="card"><h2>🍔 Warung Buka</h2><div class="list">${cards||'<div class="muted">Belum ada warung</div>'}</div></div>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

// VIEW STORE DETAIL (customer pilih varian & addon) - dari file asli punya builder
export async function viewStoreDetail(storeId){
  try{
    const {data:store}=await supabase.from('stores').select('*').eq('id',storeId).single();
    if(!store) return '<div class="card">Warung tidak ditemukan</div>';
    let products=[]; try{ products=await productStore._actions.fetchByStore(storeId,true); }catch(e){ const {data}=await supabase.from('store_products').select('*').eq('store_id',storeId).eq('is_available',true).limit(50); products=data||[]; }
    try{ cartStore._actions.setStore(store); }catch(e){}
    const prodJson=JSON.stringify(products).replace(/</g,'\\u003c');
    const listHtml=products.map(p=>{ const harga=Number(p.harga||0).toLocaleString('id-ID'); return `<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2)"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${harga} • ${p.kategori||''}</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder('${p.id}')">🍱 Pilih Varian</button></div></div>`; }).join('');
    return `<div class="card"><a href="#/store" class="muted">← Kembali</a><h2>${store.name}</h2><div class="muted" style="font-size:11px">${store.alamat_text||''}</div></div><div class="list" style="margin-top:12px">${listHtml||'Belum ada menu'}</div>
      <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center"><div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0"><div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card)"><div style="display:flex;justify-content:space-between"><div><div id="builderName" style="font-weight:800">Menu</div><div id="builderBase" class="muted" style="font-size:12px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:auto">✕</button></div></div><div style="padding:16px"><div style="font-weight:800;margin-bottom:8px">📦 Variasi</div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="font-weight:800;margin-bottom:8px">➕ Addon</div><div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12px">Qty</span><div style="display:flex;gap:8px;align-items:center"><button id="builderQtyMinus" class="btn secondary" style="width:36px">-</button><span id="builderQty">1</span><button id="builderQtyPlus" class="btn secondary" style="width:36px">+</button></div></div><div class="muted" style="font-size:12px;margin-top:8px" id="builderSummary">-</div><div style="font-size:18px;font-weight:800;color:var(--primary);margin-top:4px" id="builderTotal">Rp 0</div></div><button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800">+ Tambah ke Keranjang</button></div></div></div><script type="application/json" id="productsData">${prodJson}</script>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

// VIEW STORE CART - 5 driver inline tanpa modal
export async function viewStoreCart(){
  let state; let rawLocal=null;
  try{ rawLocal=localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ state=cartStore.getState(); if((!state.items||!state.items.length)&&rawLocal){ try{ const parsed=JSON.parse(rawLocal); if(parsed.items?.length) state=parsed; }catch(e){} } }catch(e){ const raw=localStorage.getItem('ojol_cart_v2_food'); state=raw?JSON.parse(raw):{items:[],storeName:'',dest:{text:'',lat:null,lng:null},pickup:{},storeId:null}; }
  if(!state) state={items:[],storeName:'',dest:{text:'',lat:null,lng:null},pickup:{},storeId:null};
  var totals; try{ totals=cartStore._actions.getTotals(); }catch(e){ var sub=0; for(var i=0;i<(state.items||[]).length;i++){ sub+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); } totals={subtotal:sub,delivery_fee:0,total:sub}; }
  var itemsHtml=''; if(state.items&&state.items.length){ for(var i=0;i<state.items.length;i++){ var it=state.items[i]; var key=it.cartKey||it.product_id||it.id; itemsHtml+='<div class="driver-card" style="flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><div><b>'+(it.name||'')+'</b><div class="muted" style="font-size:11px">Rp '+Number(it.harga||0).toLocaleString()+' x '+it.qty+'</div></div><div style="display:flex;gap:6px"><button onclick="window._cartQty(\''+key+'\','+(it.qty-1)+')" class="btn secondary" style="width:36px">-</button><span>'+it.qty+'</span><button onclick="window._cartQty(\''+key+'\','+(it.qty+1)+')" class="btn secondary" style="width:36px">+</button></div></div></div>'; } } else itemsHtml='<div class="muted">Kosong</div>';
  var distance_km=state.distanceKm||0; if(state.pickup&&state.pickup.lat&&state.dest&&state.dest.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
  var delivery_fee=(!state.items||!state.items.length)?0:(distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)));
  var total=totals.subtotal+delivery_fee;
    var warungName = state.storeName || state.pickup?.text || state.pickup?.name || 'Warung';
  var warungAlamat = state.pickup?.alamat_text || state.pickup?.text || '';
  var warungLat = state.pickup?.lat || 0;
  var warungLng = state.pickup?.lng || 0;
  var destText = state.dest?.text || '';
  var destLat = state.dest?.lat || 0;
  var destLng = state.dest?.lng || 0;
  var hasLoc = warungLat && destLat;

  return `<div class="card"><h2>🛒 Keranjang - ${state.storeName||''}</h2><div class="list" style="margin-top:10px">${itemsHtml}</div><hr/>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px">
      <!-- DETAIL JARAK WARUNG -->
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px">
        <div style="font-weight:800;font-size:12px;margin-bottom:6px">📍 Detail Jarak Warung</div>
        <div style="font-size:11px;line-height:1.5">
          <div>🏪 <b>${warungName}</b></div>
          <div class="muted" style="font-size:10px">${warungAlamat} ${warungLat?`(${warungLat.toFixed(5)}, ${warungLng.toFixed(5)})`:''}</div>
          <div style="margin-top:6px">🎯 <b>Tujuan:</b> ${destText||'<span class=muted>Belum set lokasi</span>'}</div>
          <div class="muted" style="font-size:10px">${destLat?`(${destLat.toFixed(5)}, ${destLng.toFixed(5)})`:''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <span style="background:#16a34a;color:white;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">Jarak: ${distance_km.toFixed(2)} km</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">Ongkir: Rp ${delivery_fee.toLocaleString()}</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">${distance_km<=2?'≤2km flat Rp 3rb':'Hitung Rp 3rb/km min Rp 3rb'}</span>
          </div>
          <div class="muted" style="font-size:10px;margin-top:6px">Rumus: ${distance_km<=2?'Jarak ≤2km = Rp 3.000':'Jarak '+distance_km.toFixed(2)+'km × Rp 3.000 = Rp '+delivery_fee.toLocaleString()}</div>
        </div>
      </div>

      <div style="font-weight:800;font-size:12px">📍 Alamat Antar</div>
      <input id="destText" value="${state.dest.text||''}" placeholder="Alamat lengkap (isi otomatis dari Lokasi Saya)" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border)"/>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button id="btnUseMyLocation" class="btn primary" style="flex:1;font-size:12px;padding:10px">📌 Pakai Lokasi Saya</button>
      </div>
      <div class="muted" style="font-size:10px;margin-top:6px">Lat: <span id="cartLatDisplay">${state.dest.lat||'-'}</span> Lng: <span id="cartLngDisplay">${state.dest.lng||'-'}</span> • <span id="ongkirLiveStatus">Total ongkir Rp ${delivery_fee.toLocaleString()} untuk ${distance_km.toFixed(2)} km</span></div>
    </div>
    <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal (${state.items?.length||0} item)</span><span>Rp ${totals.subtotal.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Ongkir (${distance_km.toFixed(2)} km)</span><span>Rp ${delivery_fee.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;font-size:14px"><span>Total</span><span>Rp ${total.toLocaleString()}</span></div>
    </div></div><div class="card" style="margin-top:12px;border:2px solid #16a34a"></div><div class="card" style="margin-top:12px;border:2px solid #16a34a"><div style="display:flex;justify-content:space-between"><h3 style="margin:0;font-size:14px">🏍️ Driver Terdekat dari Warung</h3><button id="btnRefreshDrivers" class="btn secondary" style="width:auto;font-size:11px">🔄 Refresh</button></div><div id="foodDriverStatus" class="muted" style="font-size:11px;margin-top:6px">Memuat...</div><div id="nearbyDriversList" style="margin-top:10px"></div><div style="margin-top:12px"><button id="btnCheckoutBroadcast" class="btn secondary" style="width:100%">📢 Broadcast ke Semua Driver</button></div></div>`;
}

// WARUNGKU & KELOLA MENU DENGAN VARIAN & ADDON
export async function viewMyStore(){
  try{
    const profile=await getProfile(); if(!profile) return '<div class="card">Login dulu</div>';
    let stores=[]; let q=await supabase.from('stores').select('*').eq('owner_id',profile.id).limit(20);
    if(!q.data||!q.data.length){ let q2=await supabase.from('stores').select('*').eq('user_id',profile.id).limit(20); if(q2.data?.length) stores=q2.data; else { try{ stores=await warungStore._actions.fetchMyStores(); }catch(e){} if(!stores.length&&q.data?.length) stores=q.data; } } else stores=q.data;
    if(!stores.length) return `<div class="card"><h2>🏪 Warungku</h2><p class="muted">Belum punya warung</p><a href="#/store/create" class="btn primary" style="display:block;text-align:center;padding:12px">+ Buat Warung</a></div>`;
    const cards=stores.map(s=>`<div class="driver-card" style="flex-direction:column;gap:10px;border:1px solid var(--border);border-radius:16px;padding:12px"><div style="display:flex;justify-content:space-between"><b>${s.name}</b><span style="font-size:10px;background:${s.is_open?'#16a34a':'#ef4444'};color:white;padding:3px 8px;border-radius:99px">${s.is_open?'BUKA':'TUTUP'}</span></div><div class="muted" style="font-size:11px">${s.alamat_text||''}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><button onclick="window._toggleWarung('${s.id}',${!s.is_open})" class="btn secondary" style="font-size:11px">${s.is_open?'🔴 Tutup':'🟢 Buka'}</button><a href="#/store/products/${s.id}" class="btn secondary" style="font-size:11px;text-align:center">🍱 Kelola Menu + Varian</a><a href="#/store/orders/${s.id}" class="btn primary" style="font-size:11px;text-align:center">📦 Order</a><button onclick="window._editWarung('${s.id}')" class="btn secondary" style="font-size:11px">✏️ Edit</button></div></div>`).join('');
    return `<div class="card"><h2>🏪 Warungku</h2><div class="list" style="margin-top:12px">${cards}</div><a href="#/store/create" class="btn secondary" style="width:100%;margin-top:12px;text-align:center">+ Tambah Warung</a></div>`;
  }catch(e){ return `<div class="card">Error Warungku: ${e.message}</div>`; }
}

export async function viewStoreProducts(storeId){
  try{
    if(!storeId){ const profile=await getProfile(); let {data:stores}=await supabase.from('stores').select('id').eq('owner_id',profile.id).limit(1); if(!stores?.length){ let q2=await supabase.from('stores').select('id').eq('user_id',profile.id).limit(1); stores=q2.data; } if(!stores?.length) return '<div class="card">Buat warung dulu</div>'; storeId=stores[0].id; }
    const {data:store}=await supabase.from('stores').select('*').eq('id',storeId).single();
    const {data:products}=await supabase.from('store_products').select('*').eq('store_id',storeId).order('created_at',{ascending:false}).limit(100);
    const listHtml=(products||[]).map(p=>{
      let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){}
      let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
      const variTxt=vari.length?vari.map(v=>v.name+(v.price_delta?` (+${v.price_delta})`:'')).join(', '):'Biasa';
      const addonTxt=addons.length?addons.map(a=>a.name).join(', '):'-';
      return `<div class="card" style="margin:0;border:1px solid var(--border);border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><div><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga||0).toLocaleString()} • ${p.kategori||''} • <span style="background:${p.is_available?'#16a34a':'#ef4444'};color:white;padding:2px 6px;border-radius:6px;font-size:10px">${p.is_available?'TERSEDIA':'HABIS'}</span></div><div class="muted" style="font-size:10px">Varian: ${variTxt} | Addon: ${addonTxt}</div></div><button onclick="window._toggleProduct('${p.id}',${!p.is_available})" class="btn secondary" style="width:auto;font-size:11px">${p.is_available?'Nonaktif':'Aktif'}</button></div><div style="display:flex;gap:6px;margin-top:8px"><button onclick="window._editProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px">✏️ Edit Varian/Addon</button><button onclick="window._deleteProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px;background:#fee2e2;color:#dc2626">🗑️</button></div></div>`;
    }).join('')||'<div class="muted">Belum ada menu</div>';
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><h2>🍱 Kelola Menu - ${store?.name||''}</h2><button onclick="window._addProduct('${storeId}')" class="btn primary" style="width:100%;margin-top:12px;padding:12px">+ Tambah Menu + Varian & Addon</button></div><div class="list" style="margin-top:12px">${listHtml}</div>
      <div id="productModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:16px"><div style="background:var(--card);width:100%;max-width:480px;border-radius:16px;padding:16px;max-height:92vh;overflow:auto"><h3 id="productModalTitle">Tambah Menu</h3><div style="display:flex;flex-direction:column;gap:10px;margin-top:12px"><input id="prodName" placeholder="Nama menu" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodHarga" type="number" placeholder="Harga dasar" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodKategori" placeholder="Kategori" value="Makanan" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><label style="font-size:12px"><input id="prodAvailable" type="checkbox" checked/> Tersedia</label>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">📦 Varian</b><button onclick="window._addVariantField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Varian</button></div><div id="prodVariantsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">➕ Addon</b><button onclick="window._addAddonField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Addon</button></div><div id="prodAddonsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="display:flex;gap:8px"><button onclick="window._closeProductModal()" class="btn secondary" style="flex:1">Batal</button><button id="btnSaveProduct" class="btn primary" style="flex:1">Simpan</button></div></div></div></div>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

export async function viewStoreOrders(storeId){
  try{
    let query=supabase.from('food_orders').select('*').order('created_at',{ascending:false}).limit(30);
    if(storeId) query=query.eq('store_id',storeId);
    const {data:orders}=await query;
    const listHtml=(orders||[]).map(o=>`<div class="card" style="margin:0;border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><b>#${o.id.slice(0,6).toUpperCase()}</b><span style="font-size:10px;background:#f59e0b;color:white;padding:3px 8px;border-radius:99px">${o.status}</span></div><div class="muted" style="font-size:11px">${(o.items||[]).map(i=>i.name+' x'+i.qty).join(', ')}</div><div style="font-size:11px">Rp ${Number(o.total||0).toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:8px"><button onclick="window._orderStatus('${o.id}','preparing')" class="btn secondary" style="flex:1;font-size:11px">Masak</button><button onclick="window._orderStatus('${o.id}','ready')" class="btn secondary" style="flex:1;font-size:11px">Siap</button><button onclick="window._orderStatus('${o.id}','completed')" class="btn primary" style="flex:1;font-size:11px">Selesai</button></div></div>`).join('')||'Belum ada order';
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><h2>📦 Order Masuk</h2><div class="list" style="margin-top:12px">${listHtml}</div></div>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

// LOGIC DRIVER & CHECKOUT
window._loadNearbyDriversForCart = async function(){
  var listEl=document.getElementById('nearbyDriversList'); var statusEl=document.getElementById('foodDriverStatus');
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw){ if(statusEl) statusEl.textContent='Kosong'; return; }
    var state=JSON.parse(raw); if(!state.pickup||!state.pickup.lat){ if(statusEl) statusEl.textContent='Pickup belum ada'; return; }
    if(statusEl) statusEl.textContent='Mencari driver...'; if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">🔍 Mencari...</div>';
    var {data:locs}=await supabase.from('driver_locations').select('*').limit(50);
    if(!locs||!locs.length){ if(statusEl) statusEl.textContent='Tidak ada driver online'; if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">Tidak ada driver online. Broadcast.</div>'; return; }
    var driverIds=locs.map(l=>l.driver_id).filter(Boolean); var {data:users}=await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol').in('id',driverIds);
    var drivers=locs.map(loc=>{ var u=users?users.find(x=>x.id===loc.driver_id):null; if(!u) return null; if((u.role||'').toLowerCase()!=='driver') return null; var dLat=null,dLng=null; if(loc.lat&&loc.lng){ dLat=loc.lat; dLng=loc.lng; } else if(loc.lokasi){ try{ var m=loc.lokasi.match(/POINT\(([^ ]+) ([^ ]+)\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){} } if(!dLat) return null; var dist=calcHav(state.pickup.lat,state.pickup.lng,dLat,dLng); return {...u,driver_id:u.id,distance_km:dist}; }).filter(Boolean).sort((a,b)=>a.distance_km-b.distance_km).slice(0,5);
    if(statusEl) statusEl.textContent='Ditemukan '+drivers.length+' driver terdekat';
    if(listEl) listEl.innerHTML=drivers.map(d=>`<div style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px"><div style="flex:1"><b style="font-size:13px">${d.name} ${d.jenis_kendaraan==='mobil'?'🚗':'🏍️'} <span style="background:#22c55e;color:#052e16;padding:2px 6px;border-radius:6px;font-size:10px">${d.distance_km.toFixed(2)}km</span></b><div class="muted" style="font-size:11px">${d.nopol||''}</div></div><button data-driver-id="${d.driver_id}" class="btn-choose-driver" style="background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:8px;font-weight:800;font-size:12px">✅ Pilih</button></div>`).join('');
  }catch(err){ if(statusEl) statusEl.textContent='Error: '+err.message; }
};

window._checkoutFoodDirect = async function(driverId){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Kosong'); var state=JSON.parse(raw); if(!state.items?.length) return alert('Kosong'); if(!state.dest.lat) return alert('Pilih alamat dulu!');
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat&&state.dest?.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={store_id:state.storeId,customer_id:customerId,driver_id:driverId,items:state.items,subtotal,delivery_fee,total,distance_km:parseFloat(Number(distance_km).toFixed(2)),dest_text:state.dest.text,dest_lat:state.dest.lat,dest_lng:state.dest.lng,pickup_lat:state.pickup.lat,pickup_lng:state.pickup.lng,pickup_text:state.pickup.text||'',status:'driver_assigned'};
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={store_id:payload.store_id,customer_id:payload.customer_id,driver_id:driverId,items:payload.items,total:payload.total,dest_text:payload.dest_text,dest_lat:payload.dest_lat,dest_lng:payload.dest_lng,pickup_lat:payload.pickup_lat,pickup_lng:payload.pickup_lng,status:'driver_assigned'}; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}})); localStorage.setItem('active_food_order_id',od.id);
    if(window.trackingFood?.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id); else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id); else { var tf=await import('../trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Gagal: '+e.message); }
};

window._checkoutFood = async function(){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Kosong'); var state=JSON.parse(raw); if(!state.items?.length) return alert('Kosong'); if(!state.dest.lat) return alert('Pilih alamat!');
    var destText=document.getElementById('destText')?document.getElementById('destText').value.trim():state.dest.text||''; if(destText.length<5){ alert('Alamat lengkap'); return; } state.dest.text=destText; localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state));
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=true; btn.textContent='Membuat...'; }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat&&state.dest?.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={store_id:state.storeId,customer_id:customerId,items:state.items,subtotal,delivery_fee,total,distance_km:parseFloat(Number(distance_km).toFixed(2)),dest_text:destText,dest_lat:state.dest.lat,dest_lng:state.dest.lng,pickup_lat:state.pickup.lat,pickup_lng:state.pickup.lng,pickup_text:state.pickup.text||'',status:'searching_driver'};
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={store_id:payload.store_id,customer_id:payload.customer_id,items:payload.items,total:payload.total,dest_text:payload.dest_text,dest_lat:payload.dest_lat,dest_lng:payload.dest_lng,pickup_lat:payload.pickup_lat,pickup_lng:payload.pickup_lng,status:'searching_driver'}; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}})); localStorage.setItem('active_food_order_id',od.id);
    if(window.trackingFood?.openFoodTrackingDetailModal) window.trackingFood.openFoodTrackingDetailModal(od.id); else if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id); else { var tf=await import('../trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Checkout gagal: '+e.message); var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=false; btn.textContent='📢 Broadcast'; } }
};

// ACTIONS WARUNGKU & PRODUK
window._toggleWarung=async function(storeId,isOpen){ try{ const {error}=await supabase.from('stores').update({is_open:isOpen}).eq('id',storeId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };
window._editWarung=function(storeId){ location.hash='#/store/edit/'+storeId; };
window._toggleProduct=async function(productId,isAvailable){ try{ const {error}=await supabase.from('store_products').update({is_available:isAvailable}).eq('id',productId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };
window._deleteProduct=async function(productId){ if(!confirm('Hapus menu?')) return; try{ const {error}=await supabase.from('store_products').delete().eq('id',productId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };

let currentEditProductId=null; let currentStoreIdForProduct=null;
window._renderVariantFields=function(variants){ const list=document.getElementById('prodVariantsList'); if(!list) return; list.innerHTML=''; (variants||[{name:'Biasa',price_delta:0}]).forEach(v=>{ const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" value="${(v.name||'').replace(/"/g,'&quot;')}" placeholder="Nama varian" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price_delta" type="number" value="${v.price_delta||0}" placeholder="+Rp" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); }); };
window._addVariantField=function(){ const list=document.getElementById('prodVariantsList'); const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" placeholder="Nama varian" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price_delta" type="number" value="0" placeholder="+Rp" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); };
window._renderAddonFields=function(addons){ const list=document.getElementById('prodAddonsList'); if(!list) return; list.innerHTML=''; (addons||[]).forEach(a=>{ const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="Nama addon" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price" type="number" value="${a.price||0}" placeholder="Harga" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); }); };
window._addAddonField=function(){ const list=document.getElementById('prodAddonsList'); const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" placeholder="Nama addon" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price" type="number" value="0" placeholder="Harga" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); };
window._collectVariants=function(){ const rows=document.querySelectorAll('#prodVariantsList > div'); const arr=[]; rows.forEach(r=>{ const name=r.querySelector('[data-field="name"]')?.value.trim(); const delta=Number(r.querySelector('[data-field="price_delta"]')?.value||0); if(name) arr.push({name,price_delta:delta}); }); if(!arr.length) arr.push({name:'Biasa',price_delta:0}); return arr; };
window._collectAddons=function(){ const rows=document.querySelectorAll('#prodAddonsList > div'); const arr=[]; rows.forEach(r=>{ const name=r.querySelector('[data-field="name"]')?.value.trim(); const price=Number(r.querySelector('[data-field="price"]')?.value||0); if(name) arr.push({name,price}); }); return arr; };
window._addProduct=function(storeId){ currentStoreIdForProduct=storeId; currentEditProductId=null; document.getElementById('productModalTitle').textContent='Tambah Menu + Varian & Addon'; document.getElementById('prodName').value=''; document.getElementById('prodHarga').value=''; document.getElementById('prodKategori').value='Makanan'; document.getElementById('prodAvailable').checked=true; window._renderVariantFields([{name:'Biasa',price_delta:0}]); window._renderAddonFields([]); document.getElementById('productModal').style.display='flex'; document.getElementById('btnSaveProduct').onclick=window._saveProduct; };
window._editProduct=async function(productId){ try{ const {data:p}=await supabase.from('store_products').select('*').eq('id',productId).single(); if(!p) return alert('Tidak ditemukan'); currentEditProductId=productId; currentStoreIdForProduct=p.store_id; document.getElementById('productModalTitle').textContent='Edit Menu + Varian & Addon'; document.getElementById('prodName').value=p.name||''; document.getElementById('prodHarga').value=p.harga||0; document.getElementById('prodKategori').value=p.kategori||'Makanan'; document.getElementById('prodAvailable').checked=!!p.is_available; let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){} window._renderVariantFields(vari.length?vari:[{name:'Biasa',price_delta:0}]); window._renderAddonFields(addons||[]); document.getElementById('productModal').style.display='flex'; document.getElementById('btnSaveProduct').onclick=window._saveProduct; }catch(e){ alert(e.message); } };
window._closeProductModal=function(){ document.getElementById('productModal').style.display='none'; };
window._saveProduct=async function(){ try{ const name=document.getElementById('prodName').value.trim(); const harga=Number(document.getElementById('prodHarga').value||0); const kategori=document.getElementById('prodKategori').value.trim()||'Makanan'; const is_available=document.getElementById('prodAvailable').checked; const variants=window._collectVariants(); const addons=window._collectAddons(); if(!name) return alert('Nama harus diisi'); if(!harga) return alert('Harga harus diisi'); if(currentEditProductId){ const {error}=await supabase.from('store_products').update({name,harga,kategori,is_available,variants,addons}).eq('id',currentEditProductId); if(error) throw error; } else { const payload={store_id:currentStoreIdForProduct,name,harga,kategori,is_available,variants,addons}; const {error}=await supabase.from('store_products').insert(payload); if(error) throw error; } window._closeProductModal(); location.reload(); }catch(e){ alert('Gagal simpan: '+e.message); } };
window._orderStatus=async function(id,status){ if(!confirm('Ubah jadi '+status+'?')) return; try{ const {error}=await supabase.from('food_orders').update({status}).eq('id',id); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };

// MENU BUILDER CUSTOMER (dari file asli)
window._openMenuBuilder=async function(productId){
  try{
    const dataEl=document.getElementById('productsData'); let products=[]; if(dataEl){ try{ products=JSON.parse(dataEl.textContent); }catch(e){} }
    let p=products.find(x=>x.id===productId); if(!p){ const {data}=await supabase.from('store_products').select('*').eq('id',productId).single(); p=data; }
    if(!p) return alert('Produk tidak ditemukan');
    window._currentBuilderProduct=p;
    document.getElementById('builderName').textContent=p.name; document.getElementById('builderBase').textContent='Rp '+Number(p.harga||0).toLocaleString();
    let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
    let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
    const variHtml=vari.map((v,i)=>`<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px"><span><input type="radio" name="builderVari" value="${i}" ${i===0?'checked':''}/> ${v.name} ${v.price_delta?` (+Rp${Number(v.price_delta).toLocaleString()})`:''}</span></label>`).join('');
    const addonHtml=addons.map((a,i)=>`<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px"><span><input type="checkbox" name="builderAddon" value="${i}"/> ${a.name}</span><span>Rp ${Number(a.price||0).toLocaleString()}</span></label>`).join('')||'<div class="muted" style="font-size:11px">Tidak ada addon</div>';
    document.getElementById('builderVariasi').innerHTML=variHtml; document.getElementById('builderAddon').innerHTML=addonHtml;
    window._builderQty=1; document.getElementById('builderQty').textContent='1'; window._updateBuilderTotal();
    document.getElementById('menuBuilderModal').style.display='flex';
  }catch(e){ alert(e.message); }
};
window._closeMenuBuilder=function(){ document.getElementById('menuBuilderModal').style.display='none'; };
window._updateBuilderTotal=function(){
  try{
    const p=window._currentBuilderProduct; if(!p) return;
    let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
    let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
    let base=Number(p.harga||0);
    const variSel=document.querySelector('input[name="builderVari"]:checked'); if(variSel){ const idx=Number(variSel.value); if(vari[idx]) base+=Number(vari[idx].price_delta||0); }
    let addonTotal=0; const addonSels=document.querySelectorAll('input[name="builderAddon"]:checked'); addonSels.forEach(el=>{ const idx=Number(el.value); if(addons[idx]) addonTotal+=Number(addons[idx].price||0); });
    const qty=window._builderQty||1; const total=(base+addonTotal)*qty;
    document.getElementById('builderSummary').textContent=`${vari[ variSel?Number(variSel.value):0 ]?.name||'Biasa'} + ${addonSels.length} addon`;
    document.getElementById('builderTotal').textContent='Rp '+total.toLocaleString();
    window._builderCurrentTotal=total; window._builderCurrentBase=base; window._builderCurrentAddon=addonTotal;
  }catch(e){}
};


// BADGE NAV KERANJANG - FIX counter jumlah order tidak tampil
window._updateCartBadge = function(){
  try{
    let count=0;
    try{ 
      const s=cartStore.getState(); 
      count=(s.items||[]).reduce((a,b)=>a+Number(b.qty||0),0);
      if(!count){
        const raw=localStorage.getItem('ojol_cart_v2_food');
        if(raw){ const parsed=JSON.parse(raw); count=(parsed.items||[]).reduce((a,b)=>a+Number(b.qty||0),0); }
      }
    }catch(e){
      const raw=localStorage.getItem('ojol_cart_v2_food');
      if(raw){ const parsed=JSON.parse(raw); count=(parsed.items||[]).reduce((a,b)=>a+Number(b.qty||0),0); }
    }
    // Update semua kemungkinan selector badge
    const selectors=['#cartBadge','#cartCount','#navCartBadge','.cart-badge','[data-cart-count]','#bottomNavCartBadge','span.cart-count'];
    selectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.textContent=count>0?count:'';
        el.style.display=count>0?'inline-flex':'none';
        if(count>0){ el.style.background='#ef4444'; el.style.color='white'; el.style.borderRadius='99px'; el.style.padding='2px 6px'; el.style.fontSize='10px'; el.style.fontWeight='800'; }
      });
    });
    // Update cart icon dengan angka di title
    const cartLinks=document.querySelectorAll('a[href*="/store/cart"], a[href*="#/store/cart"]');
    cartLinks.forEach(a=>{
      let badge=a.querySelector('.badge');
      if(!badge && count>0){
        badge=document.createElement('span');
        badge.className='badge cart-badge';
        badge.style.cssText='background:#ef4444;color:white;border-radius:99px;padding:2px 6px;font-size:10px;font-weight:800;margin-left:6px';
        a.appendChild(badge);
      }
      if(badge){ badge.textContent=count>0?count:''; badge.style.display=count>0?'inline-flex':'none'; }
    });
    // Dispatch custom event untuk listener lain
    window.dispatchEvent(new CustomEvent('cart_updated',{detail:{count}}));
    return count;
  }catch(e){ console.error('badge error',e); return 0; }
};

// Auto update badge saat load
setTimeout(()=>window._updateCartBadge(),500);
window.addEventListener('hashchange',()=>setTimeout(()=>window._updateCartBadge(),300));


// INIT
(function(){
  function tryLoad(){ if(location.hash&&location.hash.indexOf('/store/cart')!==-1){ setTimeout(()=>{ try{ window._loadNearbyDriversForCart(); }catch(e){} },900); } }
  window.addEventListener('hashchange',tryLoad); setTimeout(tryLoad,1200);
  window.addEventListener('food_dest_updated',()=>{ setTimeout(()=>window._loadNearbyDriversForCart(),600); });
  document.addEventListener('click',e=>{
    if(e.target&&e.target.id==='btnRefreshDrivers') window._loadNearbyDriversForCart();
    if(e.target&&e.target.id==='btnCheckoutBroadcast') window._checkoutFood();
    const btn=e.target.closest?e.target.closest('.btn-choose-driver'):null; if(btn&&btn.getAttribute('data-driver-id')) window._checkoutFoodDirect(btn.getAttribute('data-driver-id'));
    // btnPickDest removed - hanya pakai Lokasi Saya
    if(e.target.closest&&e.target.closest('#btnUseMyLocation')){ e.preventDefault(); window._useMyLocation&&window._useMyLocation(); }
    if(e.target.closest&&e.target.closest('#builderQtyMinus')){ window._builderQty=Math.max(1,(window._builderQty||1)-1); document.getElementById('builderQty').textContent=window._builderQty; window._updateBuilderTotal(); }
    if(e.target.closest&&e.target.closest('#builderQtyPlus')){ window._builderQty=(window._builderQty||1)+1; document.getElementById('builderQty').textContent=window._builderQty; window._updateBuilderTotal(); }
    if(e.target.closest&&e.target.closest('#builderAddBtn')){
      try{
        const p=window._currentBuilderProduct; if(!p) return;
        let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
        let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
        const variSel=document.querySelector('input[name="builderVari"]:checked'); const variIdx=variSel?Number(variSel.value):0;
        const addonSels=document.querySelectorAll('input[name="builderAddon"]:checked'); const selectedAddons=[]; addonSels.forEach(el=>{ const idx=Number(el.value); if(addons[idx]) selectedAddons.push(addons[idx]); });
        const qty=window._builderQty||1;
        const cartItem={ product_id:p.id, id:p.id, name:p.name+(vari[variIdx]?.name&&vari[variIdx].name!=='Biasa'?' - '+vari[variIdx].name:''), harga: (Number(p.harga||0)+Number(vari[variIdx]?.price_delta||0)+selectedAddons.reduce((a,b)=>a+Number(b.price||0),0)), qty, variants:vari[variIdx], addons:selectedAddons, cartKey: p.id+'_'+variIdx+'_'+selectedAddons.map(a=>a.name).join('_')+'_'+Date.now() };
        try{ cartStore._actions.addItem(cartItem); window._updateCartBadge(); }catch(e){ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=raw?JSON.parse(raw):{items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}; state.items.push(cartItem); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); }
        window._closeMenuBuilder(); window._updateCartBadge(); alert('Ditambahkan ke keranjang'); location.hash='#/store/cart';
      }catch(e){ alert(e.message); }
    }
  });
  document.addEventListener('change',e=>{ if(e.target.name==='builderVari'||e.target.name==='builderAddon'){ window._updateBuilderTotal(); } });
})();

window._pickDestMap=function(){ if(window.openMapPicker) window.openMapPicker(); else alert('Peta picker belum ready'); };
window._useMyLocation=function(){ navigator.geolocation.getCurrentPosition(pos=>{ const lat=pos.coords.latitude; const lng=pos.coords.longitude; window.dispatchEvent(new CustomEvent('food_dest_updated',{detail:{lat,lng,text:'Lokasi saya'}})); }); };
window._cartQty=function(key,qty){ try{ cartStore._actions.updateQty(key,qty); location.reload(); }catch(e){ try{ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=JSON.parse(raw); state.items=state.items.map(it=>{ if((it.cartKey||it.product_id||it.id)===key) it.qty=qty; return it; }).filter(it=>it.qty>0); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); window._updateCartBadge(); location.reload(); }catch(err){} } };
window._removeCartItem=function(key){ try{ cartStore._actions.removeItem(key); location.reload(); }catch(e){ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=JSON.parse(raw); state.items=state.items.filter(it=>(it.cartKey||it.product_id||it.id)!==key); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); window._updateCartBadge(); location.reload(); } };

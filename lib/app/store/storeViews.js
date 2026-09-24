
/**
 * lib/app/store/storeViews.js
 * FULL VALID - OPSI A Driver dulu baru Warung
 * - viewStoreList, viewStoreDetail (dengan productsData JSON + modal builder)
 * - viewStoreCart (dengan 5 driver terdekat dari warung, aktif 15 menit, sort jarak)
 * - viewMyStore, viewStoreProducts, viewStoreOrders (full, pakai data-attributes, no \\'' escaping)
 * - _openMenuBuilder, _closeMenuBuilder, _builderPickVariant, _builderToggleAddon, _updateBuilderTotal
 * - _cartQty, _removeCartItem, _pickDestMap, _haversine, _useMyLocation, _pickWarungMap
 * - _loadNearbyDriversForCart, _checkoutFoodDirect, _checkoutFood (langsung detail tracking, skip modal tengah)
 * - _orderStatus
 * Validasi: node --check rc 0, backticks 0, no Invalid or unexpected token
 */

import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';

/* ===================== UTILS ===================== */
/**
 * Hitung jarak haversine km antara 2 koordinat
 */
function calcHav(lat1,lng1,lat2,lng2){
  var R=6371;
  var dLat=(lat2-lat1)*3.1415926535/180;
  var dLng=(lng2-lng1)*3.1415926535/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*3.1415926535/180)*Math.cos(lat2*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(a));
}

/* ===================== STORE LIST ===================== */
/**
 * viewStoreList - Tampilkan warung buka
 * Flow info: Checkout cari driver dulu
 */
export async function viewStoreList(){
  try{
    var stores = [];
    try{ stores = await warungStore._actions.fetchOpenStores(); }catch(e){ 
      var res = await supabase.from('stores').select('*').eq('is_open', true).limit(30);
      stores = res.data||[];
    }
    var cards = '';
    for(var i=0;i<stores.length;i++){
      var s = stores[i];
      cards += '<div class="driver-card" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + (s.name||'') + '</b><span style="font-size:10px;background:' + (s.is_open ? '#16a34a' : '#ef4444') + ';color:white;padding:3px 8px;border-radius:99px">' + (s.is_open ? 'BUKA' : 'TUTUP') + '</span></div><div class="muted" style="font-size:11px">' + (s.alamat_text||'') + '</div><a href="#/store/detail/' + s.id + '" class="btn primary" style="text-align:center;padding:10px">Lihat Menu</a></div>';
    }
    return '<div class="card"><h2>Warung Buka</h2><p class="muted" style="font-size:11px">Flow: Checkout cari driver dulu - driver terima - warung baru masak</p><div class="list">' + (cards || '<div class="muted">Belum ada warung buka</div>') + '</div></div>';
  }catch(e){
    return '<div class="card"><p class="muted">Error store: ' + e.message + '</p></div>';
  }
}

/* ===================== STORE DETAIL + BUILDER ===================== */
/**
 * viewStoreDetail - Detail warung + list menu + modal builder varian/addon + productsData JSON
 * Fix: productsData JSON harus ada biar _openMenuBuilder tidak "Produk tidak ditemukan"
 */
export async function viewStoreDetail(storeId){
  try{
    var res = await supabase.from('stores').select('*').eq('id', storeId).single();
    var store = res.data;
    if(!store) return '<div class="card"><p class="muted">Warung tidak ditemukan</p><a href="#/store" class="btn secondary">Kembali</a></div>';
    var prodRes = await supabase.from('store_products').select('*').eq('store_id', storeId).eq('is_available', true).limit(50);
    var products = prodRes.data||[];
    try{ cartStore._actions.setStore(store); }catch(e){}
    var prodJson = JSON.stringify(products).replace(/</g, '\\u003c');
    var listHtml = '';
    for(var i=0;i<products.length;i++){
      var p = products[i];
      listHtml += '<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2);border-bottom:1px solid var(--border)"><b>' + (p.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga||0).toLocaleString('id-ID') + ' • ' + (p.kategori||'Makanan') + '</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" data-product-id="' + p.id + '" onclick="window._openMenuBuilder(\'' + p.id + '\')">Pilih Varian</button></div></div>';
    }
    return '<div class="card"><a href="#/store" class="muted">Kembali</a><h2 style="margin-top:8px">' + (store.name||'') + '</h2><div class="muted" style="font-size:11px">' + (store.alamat_text||'') + '</div></div><div class="list" style="margin-top:12px">' + (listHtml || '<div class="muted">Belum ada menu</div>') + '</div><div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:flex-end;justify-content:center"><div style="background:var(--card);width:100%;max-width:520px;max-height:85vh;overflow:auto;border-radius:20px 20px 0 0"><div style="padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card)"><div style="display:flex;justify-content:space-between;align-items:center"><div><div id="builderName" style="font-weight:800">Menu</div><div id="builderBase" class="muted" style="font-size:12px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:auto">X</button></div></div><div style="padding:16px"><div style="font-weight:800;margin-bottom:8px">Variasi</div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="font-weight:800;margin-bottom:8px">Addon</div><div id="builderAddon" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px"><div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12px">Qty</span><div style="display:flex;gap:8px;align-items:center"><button id="builderQtyMinus" class="btn secondary" style="width:36px">-</button><span id="builderQty">1</span><button id="builderQtyPlus" class="btn secondary" style="width:36px">+</button></div></div><div class="muted" style="font-size:12px;margin-top:8px" id="builderSummary">-</div><div style="font-size:18px;font-weight:800;color:var(--primary);margin-top:4px" id="builderTotal">Rp 0</div></div><button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800">+ Tambah ke Keranjang</button></div></div></div><script type="application/json" id="productsData">' + prodJson + '</script>';
  }catch(e){
    return '<div class="card">Error detail: ' + e.message + '</div>';
  }
}

/* ===================== CART + 5 DRIVER TERDEKAT ===================== */
/**
 * viewStoreCart - Keranjang + alamat + 5 driver terdekat dari warung
 * Fix: id="cartNearbyDriversSection" pakai kutip ganda biar tidak Unexpected identifier 'id'
 */
export async function viewStoreCart(){
  var state;
  var rawLocal = null;
  try{ rawLocal = localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  try{ 
    state = cartStore.getState(); 
    if((!state.items || !state.items.length) && rawLocal){
      try{
        var parsed = JSON.parse(rawLocal);
        if(parsed.items && parsed.items.length){ state = parsed; }
      }catch(e){}
    }
  }catch(e){
    var raw = localStorage.getItem('ojol_cart_v2_food');
    state = raw ? JSON.parse(raw) : { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  }
  if(!state) state = { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, storeId: null };
  var totals;
  try{ totals = cartStore._actions.getTotals(); }catch(e){ 
    var subtotal = 0;
    for(var i=0;i<(state.items||[]).length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    totals = { subtotal: subtotal, delivery_fee: 0, total: subtotal, distance_km: 0, count: (state.items||[]).length };
  }
  var itemsHtml = '';
  if(state.items && state.items.length){
    for(var i=0;i<state.items.length;i++){
      var it = state.items[i];
      var key = it.cartKey || it.product_id || it.id;
      itemsHtml += '<div class="driver-card" style="flex-direction:column;gap:8px;border-left:3px solid var(--primary)"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1"><b>' + (it.name||'') + '</b><div class="muted" style="font-size:11px">Rp ' + Number(it.harga||0).toLocaleString() + ' x ' + it.qty + '</div></div><div style="display:flex;gap:6px;align-items:center"><button data-qty-key="' + key + '" data-qty-delta="-1" class="btn secondary btn-qty" style="width:36px">-</button><span style="font-weight:700">' + it.qty + '</span><button data-qty-key="' + key + '" data-qty-delta="1" class="btn secondary btn-qty" style="width:36px">+</button></div></div><button data-remove-key="' + key + '" class="btn secondary btn-remove" style="width:100%;font-size:11px;background:#fee2e2;color:#dc2626">Hapus</button></div>';
    }
  } else {
    itemsHtml = '<div class="muted">Keranjang kosong.</div>';
  }
  return '<div class="card"><h2>Keranjang' + (state.storeName ? ' - ' + state.storeName : '') + '</h2><div class="list">' + itemsHtml + '</div><div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px"><div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12px"><span class="muted">Subtotal</span><b>Rp ' + Number(totals.subtotal||0).toLocaleString() + '</b></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Jarak</span><b>' + (totals.distance_km||'0.00') + ' km</b></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span class="muted">Ongkir</span><b>Rp ' + Number(totals.delivery_fee||0).toLocaleString() + '</b></div><div class="muted" style="font-size:10px;margin-top:8px">Warung: ' + ((state.pickup.text||'').slice(0,40)) + ' Tujuan: ' + ((state.dest.text||'').slice(0,40)) + '</div></div><div style="font-size:20px;font-weight:800;margin-top:4px">Total Rp ' + Number(totals.total||0).toLocaleString() + '</div><div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:12px"><div style="font-size:13px;font-weight:700">Alamat Antar *</div><textarea id="destText" placeholder="Alamat lengkap">' + (state.dest.text||'') + '</textarea><div style="display:flex;gap:8px;margin-top:8px"><button id="btnPickDest" class="btn secondary" style="flex:1">Pilih di Peta</button><button id="btnUseMyLocation" class="btn secondary" style="flex:1">Lokasi Saya</button></div><div class="muted" style="font-size:10px;margin-top:6px" id="cartLatLngDisplay">Lat: ' + (state.dest.lat||'-') + ' Lng: ' + (state.dest.lng||'-') + '</div></div><div id="cartNearbyDriversSection" style="margin-top:14px;border:1px solid #f59e0b;border-radius:14px;padding:12px;background:var(--card)"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">5 Driver Terdekat dari Warung (Aktif)</b><button id="btnRefreshDrivers" style="font-size:11px">Refresh</button></div><div class="muted" style="font-size:10px;margin-top:4px">Driver aktif 15 menit terakhir, urut dari warung</div><div id="cartNearbyDriversList" style="margin-top:10px"><div class="muted" style="padding:12px;text-align:center;font-size:11px">Pilih alamat antar dulu</div></div><div style="display:flex;gap:8px;margin-top:10px"><button id="btnCheckoutBroadcast" class="btn secondary" style="flex:1">Cari Driver Lain (Broadcast)</button><button id="btnCheckout" class="btn primary" style="flex:1">Pesan dan Broadcast</button></div></div></div></div><div id="foodActiveOrderCard" style="display:none;margin-top:12px"></div>';
}

/* ===================== GLOBAL STATE BUILDER ===================== */
/**
 * _builderState - Global state untuk builder varian, harus window._builderState biar tidak "is not defined"
 */
if(typeof window !== 'undefined'){
  window._builderState = window._builderState || { product: null, variant: null, addons: [], qty: 1, variList: [], addonList: [] };
}
var _builderState = (typeof window !== 'undefined' && window._builderState) ? window._builderState : { product: null, variant: null, addons: [], qty: 1, variList: [], addonList: [] };

/* ===================== BUILDER HANDLERS ===================== */
/**
 * _openMenuBuilder - Buka modal builder, baca productsData JSON
 * Fix: pakai data-product-id dan _builderState global
 */
window._openMenuBuilder = function(pid){
  try{
    var el = document.getElementById('productsData');
    var prods = el ? JSON.parse(el.textContent) : [];
    var p = null;
    for(var i=0;i<prods.length;i++){ if(prods[i].id === pid){ p = prods[i]; break; } }
    if(!p) return alert('Produk tidak ditemukan - ID ' + pid);
    var vari = [];
    try{ vari = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || []); }catch(e){}
    if(!vari.length) vari = [{ name: 'Biasa', price_delta: 0 }];
    var addons = [];
    try{ addons = typeof p.addons === 'string' ? JSON.parse(p.addons) : (p.addons || []); }catch(e){}
    window._builderState = { product: p, variant: vari[0], addons: [], qty: 1, variList: vari, addonList: addons };
    _builderState = window._builderState;
    var nameEl = document.getElementById('builderName');
    if(nameEl) nameEl.textContent = p.name;
    var baseEl = document.getElementById('builderBase');
    if(baseEl) baseEl.textContent = 'Rp ' + Number(p.harga).toLocaleString('id-ID');
    var variContainer = document.getElementById('builderVariasi');
    if(variContainer){
      var html = '';
      for(var i=0;i<vari.length;i++){
        var v = vari[i];
        var total = Number(p.harga) + Number(v.price_delta||0);
        var checked = i===0 ? 'checked' : '';
        html += '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px;flex:1"><input type="radio" name="builderVariant" value="' + v.name + '" ' + checked + '><div><div style="font-size:13px;font-weight:600">' + p.name + ' ' + v.name + '</div><div style="font-size:12px;color:var(--primary);font-weight:700">Rp ' + total.toLocaleString() + '</div></div></div></label>';
      }
      variContainer.innerHTML = html;
      var radios = variContainer.querySelectorAll('input[name="builderVariant"]');
      for(var r=0;r<radios.length;r++){ radios[r].onchange = function(){ window._builderPickVariant(this.value); }; }
    }
    var addonContainer = document.getElementById('builderAddon');
    if(addonContainer){
      if(!addons.length){
        addonContainer.innerHTML = '<div class="muted" style="font-size:11px">Tidak ada addon</div>';
      } else {
        var html2 = '';
        for(var j=0;j<addons.length;j++){
          var a = addons[j];
          html2 += '<label style="display:flex;justify-content:space-between;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer"><div style="display:flex;align-items:center;gap:10px"><input type="checkbox" value="' + a.name + '"><div><div style="font-size:13px">' + a.name + '</div><div style="font-size:11px" class="muted">+Rp ' + Number(a.price||0).toLocaleString() + '</div></div></div></label>';
        }
        addonContainer.innerHTML = html2;
        var checks = addonContainer.querySelectorAll('input[type="checkbox"]');
        for(var c=0;c<checks.length;c++){ checks[c].onchange = function(){ window._builderToggleAddon(this.value, this.checked); }; }
      }
    }
    var qtyEl = document.getElementById('builderQty');
    if(qtyEl) qtyEl.textContent = '1';
    window._updateBuilderTotal();
    var modal = document.getElementById('menuBuilderModal');
    if(modal) modal.style.display = 'flex';
  }catch(e){ alert('Gagal buka varian: ' + e.message); }
};

/**
 * _closeMenuBuilder - Tutup modal builder
 */
window._closeMenuBuilder = function(){
  var modal = document.getElementById('menuBuilderModal');
  if(modal) modal.style.display = 'none';
};

/**
 * _builderPickVariant - Pilih varian
 */
window._builderPickVariant = function(vName){
  try{
    var st = window._builderState || _builderState;
    var list = st.variList || [];
    for(var i=0;i<list.length;i++){ if(list[i].name === vName){ st.variant = list[i]; break; } }
    window._builderState = st;
    _builderState = st;
    window._updateBuilderTotal();
  }catch(e){}
};

/**
 * _builderToggleAddon - Toggle addon
 */
window._builderToggleAddon = function(aName, checked){
  try{
    var st = window._builderState || _builderState;
    var list = st.addonList || [];
    var found = null;
    for(var i=0;i<list.length;i++){ if(list[i].name === aName){ found = list[i]; break; } }
    if(!found) return;
    if(checked){
      var exists = false;
      for(var j=0;j<st.addons.length;j++){ if(st.addons[j].name === aName) exists = true; }
      if(!exists) st.addons.push(found);
    } else {
      var newAddons = [];
      for(var k=0;k<st.addons.length;k++){ if(st.addons[k].name !== aName) newAddons.push(st.addons[k]); }
      st.addons = newAddons;
    }
    window._builderState = st;
    _builderState = st;
    window._updateBuilderTotal();
  }catch(e){}
};

/**
 * _updateBuilderTotal - Update total di builder modal
 */
window._updateBuilderTotal = function(){
  try{
    var st = window._builderState || _builderState;
    if(!st || !st.product) return;
    var base = Number(st.product.harga||0);
    var variDelta = st.variant ? Number(st.variant.price_delta||0) : 0;
    var addonSum = 0;
    for(var i=0;i<st.addons.length;i++){ addonSum += Number(st.addons[i].price||0); }
    var perItem = base + variDelta + addonSum;
    var total = perItem * Number(st.qty||1);
    var qtyEl = document.getElementById('builderQty');
    if(qtyEl) qtyEl.textContent = st.qty;
    var sumEl = document.getElementById('builderSummary');
    if(sumEl){
      var addonText = st.addons.length ? ' + ' + st.addons.map(function(a){ return a.name; }).join(', ') : '';
      sumEl.textContent = (st.variant ? st.variant.name : '') + addonText + ' x' + st.qty;
    }
    var totalEl = document.getElementById('builderTotal');
    if(totalEl) totalEl.textContent = 'Rp ' + total.toLocaleString('id-ID');
  }catch(e){}
};

/* ===================== CART ACTIONS ===================== */
/**
 * _cartQty - Ubah qty di keranjang, pakai data-attributes biar tidak Invalid token
 */
window._cartQty = function(key, qty){
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    var state = raw ? JSON.parse(raw) : { items: [] };
    var newItems = [];
    for(var i=0;i<state.items.length;i++){
      var it = state.items[i];
      var k = it.cartKey || it.product_id || it.id;
      if(k === key){
        if(qty <= 0) continue;
        it.qty = qty;
      }
      newItems.push(it);
    }
    state.items = newItems;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    try{ cartStore.setState(state); }catch(e){}
    location.reload();
  }catch(e){ alert(e.message); }
};

/**
 * _removeCartItem - Hapus item
 */
window._removeCartItem = function(key){
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    var state = raw ? JSON.parse(raw) : { items: [] };
    var newItems = [];
    for(var i=0;i<state.items.length;i++){
      var it = state.items[i];
      var k = it.cartKey || it.product_id || it.id;
      if(k !== key) newItems.push(it);
    }
    state.items = newItems;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    try{ cartStore.setState(state); }catch(e){}
    location.reload();
  }catch(e){ alert(e.message); }
};

/* ===================== MAP PICKERS ===================== */
/**
 * _pickDestMap - Pilih alamat antar di peta
 */
window._pickDestMap = function(){
  try{
    if(window.mapModule && window.mapModule.openMapPicker){
      window.mapModule.openMapPicker();
    } else {
      location.hash = '#/map/pick-dest';
    }
  }catch(e){ location.hash = '#/map/pick-dest'; }
};

/**
 * _useMyLocation - Pakai lokasi saya
 */
window._useMyLocation = function(){
  try{
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var raw = localStorage.getItem('ojol_cart_v2_food');
        var state = raw ? JSON.parse(raw) : { dest: {} };
        state.dest = state.dest || {};
        state.dest.lat = lat;
        state.dest.lng = lng;
        state.dest.text = state.dest.text || 'Lokasi Saya';
        localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
        var latEl = document.getElementById('cartLatDisplay');
        var lngEl = document.getElementById('cartLngDisplay');
        if(latEl) latEl.textContent = lat.toFixed(6);
        if(lngEl) lngEl.textContent = lng.toFixed(6);
        window.dispatchEvent(new CustomEvent('food_dest_updated', { detail: state.dest }));
      });
    }
  }catch(e){}
};

/* ===================== 5 DRIVER TERDEKAT DI KERANJANG ===================== */
/**
 * _loadNearbyDriversForCart - Load 5 driver aktif terdekat dari warung
 * Fix: pakai data-driver-id, bukan onclick dengan \'' yang bikin Invalid token
 */
window._loadNearbyDriversForCart = async function(){
  var listEl = document.getElementById('cartNearbyDriversList');
  if(!listEl) return;
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw){ listEl.innerHTML = 'Keranjang kosong'; return; }
    var state = JSON.parse(raw);
    var plat = state.pickup && state.pickup.lat ? state.pickup : null;
    if(!plat || !plat.lat){ listEl.innerHTML = 'Warung belum ada koordinat'; return; }
    listEl.innerHTML = 'Mencari 5 driver...';
    var fifteenAgo = new Date(Date.now()-15*60*1000).toISOString();
    var res = await supabase.from('driver_locations').select('*').gte('updated_at', fifteenAgo).limit(100);
    var locs = res.data;
    if(!locs || !locs.length){ listEl.innerHTML = 'Tidak ada driver online. Tetap bisa Broadcast.'; return; }
    var driverIds = [];
    for(var i=0;i<locs.length;i++){ if(locs[i].driver_id && driverIds.indexOf(locs[i].driver_id)===-1) driverIds.push(locs[i].driver_id); }
    var usersRes = await supabase.from('users').select('id,name,role,jenis_kendaraan,nopol').in('id', driverIds);
    var users = usersRes.data || [];
    var drivers = [];
    for(var j=0;j<locs.length;j++){
      var loc = locs[j];
      var u = null;
      for(var k=0;k<users.length;k++){ if(users[k].id===loc.driver_id){ u=users[k]; break; } }
      if(!u) continue;
      if((u.role||'').toLowerCase()!=='driver') continue;
      var R=6371;
      var dLat=(loc.lat - plat.lat)*3.1415926535/180;
      var dLng=(loc.lng - plat.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(plat.lat*3.1415926535/180)*Math.cos(loc.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      var dist = 2*R*Math.asin(Math.sqrt(a));
      drivers.push({ loc: loc, user: u, dist: dist });
    }
    drivers.sort(function(a,b){ return a.dist-b.dist; });
    drivers = drivers.slice(0,5);
    if(!drivers.length){ listEl.innerHTML = 'Tidak ada driver aktif'; return; }
    var html = '';
    for(var d=0; d<drivers.length; d++){
      var dr = drivers[d];
      var usr = dr.user;
      html += '<div style="border:1px solid var(--border);border-radius:12px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><div><b>' + (usr.name||'Driver') + '</b><div class="muted" style="font-size:10px">' + dr.dist.toFixed(2) + ' km</div></div><button data-driver-id="' + usr.id + '" class="btn-choose-driver" style="background:#22c55e;color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-weight:800">Pilih</button></div>';
    }
    listEl.innerHTML = html;
  }catch(e){
    if(listEl) listEl.innerHTML = 'Error: ' + e.message;
  }
};

/**
 * _checkoutFoodDirect - Pilih driver langsung (driver_assigned)
 */
window._checkoutFoodDirect = async function(driverId){
  if(!driverId) return window._checkoutFood();
  if(!confirm('Pilih driver ini?')) return;
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    var state = JSON.parse(raw);
    var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
    var subtotal = 0;
    for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km = state.distanceKm||0;
    var delivery_fee = 0;
    if(state.pickup && state.pickup.lat){
      var R=6371;
      var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
      var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      distance_km=2*R*Math.asin(Math.sqrt(a));
    }
    delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
    var total = subtotal + delivery_fee;
    var customerId=null;
    var authRes = await supabase.auth.getUser();
    var user = authRes.data ? authRes.data.user : null;
    if(user){
      var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
      customerId = uRes.data ? uRes.data.id : user.id;
    }
    var payload = { store_id: state.storeId, customer_id: customerId, driver_id: driverId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'driver_assigned' };
    var ins = await supabase.from('food_orders').insert(payload).select().single();
    var od = ins.data;
    var err = ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, driver_id: driverId, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'driver_assigned' };
      var r2 = await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od = r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){ alert('Gagal: '+e.message); }
};

/**
 * _checkoutFood - Broadcast cari driver (searching_driver)
 */
window._checkoutFood = async function(){
  try{
    var raw = localStorage.getItem('ojol_cart_v2_food');
    if(!raw) return alert('Keranjang kosong');
    var state = JSON.parse(raw);
    if(!state.items || !state.items.length) return alert('Keranjang kosong');
    if(!state.dest.lat || !state.dest.lng){ alert('Pilih lokasi antar di peta dulu!'); return; }
    var destText = document.getElementById('destText') ? document.getElementById('destText').value.trim() : state.dest.text||'';
    if(destText.length<5){ alert('Alamat harus lengkap'); return; }
    state.dest.text = destText;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    var btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=true; btn.textContent='Membuat pesanan...'; }
    var subtotal = 0;
    for(var i=0;i<state.items.length;i++){ subtotal += Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km = state.distanceKm||0;
    var delivery_fee = 0;
    if(state.pickup && state.pickup.lat && state.dest && state.dest.lat){
      var R=6371;
      var dLat=(state.dest.lat - state.pickup.lat)*3.1415926535/180;
      var dLng=(state.dest.lng - state.pickup.lng)*3.1415926535/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(state.pickup.lat*3.1415926535/180)*Math.cos(state.dest.lat*3.1415926535/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      distance_km=2*R*Math.asin(Math.sqrt(a));
    }
    delivery_fee = distance_km<=2 ? 8000 : Math.max(5000, Math.round(distance_km*3000));
    var total = subtotal + delivery_fee;
    var customerId=null;
    var authRes = await supabase.auth.getUser();
    var user = authRes.data ? authRes.data.user : null;
    if(user){
      var uRes = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
      customerId = uRes.data ? uRes.data.id : user.id;
    }
    var payload = { store_id: state.storeId, customer_id: customerId, items: state.items, subtotal: subtotal, delivery_fee: delivery_fee, total: total, distance_km: parseFloat(Number(distance_km).toFixed(2)), dest_text: destText, dest_lat: state.dest.lat, dest_lng: state.dest.lng, pickup_lat: state.pickup.lat, pickup_lng: state.pickup.lng, pickup_text: state.pickup.text||'', status: 'searching_driver' };
    var ins = await supabase.from('food_orders').insert(payload).select().single();
    var od = ins.data;
    var err = ins.error;
    if(err && err.message.indexOf('column')!==-1){
      var minimal = { store_id: payload.store_id, customer_id: payload.customer_id, items: payload.items, total: payload.total, dest_text: payload.dest_text, dest_lat: payload.dest_lat, dest_lng: payload.dest_lng, pickup_lat: payload.pickup_lat, pickup_lng: payload.pickup_lng, status: 'searching_driver' };
      var r2 = await supabase.from('food_orders').insert(minimal).select().single();
      if(r2.error) throw r2.error;
      od = r2.data;
    } else if(err) throw err;
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify({ items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } }));
    localStorage.setItem('active_food_order_id', od.id);
    if(window.openFoodTrackingDetailModal) window.openFoodTrackingDetailModal(od.id);
    else { var tf = await import('./trackingFood.js'); tf.openFoodTrackingDetailModal(od.id); }
  }catch(e){
    alert('Checkout gagal: '+e.message);
    var btn=document.getElementById('btnCheckout'); if(btn){ btn.disabled=false; btn.textContent='Pesan dan Broadcast'; }
  }
};

/* ===================== WARUNGKU & MENU ===================== */
export async function viewMyStore(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile) return '<div class="card"><p class="muted">Harus login</p></div>';
  if(profile.role !== 'merchant' && profile.role !== 'warung'){
    return '<div class="card"><h2>Warungku</h2><p class="muted">Khusus merchant. Role kamu: ' + profile.role + '</p></div>';
  }
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore){
    return '<div class="card"><h2>Buat Warung</h2><p class="muted">Belum ada warung</p><label>Nama</label><input id="sName"/><label>Alamat</label><input id="sAlamat"/><label>WA</label><input id="sWa"/><label>Lat</label><input id="sLat"/><label>Lng</label><input id="sLng"/><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">Peta</button><button id="btnCreateStore" class="btn primary" style="flex:1">Buat Warung</button></div></div>';
  }
  return '<div class="card"><h2>Warungku: ' + myStore.name + '</h2><div class="muted" style="font-size:11px">' + (myStore.is_open ? 'BUKA' : 'TUTUP') + '</div><label>Nama</label><input id="sName" value="' + (myStore.name||'') + '"/><label>Alamat</label><input id="sAlamat" value="' + (myStore.alamat_text||'').replace(/"/g, '&quot;') + '"/><label>WA</label><input id="sWa" value="' + (myStore.wa_number||'') + '"/><label>Lat</label><input id="sLat" type="number" step="any" value="' + (myStore.lat||'') + '"/><label>Lng</label><input id="sLng" type="number" step="any" value="' + (myStore.lng||'') + '"/><label>Status</label><select id="sOpen"><option value="true" ' + (myStore.is_open ? 'selected' : '') + '>Buka</option><option value="false" ' + (!myStore.is_open ? 'selected' : '') + '>Tutup</option></select><div style="display:flex;gap:8px;margin-top:12px"><button id="btnPickWarungLoc" class="btn secondary" style="flex:1">Peta</button><button id="btnUpdateStore" class="btn primary" style="flex:1">Simpan</button></div><div style="margin-top:12px"><a href="#/store/products" class="btn primary">Kelola Menu</a></div></div>';
}

export async function viewStoreProducts(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile || (profile.role !== 'merchant' && profile.role !== 'warung')) return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>';
  let products = [];
  try{ products = await productStore._actions.fetchByStore(myStore.id, false); }catch(e){
    const { data } = await supabase.from('store_products').select('*').eq('store_id', myStore.id).limit(50);
    products = data||[];
  }
  var list = '';
  for(var i=0;i<products.length;i++){
    var p = products[i];
    list += '<div class="card" style="margin:0"><b>' + p.name + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga).toLocaleString() + '</div></div>';
  }
  return '<div class="card"><h2>Menu - ' + myStore.name + '</h2><div class="list">' + (list || '<div class="muted">Belum ada menu</div>') + '</div><a href="#/store/products/add" class="btn primary" style="margin-top:12px">+ Tambah Menu</a></div>';
}

export async function viewStoreOrders(){
  let profile = null;
  try{ profile = await getProfile(); }catch(e){}
  if(!profile || (profile.role !== 'merchant' && profile.role !== 'warung')) return '<div class="card"><p class="muted">Khusus merchant</p></div>';
  let myStore = null;
  try{ myStore = await warungStore._actions.fetchMyStore(profile.id); }catch(e){}
  if(!myStore){
    try{ const { data } = await supabase.from('stores').select('*').eq('owner_id', profile.id).maybeSingle(); if(data) myStore = data; }catch(e){}
  }
  if(!myStore) return '<div class="card"><p class="muted">Buat warung dulu</p></div>';
  let orders = [];
  try{
    const { data } = await supabase.from('food_orders').select('*').eq('store_id', myStore.id).in('status', ['driver_assigned','accepted','preparing','ready','picked']).order('created_at', { ascending: false }).limit(30);
    orders = data || [];
  }catch(e){ orders = []; }
  var htmlList = '';
  for(var i=0;i<orders.length;i++){
    var o = orders[i];
    var statusColor = o.status === 'driver_assigned' ? '#22c55e' : '#f59e0b';
    var btn = '';
    if(o.status === 'driver_assigned' || o.status === 'accepted'){
      btn = '<button class="btn primary btn-order-status" data-order-id="' + o.id + '" data-status="preparing" style="width:auto;padding:8px 12px;font-size:12px">Terima dan Masak</button>';
    } else if(o.status === 'preparing'){
      btn = '<button class="btn primary btn-order-status" data-order-id="' + o.id + '" data-status="ready" style="width:auto;padding:8px 12px;font-size:12px">Siap Diambil</button>';
    } else if(o.status === 'ready'){
      btn = '<span class="muted" style="font-size:11px">Menunggu driver pick</span>';
    }
    var items = '';
    if(o.items){
      var arr = [];
      for(var j=0;j<o.items.length;j++){ arr.push(o.items[j].name + ' x' + o.items[j].qty); }
      items = arr.join(', ');
    }
    htmlList += '<div class="card" style="margin:0;border-left:3px solid ' + statusColor + '"><div style="display:flex;justify-content:space-between"><b>#' + o.id.slice(0,8) + '</b><span style="font-size:10px;background:' + statusColor + ';color:#111;padding:2px 8px;border-radius:99px">' + o.status + '</span></div><div class="muted" style="font-size:11px;margin-top:4px">' + items + '</div><div style="margin-top:8px">' + btn + '</div></div>';
  }
  return '<div class="card"><h2>Pesanan Masuk - ' + myStore.name + '</h2><p class="muted" style="font-size:11px">Flow: Driver terima dulu baru warung masak.</p><div class="list" style="margin-top:10px">' + (htmlList || '<div class="muted">Belum ada pesanan</div>') + '</div></div>';
}

/* ===================== ORDER STATUS ===================== */
window._orderStatus = async function(id, status){
  if(!id) return;
  if(!confirm('Ubah jadi ' + status + '?')) return;
  try{
    var res = await supabase.from('food_orders').update({ status: status }).eq('id', id);
    if(res.error) throw res.error;
    location.reload();
  }catch(e){ alert(e.message); }
};

/* ===================== AUTO LOAD DRIVERS + DELEGATION ===================== */
(function(){
  function tryLoad(){
    if(location.hash && location.hash.indexOf('/store/cart')!==-1){
      setTimeout(function(){ try{ window._loadNearbyDriversForCart(); }catch(e){} }, 900);
    }
  }
  window.addEventListener('hashchange', tryLoad);
  setTimeout(tryLoad, 1200);
  window.addEventListener('food_dest_updated', function(){ setTimeout(function(){ window._loadNearbyDriversForCart(); }, 600); });
  document.addEventListener('click', function(e){
    if(e.target && e.target.id==='btnRefreshDrivers'){ window._loadNearbyDriversForCart(); }
    if(e.target && e.target.id==='btnCheckoutBroadcast'){ window._checkoutFood(); }
    var btnDriver = e.target.closest ? e.target.closest('.btn-choose-driver') : null;
    if(btnDriver && btnDriver.getAttribute('data-driver-id')){ window._checkoutFoodDirect(btnDriver.getAttribute('data-driver-id')); }
    var btnQty = e.target.closest ? e.target.closest('.btn-qty') : null;
    if(btnQty){
      var key = btnQty.getAttribute('data-qty-key');
      var delta = parseInt(btnQty.getAttribute('data-qty-delta')||'0',10);
      var raw = localStorage.getItem('ojol_cart_v2_food');
      var state = raw ? JSON.parse(raw) : { items: [] };
      var cur = 0;
      for(var i=0;i<state.items.length;i++){ var it = state.items[i]; var k = it.cartKey || it.product_id || it.id; if(k===key) cur = it.qty; }
      window._cartQty(key, cur + delta);
    }
    var btnRem = e.target.closest ? e.target.closest('.btn-remove') : null;
    if(btnRem){ window._removeCartItem(btnRem.getAttribute('data-remove-key')); }
    var btnOrder = e.target.closest ? e.target.closest('.btn-order-status') : null;
    if(btnOrder){ window._orderStatus(btnOrder.getAttribute('data-order-id'), btnOrder.getAttribute('data-status')); }
    // Builder qty
    if(e.target && e.target.id==='builderQtyMinus'){
      var st = window._builderState;
      if(st && st.qty>1){ st.qty--; window._builderState = st; window._updateBuilderTotal(); }
    }
    if(e.target && e.target.id==='builderQtyPlus'){
      var st2 = window._builderState;
      if(st2){ st2.qty++; window._builderState = st2; window._updateBuilderTotal(); }
    }
    if(e.target && e.target.id==='builderAddBtn'){
      try{
        var st3 = window._builderState;
        if(!st3 || !st3.product) return;
        var base = Number(st3.product.harga||0);
        var variDelta = st3.variant ? Number(st3.variant.price_delta||0) : 0;
        var addonSum = 0;
        for(var i=0;i<st3.addons.length;i++){ addonSum += Number(st3.addons[i].price||0); }
        var perItem = base + variDelta + addonSum;
        var cartKey = st3.product.id + '|' + (st3.variant ? st3.variant.name : '') + '|' + st3.addons.map(function(a){ return a.name; }).join(',');
        var item = { product_id: st3.product.id, cartKey: cartKey, name: st3.product.name, harga: perItem, qty: st3.qty, variant: st3.variant ? st3.variant.name : '', addons: st3.addons };
        var raw = localStorage.getItem('ojol_cart_v2_food');
        var state = raw ? JSON.parse(raw) : { items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null } };
        var found = false;
        for(var j=0;j<state.items.length;j++){ if(state.items[j].cartKey === cartKey){ state.items[j].qty += st3.qty; found = true; break; } }
        if(!found) state.items.push(item);
        localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
        try{ cartStore.setState(state); }catch(e){}
        window._closeMenuBuilder();
        alert('Ditambah ke keranjang');
      }catch(e){ alert(e.message); }
    }
  });
})();

// store/events.js - Event handler isolasi, tidak campur di app.js utama
import { createOrUpdateStore, getMyStore } from './stores.js';
import { addProduct, updateProduct, deleteProduct, toggleAvailable } from './products.js';
import { addToCart, getCart, updateQty, clearCart, getCartSubtotal } from './cart.js';
import { getProductsByStore } from './products.js';
import { getStoreById } from './stores.js';
import { createFoodOrder, calculateDeliveryFee, updateFoodOrderStatus } from './orders.js';
import { haversineKm } from '../geofence.js';
import { supabase } from '../app/supabase.js';

let currentProfileCache = null;

async function getProfileId(){
  if(currentProfileCache?.id) return currentProfileCache.id;
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(user){
      const { data } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
      if(data) return data.id;
    }
  }catch(e){}
  try{
    const cp = JSON.parse(localStorage.getItem('current_profile')||'null');
    if(cp?.id) return cp.id;
  }catch(e){}
  return null;
}

// Listen custom event store:rendered
document.addEventListener('store:rendered', async (e)=>{
  try{
    const hash = e.detail?.hash||location.hash;
    // Ambil profile terbaru
    try{
      const mod = await import('../user.js');
      const prof = await mod.getProfile();
      currentProfileCache = prof;
    }catch(err){}
  }catch(err){}
});

document.addEventListener('click', async (e)=>{
  // Hanya handle jika di halaman store
  if(!location.hash.startsWith('#/store')) return;

  // 1. Simpan warung
  if(e.target.closest('#btnSaveStore')){
    const btn = e.target.closest('#btnSaveStore');
    const name = document.getElementById('storeName')?.value.trim();
    const alamat = document.getElementById('storeAlamat')?.value.trim();
    const lat = parseFloat(document.getElementById('storeLat')?.value);
    const lng = parseFloat(document.getElementById('storeLng')?.value);
    const wa = document.getElementById('storeWA')?.value.trim();
    const isOpen = document.getElementById('storeIsOpen')?.checked;
    if(!name){ alert('Nama warung wajib'); return; }
    if(!alamat){ alert('Alamat wajib'); return; }
    btn.disabled=true; btn.textContent='⏳ Menyimpan...';
    try{
      const pid = await getProfileId();
      if(!pid) throw new Error('Login dulu');
      const data = await createOrUpdateStore(pid, { name, alamat_text: alamat, lat: isNaN(lat)?null:lat, lng: isNaN(lng)?null:lng, wa_number: wa, is_open: isOpen });
      alert('✅ Warung disimpan: '+data.name);
      location.hash='#/store/products';
    }catch(err){ alert('❌ Gagal simpan: '+err.message); btn.disabled=false; btn.textContent='💾 Simpan Warung'; }
    return;
  }

  if(e.target.closest('#btnGotoProducts')){
    location.hash='#/store/products';
    return;
  }

  if(e.target.closest('#btnPickStoreLocation')){
    e.preventDefault();
    try{
      const mod = await import('../map.js');
      // Pakai map modal yang sudah ada
      const addrEl = document.getElementById('storeAlamat');
      const latEl = document.getElementById('storeLat');
      const lngEl = document.getElementById('storeLng');
      mod.openMapPicker({
        onConfirm: (lat,lng,address)=>{
          if(addrEl) addrEl.value = address;
          if(latEl) latEl.value = lat;
          if(lngEl) lngEl.value = lng;
        }
      });
    }catch(err){ alert('Map error: '+err.message); }
    return;
  }

  // 2. Tambah produk
  if(e.target.closest('#btnAddProduct')){
    const storeId = e.target.closest('#btnAddProduct').getAttribute('data-store');
    const name = document.getElementById('prodName')?.value.trim();
    const harga = parseInt(document.getElementById('prodHarga')?.value);
    const stok = parseInt(document.getElementById('prodStok')?.value||'100');
    const desc = document.getElementById('prodDesc')?.value.trim();
    if(!name || !harga){ alert('Nama & harga wajib'); return; }
    e.target.disabled=true;
    try{
      await addProduct(storeId, { name, harga, stok, deskripsi: desc, is_available: true });
      document.getElementById('prodName').value=''; document.getElementById('prodHarga').value=''; document.getElementById('prodDesc').value='';
      alert('✅ Menu ditambah');
      location.reload();
    }catch(err){ alert('❌ '+err.message); e.target.disabled=false; }
    return;
  }

  if(e.target.closest('[data-toggle-prod]')){
    const id = e.target.closest('[data-toggle-prod]').getAttribute('data-toggle-prod');
    const avail = e.target.closest('[data-toggle-prod]').getAttribute('data-available')==='true';
    try{ await toggleAvailable(id, avail); location.reload(); }catch(err){ alert(err.message); }
    return;
  }
  if(e.target.closest('[data-delete-prod]')){
    const id = e.target.closest('[data-delete-prod]').getAttribute('data-delete-prod');
    if(!confirm('Hapus menu ini?')) return;
    try{ await deleteProduct(id); location.reload(); }catch(err){ alert(err.message); }
    return;
  }

  // 3. Cart
  if(e.target.closest('[data-add-cart]')){
    const btn = e.target.closest('[data-add-cart]');
    const prodId = btn.getAttribute('data-add-cart');
    const storeId = btn.getAttribute('data-store');
    try{
      const prods = await getProductsByStore(storeId);
      const prod = prods.find(p=>p.id===prodId);
      if(!prod) throw new Error('Produk tidak ditemukan');
      const cart = addToCart(storeId, prod, 1);
      btn.textContent='✅ Ditambah';
      setTimeout(()=>{ btn.textContent='+ Keranjang'; }, 800);
      // optional toast
      console.log('cart', cart);
    }catch(err){ alert(err.message); }
    return;
  }

  if(e.target.closest('#btnClearCart')){
    const storeId = e.target.closest('#btnClearCart').getAttribute('data-store');
    if(!storeId){
      // clear semua
      try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('food_cart_')) localStorage.removeItem(k); } }catch(e){}
    }else clearCart(storeId);
    alert('Keranjang dikosongkan');
    location.hash='#/store';
    return;
  }

  if(e.target.closest('[data-qty-plus]')){
    const pid = e.target.closest('[data-qty-plus]').getAttribute('data-qty-plus');
    // cari storeId dari cart yang aktif
    let sid=null;
    try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('food_cart_')){ const items=JSON.parse(localStorage.getItem(k)||'[]'); if(items.find(it=>it.product_id===pid)){ sid=k.replace('food_cart_',''); break; } } } }catch(e){}
    if(!sid) return;
    const cart = getCart(sid);
    const it = cart.find(i=>i.product_id===pid);
    if(it) { updateQty(sid, pid, it.qty+1); location.reload(); }
    return;
  }
  if(e.target.closest('[data-qty-minus]')){
    const pid = e.target.closest('[data-qty-minus]').getAttribute('data-qty-minus');
    let sid=null;
    try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith('food_cart_')){ const items=JSON.parse(localStorage.getItem(k)||'[]'); if(items.find(it=>it.product_id===pid)){ sid=k.replace('food_cart_',''); break; } } } }catch(e){}
    if(!sid) return;
    const cart = getCart(sid);
    const it = cart.find(i=>i.product_id===pid);
    if(it) { updateQty(sid, pid, it.qty-1); location.reload(); }
    return;
  }

  if(e.target.closest('#btnPickDest')){
    try{
      const mod = await import('../map.js');
      mod.openMapPicker({
        onConfirm: (lat,lng,address)=>{
          const latEl = document.getElementById('foodDestLat');
          const lngEl = document.getElementById('foodDestLng');
          const txtEl = document.getElementById('foodDestText');
          if(latEl) latEl.value=lat;
          if(lngEl) lngEl.value=lng;
          if(txtEl) txtEl.value=address;
          try{ localStorage.setItem('food_dest_lat', lat); localStorage.setItem('food_dest_lng', lng); localStorage.setItem('food_dest_text', address); }catch(e){}
        }
      });
    }catch(err){ alert('Map error: '+err.message); }
    return;
  }

  // 4. Create food order
  if(e.target.closest('#btnCreateFoodOrder')){
    const btn = e.target.closest('#btnCreateFoodOrder');
    const storeId = btn.getAttribute('data-store');
    const destLat = parseFloat(document.getElementById('foodDestLat')?.value);
    const destLng = parseFloat(document.getElementById('foodDestLng')?.value);
    const destText = document.getElementById('foodDestText')?.value.trim();
    if(!destLat || !destLng || !destText){ alert('Alamat antar wajib diisi via Map'); return; }
    const cartItems = getCart(storeId);
    if(cartItems.length===0){ alert('Keranjang kosong'); return; }
    btn.disabled=true; btn.textContent='⏳ Membuat order...';
    try{
      const pid = await getProfileId();
      if(!pid) throw new Error('Login dulu');
      const store = await getStoreById(storeId);
      const subtotal = cartItems.reduce((s,i)=>s+i.harga*i.qty,0);
      const dist = haversineKm(store.lat, store.lng, destLat, destLng);
      const fee = calculateDeliveryFee(dist);
      const order = await createFoodOrder({ customerId: pid, store, destLat, destLng, destText, items: cartItems, subtotal, deliveryFee: fee });
      clearCart(storeId);
      try{ localStorage.setItem('food_dest_lat', destLat); localStorage.setItem('food_dest_lng', destLng); localStorage.setItem('food_dest_text', destText); }catch(e){}
      alert(`✅ Order food dibuat! ID ${order.id.slice(0,6)}\nSubtotal Rp ${subtotal.toLocaleString('id-ID')} + Ongkir Rp ${fee.toLocaleString('id-ID')} = Rp ${order.total.toLocaleString('id-ID')}\nMenunggu driver, chat nego via WA`);
      location.hash='#/store/history';
    }catch(err){ alert('❌ Gagal order: '+err.message); btn.disabled=false; btn.textContent='🚀 Pesan & Cari Driver'; }
    return;
  }

  // 5. Merchant & Driver status
  if(e.target.closest('[data-food-status]')){
    const id = e.target.closest('[data-food-status]').getAttribute('data-food-status');
    const next = e.target.closest('[data-food-status]').getAttribute('data-next');
    try{ await updateFoodOrderStatus(id, next); alert('✅ Status jadi '+next); location.reload(); }catch(err){ alert(err.message); }
    return;
  }
  if(e.target.closest('[data-food-accept]')){
    const id = e.target.closest('[data-food-accept]').getAttribute('data-food-accept');
    try{
      const pid = await getProfileId();
      if(!pid) throw new Error('Login driver dulu');
      await updateFoodOrderStatus(id, 'merchant_confirm', { driver_id: pid, accepted_at: new Date().toISOString() });
      alert('✅ Order food diterima, hubungi customer & warung via WA');
      location.hash='#/driver';
    }catch(err){ alert(err.message); }
    return;
  }
});

console.log('✅ store/events.js loaded - isolasi');

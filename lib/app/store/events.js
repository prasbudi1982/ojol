// store/events.js - Event handler isolasi, tidak campur di app.js utama
import { createOrUpdateStore, getMyStore } from './stores.js';
import { addProduct, updateProduct, deleteProduct, toggleAvailable } from './products.js';
import { addToCart, getCart, updateQty, clearCart, getCartSubtotal } from './cart.js';
import { getProductsByStore } from './products.js';
import { getStoreById } from './stores.js';
import { createFoodOrder, calculateDeliveryFee, updateFoodOrderStatus } from './orders.js';
import { haversineKm } from '../geofence.js';
import { supabase } from '../supabase.js';

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

  // 2. Tambah / Edit / Hapus - MERCHANT CRUD LENGKAP
  if(e.target.closest('#btnAddProduct')){
    const storeId = e.target.closest('#btnAddProduct').getAttribute('data-store');
    const name = document.getElementById('prodName')?.value.trim();
    const harga = parseInt(document.getElementById('prodHarga')?.value);
    const stok = parseInt(document.getElementById('prodStok')?.value||'100');
    const kategori = document.getElementById('prodKategori')?.value||'Makanan';
    const isAvail = document.getElementById('prodAvail')?.checked!==false;
    const desc = document.getElementById('prodDesc')?.value.trim();
    if(!name || !harga){ alert('Nama & harga wajib'); return; }
    e.target.disabled=true;
    try{
      await addProduct(storeId, { name, harga, stok, kategori, deskripsi: desc, is_available: isAvail });
      document.getElementById('prodName').value=''; document.getElementById('prodHarga').value=''; document.getElementById('prodDesc').value='';
      alert('✅ Menu ditambah');
      location.reload();
    }catch(err){ alert('❌ '+err.message); e.target.disabled=false; }
    return;
  }

  // EDIT MODAL OPEN
  if(e.target.closest('[data-edit-prod]')){
    const btn = e.target.closest('[data-edit-prod]');
    const id = btn.getAttribute('data-edit-prod');
    const name = btn.getAttribute('data-name')||'';
    const harga = btn.getAttribute('data-harga')||'';
    const stok = btn.getAttribute('data-stok')||'0';
    const kategori = btn.getAttribute('data-kategori')||'Makanan';
    const desc = btn.getAttribute('data-desc')||'';
    const avail = btn.getAttribute('data-available')==='true';
    const modal = document.getElementById('editProdModal');
    if(!modal){ alert('Modal tidak ditemukan'); return; }
    document.getElementById('editProdId').value=id;
    document.getElementById('editProdName').value=name;
    document.getElementById('editProdHarga').value=harga;
    document.getElementById('editProdStok').value=stok;
    document.getElementById('editProdKategori').value=kategori;
    document.getElementById('editProdDesc').value=desc;
    document.getElementById('editProdAvail').checked=avail;
    modal.style.display='flex';
    return;
  }
  if(e.target.closest('#btnCloseEditProd') || e.target.closest('#btnCancelEditProd')){
    const modal = document.getElementById('editProdModal');
    if(modal) modal.style.display='none';
    return;
  }
  if(e.target.closest('#btnSaveEditProd')){
    const id = document.getElementById('editProdId')?.value;
    const name = document.getElementById('editProdName')?.value.trim();
    const harga = parseInt(document.getElementById('editProdHarga')?.value);
    const stok = parseInt(document.getElementById('editProdStok')?.value||'0');
    const kategori = document.getElementById('editProdKategori')?.value||'Makanan';
    const desc = document.getElementById('editProdDesc')?.value.trim();
    const isAvail = document.getElementById('editProdAvail')?.checked;
    if(!id || !name || !harga){ alert('Nama & harga wajib'); return; }
    e.target.disabled=true; e.target.textContent='⏳ Menyimpan...';
    try{
      await updateProduct(id, { name, harga, stok, kategori, deskripsi: desc, is_available: isAvail });
      alert('✅ Menu diupdate');
      document.getElementById('editProdModal').style.display='none';
      location.reload();
    }catch(err){ alert('❌ '+err.message); e.target.disabled=false; e.target.textContent='💾 Simpan Perubahan'; }
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
    if(!confirm('⚠️ Hapus menu ini permanen?')) return;
    try{ await deleteProduct(id); alert('🗑️ Menu dihapus'); location.reload(); }catch(err){ alert(err.message); }
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


  // ===== 6. RATING WARUNG - BARU =====
  if(e.target.closest('[data-rate-store]')){
    const storeId = e.target.closest('[data-rate-store]').getAttribute('data-rate-store');
    const foodOrderId = e.target.closest('[data-rate-store]').getAttribute('data-food-order');
    const storeName = e.target.closest('[data-rate-store]').getAttribute('data-store-name')||'Warung';
    // buka modal rating warung
    try{
      const mod = await import('./ratings.js');
      // buat modal sederhana reuse style rating driver
      let modal = document.getElementById('storeRatingModal');
      if(modal) modal.remove();
      const theme = { primary: '#16a34a' };
      try{ const s = JSON.parse(localStorage.getItem('app_settings')||'{}'); theme.primary = s.primaryColor||'#16a34a'; }catch(e){}
      const div = document.createElement('div');
      div.id='storeRatingModal';
      div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.8);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
      div.innerHTML = `
        <div style="background:var(--card);border-radius:20px;max-width:380px;width:100%;overflow:hidden;border:2px solid ${theme.primary};box-shadow:0 20px 50px rgba(0,0,0,0.4)">
          <div style="background:${theme.primary};color:white;padding:18px;text-align:center">
            <div style="font-size:36px">⭐</div>
            <div style="font-weight:800;font-size:16px;margin-top:6px">Rating Warung</div>
            <div style="font-size:12px;opacity:0.9;margin-top:2px">${storeName}</div>
          </div>
          <div style="padding:20px;text-align:center">
            <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Gimana rasa & pelayanan warung?</div>
            <div id="storeRatingStars" style="display:flex;justify-content:center;gap:8px;margin:12px 0">
              ${[1,2,3,4,5].map(n=>`<button data-store-star="${n}" style="font-size:36px;background:none;border:none;cursor:pointer;transition:transform 0.1s">⭐</button>`).join('')}
            </div>
            <div id="storeRatingLabel" style="font-size:13px;font-weight:700;height:18px">Tap bintang</div>
            <textarea id="storeRatingComment" placeholder="Komentar (opsional)..." style="width:100%;margin-top:12px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2);font-size:12px;height:70px;resize:none"></textarea>
            <div id="storeRatingStatus" style="font-size:11px;margin-top:8px;min-height:14px;color:var(--muted)"></div>
            <div style="display:flex;gap:8px;margin-top:16px">
              <button id="btnSubmitStoreRating" style="flex:1;background:${theme.primary};color:white;border:none;padding:12px;border-radius:12px;font-weight:800">Kirim Rating Warung</button>
              <button id="btnCloseStoreRating" style="background:var(--card);border:1px solid var(--border);padding:12px 16px;border-radius:12px;font-weight:700">Tutup</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(div);
      let selected = 0;
      const labels = {1:'Buruk 😠',2:'Kurang 😕',3:'Cukup 🙂',4:'Baik 😊',5:'Luar Biasa 🤩'};
      div.querySelectorAll('[data-store-star]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          selected = parseInt(btn.dataset.storeStar);
          div.querySelectorAll('[data-store-star]').forEach((b,i)=>{
            b.style.opacity = (i+1)<=selected ? '1' : '0.3';
            b.style.transform = (i+1)<=selected ? 'scale(1.2)' : 'scale(1)';
          });
          document.getElementById('storeRatingLabel').textContent = labels[selected]||'';
        });
      });
      document.getElementById('btnCloseStoreRating').onclick = ()=> div.remove();
      document.getElementById('btnSubmitStoreRating').onclick = async ()=>{
        if(selected===0){ document.getElementById('storeRatingStatus').textContent='❌ Pilih bintang dulu'; return; }
        document.getElementById('storeRatingStatus').textContent='⏳ Mengirim...';
        try{
          const comment = document.getElementById('storeRatingComment').value.trim();
          let customerId = null;
          try{
            const { supabase } = await import('../supabase.js');
            const { data: { user } } = await supabase.auth.getUser();
            if(user){
              const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
              if(u) customerId = u.id;
            }
            if(!customerId){
              const cp = JSON.parse(localStorage.getItem('current_profile')||'null');
              if(cp) customerId = cp.id;
            }
          }catch(e){}
          await mod.createStoreRating({ storeId, customerId, foodOrderId, rating: selected, comment });
          document.getElementById('storeRatingStatus').textContent='✅ Makasih rating warungnya!';
          setTimeout(()=>{ div.remove(); location.reload(); }, 800);
        }catch(err){
          document.getElementById('storeRatingStatus').textContent='❌ '+err.message;
        }
      };
      div.addEventListener('click', (e)=>{ if(e.target===div) div.remove(); });
    }catch(err){ alert('Gagal buka rating: '+err.message); }
    return;
  }

  // Load rating badges for store list
  if(e.target.closest('a[href^="#/store/"]') || location.hash==='#/store' || location.hash.startsWith('#/store/')){
    // lazy load rating badges after render
    setTimeout(async ()=>{
      try{
        const mod = await import('./ratings.js');
        document.querySelectorAll('[data-store-rating]').forEach(async el=>{
          const sid = el.getAttribute('data-store-rating');
          if(!sid) return;
          try{
            const stats = await mod.getStoreRatingStats(sid);
            if(stats.count>0) el.innerHTML = `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:6px;font-weight:700">⭐ ${stats.avg} (${stats.count})</span>`;
            else el.innerHTML = '<span style="color:var(--muted)">☆ baru</span>';
          }catch(e){}
        });
        document.querySelectorAll('[data-store-rating-detail]').forEach(async el=>{
          const sid = el.getAttribute('data-store-rating-detail');
          if(!sid) return;
          try{
            const stats = await mod.getStoreRatingStats(sid);
            if(stats.count>0) el.innerHTML = `<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:8px;font-weight:700;font-size:11px">${stats.stars} ${stats.avg} (${stats.count} rating)</span>`;
            else el.innerHTML = '<span style="font-size:10px;color:var(--muted)">☆ Belum ada rating</span>';
          }catch(e){}
        });
      }catch(e){}
    }, 300);
  }

console.log('✅ store/events.js loaded - isolasi');

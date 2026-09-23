
// lib/app/storeViews.js - MINIMAL FIX - Pasti ke-load - Tanpa import berat
import { supabase } from '../supabase.js';

export async function viewStoreList(){
  try{
    const { data: stores } = await supabase.from('stores').select('*').eq('is_open', true).limit(20);
    const list = stores || [];
    const cards = list.map(s => {
      return '<div class="card" style="margin:8px 0"><b>' + (s.name||'Warung') + '</b><div class="muted" style="font-size:11px">' + (s.alamat_text||'') + '</div><a href="#/store/detail/' + s.id + '" class="btn primary" style="margin-top:8px;display:block;text-align:center">Lihat Menu</a></div>';
    }).join('');
    return '<div class="card"><h2>Warung Buka</h2><p class="muted" style="font-size:11px">Flow: driver terima dulu baru warung masak</p><div class="list">' + (cards || '<div class="muted">Belum ada warung</div>') + '</div></div>';
  }catch(e){
    return '<div class="card"><h2>Warung Buka</h2><p class="muted">Error: ' + e.message + '</p><button onclick="location.reload()" class="btn primary">Reload</button></div>';
  }
}

export async function viewStoreDetail(storeId){
  try{
    const { data: store } = await supabase.from('stores').select('*').eq('id', storeId).single();
    if(!store) return '<div class="card">Warung tidak ditemukan</div>';
    const { data: products } = await supabase.from('store_products').select('*').eq('store_id', storeId).eq('is_available', true).limit(30);
    const list = products || [];
    let html = '<div class="card"><a href="#/store" class="muted">← Kembali</a><h2>🏪 ' + (store.name||'') + '</h2><div class="muted" style="font-size:11px">' + (store.alamat_text||'') + '</div></div>';
    html += '<div class="list" style="margin-top:12px">';
    for(let p of list){
      html += '<div class="card" style="margin:0"><b>' + p.name + '</b><div class="muted" style="font-size:11px">Rp ' + Number(p.harga||0).toLocaleString() + '</div><button class="btn primary" style="width:100%;margin-top:8px" onclick="window._addToCartMinimal(\'' + p.id + '\')">+ Keranjang</button></div>';
    }
    if(!list.length) html += '<div class="card"><div class="muted">Belum ada menu</div></div>';
    html += '</div>';
    return html;
  }catch(e){
    return '<div class="card">Error detail: ' + e.message + '</div>';
  }
}

export async function viewStoreCart(){
  try{
    const raw = localStorage.getItem('ojol_cart_v2_food');
    const s = raw ? JSON.parse(raw) : { items: [], storeName: '', dest: { text: '', lat: null, lng: null }, pickup: {}, total: 0 };
    const items = s.items || [];
    let itemsHtml = '';
    for(let it of items){
      itemsHtml += '<div class="card" style="margin:4px 0"><b>' + it.name + '</b> x' + it.qty + ' - Rp ' + Number(it.harga*it.qty).toLocaleString() + '</div>';
    }
    if(!items.length) itemsHtml = '<div class="muted">Keranjang kosong</div>';
    return '<div class="card"><h2>🛒 Keranjang ' + (s.storeName||'') + '</h2><div class="list">' + itemsHtml + '</div><div style="margin-top:12px"><label>Alamat Antar</label><textarea id="destText">' + (s.dest.text||'') + '</textarea><button id="btnPickDest" class="btn secondary" style="margin-top:8px">📍 Pilih di Peta</button><button id="btnCheckout" class="btn primary" style="margin-top:12px">✅ Checkout - Cari Driver Terdekat (5 driver)</button></div><div id="foodActiveOrderCard" style="display:none;margin-top:12px"></div></div>';
  }catch(e){
    return '<div class="card">Error cart: ' + e.message + '</div>';
  }
}

export async function viewMyStore(){
  return '<div class="card"><h2>🏪 Warungku</h2><p class="muted">Versi minimal - buat warung via Supabase langsung</p><div id="myStoreMinimal">Loading...</div></div>';
}

export async function viewStoreProducts(){
  return '<div class="card"><h2>📦 Menu</h2><p class="muted">Versi minimal - kelola via Supabase</p></div>';
}

export async function viewStoreOrders(){
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return '<div class="card">Harus login</div>';
    const { data: store } = await supabase.from('stores').select('*').eq('owner_id', user.id).maybeSingle();
    if(!store) return '<div class="card">Belum ada warung</div>';
    const { data: orders } = await supabase.from('food_orders').select('*').eq('store_id', store.id).in('status', ['driver_assigned','accepted','preparing','ready','picked']).order('created_at', { ascending: false }).limit(20);
    const list = orders || [];
    let html = '<div class="card"><h2>🔔 Pesanan Masuk - ' + store.name + '</h2><p class="muted" style="font-size:11px">Hanya muncul setelah driver terima (driver_assigned)</p><div class="list" style="margin-top:10px">';
    for(let o of list){
      html += '<div class="card" style="border-left:3px solid #22c55e"><b>#' + o.id.slice(0,8) + '</b> - ' + o.status + '<div class="muted" style="font-size:11px">Rp ' + Number(o.total||0).toLocaleString() + ' • ' + (o.dest_text||'') + '</div></div>';
    }
    if(!list.length) html += '<div class="card" style="text-align:center"><div style="font-size:32px">🍳</div><div class="muted">Belum ada pesanan dengan driver</div><div class="muted" style="font-size:10px">Pesanan searching_driver tidak tampil di warung - sesuai flow driver dulu</div></div>';
    html += '</div></div>';
    return html;
  }catch(e){
    return '<div class="card">Error orders: ' + e.message + '</div>';
  }
}

if(typeof window !== 'undefined'){
  window._addToCartMinimal = async function(pid){
    try{
      const { data: p } = await supabase.from('store_products').select('*').eq('id', pid).single();
      if(!p) return alert('Produk tidak ditemukan');
      const raw = localStorage.getItem('ojol_cart_v2_food');
      let s = raw ? JSON.parse(raw) : { items: [], storeName: '', storeId: null, pickup: {}, dest: { text: '', lat: null, lng: null }, distanceKm: 0 };
      const exist = s.items.find(i => i.product_id === pid);
      if(exist) exist.qty += 1;
      else s.items.push({ product_id: p.id, name: p.name, harga: Number(p.harga), qty: 1 });
      if(!s.storeId){
        const { data: st } = await supabase.from('stores').select('*').eq('id', p.store_id).single();
        if(st){ s.storeName = st.name; s.storeId = st.id; s.pickup = { lat: st.lat, lng: st.lng, text: st.alamat_text||st.name }; }
      }
      localStorage.setItem('ojol_cart_v2_food', JSON.stringify(s));
      alert('Ditambah: ' + p.name);
      const b = document.getElementById('cartBadge'); if(b){ const c = s.items.reduce((a,b)=>a+b.qty,0); b.textContent=c; b.style.display=c>0?'block':'none'; }
    }catch(e){ alert(e.message); }
  };
}

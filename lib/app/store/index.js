// store/index.js - Router isolasi untuk food module - FINAL + History Penjualan + Rating Warung
import { getMyStore, getNearbyStores, getStoreById, viewMyStoreForm, viewStoreList, viewStoreDetail } from './stores.js';
import { getProductsByStore, viewMyProducts } from './products.js';
import { getCart, viewCart } from './cart.js';
import { viewCheckout, getFoodOrdersForCustomer } from './orders.js';
import { getFoodTheme } from './config.js';
import { getStoreRatingStats, getStoreRatings, getMerchantSalesHistory, viewMerchantSales, viewCustomerFoodHistory } from './ratings.js';

export async function router(hash, currentProfile){
  const theme = getFoodTheme();
  const path = hash.replace('#/store','')||'/';
  
  // /store -> list warung buka
  if(path==='/' || path==='' ){
    const stores = await getNearbyStores(30);
    return viewStoreList(stores);
  }
  // /store/my -> warung saya
  if(path==='/my'){
    if(!currentProfile) return '<div class="card">Login dulu</div>';
    const myStore = await getMyStore(currentProfile.id);
    return viewMyStoreForm(myStore, currentProfile);
  }
  // /store/products -> kelola menu
  if(path==='/products'){
    if(!currentProfile) return '<div class="card">Login dulu</div>';
    const myStore = await getMyStore(currentProfile.id);
    if(!myStore) return `<div class="card">Belum punya warung <a href="#/store/my">Daftar</a></div>`;
    const products = await getProductsByStore(myStore.id);
    return viewMyProducts(myStore, products);
  }
  // /store/sales -> history penjualan merchant (warung sendiri)
  if(path==='/sales' || path==='/history'){
    if(!currentProfile) return '<div class="card">Login dulu</div>';
    const myStore = await getMyStore(currentProfile.id);
    if(!myStore) return `<div class="card">Belum punya warung. <a href="#/store/my">Daftar jadi warung</a></div>`;
    const orders = await getMerchantSalesHistory(myStore.id, { limit: 100 });
    return viewMerchantSales(orders, myStore);
  }
  // /store/history/:storeId -> history penjualan merchant untuk store tertentu
  if(path.startsWith('/history/')){
    const storeId = path.replace('/history/','').split('/')[0];
    try{
      const store = await getStoreById(storeId);
      const orders = await getMerchantSalesHistory(storeId, { limit: 100 });
      return viewMerchantSales(orders, store);
    }catch(e){
      return `<div class="card">Gagal load history: ${e.message}</div>`;
    }
  }
  // /store/ratings/:storeId -> list rating warung
  if(path.startsWith('/ratings/')){
    const storeId = path.replace('/ratings/','').split('/')[0];
    try{
      const store = await getStoreById(storeId);
      const stats = await getStoreRatingStats(storeId);
      const ratings = await getStoreRatings(storeId, 50);
      return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
        <div style="display:flex;gap:8px;align-items:center"><a href="#/store/${storeId}" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹</a><div><div style="font-weight:800">⭐ Rating ${store.name}</div><div style="font-size:11px;color:var(--muted)">${stats.stars} ${stats.avg} dari ${stats.count} rating</div></div></div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          ${ratings.length===0?'<div style="text-align:center;padding:20px;color:var(--muted)">Belum ada rating warung</div>':ratings.map(r=>`<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><span style="font-weight:700">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)} ${r.rating}/5</span><span style="font-size:11px;color:var(--muted)">${new Date(r.created_at).toLocaleString('id-ID')}</span></div><div style="font-size:12px;margin-top:4px">${r.comment||''}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">Customer: ${r.customer?.name||r.customer_id?.slice(0,6)} • Order: ${r.food_order_id?.slice(0,6)||'-'}</div></div>`).join('')}
        </div>
      </div>`;
    }catch(e){
      return `<div class="card">Gagal load rating: ${e.message}</div>`;
    }
  }
  // /store/my-orders -> history food customer sendiri
  if(path==='/my-orders'){
    if(!currentProfile) return '<div class="card">Login dulu</div>';
    const orders = await getFoodOrdersForCustomer(currentProfile.id, 50);
    // cek sudah rating warung belum
    try{
      const { supabase } = await import('../app/supabase.js');
      const ids = orders.map(o=>o.id);
      if(ids.length){
        const { data: rated } = await supabase.from('store_ratings').select('food_order_id, rating').in('food_order_id', ids);
        const map = {};
        (rated||[]).forEach(r=> map[r.food_order_id]=r);
        orders.forEach(o=>{
          if(map[o.id]){ o._storeRated=true; o._storeRating=map[o.id]; }
        });
      }
    }catch(e){}
    return viewCustomerFoodHistory(orders);
  }
  // /store/cart -> lihat keranjang (ambil storeId dari localStorage cart terakhir)
  if(path==='/cart'){
    let storeId = null;
    let cartItems = [];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith('food_cart_')){
          const items = JSON.parse(localStorage.getItem(k)||'[]');
          if(items.length>0){ storeId = k.replace('food_cart_',''); cartItems = items; break; }
        }
      }
    }catch(e){}
    if(!storeId) return viewCart({id:'',name:''}, []);
    const store = await getStoreById(storeId);
    return viewCart(store, cartItems);
  }
  // /store/checkout/:storeId
  if(path.startsWith('/checkout/')){
    const storeId = path.replace('/checkout/','').split('/')[0];
    const store = await getStoreById(storeId);
    const cartItems = getCart(storeId);
    const destLat = localStorage.getItem('food_dest_lat')||localStorage.getItem('dest_lat')||'';
    const destLng = localStorage.getItem('food_dest_lng')||localStorage.getItem('dest_lng')||'';
    const destText = localStorage.getItem('food_dest_text')||localStorage.getItem('dest_text')||'';
    return viewCheckout(store, cartItems, destLat, destLng, destText);
  }
  // /store/:id -> detail warung + menu
  const match = path.match(/^\/([^\/]+)$/);
  if(match){
    const storeId = match[1];
    try{
      const store = await getStoreById(storeId);
      const products = await getProductsByStore(storeId);
      return viewStoreDetail(store, products.filter(p=>p.is_available!==false));
    }catch(e){
      return `<div class="card">Warung tidak ditemukan: ${e.message}</div>`;
    }
  }
  return `<div class="card">🍔 Store module - route ${path} tidak dikenal<br/><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
    <a href="#/store/my" class="btn secondary">🏪 Warungku</a>
    <a href="#/store/sales" class="btn secondary">📊 Penjualan</a>
    <a href="#/store/my-orders" class="btn secondary">🍔 History Food Saya</a>
  </div></div>`;
}

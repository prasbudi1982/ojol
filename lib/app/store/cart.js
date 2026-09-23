// store/cart.js - Keranjang isolasi per warung
import { getFoodTheme } from './config.js';

function cartKey(storeId){ return `food_cart_${storeId}`; }

export function getCart(storeId){
  try{ return JSON.parse(localStorage.getItem(cartKey(storeId))||'[]'); }catch(e){ return []; }
}

export function saveCart(storeId, items){
  localStorage.setItem(cartKey(storeId), JSON.stringify(items));
}

export function addToCart(storeId, product, qty=1){
  const cart = getCart(storeId);
  const idx = cart.findIndex(i=>i.product_id===product.id);
  if(idx>=0){ cart[idx].qty += qty; }
  else{ cart.push({ product_id: product.id, name: product.name, harga: Number(product.harga), qty, catatan: '' }); }
  saveCart(storeId, cart);
  return cart;
}

export function updateQty(storeId, productId, qty){
  let cart = getCart(storeId);
  if(qty<=0) cart = cart.filter(i=>i.product_id!==productId);
  else{ const it = cart.find(i=>i.product_id===productId); if(it) it.qty = qty; }
  saveCart(storeId, cart);
  return cart;
}

export function clearCart(storeId){
  localStorage.removeItem(cartKey(storeId));
}

export function getCartSubtotal(storeId){
  return getCart(storeId).reduce((s,i)=>s + (i.harga*i.qty), 0);
}

// ===== UI per modul =====
export function viewCart(store, cartItems){
  const theme = getFoodTheme();
  const subtotal = cartItems.reduce((s,i)=>s + i.harga*i.qty, 0);
  if(cartItems.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">🛒</div><div style="font-weight:700;margin-top:8px">Keranjang Kosong</div><div style="font-size:11px;color:var(--muted)">Tambah menu dari warung dulu</div><a href="#/store" style="margin-top:12px;display:inline-block;background:${theme.primary};color:white;padding:10px 16px;border-radius:10px;text-decoration:none">🍔 Cari Warung</a></div>`;
  }
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center"><a href="#/store/${store.id}" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹ Menu</a><span style="font-weight:800">🛒 Keranjang - ${store.name}</span><button id="btnClearCart" data-store="${store.id}" style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:6px 10px;border-radius:8px;font-size:11px">Kosongkan</button></div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
      ${cartItems.map(it=>`
        <div style="border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:center">
          <div style="flex:1"><div style="font-weight:700">${it.name}</div><div style="font-size:11px;color:var(--muted)">Rp ${it.harga.toLocaleString('id-ID')} x ${it.qty} = Rp ${(it.harga*it.qty).toLocaleString('id-ID')}</div><input data-note="${it.product_id}" placeholder="Catatan: pedas, dll" value="${it.catatan||''}" style="margin-top:6px;width:100%;padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--card2);font-size:11px"></div>
          <div style="display:flex;flex-direction:column;gap:4px"><button data-qty-plus="${it.product_id}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card2)">+</button><span style="text-align:center;font-weight:700">${it.qty}</span><button data-qty-minus="${it.product_id}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card2)">-</button></div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:16px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="display:flex;justify-content:space-between"><span>Subtotal Makanan</span><b>Rp ${subtotal.toLocaleString('id-ID')}</b></div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">Ongkir dihitung di checkout berdasarkan jarak warung -> alamat antar</div>
      <a href="#/store/checkout/${store.id}" style="margin-top:10px;display:block;background:${theme.primary};color:white;padding:12px;border-radius:12px;text-align:center;font-weight:800;text-decoration:none">➡️ Checkout & Hitung Ongkir</a>
    </div>
  </div>`;
}

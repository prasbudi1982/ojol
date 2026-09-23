// store/orders.js - Order Food isolasi + UI per modul
import { supabase } from '../app/supabase.js';
import { isTableMissingError } from './db.js';
import { TARIF_FOOD, FOOD_STATUS, getFoodTheme } from './config.js';
import { hitungTarif } from '../config.js';
import { haversineKm } from '../geofence.js';
import { getCart, getCartSubtotal, clearCart } from './cart.js';

export function calculateDeliveryFee(distanceKm){
  // Reuse hitungTarif dari config.js utama biar konsisten sama ojol
  try{ return hitungTarif(distanceKm, 'motor', 'oneway', 0); }
  catch(e){ 
    let cost = TARIF_FOOD.base + (distanceKm * TARIF_FOOD.perKm);
    cost = Math.max(cost, TARIF_FOOD.min);
    return Math.round(cost/500)*500;
  }
}

export async function createFoodOrder({ customerId, store, destLat, destLng, destText, items, subtotal, deliveryFee }){
  const total = subtotal + deliveryFee;
  const distanceKm = haversineKm(store.lat, store.lng, destLat, destLng);
  const payload = {
    customer_id: customerId,
    store_id: store.id,
    items: items,
    subtotal: subtotal,
    delivery_fee: deliveryFee,
    total: total,
    distance_km: distanceKm,
    pickup_lat: store.lat,
    pickup_lng: store.lng,
    pickup_text: store.alamat_text||store.name,
    dest_lat: destLat,
    dest_lng: destLng,
    dest_text: destText,
    status: 'searching_driver',
    created_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('food_orders').insert(payload).select().single();
  if(error) throw error;
  return data;
}

export async function getFoodOrdersForCustomer(customerId, limit=20){
  try{
    const { data, error } = await supabase.from('food_orders').select('*, store:store_id(name, alamat_text)').eq('customer_id', customerId).order('created_at',{ascending:false}).limit(limit);
    if(error && isTableMissingError(error)) return [];
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function getFoodOrdersForStore(storeId, limit=20){
  const { data, error } = await supabase.from('food_orders').select('*, customer:customer_id(name)').eq('store_id', storeId).order('created_at',{ascending:false}).limit(limit);
  if(error && isTableMissingError(error)) return [];
  if(error) throw error;
  return data||[];
}

export async function getFoodOrdersForDriver(statuses=['searching_driver']){
  const { data, error } = await supabase.from('food_orders').select('*, store:store_id(name, alamat_text, lat, lng)').in('status', statuses).order('created_at',{ascending:false}).limit(20);
  if(error && isTableMissingError(error)) return [];
  if(error) throw error;
  return data||[];
}

export async function updateFoodOrderStatus(orderId, status, extra={}){
  const { data, error } = await supabase.from('food_orders').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', orderId).select().single();
  if(error) throw error;
  return data;
}

// ===== UI per modul =====
export function viewCheckout(store, cartItems, destLat, destLng, destText){
  const theme = getFoodTheme();
  const subtotal = cartItems.reduce((s,i)=>s+i.harga*i.qty, 0);
  let distance = 0;
  let deliveryFee = TARIF_FOOD.min;
  try{
    if(store.lat && store.lng && destLat && destLng){
      distance = haversineKm(store.lat, store.lng, destLat, destLng);
      deliveryFee = calculateDeliveryFee(distance);
    }
  }catch(e){}
  const total = subtotal + deliveryFee;
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center"><a href="#/store/cart" style="background:var(--card2);border:1px solid var(--border);padding:6px 10px;border-radius:8px;text-decoration:none;color:var(--text)">‹ Keranjang</a><span style="font-weight:800">Checkout - ${store.name}</span><span></span></div>
    
    <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="font-weight:700;font-size:13px">📍 Alamat Antar</div>
      <div style="margin-top:6px"><input id="foodDestText" value="${destText||''}" placeholder="Jl. Ngulung RT 02, Suruh" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card)"></div>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="foodDestLat" value="${destLat||''}" placeholder="Lat" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card)"><input id="foodDestLng" value="${destLng||''}" placeholder="Lng" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--card)"><button id="btnPickDest" class="btn secondary" style="padding:8px 12px;border-radius:8px">🗺️</button></div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">Tap 🗺️ untuk pick dari peta (reuse map.js ojol)</div>
    </div>

    <div style="margin-top:12px">
      <div style="font-weight:700;font-size:13px">📦 Pesanan</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        ${cartItems.map(it=>`<div style="display:flex;justify-content:space-between;font-size:12px"><span>${it.name} x${it.qty}</span><span>Rp ${(it.harga*it.qty).toLocaleString('id-ID')}</span></div>`).join('')}
      </div>
    </div>

    <div style="margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal Makanan (dari warung)</span><span>Rp ${subtotal.toLocaleString('id-ID')}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span>Jarak Warung → Antar (${distance.toFixed(2)} km)</span><span>Rp ${deliveryFee.toLocaleString('id-ID')}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)"><span>Total (Makanan + Ongkir)</span><span style="color:${theme.primary}">Rp ${total.toLocaleString('id-ID')}</span></div>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">Ongkir dihitung via hitungTarif() yang sama kayak ojol, app cuma estimasi. Chat nego via WA.</div>
      <button id="btnCreateFoodOrder" data-store="${store.id}" style="margin-top:12px;width:100%;background:${theme.primary};color:white;border:none;padding:12px;border-radius:12px;font-weight:800">🚀 Pesan & Cari Driver</button>
    </div>
  </div>`;
}

export function viewMerchantOrders(orders){
  const theme = getFoodTheme();
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:28px">📭</div><div style="font-weight:700;margin-top:8px">Belum ada order makanan</div><div style="font-size:11px;color:var(--muted)">Order customer akan muncul di sini realtime</div></div>`;
  }
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${orders.map(o=>{
      const st = FOOD_STATUS[o.status]||{label:o.status,color:'#475569'};
      return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card)">
        <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--muted)">${new Date(o.created_at).toLocaleString('id-ID')}</span><span style="background:${st.color};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${st.icon||''} ${st.label}</span></div>
        <div style="margin-top:8px;font-size:13px"><b>Customer:</b> ${o.customer?.name||o.customer_id?.slice(0,6)||'-'}<br/><b>Alamat:</b> ${o.dest_text||''}<br/><b>Items:</b> ${(o.items||[]).map(it=>`${it.name} x${it.qty}`).join(', ')}<br/><b>Total:</b> Rp ${Number(o.total||0).toLocaleString('id-ID')} (Makanan Rp ${Number(o.subtotal||0).toLocaleString('id-ID')} + Ongkir Rp ${Number(o.delivery_fee||0).toLocaleString('id-ID')})</div>
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${o.status==='searching_driver'?`<span style="font-size:11px;color:var(--muted)">Menunggu driver...</span>`:''}
          ${o.status==='merchant_confirm'?`<button data-food-status="${o.id}" data-next="cooking" style="background:#f97316;color:white;border:none;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:700">🍳 Mulai Masak</button>`:''}
          ${o.status==='cooking'?`<button data-food-status="${o.id}" data-next="ready" style="background:#22c55e;color:white;border:none;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:700">✅ Siap Diambil Driver</button>`:''}
          <a href="https://www.google.com/maps?q=${o.dest_lat},${o.dest_lng}" target="_blank" style="background:var(--card2);border:1px solid var(--border);padding:8px 10px;border-radius:10px;font-size:11px;text-decoration:none;color:var(--text)">🗺️ Map Customer</a>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

export function viewDriverFoodOrders(orders){
  const theme = getFoodTheme();
  if(!orders || orders.length===0){
    return `<div style="padding:20px;text-align:center;background:var(--card);border:1px dashed var(--border);border-radius:12px"><div style="font-size:28px">🍔</div><div style="font-size:13px;color:var(--text);margin-top:6px;font-weight:600">Tidak ada order food</div></div>`;
  }
  return orders.map(o=>{
    const itemsText = (o.items||[]).map(it=>`${it.name} x${it.qty}`).join(', ');
    return `<div class="card" style="margin:10px 0;padding:0;overflow:hidden;border:1px solid var(--border);border-radius:16px;background:var(--card)">
      <div style="background:var(--card2);padding:10px 12px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:800">🍔 FOOD • Rp ${Number(o.total||0).toLocaleString('id-ID')}</span><span style="font-size:10px;background:${theme.primary};color:white;padding:3px 8px;border-radius:8px">${o.distance_km?.toFixed?o.distance_km.toFixed(1):'-'} km</span></div>
      <div style="padding:12px;font-size:12px;color:var(--text)">
        <div>🏪 <b>${o.store?.name||'Warung'}</b> - ${o.store?.alamat_text||o.pickup_text||''}</div>
        <div style="margin-top:4px">📝 ${itemsText}</div>
        <div style="margin-top:4px">🎯 Antar: ${o.dest_text||''}</div>
        <div style="margin-top:6px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:6px 8px;display:flex;justify-content:space-between"><span>Subtotal Rp ${Number(o.subtotal||0).toLocaleString('id-ID')}</span><span>Ongkir Rp ${Number(o.delivery_fee||0).toLocaleString('id-ID')}</span></div>
      </div>
      <div style="padding:0 12px 10px;display:flex;gap:6px">
        <a href="https://www.google.com/maps?q=${o.pickup_lat},${o.pickup_lng}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none">📍 Warung</a>
        <a href="https://www.google.com/maps?q=${o.dest_lat},${o.dest_lng}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;text-decoration:none">🎯 Customer</a>
        <button data-food-accept="${o.id}" style="flex:1;background:${theme.primary};color:white;border:none;padding:8px;border-radius:10px;font-weight:800;font-size:11px">✅ TERIMA</button>
      </div>
    </div>`;
  }).join('');
}

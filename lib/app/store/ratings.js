// store/ratings.js - Rating Warung + History Penjualan isolasi
import { supabase } from '../supabase.js';
import { isTableMissingError } from './db.js';
import { getFoodTheme } from './config.js';

export async function getStoreRatingStats(storeId){
  try{
    const { data, error } = await supabase.from('store_ratings').select('rating').eq('store_id', storeId);
    if(error && isTableMissingError(error)) return { avg: 0, count: 0, stars: '☆☆☆☆☆' };
    if(error) throw error;
    if(!data || data.length===0) return { avg: 0, count: 0, stars: '☆☆☆☆☆' };
    const avg = data.reduce((s,r)=>s+r.rating,0)/data.length;
    const starStr = '★★★★★☆☆☆☆☆'.slice(5 - Math.round(avg), 10 - Math.round(avg));
    return { avg: avg.toFixed(1), count: data.length, stars: '★'.repeat(Math.round(avg)) + '☆'.repeat(5-Math.round(avg)) };
  }catch(e){ return { avg: 0, count: 0, stars: '☆☆☆☆☆' }; }
}

export async function getStoreRatings(storeId, limit=20){
  try{
    const { data, error } = await supabase.from('store_ratings')
      .select('*, customer:customer_id(name), food_order:food_order_id(items)')
      .eq('store_id', storeId).order('created_at',{ascending:false}).limit(limit);
    if(error && isTableMissingError(error)) return [];
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export async function hasRatedFoodOrder(foodOrderId){
  try{
    const { data } = await supabase.from('store_ratings').select('id').eq('food_order_id', foodOrderId).maybeSingle();
    return !!data;
  }catch(e){ return false; }
}

export async function createStoreRating({ storeId, customerId, foodOrderId, rating, comment }){
  const { data, error } = await supabase.from('store_ratings').insert({
    store_id: storeId,
    customer_id: customerId,
    food_order_id: foodOrderId,
    rating,
    comment: comment||null
  }).select().single();
  if(error) throw error;
  return data;
}

// ===== HISTORY PENJUALAN MERCHANT =====
export async function getMerchantSalesHistory(storeId, { from=null, to=null, limit=50 }={}){
  try{
    let q = supabase.from('food_orders')
      .select('*, customer:customer_id(name), driver:driver_id(name)')
      .eq('store_id', storeId)
      .order('created_at',{ascending:false})
      .limit(limit);
    if(from) q = q.gte('created_at', from);
    if(to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if(error && isTableMissingError(error)) return [];
    if(error) throw error;
    return data||[];
  }catch(e){ return []; }
}

export function calcSalesStats(orders){
  const completed = orders.filter(o=>o.status==='completed');
  const totalOmzet = completed.reduce((s,o)=>s+(o.subtotal||0),0);
  const totalOrders = orders.length;
  const totalCompleted = completed.length;
  const avgPerOrder = totalCompleted ? Math.round(totalOmzet/totalCompleted) : 0;
  // Group per hari
  const perDay = {};
  completed.forEach(o=>{
    const day = new Date(o.created_at).toISOString().slice(0,10);
    if(!perDay[day]) perDay[day]={ count:0, omzet:0 };
    perDay[day].count++;
    perDay[day].omzet+=o.subtotal||0;
  });
  return { totalOmzet, totalOrders, totalCompleted, avgPerOrder, perDay };
}

// ===== UI =====
export function viewStoreRatingBadge(stats){
  if(!stats || stats.count===0) return `<span style="font-size:10px;color:var(--muted)">☆ Belum ada rating</span>`;
  return `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:8px;font-weight:700">${stats.stars} ${stats.avg} (${stats.count})</span>`;
}

export function viewMerchantSales(orders, store){
  const theme = getFoodTheme();
  const stats = calcSalesStats(orders);
  const days = Object.entries(stats.perDay).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7);
  
  return `<div class="card" style="background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>📊 History Penjualan - ${store?.name||''}</h3>
      <a href="#/store/my" style="font-size:11px;text-decoration:none">‹ Warungku</a>
    </div>
    
    <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Omzet Makanan (Completed)</div>
        <div style="font-size:18px;font-weight:800;color:${theme.primary};margin-top:4px">Rp ${stats.totalOmzet.toLocaleString('id-ID')}</div>
        <div style="font-size:10px;color:var(--muted)">${stats.totalCompleted} order selesai</div>
      </div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Total Order Masuk</div>
        <div style="font-size:18px;font-weight:800;color:var(--text);margin-top:4px">${stats.totalOrders}</div>
        <div style="font-size:10px;color:var(--muted)">Avg Rp ${stats.avgPerOrder.toLocaleString('id-ID')}/order</div>
      </div>
    </div>

    ${days.length?`<div style="margin-top:12px"><div style="font-size:11px;font-weight:700">7 Hari Terakhir</div><div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">${days.map(([d, v])=>`<div style="display:flex;justify-content:space-between;font-size:11px;background:var(--bg);padding:6px 8px;border-radius:8px"><span>${d} • ${v.count} order</span><span style="font-weight:700">Rp ${v.omzet.toLocaleString('id-ID')}</span></div>`).join('')}</div></div>`:''}

    <div style="margin-top:16px">
      <div style="font-size:13px;font-weight:800">📜 Daftar Order (${orders.length})</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
        ${orders.length===0?'<div style="text-align:center;padding:20px;color:var(--muted)">Belum ada penjualan</div>':orders.map(o=>{
          const stColor = o.status==='completed' ? '#16a34a' : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
          const items = (o.items||[]).map(i=>`${i.name} x${i.qty}`).join(', ');
          return `<div style="border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--card)">
            <div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">${new Date(o.created_at).toLocaleString('id-ID')}</span><span style="background:${stColor};color:white;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span></div>
            <div style="margin-top:6px;font-size:12px"><b>Customer:</b> ${o.customer?.name||o.customer_id?.slice(0,6)} • <b>Driver:</b> ${o.driver?.name||'-'}<br/><b>Items:</b> ${items}<br/><b>Alamat:</b> ${o.dest_text||''}</div>
            <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:11px"><span>Subtotal Rp ${Number(o.subtotal||0).toLocaleString('id-ID')}</span><span>Ongkir Rp ${Number(o.delivery_fee||0).toLocaleString('id-ID')}</span><span style="font-weight:800">Total Rp ${Number(o.total||0).toLocaleString('id-ID')}</span></div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

export function viewCustomerFoodHistory(orders){
  const theme = getFoodTheme();
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">🍱</div><div style="margin-top:8px;font-weight:700">Belum ada history food</div><div style="font-size:11px;color:var(--muted)">Order makanan selesai muncul di sini, bisa rating warung</div></div>`;
  }
  return `<div class="card"><h3>🍔 History Food (${orders.length})</h3><div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
    ${orders.map(o=>{
      const isRated = o._storeRated;
      const stColor = o.status==='completed' ? theme.primary : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
      return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card)">
        <div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">${new Date(o.created_at).toLocaleString('id-ID')} • ${o.store?.name||o.store_id?.slice(0,6)}</span><span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span></div>
        <div style="margin-top:6px;font-size:12px">${(o.items||[]).map(i=>`${i.name} x${i.qty}`).join(', ')}<br/>Total Rp ${Number(o.total||0).toLocaleString('id-ID')} (Makanan Rp ${Number(o.subtotal||0).toLocaleString('id-ID')})</div>
        ${o.status==='completed' ? (isRated ? `<div style="margin-top:8px"><span style="background:#dcfce7;color:#166534;padding:6px 10px;border-radius:10px;font-size:11px;font-weight:700">✅ Sudah rating warung ${o._storeRating? '⭐'+o._storeRating.rating : ''}</span></div>` : `<div style="margin-top:8px"><button data-rate-store="${o.store_id||o.store?.id||''}" data-food-order="${o.id}" data-store-name="${(o.store?.name||'Warung').replace(/"/g,'&quot;')}" style="background:${theme.primary};color:white;border:none;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:800">⭐ Rating Warung</button></div>`) : ''}
      </div>`;
    }).join('')}
  </div></div>`;
}

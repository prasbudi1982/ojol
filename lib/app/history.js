
// app/history.js - FINAL WORKING - History Ojol + Food MERGE
// Table food_orders: id, customer_id, store_id, driver_id, items, subtotal, delivery_fee, total, status, created_at
import { supabase } from './supabase.js';

function theme(){
  try{
    const s=JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary:s.primaryColor||'#16a34a', secondary:s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export async function getPassengerHistory(passengerId, limit=20){
  console.log('[history] fetch for', passengerId);
  // Ojol
  const ojolQ = supabase.from('orders').select('*').eq('passenger_id', passengerId).order('created_at',{ascending:false}).limit(limit);
  // Food - SIMPLE tanpa join dulu biar pasti muncul
  const foodQ = supabase.from('food_orders').select('*').eq('customer_id', passengerId).order('created_at',{ascending:false}).limit(limit);
  
  const [ojolRes, foodRes] = await Promise.all([ojolQ, foodQ]);
  
  console.log('[history] ojolRes', ojolRes.data?.length, ojolRes.error);
  console.log('[history] foodRes', foodRes.data?.length, foodRes.error, foodRes.data?.[0]);

  let ojol = (ojolRes.data||[]).map(o=>({...o, _type:'ojol'}));
  let food = (foodRes.data||[]).map(o=>({...o, _type:'food'}));

  // Enrich driver name & store name (optional, jangan bikin gagal)
  try{
    const driverIds = [...new Set([...ojol, ...food].map(o=>o.driver_id).filter(Boolean))];
    const storeIds = [...new Set(food.map(o=>o.store_id).filter(Boolean))];
    let driverMap={}, storeMap={};
    if(driverIds.length){
      const { data } = await supabase.from('profiles').select('id,name').in('id', driverIds);
      (data||[]).forEach(d=>driverMap[d.id]=d.name);
    }
    if(storeIds.length){
      const { data } = await supabase.from('stores').select('id,name').in('id', storeIds);
      (data||[]).forEach(s=>storeMap[s.id]=s.name);
    }
    ojol = ojol.map(o=>({...o, _driverName: driverMap[o.driver_id]||o.driver_id?.slice(0,6)||'-'}));
    food = food.map(o=>({...o, _driverName: driverMap[o.driver_id]||'-', _storeName: storeMap[o.store_id]||'Warung #'+String(o.store_id||'').slice(0,4)}));
  }catch(e){ console.warn('enrich fail', e); }

  let combined = [...ojol, ...food].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0, limit);
  console.log('[history] combined', combined.length, combined);

  // Rating check - jangan bikin gagal history
  try{
    const allIds = combined.map(o=>o.id);
    if(allIds.length){
      const { data: r } = await supabase.from('ratings').select('order_id, rating').in('order_id', allIds);
      const m={}; (r||[]).forEach(x=>m[x.order_id]=x);
      combined.forEach(o=>{ if(m[o.id]){ o._rated=true; o._rating=m[o.id]; } });
    }
    const foodIds = combined.filter(o=>o._type==='food').map(o=>o.id);
    if(foodIds.length){
      const { data: sr } = await supabase.from('store_ratings').select('food_order_id, rating').in('food_order_id', foodIds);
      const sm={}; (sr||[]).forEach(x=>sm[x.food_order_id]=x);
      combined.forEach(o=>{ if(o._type==='food' && sm[o.id]){ o._storeRated=true; o._storeRating=sm[o.id]; } });
    }
  }catch(e){}

  return combined;
}

export async function getDriverHistory(driverId, limit=20){
  const ojolQ = supabase.from('orders').select('*').eq('driver_id', driverId).order('created_at',{ascending:false}).limit(limit);
  const foodQ = supabase.from('food_orders').select('*').eq('driver_id', driverId).order('created_at',{ascending:false}).limit(limit);
  const [ojolRes, foodRes] = await Promise.all([ojolQ, foodQ]);
  return [...(ojolRes.data||[]).map(o=>({...o,_type:'ojol'})), ...(foodRes.data||[]).map(o=>({...o,_type:'food'}))].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
}

// UI
let currentPage=1, perPage=5, currentOrders=[], currentType='passenger';
export function setHistoryPage(p){ currentPage=p; render(); }

function render(){
  const con=document.getElementById('historyPaginatedContainer');
  const pag=document.getElementById('historyPagination');
  if(!con||!pag) return;
  const t=theme();
  const total=currentOrders.length, totalPages=Math.ceil(total/perPage)||1;
  if(currentPage<1) currentPage=1; if(currentPage>totalPages) currentPage=totalPages;
  const page=currentOrders.slice((currentPage-1)*perPage, currentPage*perPage);
  con.innerHTML = page.length ? page.map(o=>{
    const isFood=o._type==='food';
    const badge=isFood?`<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🍔 FOOD</span>`:`<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🏍️ OJOL</span>`;
    const date=new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const stColor=o.status==='completed'?t.primary:o.status==='cancelled'?'#ef4444':'#f59e0b';
    let main='';
    if(isFood){
      let items=[]; try{ items=Array.isArray(o.items)?o.items:JSON.parse(o.items||'[]'); }catch(e){ items=[]; }
      const txt=items.map(i=>`${i.name||i.title||'Item'} x${i.qty||i.quantity||1}`).join(', ')||'Makanan';
      main=`<div style="font-weight:700">🏪 ${o._storeName||'Warung'}</div><div style="font-size:11px;color:#64748b;margin-top:2px">🍽️ ${txt}</div><div style="font-size:10px;color:#94a3b8;margin-top:4px">Subtotal Rp ${(o.subtotal||0).toLocaleString('id-ID')} + Ongkir Rp ${(o.delivery_fee||0).toLocaleString('id-ID')}</div>`;
    }else{
      main=`<div>📍 ${o.pickup_text||o.pickup||'-'}</div><div style="margin-top:2px">🎯 ${o.dest_text||o.destination||'-'}</div>`;
    }
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;gap:6px;align-items:center"><span style="font-size:11px;color:var(--muted)">${date}</span>${badge}</span><span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${(o.status||'').toUpperCase()}</span></div>
      <div style="margin-top:8px;font-size:13px;line-height:1.4">${main}</div>
      <div style="margin-top:10px;display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">${isFood?'🛵 '+(o._driverName||'-'):'🏍️ '+(o.distance_km||'-')+' km'} </span><span style="font-weight:800;font-size:12px">Rp ${Number(o.total||o.estimated_cost||0).toLocaleString('id-ID')}</span></div>
      ${(o._rated||o._storeRated)?`<div style="margin-top:8px"><span style="font-size:10px;background:#dcfce7;color:#166534;padding:4px 8px;border-radius:8px">✅ Sudah dirating</span></div>`:''}
    </div>`;
  }).join(''):`<div style="text-align:center;padding:24px;color:var(--muted)">Belum ada history (ojol: ${currentOrders.filter(o=>o._type==='ojol').length}, food: ${currentOrders.filter(o=>o._type==='food').length})</div>`;
  if(total===0){ pag.innerHTML=''; return; }
  let btns=''; for(let i=1;i<=totalPages;i++){ const a=i===currentPage; btns+=`<button data-history-page="${i}" style="min-width:38px;padding:8px 10px;border-radius:10px;border:1px solid ${a?t.primary:'var(--border)'};background:${a?t.primary:'var(--card)'};color:${a?'#052e16':'var(--text)'};font-weight:800">${i}</button>`; }
  pag.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;margin-top:12px">${btns}</div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:6px">${total} order (${currentOrders.filter(o=>o._type==='ojol').length} ojol + ${currentOrders.filter(o=>o._type==='food').length} food)</div>`;
}

export function viewHistoryPassanger(orders){
  currentOrders=orders||[]; currentType='passenger'; currentPage=1;
  if(!orders||!orders.length) return `<div class="card" style="text-align:center;padding:24px">📭 Belum ada history<br><span style="font-size:11px;color:var(--muted)">Ojol + Food akan muncul di sini</span></div>`;
  const inner = orders.slice(0,perPage).map((o,i)=>{ // render first page quickly
    const isFood=o._type==='food';
    return `<div style="border:1px solid var(--border);padding:10px;border-radius:12px;margin-bottom:8px;font-size:12px">${isFood?'🍔':'🏍️'} ${isFood?(o._storeName||'Food'):(o.pickup_text||'Ojol')} - Rp ${Number(o.total||o.estimated_cost||0).toLocaleString('id-ID')} - ${(o.status||'').toUpperCase()}</div>`;
  }).join('');
  setTimeout(()=>render(),50);
  return `<div class="card"><h3>📜 History (${orders.length}) - Ojol+Food</h3><div id="historyPaginatedContainer">${inner}</div><div id="historyPagination"></div></div>`;
}

export function viewHistoryDriver(orders){
  currentOrders=orders||[]; currentType='driver'; currentPage=1;
  if(!orders||!orders.length) return `<div class="card" style="text-align:center;padding:24px">📭 Belum ada pengantaran</div>`;
  setTimeout(()=>render(),50);
  return `<div class="card"><h3>🚚 Pengantaran (${orders.length})</h3><div id="historyPaginatedContainer"></div><div id="historyPagination"></div></div>`;
}

export async function loadHistory(id, type='passenger'){
  currentType=type; currentPage=1;
  currentOrders = type==='driver' ? await getDriverHistory(id,40) : await getPassengerHistory(id,40);
  render();
}

// listeners
if(typeof document!=='undefined'){
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-history-page]'); if(!b) return;
    const v=b.getAttribute('data-history-page'); const tp=Math.ceil(currentOrders.length/perPage);
    if(v==='prev'&&currentPage>1) currentPage--; else if(v==='next'&&currentPage<tp) currentPage++; else { const p=parseInt(v); if(!isNaN(p)) currentPage=p; }
    render();
  });
}

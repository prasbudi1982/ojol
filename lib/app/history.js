// history.js - FINAL MERGE FIX - Compatible dengan app.js lama
// Merge: orders + food_orders (customer_id, store_id, driver_id, items, subtotal, delivery_fee, total)
// Rating: ratings (driver) + store_ratings (store_id, customer_id, food_order_id, rating, comment)
import { supabase } from './supabase.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}
function isRated(key){ try{ return !!localStorage.getItem(key); }catch(e){ return false; } }

export async function getPassengerHistory(passengerId, limit=20){
  const [ojolRes, foodRes] = await Promise.all([
    supabase.from('orders').select('*, driver:driver_id(id,name,nopol,jenis_kendaraan)').eq('passenger_id', passengerId).order('created_at',{ascending:false}).limit(limit),
    supabase.from('food_orders').select('*, driver:driver_id(id,name,nopol,jenis_kendaraan), store:store_id(id,name,address)').eq('customer_id', passengerId).order('created_at',{ascending:false}).limit(limit)
  ]);
  let ojolOrders = (ojolRes.data||[]).map(o=>({ ...o, _type:'ojol' }));
  let foodOrders = (foodRes.data||[]).map(o=>({ ...o, _type:'food' }));
  let combined = [...ojolOrders, ...foodOrders].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
  if(combined.length){
    try{
      const allIds = combined.map(o=>o.id);
      const { data: driverRatings } = await supabase.from('ratings').select('order_id, rating, created_at').in('order_id', allIds);
      const dMap={}; (driverRatings||[]).forEach(r=>dMap[r.order_id]=r);
      combined.forEach(o=>{
        if(dMap[o.id]){ o._rated=true; o._ratingData=dMap[o.id]; try{ localStorage.setItem((o._type==='food'?'rated_food_':'rated_')+o.id,'1'); }catch(e){} }
        else if(isRated((o._type==='food'?'rated_food_':'rated_')+o.id)){ o._rated=true; }
      });
    }catch(e){}
    try{
      const foodIds = combined.filter(o=>o._type==='food').map(o=>o.id);
      if(foodIds.length){
        const { data: storeRatings } = await supabase.from('store_ratings').select('food_order_id, rating, comment, created_at').in('food_order_id', foodIds);
        const sMap={}; (storeRatings||[]).forEach(r=>sMap[r.food_order_id]=r);
        combined.forEach(o=>{
          if(o._type==='food' && sMap[o.id]){ o._storeRated=true; o._storeRatingData=sMap[o.id]; try{ localStorage.setItem('rated_store_'+o.id,'1'); }catch(e){} }
          else if(o._type==='food' && isRated('rated_store_'+o.id)){ o._storeRated=true; }
        });
      }
    }catch(e){}
  }
  return combined;
}

export async function getDriverHistory(driverId, limit=20){
  const [ojolRes, foodRes] = await Promise.all([
    supabase.from('orders').select('*, passenger:passenger_id(id,name)').eq('driver_id',driverId).order('created_at',{ascending:false}).limit(limit),
    supabase.from('food_orders').select('*, customer:customer_id(id,name), store:store_id(name)').eq('driver_id',driverId).order('created_at',{ascending:false}).limit(limit)
  ]);
  return [...(ojolRes.data||[]).map(o=>({...o,_type:'ojol'})), ...(foodRes.data||[]).map(o=>({...o,_type:'food'}))].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
}

let currentPage=1;
const perPage=5;
let currentOrders=[];
let currentType='passenger';
export function setHistoryPage(p){ currentPage=p; renderPaginatedHistory(); }

function renderPaginatedHistory(){
  const container=document.getElementById('historyPaginatedContainer');
  const pagEl=document.getElementById('historyPagination');
  if(!container||!pagEl) return;
  const theme=getAppTheme();
  const total=currentOrders.length;
  const totalPages=Math.ceil(total/perPage)||1;
  if(currentPage<1) currentPage=1;
  if(currentPage>totalPages) currentPage=totalPages;
  const pageOrders=currentOrders.slice((currentPage-1)*perPage, currentPage*perPage);
  container.innerHTML = currentType==='driver' ? viewHistoryDriverInner(pageOrders) : viewHistoryPassangerInner(pageOrders);
  if(total===0){ pagEl.innerHTML=''; return; }
  let btns=''; for(let i=1;i<=totalPages;i++){ const a=i===currentPage; btns+=`<button data-history-page="${i}" style="min-width:38px;padding:8px 10px;border-radius:10px;border:1px solid ${a?theme.primary:'var(--border)'};background:${a?theme.primary:'var(--card)'};color:${a?'#052e16':'var(--text)'};font-weight:800;font-size:12px;cursor:pointer">${i}</button>`; }
  pagEl.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:16px;flex-wrap:wrap"><button data-history-page="prev" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;font-weight:700;cursor:pointer" ${currentPage===1?'disabled':''}>‹ Prev</button>${btns}<button data-history-page="next" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;font-weight:700;cursor:pointer" ${currentPage===totalPages?'disabled':''}>Next ›</button></div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:8px">Hal ${currentPage} dari ${totalPages} • ${total} total (ojol+food) • 5/hal</div>`;
}

function viewHistoryPassangerInner(orders){
  const theme=getAppTheme();
  if(!orders || orders.length===0) return `<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;background:var(--card);border:1px dashed var(--border);border-radius:12px">Tidak ada data di halaman ini</div>`;
  return orders.map(o=>{
    const stColor=o.status==='completed'?theme.primary:o.status==='cancelled'?'#ef4444':'#f59e0b';
    const date=new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const isFood=o._type==='food';
    const typeBadge=isFood?`<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🍔 FOOD</span>`:`<span style="background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🏍️ OJOL</span>`;
    let main='', totalRp=o.total||o.estimated_cost||0;
    if(isFood){
      const itemsArr = Array.isArray(o.items) ? o.items : (()=>{ try{return JSON.parse(o.items||'[]')}catch(e){return []} })();
      const itemsText = itemsArr.map(i=>`${i.name||i.title||'Item'} x${i.qty||i.quantity||1}`).join(', ') || 'Makanan';
      main=`<div>🏪 ${o.store?.name||'Warung'}</div><div style="margin-top:2px;font-size:11px;color:var(--muted)">🍽️ ${itemsText}</div><div style="margin-top:4px;font-size:10px;color:var(--muted)">Subtotal Rp ${(o.subtotal||0).toLocaleString('id-ID')} + Ongkir Rp ${(o.delivery_fee||0).toLocaleString('id-ID')}</div>`;
    }else{
      main=`<div>📍 ${o.pickup_text||o.pickup||''}</div><div style="margin-top:2px">🎯 ${o.dest_text||o.destination||''}</div>`;
    }
    const alreadyRated = o._rated;
    const storeRated = o._storeRated;
    let ratingUI='';
    if(o.status==='completed' && o.driver_id){
      if(isFood){
        if(alreadyRated && storeRated){
          ratingUI=`<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><span style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:6px 10px;border-radius:10px;font-size:11px;font-weight:700">✅ Driver ⭐${o._ratingData?.rating||''}</span><span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:6px 10px;border-radius:10px;font-size:11px;font-weight:700">✅ Warung ⭐${o._storeRatingData?.rating||''}</span></div>`;
        } else if(alreadyRated || storeRated){
          ratingUI=`<div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="background:#fef9c3;color:#854d0e;padding:6px 10px;border-radius:10px;font-size:10px">${alreadyRated?'Driver sudah':'Warung sudah'} dirating</span><button data-rate-order="${o.id}" data-rate-driver="${o.driver_id}" data-rate-type="food" data-rate-name="${o.driver?.name||'Driver'}" style="background:${theme.primary};color:#052e16;border:none;padding:8px 12px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer">Lengkapi rating</button></div>`;
        } else {
          ratingUI=`<div style="margin-top:10px"><button data-rate-order="${o.id}" data-rate-driver="${o.driver_id}" data-rate-type="food" data-rate-name="${o.driver?.name||'Driver'}" style="width:100%;background:${theme.primary};color:#052e16;border:none;padding:10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer">⭐ Beri Rating (Driver+Warung)</button></div>`;
        }
      } else {
        if(alreadyRated){
          ratingUI=`<div style="margin-top:10px"><span style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:6px 10px;border-radius:10px;font-size:11px;font-weight:700">✅ ⭐ ${o._ratingData?.rating||5}/5 Sudah dirating</span></div>`;
        } else {
          ratingUI=`<div style="margin-top:10px"><button data-rate-order="${o.id}" data-rate-driver="${o.driver_id}" data-rate-type="ojol" data-rate-name="${o.driver?.name||'Driver'}" style="width:100%;background:${theme.primary};color:#052e16;border:none;padding:10px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer">⭐ Beri Rating</button></div>`;
        }
      }
    }
    const dist = o.distance_km?.toFixed ? o.distance_km.toFixed(1) : o.distance_km||'-';
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;gap:6px;align-items:center"><span style="font-size:11px;color:var(--muted)">${date}</span>${typeBadge}</span><span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${(o.status||'').toUpperCase()}</span></div>
      <div style="margin-top:8px;font-size:13px;color:var(--text);line-height:1.4">${main}</div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;color:var(--muted)">${isFood?'🛵 Ongkir Rp '+(o.delivery_fee||0).toLocaleString('id-ID'): '🏍️ '+dist+' km'} • ${o.driver?.name||'Driver -'}</span><span style="font-weight:800;font-size:12px">Rp ${Number(totalRp).toLocaleString('id-ID')}</span></div>
      ${ratingUI}
    </div>`;
  }).join('');
}

function viewHistoryDriverInner(orders){
  if(!orders || orders.length===0) return `<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;background:var(--card);border:1px dashed var(--border);border-radius:12px">Tidak ada data di halaman ini</div>`;
  return orders.map(o=>{
    const date=new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const isFood=o._type==='food';
    const itemsArr = isFood ? (Array.isArray(o.items)?o.items:(()=>{try{return JSON.parse(o.items)}catch(e){return []}})()) : [];
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">${date} • ${isFood?'🍔 FOOD':'🏍️ OJOL'}</span><span style="font-size:10px;font-weight:800">${(o.status||'').toUpperCase()}</span></div><div style="margin-top:6px;font-size:12px">${isFood?itemsArr.map(i=>i.name||i.title).join(', ')+' - '+(o.store?.name||'Warung'): (o.pickup_text||'')+' → '+(o.dest_text||'')}</div><div style="margin-top:6px;font-size:11px;color:var(--muted)">${(o.passenger?.name||o.customer?.name)||'Customer'} • Rp ${Number(o.total||o.estimated_cost||0).toLocaleString('id-ID')}</div></div>`;
  }).join('');
}

export function viewHistoryPassanger(orders){
  currentOrders = orders||[];
  currentType = 'passenger';
  currentPage = 1;
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada histori order</div><div style="font-size:11px;color:var(--muted)">Order selesai akan muncul di sini (ojol+food)</div></div>`;
  }
  const inner = viewHistoryPassangerInner(orders.slice(0,perPage));
  setTimeout(()=> renderPaginatedHistory(), 50);
  return `<div class="card"><h3>📜 Histori Saya (${orders.length}) • OJOL+FOOD</h3><div id="historyPaginatedContainer" style="margin-top:12px">${inner}</div><div id="historyPagination" style="min-height:60px"></div></div>`;
}

export function viewHistoryDriver(orders){
  currentOrders = orders||[];
  currentType = 'driver';
  currentPage = 1;
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada pengantaran</div><div style="font-size:11px;color:var(--muted)">Order selesai muncul di sini</div></div>`;
  }
  const inner = viewHistoryDriverInner(orders.slice(0,perPage));
  setTimeout(()=> renderPaginatedHistory(), 50);
  return `<div class="card"><h3>🚚 Histori Pengantaran (${orders.length})</h3><div id="historyPaginatedContainer" style="margin-top:12px">${inner}</div><div id="historyPagination" style="min-height:60px"></div></div>`;
}

if(typeof document !== 'undefined'){
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-history-page]');
    if(!btn) return;
    const val = btn.getAttribute('data-history-page');
    if(val==='prev'){ if(currentPage>1){ currentPage--; renderPaginatedHistory(); } }
    else if(val==='next'){ const totalPages = Math.ceil(currentOrders.length/perPage); if(currentPage<totalPages){ currentPage++; renderPaginatedHistory(); } }
    else { const p = parseInt(val); if(!isNaN(p)){ currentPage = p; renderPaginatedHistory(); } }
    document.getElementById('historyPaginatedContainer')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-rate-order]');
    if(!btn) return;
    const orderId = btn.getAttribute('data-rate-order');
    const type = btn.getAttribute('data-rate-type');
    const order = currentOrders.find(o=>o.id===orderId);
    if(!order) return;
    if(type==='food'){
      try{ const { showCombinedRatingModal } = await import('./rating_food_store.js'); showCombinedRatingModal(order, order.driver||{name:btn.getAttribute('data-rate-name')}); }catch(err){ alert('Modul rating_food_store.js belum ada: '+err.message); }
    } else {
      try{ const { openRatingModal } = await import('./rating.js'); openRatingModal(btn.getAttribute('data-rate-driver'), btn.getAttribute('data-rate-name')||'Driver', orderId); }catch(err){ alert('Gagal buka rating: '+err.message); }
    }
  });
}

export async function loadHistory(passengerId, type='passenger'){
  const c=document.getElementById('historyPaginatedContainer');
  if(c) c.innerHTML=`<div style="text-align:center;padding:20px">⏳ Memuat history ojol + food...</div>`;
  currentType=type; currentPage=1;
  currentOrders = type==='driver' ? await getDriverHistory(passengerId,40) : await getPassengerHistory(passengerId,40);
  renderPaginatedHistory();
}

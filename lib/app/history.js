// history.js - FINAL GABUNGAN + SUPPORT store_ratings
// food_orders: customer_id, store_id, driver_id, items, subtotal, delivery_fee, total
// store_ratings: store_id, customer_id, food_order_id, rating, comment
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

  if(!combined.length) return combined;

  // Cek rating driver
  try{
    const allIds = combined.map(o=>o.id);
    const { data: driverRatings } = await supabase.from('ratings').select('order_id, rating, created_at').in('order_id', allIds);
    const dMap={}; (driverRatings||[]).forEach(r=>dMap[r.order_id]=r);
    combined.forEach(o=>{
      if(dMap[o.id]){ o._rated=true; o._ratingData=dMap[o.id]; try{ localStorage.setItem((o._type==='food'?'rated_food_':'rated_')+o.id,'1'); }catch(e){} }
      else if(isRated((o._type==='food'?'rated_food_':'rated_')+o.id)){ o._rated=true; }
    });
  }catch(e){}

  // Cek rating store khusus food
  try{
    const foodIds = combined.filter(o=>o._type==='food').map(o=>o.id);
    if(foodIds.length){
      const { data: storeRatings } = await supabase.from('store_ratings').select('food_order_id, rating, comment, created_at').in('food_order_id', foodIds);
      const sMap={}; (storeRatings||[]).forEach(r=>sMap[r.food_order_id]=r);
      combined.forEach(o=>{
        if(o._type==='food' && sMap[o.id]){
          o._storeRated=true;
          o._storeRatingData=sMap[o.id];
          try{ localStorage.setItem('rated_store_'+o.id,'1'); }catch(e){}
        } else if(o._type==='food' && isRated('rated_store_'+o.id)){
          o._storeRated=true;
        }
      });
    }
  }catch(e){ console.warn('store_ratings cek fail', e); }

  return combined;
}

export async function getDriverHistory(driverId, limit=20){
  const [ojolRes, foodRes] = await Promise.all([
    supabase.from('orders').select('*, passenger:passenger_id(id,name)').eq('driver_id',driverId).order('created_at',{ascending:false}).limit(limit),
    supabase.from('food_orders').select('*, customer:customer_id(id,name), store:store_id(name)').eq('driver_id',driverId).order('created_at',{ascending:false}).limit(limit)
  ]);
  return [...(ojolRes.data||[]).map(o=>({...o,_type:'ojol'})), ...(foodRes.data||[]).map(o=>({...o,_type:'food'}))].sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
}

let currentPage=1, perPage=5, currentOrders=[], currentType='passenger';
export function setHistoryPage(p){ currentPage=p; render(); }
function render(){
  const container=document.getElementById('historyPaginatedContainer');
  const pagEl=document.getElementById('historyPagination');
  if(!container||!pagEl) return;
  const theme=getAppTheme();
  const total=currentOrders.length;
  const totalPages=Math.ceil(total/perPage)||1;
  if(currentPage<1) currentPage=1;
  if(currentPage>totalPages) currentPage=totalPages;
  const pageOrders=currentOrders.slice((currentPage-1)*perPage, currentPage*perPage);
  container.innerHTML = pageOrders.length ? pageOrders.map(o=>{
    const stColor=o.status==='completed'?theme.primary:o.status==='cancelled'?'#ef4444':'#f59e0b';
    const date=new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const isFood=o._type==='food';
    const typeBadge=isFood?`<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🍔 FOOD</span>`:`<span style="background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;padding:3px 8px;border-radius:8px;font-size:9px;font-weight:800">🏍️ OJOL</span>`;

    let main='', totalRp=o.total||o.estimated_cost||0;
    if(isFood){
      const itemsArr = Array.isArray(o.items) ? o.items : (()=>{ try{return JSON.parse(o.items)}catch(e){return []} })();
      const itemsText = itemsArr.map(i=>`${i.name||i.title} x${i.qty||1}`).join(', ');
      main=`<div>🏪 ${o.store?.name||'Warung'}</div><div style="font-size:11px;color:var(--muted)">🍽️ ${itemsText}</div><div style="font-size:10px;color:var(--muted)">Ongkir Rp ${(o.delivery_fee||0).toLocaleString('id-ID')}</div>`;
    }else{
      main=`<div>📍 ${o.pickup_text||''}</div><div>🎯 ${o.dest_text||''}</div>`;
    }

    // Badge rating
    let badge='';
    if(isFood){
      const driverDone = o._rated;
      const storeDone = o._storeRated;
      if(driverDone && storeDone){
        badge=`<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><span style="background:#dcfce7;color:#166534;padding:5px 8px;border-radius:8px;font-size:10px;font-weight:700">✅ Driver ⭐${o._ratingData?.rating||''}</span><span style="background:#fef3c7;color:#92400e;padding:5px 8px;border-radius:8px;font-size:10px;font-weight:700">✅ Warung ⭐${o._storeRatingData?.rating||''}</span></div>`;
      }else if(driverDone || storeDone){
        badge=`<div style="margin-top:8px"><span style="background:#fef9c3;color:#854d0e;padding:5px 8px;border-radius:8px;font-size:10px">⚠️ ${driverDone?'Driver sudah':'Warung sudah'} dirating, ${!driverDone?'driver':'warung'} belum</span></div>`;
      }
    }else{
      if(o._rated) badge=`<div style="margin-top:8px"><span style="background:#dcfce7;color:#166534;padding:5px 8px;border-radius:8px;font-size:10px">✅ Sudah dirating ⭐${o._ratingData?.rating||''}</span></div>`;
    }

    const needRate = o.status==='completed' && o.driver_id && (!o._rated || (isFood && !o._storeRated));

    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="display:flex;gap:6px;align-items:center"><span style="font-size:11px;color:var(--muted)">${date}</span>${typeBadge}</span><span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${(o.status||'').toUpperCase()}</span></div>
      <div style="margin-top:8px;font-size:13px;line-height:1.4">${main}</div>
      <div style="margin-top:10px;display:flex;justify-content:space-between"><span style="font-size:11px;color:var(--muted)">${isFood?'🛵':'🏍️'} ${o.driver?.name||'-'}</span><span style="font-weight:800;font-size:12px">Rp ${Number(totalRp).toLocaleString('id-ID')}</span></div>
      ${needRate?`<div style="margin-top:10px"><button data-rate-driver="${o.driver_id}" data-rate-order="${o.id}" data-rate-type="${o._type}" data-rate-store="${o.store_id||''}" data-rate-store-name="${o.store?.name||''}" data-rate-name="${o.driver?.name||'Driver'}" style="width:100%;background:${theme.primary};color:#052e16;border:none;padding:10px;border-radius:10px;font-size:11px;font-weight:800">⭐ Beri Rating ${isFood?'(Driver+Warung)':''}</button></div>`:badge}
    </div>`;
  }).join('') : `<div style="text-align:center;padding:24px;color:var(--muted)">Belum ada history</div>`;

  if(total===0){ pagEl.innerHTML=''; return; }
  let btns=''; for(let i=1;i<=totalPages;i++){ const a=i===currentPage; btns+=`<button data-history-page="${i}" style="min-width:38px;padding:8px 10px;border-radius:10px;border:1px solid ${a?theme.primary:'var(--border)'};background:${a?theme.primary:'var(--card)'};color:${a?'#052e16':'var(--text)'};font-weight:800;font-size:12px">${i}</button>`; }
  pagEl.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;margin-top:16px;flex-wrap:wrap"><button data-history-page="prev" ${currentPage===1?'disabled':''} style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card)">‹ Prev</button>${btns}<button data-history-page="next" ${currentPage===totalPages?'disabled':''} style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card)">Next ›</button></div><div style="text-align:center;font-size:10px;color:var(--muted);margin-top:8px">Hal ${currentPage} dari ${totalPages} • ${total} order</div>`;
}

export async function loadHistory(passengerId, type='passenger'){
  const c=document.getElementById('historyPaginatedContainer');
  if(c) c.innerHTML=`<div style="text-align:center;padding:20px">⏳ Memuat history ojol + food...</div>`;
  currentType=type; currentPage=1;
  currentOrders = type==='driver' ? await getDriverHistory(passengerId,40) : await getPassengerHistory(passengerId,40);
  render();
  document.getElementById('historyPagination')?.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-history-page]'); if(!b) return;
    const v=b.getAttribute('data-history-page');
    if(v==='prev') setHistoryPage(currentPage-1); else if(v==='next') setHistoryPage(currentPage+1); else setHistoryPage(parseInt(v));
  });
  // bind rating click
  document.getElementById('historyPaginatedContainer')?.addEventListener('click', async (e)=>{
    const btn=e.target.closest('[data-rate-order]');
    if(!btn) return;
    const orderId=btn.getAttribute('data-rate-order');
    const driverId=btn.getAttribute('data-rate-driver');
    const type=btn.getAttribute('data-rate-type');
    const order = currentOrders.find(o=>o.id===orderId);
    if(!order) return;
    if(type==='food'){
      const { showCombinedRatingModal } = await import('./rating_food_store.js');
      showCombinedRatingModal(order, order.driver||{name:btn.getAttribute('data-rate-name')});
    }else{
      const { openRatingModal } = await import('./rating.js');
      openRatingModal(driverId, btn.getAttribute('data-rate-name')||'Driver', orderId);
    }
  });
}

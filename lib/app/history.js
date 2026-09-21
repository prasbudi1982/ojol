// history.js - Histori order penumpang & pengantaran driver + Rating + Pagination
import { supabase } from './supabase.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export async function getPassengerHistory(passengerId, limit=100){
  const { data, error } = await supabase.from('orders')
    .select('*, driver:driver_id(id,name,nopol,jenis_kendaraan)')
    .eq('passenger_id', passengerId)
    .order('created_at',{ascending:false})
    .limit(limit);
  if(error) return [];
  return data||[];
}

export async function getDriverHistory(driverId, limit=100){
  const { data, error } = await supabase.from('orders')
    .select('*, passenger:passenger_id(id,name)')
    .eq('driver_id', driverId)
    .order('created_at',{ascending:false})
    .limit(limit);
  if(error) return [];
  return data||[];
}

export async function getDriverRatingStats(driverId){
  const { data } = await supabase.from('ratings').select('rating').eq('driver_id', driverId);
  if(!data || data.length===0) return { avg: 0, count:0 };
  const avg = data.reduce((s,r)=>s+r.rating,0)/data.length;
  return { avg: avg.toFixed(1), count: data.length };
}

// Pagination state global
let currentPage = 1;
const perPage = 10;
let currentOrders = [];
let currentType = 'passenger'; // or driver

export function setHistoryPage(page){
  currentPage = page;
  renderPaginatedHistory();
}

function renderPaginatedHistory(){
  const container = document.getElementById('historyPaginatedContainer');
  if(!container) return;
  const theme = getAppTheme();
  const total = currentOrders.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  if(currentPage < 1) currentPage = 1;
  if(currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage-1)*perPage;
  const end = start + perPage;
  const pageOrders = currentOrders.slice(start, end);
  
  if(currentType === 'driver'){
    container.innerHTML = viewHistoryDriverInner(pageOrders);
  } else {
    container.innerHTML = viewHistoryPassangerInner(pageOrders);
  }
  
  // render pagination controls
  const pagEl = document.getElementById('historyPagination');
  if(!pagEl) return;
  if(total <= perPage){
    pagEl.innerHTML = `<div style="text-align:center;font-size:11px;color:#64748b;margin-top:8px">${total} order</div>`;
    return;
  }
  let btns = '';
  for(let i=1;i<=totalPages;i++){
    const active = i===currentPage;
    btns += `<button data-history-page="${i}" style="min-width:36px;padding:8px 10px;border-radius:8px;border:1px solid ${active?theme.primary:'#e2e8f0'};background:${active?theme.primary:'white'};color:${active?'white':'#0f172a'};font-weight:800;font-size:12px">${i}</button>`;
  }
  pagEl.innerHTML = `
    <div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:14px;flex-wrap:wrap">
      <button data-history-page="prev" style="padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;background:white;font-size:11px" ${currentPage===1?'disabled':''}>‹ Prev</button>
      ${btns}
      <button data-history-page="next" style="padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;background:white;font-size:11px" ${currentPage===totalPages?'disabled':''}>Next ›</button>
    </div>
    <div style="text-align:center;font-size:10px;color:#94a3b8;margin-top:6px">Hal ${currentPage} dari ${totalPages} • ${total} total order</div>
  `;
}

function viewHistoryPassangerInner(orders){
  const theme = getAppTheme();
  if(!orders || orders.length===0){
    return `<div style="text-align:center;padding:24px;color:#64748b;font-size:12px">Tidak ada data di halaman ini</div>`;
  }
  return orders.map(o=>{
    const stColor = o.status==='completed' ? theme.primary : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
    const date = new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:white;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:#64748b">${date}</span>
        <span style="background:${stColor};color:white;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span>
      </div>
      <div style="margin-top:6px;font-size:13px;color:#0f172a">
        <div>📍 ${o.pickup_text||o.pickup||''}</div>
        <div style="margin-top:2px">🎯 ${o.dest_text||o.destination||''}</div>
      </div>
      <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px">${o.vehicle_type==='mobil'?'🚗':'🏍️'} ${o.distance_km?.toFixed?o.distance_km.toFixed(1):o.distance_km||'-'} km • ${o.driver?.name||'Driver -'}</span>
        <span style="font-weight:800;font-size:12px">Rp ${(o.estimated_cost||0).toLocaleString('id-ID')}</span>
      </div>
      ${o.status==='completed' && o.driver_id ? `<div style="margin-top:8px;display:flex;gap:6px">
        <button data-rate-driver="${o.driver_id}" data-rate-order="${o.id}" data-rate-name="${o.driver?.name||'Driver'}" style="flex:1;background:${theme.primary};color:white;border:none;padding:8px;border-radius:8px;font-size:11px;font-weight:700">⭐ Beri Rating</button>
        <a href="https://www.google.com/maps/dir/${o.pickup_lat||''},${o.pickup_lng||''}/${o.dest_lat||''},${o.dest_lng||''}" target="_blank" style="background:#f1f5f9;border:1px solid #cbd5e1;padding:8px 10px;border-radius:8px;font-size:11px;text-decoration:none;color:#0f172a">🗺️</a>
      </div>` : ''}
    </div>`;
  }).join('');
}

function viewHistoryDriverInner(orders){
  const theme = getAppTheme();
  if(!orders || orders.length===0){
    return `<div style="text-align:center;padding:24px;color:#64748b;font-size:12px">Tidak ada data di halaman ini</div>`;
  }
  return orders.map(o=>{
    const stColor = o.status==='completed' ? theme.primary : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
    const date = new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:${o.status==='completed'?'#f0fdf4':'white'};margin-bottom:10px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;color:#64748b">${date} • ${o.passenger?.name||'Penumpang'}</span>
        <span style="background:${stColor};color:white;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span>
      </div>
      <div style="margin-top:6px;font-size:13px;color:#0f172a">
        <div>📍 ${o.pickup_text||o.pickup||''}</div>
        <div>🎯 ${o.dest_text||o.destination||''}</div>
      </div>
      <div style="margin-top:8px;display:flex;justify-content:space-between">
        <span style="font-size:11px">📏 ${o.distance_km?.toFixed?o.distance_km.toFixed(1):'-'} km • ${o.vehicle_type||'motor'}</span>
        <span style="font-weight:800;font-size:12px;color:${theme.primary}">+Rp ${(o.estimated_cost||0).toLocaleString('id-ID')}</span>
      </div>
    </div>`;
  }).join('');
}

export function viewHistoryPassanger(orders){
  currentOrders = orders||[];
  currentType = 'passenger';
  currentPage = 1;
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada histori order</div><div style="font-size:11px;color:#64748b">Order selesai akan muncul di sini</div></div>`;
  }
  return `<div class="card"><h3>📜 Histori Order Saya (${orders.length})</h3>
    <div id="historyPaginatedContainer" style="margin-top:12px">${viewHistoryPassangerInner(orders.slice(0,perPage))}</div>
    <div id="historyPagination"></div>
  </div>`;
}

export function viewHistoryDriver(orders){
  currentOrders = orders||[];
  currentType = 'driver';
  currentPage = 1;
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada pengantaran</div><div style="font-size:11px;color:#64748b">Order yang kamu selesaikan muncul di sini</div></div>`;
  }
  return `<div class="card"><h3>🚚 Histori Pengantaran (${orders.length})</h3>
    <div id="historyPaginatedContainer" style="margin-top:12px">${viewHistoryDriverInner(orders.slice(0,perPage))}</div>
    <div id="historyPagination"></div>
  </div>`;
}

// Call after initial render to setup pagination buttons
setTimeout(()=>{
  if(typeof document !== 'undefined'){
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-history-page]');
      if(!btn) return;
      const val = btn.getAttribute('data-history-page');
      if(val==='prev'){ if(currentPage>1){ currentPage--; renderPaginatedHistory(); } }
      else if(val==='next'){ const totalPages = Math.ceil(currentOrders.length/perPage); if(currentPage<totalPages){ currentPage++; renderPaginatedHistory(); } }
      else { const p = parseInt(val); if(!isNaN(p)){ currentPage = p; renderPaginatedHistory(); } }
      // scroll to top of history
      document.getElementById('historyPaginatedContainer')?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }
}, 500);

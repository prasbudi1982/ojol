// history.js - Histori order + Pagination 5 per halaman, max 20 fetch
import { supabase } from './supabase.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export async function getPassengerHistory(passengerId, limit=20){
  const { data, error } = await supabase.from('orders')
    .select('*, driver:driver_id(id,name,nopol,jenis_kendaraan)')
    .eq('passenger_id', passengerId)
    .order('created_at',{ascending:false})
    .limit(limit);
  if(error) return [];
  return data||[];
}

export async function getDriverHistory(driverId, limit=20){
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

let currentPage = 1;
const perPage = 5;
let currentOrders = [];
let currentType = 'passenger';

export function setHistoryPage(page){
  currentPage = page;
  renderPaginatedHistory();
}

function renderPaginatedHistory(){
  const container = document.getElementById('historyPaginatedContainer');
  const pagEl = document.getElementById('historyPagination');
  if(!container || !pagEl) return;
  const theme = getAppTheme();
  const total = currentOrders.length;
  const totalPages = Math.ceil(total / perPage) || 1;
  if(currentPage < 1) currentPage = 1;
  if(currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage-1)*perPage;
  const end = start + perPage;
  const pageOrders = currentOrders.slice(start, end);
  
  container.innerHTML = currentType==='driver' ? viewHistoryDriverInner(pageOrders) : viewHistoryPassangerInner(pageOrders);
  
  // Navigasi pagination - selalu tampil
  if(total===0){
    pagEl.innerHTML = '';
    return;
  }
  let btns = '';
  for(let i=1;i<=totalPages;i++){
    const active = i===currentPage;
    btns += `<button data-history-page="${i}" style="min-width:38px;padding:8px 10px;border-radius:10px;border:1px solid ${active?theme.primary:'var(--border)'};background:${active?theme.primary:'var(--card)'};color:${active?'#052e16':'var(--text)'};font-weight:800;font-size:12px;cursor:pointer">${i}</button>`;
  }
  pagEl.innerHTML = `
    <div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:16px;flex-wrap:wrap">
      <button data-history-page="prev" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;font-weight:700;cursor:pointer" ${currentPage===1?'disabled':''}>‹ Prev</button>
      ${btns}
      <button data-history-page="next" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:11px;font-weight:700;cursor:pointer" ${currentPage===totalPages?'disabled':''}>Next ›</button>
    </div>
    <div style="text-align:center;font-size:10px;color:var(--muted);margin-top:8px">Hal ${currentPage} dari ${totalPages} • ${total} total • 5/hal • max 20 fetch</div>
  `;
}

function viewHistoryPassangerInner(orders){
  const theme = getAppTheme();
  if(!orders || orders.length===0){
    return `<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;background:var(--card);border:1px dashed var(--border);border-radius:12px">Tidak ada data di halaman ini</div>`;
  }
  return orders.map(o=>{
    const stColor = o.status==='completed' ? theme.primary : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
    const date = new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--card);margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--muted)">${date}</span>
        <span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--text);line-height:1.4">
        <div>📍 ${o.pickup_text||o.pickup||''}</div>
        <div style="margin-top:2px">🎯 ${o.dest_text||o.destination||''}</div>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--muted)">${o.vehicle_type==='mobil'?'🚗':'🏍️'} ${o.distance_km?.toFixed?o.distance_km.toFixed(1):o.distance_km||'-'} km • ${o.driver?.name||'Driver -'}</span>
        <span style="font-weight:800;font-size:12px;color:var(--text)">Rp ${(o.estimated_cost||0).toLocaleString('id-ID')}</span>
      </div>
      ${o.status==='completed' && o.driver_id ? `<div style="margin-top:10px;display:flex;gap:6px">
        <button data-rate-driver="${o.driver_id}" data-rate-order="${o.id}" data-rate-name="${o.driver?.name||'Driver'}" style="flex:1;background:${theme.primary};color:#052e16;border:none;padding:8px;border-radius:10px;font-size:11px;font-weight:800;cursor:pointer">⭐ Beri Rating</button>
        <a href="https://www.google.com/maps/dir/${o.pickup_lat||''},${o.pickup_lng||''}/${o.dest_lat||''},${o.dest_lng||''}" target="_blank" style="background:var(--card2);border:1px solid var(--border);padding:8px 10px;border-radius:10px;font-size:11px;text-decoration:none;color:var(--text)">🗺️</a>
      </div>` : ''}
    </div>`;
  }).join('');
}

function viewHistoryDriverInner(orders){
  const theme = getAppTheme();
  if(!orders || orders.length===0){
    return `<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;background:var(--card);border:1px dashed var(--border);border-radius:12px">Tidak ada data di halaman ini</div>`;
  }
  return orders.map(o=>{
    const stColor = o.status==='completed' ? theme.primary : o.status==='cancelled' ? '#ef4444' : '#f59e0b';
    const date = new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:${o.status==='completed'?'var(--card)':'var(--card)'};margin-bottom:10px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;color:var(--muted)">${date} • ${o.passenger?.name||'Penumpang'}</span>
        <span style="background:${stColor};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${o.status.toUpperCase()}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:var(--text)">
        <div>📍 ${o.pickup_text||o.pickup||''}</div>
        <div style="margin-top:2px">🎯 ${o.dest_text||o.destination||''}</div>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between">
        <span style="font-size:11px;color:var(--muted)">📏 ${o.distance_km?.toFixed?o.distance_km.toFixed(1):'-'} km • ${o.vehicle_type||'motor'}</span>
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
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada histori order</div><div style="font-size:11px;color:var(--muted)">Order selesai akan muncul di sini</div></div>`;
  }
  // Render awal + pagination langsung
  const inner = viewHistoryPassangerInner(orders.slice(0,perPage));
  setTimeout(()=> renderPaginatedHistory(), 50);
  return `<div class="card"><h3>📜 Histori Order Saya (${orders.length})</h3>
    <div id="historyPaginatedContainer" style="margin-top:12px">${inner}</div>
    <div id="historyPagination" style="min-height:60px"></div>
  </div>`;
}

export function viewHistoryDriver(orders){
  currentOrders = orders||[];
  currentType = 'driver';
  currentPage = 1;
  if(!orders || orders.length===0){
    return `<div class="card" style="text-align:center;padding:24px"><div style="font-size:32px">📭</div><div style="margin-top:8px;font-weight:700">Belum ada pengantaran</div><div style="font-size:11px;color:var(--muted)">Order yang kamu selesaikan muncul di sini</div></div>`;
  }
  const inner = viewHistoryDriverInner(orders.slice(0,perPage));
  setTimeout(()=> renderPaginatedHistory(), 50);
  return `<div class="card"><h3>🚚 Histori Pengantaran (${orders.length})</h3>
    <div id="historyPaginatedContainer" style="margin-top:12px">${inner}</div>
    <div id="historyPagination" style="min-height:60px"></div>
  </div>`;
}

// Global click handler untuk pagination
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
}

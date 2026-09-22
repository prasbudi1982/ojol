
// tracking.js - ADAPTIF TEMA HP
import { supabase } from './supabase.js';
import { haversineKm } from './geofence.js';
import { ACTIVE_KECAMATAN_NAME } from './config.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b', appName: s.appName||'Ojol Suruh' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b', appName:'Ojol Suruh' }; }
}

export function showTrackingLockModal(order){
  let modal = document.getElementById('trackingLockModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'trackingLockModal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const statusText = order.status==='accepted' ? 'Driver OTW' : order.status==='picked' ? 'Diantar' : 'Mencari driver';
  div.innerHTML = `
    <div style="background:var(--card);border-radius:18px;max-width:360px;width:100%;overflow:hidden;box-shadow:0 20px 50px var(--shadow);border:2px solid ${theme.primary}">
      <div style="background:${theme.primary};color:white;padding:16px;text-align:center">
        <div style="font-size:32px">🔒</div>
        <div style="font-weight:800;font-size:15px;margin-top:6px">Order Aktif Berjalan</div>
        <div style="font-size:11px;opacity:0.9;margin-top:2px">Selesaikan atau batalkan dulu</div>
      </div>
      <div style="padding:16px;background:var(--card)">
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:12px;color:var(--text)">
          <div>📍 ${order.pickup_text||order.pickup||''}</div>
          <div style="margin-top:4px">🎯 ${order.dest_text||order.destination||''}</div>
          <div style="margin-top:6px"><span style="background:${theme.primary};color:white;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800">${statusText.toUpperCase()}</span> <span style="font-size:11px;color:var(--muted)">ID ${order.id.slice(0,6).toUpperCase()}</span></div>
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button id="btnGotoTracking" style="background:${theme.primary};color:white;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px">📍 Lihat Tracking Driver</button>
          <button id="btnCancelFromLock" style="background:var(--card2);border:1px solid var(--border);color:#ef4444;padding:10px;border-radius:10px;font-weight:700;font-size:12px">❌ Batalkan Order</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById('btnGotoTracking')?.addEventListener('click', ()=>{ div.remove(); });
  document.getElementById('btnCancelFromLock')?.addEventListener('click', async ()=>{
    if(!confirm('Batalkan order aktif?')) return;
    try{ const { supabase } = await import('./supabase.js'); await supabase.from('orders').update({status:'cancelled'}).eq('id', order.id); }catch(e){}
    clearActiveTracking(); hideTrackingUI(); div.remove();
  });
}
export function hideTrackingLockModal(){ const m = document.getElementById('trackingLockModal'); if(m) m.remove(); }

// ... (fungsi lain tetap sama, hanya pastikan semua innerHTML pakai var(--card) var(--border) var(--text))
// Untuk singkat, copy fungsi loadActiveTracking dll dari file asli tapi ganti warna hardcode jadi var
// Di sini aku sertakan versi minimal yang sudah adaptif untuk modal detail
export function ensureTrackingDetailModal(){
  if(document.getElementById('trackingDetailModal')) return;
  const div = document.createElement('div');
  div.id='trackingDetailModal';
  div.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9997;align-items:center;justify-content:center;padding:12px';
  div.innerHTML = `<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow:auto"><div id="trackingDetailContent" style="padding:12px"></div></div>`;
  document.body.appendChild(div);
}
export function hideTrackingUI(){ const m=document.getElementById('trackingDetailModal'); if(m) m.style.display='none'; }
export function clearActiveTracking(){ localStorage.removeItem('active_order_id'); hideTrackingUI(); }
export function startTracking(orderId){ localStorage.setItem('active_order_id', orderId); }
export async function loadActiveTracking(){ ensureTrackingDetailModal(); /* ... */ }

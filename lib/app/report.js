// report.js - Fitur Laporan Driver/Penumpang -> masuk ke Admin Dashboard
import { supabase } from './supabase.js';

export const REPORT_REASONS = [
  { id: 'spam', label: '🚫 Spam / Order Palsu' },
  { id: 'rude', label: '😡 Bahasa Kasar / Tidak Sopan' },
  { id: 'tarif', label: '💰 Minta Tarif Tidak Wajar' },
  { id: 'unsafe', label: '⚠️ Berkendara Tidak Aman' },
  { id: 'fake_location', label: '📍 Lokasi Palsu / Tidak Sesuai' },
  { id: 'no_show', label: '🚷 Tidak Datang / No Show' },
  { id: 'other', label: '📝 Lainnya' }
];

export function openReportModal(reportedId, reportedName, reportedRole, orderId=null){
  const modal = document.getElementById('reportModal');
  if(!modal){
    createReportModal();
    return openReportModal(reportedId, reportedName, reportedRole, orderId);
  }
  document.getElementById('reportReportedId').value = reportedId;
  document.getElementById('reportReportedName').textContent = reportedName || reportedId;
  document.getElementById('reportReportedRole').textContent = reportedRole || '-';
  document.getElementById('reportOrderId').value = orderId||'';
  document.getElementById('reportReason').value = '';
  document.getElementById('reportDesc').value = '';
  document.getElementById('reportStatus').textContent = '';
  modal.style.display = 'flex';
}

export function closeReportModal(){
  const modal = document.getElementById('reportModal');
  if(modal) modal.style.display = 'none';
}

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary: '#16a34a', secondary: '#f59e0b' }; }
}

function createReportModal(){
  if(document.getElementById('reportModal')) return;
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id = 'reportModal';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.75);backdrop-filter:blur(6px);z-index:9999;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `
    <div style="background:#0f172a;border:2px solid ${theme.primary};border-radius:18px;max-width:440px;width:100%;padding:0;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.4);color:#e2e8f0">
      <div style="background:${theme.primary};padding:14px 16px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;color:white;font-size:15px;font-weight:800">🚩 Laporkan Akun</h3>
        <button id="btnCloseReport" style="border:none;background:rgba(255,255,255,0.2);color:white;border-radius:50%;width:32px;height:32px;font-weight:800;cursor:pointer">✕</button>
      </div>
      <div style="padding:16px">
        <input type="hidden" id="reportReportedId">
        <input type="hidden" id="reportOrderId">
        <div style="font-size:13px;margin-bottom:12px;background:#1e293b;padding:10px;border-radius:10px;border:1px solid #334155">Melaporkan: <b id="reportReportedName" style="color:white"></b> <span style="background:${theme.secondary};color:#0f172a;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:800" id="reportReportedRole"></span></div>
        <label style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px">ALASAN LAPORAN*</label>
        <select id="reportReason" style="width:100%;padding:12px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;margin:6px 0 12px;font-size:13px">
          <option value="">-- Pilih Alasan --</option>
          <option value="spam">🚫 Spam / Order Palsu</option>
          <option value="rude">😡 Bahasa Kasar</option>
          <option value="tarif">💰 Tarif Tidak Wajar</option>
          <option value="unsafe">⚠️ Berkendara Tidak Aman</option>
          <option value="fake_location">📍 Lokasi Palsu</option>
          <option value="no_show">🚷 Tidak Datang</option>
          <option value="other">📝 Lainnya</option>
        </select>
        <label style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px">DESKRIPSI DETAIL</label>
        <textarea id="reportDesc" placeholder="Ceritakan kejadian dengan jujur..." style="width:100%;height:90px;padding:10px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;margin:6px 0;font-size:13px;resize:none"></textarea>
        <div id="reportStatus" style="font-size:12px;margin:8px 0;min-height:16px"></div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button id="btnSubmitReport" class="btn primary" style="flex:1;background:#ef4444;color:white;border:none;padding:12px;border-radius:12px;font-weight:800;font-size:13px">🚩 Kirim Laporan</button>
          <button id="btnCancelReport" class="btn secondary" style="flex:1;background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:12px;border-radius:12px;font-weight:700">Batal</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
  // Close on backdrop click
  div.addEventListener('click', (e)=>{ if(e.target===div) closeReportModal(); });
}

export async function submitReport(currentProfile){
  const reportedId = document.getElementById('reportReportedId')?.value;
  const orderId = document.getElementById('reportOrderId')?.value||null;
  const reason = document.getElementById('reportReason')?.value;
  const desc = document.getElementById('reportDesc')?.value?.trim();
  const statusEl = document.getElementById('reportStatus');
  if(!reportedId) return false;
  if(!reason){ if(statusEl) statusEl.textContent='❌ Pilih alasan dulu'; return false; }
  if(statusEl) statusEl.textContent='⏳ Mengirim...';
  try{
    const payload = { reported_id: reportedId, reporter_id: currentProfile.id, order_id: orderId||null, reason, description: desc||null, status: 'pending', created_at: new Date().toISOString() };
    const { error } = await supabase.from('reports').insert(payload);
    if(error) throw error;
    if(statusEl) statusEl.textContent='✅ Laporan terkirim';
    setTimeout(()=>closeReportModal(), 1200);
    return true;
  }catch(e){
    const localReports = JSON.parse(localStorage.getItem('local_reports')||'[]');
    localReports.push({ id: Date.now(), reported_id:reportedId, reporter_id:currentProfile.id, order_id:orderId, reason, description:desc, status:'pending', created_at:new Date().toISOString(), reporter_name:currentProfile.name, reported_name: document.getElementById('reportReportedName')?.textContent });
    localStorage.setItem('local_reports', JSON.stringify(localReports));
    if(statusEl) statusEl.textContent='✅ Disimpan lokal (buat tabel reports biar masuk DB)';
    setTimeout(()=>closeReportModal(), 1500);
    return true;
  }
}

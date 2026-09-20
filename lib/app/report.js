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

function createReportModal(){
  if(document.getElementById('reportModal')) return;
  const div = document.createElement('div');
  div.id = 'reportModal';
  div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `
    <div style="background:white;border-radius:16px;max-width:420px;width:100%;padding:16px;max-height:90vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">🚩 Laporkan Akun</h3>
        <button id="btnCloseReport" style="border:none;background:#eee;border-radius:50%;width:32px;height:32px">✕</button>
      </div>
      <input type="hidden" id="reportReportedId">
      <input type="hidden" id="reportOrderId">
      <div style="font-size:13px;margin-bottom:8px">Melaporkan: <b id="reportReportedName"></b> (<span id="reportReportedRole"></span>)</div>
      <label style="font-size:12px">Alasan Laporan*</label>
      <select id="reportReason" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin:6px 0 12px">
        <option value="">-- Pilih Alasan --</option>
        <option value="spam">🚫 Spam / Order Palsu</option>
        <option value="rude">😡 Bahasa Kasar</option>
        <option value="tarif">💰 Tarif Tidak Wajar</option>
        <option value="unsafe">⚠️ Berkendara Tidak Aman</option>
        <option value="fake_location">📍 Lokasi Palsu</option>
        <option value="no_show">🚷 Tidak Datang</option>
        <option value="other">📝 Lainnya</option>
      </select>
      <label style="font-size:12px">Deskripsi Detail</label>
      <textarea id="reportDesc" placeholder="Ceritakan kejadian..." style="width:100%;height:80px;padding:8px;border-radius:8px;border:1px solid #ccc;margin:6px 0"></textarea>
      <div id="reportStatus" style="font-size:12px;margin:6px 0"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="btnSubmitReport" class="btn primary" style="flex:1;background:#ef4444">🚩 Kirim Laporan</button>
        <button id="btnCancelReport" class="btn secondary" style="flex:1">Batal</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
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

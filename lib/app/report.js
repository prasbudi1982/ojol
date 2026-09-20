// report.js - Modul Laporkan Pengguna & Banned Google Account v1.0
// Dibuat tanpa merubah fungsi lain, hanya modul baru
import { supabase } from './supabase.js';

export const REPORT_REASONS = [
  'Penipuan / Fraud',
  'Pelecehan / Kekerasan',
  'Nopol / Data Palsu',
  'Tarif tidak wajar / Memeras',
  'Keterlambatan parah / No-show',
  'Barang hilang / Pencurian',
  'Ujaran kebencian / SARA',
  'Spam / Penyalahgunaan kontak',
  'Lainnya'
];

// ===== REPORT USER =====
export async function reportUser({ reportedUserId, reportedGoogleId, reportedEmail, reason, description, orderId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Harus login');

  const { data: profile } = await supabase.from('users').select('id').eq('google_id', user.id).single();
  if (!profile) throw new Error('Profil tidak ditemukan');

  const payload = {
    reporter_id: profile.id,
    reported_id: reportedUserId || null,
    reported_google_id: reportedGoogleId || null,
    reported_email: reportedEmail || null,
    reason: reason,
    description: description?.trim() || null,
    order_id: orderId,
    status: 'pending'
  };

  const { data, error } = await supabase.from('reports').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function getReports(status = null) {
  let q = supabase.from('reports').select('*, reporter:reporter_id(name,email), reported:reported_id(name,email,google_id)').order('created_at', { ascending: false }).limit(100);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getMyReports() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('users').select('id').eq('google_id', user.id).single();
  const { data, error } = await supabase.from('reports').select('*').eq('reporter_id', me.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ===== BANNED LOGIC =====
export async function checkIsBanned(googleId) {
  if (!googleId) return { banned: false };
  const { data, error } = await supabase.from('banned_users').select('*').eq('google_id', googleId).eq('is_active', true).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return { banned: !!data, detail: data || null };
}

export async function checkEmailBanned(email) {
  if (!email) return { banned: false };
  const { data } = await supabase.from('banned_users').select('*').eq('email', email).eq('is_active', true).maybeSingle();
  return { banned: !!data, detail: data || null };
}

export async function banUser({ googleId, email, reason, reportId = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  let bannedBy = null;
  try {
    const { data: me } = await supabase.from('users').select('id').eq('google_id', user.id).single();
    bannedBy = me?.id || null;
  } catch {}

  // 1. Insert ke banned_users
  const { data: banned, error: banErr } = await supabase.from('banned_users').upsert({
    google_id: googleId,
    email: email,
    reason: reason,
    banned_by: bannedBy,
    report_id: reportId,
    is_active: true,
    banned_at: new Date().toISOString()
  }, { onConflict: 'google_id' }).select().single();
  if (banErr) throw banErr;

  // 2. Update users.is_banned = true jika ada
  try {
    if (googleId) {
      await supabase.from('users').update({ is_banned: true, banned_reason: reason }).eq('google_id', googleId);
    }
    if (email && !googleId) {
      await supabase.from('users').update({ is_banned: true, banned_reason: reason }).eq('email', email);
    }
  } catch (e) { console.warn('update users banned flag fail', e.message); }

  // 3. Update report status jika ada
  if (reportId) {
    try { await supabase.from('reports').update({ status: 'banned' }).eq('id', reportId); } catch {}
  }

  // 4. Hapus driver_locations jika driver
  try {
    if (googleId) {
      const { data: u } = await supabase.from('users').select('id').eq('google_id', googleId).single();
      if (u) await supabase.from('driver_locations').delete().eq('driver_id', u.id);
    }
  } catch {}

  return banned;
}

export async function unbanUser(googleId) {
  const { error } = await supabase.from('banned_users').update({ is_active: false }).eq('google_id', googleId);
  if (error) throw error;
  try {
    await supabase.from('users').update({ is_banned: false, banned_reason: null }).eq('google_id', googleId);
  } catch {}
  return true;
}

export async function getBannedUsers() {
  const { data, error } = await supabase.from('banned_users').select('*, banner:banned_by(name,email), report:report_id(reason)').eq('is_active', true).order('banned_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data;
}

// ===== HELPER UNTUK APP.JS =====
export async function submitReportFromUI(reportedId, reportedGoogleId, reportedEmail, reportedName) {
  const reasonEl = document.getElementById('reportReason');
  const descEl = document.getElementById('reportDesc');
  const statusEl = document.getElementById('reportStatus');
  const reason = reasonEl?.value;
  const desc = descEl?.value?.trim();

  if (!reason) { if (statusEl) statusEl.textContent = '❌ Pilih alasan'; return; }
  if (!desc || desc.length < 10) { if (statusEl) statusEl.textContent = '❌ Deskripsi minimal 10 karakter'; return; }

  if (statusEl) statusEl.textContent = '⏳ Mengirim laporan...';
  try {
    const report = await reportUser({
      reportedUserId: reportedId,
      reportedGoogleId: reportedGoogleId,
      reportedEmail: reportedEmail,
      reason,
      description: desc,
      orderId: localStorage.getItem('active_order_id') || null
    });
    if (statusEl) statusEl.textContent = '✅ Laporan terkirim ID:' + String(report.id).slice(0, 8);
    // auto close modal after 1.2s
    setTimeout(() => {
      const modal = document.getElementById('reportModal');
      if (modal) modal.classList.remove('open');
      if (descEl) descEl.value = '';
    }, 1200);
    alert(`✅ Laporan untuk ${reportedName||'pengguna'} terkirim. Admin akan review.`);
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌ ' + e.message;
    alert('Gagal lapor: ' + e.message);
  }
}

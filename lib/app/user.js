// user.js - Auth & profile
import { supabase } from './supabase.js';

export async function getSession(){ const { data } = await supabase.auth.getSession(); return data.session; }

export async function getProfile(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return null;
  const { data, error } = await supabase.from('users').select('*').eq('google_id', user.id).single();
  if(error && error.code==='PGRST116'){
    const { data:created } = await supabase.from('users').insert({ google_id:user.id, name:user.user_metadata.full_name || user.email, email:user.email, picture:user.user_metadata.avatar_url, role:'passenger', status:'active' }).select().single();
    return created;
  }
  if(error) throw error; return data;
}

export async function deleteAccount(profileId){
  // 1. hapus lokasi driver
  try{ await supabase.from('driver_locations').delete().eq('driver_id', profileId); }catch(e){}
  // 2. hapus orders terkait (jika RLS allow, kalau tidak akan di-skip)
  try{ await supabase.from('orders').delete().eq('passenger_id', profileId); }catch(e){}
  try{ await supabase.from('orders').delete().eq('driver_id', profileId); }catch(e){}
  // 3. hapus user di tabel users
  const { error } = await supabase.from('users').delete().eq('id', profileId);
  if(error) throw error;
  // 4. logout auth
  await supabase.auth.signOut();
}

// ===== VIEW PROFILE - di dalam modul user (penting) =====
export function viewProfile(p){
  if(!p) return `<div class="card">Belum login</div>`;
  const isDriver = p.role==='driver';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  return `<div class="card"><h3>👤 Profil Saya</h3>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div style="flex:1"><b style="font-size:15px">${p.name||''}</b><br/><span class="muted" style="font-size:11px;line-height:1.6">📧 ${p.email}<br/>${isDriver?'🏍️ Driver':'🧍 Penumpang'} • HP: ${hp||'-'}<br/>${!isDriver?`Desa: ${desa||'-'}<br/>Alamat: ${alamat||'-'}`:`${p.jenis_kendaraan||''} • ${p.nopol||''} • SIM ${p.tipe_sim||''}`}<br/>ID: ${String(p.id).slice(0,8)}</span></div>
      <button id="btnEditProfile" class="btn secondary" style="width:auto;padding:8px 14px;flex-shrink:0">✏️ Edit</button>
    </div>
    <div class="row"><button id="btnLogout" class="btn secondary">Logout</button></div>
  </div>
  <div id="profileEditForm" style="display:none" class="card"><h3>✏️ Edit Profil</h3>
    <label>Nama Lengkap<input id="editName" value="${p.name||''}" placeholder="Nama sesuai KTP"></label>
    <label>Peran / Role<select id="profileRole"><option value="passenger" ${!isDriver?'selected':''}>🧍 Penumpang</option><option value="driver" ${isDriver?'selected':''}>🏍️ Driver</option></select></label>
    <label>HP WA (wajib)<div class="row" style="gap:8px;align-items:center;margin-top:6px"><input id="profileHp" value="${hp}" placeholder="08xxx" style="flex:4;min-width:0"><span class="muted" style="flex:0 0 48px;font-size:10px">WA aktif</span></div></label>
    <div id="profilePassengerFields" style="display:${!isDriver?'block':'none'};border:1px solid #22c55e;padding:12px;border-radius:12px;margin-top:12px;background:rgba(34,197,94,0.06)">
      <b style="font-size:13px">🧍 Detail Penumpang</b>
      <label>Desa / Dusun di Suruh<input id="profileDesa" value="${desa}" placeholder="Contoh: Suruh, Nglongsor, Gamping"></label>
      <label>Alamat Lengkap / Patokan Rumah<textarea id="profileAlamat" rows="2" placeholder="Contoh: RT 02 RW 01, barat masjid, rumah cat hijau">${alamat}</textarea></label>
      <label>Catatan Jemput (opsional)<input id="profileCatatan" value="${p.catatan||''}" placeholder="Contoh: tunggu di depan warung"></label>
    </div>
    <div id="profileDriverFields" style="display:${isDriver?'block':'none'};border:1px solid #3b82f6;padding:12px;border-radius:12px;margin-top:12px;background:rgba(59,130,246,0.06)">
      <b style="font-size:13px">🏍️ Detail Driver</b>
      <label>Jenis Kendaraan (wajib)
        <div class="row" style="gap:8px;margin-top:6px">
          <label style="flex:1;border:${(p.jenis_kendaraan||'motor')==='motor'?'2px solid #22c55e':'1px solid #334155'};border-radius:10px;padding:8px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="motor" ${(p.jenis_kendaraan||'motor')==='motor'?'checked':''} style="display:none">🏍️<br/>Motor</label>
          <label style="flex:1;border:${p.jenis_kendaraan==='mobil'?'2px solid #22c55e':'1px solid #334155'};border-radius:10px;padding:8px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="mobil" ${p.jenis_kendaraan==='mobil'?'checked':''} style="display:none">🚗<br/>Mobil</label>
        </div>
      </label>
      <label>Nopol Kendaraan<input id="profileNopol" value="${p.nopol||''}" placeholder="AG 1234 XX"></label>
      <label>Tipe SIM<select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p.tipe_sim==='A'?'selected':''}>A - Mobil</option><option value="C" ${p.tipe_sim==='C'?'selected':''}>C - Motor</option><option value="B1" ${p.tipe_sim==='B1'?'selected':''}>B1</option><option value="B2" ${p.tipe_sim==='B2'?'selected':''}>B2</option></select></label>
      <label>Tipe Kendaraan Detail<input id="profileTipe" value="${p.tipe_motor||''}" placeholder="Contoh: Vario 125 Hitam / Avanza Putih"></label>
    </div>
    <div class="row" style="margin-top:14px"><button id="btnSaveProfileRole" class="btn primary">💾 Simpan Perubahan</button><button id="btnCancelEdit" class="btn secondary">Batal</button></div>
    <p id="profileStatus" class="muted" style="margin-top:8px"></p>
  </div>
  <div class="card" style="border:1px solid #22c55e;background:rgba(34,197,94,0.07)"><h4 style="margin:0 0 8px">🔔 Notifikasi Push</h4><p class="muted" style="font-size:11px;line-height:1.5">Aktifkan biar dapat notifikasi order masuk (driver) & driver ditemukan (penumpang) walau HP terkunci.</p><div class="row" style="gap:8px"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan Notifikasi</button><button id="btnDisablePush" class="btn secondary" style="flex:0 0 80px">Matikan</button></div><p id="pushStatus" class="muted" style="font-size:11px;margin-top:6px"></p></div>
  <div class="card" style="border:1px solid #ef4444;background:rgba(239,68,68,0.06)"><h4 style="color:#ef4444;margin:0 0 8px">🗑️ Zona Bahaya - Hapus Akun</h4><p class="muted" style="font-size:11px;line-height:1.5">Menghapus akun akan menghapus semua data profil, lokasi driver, dan order terkait. Tidak bisa dibatalkan. Ketik <b>HAPUS</b> untuk konfirmasi.</p><label>Konfirmasi ketik HAPUS<input id="confirmDelete" placeholder="HAPUS" style="border-color:#ef4444"></label><button id="btnDeleteAccount" class="btn" style="background:#ef4444;color:white;margin-top:8px">🗑️ Hapus Akun Permanen</button><p id="deleteStatus" class="muted" style="font-size:11px;margin-top:6px"></p></div>`;
}

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

// ===== VIEW PROFILE - STYLE SESUAI style.css - FINAL =====
export function viewProfile(p){
  if(!p) return `<div class="card"><div style="text-align:center;padding:20px"><div style="font-size:32px">🔒</div><b>Belum login</b><p class="muted">Silakan login dulu</p><a href="#/login" class="btn primary">Login</a></div></div>`;
  const isDriver = p.role==='driver';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  const pic = p.picture||p.avatar_url||'';
  const initial = (p.name||p.email||'U').charAt(0).toUpperCase();
  const roleBadge = isDriver 
    ? `<span style="background:linear-gradient(135deg,#3b82f6,#60a5fa);color:white;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.5px">🏍️ DRIVER</span>`
    : `<span style="background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#111;padding:3px 10px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.5px">🧍 PENUMPANG</span>`;
  const idShort = String(p.id).slice(0,8).toUpperCase();

  return `
  <!-- HEADER PROFIL -->
  <div class="card" style="padding:0;overflow:hidden;border:1px solid var(--border)">
    <div style="background:linear-gradient(135deg, var(--card2), var(--card));padding:18px 16px 14px;display:flex;gap:14px;align-items:center">
      <div style="width:56px;height:56px;border-radius:16px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
        ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:22px;font-weight:800;color:var(--primary)">${initial}</span>`}
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:16px;letter-spacing:.2px">${p.name||''}</b> ${roleBadge}
        </div>
        <div class="muted" style="font-size:12px;margin-top:4px;line-height:1.5">
          📧 ${p.email||'-'}<br/>
          <span style="display:inline-flex;align-items:center;gap:4px">📱 ${hp||'<span style="opacity:.6">Belum isi HP</span>'} </span> • <span style="font-size:10px;opacity:.7">ID ${idShort}</span>
        </div>
      </div>
      <button id="btnEditProfile" class="btn secondary" style="width:auto;padding:8px 12px;border-radius:10px;opacity:1;background:var(--card);border:1px solid var(--border)">✏️ Edit</button>
    </div>
    <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--bg)">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px">
        <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.6px">Desa / Alamat</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${!isDriver ? `${desa||'-'} • ${alamat ? alamat.slice(0,28)+(alamat.length>28?'...':'') : '-'}` : `${p.jenis_kendaraan||'motor'} • ${p.nopol||'-'}`}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px">
        <div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.6px">${isDriver ? 'SIM • Kendaraan' : 'Catatan Jemput'}</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${isDriver ? `${p.tipe_sim||'-'} • ${p.tipe_motor||'-'}` : `${p.catatan||'-'}`}</div>
      </div>
    </div>
    <div style="padding:12px 16px" class="row"><button id="btnLogout" class="btn secondary" style="opacity:1">🚪 Logout</button></div>
  </div>

  <!-- FORM EDIT -->
  <div id="profileEditForm" style="display:none" class="card">
    <h3 style="margin:0 0 12px;display:flex;align-items:center;gap:8px">✏️ Edit Profil <span class="muted" style="font-size:11px;font-weight:400">Lengkapi biar order lancar</span></h3>
    <label>Nama Lengkap<input id="editName" value="${p.name||''}" placeholder="Nama sesuai KTP"></label>
    <label>Peran / Role<select id="profileRole"><option value="passenger" ${!isDriver?'selected':''}>🧍 Penumpang</option><option value="driver" ${isDriver?'selected':''}>🏍️ Driver</option></select></label>
    <label>HP WA (wajib)<div class="row" style="gap:8px;margin-top:6px"><input id="profileHp" value="${hp}" placeholder="08xxx" style="flex:1"><span class="badge" style="flex:0 0 auto">WA aktif</span></div></label>
    
    <div id="profilePassengerFields" style="display:${!isDriver?'block':'none'};margin-top:14px">
      <div style="border-left:3px solid var(--primary);padding-left:10px;margin-bottom:8px"><b style="font-size:13px">🧍 Detail Penumpang</b><div class="muted" style="font-size:11px">Dipakai driver untuk jemput</div></div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <label>Desa / Dusun di Suruh<input id="profileDesa" value="${desa}" placeholder="Contoh: Suruh, Nglongsor, Gamping"></label>
        <label>Alamat Lengkap / Patokan Rumah<textarea id="profileAlamat" rows="2" placeholder="Contoh: RT 02 RW 01, barat masjid, rumah cat hijau">${alamat}</textarea></label>
        <label>Catatan Jemput (opsional)<input id="profileCatatan" value="${p.catatan||''}" placeholder="Contoh: tunggu di depan warung"></label>
      </div>
    </div>

    <div id="profileDriverFields" style="display:${isDriver?'block':'none'};margin-top:14px">
      <div style="border-left:3px solid #3b82f6;padding-left:10px;margin-bottom:8px"><b style="font-size:13px">🏍️ Detail Driver</b><div class="muted" style="font-size:11px">Wajib lengkap biar penumpang percaya</div></div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px">
        <label>Jenis Kendaraan (wajib)
          <div class="row" style="gap:8px;margin-top:8px">
            <label style="flex:1;background:var(--card);border:${(p.jenis_kendaraan||'motor')==='motor'?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:12px;padding:10px;text-align:center;cursor:pointer;transition:.2s"><input type="radio" name="jenisKendaraan" value="motor" ${(p.jenis_kendaraan||'motor')==='motor'?'checked':''} style="display:none"><span style="font-size:20px">🏍️</span><br/><b style="font-size:12px">Motor</b></label>
            <label style="flex:1;background:var(--card);border:${p.jenis_kendaraan==='mobil'?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:12px;padding:10px;text-align:center;cursor:pointer;transition:.2s"><input type="radio" name="jenisKendaraan" value="mobil" ${p.jenis_kendaraan==='mobil'?'checked':''} style="display:none"><span style="font-size:20px">🚗</span><br/><b style="font-size:12px">Mobil</b></label>
          </div>
        </label>
        <div class="row"><label style="flex:1">Nopol<input id="profileNopol" value="${p.nopol||''}" placeholder="AG 1234 XX"></label><label style="flex:1">Tipe SIM<select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p.tipe_sim==='A'?'selected':''}>A - Mobil</option><option value="C" ${p.tipe_sim==='C'?'selected':''}>C - Motor</option><option value="B1" ${p.tipe_sim==='B1'?'selected':''}>B1</option><option value="B2" ${p.tipe_sim==='B2'?'selected':''}>B2</option></select></label></div>
        <label>Tipe Kendaraan Detail<input id="profileTipe" value="${p.tipe_motor||''}" placeholder="Contoh: Vario 125 Hitam / Avanza Putih"></label>
      </div>
    </div>

    <div class="row" style="margin-top:16px"><button id="btnSaveProfileRole" class="btn primary">💾 Simpan Perubahan</button><button id="btnCancelEdit" class="btn secondary" style="opacity:1">Batal</button></div>
    <p id="profileStatus" class="muted" style="margin-top:8px"></p>
  </div>

  <!-- PUSH -->
  <div class="card" style="border-left:4px solid var(--primary)">
    <h4 style="margin:0 0 6px;display:flex;align-items:center;gap:6px">🔔 Notifikasi Push</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">Aktifkan biar dapat notifikasi order masuk (driver) & driver ditemukan (penumpang) walau HP terkunci.</p>
    <div class="row" style="gap:8px"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan</button><button id="btnDisablePush" class="btn secondary" style="flex:0 0 90px;opacity:1">Matikan</button></div>
    <p id="pushStatus" class="muted" style="font-size:11px;margin-top:8px"></p>
  </div>

  <!-- ZONA BAHAYA -->
  <div class="card" style="border:1px solid rgba(239,68,68,.35);background:linear-gradient(180deg, rgba(239,68,68,.08), var(--card))">
    <h4 style="color:#f87171;margin:0 0 6px;display:flex;align-items:center;gap:6px">🗑️ Zona Bahaya</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">Menghapus akun akan menghapus semua data profil, lokasi driver, dan order terkait. Tidak bisa dibatalkan. Ketik <b style="color:var(--text)">HAPUS</b> untuk konfirmasi.</p>
    <label>Konfirmasi ketik HAPUS<input id="confirmDelete" placeholder="HAPUS" style="border-color:rgba(239,68,68,.5)"></label>
    <div class="row"><button id="btnDeleteAccount" class="btn" style="background:var(--danger);color:white;margin-top:8px">🗑️ Hapus Akun Permanen</button></div>
    <p id="deleteStatus" class="muted" style="font-size:11px;margin-top:8px"></p>
  </div>`;
}

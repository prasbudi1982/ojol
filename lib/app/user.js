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
  try{ await supabase.from('driver_locations').delete().eq('driver_id', profileId); }catch(e){}
  try{ await supabase.from('orders').delete().eq('passenger_id', profileId); }catch(e){}
  try{ await supabase.from('orders').delete().eq('driver_id', profileId); }catch(e){}
  const { error } = await supabase.from('users').delete().eq('id', profileId);
  if(error) throw error;
  await supabase.auth.signOut();
}

export function viewProfile(p){
  if(!p) return `<div class="card"><div style="text-align:center;padding:24px"><div style="font-size:32px">🔒</div><b>Belum login</b><p class="muted">Silakan login dulu</p><a href="#/login" class="btn primary">Login</a></div></div>`;
  const isDriver = p.role==='driver';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  const catatan = p.catatan||'';
  const pic = p.picture||p.avatar_url||'';
  const initial = (p.name||p.email||'U').charAt(0).toUpperCase();
  const idShort = String(p.id).slice(0,8).toUpperCase();
  const fullAddress = (desa ? desa + ' • ' : '') + (alamat||'-');
  const shortAddrDisplay = fullAddress.length>60 ? fullAddress.slice(0,60)+'...' : fullAddress;

  return `
  <!-- HEADER PROFIL - FIX RAPI SESUAI SCREENSHOT -->
  <div class="card" style="padding:0;overflow:hidden;background:var(--card);border:1px solid var(--border);border-radius:20px">
    <div style="padding:20px 16px 16px;position:relative;background:linear-gradient(180deg, var(--card2) 0%, var(--card) 100%)">
      <button id="btnEditProfile" class="btn secondary" style="position:absolute;top:14px;right:14px;width:auto;padding:7px 14px;border-radius:99px;font-size:12px;font-weight:700;opacity:1;background:var(--card2);border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,.25)">✏️ Edit</button>
      
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:64px;height:64px;border-radius:18px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,.2)">
          ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:24px;font-weight:800;color:var(--text)">${initial}</span>`}
        </div>
        <div style="flex:1;min-width:0;padding-right:70px">
          <div style="font-size:18px;font-weight:800;letter-spacing:.2px;line-height:1.2;color:var(--text)">${p.name||'Tanpa Nama'}</div>
          <div style="margin-top:8px;display:inline-flex;align-items:center;padding:5px 12px;border-radius:99px;font-size:11px;font-weight:800;letter-spacing:.6px;background:${isDriver?'#3b82f6':'#f59e0b'};color:${isDriver?'white':'#111'}">${isDriver ? 'DRIVER' : 'PENUMPANG'}</div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;min-width:0">
              <span style="font-size:12px;opacity:.6">📧</span>
              <span style="font-size:12px;color:var(--muted);word-break:break-all;flex:1">${p.email||'-'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:12px;opacity:.6">📱</span>
              <span style="font-size:13px;font-weight:600;color:var(--text)">${hp||'-'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--muted);display:inline-block"></span>
              <span class="muted" style="font-size:11px">ID ${idShort}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="padding:12px;background:var(--bg);display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:12px;min-height:74px">
        <div class="muted" style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Desa / Alamat</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:6px;line-height:1.35;word-break:break-word">${isDriver ? `${p.jenis_kendaraan||'motor'} • ${p.nopol||'-'}` : shortAddrDisplay}</div>
      </div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:12px;min-height:74px">
        <div class="muted" style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">${isDriver ? 'SIM • Kendaraan' : 'Catatan Jemput'}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:6px;line-height:1.35;word-break:break-word">${isDriver ? `${p.tipe_sim||'-'} • ${p.tipe_motor||'-'}` : `${catatan||'-'}`}</div>
      </div>
    </div>

    <div style="padding:12px 12px 14px;background:var(--card)">
      <button id="btnLogout" class="btn secondary" style="opacity:1;background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px">🚪 Logout</button>
    </div>
  </div>

  <!-- FORM EDIT -->
  <div id="profileEditForm" style="display:none" class="card">
    <h3 style="margin:0 0 14px;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px">✏️ Edit Profil <span class="muted" style="font-size:11px;font-weight:400">Lengkapi biar order lancar</span></h3>
    <label>Nama Lengkap<input id="editName" value="${p.name||''}" placeholder="Nama sesuai KTP"></label>
    <label>Peran / Role<select id="profileRole"><option value="passenger" ${!isDriver?'selected':''}>🧍 Penumpang</option><option value="driver" ${isDriver?'selected':''}>🏍️ Driver</option></select></label>
    <label>HP WA (wajib)<div class="row" style="gap:8px;margin-top:6px"><input id="profileHp" value="${hp}" placeholder="08xxx" style="flex:1"><span class="badge" style="flex:0 0 auto">WA aktif</span></div></label>
    
    <div id="profilePassengerFields" style="display:${!isDriver?'block':'none'};margin-top:16px">
      <div style="border-left:3px solid var(--primary);padding-left:10px;margin-bottom:10px"><b style="font-size:13px">🧍 Detail Penumpang</b><div class="muted" style="font-size:11px">Dipakai driver untuk jemput</div></div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
        <label>Desa / Dusun di Suruh<input id="profileDesa" value="${desa}" placeholder="Contoh: Suruh, Nglongsor, Gamping"></label>
        <label>Alamat Lengkap / Patokan Rumah<textarea id="profileAlamat" rows="2" placeholder="Contoh: RT 02 RW 01, barat masjid, rumah cat hijau">${alamat}</textarea></label>
        <label>Catatan Jemput (opsional)<input id="profileCatatan" value="${catatan}" placeholder="Contoh: tunggu di depan warung"></label>
      </div>
    </div>

    <div id="profileDriverFields" style="display:${isDriver?'block':'none'};margin-top:16px">
      <div style="border-left:3px solid #3b82f6;padding-left:10px;margin-bottom:10px"><b style="font-size:13px">🏍️ Detail Driver</b><div class="muted" style="font-size:11px">Wajib lengkap biar penumpang percaya</div></div>
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px">
        <label>Jenis Kendaraan (wajib)
          <div class="row" style="gap:8px;margin-top:8px">
            <label style="flex:1;background:var(--card);border:${(p.jenis_kendaraan||'motor')==='motor'?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:12px;padding:12px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="motor" ${(p.jenis_kendaraan||'motor')==='motor'?'checked':''} style="display:none"><span style="font-size:20px">🏍️</span><br/><b style="font-size:12px">Motor</b></label>
            <label style="flex:1;background:var(--card);border:${p.jenis_kendaraan==='mobil'?'2px solid var(--primary)':'1px solid var(--border)'};border-radius:12px;padding:12px;text-align:center;cursor:pointer"><input type="radio" name="jenisKendaraan" value="mobil" ${p.jenis_kendaraan==='mobil'?'checked':''} style="display:none"><span style="font-size:20px">🚗</span><br/><b style="font-size:12px">Mobil</b></label>
          </div>
        </label>
        <div class="row"><label style="flex:1">Nopol<input id="profileNopol" value="${p.nopol||''}" placeholder="AG 1234 XX"></label><label style="flex:1">Tipe SIM<select id="profileSim"><option value="">Pilih SIM</option><option value="A" ${p.tipe_sim==='A'?'selected':''}>A - Mobil</option><option value="C" ${p.tipe_sim==='C'?'selected':''}>C - Motor</option><option value="B1" ${p.tipe_sim==='B1'?'selected':''}>B1</option><option value="B2" ${p.tipe_sim==='B2'?'selected':''}>B2</option></select></label></div>
        <label>Tipe Kendaraan Detail<input id="profileTipe" value="${p.tipe_motor||''}" placeholder="Contoh: Vario 125 Hitam / Avanza Putih"></label>
      </div>
    </div>

    <div class="row" style="margin-top:18px"><button id="btnSaveProfileRole" class="btn primary">💾 Simpan Perubahan</button><button id="btnCancelEdit" class="btn secondary" style="opacity:1">Batal</button></div>
    <p id="profileStatus" class="muted" style="margin-top:8px"></p>
  </div>

  <!-- PUSH -->
  <div class="card" style="border-left:4px solid var(--primary);border-radius:16px">
    <h4 style="margin:0 0 6px;display:flex;align-items:center;gap:6px">🔔 Notifikasi Push</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 12px">Aktifkan biar dapat notifikasi order masuk (driver) & driver ditemukan (penumpang) walau HP terkunci.</p>
    <div class="row" style="gap:8px"><button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan</button><button id="btnDisablePush" class="btn secondary" style="flex:0 0 90px;opacity:1">Matikan</button></div>
    <p id="pushStatus" class="muted" style="font-size:11px;margin-top:8px"></p>
  </div>


  <!-- THEME ADAPTIF HP -->
  <div class="card" style="border-left:4px solid #8b5cf6;border-radius:16px">
    <h4 style="margin:0 0 6px;display:flex;align-items:center;gap:6px">🎨 Tampilan</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 12px">Ikuti theme HP (Auto) atau pilih manual. Tidak merusak fungsi order.</p>
    <div class="row" style="gap:8px">
      <button onclick="window.setAppTheme('auto')" id="btnThemeAuto" class="btn secondary" style="flex:1;opacity:1;border-radius:10px;font-size:12px">🌓 Auto</button>
      <button onclick="window.setAppTheme('light')" id="btnThemeLight" class="btn secondary" style="flex:1;opacity:1;border-radius:10px;font-size:12px">☀️ Terang</button>
      <button onclick="window.setAppTheme('dark')" id="btnThemeDark" class="btn secondary" style="flex:1;opacity:1;border-radius:10px;font-size:12px">🌙 Gelap</button>
    </div>
    <p class="muted" style="font-size:10px;margin-top:8px">Mode sekarang: <span id="themeStatus" style="font-weight:700;color:var(--text)">Auto (ikut HP)</span></p>
    <script>setTimeout(()=>{try{const m=localStorage.getItem('app_theme')||'auto';const el=document.getElementById('themeStatus');if(el)el.textContent=m==='auto'?`Auto (${window.matchMedia('(prefers-color-scheme: dark)').matches?'Gelap':'Terang'})`:m; document.querySelectorAll('#btnThemeAuto,#btnThemeLight,#btnThemeDark').forEach(b=>b.style.opacity='0.6'); const active=document.getElementById('btnTheme'+m.charAt(0).toUpperCase()+m.slice(1)); if(active) active.style.opacity='1'; active.style.borderColor='var(--primary)';}catch(e){}},100)</script>
  </div>

  <!-- ZONA BAHAYA -->
  <div class="card" style="border:1px solid rgba(239,68,68,.3);background:linear-gradient(180deg, rgba(239,68,68,.08), var(--card));border-radius:16px">
    <h4 style="color:#f87171;margin:0 0 6px;display:flex;align-items:center;gap:6px">🗑️ Zona Bahaya</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 12px">Menghapus akun akan menghapus semua data profil, lokasi driver, dan order terkait. Tidak bisa dibatalkan. Ketik <b style="color:var(--text)">HAPUS</b> untuk konfirmasi.</p>
    <label>Konfirmasi ketik HAPUS<input id="confirmDelete" placeholder="HAPUS" style="border-color:rgba(239,68,68,.4)"></label>
    <div class="row"><button id="btnDeleteAccount" class="btn" style="background:var(--danger);color:white;margin-top:8px;border-radius:12px">🗑️ Hapus Akun Permanen</button></div>
    <p id="deleteStatus" class="muted" style="font-size:11px;margin-top:8px"></p>
  </div>`;
}

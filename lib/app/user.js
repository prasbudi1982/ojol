// user.js - STEP 1: GLOBAL SETTING UNTUK OJOL 2 ARAH
import { supabase } from './supabase.js';
import { SURUH_CENTER, ACTIVE_KECAMATAN_NAME, getActiveKecamatanLive } from './config.js';
import { isInSuruhBbox, isInTrenggalekKab, getActiveKecamatanName, getActiveCenter } from './geofence.js';
import * as mapMod from './map.js';
import { subscribeUser, unsubscribeUser, getPermissionStatus, getNotifSettings, saveNotifSettings, showLocalNotification } from './push.js';

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

function renderNotifSettingsCardStep1(){
  const st = getNotifSettings();
  const perm = (typeof Notification!=='undefined') ? Notification.permission : 'unsupported';
  const isEnabled = st.enabled && localStorage.getItem('push-enabled')==='1' && perm==='granted';
  return `
  <div class="card" style="border-left:4px solid var(--primary);border-radius:16px">
    <h4 style="margin:0 0 8px;display:flex;align-items:center;gap:6px">🔔 Notifikasi Ojol (Step 1 - 2 Arah)</h4>
    <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 12px">Setting global ini mengatur <b>push.js</b>. Aktifkan untuk flow: Penumpang buat order → Driver dapat notif → Driver terima → Penumpang dapat notif Driver OTW → Selesai / Batal.</p>
    
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div><b style="font-size:13px">🔔 Master Ojol</b><div class="muted" style="font-size:10px">Step 1: Penumpang ↔ Driver</div></div>
        <label style="position:relative;display:inline-block;width:44px;height:24px"><input type="checkbox" id="notifMaster" ${st.enabled?'checked':''} style="opacity:0;width:0;height:0"><span style="position:absolute;inset:0;background:${st.enabled?'var(--primary)':'#444'};border-radius:99px;transition:.2s"></span><span style="position:absolute;top:2px;left:${st.enabled?'22px':'2px'};width:20px;height:20px;background:white;border-radius:50%;transition:.2s;display:block"></span></label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:12px"><input type="checkbox" id="notifOjol" ${st.ojol?'checked':''}> 🏍️ Ojol 2 Arah</label>
        <label style="display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:12px"><input type="checkbox" id="notifSound" ${st.sound?'checked':''}> 🔊 Suara</label>
        <label style="display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:12px"><input type="checkbox" id="notifVibration" ${st.vibration?'checked':''}> 📳 Getar</label>
        <div style="background:var(--bg);border:1px dashed var(--border);border-radius:10px;padding:8px 10px;font-size:10px" class="muted">Flow: Insert → Driver Notif, Update accepted → Passenger Notif, picked/completed/cancelled → Passenger Notif, cancelled → Driver Notif</div>
      </div>
    </div>

    <div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:10px;margin-bottom:12px">
      <div style="font-size:11px"><b>Status:</b> <span id="notifPermText">${perm}</span> • <span style="color:${isEnabled?'#16a34a':'#ef4444'}">${isEnabled?'✅ Aktif':'❌ Nonaktif'}</span></div>
      <div class="muted" style="font-size:10px;margin-top:4px">Permission: ${perm} | push-enabled: ${localStorage.getItem('push-enabled')||'0'} | setting: ${JSON.stringify(st)}</div>
    </div>

    <div class="row" style="gap:8px">
      <button id="btnEnablePush" class="btn primary" style="flex:1">🔔 Aktifkan Ojol</button>
      <button id="btnDisablePush" class="btn secondary" style="flex:0 0 100px;opacity:1">Matikan</button>
      <button id="btnTestNotif" class="btn secondary" style="flex:0 0 70px;opacity:1">Test</button>
    </div>
    <p id="pushStatus" class="muted" style="font-size:11px;margin-top:8px">${isEnabled?'✅ Notifikasi Ojol 2 arah aktif':'Klik Aktifkan untuk Step 1'}</p>
  </div>`;
}

export function viewProfile(p){
  if(!p) return `<div class="card"><div style="text-align:center;padding:24px"><div style="font-size:32px">🔒</div><b>Belum login</b><p class="muted">Silakan login dulu</p><a href="#/login" class="btn primary">Login</a></div></div>`;
  const isDriver = p.role==='driver';
  const isMerchant = p.role==='merchant' || p.role==='warung';
  const hp = p.hp||''; const alamat = p.alamat||p.address||''; const desa = p.desa||'';
  const pic = p.picture||p.avatar_url||'';
  const initial = (p.name||p.email||'U').charAt(0).toUpperCase();
  const idShort = String(p.id).slice(0,8).toUpperCase();
  const fullAddress = (desa ? desa + ' • ' : '') + (alamat||'-');
  const shortAddrDisplay = fullAddress.length>60 ? fullAddress.slice(0,60)+'...' : fullAddress;
  const badgeBg = isDriver ? '#3b82f6' : isMerchant ? '#16a34a' : '#f59e0b';
  const badgeColor = (isDriver || isMerchant) ? 'white' : '#111';
  const badgeText = isDriver ? 'DRIVER' : isMerchant ? 'MERCHANT' : 'PENUMPANG';
  const kecName = (()=>{ try{ return getActiveKecamatanName(); }catch(e){ return ACTIVE_KECAMATAN_NAME||'Suruh'; } })();
  const mLat = p.merchant_lat || p.lat || '';
  const mLng = p.merchant_lng || p.lng || '';

  return `
  <div class="card" style="padding:0;overflow:hidden;background:var(--card);border:1px solid var(--border);border-radius:20px">
    <div style="padding:20px 16px 16px;position:relative;background:linear-gradient(180deg, var(--card2) 0%, var(--card) 100%)">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:64px;height:64px;border-radius:18px;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
          ${pic ? `<img src="${pic}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:24px;font-weight:800;color:var(--text)">${initial}</span>`}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:18px;font-weight:800;color:var(--text)">${p.name||'Tanpa Nama'}</div>
          <div style="margin-top:8px;display:inline-flex;align-items:center;padding:5px 12px;border-radius:99px;font-size:11px;font-weight:800;background:${badgeBg};color:${badgeColor}">${badgeText}</div>
          <div class="muted" style="font-size:11px;margin-top:8px">ID ${idShort} • ${kecName} • ${hp||'-'}</div>
        </div>
      </div>
    </div>
  </div>
  ${renderNotifSettingsCardStep1()}
  <div class="card" style="border:1px solid rgba(239,68,68,.3);background:linear-gradient(180deg, rgba(239,68,68,.08), var(--card));border-radius:16px"><h4 style="color:#f87171;margin:0 0 6px">🗑️ Zona Bahaya</h4><label>Konfirmasi ketik HAPUS<input id="confirmDelete" placeholder="HAPUS"></label><div class="row"><button id="btnDeleteAccount" class="btn" style="background:var(--danger);color:white;margin-top:8px">🗑️ Hapus Akun</button></div></div>`;
}

export function bindProfileEditEvents(){
  const roleEl = document.getElementById('profileRole');
  if(roleEl){
    const toggle = ()=>{
      const v = roleEl.value;
      const passEl = document.getElementById('profilePassengerFields');
      const driverEl = document.getElementById('profileDriverFields');
      const merchantEl = document.getElementById('profileMerchantFields');
      if(passEl) passEl.style.display = v==='passenger' ? 'block' : 'none';
      if(driverEl) driverEl.style.display = v==='driver' ? 'block' : 'none';
      if(merchantEl) merchantEl.style.display = (v==='merchant' || v==='warung') ? 'block' : 'none';
    };
    roleEl.addEventListener('change', toggle);
    toggle();
  }
  bindNotifEvents();
}

function bindNotifEvents(){
  const $ = (id)=> document.getElementById(id);
  const master = $('notifMaster');
  const ojol = $('notifOjol');
  const sound = $('notifSound');
  const vib = $('notifVibration');
  const btnEnable = $('btnEnablePush');
  const btnDisable = $('btnDisablePush');
  const btnTest = $('btnTestNotif');
  const statusEl = $('pushStatus');
  const permEl = $('notifPermText');

  function updateUI(){
    const st = getNotifSettings();
    if(permEl) permEl.textContent = Notification.permission;
    if(statusEl){
      const isActive = st.enabled && localStorage.getItem('push-enabled')==='1' && Notification.permission==='granted';
      statusEl.textContent = isActive ? '✅ Step 1 Aktif: Ojol Penumpang ↔ Driver' : '❌ Nonaktif - klik Aktifkan';
      statusEl.style.color = isActive ? '#16a34a' : '#ef4444';
    }
  }
  function saveFromUI(){
    saveNotifSettings({
      enabled: master ? master.checked : true,
      all: master ? master.checked : true,
      ojol: ojol ? ojol.checked : true,
      sound: sound ? sound.checked : true,
      vibration: vib ? vib.checked : true
    });
    updateUI();
  }
  [master, ojol, sound, vib].forEach(el=>{ if(el) el.addEventListener('change', saveFromUI); });

  if(btnEnable){
    btnEnable.addEventListener('click', async ()=>{
      try{
        statusEl.textContent = 'Meminta izin...';
        const perm = await getPermissionStatus();
        if(perm==='denied'){
          alert('Diblokir permanen. Buka Settings Chrome > Notifications > Allow');
          return;
        }
        const { data:{ user } } = await supabase.auth.getUser();
        const { data:profile } = await supabase.from('users').select('id').eq('google_id', user.id).single();
        if(profile) await subscribeUser(profile.id);
        saveNotifSettings({enabled:true, all:true, ojol:true, sound:true, vibration:true});
        if(master) master.checked=true; if(ojol) ojol.checked=true; if(sound) sound.checked=true; if(vib) vib.checked=true;
        updateUI();
        setTimeout(()=> showLocalNotification('✅ Ojol Aktif - Penumpang', 'Kamu akan dapat notif Driver Ditemukan, OTW, Selesai', '/#/passenger', 'ojol'), 500);
        setTimeout(()=> showLocalNotification('🏍️ Ojol Aktif - Driver', 'Kamu akan dapat notif Order Baru masuk', '/#/driver', 'ojol'), 1500);
      }catch(e){ statusEl.textContent='Gagal: '+e.message; alert(e.message); }
    });
  }
  if(btnDisable){
    btnDisable.addEventListener('click', async ()=>{
      await unsubscribeUser();
      saveNotifSettings({enabled:false, all:false});
      if(master) master.checked=false;
      updateUI();
    });
  }
  if(btnTest){
    btnTest.addEventListener('click', ()=>{
      showLocalNotification('📦 Test Driver: Order Baru Masuk', 'Warung Suruh → Nglongsor • Rp 15.000', '/#/driver', 'ojol');
      setTimeout(()=> showLocalNotification('✅ Test Penumpang: Driver Ditemukan!', 'Driver Budi OTW ke pickup', '/#/passenger', 'ojol'), 1200);
      setTimeout(()=> showLocalNotification('🚗 Test Penumpang: Driver OTW', 'Driver mengantar ke tujuan', '/#/passenger', 'ojol'), 2400);
      setTimeout(()=> showLocalNotification('❌ Test Driver: Order Dibatalkan', 'Order dibatalkan penumpang', '/#/driver', 'ojol'), 3600);
    });
  }
  updateUI();
}

if(typeof window !== 'undefined'){
  window.bindProfileEditEvents = bindProfileEditEvents;
}

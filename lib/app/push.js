// push.js - FIX FINAL - Order broadcast + order langsung ke driver semua masuk notifikasi
import { supabase } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';

function urlBase64ToUint8Array(base64String){
  try{
    if(!base64String || typeof base64String !== 'string') throw new Error('VAPID key kosong');
    let s = base64String.trim();
    // Hapus whitespace dan quotes yang kadang kebawa
    s = s.replace(/\s/g,'').replace(/['"]+/g,'');
    const padding = '='.repeat((4 - s.length % 4) % 4);
    const base64 = (s + padding).replace(/-/g,'+').replace(/_/g,'/');
    // Validasi base64 sebelum atob
    if(!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('VAPID key format salah: '+s.slice(0,20));
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
    return out;
  }catch(e){
    console.warn('urlBase64ToUint8Array fail, coba fallback tanpa atob error:', e.message);
    // Fallback: jika VAPID invalid, lempar error yang jelas agar tidak muncul atob warning
    throw new Error('VAPID_PUBLIC_KEY tidak valid / belum di-set di config.js: '+e.message);
  }
}

export async function getPermissionStatus(){
  if(!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, rej)=> setTimeout(()=> rej(new Error('Timeout '+label+' '+ms+'ms')), ms))
  ]);
}

export async function requestNotificationPermission(){
  if(!('Notification' in window)) throw new Error('Browser tidak support Notification (buka di Chrome, bukan WA browser)');
  if(Notification.permission === 'granted') return 'granted';
  if(Notification.permission === 'denied') throw new Error('Izin notifikasi Diblokir permanen. Buka Settings Chrome > Site Settings > Notifications > Allow');
  // HARUS LANGSUNG - jangan pakai withTimeout, jangan cek SW dulu, biar user gesture tidak hilang
  const perm = await Notification.requestPermission();
  return perm;
}

export async function requestPermissionDirect(){
  // Khusus untuk dipanggil LANGSUNG di onclick - biar dialog browser muncul
  if(!('Notification' in window)) throw new Error('Browser tidak support');
  if(Notification.permission === 'granted') return 'granted';
  if(Notification.permission === 'denied') throw new Error('Diblokir permanen - buka Settings Chrome > Site Settings > Notifications > Allow');
  return await Notification.requestPermission();
}

export async function subscribeUser(userId){
  try{
    if(!('PushManager' in window)){
      console.warn('PushManager tidak support - fallback realtime');
      return null;
    }
    const perm = await requestNotificationPermission();
    if(perm!=='granted') throw new Error('Izin ditolak: '+perm);
    let reg;
    try{ reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'serviceWorker.ready'); }
    catch(e){ 
      console.warn('Service Worker belum ready - fallback realtime:', e.message);
      return null;
    }
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      try{
        const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }), 10000, 'pushManager.subscribe');
      }catch(e){
        // FIX: jangan alert atob error, cukup warning + fallback realtime
        if(e.message && (e.message.includes('atob') || e.message.includes('VAPID') || e.message.includes('correctly encoded'))){
          console.warn('⚠️ VAPID_PUBLIC_KEY invalid di config.js - background push nonaktif, fallback ke realtime (app dibuka tetap dapat notif):', e.message);
          localStorage.setItem('push-vapid-invalid','1');
          return null;
        }
        throw e;
      }
    }
    const json = sub.toJSON();
    try{
      const payload = { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, created_at: new Date().toISOString() };
      const { error } = await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
      if(error) console.warn('save sub warn', error.message);
    }catch(dbErr){ console.warn('DB save fail', dbErr); }
    localStorage.setItem('push-enabled','1');
    setTimeout(()=>{ try{ showLocalNotification('🔔 Notifikasi Aktif', 'Kamu akan dapat order masuk walau HP terkunci!', '/#/driver'); }catch(e){} }, 800);
    return sub;
  }catch(e){ 
    if(e.message && (e.message.includes('atob') || e.message.includes('VAPID'))){ console.warn('VAPID invalid, fallback realtime:', e.message); return null; }
    console.error('subscribe fail', e); throw e; 
  }
}

export async function unsubscribeUser(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){ await sub.unsubscribe(); try{ await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){} }
    localStorage.removeItem('push-enabled'); return true;
  }catch(e){ console.error(e); return false; }
}

// FIX NUMPUK + SOUND HANYA PERTAMA
let _lastSoundTime = 0;
function _playNotifSound(){
  const now = Date.now();
  // anti spam 800ms
  if(now - _lastSoundTime < 800) return;
  _lastSoundTime = now;
  try{
    const s = getNotifSettings();
    if(!s.sound) return;
  }catch(e){}
  try{
    const audio = new Audio('/sounds/order.mp3');
    audio.volume = 1.0;
    audio.play().catch(()=>{});
  }catch(e){}
  try{
    // fallback beep via Web Audio
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+0.4);
    osc.start(); osc.stop(ctx.currentTime+0.4);
  }catch(e){}
}

export function showLocalNotification(title, body, url='/#/', opts={}){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  _playNotifSound();
  navigator.serviceWorker.ready.then(reg=>{
    const uniqueTag = opts.tag || ('ojol-'+Date.now()+'-'+Math.floor(Math.random()*10000));
    const isOrder = title.includes('Order') || title.includes('📦') || title.includes('🍔');
    reg.showNotification(title, {
      body, 
      icon: '/icons/icon-192.png', 
      badge: '/icons/icon-192.png',
      vibrate: [200,100,200,100,200],
      data: { url, ts: Date.now() }, 
      tag: uniqueTag, 
      renotify: true,
      requireInteraction: isOrder, // order baru wajib interaksi, update status tidak
      silent: false
    });
  }).catch(e=>console.error('showNotif fail', e));
}

// Helper khusus order biar tag per-orderId (tidak numpuk tapi tetap replace jika sama order)
export function showOrderNotification(title, body, url, orderId){
  return showLocalNotification(title, body, url, { tag: 'order-'+(orderId||'broadcast')+'-'+Date.now() });
}

// === FIX UTAMA: LISTEN REALTIME UNTUK 2 JENIS ORDER ===
export function listenRealtimeOrders(currentProfile){
  if(!currentProfile) return null;
  try{
    const channel = supabase.channel('orders-push-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload=>{
        const o = payload.new;
        console.log('Realtime order masuk', o, 'untuk', currentProfile.role, currentProfile.id);
        
        if(currentProfile.role==='driver'){
          const isForMe = o.driver_id && o.driver_id === currentProfile.id;
          const isBroadcast = !o.driver_id;
          const myVeh = currentProfile.jenis_kendaraan||'motor';
          const orderVeh = o.vehicle_type||'motor';
          const vehicleMatch = orderVeh === myVeh;

          // FIX: Order langsung ke saya ATAU broadcast yang sesuai kendaraan saya
          if(isForMe){
            showLocalNotification(`📦 Order Langsung ${o.vehicle_type} - ${o.trip_type}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')} - KLIK TERIMA`, '/#/driver');
            // Optional: mainkan suara
            try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
          } else if(isBroadcast && vehicleMatch){
            showLocalNotification(`📦 Order Baru ${o.vehicle_type} ${o.trip_type}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')}`, '/#/driver');
          }
        }
        if(currentProfile.role==='passenger' && o.passenger_id===currentProfile.id && o.driver_id){
          showLocalNotification('✅ Driver Ditemukan!', `Driver menuju pickup - ${o.dest_text}`, '/#/passenger');
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `passenger_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(o.status==='accepted' && currentProfile.role==='passenger'){
          showLocalNotification('✅ Order Diterima Driver!', `${o.dest_text} • Driver OTW`, '/#/passenger');
        }
      })
      .subscribe((status)=>{ console.log('Realtime orders status', status); });
    return channel;
  }catch(e){ console.error('listenRealtime fail', e); return null; }
}



// ===== STEP 1 ENHANCEMENT: GLOBAL SETTING DARI user.js - TANPA UBAH FUNGSI LAMA =====
export function getNotifSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('notif_settings')||'{}');
    return { enabled: s.enabled!==false, ojol: s.ojol!==false, sound: s.sound!==false, vibration: s.vibration!==false, all: s.enabled!==false };
  }catch(e){ return {enabled:true, ojol:true, sound:true, vibration:true, all:true}; }
}
export function saveNotifSettings(patch){
  try{
    const cur = getNotifSettings();
    const next = {...cur, ...patch};
    if('all' in patch) next.enabled = patch.all;
    if('enabled' in patch) next.all = patch.enabled;
    localStorage.setItem('notif_settings', JSON.stringify(next));
    return next;
  }catch(e){ return getNotifSettings(); }
}
export function _shouldNotifyOjol(){
  try{
    const s = getNotifSettings();
    if(!s.enabled) return false;
    if(!s.ojol) return false;
    return true;
  }catch(e){ return true; }
}

// Wrapper notif yang cek setting global (dipakai tracking.js & driver.js)
export function notifyOjol(title, body, url='/#/', orderId=null){
  try{
    if(!_shouldNotifyOjol()) { console.log('[STEP1] notif blocked by global setting', title); return; }
    if(orderId) showOrderNotification(title, body, url, orderId);
    else showLocalNotification(title, body, url);
  }catch(e){ console.warn('notifyOjol fail', e); }
}

// === EXTENDED REALTIME UNTUK 2 ARAH LENGKAP (TAMBAHAN, TIDAK HAPUS YANG LAMA) ===
let _notifiedStatusCache = new Set();
function _shouldNotifyStatus(orderId, status){
  const key = orderId+'_'+status;
  if(_notifiedStatusCache.has(key)) return false;
  _notifiedStatusCache.add(key);
  // auto clear after 10 menit
  setTimeout(()=>_notifiedStatusCache.delete(key), 10*60*1000);
  return true;
}

let _extraChannels = [];
export function listenRealtimeOjol2Arah(currentProfile){
  // ini dipanggil BERSAMAAN dengan listenRealtimeOrders original - sinkron
  if(!currentProfile) return null;
  try{ _extraChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _extraChannels = [];
  try{
    // 1. Penumpang: picked, completed, cancelled
    const ch1 = supabase.channel('ojol-passenger-extra-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `passenger_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='passenger') return;
        if(!_shouldNotifyOjol()) return;
        if(!_shouldNotifyStatus(o.id, o.status)) return;
        if(o.status==='picked'){
          showLocalNotification('🚗 Driver OTW Tujuan', `Driver mengantar ke ${o.dest_text||o.destination||''}`, '/#/passenger');
        } else if(o.status==='completed'){
          showLocalNotification('✅ Order Selesai', 'Sampai tujuan! Rating driver yuk', '/#/passenger');
        } else if(o.status==='cancelled'){
          showLocalNotification('❌ Order Dibatalkan', o.cancel_reason || 'Order dibatalkan', '/#/passenger');
        }
      }).subscribe();
    _extraChannels.push(ch1);

    // 2. Driver: cancelled oleh penumpang + picked/completed feedback
    const ch2 = supabase.channel('ojol-driver-extra-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='driver') return;
        if(!_shouldNotifyOjol()) return;
        if(o.status==='cancelled'){
          showLocalNotification('❌ Order Dibatalkan Penumpang', `${o.pickup_text||''} → ${o.dest_text||''} dibatalkan`, '/#/driver');
        }
      }).subscribe();
    _extraChannels.push(ch2);

    return _extraChannels;
  }catch(e){ console.error('listenRealtimeOjol2Arah fail', e); return null; }
}
export function stopExtraRealtime(){ try{ _extraChannels.forEach(ch=> supabase.removeChannel(ch)); }catch(e){} _extraChannels=[]; }



// ===== STEP 2: FOOD DELIVERY 2 ARAH =====
export function notifyFood(title, body, url='/#/store/cart', orderId=null){
  try{
    const s = getNotifSettings();
    if(!s.enabled) return;
    try{
      const raw = JSON.parse(localStorage.getItem('notif_settings')||'{}');
      if(raw.food===false) return;
    }catch(e){}
    if(orderId) showOrderNotification(title, body, url, orderId);
    else showLocalNotification(title, body, url);
  }catch(e){ console.warn('notifyFood fail', e); }
}

let _foodChannels = [];
export function listenRealtimeFood2Arah(currentProfile){
  if(!currentProfile) return null;
  try{ _foodChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _foodChannels=[];
  try{
    // INSERT food_orders -> Driver & Merchant dapat notif (MERCHANT FIX: filter store milik sendiri)
    const chInsert = supabase.channel('food-insert-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food_orders' }, async payload=>{
        const o = payload.new;
        if(!getNotifSettings().enabled) return;
        if(currentProfile.role==='driver'){
          if(!_shouldNotifyStatus(o.id, 'new_driver_'+o.id)) return;
          notifyFood(`🍔 Order Food Baru!`, `${o.store_name||'Warung'} • ${o.total_items||''} item • Rp ${o.total_price?.toLocaleString('id-ID')||'-'} - KLIK TERIMA`, '/#/driver', o.id);
        }
        if(currentProfile.role==='merchant' || currentProfile.role==='warung' || currentProfile.role==='store_owner'){
          try{
            // Cek apakah order ini untuk toko milik merchant ini
            let isMyStore = false;
            let myStoreIds = [];
            try{
              myStoreIds = JSON.parse(localStorage.getItem('my_store_ids_'+currentProfile.id)||'[]');
            }catch(e){}
            // Jika belum ada cache, fetch dari DB
            if(myStoreIds.length===0){
              try{
                const { data: stores } = await supabase.from('stores').select('id').or(`owner_id.eq.${currentProfile.id},user_id.eq.${currentProfile.id},merchant_id.eq.${currentProfile.id}`);
                myStoreIds = (stores||[]).map(s=> String(s.id));
                try{ localStorage.setItem('my_store_ids_'+currentProfile.id, JSON.stringify(myStoreIds)); }catch(e){}
              }catch(e){}
            }
            // Jika masih kosong, fallback: notif semua (untuk merchant pertama kali)
            if(myStoreIds.length===0) isMyStore = true;
            else isMyStore = myStoreIds.includes(String(o.store_id));

            if(isMyStore){
              if(!_shouldNotifyStatus(o.id, 'new_merchant_'+o.id)) return;
              notifyFood(`🏪 Order Masuk Warung!`, `${o.customer_name||'Pelanggan'} order ${o.total_items||''} item • Rp ${o.total_price?.toLocaleString('id-ID')||'-'} - KLIK PROSES`, '/#/store/my', o.id);
              try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
              // Trigger refresh list warung jika ada fungsi
              try{ if(window.loadMerchantOrders) window.loadMerchantOrders(); }catch(e){}
              try{ if(window._refreshWarungOrders) window._refreshWarungOrders(); }catch(e){}
            }
          }catch(e){ console.warn('merchant notif filter fail', e); }
        }
      }).subscribe();
    _foodChannels.push(chInsert);

    // UPDATE untuk PEMBELI (buyer_id)
    const chBuyer = supabase.channel('food-buyer-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'food_orders', filter: `buyer_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(!getNotifSettings().enabled) return;
        const map = {
          accepted: ['✅ Driver Terima Food', `Driver OTW ke warung ${o.store_name||''}`],
          preparing: ['🏪 Warung Masak', `Warung sedang masak pesanan kamu - ${o.store_name||''}`],
          ready: ['🍱 Makanan Siap', `Makanan siap diantar - ${o.store_name||''}`],
          picked: ['🚚 Driver OTW Antar', `Driver mengantar makanan ke kamu`],
          completed: ['✅ Makanan Sampai', 'Pesanan selesai! Rating driver & warung yuk'],
          cancelled: ['❌ Food Dibatalkan', o.cancel_reason||'Order makanan dibatalkan']
        };
        const m = map[o.status];
        if(m) notifyFood(m[0], m[1], '/#/store/cart');
      }).subscribe();
    _foodChannels.push(chBuyer);

    // UPDATE untuk DRIVER (driver_id) - cancelled
    const chDriverFood = supabase.channel('food-driver-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'food_orders', filter: `driver_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='driver') return;
        if(o.status==='cancelled'){
          notifyFood('❌ Food Dibatalkan Pembeli', `${o.store_name||'Warung'} order dibatalkan`, '/#/driver');
        }
      }).subscribe();
    _foodChannels.push(chDriverFood);

    return _foodChannels;
  }catch(e){ console.error('listenRealtimeFood2Arah fail', e); return null; }
}

// ===== MERCHANT AKTIF NOTIFIKASI - TAMBAHAN BARU =====
let _merchantChannels = [];
export function listenRealtimeMerchant(currentProfile){
  if(!currentProfile) return null;
  if(!['merchant','warung','store_owner'].includes(currentProfile.role)) return null;
  try{ _merchantChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _merchantChannels=[];
  try{
    // Dengar semua food_orders yang store_id milik merchant ini
    // Kita pakai channel global tapi filter di callback pakai my_store_ids
    const chOrders = supabase.channel('merchant-orders-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food_orders' }, async payload=>{
        const o = payload.new;
        if(!getNotifSettings().enabled) return;
        // filter store milik sendiri
        let myStoreIds=[];
        try{ myStoreIds = JSON.parse(localStorage.getItem('my_store_ids_'+currentProfile.id)||'[]'); }catch(e){}
        if(myStoreIds.length===0){
          try{
            const { data: stores } = await supabase.from('stores').select('id').or(`owner_id.eq.${currentProfile.id},user_id.eq.${currentProfile.id},merchant_id.eq.${currentProfile.id}`);
            myStoreIds = (stores||[]).map(s=> String(s.id));
            localStorage.setItem('my_store_ids_'+currentProfile.id, JSON.stringify(myStoreIds));
          }catch(e){}
        }
        const isMyStore = myStoreIds.length===0 ? true : myStoreIds.includes(String(o.store_id));
        if(!isMyStore) return;
        if(!_shouldNotifyStatus(o.id, 'merchant_new_'+o.id)) return;
        notifyFood(`🏪 Order Baru! ${o.store_name||''}`, `${o.customer_name||'Pelanggan'} • ${o.total_items||''} item • Rp ${o.total_price?.toLocaleString('id-ID')||''}`, '/#/store/my', o.id);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'food_orders' }, async payload=>{
        const o = payload.new;
        const old = payload.old;
        if(!o) return;
        // Filter hanya toko milik merchant
        let myStoreIds=[];
        try{ myStoreIds = JSON.parse(localStorage.getItem('my_store_ids_'+currentProfile.id)||'[]'); }catch(e){}
        if(myStoreIds.length>0 && !myStoreIds.includes(String(o.store_id))) return;

        // Notif penting untuk merchant: driver diterima, dibatalkan pembeli, selesai
        if(o.status==='accepted' && old?.status !== 'accepted'){
          if(!_shouldNotifyStatus(o.id, 'merchant_accepted_'+o.id)) return;
          notifyFood(`✅ Driver Terima Order ${o.store_name||''}`, `Driver ${o.driver_name||''} OTW ke warung - Order ${o.id.slice(0,6)}`, '/#/store/my', o.id);
        } else if(o.status==='cancelled' && old?.status !== 'cancelled'){
          if(!_shouldNotifyStatus(o.id, 'merchant_cancelled_'+o.id)) return;
          notifyFood(`❌ Order Dibatalkan Pembeli`, `${o.store_name||''} - ${o.id.slice(0,6)} dibatalkan pembeli`, '/#/store/my', o.id);
        } else if(o.status==='completed' && old?.status !== 'completed'){
          if(!_shouldNotifyStatus(o.id, 'merchant_completed_'+o.id)) return;
          notifyFood(`✅ Order Selesai`, `${o.store_name||''} - Order ${o.id.slice(0,6)} selesai diantar`, '/#/store/my', o.id);
        }
      }).subscribe();
    _merchantChannels.push(chOrders);
    console.log('Merchant realtime aktif untuk', currentProfile.id);
    return _merchantChannels;
  }catch(e){ console.error('listenRealtimeMerchant fail', e); return null; }
}

export function stopMerchantRealtime(){ try{ _merchantChannels.forEach(ch=> supabase.removeChannel(ch)); }catch(e){} _merchantChannels=[]; }

// Helper aktivasi 1 klik untuk merchant
export async function activateMerchantNotifications(currentProfile){
  try{
    if(!currentProfile) throw new Error('Profile tidak ada');
    const perm = await requestNotificationPermission();
    if(perm !== 'granted') throw new Error('Izin notifikasi ditolak');
    await subscribeUser(currentProfile.id);
    // Cache store_ids milik merchant
    try{
      const { data: stores } = await supabase.from('stores').select('id,name').or(`owner_id.eq.${currentProfile.id},user_id.eq.${currentProfile.id},merchant_id.eq.${currentProfile.id}`);
      const ids = (stores||[]).map(s=> String(s.id));
      localStorage.setItem('my_store_ids_'+currentProfile.id, JSON.stringify(ids));
      console.log('My stores cached', ids);
    }catch(e){}
    listenRealtimeMerchant(currentProfile);
    listenRealtimeFood2Arah(currentProfile);
    showLocalNotification('🔔 Notifikasi Warung Aktif', 'Kamu akan dapat order masuk walau HP terkunci! - '+ (currentProfile.name||'Warung'), '/#/store/my');
    return true;
  }catch(e){ console.error('activateMerchant fail', e); throw e; }
}

// ===== ALWAYS ACTIVE + POPUP GLOBAL - FINAL =====
export async function forceEnablePush(profile){
  try{
    if(!profile) return;
    localStorage.setItem('push-auto-active','1');
    localStorage.setItem('push-enabled','1');
    try{ listenRealtimeOrders(profile); }catch(e){}
    try{ listenRealtimeOjol2Arah(profile); }catch(e){}
    try{ listenRealtimeFood2Arah(profile); }catch(e){}
    try{ if(typeof listenRealtimeMerchant !== 'undefined') listenRealtimeMerchant(profile); }catch(e){}
    if(Notification.permission==='granted'){
      try{ await subscribeUser(profile.id); }catch(e){ console.warn('forceEnablePush subscribe fail (realtime tetap jalan)', e.message); }
    }
  }catch(e){}
}
export function isPushGranted(){
  return (typeof Notification !== 'undefined') && Notification.permission==='granted';
}

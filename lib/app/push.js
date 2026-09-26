
// push.js - ALWAYS ACTIVE - Notifikasi selalu aktif tanpa klik
import { supabase } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';

function urlBase64ToUint8Array(base64String){
  try{
    if(!base64String || typeof base64String !== 'string') throw new Error('VAPID key kosong');
    let s = base64String.trim().replace(/\s/g,'').replace(/['"]+/g,'');
    const padding = '='.repeat((4 - s.length % 4) % 4);
    const base64 = (s + padding).replace(/-/g,'+').replace(/_/g,'/');
    if(!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('VAPID key format salah');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
    return out;
  }catch(e){
    console.warn('urlBase64ToUint8Array fail:', e.message);
    throw new Error('VAPID_PUBLIC_KEY tidak valid: '+e.message);
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
  if(!('Notification' in window)) throw new Error('Browser tidak support Notification');
  if(!('serviceWorker' in navigator)) throw new Error('Service Worker tidak support');
  if(Notification.permission === 'granted') return 'granted';
  if(Notification.permission === 'denied') throw new Error('Izin Diblokir permanen. Buka Settings Chrome > Site Settings > Notifications > Allow');
  try{
    const perm = await withTimeout(Notification.requestPermission(), 10000, 'requestPermission');
    return perm;
  }catch(e){
    throw new Error('Gagal minta izin: '+e.message);
  }
}

export async function subscribeUser(userId){
  try{
    if(!('PushManager' in window)){
      console.warn('PushManager tidak support - fallback realtime');
      return null;
    }
    let reg;
    try{ reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'serviceWorker.ready'); }
    catch(e){ 
      console.warn('SW belum ready - fallback realtime:', e.message);
      return null;
    }
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      try{
        const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }), 10000, 'pushManager.subscribe');
      }catch(e){
        if(e.message && (e.message.includes('atob') || e.message.includes('VAPID') || e.message.includes('correctly encoded'))){
          console.warn('⚠️ VAPID invalid - background push nonaktif, fallback realtime aktif:', e.message);
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
    localStorage.setItem('push-enabled-time', Date.now().toString());
    localStorage.removeItem('push-vapid-invalid');
    return sub;
  }catch(e){ 
    if(e.message && (e.message.includes('atob') || e.message.includes('VAPID'))){ 
      console.warn('VAPID invalid, fallback realtime:', e.message); 
      return null; 
    }
    console.error('subscribe fail', e); 
    throw e; 
  }
}

export async function unsubscribeUser(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){ await sub.unsubscribe(); try{ await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){} }
    localStorage.removeItem('push-enabled'); 
    localStorage.removeItem('push-enabled-time');
    return true;
  }catch(e){ console.error(e); return false; }
}

export function showLocalNotification(title, body, url='/#/'){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  navigator.serviceWorker.ready.then(reg=>{
    reg.showNotification(title, {
      body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      vibrate: [200,100,200], data: { url }, tag: 'ojol-notif-'+Date.now(), requireInteraction: false
    });
  }).catch(e=>console.error('showNotif fail', e));
}

export function getNotifSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('notif_settings')||'{}');
    return { enabled: s.enabled!==false, ojol: s.ojol!==false, sound: s.sound!==false, vibration: s.vibration!==false, all: s.enabled!==false };
  }catch(e){ return { enabled:true, ojol:true, sound:true, vibration:true, all:true }; }
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

export function notifyOjol(title, body, url='/#/', orderId=null){
  try{
    if(!_shouldNotifyOjol()) return;
    showLocalNotification(title, body, url);
  }catch(e){ console.warn('notifyOjol fail', e); }
}

export function notifyFood(title, body, url='/#/store/cart', orderId=null){
  try{
    const s = getNotifSettings();
    if(!s.enabled) return;
    try{
      const raw = JSON.parse(localStorage.getItem('notif_settings')||'{}');
      if(raw.food===false) return;
    }catch(e){}
    showLocalNotification(title, body, url);
  }catch(e){ console.warn('notifyFood fail', e); }
}

let _notifiedStatusCache = new Set();
function _shouldNotifyStatus(orderId, status){
  const key = orderId+'_'+status;
  if(_notifiedStatusCache.has(key)) return false;
  _notifiedStatusCache.add(key);
  setTimeout(()=>_notifiedStatusCache.delete(key), 10*60*1000);
  return true;
}

let _extraChannels = [];
export function listenRealtimeOjol2Arah(currentProfile){
  if(!currentProfile) return null;
  try{ _extraChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _extraChannels = [];
  try{
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

export function listenRealtimeOrders(currentProfile){
  if(!currentProfile) return null;
  try{
    const channel = supabase.channel('orders-push-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload=>{
        const o = payload.new;
        if(currentProfile.role==='driver'){
          const isForMe = o.driver_id && o.driver_id === currentProfile.id;
          const isBroadcast = !o.driver_id;
          if(isForMe){
            if(!_shouldNotifyStatus(o.id, 'driver_direct_'+o.id)) return;
            showLocalNotification(`📦 Order Langsung ${o.vehicle_type||'Ojol'} - ${o.trip_type||''}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')} - KLIK TERIMA`, '/#/driver');
            try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
          } else if(isBroadcast){
            if(!_shouldNotifyStatus(o.id, 'driver_broadcast_'+o.id)) return;
            showLocalNotification(`📦 Order Baru ${o.vehicle_type||'Ojol'} ${o.trip_type||''}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')} - KLIK TERIMA`, '/#/driver');
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

let _foodChannels = [];
export function listenRealtimeFood2Arah(currentProfile){
  if(!currentProfile) return null;
  try{ _foodChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _foodChannels=[];
  try{
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
            let isMyStore = false;
            let myStoreIds = [];
            try{ myStoreIds = JSON.parse(localStorage.getItem('my_store_ids_'+currentProfile.id)||'[]'); }catch(e){}
            if(myStoreIds.length===0){
              try{
                const { data: stores } = await supabase.from('stores').select('id').or(`owner_id.eq.${currentProfile.id},user_id.eq.${currentProfile.id},merchant_id.eq.${currentProfile.id}`);
                myStoreIds = (stores||[]).map(s=> String(s.id));
                try{ localStorage.setItem('my_store_ids_'+currentProfile.id, JSON.stringify(myStoreIds)); }catch(e){}
              }catch(e){}
            }
            if(myStoreIds.length===0) isMyStore = true;
            else isMyStore = myStoreIds.includes(String(o.store_id));
            if(isMyStore){
              if(!_shouldNotifyStatus(o.id, 'new_merchant_'+o.id)) return;
              notifyFood(`🏪 Order Masuk Warung!`, `${o.customer_name||'Pelanggan'} order ${o.total_items||''} item • Rp ${o.total_price?.toLocaleString('id-ID')||'-'} - KLIK PROSES`, '/#/store/my', o.id);
              try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
            }
          }catch(e){ console.warn('merchant notif filter fail', e); }
        }
      }).subscribe();
    _foodChannels.push(chInsert);

    const chBuyer = supabase.channel('food-buyer-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'food_orders', filter: `buyer_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(!getNotifSettings().enabled) return;
        if(!_shouldNotifyStatus(o.id, o.status)) return;
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

let _merchantChannels = [];
export function listenRealtimeMerchant(currentProfile){
  if(!currentProfile) return null;
  if(!['merchant','warung','store_owner'].includes(currentProfile.role)) return null;
  try{ _merchantChannels.forEach(ch=> { try{ supabase.removeChannel(ch); }catch(e){} }); }catch(e){}
  _merchantChannels=[];
  try{
    const chOrders = supabase.channel('merchant-orders-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food_orders' }, async payload=>{
        const o = payload.new;
        if(!getNotifSettings().enabled) return;
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
        let myStoreIds=[];
        try{ myStoreIds = JSON.parse(localStorage.getItem('my_store_ids_'+currentProfile.id)||'[]'); }catch(e){}
        if(myStoreIds.length>0 && !myStoreIds.includes(String(o.store_id))) return;
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
    return _merchantChannels;
  }catch(e){ console.error('listenRealtimeMerchant fail', e); return null; }
}

export async function activateMerchantNotifications(currentProfile){
  try{
    if(!currentProfile) throw new Error('Profile tidak ada');
    const perm = await requestNotificationPermission();
    if(perm !== 'granted') throw new Error('Izin notifikasi ditolak');
    await subscribeUser(currentProfile.id);
    try{
      const { data: stores } = await supabase.from('stores').select('id,name').or(`owner_id.eq.${currentProfile.id},user_id.eq.${currentProfile.id},merchant_id.eq.${currentProfile.id}`);
      const ids = (stores||[]).map(s=> String(s.id));
      localStorage.setItem('my_store_ids_'+currentProfile.id, JSON.stringify(ids));
    }catch(e){}
    listenRealtimeMerchant(currentProfile);
    listenRealtimeFood2Arah(currentProfile);
    showLocalNotification('🔔 Notifikasi Warung Aktif', 'Kamu akan dapat order masuk walau HP terkunci!', '/#/store/my');
    return true;
  }catch(e){ console.error('activateMerchant fail', e); throw e; }
}

// ===== ALWAYS ACTIVE - AUTO ENABLE =====
let _autoPushInitialized = false;
let _autoPushRetryInterval = null;

export async function forceEnablePush(currentProfile){
  try{
    if(!currentProfile) {
      // Coba ambil profile dari supabase
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) return false;
        const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
        currentProfile = profile;
      }catch(e){ return false; }
    }
    if(!currentProfile) return false;

    // 1. Cek permission
    let perm = Notification.permission;
    if(perm === 'default'){
      try{
        perm = await requestNotificationPermission();
      }catch(e){
        console.warn('Auto permission request fail, akan coba lagi nanti:', e.message);
        // Jangan throw, tetap lanjutkan realtime
      }
    }

    // 2. Subscribe walau VAPID invalid (fallback realtime tetap aktif)
    if(perm === 'granted'){
      try{
        await subscribeUser(currentProfile.id);
      }catch(e){
        console.warn('Auto subscribe fail (fallback realtime tetap aktif):', e.message);
      }
    }

    // 3. Selalu aktifkan realtime (ini yang bikin notif work walau app dibuka)
    try{
      listenRealtimeOrders(currentProfile);
      listenRealtimeOjol2Arah(currentProfile);
      listenRealtimeFood2Arah(currentProfile);
      if(['merchant','warung','store_owner'].includes(currentProfile.role)){
        listenRealtimeMerchant(currentProfile);
      }
      // Driver realtime
      if(currentProfile.role==='driver' && window._initDriverRealtime){
        try{ window._initDriverRealtime(currentProfile); }catch(e){}
      }
    }catch(e){ console.warn('Auto realtime fail', e); }

    localStorage.setItem('push-auto-active','1');
    localStorage.setItem('push-last-auto', Date.now().toString());
    console.log('✅ Push ALWAYS ACTIVE enabled for', currentProfile.role, currentProfile.id, 'perm:', perm);
    return true;
  }catch(e){
    console.warn('forceEnablePush fail:', e.message);
    return false;
  }
}

// Auto-init saat app load
if(typeof window !== 'undefined'){
  // Jalan setiap kali halaman load
  window.addEventListener('load', async ()=>{
    if(_autoPushInitialized) return;
    _autoPushInitialized = true;
    // Delay 1.5 detik biar auth siap
    setTimeout(async ()=>{
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) return;
        const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
        if(profile){
          await forceEnablePush(profile);
        }
      }catch(e){ console.warn('Auto push init fail', e.message); }
    }, 1500);
  });

  // Juga saat visibility change (user balik ke app)
  document.addEventListener('visibilitychange', async ()=>{
    if(document.visibilityState === 'visible'){
      try{
        const last = parseInt(localStorage.getItem('push-last-auto')||'0');
        // Re-init kalau sudah 5 menit tidak update
        if(Date.now() - last > 5*60*1000){
          const { data: { user } } = await supabase.auth.getUser();
          if(!user) return;
          const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
          if(profile) await forceEnablePush(profile);
        }
      }catch(e){}
    }
  });

  // Periodic check tiap 2 menit untuk memastikan realtime tetap jalan
  setInterval(async ()=>{
    try{
      const auto = localStorage.getItem('push-auto-active');
      if(auto !== '1') return;
      const last = parseInt(localStorage.getItem('push-last-auto')||'0');
      if(Date.now() - last > 2*60*1000){
        const { data: { user } } = await supabase.auth.getUser();
        if(!user) return;
        const { data: profile } = await supabase.from('users').select('*').eq('google_id', user.id).single();
        if(profile) await forceEnablePush(profile);
      }
    }catch(e){}
  }, 2*60*1000);

  window.forceEnablePush = forceEnablePush;
  window._autoPushInitialized = ()=> _autoPushInitialized;
}

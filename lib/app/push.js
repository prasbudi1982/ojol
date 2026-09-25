// push.js - STEP 1: OJOL 2 ARAH (Penumpang <-> Driver) - Setting Global dari user.js
import { supabase } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}

// ===== SETTING GLOBAL - DIKONTROL DARI user.js =====
export function getNotifSettings(){
  try{
    const s = JSON.parse(localStorage.getItem('notif_settings')||'{}');
    return {
      enabled: s.enabled!==false,
      ojol: s.ojol!==false,
      sound: s.sound!==false,
      vibration: s.vibration!==false,
      all: s.enabled!==false
    };
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
export function shouldNotify(type='ojol'){
  const st = getNotifSettings();
  if(!st.enabled) return false;
  if(type==='ojol' && !st.ojol) return false;
  // cek push-enabled
  if(localStorage.getItem('push-enabled')!=='1' && Notification.permission!=='granted') return false;
  return true;
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
  if(Notification.permission === 'denied') throw new Error('Izin Diblokir. Buka Settings Chrome > Site Settings > Notifications > Allow');
  const perm = await withTimeout(Notification.requestPermission(), 10000, 'requestPermission');
  if(perm==='granted'){
    localStorage.setItem('push-enabled','1');
    saveNotifSettings({enabled:true, all:true, ojol:true});
  }
  return perm;
}
export async function subscribeUser(userId){
  const perm = await requestNotificationPermission();
  if(perm!=='granted') throw new Error('Izin ditolak: '+perm);
  let reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'serviceWorker.ready');
  let sub = await reg.pushManager.getSubscription();
  if(!sub){
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }), 10000, 'pushManager.subscribe');
  }
  const json = sub.toJSON();
  try{
    await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, created_at: new Date().toISOString() }, { onConflict: 'endpoint' });
  }catch(e){}
  localStorage.setItem('push-enabled','1');
  saveNotifSettings({enabled:true, all:true, ojol:true});
  setTimeout(()=> showLocalNotification('🔔 Notifikasi Ojol Aktif', 'Kamu akan dapat update order walau HP terkunci!', '/#/passenger', 'ojol'), 800);
  return sub;
}
export async function unsubscribeUser(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){ await sub.unsubscribe(); try{ await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){} }
    localStorage.removeItem('push-enabled');
    saveNotifSettings({enabled:false, all:false});
    return true;
  }catch(e){ return false; }
}
export function playNotifSound(){
  const st = getNotifSettings();
  if(!st.sound) return;
  try{ new Audio('/sounds/order.mp3').play().catch(()=>{}); }catch(e){}
}
export function showLocalNotification(title, body, url='/#/', type='ojol'){
  try{
    if(!shouldNotify(type)){
      console.log('[notif blocked]', type, title);
      return;
    }
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    navigator.serviceWorker.ready.then(reg=>{
      const st = getNotifSettings();
      reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: st.vibration ? [200,100,200] : [],
        data: { url },
        tag: 'ojol-'+type+'-'+Date.now(),
        requireInteraction: true,
        renotify: true
      });
    });
    playNotifSound();
  }catch(e){ console.error('notif error', e); }
}

// ===== STEP 1: LISTEN REALTIME OJOL 2 ARAH =====
let globalChannels=[];
export function listenRealtimeOrders(currentProfile){
  if(!currentProfile) return null;
  try{ globalChannels.forEach(ch=> supabase.removeChannel(ch)); }catch(e){}
  globalChannels=[];
  try{
    // CHANNEL 1: INSERT orders (Driver dapat order baru)
    const chInsert = supabase.channel('ojol-insert-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='driver') return;
        // Driver logic: order langsung ke saya atau broadcast sesuai kendaraan
        const isForMe = o.driver_id && o.driver_id === currentProfile.id;
        const isBroadcast = !o.driver_id;
        const myVeh = currentProfile.jenis_kendaraan||'motor';
        const orderVeh = o.vehicle_type||'motor';
        const vehicleMatch = orderVeh === myVeh;
        // Filter status searching only
        if(!['searching','pending','new','open','created','waiting'].includes(o.status)) return;
        
        if(isForMe){
          showLocalNotification(`📦 Order Langsung ${o.vehicle_type} - ${o.trip_type}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')} - KLIK TERIMA`, '/#/driver', 'ojol');
          console.log('[DRIVER NOTIF] Order langsung ke saya', o.id);
        } else if(isBroadcast && vehicleMatch){
          showLocalNotification(`📦 Order Baru ${o.vehicle_type} ${o.trip_type}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')}`, '/#/driver', 'ojol');
          console.log('[DRIVER NOTIF] Broadcast sesuai kendaraan', o.id);
        }
      })
      .subscribe((s)=> console.log('Realtime ojol INSERT', s));
    globalChannels.push(chInsert);

    // CHANNEL 2: UPDATE untuk PENUMPANG (driver_id found, picked, completed, cancelled)
    const chPassenger = supabase.channel('ojol-passenger-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `passenger_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='passenger' && currentProfile.role!=='user') return;
        // Status mapping untuk penumpang
        if(o.status==='accepted'){
          showLocalNotification('✅ Driver Ditemukan!', `Driver ${o.driver_id?.slice(0,4)||''} OTW ke pickup - ${o.dest_text||''}`, '/#/passenger', 'ojol');
        } else if(o.status==='picked'){
          showLocalNotification('🚗 Driver OTW Tujuan', `Driver mengantar ke ${o.dest_text}`, '/#/passenger', 'ojol');
        } else if(o.status==='completed'){
          showLocalNotification('✅ Order Selesai', `Sampai tujuan! Rating driver yuk`, '/#/passenger', 'ojol');
        } else if(o.status==='cancelled'){
          showLocalNotification('❌ Order Dibatalkan', o.cancel_reason || 'Order dibatalkan', '/#/passenger', 'ojol');
        }
      })
      .subscribe((s)=> console.log('Realtime ojol PASSENGER', s));
    globalChannels.push(chPassenger);

    // CHANNEL 3: UPDATE untuk DRIVER (order dibatalkan penumpang / ditolak)
    const chDriver = supabase.channel('ojol-driver-'+currentProfile.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `driver_id=eq.${currentProfile.id}` }, payload=>{
        const o = payload.new;
        if(currentProfile.role!=='driver') return;
        if(o.status==='cancelled'){
          showLocalNotification('❌ Order Dibatalkan Penumpang', `${o.pickup_text} → ${o.dest_text} dibatalkan`, '/#/driver', 'ojol');
        }
      })
      .subscribe((s)=> console.log('Realtime ojol DRIVER', s));
    globalChannels.push(chDriver);

    return globalChannels;
  }catch(e){ console.error('listenRealtime fail', e); return null; }
}
export function stopAllRealtime(){
  try{ globalChannels.forEach(ch=> supabase.removeChannel(ch)); }catch(e){}
  globalChannels=[];
}

if(typeof window!=='undefined'){
  window._showNotif = showLocalNotification;
  window._notifSettings = { get: getNotifSettings, save: saveNotifSettings, should: shouldNotify };
}

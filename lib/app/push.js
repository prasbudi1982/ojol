// push.js - FIX FINAL - Order broadcast + order langsung ke driver semua masuk notifikasi
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
  if(!('serviceWorker' in navigator)) throw new Error('Service Worker tidak support');
  if(Notification.permission === 'granted') return 'granted';
  if(Notification.permission === 'denied') throw new Error('Izin notifikasi Diblokir permanen. Buka Settings Chrome > Site Settings > Notifications > Allow');
  try{
    const perm = await withTimeout(Notification.requestPermission(), 10000, 'requestPermission');
    return perm;
  }catch(e){
    throw new Error('Gagal minta izin: '+e.message);
  }
}

export async function subscribeUser(userId){
  try{
    if(!('PushManager' in window)) throw new Error('PushManager tidak support. Pakai Chrome terbaru.');
    const perm = await requestNotificationPermission();
    if(perm!=='granted') throw new Error('Izin ditolak: '+perm);
    let reg;
    try{ reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'serviceWorker.ready'); }
    catch(e){ throw new Error('Service Worker belum ready. Pastikan sw.js di root dan HTTPS. '+e.message); }
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }), 10000, 'pushManager.subscribe');
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
  }catch(e){ console.error('subscribe fail', e); throw e; }
}

export async function unsubscribeUser(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){ await sub.unsubscribe(); try{ await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){} }
    localStorage.removeItem('push-enabled'); return true;
  }catch(e){ console.error(e); return false; }
}

export function showLocalNotification(title, body, url='/#/'){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  navigator.serviceWorker.ready.then(reg=>{
    reg.showNotification(title, {
      body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      vibrate: [200,100,200], data: { url }, tag: 'ojol-notif', requireInteraction: true
    });
  }).catch(e=>console.error('showNotif fail', e));
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

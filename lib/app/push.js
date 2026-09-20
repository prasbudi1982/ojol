// push.js v5.1 FIX - mengatasi loading "Meminta izin..." stuck
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

// helper timeout
function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, rej)=> setTimeout(()=> rej(new Error('Timeout '+label+' '+ms+'ms')), ms))
  ]);
}

export async function requestNotificationPermission(){
  if(!('Notification' in window)) throw new Error('Browser tidak support Notification (buka di Chrome, bukan WA browser)');
  if(!('serviceWorker' in navigator)) throw new Error('Service Worker tidak support');
  
  // kalau sudah granted/denied jangan minta lagi
  if(Notification.permission === 'granted') return 'granted';
  if(Notification.permission === 'denied') throw new Error('Izin notifikasi sudah Diblokir permanen. Buka Settings Chrome > Site Settings > Notifications > Allow untuk domain ini.');

  try{
    // Chrome baru butuh gesture, kita sudah di dalam click handler jadi aman
    const perm = await withTimeout(Notification.requestPermission(), 10000, 'requestPermission');
    return perm;
  }catch(e){
    throw new Error('Gagal minta izin: '+e.message+' . Coba buka di Chrome asli, bukan dari WhatsApp/Facebook browser.');
  }
}

export async function subscribeUser(userId){
  try{
    // 1. cek support PushManager
    if(!('PushManager' in window)){
      throw new Error('PushManager tidak support di browser ini. Pakai Chrome terbaru, dan install sebagai PWA.');
    }

    // 2. minta izin (dengan timeout)
    const perm = await requestNotificationPermission();
    if(perm!=='granted') throw new Error('Izin ditolak: '+perm);

    // 3. pastikan SW ter-register, lalu tunggu ready
    let reg;
    try{
      // coba register dulu kalau belum ada (fix localhost)
      if(!navigator.serviceWorker.controller){
        try{
          const r = await navigator.serviceWorker.register('./sw.js', {scope:'./'});
          console.log('SW registered from push.js', r.scope);
        }catch(regErr){
          console.warn('SW register fail from push.js', regErr.message);
        }
      }
      reg = await withTimeout(navigator.serviceWorker.ready, 8000, 'serviceWorker.ready');
    }catch(e){
      // fallback: ambil registration pertama
      try{
        const regs = await navigator.serviceWorker.getRegistrations();
        if(regs.length>0){ reg = regs[0]; console.log('Fallback use first registration'); }
        else throw e;
      }catch(inner){
        throw new Error('Service Worker belum ready. Coba: 1) Hard reload Ctrl+Shift+R 2) DevTools > Application > Clear Storage > Clear site data 3) Pastikan sw.js di root sejajar index.html. Error: '+e.message);
      }
    }

    // 4. subscribe
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await withTimeout(
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }),
        10000,
        'pushManager.subscribe'
      );
    }

    const json = sub.toJSON();

    // 5. simpan ke Supabase (jangan gagalkan flow kalau RLS belum ada)
    try{
      const payload = {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        created_at: new Date().toISOString()
      };
      const { error } = await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
      if(error) console.warn('save sub warn', error.message, '- mungkin tabel push_subscriptions belum ada, buat via PUSH_SQL.sql');
    }catch(dbErr){
      console.warn('DB save fail (abaikan)', dbErr);
    }

    localStorage.setItem('push-enabled','1');

    // 6. test local notif
    setTimeout(()=>{ 
      try{ showLocalNotification('🔔 Notifikasi Aktif', 'Pak W, kamu akan dapat order masuk walau HP terkunci!', '/#/driver'); }catch(e){}
    }, 800);

    return sub;

  }catch(e){
    console.error('subscribe fail', e);
    // lempar biar app.js bisa tampilkan di UI
    throw e;
  }
}

export async function unsubscribeUser(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await sub.unsubscribe();
      try{ await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }catch(e){}
    }
    localStorage.removeItem('push-enabled');
    return true;
  }catch(e){ console.error(e); return false; }
}

export function showLocalNotification(title, body, url='/#/'){
  if(!('Notification' in window) || Notification.permission!=='granted'){
    console.log('notif permission not granted');
    return;
  }
  navigator.serviceWorker.ready.then(reg=>{
    reg.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [200,100,200],
      data: { url },
      tag: 'ojol-notif',
      requireInteraction: false
    });
  }).catch(e=>console.error('showNotif fail', e));
}

export function listenRealtimeOrders(currentProfile){
  if(!currentProfile) return null;
  try{
    const channel = supabase.channel('orders-push-'+currentProfile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload=>{
        const o = payload.new;
        if(currentProfile.role==='driver' && !o.driver_id){
          const myVeh = currentProfile.jenis_kendaraan||'motor';
          if((o.vehicle_type||'motor')===myVeh){
            showLocalNotification(`📦 Order Baru ${o.vehicle_type} ${o.trip_type}`, `${o.pickup_text} → ${o.dest_text} • Rp ${o.estimated_cost?.toLocaleString('id-ID')}`, '/#/driver');
          }
        }
        if(currentProfile.role==='passenger' && o.passenger_id===currentProfile.id && o.driver_id){
          showLocalNotification('✅ Driver Ditemukan!', `Driver menuju pickup - ${o.dest_text}`, '/#/passenger');
        }
      })
      .subscribe((status)=>{
        console.log('Realtime orders status', status);
      });
    return channel;
  }catch(e){
    console.error('listenRealtime fail', e);
    return null;
  }
}

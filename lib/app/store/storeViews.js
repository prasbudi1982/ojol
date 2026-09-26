// FILE: lib/app/store/storeViews.js - FINAL FIX WARUNGKU + KELOLA MENU VARIAN ADDON + CART CANTIK
import { supabase } from '../supabase.js';
import { getProfile } from '../user.js';
import { warungStore, productStore, cartStore, foodOrderStore } from './index.js';
import { activateMerchantNotifications, getPermissionStatus, listenRealtimeMerchant } from '../push.js';

let _merchantNotifInitialized = false;
async function initMerchantNotifButton(profile){
  if(_merchantNotifInitialized) return;
  _merchantNotifInitialized = true;
  try{
    if(typeof Notification !== 'undefined' && Notification.permission==='granted' && localStorage.getItem('push-enabled')==='1'){
      try{ listenRealtimeMerchant(profile); }catch(e){}
    }
  }catch(e){}
}

function getMerchantNotifBtnHtml(){
  let enabled = false;
  try{ enabled = (typeof Notification !== 'undefined' && Notification.permission==='granted' && localStorage.getItem('push-enabled')==='1'); }catch(e){}
  const bg = enabled ? 'var(--primary)' : '#f59e0b';
  const txtBtn = enabled ? '🔔 Notif Warung Aktif' : '🔕 Aktifkan Notif Warung';
  const statusTxt = enabled ? 'HP terkunci tetap dapat order' : 'Klik untuk aktifkan';
  return '<div style="margin:0 0 12px 0;padding:10px 12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:20px">🏪</span><div><div style="font-weight:800;font-size:12px">'+txtBtn+'</div><div class="muted" style="font-size:10px">'+statusTxt+'</div></div></div><button id="merchantNotifBtn" onclick="window._activateMerchantNotif()" style="background:'+bg+';color:white;border:none;padding:8px 14px;border-radius:99px;font-weight:800;font-size:11px;cursor:pointer">'+txtBtn+'</button></div>';
}

if(typeof window !== 'undefined'){
  window._activateMerchantNotif = async function(){
    const btn = document.getElementById('merchantNotifBtn');
    try{
      if(btn){ btn.textContent = '⏳ Mengaktifkan...'; btn.disabled=true; }
      const profile = await getProfile();
      if(!profile) throw new Error('Login dulu');
      await activateMerchantNotifications(profile);
      if(btn){ btn.innerHTML = '🔔 Notif Warung Aktif'; btn.style.background = 'var(--primary)'; btn.disabled=false; }
      alert('✅ Notifikasi Warung Aktif!\nKamu akan dapat order masuk walau HP terkunci');
      location.reload();
    }catch(e){
      if(btn){ btn.innerHTML = '🔕 Aktifkan Notif Warung'; btn.style.background = '#f59e0b'; btn.disabled=false; }
      alert('❌ Gagal aktifkan notif: '+e.message+'\n\nPastikan buka di Chrome (bukan WA) dan HTTPS');
    }
  };
  window._refreshWarungOrders = function(){ try{ location.reload(); }catch(e){} };
}


function calcHav(lat1,lng1,lat2,lng2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// Fetch rating driver seperti di order.js ojol
// ===== RATING WARUNG BADGE =====
async function fetchStoreRatings(storeIds){
  const ratingsMap={};
  try{
    if(!storeIds||!storeIds.length) return ratingsMap;
    const {data,error}=await supabase.from('store_ratings').select('store_id, rating').in('store_id', storeIds);
    if(!error && data){
      const grouped={};
      data.forEach(r=>{ if(!grouped[r.store_id]) grouped[r.store_id]=[]; grouped[r.store_id].push(r.rating); });
      Object.keys(grouped).forEach(id=>{
        const arr=grouped[id];
        const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
        ratingsMap[id]={avg:avg.toFixed(1), count:arr.length};
      });
    }
  }catch(e){ console.warn('fetchStoreRatings fail',e); }
  try{
    const local=JSON.parse(localStorage.getItem('local_store_ratings')||'[]');
    const localGrouped={};
    local.forEach(r=>{
      if(!storeIds.includes(r.store_id)) return;
      if(!localGrouped[r.store_id]) localGrouped[r.store_id]=[];
      localGrouped[r.store_id].push(r.rating);
    });
    Object.keys(localGrouped).forEach(id=>{
      if(ratingsMap[id]) return;
      const arr=localGrouped[id];
      const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
      ratingsMap[id]={avg:avg.toFixed(1), count:arr.length, local:true};
    });
  }catch(e){}
  return ratingsMap;
}

async function fetchDriverRatings(driverIds){
  const ratingsMap={};
  try{
    if(!driverIds||!driverIds.length) return ratingsMap;
    const {data,error}=await supabase.from('ratings').select('driver_id, rating').in('driver_id', driverIds);
    if(!error && data){
      const grouped={};
      data.forEach(r=>{ if(!grouped[r.driver_id]) grouped[r.driver_id]=[]; grouped[r.driver_id].push(r.rating); });
      Object.keys(grouped).forEach(id=>{
        const arr=grouped[id];
        const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
        ratingsMap[id]={avg:avg.toFixed(1), count:arr.length};
      });
    }
  }catch(e){}
  try{
    const local=JSON.parse(localStorage.getItem('local_ratings')||'[]');
    const localGrouped={};
    local.forEach(r=>{
      if(!driverIds.includes(r.driver_id)) return;
      if(!localGrouped[r.driver_id]) localGrouped[r.driver_id]=[];
      localGrouped[r.driver_id].push(r.rating);
    });
    Object.keys(localGrouped).forEach(id=>{
      if(ratingsMap[id]) return;
      const arr=localGrouped[id];
      const avg=arr.reduce((a,b)=>a+b,0)/arr.length;
      ratingsMap[id]={avg:avg.toFixed(1), count:arr.length, local:true};
    });
  }catch(e){}
  return ratingsMap;
}


// === BACA ULASAN WARUNG - FIX FINAL (filter client-side biar pasti kebaca) ===
(function(){
  if(window.openStoreReviews) delete window.openStoreReviews;
  if(!document.getElementById('read-review-style')){
    const s=document.createElement('style');
    s.id='read-review-style';
    s.textContent=`.review-read-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px}.review-read-card{width:100%;max-width:420px;max-height:82vh;background:var(--card);border:1px solid var(--border);border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}.rev-list{overflow-y:auto;flex:1}`;
    document.head.appendChild(s);
  }
  window.openStoreReviews = async function(storeId, storeName){
    const safe=(storeName||'Warung').replace(/</g,'');
    const ov=document.createElement('div'); ov.className='review-read-overlay';
    ov.innerHTML=`<div class="review-read-card">
      <div style="padding:14px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--border)">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--primary-2));display:flex;align-items:center;justify-content:center">⭐</div>
        <div style="flex:1;min-width:0"><div style="font-weight:900;font-size:13px;color:var(--text)">Ulasan ${safe}</div><div style="font-size:11px;color:var(--muted)" id="revSum">Memuat...</div></div>
        <button onclick="this.closest('.review-read-overlay').remove()" style="width:28px;height:28px;border-radius:99px;border:1px solid var(--border);background:var(--card2);cursor:pointer">✕</button>
      </div>
      <div class="rev-list" id="revList"><div style="text-align:center;padding:24px;color:var(--muted);font-size:12px">⏳ Memuat ulasan...</div></div>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });

    let all=[];
    try{
      // Ambil 100 terbaru TANPA filter dulu, biar tidak kena masalah tipe uuid vs text
      const {data, error} = await supabase.from('store_ratings').select('store_id, rating, comment, created_at').order('created_at', {ascending:false}).limit(100);
      if(error) throw error;
      all=data||[];
    }catch(e){
      document.getElementById('revList').innerHTML=`<div style="padding:20px;text-align:center;color:var(--muted);font-size:11px">Gagal baca: ${e.message}<br> Cek RLS sudah: CREATE POLICY "allow read" ON store_ratings FOR SELECT USING (true);</div>`;
      return;
    }
    // Filter di JS - String() biar uuid == text tetap match
    const filtered = all.filter(r=> String(r.store_id)===String(storeId));
    const listEl=document.getElementById('revList');
    const sumEl=document.getElementById('revSum');

    if(!filtered.length){
      // kalau filter exact tidak ketemu, coba tampilkan semua sebagai bukti data ada
      listEl.innerHTML=`<div style="text-align:center;padding:20px"><div style="font-size:28px">📭</div><div style="font-weight:800;font-size:12px;margin-top:8px">Belum ada ulasan untuk warung ini</div><div style="font-size:10px;color:var(--muted);margin-top:6px">Ditemukan ${all.length} ulasan total, tapi tidak ada yang store_id = ${storeId}<br>Contoh ID di table: ${all[0]?.store_id||'-'}</div></div>`;
      if(sumEl) sumEl.textContent='0 ulasan';
      return;
    }

    const avg=(filtered.reduce((a,b)=>a+Number(b.rating||0),0)/filtered.length).toFixed(1);
    if(sumEl) sumEl.textContent=`${avg} ★ • ${filtered.length} ulasan`;

    listEl.innerHTML=filtered.map(r=>{
      const score=Math.round(Number(r.rating)||0);
      const stars='★'.repeat(score)+'☆'.repeat(5-score);
      const date=r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : '';
      const comment=r.comment ? String(r.comment) : '<i style="color:var(--muted)">Tanpa komentar</i>';
      return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;gap:10px">
        <div style="width:32px;height:32px;border-radius:99px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center">👤</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:6px;align-items:center"><span style="color:#fbbf24;font-size:11px">${stars}</span><b style="font-size:11px">${Number(r.rating).toFixed(1)}</b><span style="font-size:10px;color:var(--muted)">${date}</span></div>
          <div style="font-size:12px;margin-top:4px;line-height:1.4;word-break:break-word">${comment}</div>
        </div>
      </div>`;
    }).join('');
  };
})();


export async function viewStoreList(){
  try{
    let stores=[];
    try{ stores=await warungStore._actions.fetchOpenStores(); }catch(e){ const {data}=await supabase.from('stores').select('*').eq('is_open',true).limit(30); stores=data||[]; }
    let ratingsMap={};
    try{ const ids=stores.map(s=>s.id).filter(Boolean); ratingsMap=await fetchStoreRatings(ids); }catch(e){}
    const merchantNotifHtml = getMerchantNotifBtnHtml();
    const cards=stores.map(s=>{
      const r=ratingsMap[s.id];
      const isOpen = s.is_open;
      const ratingBadge = r 
        ? `<div style="display:inline-flex;align-items:center;gap:4px;background:var(--card2);border:1px solid var(--border);padding:4px 10px;border-radius:99px;font-size:12px;font-weight:800;color:var(--text);box-shadow:0 1px 4px var(--shadow)">
             <span style="color:var(--warning);font-size:13px">★</span> ${r.avg} <span style="font-weight:500;color:var(--muted);font-size:11px">(${r.count})</span>
           </div>`
        : `<div style="display:inline-flex;align-items:center;gap:4px;background:var(--card2);border:1px dashed var(--border);padding:4px 10px;border-radius:99px;font-size:11px;color:var(--muted)">⭐ Baru</div>`;
      const statusBadge = isOpen
        ? `<span style="font-size:10px;font-weight:800;letter-spacing:.5px;background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#052e16;padding:5px 10px;border-radius:99px;box-shadow:0 2px 8px rgba(34,197,94,.3)">● BUKA</span>`
        : `<span style="font-size:10px;font-weight:800;letter-spacing:.5px;background:var(--card2);border:1px solid var(--border);color:var(--muted);padding:5px 10px;border-radius:99px">TUTUP</span>`;
      const jarakTxt = s.distance_km ? `${Number(s.distance_km).toFixed(1)} km` : '';
      return `<div class="store-card-adaptive" style="position:relative;overflow:hidden;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:0;box-shadow:0 4px 20px var(--shadow);transition:all .25s">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--primary),var(--primary-2));opacity:${isOpen?1:0.3}"></div>
        <div style="padding:14px 14px 12px 14px">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="width:48px;height:48px;min-width:48px;border-radius:14px;background:linear-gradient(135deg,var(--card2),var(--bg));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)">🏪</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <b style="font-size:15px;color:var(--text);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${s.name}</b>
                ${statusBadge}
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
                ${ratingBadge}
                ${jarakTxt?`<span style="font-size:11px;color:var(--muted);background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:99px">📍 ${jarakTxt}</span>`:''}
              </div>
              <div class="muted" style="font-size:12px;margin-top:6px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.alamat_text||'Alamat tidak tersedia'}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <a href="#/store/detail/${s.id}" class="btn primary" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:14px;font-weight:800;font-size:13px;letter-spacing:.3px;background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#052e16;box-shadow:0 4px 14px rgba(34,197,94,.35);text-decoration:none">
              <span>🍽️</span> Lihat Menu <span style="opacity:.7">→</span>
            </a>
            <button onclick="event.preventDefault(); window.openStoreReviews('${s.id}', '${s.name.replace(/'/g, "\'")}')" style="padding:12px 14px;border-radius:14px;font-weight:800;font-size:12px;background:var(--card2);border:1px solid var(--border);color:var(--text);cursor:pointer">⭐ Ulasan</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return `
<style id="adaptiveStoreStyle">
.store-card-adaptive:hover{ transform:translateY(-2px); box-shadow:0 8px 28px var(--shadow); border-color:var(--primary) !important; }
@media (prefers-color-scheme: light){
  .store-card-adaptive{ box-shadow:0 2px 12px rgba(15,23,42,0.08) !important; }
}
</style>
<div style="padding:0">
      <div style="display:flex;align-items:center;gap:10px;margin:4px 0 16px 0">
        <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--primary),var(--primary-2));display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 12px rgba(34,197,94,.3)">🍔</div>
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:800;color:var(--text);letter-spacing:-.3px">Warung Buka</h2>
          <div class="muted" style="font-size:12px;color:var(--muted)">${stores.length} warung tersedia • Rating real dari pembeli</div>
        </div>
      </div>
      <div class="list" style="display:flex;flex-direction:column;gap:12px">${cards||'<div style="text-align:center;padding:32px;background:var(--card);border:1px dashed var(--border);border-radius:16px;color:var(--muted)">Belum ada warung buka</div>'}</div>
    </div>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

export async function viewStoreDetail(storeId){
  try{
    const {data:store}=await supabase.from('stores').select('*').eq('id',storeId).single();
    if(!store) return '<div class="card">Warung tidak ditemukan</div>';
    let products=[]; try{ products=await productStore._actions.fetchByStore(storeId,true); }catch(e){ const {data}=await supabase.from('store_products').select('*').eq('store_id',storeId).eq('is_available',true).limit(50); products=data||[]; }
    try{ cartStore._actions.setStore(store); }catch(e){}
    const prodJson=JSON.stringify(products).replace(/</g,'\u003c');
    const listHtml=products.map(p=>{ const harga=Number(p.harga||0).toLocaleString('id-ID'); return `<div class="card" style="margin:0;border:1px solid var(--border);border-radius:16px;overflow:hidden"><div style="padding:12px;background:var(--card2)"><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${harga} • ${p.kategori||''}</div></div><div style="padding:10px"><button class="btn primary" style="width:100%" onclick="window._openMenuBuilder('${p.id}')">🍱 Pilih Varian</button></div></div>`; }).join('');
    return `<div class="card"><a href="#/store" class="muted">← Kembali</a><h2>${store.name}</h2><div class="muted" style="font-size:11px">${store.alamat_text||''}</div></div><div class="list" style="margin-top:12px">${listHtml||'Belum ada menu'}</div>
      <div id="menuBuilderModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);backdrop-filter:blur(12px);align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)">
        <div style="background:var(--bg);width:100%;max-width:520px;max-height:90vh;overflow:auto;border-radius:24px 24px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,0.2)">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card);border-radius:24px 24px 0 0;z-index:2">
            <div style="width:40px;height:4px;background:var(--border);border-radius:99px;margin:0 auto 12px"></div>
            <div style="display:flex;justify-content:space-between;align-items:center"><div><div id="builderName" style="font-weight:800;font-size:18px">Menu</div><div id="builderBase" class="muted" style="font-size:13px">Rp 0</div></div><button onclick="window._closeMenuBuilder()" class="btn secondary" style="width:36px;height:36px;border-radius:50%;padding:0">✕</button></div>
          </div>
          <div style="padding:16px 16px 100px 16px">
            <div style="font-weight:800;margin-bottom:10px;font-size:14px;display:flex;gap:6px">📦 Variasi <span class="muted" style="font-weight:400;font-size:11px">• Pilih 1</span></div><div id="builderVariasi" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"></div>
            <div style="font-weight:800;margin-bottom:10px;font-size:14px;display:flex;gap:6px">➕ Addon <span class="muted" style="font-weight:400;font-size:11px">• Opsional</span></div><div id="builderAddon" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px"></div>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:13px">Jumlah</span><div style="display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:4px"><button id="builderQtyMinus" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">−</button><span id="builderQty" style="min-width:28px;text-align:center;font-weight:800;font-size:16px">1</span><button id="builderQtyPlus" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0;background:var(--primary);color:var(--card);border:none">+</button></div></div>
              <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)"><div class="muted" style="font-size:11px" id="builderSummary">-</div><div style="font-size:20px;font-weight:800;color:var(--primary)" id="builderTotal">Rp 0</div></div>
            </div>
          </div>
          <div style="position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;background:var(--card);border-top:1px solid var(--border);padding:12px 16px 20px"><button id="builderAddBtn" class="btn primary" style="width:100%;padding:14px;font-weight:800;font-size:14px;border-radius:14px">🛒 Tambah • <span id="builderTotalBtn">Rp 0</span></button></div>
        </div>
      </div><script type="application/json" id="productsData">${prodJson}</script>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

export async function viewStoreCart(){
  let state; let rawLocal=null;
  try{ rawLocal=localStorage.getItem('ojol_cart_v2_food'); }catch(e){}
  // Cek flag baru saja checkout
  try{ var justCleared=localStorage.getItem('cart_just_cleared'); if(justCleared){ var diff=Date.now()-parseInt(justCleared); if(diff<60000){ try{ if(cartStore && cartStore.setState) cartStore.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}); }catch(e){} } } }catch(e){}
  // CRITICAL FIX: Jika localStorage kosong setelah checkout, LANGSUNG return keranjang kosong tanpa baca cartStore memory
  try{
    if(rawLocal){
      var _parsedCheck=JSON.parse(rawLocal);
      if(!_parsedCheck.items || _parsedCheck.items.length===0){
        // Paksa kosongkan cartStore memory juga
        try{ if(cartStore && cartStore.setState) cartStore.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null},store:null}); }catch(e){}
        try{ if(cartStore && cartStore._actions){ if(cartStore._actions.clearCart) cartStore._actions.clearCart(); if(cartStore._actions.setItems) cartStore._actions.setItems([]); if(cartStore._actions.clear) cartStore._actions.clear(); } }catch(e){}
        try{ if(cartStore && cartStore.getState){ var _s=cartStore.getState(); if(_s){ _s.items=[]; if(_s.cart) _s.cart.items=[]; } } }catch(e){}
        // Return langsung UI kosong
        return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - Kosong</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">0 item</p><div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang kosong</div><div class="muted" style="font-size:11px;margin-top:4px">Pesanan kamu sudah diproses</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:10px 18px;font-size:12px;border-radius:12px">+ Cari Makanan Lagi</a></div></div>`;
      }
    }
  }catch(e){}
  // Jika tidak kosong, lanjut baca state
  try{ state=cartStore.getState(); if((!state.items||!state.items.length)&&rawLocal){ try{ const parsed=JSON.parse(rawLocal); if(parsed.items?.length) state=parsed; }catch(e){} } }catch(e){ const raw=localStorage.getItem('ojol_cart_v2_food'); state=raw?JSON.parse(raw):{items:[],storeName:'',dest:{text:'',lat:null,lng:null},pickup:{},storeId:null}; }
  if(!state) state={items:[],storeName:'',dest:{text:'',lat:null,lng:null},pickup:{},storeId:null};
  // Double check lagi
  try{ if(rawLocal){ var _pl=JSON.parse(rawLocal); if(!_pl.items || !_pl.items.length) state.items=[]; } }catch(e){}
  // Jika setelah double check masih kosong, return kosong
  try{ if(!state.items || !state.items.length){ return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - Kosong</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">0 item</p><div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang kosong</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:10px 18px;font-size:12px;border-radius:12px">+ Cari Makanan Lagi</a></div></div>`; } }catch(e){}
  // FIX PICKUP: ambil dari stores table - pelanggan tidak boleh disuruh edit warung
  // state.storeId bisa kosong karena cart lama, coba ambil dari berbagai sumber
  var effectiveStoreId = state.storeId || state.store_id || null;
  try{
    if(!effectiveStoreId){
      // coba dari cartStore state
      const cs = cartStore.getState ? cartStore.getState() : null;
      if(cs){
        effectiveStoreId = cs.storeId || cs.store_id || cs.store?.id || null;
        if(!effectiveStoreId && cs.storeName){
          // fallback cari by name jika id tidak ada
          try{
            const {data:byName}=await supabase.from('stores').select('id').ilike('name', cs.storeName).limit(1).maybeSingle();
            if(byName) effectiveStoreId = byName.id;
          }catch(e){}
        }
      }
    }
    // jika masih tidak ada, coba ambil dari product pertama (store_products punya store_id)
    if(!effectiveStoreId && state.items && state.items.length){
      try{
        const firstProdId = state.items[0].product_id || state.items[0].id;
        if(firstProdId){
          const {data:prod}=await supabase.from('store_products').select('store_id').eq('id', firstProdId).maybeSingle();
          if(prod && prod.store_id) effectiveStoreId = prod.store_id;
        }
      }catch(e){}
    }
    if(effectiveStoreId) state.storeId = effectiveStoreId;
  }catch(e){ console.warn('effectiveStoreId fail', e); }

  if(!state.pickup||!state.pickup.lat){
    if(effectiveStoreId){
      try{
        const {data:storeFix}=await supabase.from('stores').select('id,name,lat,lng,latitude,longitude,alamat_text').eq('id', effectiveStoreId).single();
        if(storeFix){
          var sLat=storeFix.lat||storeFix.latitude;
          var sLng=storeFix.lng||storeFix.longitude;
          // handle jika lat/lng disimpan sebagai string
          if(sLat!=null && sLng!=null){
            sLat=Number(sLat); sLng=Number(sLng);
            if(!isNaN(sLat) && !isNaN(sLng) && sLat!==0 && sLng!==0){
              state.pickup={lat:sLat, lng:sLng, text:storeFix.name, alamat_text:storeFix.alamat_text};
              try{ localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state)); }catch(e){}
              try{ if(cartStore._actions && cartStore._actions.setStore) cartStore._actions.setStore(storeFix); }catch(e){}
            }
          }
        }
      }catch(e){ console.warn('fix pickup fail', e); }
    }
  }
  var totals; try{ totals=cartStore._actions.getTotals(); }catch(e){ var sub=0; for(var i=0;i<(state.items||[]).length;i++){ sub+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); } totals={subtotal:sub,delivery_fee:0,total:sub}; }
  var itemsHtml=''; 
  if(state.items&&state.items.length){ 
    for(var i=0;i<state.items.length;i++){ 
      var it=state.items[i]; var key=it.cartKey||it.product_id||it.id;
      var variTxt = it.variants ? (typeof it.variants==='object'? (it.variants.name||'') : '') : '';
      var addonTxt = it.addons && it.addons.length ? it.addons.map(a=>a.name).join(', ') : '';
      itemsHtml+=`<div class="card" style="margin:0 0 10px 0;border:1px solid var(--border);border-radius:16px;padding:12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);box-shadow:0 2px 12px var(--shadow);position:relative;overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--primary)"></div><div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:22px">🍱</div><div style="flex:1;min-width:0"><div style="font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.name||''}</div><div class="muted" style="font-size:11px">Rp ${Number(it.harga||0).toLocaleString()} x ${it.qty} ${variTxt?`• ${variTxt}`:''}</div>${addonTxt?`<div class="muted" style="font-size:10px">+ ${addonTxt}</div>`:''}<div style="font-weight:700;font-size:12px;color:var(--primary);margin-top:2px">Rp ${(Number(it.harga||0)*Number(it.qty||0)).toLocaleString()}</div></div><div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:4px"><button onclick="window._cartQty('${key}',${it.qty-1})" class="btn secondary" style="width:28px;height:28px;border-radius:50%;padding:0">−</button><span style="min-width:20px;text-align:center;font-weight:800;font-size:13px">${it.qty}</span><button onclick="window._cartQty('${key}',${it.qty+1})" class="btn secondary" style="width:28px;height:28px;border-radius:50%;padding:0;background:var(--primary);color:var(--card);border:none">+</button></div><button onclick="window._removeCartItem('${key}')" style="font-size:10px;background:transparent;border:none;color:var(--danger)">🗑️ Hapus</button></div></div></div>`;
    } 
  } else {
    itemsHtml=`<div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang masih kosong</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:8px 16px;font-size:12px">+ Cari Makanan</a></div>`;
  }
  var distance_km=state.distanceKm||0; if(state.pickup&&state.pickup.lat&&state.dest&&state.dest.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
  var delivery_fee=(!state.items||!state.items.length)?0:(distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)));
  var total=totals.subtotal+delivery_fee;
  var warungName = state.storeName || state.pickup?.text || state.pickup?.name || 'Warung';
  var warungAlamat = state.pickup?.alamat_text || state.pickup?.text || '';
  var warungLat = state.pickup?.lat || 0;
  var warungLng = state.pickup?.lng || 0;
  var destText = state.dest?.text || '';
  var destLat = state.dest?.lat || 0;
  var destLng = state.dest?.lng || 0;

  return `<div class="card" style="border:none;box-shadow:none;background:transparent;padding:0"><h2 style="font-size:22px;margin:0 0 4px 0">🛒 Keranjang - ${state.storeName||'Nasgor Pak W'}</h2><p class="muted" style="font-size:11px;margin:0 0 12px 0">${state.items?.length||0} item • ${warungName}</p><div id="cartItemsContainer" class="list" style="margin-top:10px;display:block">${itemsHtml}</div><div style="height:12px"></div>
    <div id="detailJarakContainer" style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;display:block">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px">
        <div style="font-weight:800;font-size:12px;margin-bottom:6px">📍 Detail Jarak Warung</div>
        <div style="font-size:11px;line-height:1.5">
          <div>🏪 <b>${warungName}</b></div>
          <div class="muted" style="font-size:10px">${warungAlamat} ${warungLat?`(${warungLat.toFixed(5)}, ${warungLng.toFixed(5)})`:''}</div>
          <div style="margin-top:6px">🎯 <b>Tujuan:</b> ${destText||'<span class=muted>Belum set lokasi</span>'}</div>
          <div class="muted" style="font-size:10px">${destLat?`(${destLat.toFixed(5)}, ${destLng.toFixed(5)})`:''}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <span style="background:var(--primary);color:var(--card);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">Jarak: ${distance_km.toFixed(2)} km</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">Ongkir: Rp ${delivery_fee.toLocaleString()}</span>
            <span style="background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:6px;font-size:11px">${distance_km<=2?'≤2km flat Rp 3rb':'Hitung Rp 3rb/km min Rp 3rb'}</span>
          </div>
        </div>
      </div>
      <div id="alamatAntarContainer" style="display:block"><div style="font-weight:800;font-size:12px">📍 Alamat Antar (Wajib Isi)</div>
      <input id="destText" value="${state.dest.text||''}" placeholder="Contoh: RT 05 RW 02, Desa Suruh, Trenggalek" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border)"/>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button id="btnUseMyLocation" class="btn primary" style="flex:1;font-size:12px;padding:10px">📌 Pakai Lokasi Saya (Auto)</button>
      </div>
      <div class="muted" style="font-size:10px;margin-top:6px">💡 Klik tombol di atas untuk auto isi alamat + koordinat. Atau ketik manual alamat lengkap minimal 5 huruf.</div>
      <div class="muted" style="font-size:10px;margin-top:6px">Lat: <span id="cartLatDisplay">${state.dest.lat||'-'}</span> Lng: <span id="cartLngDisplay">${state.dest.lng||'-'}</span> • <span id="ongkirLiveStatus">Total ongkir Rp ${delivery_fee.toLocaleString()} untuk ${distance_km.toFixed(2)} km</span></div>
    </div>
    </div><div id="cartSummaryContainer" style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:12px;display:block">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Subtotal (${state.items?.length||0} item)</span><span id="cartSubtotal">Rp ${totals.subtotal.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>Ongkir (${distance_km.toFixed(2)} km)</span><span id="cartOngkir">Rp ${delivery_fee.toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:6px;font-size:14px"><span>Total</span><span id="cartTotal">Rp ${total.toLocaleString()}</span></div>
    </div></div><div id="driverSearchContainer" class="card" style="margin-top:12px;border:2px solid var(--primary);background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);display:block"><div style="display:flex;justify-content:space-between"><h3 style="margin:0;font-size:14px">🏍️ Driver Terdekat dari Warung</h3><button id="btnRefreshDrivers" class="btn secondary" style="width:auto;font-size:11px">🔄 Refresh</button></div><div id="foodDriverStatus" class="muted" style="font-size:11px;margin-top:6px">Memuat...</div><div id="nearbyDriversList" style="margin-top:10px"></div><div style="margin-top:12px"><button id="btnCheckoutBroadcast" class="btn secondary" style="width:100%">📢 Broadcast ke Semua Driver</button></div></div>`;
}

export async function viewMyStore(){
  try{
    const profile=await getProfile(); if(!profile) return '<div class="card">Login dulu</div>';
    let stores=[]; let q=await supabase.from('stores').select('*').eq('owner_id',profile.id).limit(20);
    if(!q.data||!q.data.length){ let q2=await supabase.from('stores').select('*').eq('user_id',profile.id).limit(20); if(q2.data?.length) stores=q2.data; else { try{ stores=await warungStore._actions.fetchMyStores(); }catch(e){} if(!stores.length&&q.data?.length) stores=q.data; } } else stores=q.data;
    
    try{ initMerchantNotifButton(profile); }catch(e){}
    // Jika belum ada warung, langsung tampilkan form buat inline
    if(!stores.length){
      return `<div class="card" style="border:none;background:transparent;box-shadow:none;padding:0">
        <h2 style="font-size:22px;margin-bottom:12px">🏪 Warungku</h2>
        <div id="warungCreateForm" class="card" style="border:2px solid var(--primary);background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%)">
          <h3 style="margin:0 0 12px 0">+ Buat Warung Pertama</h3>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungCreateName" placeholder="Contoh: Nasgor Pak W" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
            <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungCreateAlamat" placeholder="RT12 RW05, Jalan..." style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungCreateLat" type="number" step="0.000001" placeholder="-8.095" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungCreateLng" type="number" step="0.000001" placeholder="111.635" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
            <div style="display:flex;gap:6px"><button id="btnWarungCreateMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungCreateMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
            <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungCreateIsOpen" type="checkbox" checked/> Warung Buka</label>
            <button id="btnSaveWarungCreate" class="btn primary" style="width:100%;padding:12px;border-radius:12px;font-weight:800">+ Buat Warung</button>
          </div>
        </div>
      </div>`;
    }

    const merchantNotifHtml = getMerchantNotifBtnHtml();
    const cards=stores.map(s=>`<div class="card" style="margin:0 0 12px 0;border:1px solid var(--border);border-radius:16px;padding:12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center"><div style="width:40px;height:40px;border-radius:12px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:20px">🏪</div><div><b style="font-size:14px">${s.name}</b><div class="muted" style="font-size:11px">${s.alamat_text||''}</div></div></div><span style="font-size:10px;background:${s.is_open?'var(--primary)':'var(--danger)'};color:var(--card);padding:4px 10px;border-radius:99px;font-weight:700">${s.is_open?'BUKA':'TUTUP'}</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button onclick="window._toggleWarung('${s.id}',${!s.is_open})" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px">${s.is_open?'🔴 Tutup':'🟢 Buka'}</button><a href="#/store/products/${s.id}" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px;text-align:center">🍱 Kelola Menu + Varian</a><button onclick="window._openWarungOrders('${s.id}')" class="btn primary" style="font-size:12px;padding:12px;border-radius:12px;background:var(--primary);color:#052e16;font-weight:800">📦 Order</button><button onclick="window._editWarung('${s.id}')" class="btn secondary" style="font-size:12px;padding:10px;border-radius:10px">✏️ Edit</button></div><button onclick="window._deleteWarung('${s.id}','${(s.name||'').replace(/'/g,"\'") }')" class="btn secondary" style="width:100%;margin-top:8px;font-size:11px;padding:8px;border-radius:10px;background:var(--card2);color:var(--danger);border:1px solid var(--border)">🗑️ Hapus Warung</button></div>`).join('');

    return `<div class="card" style="border:none;background:transparent;box-shadow:none;padding:0">
      <h2 style="font-size:22px;margin-bottom:12px">🏪 Warungku</h2>
      
      <!-- Form Create Inline - hidden by default, tampil saat klik Tambah -->
      <div id="warungCreateForm" style="display:none" class="card" style="border:2px solid var(--primary);background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">+ Tambah Warung</h3><button onclick="window._closeWarungCreateForm()" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">✕</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungCreateName" placeholder="Nama Warung" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
          <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungCreateAlamat" placeholder="RT/RW, Jalan, Desa" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungCreateLat" type="number" step="0.000001" placeholder="-8.095" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungCreateLng" type="number" step="0.000001" placeholder="111.635" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
          <div style="display:flex;gap:6px"><button id="btnWarungCreateMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungCreateMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
          <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungCreateIsOpen" type="checkbox" checked/> Warung Buka</label>
          <div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._closeWarungCreateForm()" class="btn secondary" style="flex:1;padding:12px;border-radius:10px">Batal</button><button id="btnSaveWarungCreate" class="btn primary" style="flex:1;padding:12px;border-radius:10px;font-weight:800">+ Buat</button></div>
        </div>
      </div>

      <!-- Form Edit Inline - hidden by default, tampil saat klik Edit -->
      <div id="warungEditForm" style="display:none" class="card" style="border:2px solid var(--warning);border-radius:16px;padding:16px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">✏️ Edit Warung</h3><button onclick="window._closeWarungEditForm()" class="btn secondary" style="width:32px;height:32px;border-radius:50%;padding:0">✕</button></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label class="muted" style="font-size:11px">Nama Warung</label><input id="warungEditName" placeholder="Nama Warung" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div>
          <div><label class="muted" style="font-size:11px">Alamat Lengkap</label><textarea id="warungEditAlamat" placeholder="RT/RW, Jalan, Desa" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px;min-height:60px"></textarea></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="muted" style="font-size:11px">Latitude</label><input id="warungEditLat" type="number" step="0.000001" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div><div><label class="muted" style="font-size:11px">Longitude</label><input id="warungEditLng" type="number" step="0.000001" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);margin-top:4px"/></div></div>
          <div style="display:flex;gap:6px"><button id="btnWarungEditMapPicker" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">🗺️ Pilih di Peta</button><button id="btnWarungEditMyLoc" type="button" class="btn secondary" style="flex:1;font-size:11px;padding:10px;border-radius:10px">📌 Lokasi Saya</button></div>
          <label style="font-size:12px;display:flex;gap:6px;align-items:center"><input id="warungEditIsOpen" type="checkbox"/> Warung Buka</label>
          <div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._closeWarungEditForm()" class="btn secondary" style="flex:1;padding:12px;border-radius:10px">Batal</button><button id="btnSaveWarungEdit" class="btn primary" style="flex:1;padding:12px;border-radius:10px;font-weight:800">💾 Simpan</button></div>
        </div>
      </div>

      <div class="list">${cards}</div>
      <button onclick="window._addWarung()" class="btn secondary" style="width:100%;margin-top:12px;text-align:center;padding:12px;border-radius:12px">+ Tambah Warung</button>
    </div>`;
  }catch(e){ return `<div class="card">Error Warungku: ${e.message}</div>`; }
}

export async function viewStoreProducts(storeId){
  try{
    if(!storeId){ const profile=await getProfile(); let {data:stores}=await supabase.from('stores').select('id').eq('owner_id',profile.id).limit(1); if(!stores?.length){ let q2=await supabase.from('stores').select('id').eq('user_id',profile.id).limit(1); stores=q2.data; } if(!stores?.length) return '<div class="card">Buat warung dulu</div>'; storeId=stores[0].id; }
    const {data:store}=await supabase.from('stores').select('*').eq('id',storeId).single();
    const {data:products}=await supabase.from('store_products').select('*').eq('store_id',storeId).order('created_at',{ascending:false}).limit(100);
    const listHtml=(products||[]).map(p=>{
      let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){}
      let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
      const variTxt=vari.length?vari.map(v=>v.name+(v.price_delta?` (+${v.price_delta})`:'')).join(', '):'Biasa';
      const addonTxt=addons.length?addons.map(a=>a.name).join(', '):'-';
      return `<div class="card" style="margin:0 0 10px 0;border:1px solid var(--border);border-radius:12px;padding:10px"><div style="display:flex;justify-content:space-between"><div><b>${p.name}</b><div class="muted" style="font-size:11px">Rp ${Number(p.harga||0).toLocaleString()} • ${p.kategori||''} • <span style="background:${p.is_available?'var(--primary)':'var(--danger)'};color:var(--card);padding:2px 6px;border-radius:6px;font-size:10px">${p.is_available?'TERSEDIA':'HABIS'}</span></div><div class="muted" style="font-size:10px">Varian: ${variTxt} | Addon: ${addonTxt}</div></div><button onclick="window._toggleProduct('${p.id}',${!p.is_available})" class="btn secondary" style="width:auto;font-size:11px">${p.is_available?'Nonaktif':'Aktif'}</button></div><div style="display:flex;gap:6px;margin-top:8px"><button onclick="window._editProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px">✏️ Edit Varian/Addon</button><button onclick="window._deleteProduct('${p.id}')" class="btn secondary" style="flex:1;font-size:11px;background:var(--card2);color:var(--danger)">🗑️</button></div></div>`;
    }).join('')||'<div class="muted">Belum ada menu</div>';
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><h2>🍱 Kelola Menu - ${store?.name||''}</h2><button onclick="window._addProduct('${storeId}')" class="btn primary" style="width:100%;margin-top:12px;padding:12px">+ Tambah Menu + Varian & Addon</button></div><div class="list" style="margin-top:12px">${listHtml}</div>
      <div id="productModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px"><div style="background:var(--card);width:100%;max-width:480px;border-radius:16px;padding:16px;max-height:92vh;overflow:auto"><h3 id="productModalTitle">Tambah Menu</h3><div style="display:flex;flex-direction:column;gap:10px;margin-top:12px"><input id="prodName" placeholder="Nama menu" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodHarga" type="number" placeholder="Harga dasar" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><input id="prodKategori" placeholder="Kategori" value="Makanan" style="padding:10px;border-radius:8px;border:1px solid var(--border)"/><label style="font-size:12px"><input id="prodAvailable" type="checkbox" checked/> Tersedia</label>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">📦 Varian</b><button onclick="window._addVariantField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Varian</button></div><div id="prodVariantsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b style="font-size:12px">➕ Addon</b><button onclick="window._addAddonField()" class="btn secondary" style="width:auto;font-size:11px;padding:4px 8px">+ Addon</button></div><div id="prodAddonsList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div></div>
      <div style="display:flex;gap:8px"><button onclick="window._closeProductModal()" class="btn secondary" style="flex:1">Batal</button><button id="btnSaveProduct" class="btn primary" style="flex:1">Simpan</button></div></div></div></div>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}

export async function viewStoreOrders(storeId){
  try{
    let query=supabase.from('food_orders').select('*').order('created_at',{ascending:false}).limit(100);
    if(storeId) query=query.eq('store_id',storeId);
    const {data:orders, error} = await query;
    if(error) throw error;
    const allOrders = orders||[];
    const ordersJson = JSON.stringify(allOrders).replace(/</g,'\\u003c');
    return `<div class="card"><a href="#/store/my" class="muted">← Warungku</a><div style="margin-bottom:12px">${getMerchantNotifBtnHtml()}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">📦 Order Masuk</h2>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span id="warungOrderCount" class="muted" style="font-size:11px">${allOrders.length} order terbaru (max 100)</span>
          <span id="warungAutoStatus" style="font-size:10px;padding:4px 8px;border-radius:99px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1.5s infinite"></span> Auto-refresh ON</span>
          <button id="warungToggleAuto" onclick="window._toggleWarungAutoRefresh()" class="btn secondary" style="width:auto;font-size:10px;padding:5px 8px;border-radius:8px">⏸️ Pause</button>
          <button onclick="window._refreshWarungOrdersSoft()" class="btn secondary" style="width:auto;font-size:11px;padding:6px 10px;border-radius:8px">🔄</button>
        </div>
      </div>
      <div id="warungNewOrderBanner" style="display:none;margin-top:12px;padding:10px 12px;background:linear-gradient(135deg,var(--primary),var(--primary-2));color:#052e16;border-radius:10px;font-weight:800;font-size:12px;text-align:center;cursor:pointer" onclick="window._renderWarungOrdersPage(1)">🔔 Ada order baru! Klik untuk lihat</div>
      <div id="warungOrderList" class="list" style="margin-top:12px"></div>
      <div id="warungOrderPagination" style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:16px;flex-wrap:wrap"></div>
      <div id="warungOrderInfo" class="muted" style="text-align:center;font-size:11px;margin-top:8px"></div>
    </div>
    <style>@keyframes pulse{0%{opacity:1}50%{opacity:.4}100%{opacity:1}} .warung-order-card{transition:all .3s ease} .warung-order-card.new-highlight{animation:highlightNew .8s ease} @keyframes highlightNew{0%{background:var(--primary);transform:scale(1.02)}100%{background:var(--card);transform:scale(1)}}</style>
    <script type="application/json" id="warungOrdersData">${ordersJson}</script>
    <script>
      (function(){
        // clear existing interval if any (avoid double timer on hash reload)
        if(window._warungAutoInterval) { clearInterval(window._warungAutoInterval); window._warungAutoInterval=null; }
        if(window._warungRealtimeChannel) { try{ window._warungRealtimeChannel.unsubscribe(); }catch(e){} window._warungRealtimeChannel=null; }

        if(!window._warungOrdersPerPage) window._warungOrdersPerPage = 10;
        window._warungOrdersData = [];
        window._warungOrdersPage = 1;
        window._warungAutoEnabled = true;
        window._warungStoreId = '${storeId||''}';
        window._warungLastFetchHash = '';
        window._warungIsFetching = false;

        try{
          var el=document.getElementById('warungOrdersData');
          if(el) window._warungOrdersData = JSON.parse(el.textContent||'[]');
        }catch(e){ window._warungOrdersData=[]; }

        function hashOrders(data){
          try{ return data.map(function(o){ return o.id+':'+o.status+':'+o.updated_at; }).join('|'); }catch(e){ return ''+Date.now(); }
        }
        window._warungLastFetchHash = hashOrders(window._warungOrdersData);

        window._renderWarungOrdersPage = function(page, opts){
          opts = opts||{};
          var noScroll = !!opts.noScroll;
          var data = window._warungOrdersData||[];
          var perPage = 10;
          var totalPages = Math.max(1, Math.ceil(data.length / perPage));
          if(page < 1) page = 1;
          if(page > totalPages) page = totalPages;
          window._warungOrdersPage = page;

          var start = (page-1)*perPage;
          var end = start + perPage;
          var slice = data.slice(start, end);

          var listEl = document.getElementById('warungOrderList');
          var pagEl = document.getElementById('warungOrderPagination');
          var infoEl = document.getElementById('warungOrderInfo');
          var countEl = document.getElementById('warungOrderCount');

          if(countEl) countEl.textContent = data.length + ' order terbaru (max 100)';
          if(!data.length){
            if(listEl) listEl.innerHTML = '<div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:12px" class="muted">Belum ada order</div>';
            if(pagEl) pagEl.innerHTML='';
            if(infoEl) infoEl.textContent='';
            return;
          }

          // render tanpa kedip: build string lalu replace sekali
          var html = slice.map(function(o){
            var shortId = (o.id||'').slice(0,6).toUpperCase();
            var itemsTxt = (o.items||[]).map(function(i){ return (i.name||'') + ' x' + (i.qty||1); }).join(', ');
            var total = Number(o.total||0).toLocaleString('id-ID');
            var status = o.status||'-';
            var statusColor = status==='completed' ? 'var(--primary)' : status==='ready' ? '#22c55e' : status==='preparing' ? '#f59e0b' : 'var(--warning)';
            var timeTxt = o.created_at ? new Date(o.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
            var isNew = o._isNew ? ' new-highlight' : '';
            return '<div class="card warung-order-card' + isNew + '" data-order-id="' + o.id + '" style="margin:0 0 10px 0;border-radius:12px;padding:10px;border:1px solid var(--border)">'
              + '<div style="display:flex;justify-content:space-between;align-items:center">'
              + '<b>#' + shortId + '</b>'
              + '<span style="font-size:10px;background:' + statusColor + ';color:white;padding:3px 8px;border-radius:99px;font-weight:700">' + status + '</span>'
              + '</div>'
              + '<div class="muted" style="font-size:11px;margin-top:4px">' + (itemsTxt||'-') + '</div>'
              + '<div style="font-size:11px;margin-top:2px">Rp ' + total + ' • <span class="muted">' + timeTxt + '</span></div>'
              + '<div style="display:flex;gap:6px;margin-top:8px">'
              + '<button onclick="window._orderStatus(\'' + o.id + '\',\'preparing\')" class="btn secondary" style="flex:1;font-size:11px;padding:8px;border-radius:8px">Masak</button>'
              + '<button onclick="window._orderStatus(\'' + o.id + '\',\'ready\')" class="btn secondary" style="flex:1;font-size:11px;padding:8px;border-radius:8px">Siap</button>'
              + '<button onclick="window._orderStatus(\'' + o.id + '\',\'completed\')" class="btn primary" style="flex:1;font-size:11px;padding:8px;border-radius:8px">Selesai</button>'
              + '</div></div>';
          }).join('');
          if(listEl) listEl.innerHTML = html;

          if(pagEl){
            var btnStyle = 'min-width:36px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-weight:700;font-size:12px;cursor:pointer';
            var activeStyle = 'min-width:36px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:#052e16;font-weight:800;font-size:12px;cursor:pointer';
            var disabledStyle = 'min-width:36px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--muted);font-weight:700;font-size:12px;opacity:.5;cursor:not-allowed';
            var pagesHtml = '';
            if(page>1) pagesHtml += '<button onclick="window._renderWarungOrdersPage(' + (page-1) + ')" style="' + btnStyle + '">‹</button>';
            else pagesHtml += '<button disabled style="' + disabledStyle + '">‹</button>';
            var maxVisible = 5;
            var startPage = Math.max(1, page - 2);
            var endPage = Math.min(totalPages, startPage + maxVisible -1);
            if(endPage - startPage < maxVisible-1) startPage = Math.max(1, endPage - maxVisible +1);
            if(startPage>1){
              pagesHtml += '<button onclick="window._renderWarungOrdersPage(1)" style="' + (1===page?activeStyle:btnStyle) + '">1</button>';
              if(startPage>2) pagesHtml += '<span style="font-size:12px;color:var(--muted)">…</span>';
            }
            for(var p=startPage; p<=endPage; p++){
              if(p===page) pagesHtml += '<button style="' + activeStyle + '">' + p + '</button>';
              else pagesHtml += '<button onclick="window._renderWarungOrdersPage(' + p + ')" style="' + btnStyle + '">' + p + '</button>';
            }
            if(endPage<totalPages){
              if(endPage<totalPages-1) pagesHtml += '<span style="font-size:12px;color:var(--muted)">…</span>';
              pagesHtml += '<button onclick="window._renderWarungOrdersPage(' + totalPages + ')" style="' + (totalPages===page?activeStyle:btnStyle) + '">' + totalPages + '</button>';
            }
            if(page<totalPages) pagesHtml += '<button onclick="window._renderWarungOrdersPage(' + (page+1) + ')" style="' + btnStyle + '">›</button>';
            else pagesHtml += '<button disabled style="' + disabledStyle + '">›</button>';
            pagEl.innerHTML = pagesHtml;
          }
          if(infoEl){
            infoEl.textContent = 'Halaman ' + page + ' dari ' + totalPages + ' • ' + (start+1) + '-' + Math.min(end, data.length) + ' dari ' + data.length + ' • Auto-refresh 10 detik';
          }
          // clear _isNew flag after render
          setTimeout(function(){
            data.forEach(function(o){ delete o._isNew; });
            var banner=document.getElementById('warungNewOrderBanner');
            if(banner && !banner._forceShow) banner.style.display='none';
          }, 2000);
        };

        // soft refresh tanpa kedip - diff check
        window._refreshWarungOrdersSoft = async function(){
          if(window._warungIsFetching) return;
          window._warungIsFetching = true;
          var statusEl=document.getElementById('warungAutoStatus');
          try{
            if(statusEl) statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block"></span> Refreshing...';
            var q = supabase.from('food_orders').select('*').order('created_at',{ascending:false}).limit(100);
            if(window._warungStoreId) q = q.eq('store_id', window._warungStoreId);
            var res = await q;
            if(res.error) throw res.error;
            var newData = res.data||[];
            var newHash = hashOrders(newData);
            if(newHash === window._warungLastFetchHash){
              if(statusEl) statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1.5s infinite"></span> Auto-refresh ON • ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
              window._warungIsFetching=false;
              return;
            }
            // deteksi order baru
            var oldIds = new Set((window._warungOrdersData||[]).map(function(o){return o.id}));
            var hasNew = false;
            newData.forEach(function(o){
              if(!oldIds.has(o.id)){ o._isNew = true; hasNew=true; }
            });
            window._warungOrdersData = newData;
            window._warungLastFetchHash = newHash;

            // jika ada order baru dan user tidak di halaman 1, tampilkan banner, jangan pindah paksa
            if(hasNew && window._warungOrdersPage !== 1){
              var banner=document.getElementById('warungNewOrderBanner');
              if(banner){ banner.style.display='block'; banner._forceShow=true; setTimeout(function(){ banner._forceShow=false; }, 10000); }
              // update info count saja, tapi tetap render halaman saat ini jika ada perubahan status di halaman itu
              // cek apakah ada perubahan di slice saat ini
              window._renderWarungOrdersPage(window._warungOrdersPage, {noScroll:true});
            } else {
              window._renderWarungOrdersPage(window._warungOrdersPage, {noScroll:true});
              if(hasNew){
                try{ if(window._playNotifSound) window._playNotifSound(); }catch(e){}
                try{ if('vibrate' in navigator) navigator.vibrate(200); }catch(e){}
              }
            }
            if(statusEl) statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1.5s infinite"></span> Auto-refresh ON • ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
          }catch(e){
            console.warn('auto refresh fail', e);
            if(statusEl) statusEl.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span> Gagal refresh';
          }
          window._warungIsFetching=false;
        };

        window._toggleWarungAutoRefresh = function(){
          window._warungAutoEnabled = !window._warungAutoEnabled;
          var btn=document.getElementById('warungToggleAuto');
          var statusEl=document.getElementById('warungAutoStatus');
          if(window._warungAutoEnabled){
            if(btn) btn.textContent='⏸️ Pause';
            if(statusEl) statusEl.innerHTML='<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 1.5s infinite"></span> Auto-refresh ON';
            window._startWarungAutoRefresh();
          }else{
            if(btn) btn.textContent='▶️ Play';
            if(statusEl) statusEl.innerHTML='<span style="width:6px;height:6px;border-radius:50%;background:var(--muted);display:inline-block"></span> Paused';
            if(window._warungAutoInterval){ clearInterval(window._warungAutoInterval); window._warungAutoInterval=null; }
          }
        };

        window._startWarungAutoRefresh = function(){
          if(window._warungAutoInterval) clearInterval(window._warungAutoInterval);
          window._warungAutoInterval = setInterval(function(){
            if(document.hidden) return; // hemat baterai kalau tab tidak aktif
            if(!window._warungAutoEnabled) return;
            window._refreshWarungOrdersSoft();
          }, 10000); // 10 detik
        };

        // Realtime supabase untuk instant update (tanpa kedip juga)
        try{
          if(supabase && supabase.channel){
            var ch = supabase.channel('warung-orders-'+(window._warungStoreId||'all'))
              .on('postgres_changes', {event:'*', schema:'public', table:'food_orders', filter: window._warungStoreId ? 'store_id=eq.'+window._warungStoreId : undefined}, function(payload){
                console.log('realtime order change', payload);
                window._refreshWarungOrdersSoft();
              }).subscribe();
            window._warungRealtimeChannel = ch;
          }
        }catch(e){ console.warn('realtime setup fail', e); }

        window._goWarungPage = function(n){ window._renderWarungOrdersPage(n); };
        window._refreshWarungOrders = function(){ location.reload(); }; // legacy hard refresh tetap ada

        // initial render + start auto
        setTimeout(function(){ window._renderWarungOrdersPage(1); window._startWarungAutoRefresh(); }, 0);

        // cleanup saat pindah halaman
        window.addEventListener('hashchange', function(){
          if(window._warungAutoInterval){ clearInterval(window._warungAutoInterval); window._warungAutoInterval=null; }
          if(window._warungRealtimeChannel){ try{ window._warungRealtimeChannel.unsubscribe(); }catch(e){} window._warungRealtimeChannel=null; }
        }, {once:true});
      })();
    </script>`;
  }catch(e){ return `<div class="card">Error: ${e.message}</div>`; }
}



window._loadNearbyDriversForCart = async function(){
  var listEl=document.getElementById('nearbyDriversList'); var statusEl=document.getElementById('foodDriverStatus');
  // Samakan ID dengan ojol biar bisa reuse render logic
  var ojolListEl=document.getElementById('driverList');
  if(!listEl && ojolListEl) listEl=ojolListEl;
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food');
    if(!raw){ if(statusEl) statusEl.textContent='Keranjang kosong'; return; }
    var state=JSON.parse(raw);
    
    // === FIX PICKUP: pelanggan tidak boleh disuruh edit warung, auto ambil dari stores table ===
    if(!state.pickup||!state.pickup.lat||!state.pickup.lng){
      console.log('[food-driver] pickup missing, auto fetch dari stores');
      var fetched=false;
      // 1. coba dari cartStore
      try{
        const cs=cartStore.getState();
        if(cs && cs.store && (cs.store.lat||cs.store.latitude)){
          var clat=cs.store.lat||cs.store.latitude; var clng=cs.store.lng||cs.store.longitude||cs.store.long;
          if(clat&&clng){ state.pickup={lat:Number(clat),lng:Number(clng),text:cs.store.name||cs.storeName||'', alamat_text:cs.store.alamat_text||''}; fetched=true; }
        } else if(cs && cs.pickup && cs.pickup.lat){ state.pickup=cs.pickup; fetched=true; }
        if(!state.storeId && cs && (cs.storeId||cs.store?.id)) state.storeId=cs.storeId||cs.store?.id;
      }catch(e){}
      // 2. coba fetch store dari supabase by storeId (atau by product)
      if(!state.pickup||!state.pickup.lat){
        var sid=state.storeId;
        if(!sid && state.items && state.items.length){
          try{
            const pid=state.items[0].product_id||state.items[0].id;
            const {data:p}=await supabase.from('store_products').select('store_id').eq('id', pid).maybeSingle();
            if(p && p.store_id) sid=p.store_id;
          }catch(e){}
        }
        if(sid){
          try{
            const {data:store} = await supabase.from('stores').select('id,name,lat,lng,latitude,longitude,alamat_text').eq('id', sid).single();
            if(store){
              var sLat=store.lat||store.latitude; var sLng=store.lng||store.longitude;
              if(sLat!=null && sLng!=null){
                sLat=Number(sLat); sLng=Number(sLng);
                if(!isNaN(sLat)&&!isNaN(sLng)&&sLat!==0&&sLng!==0){
                  state.pickup={lat:sLat, lng:sLng, text:store.name, alamat_text:store.alamat_text};
                  state.storeId=sid;
                  try{ localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state)); }catch(e){}
                  fetched=true;
                }
              }
            }
          }catch(e){ console.warn('[food-driver] fetch store fail', e); }
        }
      }
      // 3. Jika masih kosong, JANGAN tampilkan peringatan edit warung untuk pelanggan - coba pakai lokasi tujuan atau tampilkan driver terdekat saja
      if(!state.pickup||!state.pickup.lat){
        console.warn('[food-driver] pickup tetap kosong setelah fetch, pakai fallback dest atau jangan block');
        // Jika tujuan ada, pakai tujuan sebagai pusat pencarian sementara (driver tetap muncul)
        if(state.dest && state.dest.lat && state.dest.lng){
          state.pickup={lat:state.dest.lat, lng:state.dest.lng, text:'Lokasi antar (fallback)', alamat_text:''};
          if(statusEl) statusEl.textContent='⚠️ Lokasi warung tidak terbaca, menampilkan driver di sekitar tujuan...';
        } else {
          // Tidak ada pickup dan dest, jangan block dengan peringatan edit warung - tampilkan semua driver
          if(statusEl) statusEl.textContent='Mencari driver...';
          // Buat pickup dummy agar tidak return
          state.pickup={lat:-7.98, lng:111.62, text:'Suruh', alamat_text:''}; // fallback Trenggalek
        }
      }
    }

    if(statusEl) statusEl.textContent='Mencari driver terdekat dari '+ (state.pickup.text||'warung') +'...';
    if(listEl) listEl.innerHTML='<div class=muted style="padding:12px;text-align:center">🔍 Mencari driver seperti di ojek...</div>';

    // === FLOW SAMA PERSIS DENGAN order.js searchNearby ===
    // 1. Ambil driver_locations (seperti ojol)
    var {data:locs, error:locErr}=await supabase.from('driver_locations').select('*').limit(100);
    console.log('[food-driver] locs', locs?.length, locErr);
    if(locErr){
      console.error('[food-driver] RLS error', locErr);
      // Fallback: coba ambil users driver langsung seperti ojol tanpa lokasi (biar list tetap muncul)
      var {data:usersOnly}=await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor').eq('role','driver').limit(20);
      if(usersOnly && usersOnly.length){
        locs=usersOnly.map(u=>({driver_id:u.id, lat:state.pickup.lat+ (Math.random()-0.5)*0.02, lng:state.pickup.lng+(Math.random()-0.5)*0.02, jenis_kendaraan:u.jenis_kendaraan}));
      } else {
        if(statusEl) statusEl.textContent='Error RLS: '+locErr.message;
        if(listEl) listEl.innerHTML='<div style="padding:12px;background:var(--card2);border-radius:8px;font-size:11px">Gagal baca driver_locations: '+locErr.message+'<br><br>Buat policy di Supabase:<br><code>CREATE POLICY allow_read ON driver_locations FOR SELECT USING (true);</code></div>';
        return;
      }
    }

    // Jika locs kosong, coba fallback ambil driver dari users (seperti ojol tetap tampil)
    if(!locs||!locs.length){
      console.log('[food-driver] locs kosong, fallback ke users role driver');
      var {data:fallbackUsers}=await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor').eq('role','driver').limit(20);
      if(fallbackUsers && fallbackUsers.length){
        // buat dummy lokasi dekat warung
        locs=fallbackUsers.map(u=>({driver_id:u.id, lat:state.pickup.lat+ (Math.random()-0.5)*0.01, lng:state.pickup.lng+(Math.random()-0.5)*0.01, jenis_kendaraan:u.jenis_kendaraan}));
        if(statusEl) statusEl.textContent='Driver lokasi kosong, menampilkan '+fallbackUsers.length+' driver (dummy lokasi)';
      } else {
        if(statusEl) statusEl.textContent='Tidak ada driver online';
        if(listEl) listEl.innerHTML='<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:12px">Tidak ada driver online<br><small>Pastikan driver app sudah update lokasi ke driver_locations</small></div>';
        return;
      }
    }

    // 2. Ambil users driver - SAMA PERSIS dengan order.js renderDriverList filter role driver
    var driverIds=locs.map(l=>l.driver_id||l.user_id).filter(Boolean);
    var {data:users}=await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor,google_id').in('id',driverIds);
    if(!users||!users.length){
      var {data:users2}=await supabase.from('users').select('id,name,hp,role,jenis_kendaraan,nopol,tipe_motor,google_id').in('google_id',driverIds);
      if(users2 && users2.length) users=users2;
    }
    // Jika masih kosong, buat users dummy dari locs
    if(!users||!users.length){
      users=locs.map(l=>({id:l.driver_id, name:'Driver '+String(l.driver_id||'').slice(0,6), role:'driver', jenis_kendaraan:l.jenis_kendaraan||'motor', nopol:'', hp:'', tipe_motor:'Beat'}));
    }

    // 3. Mapping + hitung jarak - SAMA PERSIS dengan order.js
    var drivers=locs.map(loc=>{
      var driverIdVal=loc.driver_id||loc.user_id;
      var u=users?users.find(x=>x.id===driverIdVal || x.google_id===driverIdVal):null;
      if(!u) u={id:driverIdVal, name:'Driver '+String(driverIdVal||'').slice(0,6), role:'driver', jenis_kendaraan:loc.jenis_kendaraan||'motor', nopol:'', hp:'', tipe_motor:'Beat'};
      var dLat=null,dLng=null;
      if(loc.lat&&loc.lng){ dLat=Number(loc.lat); dLng=Number(loc.lng); }
      else if(loc.latitude&&loc.longitude){ dLat=Number(loc.latitude); dLng=Number(loc.longitude); }
      else if(loc.lokasi){
        try{ var m=String(loc.lokasi).match(/POINT\s*\(\s*([^ ]+)\s+([^ ]+)\s*\)/); if(m){ dLng=parseFloat(m[1]); dLat=parseFloat(m[2]); } }catch(e){}
      }
      if(!dLat||!dLng){ dLat=state.pickup.lat+ (Math.random()-0.5)*0.01; dLng=state.pickup.lng+(Math.random()-0.5)*0.01; }
      var dist=calcHav(state.pickup.lat,state.pickup.lng,dLat,dLng);
      return {...u, driver_id:u.id, actual_driver_id:driverIdVal, dLat, dLng, distance_km:dist, distance:dist, jenis_kendaraan:u.jenis_kendaraan||loc.jenis_kendaraan||'motor'};
    });

    // 4. Filter hanya role driver seperti di order.js baris 49-53
    var driversOnly=drivers.filter(d=>{ var role=(d.role||'').toLowerCase(); return role==='driver'; });
    if(!driversOnly.length) driversOnly=drivers; // fallback tampilkan semua kalau filter terlalu ketat, seperti order.js

    // 5. Filter vehicle type seperti order.js (tapi food tidak filter, tampil semua)
    var filtered=driversOnly;
    filtered.sort((a,b)=>a.distance_km-b.distance_km);
    filtered=filtered.slice(0,20);

    // 6. Fetch rating seperti order.js
    var ratingIds=filtered.map(d=>d.driver_id||d.actual_driver_id).filter(Boolean);
    var ratingsMap=await fetchDriverRatings(ratingIds);

    // 7. Render card SAMA PERSIS dengan order.js renderDriverList
    var renderCard=(d)=>{
      var vehIcon=(d.jenis_kendaraan||'motor')==='mobil'?'🚗':'🏍️';
      var vehLabel=d.jenis_kendaraan||'motor';
      var wa=d.hp ? `https://wa.me/${String(d.hp).replace(/[^0-9]/g,'').replace(/^0/,'62')}?text=Halo%20${encodeURIComponent(d.name)}%20antar%20makanan%20dari%20${encodeURIComponent(state.storeName||state.pickup.text||'warung')}%20ke%20${encodeURIComponent(state.dest.text||'tujuan')}` : null;
      var r=ratingsMap[d.driver_id||d.actual_driver_id];
      var ratingText=r ? `${r.avg}` : `Baru`;
      var ratingCount=r ? `(${r.count})` : '';
      var ratingBg=r ? (parseFloat(r.avg)>=4.5 ? 'var(--primary)' : parseFloat(r.avg)>=4.0 ? 'var(--warning)' : '#475569') : 'var(--border)';
      var dist=(d.distance_km||0).toFixed(2);
      return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin-bottom:10px;display:flex;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:800;font-size:14px;color:var(--text);letter-spacing:0.2px">${d.name}</span>
            <span style="background:var(--card2);border:1px solid var(--border);padding:3px 8px;border-radius:8px;font-size:10px;color:var(--muted)">${vehIcon} ${vehLabel.toUpperCase()}</span>
          </div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="background:${ratingBg};color:${r && parseFloat(r.avg)>=4.0 ? '#052e16' : 'white'};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:4px">⭐ ${ratingText} <span style="font-weight:600;opacity:0.9;font-size:10px">${ratingCount}</span></span>
            <span style="font-size:11px;color:var(--muted)">${d.nopol||''} • ${dist} km • ${d.tipe_motor||'Beat'}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:112px;justify-content:center">
          <button data-order-driver="${d.actual_driver_id||d.driver_id}" onclick="window._checkoutFoodDirect('${d.actual_driver_id||d.driver_id}')" style="background:var(--primary);color:#052e16;border:none;padding:10px 14px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(34,197,94,0.3)">✅ Pesan</button>
          <div style="display:flex;gap:6px">
            ${wa?`<a href="${wa}" target="_blank" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px;border-radius:10px;text-align:center;font-size:11px;font-weight:700;text-decoration:none">💬 WA</a>`: `<span style="flex:1;background:var(--card2);border:1px dashed var(--border);padding:8px;border-radius:10px;text-align:center;font-size:10px;color:var(--muted)">No WA</span>`}
            <button data-report-user="${d.driver_id}" data-report-name="${d.name}" data-report-role="driver" style="flex:1;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#f87171;padding:8px;border-radius:10px;font-size:12px">🚩</button>
          </div>
        </div>
      </div>`;
    };

    if(!filtered.length){
      if(statusEl) statusEl.textContent='Tidak ada driver online';
      if(listEl) listEl.innerHTML='<div style="background:var(--card2);border:1px dashed var(--border);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:12px">Tidak ada driver online</div>';
      return;
    }

    if(statusEl) statusEl.textContent='Ditemukan '+filtered.length+' driver terdekat';
    if(listEl) listEl.innerHTML=filtered.map(renderCard).join('');

  }catch(err){
    console.error('[food-driver] error', err);
    if(statusEl) statusEl.textContent='Error: '+err.message;
    if(listEl) listEl.innerHTML='<div style="padding:12px;background:var(--card2);border-radius:8px">Error: '+err.message+'<pre style="font-size:10px">'+(err.stack||'')+'</pre></div>';
  }
};

window._checkoutFoodDirect = async function(driverId){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong'); var state=JSON.parse(raw); if(!state.items?.length) return alert('Keranjang kosong - tambah makanan dulu');
    // FIX: auto perbaiki pickup jika kosong (ambil dari store)
    if(!state.pickup||!state.pickup.lat){
      if(state.storeId){
        try{
          const {data:s}=await supabase.from('stores').select('lat,lng,latitude,longitude,name,alamat_text').eq('id', state.storeId).single();
          if(s){ var sl=s.lat||s.latitude; var sn=s.lng||s.longitude; if(sl&&sn){ state.pickup={lat:Number(sl),lng:Number(sn),text:s.name,alamat_text:s.alamat_text}; localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state)); } }
        }catch(e){}
      }
      if(!state.pickup||!state.pickup.lat) return alert('⚠️ Lokasi warung belum ada. Buka Warungku > Edit Warung > Pilih di Peta dulu agar ada lat/lng');
    }
    if(!state.dest.lat||!state.dest.lng){
      var destInput=document.getElementById('destText');
      var destVal=destInput?destInput.value.trim():state.dest.text||'';
      if(destVal.length<5) return alert('⚠️ Alamat tujuan belum lengkap. Isi alamat minimal 5 huruf atau klik 📌 Pakai Lokasi Saya');
      // Jika ada text tapi tidak ada lat/lng, coba geocode dari text atau pakai lokasi terakhir
      return alert('⚠️ Koordinat tujuan belum ada. Klik 📌 Pakai Lokasi Saya untuk auto isi alamat + koordinat');
    }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat&&state.dest?.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={store_id:state.storeId,customer_id:customerId,driver_id:driverId,items:state.items,subtotal,delivery_fee,total,distance_km:parseFloat(Number(distance_km).toFixed(2)),dest_text:state.dest.text,dest_lat:state.dest.lat,dest_lng:state.dest.lng,pickup_lat:state.pickup.lat,pickup_lng:state.pickup.lng,pickup_text:state.pickup.text||'',status:'driver_assigned'};
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={store_id:payload.store_id,customer_id:payload.customer_id,driver_id:driverId,items:payload.items,total:payload.total,dest_text:payload.dest_text,dest_lat:payload.dest_lat,dest_lng:payload.dest_lng,pickup_lat:payload.pickup_lat,pickup_lng:payload.pickup_lng,status:'driver_assigned'}; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;

    
    // HANYA SAAT CHECKOUT - kosongkan keranjang TANPA REFRESH
    (function(){
      var empty={items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}};
      // 1. Kosongkan semua key cart di localStorage
      try{
        var keys=[]; for(var i=0;i<localStorage.length;i++){ try{ keys.push(localStorage.key(i)); }catch(e){} }
        keys.forEach(function(k){ if(!k) return; var low=k.toLowerCase(); if(low.includes('cart')||low.includes('food')||low.includes('warung')||low.includes('ojol')){ if(low.includes('active_food')||low.includes('last_food')||low.includes('food_auto')) return; try{ localStorage.setItem(k, JSON.stringify(empty)); }catch(e){} try{ if(k!=='active_food_order_id' && k!=='ojol_cart_v2_food') localStorage.removeItem(k); }catch(e){} } });
        localStorage.setItem('ojol_cart_v2_food', JSON.stringify(empty));
        localStorage.setItem('ojol_cart_v2', JSON.stringify(empty));
        localStorage.setItem('food_cart', JSON.stringify(empty));
        localStorage.setItem('cart', JSON.stringify(empty));
        localStorage.setItem('warung_cart', JSON.stringify(empty));
        localStorage.setItem('cart-storage', JSON.stringify(empty));
        localStorage.setItem('cartStore', JSON.stringify(empty));
      }catch(e){}
      // 2. Kosongkan sessionStorage juga
      try{ sessionStorage.removeItem('cart'); sessionStorage.removeItem('food_cart'); }catch(e){}
      // 3. Kosongkan cartStore memory - coba SEMUA API
      try{
        var stores=[typeof cartStore!=='undefined'?cartStore:null, window.cartStore?window.cartStore:null, window.warungStore?window.warungStore:null].filter(Boolean);
        stores.forEach(function(cs){
          try{ if(cs._actions){
            if(cs._actions.clearCart) cs._actions.clearCart();
            if(cs._actions.clear) cs._actions.clear();
            if(cs._actions.reset) cs._actions.reset();
            if(cs._actions.setItems) cs._actions.setItems([]);
            if(cs._actions.setCart) cs._actions.setCart(empty);
            if(cs._actions.setState) cs._actions.setState(empty);
            if(cs._actions.setStore) cs._actions.setStore(null);
          }}catch(e){}
          try{ if(cs.setState){ cs.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null},store:null}); } }catch(e){}
          try{ if(cs.getState){
            var st=cs.getState();
            if(st){
              if(st.items) st.items=[];
              if(st.cart && st.cart.items) st.cart.items=[];
              if(st._actions && st._actions.clearCart) st._actions.clearCart();
              // Jika zustand, setState langsung
              if(cs.setState) cs.setState({items:[],storeName:'',storeId:null});
            }
          }}catch(e){}
          // Direct mutation jika getState mengembalikan ref
          try{ var s=cs.getState?cs.getState():cs; if(s){ s.items=[]; s.storeName=''; s.storeId=null; s.pickup={}; s.dest={text:'',lat:null,lng:null}; } }catch(e){}
        });
      }catch(e){ console.warn('clear cartStore fail', e); }
      // 4. Badge hilang
      try{ if(window._updateCartBadge) window._updateCartBadge(); }catch(e){}
      try{ var _b=document.getElementById('cartBadge'); if(_b){ _b.textContent='0'; _b.style.display='none'; _b.style.visibility='hidden'; } }catch(e){}
      try{ document.querySelectorAll('[id*=cartBadge], .cart-badge, .badge-cart, #cartCount').forEach(function(el){ try{ el.textContent='0'; el.style.display='none'; }catch(e){} }); }catch(e){}
      // 5. Kosongkan DOM keranjang yang sedang tampil (biar langsung kosong tanpa refresh)
      try{
        var list=document.querySelector('.list');
        if(list && list.innerHTML.includes('cartKey')){
          list.innerHTML='<div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang dikosongkan</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:8px 16px;font-size:12px">+ Cari Makanan</a></div>';
        }
        var subtotalEl=document.querySelector('[id*=subtotal]'); if(subtotalEl) subtotalEl.textContent='Rp 0';
      }catch(e){}
      try{ document.dispatchEvent(new CustomEvent('cart:cleared')); }catch(e){}
      try{ document.dispatchEvent(new CustomEvent('cart:updated', {detail:{items:[]}})); }catch(e){}
      try{ localStorage.setItem('cart_just_cleared', Date.now().toString()); }catch(e){}
      console.log('[cart] dikosongkan setelah checkout - memory + localStorage + DOM');
    })();
    // Paksa cartStore memory kosong sekarang juga (tanpa tunggu)
    try{ if(cartStore && cartStore.setState) cartStore.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null},store:null}); }catch(e){}
    try{ if(cartStore && cartStore.getState){ var _st=cartStore.getState(); if(_st){ _st.items=[]; if(_st.cart) _st.cart.items=[]; } } }catch(e){}
    try{ localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}})); }catch(e){}
try{ localStorage.setItem('active_food_order_id',od.id); }catch(e){}
    try{ if(typeof cartStore!=='undefined' && cartStore && cartStore._actions && cartStore._actions.setStore) cartStore._actions.setStore(null); }catch(e){}
    try{ if(window._updateCartBadge) window._updateCartBadge(); }catch(e){}
    try{ var _b=document.getElementById('cartBadge'); if(_b) _b.textContent='0'; }catch(e){}
    // FIX: langsung buka modal trackingFood, jangan balik ke halaman food
    try{
      if(window.trackingFood && window.trackingFood.openFoodTrackingDetailModal){
        window.trackingFood.openFoodTrackingDetailModal(od.id);
        try{ window.trackingFood.startFoodTracking(od.id); }catch(e){}
      } else if(window.openFoodTrackingDetailModal){
        window.openFoodTrackingDetailModal(od.id);
        try{ window.startFoodTracking(od.id); }catch(e){}
      } else {
        // fallback jika trackingFood belum load, tetap simpan active id dan buka via hash yang benar (bukan ke food list)
        try{
          var mod=await import('../trackingFood.js');
          if(mod.openFoodTrackingDetailModal){ mod.openFoodTrackingDetailModal(od.id); mod.startFoodTracking(od.id); }
        }catch(e){ console.warn('trackingFood import fail', e); }
      }
    }catch(err){
      console.error('open tracking fail', err);
    }
  }catch(e){ alert('Gagal: '+e.message); }
};

window._checkoutFood = async function(){
  try{
    var raw=localStorage.getItem('ojol_cart_v2_food'); if(!raw) return alert('Keranjang kosong'); var state=JSON.parse(raw); if(!state.items?.length) return alert('Keranjang kosong');
    // FIX PICKUP OTOMATIS
    if(!state.pickup||!state.pickup.lat){
      if(state.storeId){
        try{
          const {data:s}=await supabase.from('stores').select('lat,lng,latitude,longitude,name,alamat_text').eq('id', state.storeId).single();
          if(s){ var sl=s.lat||s.latitude; var sn=s.lng||s.longitude; if(sl&&sn){ state.pickup={lat:Number(sl),lng:Number(sn),text:s.name,alamat_text:s.alamat_text}; } }
        }catch(e){}
      }
      if(!state.pickup||!state.pickup.lat){ return alert('⚠️ Lokasi warung (pickup) belum ada.\nBuka menu Warungku > Edit Warung > isi lat/lng via Pilih di Peta.\nIni yang bikin ongkir 0.00km dan error Isi pickup & tujuan'); }
    }
    // FIX DEST - ambil dari input dan validasi
    var destInputEl=document.getElementById('destText');
    var destText=destInputEl?destInputEl.value.trim():state.dest.text||'';
    if(destText.length<5){ alert('⚠️ Alamat tujuan minimal 5 huruf. Ketik alamat lengkap atau klik 📌 Pakai Lokasi Saya'); return; }
    // Jika dest lat belum ada tapi text sudah ada, jangan block, coba pakai lat/lng yang sudah ada atau minta set lokasi
    if(!state.dest.lat||!state.dest.lng){
      alert('⚠️ Koordinat tujuan belum ada (lat/lng kosong).\nKlik tombol 📌 Pakai Lokasi Saya untuk auto isi alamat + koordinat, jangan cuma ketik manual.\nJika sudah klik tapi masih 0.00km, cek izin GPS browser.');
      return;
    }
    state.dest.text=destText;
    localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state));
    var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=true; btn.textContent='Membuat...'; }
    var subtotal=0; for(var i=0;i<state.items.length;i++){ subtotal+=Number(state.items[i].harga||0)*Number(state.items[i].qty||0); }
    var distance_km=0; if(state.pickup?.lat&&state.dest?.lat){ distance_km=calcHav(state.pickup.lat,state.pickup.lng,state.dest.lat,state.dest.lng); }
    var delivery_fee=distance_km<=2?3000:Math.max(3000,Math.round(distance_km*3000)); var total=subtotal+delivery_fee;
    var customerId=null; var authRes=await supabase.auth.getUser(); var user=authRes.data?authRes.data.user:null; if(user){ var uRes=await supabase.from('users').select('id').eq('google_id',user.id).maybeSingle(); customerId=uRes.data?uRes.data.id:user.id; }
    var payload={store_id:state.storeId,customer_id:customerId,items:state.items,subtotal,delivery_fee,total,distance_km:parseFloat(Number(distance_km).toFixed(2)),dest_text:destText,dest_lat:state.dest.lat,dest_lng:state.dest.lng,pickup_lat:state.pickup.lat,pickup_lng:state.pickup.lng,pickup_text:state.pickup.text||'',status:'searching_driver'};
    var ins=await supabase.from('food_orders').insert(payload).select().single(); var od=ins.data; var err=ins.error;
    if(err&&err.message.indexOf('column')!==-1){ var minimal={store_id:payload.store_id,customer_id:payload.customer_id,items:payload.items,total:payload.total,dest_text:payload.dest_text,dest_lat:payload.dest_lat,dest_lng:payload.dest_lng,pickup_lat:payload.pickup_lat,pickup_lng:payload.pickup_lng,status:'searching_driver'}; var r2=await supabase.from('food_orders').insert(minimal).select().single(); if(r2.error) throw r2.error; od=r2.data; } else if(err) throw err;

    
    // HANYA SAAT CHECKOUT - kosongkan keranjang TANPA REFRESH
    (function(){
      var empty={items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}};
      // 1. Kosongkan semua key cart di localStorage
      try{
        var keys=[]; for(var i=0;i<localStorage.length;i++){ try{ keys.push(localStorage.key(i)); }catch(e){} }
        keys.forEach(function(k){ if(!k) return; var low=k.toLowerCase(); if(low.includes('cart')||low.includes('food')||low.includes('warung')||low.includes('ojol')){ if(low.includes('active_food')||low.includes('last_food')||low.includes('food_auto')) return; try{ localStorage.setItem(k, JSON.stringify(empty)); }catch(e){} try{ if(k!=='active_food_order_id' && k!=='ojol_cart_v2_food') localStorage.removeItem(k); }catch(e){} } });
        localStorage.setItem('ojol_cart_v2_food', JSON.stringify(empty));
        localStorage.setItem('ojol_cart_v2', JSON.stringify(empty));
        localStorage.setItem('food_cart', JSON.stringify(empty));
        localStorage.setItem('cart', JSON.stringify(empty));
        localStorage.setItem('warung_cart', JSON.stringify(empty));
        localStorage.setItem('cart-storage', JSON.stringify(empty));
        localStorage.setItem('cartStore', JSON.stringify(empty));
      }catch(e){}
      // 2. Kosongkan sessionStorage juga
      try{ sessionStorage.removeItem('cart'); sessionStorage.removeItem('food_cart'); }catch(e){}
      // 3. Kosongkan cartStore memory - coba SEMUA API
      try{
        var stores=[typeof cartStore!=='undefined'?cartStore:null, window.cartStore?window.cartStore:null, window.warungStore?window.warungStore:null].filter(Boolean);
        stores.forEach(function(cs){
          try{ if(cs._actions){
            if(cs._actions.clearCart) cs._actions.clearCart();
            if(cs._actions.clear) cs._actions.clear();
            if(cs._actions.reset) cs._actions.reset();
            if(cs._actions.setItems) cs._actions.setItems([]);
            if(cs._actions.setCart) cs._actions.setCart(empty);
            if(cs._actions.setState) cs._actions.setState(empty);
            if(cs._actions.setStore) cs._actions.setStore(null);
          }}catch(e){}
          try{ if(cs.setState){ cs.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null},store:null}); } }catch(e){}
          try{ if(cs.getState){
            var st=cs.getState();
            if(st){
              if(st.items) st.items=[];
              if(st.cart && st.cart.items) st.cart.items=[];
              if(st._actions && st._actions.clearCart) st._actions.clearCart();
              // Jika zustand, setState langsung
              if(cs.setState) cs.setState({items:[],storeName:'',storeId:null});
            }
          }}catch(e){}
          // Direct mutation jika getState mengembalikan ref
          try{ var s=cs.getState?cs.getState():cs; if(s){ s.items=[]; s.storeName=''; s.storeId=null; s.pickup={}; s.dest={text:'',lat:null,lng:null}; } }catch(e){}
        });
      }catch(e){ console.warn('clear cartStore fail', e); }
      // 4. Badge hilang
      try{ if(window._updateCartBadge) window._updateCartBadge(); }catch(e){}
      try{ var _b=document.getElementById('cartBadge'); if(_b){ _b.textContent='0'; _b.style.display='none'; _b.style.visibility='hidden'; } }catch(e){}
      try{ document.querySelectorAll('[id*=cartBadge], .cart-badge, .badge-cart, #cartCount').forEach(function(el){ try{ el.textContent='0'; el.style.display='none'; }catch(e){} }); }catch(e){}
      // 5. Kosongkan DOM keranjang yang sedang tampil (biar langsung kosong tanpa refresh)
      try{
        var list=document.querySelector('.list');
        if(list && list.innerHTML.includes('cartKey')){
          list.innerHTML='<div style="text-align:center;padding:24px;background:var(--card2);border:1px dashed var(--border);border-radius:16px"><div style="font-size:32px">🛒</div><div class="muted" style="font-size:13px;margin-top:8px">Keranjang dikosongkan</div><a href="#/store" class="btn primary" style="margin-top:12px;display:inline-block;padding:8px 16px;font-size:12px">+ Cari Makanan</a></div>';
        }
        var subtotalEl=document.querySelector('[id*=subtotal]'); if(subtotalEl) subtotalEl.textContent='Rp 0';
      }catch(e){}
      try{ document.dispatchEvent(new CustomEvent('cart:cleared')); }catch(e){}
      try{ document.dispatchEvent(new CustomEvent('cart:updated', {detail:{items:[]}})); }catch(e){}
      try{ localStorage.setItem('cart_just_cleared', Date.now().toString()); }catch(e){}
      console.log('[cart] dikosongkan setelah checkout - memory + localStorage + DOM');
    })();
    // Paksa cartStore memory kosong sekarang juga (tanpa tunggu)
    try{ if(cartStore && cartStore.setState) cartStore.setState({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null},store:null}); }catch(e){}
    try{ if(cartStore && cartStore.getState){ var _st=cartStore.getState(); if(_st){ _st.items=[]; if(_st.cart) _st.cart.items=[]; } } }catch(e){}
    try{ localStorage.setItem('ojol_cart_v2_food', JSON.stringify({items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}})); }catch(e){}
try{ localStorage.setItem('active_food_order_id',od.id); }catch(e){}
    try{ if(typeof cartStore!=='undefined' && cartStore && cartStore._actions && cartStore._actions.setStore) cartStore._actions.setStore(null); }catch(e){}
    try{ if(window._updateCartBadge) window._updateCartBadge(); }catch(e){}
    try{ var _b=document.getElementById('cartBadge'); if(_b) _b.textContent='0'; }catch(e){}
    // FIX: langsung buka modal trackingFood, jangan balik ke halaman food
    try{
      if(window.trackingFood && window.trackingFood.openFoodTrackingDetailModal){
        window.trackingFood.openFoodTrackingDetailModal(od.id);
        try{ window.trackingFood.startFoodTracking(od.id); }catch(e){}
      } else if(window.openFoodTrackingDetailModal){
        window.openFoodTrackingDetailModal(od.id);
        try{ window.startFoodTracking(od.id); }catch(e){}
      } else {
        // fallback jika trackingFood belum load, tetap simpan active id dan buka via hash yang benar (bukan ke food list)
        try{
          var mod=await import('../trackingFood.js');
          if(mod.openFoodTrackingDetailModal){ mod.openFoodTrackingDetailModal(od.id); mod.startFoodTracking(od.id); }
        }catch(e){ console.warn('trackingFood import fail', e); }
      }
    }catch(err){
      console.error('open tracking fail', err);
    }
  }catch(e){ alert('Checkout gagal: '+e.message); var btn=document.getElementById('btnCheckoutBroadcast'); if(btn){ btn.disabled=false; btn.textContent='📢 Broadcast'; } }
};

window._toggleWarung=async function(storeId,isOpen){ try{ const {error}=await supabase.from('stores').update({is_open:isOpen}).eq('id',storeId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };
window._openWarungOrders=function(storeId){ location.hash='#/store/orders/'+storeId; };

window._deleteWarung=async function(storeId, storeName){
  try{
    if(!confirm(`Hapus warung "${storeName||storeId}"?\nSemua menu di warung ini juga akan terhapus.\nTidak bisa dibatalkan!`)) return;
    const second=prompt(`Ketik HAPUS untuk konfirmasi hapus warung "${storeName||''}"`);
    if(second!=='HAPUS') return alert('Batal hapus, ketik HAPUS dengan huruf besar');
    const {data:orders}=await supabase.from('food_orders').select('id').eq('store_id',storeId).in('status',['searching_driver','driver_assigned','preparing','ready']).limit(1);
    if(orders&&orders.length){ return alert('Tidak bisa hapus: masih ada order aktif di warung ini. Selesaikan dulu.'); }
    await supabase.from('store_products').delete().eq('store_id',storeId);
    const {error}=await supabase.from('stores').delete().eq('id',storeId);
    if(error) throw error;
    alert('✅ Warung berhasil dihapus');
    location.reload();
  }catch(e){ alert('Gagal hapus warung: '+e.message); }
};


// TAMBAH & EDIT WARUNG - INLINE FORM (bukan modal) - agar map picker tidak error di belakang modal
window._addWarung=function(){
  // tutup form edit jika terbuka
  const editForm=document.getElementById('warungEditForm'); if(editForm) editForm.style.display='none';
  const createForm=document.getElementById('warungCreateForm');
  if(!createForm) return alert('Form tambah warung tidak ditemukan');
  document.getElementById('warungCreateName').value='';
  document.getElementById('warungCreateAlamat').value='';
  document.getElementById('warungCreateLat').value='';
  document.getElementById('warungCreateLng').value='';
  document.getElementById('warungCreateIsOpen').checked=true;
  createForm.style.display='block';
  createForm.scrollIntoView({behavior:'smooth', block:'start'});
  document.getElementById('btnSaveWarungCreate').onclick=window._saveWarungCreate;
};
window._closeWarungCreateForm=function(){
  const f=document.getElementById('warungCreateForm'); if(f) f.style.display='none';
};
window._closeWarungCreateModal=window._closeWarungCreateForm; // backward compat

window._saveWarungCreate=async function(){
  try{
    const name=document.getElementById('warungCreateName').value.trim();
    const alamat_text=document.getElementById('warungCreateAlamat').value.trim();
    const lat=parseFloat(document.getElementById('warungCreateLat').value)||null;
    const lng=parseFloat(document.getElementById('warungCreateLng').value)||null;
    const is_open=document.getElementById('warungCreateIsOpen').checked;
    if(!name) return alert('Nama warung harus diisi');
    const profile=await getProfile(); if(!profile) return alert('Login dulu');
    const btn=document.getElementById('btnSaveWarungCreate'); btn.disabled=true; btn.textContent='Membuat...';
    let payload={ name, alamat_text, is_open, owner_id:profile.id, user_id:profile.id };
    if(lat!==null) payload.lat=lat;
    if(lng!==null) payload.lng=lng;
    const {data, error}=await supabase.from('stores').insert(payload).select().single();
    if(error){
      const payload2={ name, alamat_text, is_open, owner_id:profile.id };
      const r2=await supabase.from('stores').insert(payload2).select().single();
      if(r2.error) throw r2.error;
    }
    window._closeWarungCreateForm();
    alert('✅ Warung berhasil dibuat');
    location.reload();
  }catch(e){
    alert('Gagal buat warung: '+e.message);
    const btn=document.getElementById('btnSaveWarungCreate'); if(btn){ btn.disabled=false; btn.textContent='+ Buat'; }
  }
};

let currentEditWarungId=null;
window._editWarung=async function(storeId){
  try{
    const {data:s, error}=await supabase.from('stores').select('*').eq('id',storeId).single();
    if(error || !s) return alert('Warung tidak ditemukan');
    currentEditWarungId=storeId;
    // tutup form create jika terbuka
    const createForm=document.getElementById('warungCreateForm'); if(createForm) createForm.style.display='none';
    const editForm=document.getElementById('warungEditForm');
    if(!editForm) return alert('Form edit tidak ditemukan');
    document.getElementById('warungEditName').value=s.name||'';
    document.getElementById('warungEditAlamat').value=s.alamat_text||s.alamat||'';
    document.getElementById('warungEditLat').value=s.lat||s.latitude||'';
    document.getElementById('warungEditLng').value=s.lng||s.longitude||'';
    document.getElementById('warungEditIsOpen').checked=!!s.is_open;
    editForm.style.display='block';
    editForm.scrollIntoView({behavior:'smooth', block:'start'});
    document.getElementById('btnSaveWarungEdit').onclick=window._saveWarungEdit;
  }catch(e){ alert('Gagal load warung: '+e.message); }
};
window._closeWarungEditForm=function(){
  const f=document.getElementById('warungEditForm'); if(f) f.style.display='none';
  currentEditWarungId=null;
};
window._closeWarungEditModal=window._closeWarungEditForm; // backward compat
window._saveWarungEdit=async function(){
  try{
    if(!currentEditWarungId) return alert('ID warung tidak ada');
    const name=document.getElementById('warungEditName').value.trim();
    const alamat_text=document.getElementById('warungEditAlamat').value.trim();
    const lat=parseFloat(document.getElementById('warungEditLat').value)||null;
    const lng=parseFloat(document.getElementById('warungEditLng').value)||null;
    const is_open=document.getElementById('warungEditIsOpen').checked;
    if(!name) return alert('Nama warung harus diisi');
    const btn=document.getElementById('btnSaveWarungEdit'); btn.disabled=true; btn.textContent='Menyimpan...';
    let payload={ name, alamat_text, is_open };
    if(lat!==null) payload.lat=lat;
    if(lng!==null) payload.lng=lng;
    const {error}=await supabase.from('stores').update(payload).eq('id',currentEditWarungId);
    if(error){
      const payload2={ name, alamat_text, is_open };
      const {error:error2}=await supabase.from('stores').update(payload2).eq('id',currentEditWarungId);
      if(error2) throw error2;
    }
    window._closeWarungEditForm();
    alert('✅ Warung berhasil diupdate');
    location.reload();
  }catch(e){
    alert('Gagal simpan: '+e.message);
    const btn=document.getElementById('btnSaveWarungEdit'); if(btn){ btn.disabled=false; btn.textContent='💾 Simpan'; }
  }
};

// MAP PICKER UNTUK EDIT & CREATE WARUNG - INLINE FORM VERSION (tidak pakai modal warung, jadi tidak ada masalah z-index)
window._openWarungMapPicker=function(mode){
  const isEdit = mode==='edit';
  const latId = isEdit?'warungEditLat':'warungCreateLat';
  const lngId = isEdit?'warungEditLng':'warungCreateLng';
  const addrId = isEdit?'warungEditAlamat':'warungCreateAlamat';

  // CSS untuk pastikan map picker di atas semua
  try{
    let style=document.getElementById('warungMapPickerFixStyle');
    if(!style){ style=document.createElement('style'); style.id='warungMapPickerFixStyle'; document.head.appendChild(style); }
    style.textContent=`
      #mapPickerModal, #mapPicker, .map-picker-modal, .mapPickerModal, #map-picker-modal, .mapPicker, #map-picker,
      [id*="mapPicker"], [class*="mapPicker"], [id*="map-picker"], [class*="map-picker"] {
        z-index: 2147483647 !important;
        position: fixed !important;
      }
    `;
  }catch(e){}

  const cb=(res)=>{
    try{
      const lat=res?.lat||res?.latitude||res?.latlng?.lat||res?.location?.lat||res?.coords?.lat||null;
      const lng=res?.lng||res?.longitude||res?.long||res?.location?.lng||res?.coords?.lng||res?.latlng?.lng||null;
      const addr=res?.address||res?.text||res?.alamat_text||res?.alamat||res?.name||res?.formatted_address||'';
      if(lat!=null && document.getElementById(latId)) document.getElementById(latId).value=lat;
      if(lng!=null && document.getElementById(lngId)) document.getElementById(lngId).value=lng;
      if(addr && document.getElementById(addrId)) document.getElementById(addrId).value=addr;
    }catch(e){}
  };

  if(window.openMapPicker){
    try{
      window.openMapPicker({ onSelect: cb, onPick: cb, callback: cb, onConfirm: cb });
      // paksa z-index
      setTimeout(()=>{
        document.querySelectorAll('#mapPickerModal, #mapPicker, .map-picker-modal, .mapPickerModal, #map-picker-modal, .mapPicker, [id*="mapPicker"]').forEach(el=>{
          el.style.setProperty('z-index','2147483647','important');
          el.style.setProperty('position','fixed','important');
        });
      },100);
      return;
    }catch(e){ try{ window.openMapPicker(); return; }catch(e2){} }
  }

  const curLat=document.getElementById(latId)?.value||'-8.095';
  const curLng=document.getElementById(lngId)?.value||'111.635';
  const inp=prompt(`Masukkan koordinat Lat,Lng untuk ${mode} warung (contoh: ${curLat},${curLng})\nKosongkan untuk pakai Lokasi Saya`, `${curLat},${curLng}`);
  if(inp===null) return;
  if(!inp.trim()){ window._useWarungMyLocation(mode); return; }
  const parts=inp.split(',').map(s=>s.trim());
  if(parts.length>=2){
    const la=parseFloat(parts[0]); const ln=parseFloat(parts[1]);
    if(!isNaN(la)&&!isNaN(ln)){
      if(document.getElementById(latId)) document.getElementById(latId).value=la;
      if(document.getElementById(lngId)) document.getElementById(lngId).value=ln;
    }
  }
};
window._useWarungMyLocation=function(mode){
  if(!navigator.geolocation) return alert('Geolocation tidak support');
  const isEdit = mode==='edit';
  const latId = isEdit?'warungEditLat':'warungCreateLat';
  const lngId = isEdit?'warungEditLng':'warungCreateLng';
  const btnId = isEdit?'btnWarungEditMyLoc':'btnWarungCreateMyLoc';
  const btn=document.getElementById(btnId); const orig=btn?btn.textContent:'';
  if(btn){ btn.disabled=true; btn.textContent='📍 Mengambil...'; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=pos.coords.latitude; const lng=pos.coords.longitude;
    document.getElementById(latId).value=lat;
    document.getElementById(lngId).value=lng;
    if(btn){ btn.disabled=false; btn.textContent=orig; }
  }, err=>{
    alert('Gagal ambil lokasi: '+err.message);
    if(btn){ btn.disabled=false; btn.textContent=orig; }
  }, {enableHighAccuracy:true, timeout:10000});
};

window._toggleProduct=async function(productId,isAvailable){ try{ const {error}=await supabase.from('store_products').update({is_available:isAvailable}).eq('id',productId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };
window._deleteProduct=async function(productId){ if(!confirm('Hapus menu?')) return; try{ const {error}=await supabase.from('store_products').delete().eq('id',productId); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };

let currentEditProductId=null; let currentStoreIdForProduct=null;
window._renderVariantFields=function(variants){ const list=document.getElementById('prodVariantsList'); if(!list) return; list.innerHTML=''; (variants||[{name:'Biasa',price_delta:0}]).forEach(v=>{ const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" value="${(v.name||'').replace(/"/g,'&quot;')}" placeholder="Nama varian" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price_delta" type="number" value="${v.price_delta||0}" placeholder="+Rp" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); }); };
window._addVariantField=function(){ const list=document.getElementById('prodVariantsList'); const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" placeholder="Nama varian" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price_delta" type="number" value="0" placeholder="+Rp" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); };
window._renderAddonFields=function(addons){ const list=document.getElementById('prodAddonsList'); if(!list) return; list.innerHTML=''; (addons||[]).forEach(a=>{ const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="Nama addon" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price" type="number" value="${a.price||0}" placeholder="Harga" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); }); };
window._addAddonField=function(){ const list=document.getElementById('prodAddonsList'); const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px'; row.innerHTML=`<input data-field="name" placeholder="Nama addon" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><input data-field="price" type="number" value="0" placeholder="Harga" style="width:90px;padding:8px;border-radius:6px;border:1px solid var(--border);font-size:11px"/><button onclick="this.parentElement.remove()" class="btn secondary" style="width:30px">✕</button>`; list.appendChild(row); };
window._collectVariants=function(){ const rows=document.querySelectorAll('#prodVariantsList > div'); const arr=[]; rows.forEach(r=>{ const name=r.querySelector('[data-field="name"]')?.value.trim(); const delta=Number(r.querySelector('[data-field="price_delta"]')?.value||0); if(name) arr.push({name,price_delta:delta}); }); if(!arr.length) arr.push({name:'Biasa',price_delta:0}); return arr; };
window._collectAddons=function(){ const rows=document.querySelectorAll('#prodAddonsList > div'); const arr=[]; rows.forEach(r=>{ const name=r.querySelector('[data-field="name"]')?.value.trim(); const price=Number(r.querySelector('[data-field="price"]')?.value||0); if(name) arr.push({name,price}); }); return arr; };
window._addProduct=function(storeId){ currentStoreIdForProduct=storeId; currentEditProductId=null; document.getElementById('productModalTitle').textContent='Tambah Menu + Varian & Addon'; document.getElementById('prodName').value=''; document.getElementById('prodHarga').value=''; document.getElementById('prodKategori').value='Makanan'; document.getElementById('prodAvailable').checked=true; window._renderVariantFields([{name:'Biasa',price_delta:0}]); window._renderAddonFields([]); document.getElementById('productModal').style.display='flex'; document.getElementById('btnSaveProduct').onclick=window._saveProduct; };
window._editProduct=async function(productId){ try{ const {data:p}=await supabase.from('store_products').select('*').eq('id',productId).single(); if(!p) return alert('Tidak ditemukan'); currentEditProductId=productId; currentStoreIdForProduct=p.store_id; document.getElementById('productModalTitle').textContent='Edit Menu + Varian & Addon'; document.getElementById('prodName').value=p.name||''; document.getElementById('prodHarga').value=p.harga||0; document.getElementById('prodKategori').value=p.kategori||'Makanan'; document.getElementById('prodAvailable').checked=!!p.is_available; let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){} window._renderVariantFields(vari.length?vari:[{name:'Biasa',price_delta:0}]); window._renderAddonFields(addons||[]); document.getElementById('productModal').style.display='flex'; document.getElementById('btnSaveProduct').onclick=window._saveProduct; }catch(e){ alert(e.message); } };
window._closeProductModal=function(){ document.getElementById('productModal').style.display='none'; };
window._saveProduct=async function(){ try{ const name=document.getElementById('prodName').value.trim(); const harga=Number(document.getElementById('prodHarga').value||0); const kategori=document.getElementById('prodKategori').value.trim()||'Makanan'; const is_available=document.getElementById('prodAvailable').checked; const variants=window._collectVariants(); const addons=window._collectAddons(); if(!name) return alert('Nama harus diisi'); if(!harga) return alert('Harga harus diisi'); if(currentEditProductId){ const {error}=await supabase.from('store_products').update({name,harga,kategori,is_available,variants,addons}).eq('id',currentEditProductId); if(error) throw error; } else { const payload={store_id:currentStoreIdForProduct,name,harga,kategori,is_available,variants,addons}; const {error}=await supabase.from('store_products').insert(payload); if(error) throw error; } window._closeProductModal(); location.reload(); }catch(e){ alert('Gagal simpan: '+e.message); } };
window._orderStatus=async function(id,status){ if(!confirm('Ubah jadi '+status+'?')) return; try{ const {error}=await supabase.from('food_orders').update({status}).eq('id',id); if(error) throw error; location.reload(); }catch(e){ alert(e.message); } };

window._openMenuBuilder=async function(productId){
  try{
    const dataEl=document.getElementById('productsData'); let products=[]; if(dataEl){ try{ products=JSON.parse(dataEl.textContent); }catch(e){} }
    let p=products.find(x=>x.id===productId); if(!p){ const {data}=await supabase.from('store_products').select('*').eq('id',productId).single(); p=data; }
    if(!p) return alert('Produk tidak ditemukan');
    window._currentBuilderProduct=p;
    document.getElementById('builderName').textContent=p.name; document.getElementById('builderBase').textContent='Rp '+Number(p.harga||0).toLocaleString();
    let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
    let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
    const variHtml=vari.map((v,i)=>`
      <label class="vari-option" data-idx="${i}" style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,var(--card) 0%,var(--card2) 100%);border:2px solid ${i===0?'var(--primary)':'var(--border)'};border-radius:14px;padding:12px 14px;cursor:pointer;transition:all 0.2s;${i===0?'box-shadow:0 2px 8px rgba(22,163,74,0.2);':''}">
        <input type="radio" name="builderVari" value="${i}" ${i===0?'checked':''} style="width:20px;height:20px;accent-color:var(--primary)"/>
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${v.name}</div><div class="muted" style="font-size:11px">${v.price_delta?`Tambahan Rp ${Number(v.price_delta).toLocaleString()}`:'Harga standar'}</div></div>
        <div style="text-align:right">${v.price_delta?`<span style="background:var(--primary);color:var(--card);padding:4px 8px;border-radius:8px;font-size:11px;font-weight:800">+Rp${Number(v.price_delta).toLocaleString()}</span>`:`<span style="background:var(--bg);border:1px solid var(--border);padding:4px 8px;border-radius:8px;font-size:11px" class="muted">Default</span>`}</div>
      </label>`).join('');
    const addonHtml=addons.map((a,i)=>`
      <label class="addon-option" data-idx="${i}" style="display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px;cursor:pointer;transition:all 0.2s">
        <input type="checkbox" name="builderAddon" value="${i}" style="width:20px;height:20px;accent-color:var(--primary)"/>
        <div style="width:36px;height:36px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px">🥚</div>
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${a.name}</div><div class="muted" style="font-size:11px">Tambahan</div></div>
        <span style="background:var(--bg);border:1px solid var(--border);padding:6px 10px;border-radius:10px;font-size:12px;font-weight:700">Rp ${Number(a.price||0).toLocaleString()}</span>
      </label>`).join('')||'<div style="text-align:center;padding:20px;background:var(--card2);border:1px dashed var(--border);border-radius:12px"><div style="font-size:24px">➕</div><div class="muted" style="font-size:11px;margin-top:4px">Tidak ada addon</div></div>';
    document.getElementById('builderVariasi').innerHTML=variHtml; document.getElementById('builderAddon').innerHTML=addonHtml;
    window._builderQty=1; document.getElementById('builderQty').textContent='1'; window._updateBuilderTotal();
    document.getElementById('menuBuilderModal').style.display='flex';
  }catch(e){ alert(e.message); }
};
window._closeMenuBuilder=function(){ document.getElementById('menuBuilderModal').style.display='none'; };
window._updateBuilderTotal=function(){
  try{
    const p=window._currentBuilderProduct; if(!p) return;
    let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
    let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
    let base=Number(p.harga||0);
    const variSel=document.querySelector('input[name="builderVari"]:checked'); if(variSel){ const idx=Number(variSel.value); if(vari[idx]) base+=Number(vari[idx].price_delta||0); }
    let addonTotal=0; const addonSels=document.querySelectorAll('input[name="builderAddon"]:checked'); addonSels.forEach(el=>{ const idx=Number(el.value); if(addons[idx]) addonTotal+=Number(addons[idx].price||0); });
    const qty=window._builderQty||1; const total=(base+addonTotal)*qty;
    document.getElementById('builderSummary').textContent=`${vari[ variSel?Number(variSel.value):0 ]?.name||'Biasa'} + ${addonSels.length} addon`;
    document.getElementById('builderTotal').textContent='Rp '+total.toLocaleString();
    const btnTotal=document.getElementById('builderTotalBtn'); if(btnTotal) btnTotal.textContent='Rp '+total.toLocaleString();
    window._builderCurrentTotal=total; window._builderCurrentBase=base; window._builderCurrentAddon=addonTotal;
  }catch(e){}
};

document.addEventListener('change', (e)=>{
  if(e.target.name==='builderVari'){
    document.querySelectorAll('.vari-option').forEach(label=>{
      const input=label.querySelector('input[type="radio"]');
      if(input && input.checked){ label.style.borderColor='var(--primary)'; label.style.boxShadow='0 2px 8px rgba(22,163,74,0.2)'; }
      else { label.style.borderColor='var(--border)'; label.style.boxShadow='none'; }
    });
  }
  if(e.target.name==='builderAddon'){
    const label=e.target.closest('.addon-option');
    if(label){
      if(e.target.checked){ label.style.borderColor='var(--primary)'; label.style.boxShadow='0 2px 8px rgba(22,163,74,0.15)'; }
      else { label.style.borderColor='var(--border)'; label.style.boxShadow='none'; }
    }
  }
  if(e.target.name==='builderVari'||e.target.name==='builderAddon'){ window._updateBuilderTotal(); }
});

window._updateCartBadge = function(){
  try{
    let count=0;
    try{ 
      const s=cartStore.getState(); 
      count=(s.items||[]).reduce((a,b)=>a+Number(b.qty||0),0);
      if(!count){
        const raw=localStorage.getItem('ojol_cart_v2_food');
        if(raw){ const parsed=JSON.parse(raw); count=(parsed.items||[]).reduce((a,b)=>a+Number(b.qty||0),0); }
      }
    }catch(e){
      const raw=localStorage.getItem('ojol_cart_v2_food');
      if(raw){ const parsed=JSON.parse(raw); count=(parsed.items||[]).reduce((a,b)=>a+Number(b.qty||0),0); }
    }
    const selectors=['#cartBadge','#cartCount','#navCartBadge','.cart-badge','.food-cart-badge','[data-cart-count]','#bottomNavCartBadge','span.cart-count','.badge-cart','#foodCartBadge'];
    selectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        if(el.classList.contains('cart-badge-duplicate')){ el.remove(); return; }
        el.textContent=count>0?String(count):'';
        el.style.display=count>0?'inline-flex':'none';
      });
    });
    document.querySelectorAll('a[href*="store/cart"], button[data-nav="cart"], [data-tab="cart"]').forEach(link=>{
      const badges=link.querySelectorAll('.cart-badge, .badge, [data-cart-count], #cartBadge');
      if(badges.length>1){ badges.forEach((b,idx)=>{ if(idx>0) b.remove(); }); }
      if(badges.length===0 && count>0){
        const badge=document.createElement('span');
        badge.className='cart-badge food-cart-badge';
        badge.id='foodCartBadge';
        badge.textContent=String(count);
        badge.style.cssText='position:absolute;top:-6px;right:-6px;background:var(--danger);color:var(--card);border-radius:99px;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;padding:0 5px;line-height:1;z-index:2;border:2px solid var(--card);';
        link.style.position='relative';
        link.appendChild(badge);
      } else if(badges.length===1 && count>0){
        const b=badges[0]; b.textContent=String(count); b.style.display='inline-flex'; b.style.position='absolute'; b.style.top='-6px'; b.style.right='-6px';
      }
    });
    window.dispatchEvent(new CustomEvent('cart_updated',{detail:{count}}));
    return count;
  }catch(e){ console.error('badge error',e); return 0; }
};
setTimeout(()=>window._updateCartBadge(),500);
window.addEventListener('hashchange',()=>setTimeout(()=>window._updateCartBadge(),300));

(function(){
  function tryLoad(){ if(location.hash&&location.hash.indexOf('/store/cart')!==-1){ setTimeout(()=>{ try{ window._loadNearbyDriversForCart(); }catch(e){} },900); } }
  window.addEventListener('hashchange',tryLoad); setTimeout(tryLoad,1200);
  window.addEventListener('food_dest_updated',(e)=>{
    // Update input jika belum terisi dari event
    try{
      var d=e.detail;
      if(d && d.text){
        var destInput=document.getElementById('destText');
        if(destInput && !destInput.value) destInput.value=d.text;
      }
    }catch(e){}
    setTimeout(()=>window._loadNearbyDriversForCart(),600);
  });
  document.addEventListener('click',e=>{
    if(e.target&&e.target.id==='btnRefreshDrivers') window._loadNearbyDriversForCart();
    if(e.target&&e.target.id==='btnCheckoutBroadcast') window._checkoutFood();
    const btn=e.target.closest?e.target.closest('.btn-choose-driver'):null; if(btn&&btn.getAttribute('data-driver-id')) window._checkoutFoodDirect(btn.getAttribute('data-driver-id'));
    if(e.target.closest&&e.target.closest('#btnUseMyLocation')){ e.preventDefault(); window._useMyLocation&&window._useMyLocation(); }
    if(e.target.closest&&e.target.closest('#btnWarungEditMapPicker')){ e.preventDefault(); window._openWarungMapPicker('edit'); }
    if(e.target.closest&&e.target.closest('#btnWarungEditMyLoc')){ e.preventDefault(); window._useWarungMyLocation('edit'); }
    if(e.target.closest&&e.target.closest('#btnWarungCreateMapPicker')){ e.preventDefault(); window._openWarungMapPicker('create'); }
    if(e.target.closest&&e.target.closest('#btnWarungCreateMyLoc')){ e.preventDefault(); window._useWarungMyLocation('create'); }
    if(e.target.closest&&e.target.closest('#builderQtyMinus')){ window._builderQty=Math.max(1,(window._builderQty||1)-1); document.getElementById('builderQty').textContent=window._builderQty; window._updateBuilderTotal(); }
    if(e.target.closest&&e.target.closest('#builderQtyPlus')){ window._builderQty=(window._builderQty||1)+1; document.getElementById('builderQty').textContent=window._builderQty; window._updateBuilderTotal(); }
    if(e.target.closest&&e.target.closest('#builderAddBtn')){
      try{
        const p=window._currentBuilderProduct; if(!p) return;
        let vari=[]; try{ vari=typeof p.variants==='string'?JSON.parse(p.variants):(p.variants||[]);}catch(e){} if(!vari.length) vari=[{name:'Biasa',price_delta:0}];
        let addons=[]; try{ addons=typeof p.addons==='string'?JSON.parse(p.addons):(p.addons||[]);}catch(e){}
        const variSel=document.querySelector('input[name="builderVari"]:checked'); const variIdx=variSel?Number(variSel.value):0;
        const addonSels=document.querySelectorAll('input[name="builderAddon"]:checked'); const selectedAddons=[]; addonSels.forEach(el=>{ const idx=Number(el.value); if(addons[idx]) selectedAddons.push(addons[idx]); });
        const qty=window._builderQty||1;
        const cartItem={ product_id:p.id, id:p.id, name:p.name+(vari[variIdx]?.name&&vari[variIdx].name!=='Biasa'?' - '+vari[variIdx].name:''), harga: (Number(p.harga||0)+Number(vari[variIdx]?.price_delta||0)+selectedAddons.reduce((a,b)=>a+Number(b.price||0),0)), qty, variants:vari[variIdx], addons:selectedAddons, cartKey: p.id+'_'+variIdx+'_'+selectedAddons.map(a=>a.name).join('_')+'_'+Date.now() };
        try{ cartStore._actions.addItem(cartItem); window._updateCartBadge(); }catch(e){ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=raw?JSON.parse(raw):{items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}}; state.items.push(cartItem); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); }
        window._closeMenuBuilder(); window._updateCartBadge(); alert('Ditambahkan ke keranjang'); location.hash='#/store/cart';
      }catch(e){ alert(e.message); }
    }
  });
})();

window._pickDestMap=function(){
  // Buka map picker untuk alamat antar (dest), seperti di ojol order.js
  if(window.openMapPicker){
    window.openMapPicker({
      onSelect: (res)=>{
        var lat=res?.lat||res?.latitude||res?.latlng?.lat||null;
        var lng=res?.lng||res?.longitude||res?.latlng?.lng||null;
        var addr=res?.address||res?.text||res?.alamat_text||res?.name||'';
        if(lat&&lng){
          window._setDestLocation(lat,lng,addr||'Lokasi dari peta');
        }
      },
      callback: (res)=>{
        var lat=res?.lat||res?.latitude||null;
        var lng=res?.lng||res?.longitude||null;
        var addr=res?.address||res?.text||'';
        if(lat&&lng) window._setDestLocation(lat,lng,addr||'Lokasi dari peta');
      }
    });
  } else alert('Peta picker belum ready');
};

// Fungsi pusat untuk set alamat antar - update input, localStorage, dan UI
window._setDestLocation=async function(lat,lng,text){
  try{
    var addr=text||'';
    // Reverse geocode jika text kosong atau "Lokasi saya"
    if(!addr || addr==='Lokasi saya' || addr.length<5){
      try{
        const resp=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data=await resp.json();
        if(data && data.display_name){
          const a=data.address;
          const short=[a.village||a.hamlet||a.suburb||'', a.road||a.neighbourhood||'', a.county||''].filter(Boolean).join(', ');
          addr=short||data.display_name.split(',').slice(0,3).join(', ');
        }
      }catch(e){ console.warn('reverse geocode fail', e); if(!addr) addr=lat.toFixed(5)+', '+lng.toFixed(5); }
    }

    // Update localStorage cart
    var raw=localStorage.getItem('ojol_cart_v2_food');
    var state=raw?JSON.parse(raw):{items:[],storeName:'',storeId:null,pickup:{},dest:{text:'',lat:null,lng:null}};
    state.dest={text:addr, lat:lat, lng:lng};
    localStorage.setItem('ojol_cart_v2_food', JSON.stringify(state));
    // Update cartStore jika ada
    try{ cartStore._actions.setDest({text:addr, lat:lat, lng:lng}); }catch(e){}

    // Update UI input
    var destInput=document.getElementById('destText');
    if(destInput){ destInput.value=addr; }
    var latDisp=document.getElementById('cartLatDisplay'); if(latDisp) latDisp.textContent=lat.toFixed(5);
    var lngDisp=document.getElementById('cartLngDisplay'); if(lngDisp) lngDisp.textContent=lng.toFixed(5);

    // Update ongkir live jika pickup ada
    if(state.pickup && state.pickup.lat){
      var dist=calcHav(state.pickup.lat,state.pickup.lng,lat,lng);
      var fee=dist<=2?3000:Math.max(3000,Math.round(dist*3000));
      var ongkirEl=document.getElementById('ongkirLiveStatus'); if(ongkirEl) ongkirEl.textContent='Total ongkir Rp '+fee.toLocaleString()+' untuk '+dist.toFixed(2)+' km';
    }

    // Dispatch event untuk refresh driver
    window.dispatchEvent(new CustomEvent('food_dest_updated',{detail:{lat,lng,text:addr}}));
    // Refresh driver list
    setTimeout(()=>{ try{ window._loadNearbyDriversForCart(); }catch(e){} },300);

    console.log('[food-dest] set', addr, lat, lng);
  }catch(e){ console.error('setDestLocation fail', e); }
};

window._useMyLocation=function(){
  var btn=document.getElementById('btnUseMyLocation');
  var origText=btn?btn.textContent:'';
  if(btn){ btn.disabled=true; btn.textContent='📡 Mencari GPS...'; }
  if(!navigator.geolocation){
    alert('Geolocation tidak support');
    if(btn){ btn.disabled=false; btn.textContent=origText; }
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos=>{
    var lat=pos.coords.latitude; var lng=pos.coords.longitude; var acc=pos.coords.accuracy;
    if(btn) btn.textContent='📍 Mengambil alamat...';
    // Gunakan fungsi pusat agar alamat auto terisi
    await window._setDestLocation(lat,lng,'');
    if(btn){ btn.disabled=false; btn.textContent=origText||'📌 Pakai Lokasi Saya'; }
  }, err=>{
    alert('Gagal ambil lokasi: '+err.message+' - aktifkan GPS');
    if(btn){ btn.disabled=false; btn.textContent=origText||'📌 Pakai Lokasi Saya'; }
  }, {enableHighAccuracy:true, timeout:10000, maximumAge:0});
};
window._cartQty=function(key,qty){ try{ cartStore._actions.updateQty(key,qty); location.reload(); }catch(e){ try{ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=JSON.parse(raw); state.items=state.items.map(it=>{ if((it.cartKey||it.product_id||it.id)===key) it.qty=qty; return it; }).filter(it=>it.qty>0); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); window._updateCartBadge(); location.reload(); }catch(err){} } };
window._removeCartItem=function(key){ try{ cartStore._actions.removeItem(key); location.reload(); }catch(e){ let raw=localStorage.getItem('ojol_cart_v2_food'); let state=JSON.parse(raw); state.items=state.items.filter(it=>(it.cartKey||it.product_id||it.id)!==key); localStorage.setItem('ojol_cart_v2_food',JSON.stringify(state)); window._updateCartBadge(); location.reload(); } };

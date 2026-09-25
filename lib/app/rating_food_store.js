// rating_food.js + store_ratings support - FINAL
// Table: store_ratings (store_id, customer_id, food_order_id, rating, comment)
// Table: ratings (driver_id, order_id, rating, comment) untuk driver

import { supabase } from './supabase.js';

function getAppTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

// ===== CEK SUDAH RATING STORE ATAU BELUM =====
export async function isStoreRated(foodOrderId){
  try{
    if(localStorage.getItem('rated_store_'+foodOrderId)) return true;
    const { data } = await supabase.from('store_ratings').select('id').eq('food_order_id', foodOrderId).limit(1);
    return data && data.length>0;
  }catch(e){ return false; }
}

export async function getStoreRating(foodOrderId){
  try{
    const { data } = await supabase.from('store_ratings').select('*').eq('food_order_id', foodOrderId).single();
    return data||null;
  }catch(e){ return null; }
}

// ===== SUBMIT RATING STORE =====
export async function submitStoreRating({ store_id, customer_id, food_order_id, rating, comment }){
  const payload = { store_id, customer_id, food_order_id, rating, comment: comment||'', created_at: new Date().toISOString() };
  const { data, error } = await supabase.from('store_ratings').insert(payload).select().single();
  if(error) throw error;
  try{ localStorage.setItem('rated_store_'+food_order_id, '1'); }catch(e){}
  try{
    const local = JSON.parse(localStorage.getItem('food_store_ratings')||'[]');
    local.push(data);
    localStorage.setItem('food_store_ratings', JSON.stringify(local));
  }catch(e){}
  return data;
}

// ===== SUBMIT RATING DRIVER (untuk food juga) =====
export async function submitDriverRatingForFood({ driver_id, customer_id, food_order_id, rating, comment }){
  // Simpan di tabel ratings umum, bedakan order_id = food_order_id
  const payload = { driver_id, order_id: food_order_id, customer_id, rating, comment: comment||'', created_at: new Date().toISOString() };
  // fallback jika kolom customer_id tidak ada di ratings
  let { data, error } = await supabase.from('ratings').insert(payload).select().single();
  if(error && error.message.includes('customer_id')){
    const { driver_id, order_id, rating, comment } = payload;
    const res = await supabase.from('ratings').insert({ driver_id, order_id, rating, comment }).select().single();
    data = res.data; error = res.error;
  }
  if(error) throw error;
  try{ localStorage.setItem('rated_food_'+food_order_id, '1'); }catch(e){}
  return data;
}

// ===== MODAL GABUNGAN: RATING DRIVER + STORE (dipanggil dari trackingFood.js) =====
export function showCombinedRatingModal(order, driver){
  try{ document.getElementById('foodRatingModal')?.remove(); }catch(e){}
  const theme=getAppTheme();
  const div=document.createElement('div');
  div.id='foodRatingModal';
  div.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.88);backdrop-filter:blur(10px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
  const driverName=driver?.name||'Driver';
  const storeName=order.store?.name||order.pickup_text||'Warung';
  const itemsArr = Array.isArray(order.items) ? order.items : (typeof order.items==='string' ? JSON.parse(order.items||'[]') : []);
  const itemsText = itemsArr.map(i=>`${i.name||i.title} x${i.qty||1}`).join(', ');

  div.innerHTML=`
  <div style="background:white;border-radius:20px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);border:2px solid ${theme.primary};max-height:92vh;overflow:auto">
    <div style="background:${theme.primary};color:white;padding:18px;text-align:center">
      <div style="font-size:36px">⭐</div>
      <div style="font-weight:800;font-size:16px;margin-top:6px">Pesanan Selesai!</div>
      <div style="font-size:11px;opacity:0.9;margin-top:2px">#${String(order.id).slice(0,6).toUpperCase()} • Terima kasih</div>
    </div>
    <div style="padding:18px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-bottom:14px;font-size:12px">
        <div style="font-weight:700">🏪 ${storeName}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${itemsText}</div>
        <div style="font-size:11px;margin-top:4px;font-weight:700">Total Rp ${Number(order.total||0).toLocaleString('id-ID')}</div>
      </div>

      <!-- Rating Driver -->
      <div style="margin-bottom:18px;border:1px solid #e2e8f0;border-radius:12px;padding:12px">
        <div style="font-weight:800;font-size:13px">⭐ Rating Driver - ${driverName}</div>
        <div style="display:flex;gap:6px;margin-top:8px" id="driverStars">
          ${[1,2,3,4,5].map(n=>`<button data-star="${n}" data-type="driver" style="font-size:28px;background:none;border:none;cursor:pointer;filter:grayscale(1);transition:0.2s">⭐</button>`).join('')}
        </div>
        <textarea id="driverComment" placeholder="Komentar untuk driver (opsional)" style="width:100%;margin-top:8px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:11px;resize:none" rows="2"></textarea>
      </div>

      <!-- Rating Store -->
      <div style="margin-bottom:18px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:12px">
        <div style="font-weight:800;font-size:13px">🍔 Rating Warung - ${storeName}</div>
        <div style="display:flex;gap:6px;margin-top:8px" id="storeStars">
          ${[1,2,3,4,5].map(n=>`<button data-star="${n}" data-type="store" style="font-size:28px;background:none;border:none;cursor:pointer;filter:grayscale(1);transition:0.2s">⭐</button>`).join('')}
        </div>
        <textarea id="storeComment" placeholder="Gimana rasanya? (opsional)" style="width:100%;margin-top:8px;padding:8px;border:1px solid #fde68a;border-radius:8px;font-size:11px;resize:none;background:white" rows="2"></textarea>
      </div>

      <div style="display:flex;gap:8px">
        <button id="btnSkipRating" style="flex:1;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer">Lewati</button>
        <button id="btnSubmitRating" style="flex:2;background:${theme.primary};color:#052e16;border:none;padding:12px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer">Kirim Rating</button>
      </div>
      <div id="ratingStatus" style="text-align:center;font-size:11px;color:var(--muted);margin-top:8px"></div>
    </div>
  </div>`;
  document.body.appendChild(div);

  let driverRating=0, storeRating=0;

  function updateStars(type, val){
    div.querySelectorAll(`[data-type="${type}"]`).forEach(btn=>{
      const s=parseInt(btn.getAttribute('data-star'));
      btn.style.filter = s<=val ? 'grayscale(0)' : 'grayscale(1)';
      btn.style.transform = s<=val ? 'scale(1.2)' : 'scale(1)';
    });
  }

  div.querySelectorAll('[data-star]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const type=btn.getAttribute('data-type');
      const val=parseInt(btn.getAttribute('data-star'));
      if(type==='driver'){ driverRating=val; updateStars('driver', val); }
      else { storeRating=val; updateStars('store', val); }
    });
  });

  div.querySelector('#btnSkipRating').addEventListener('click',()=>{
    try{
      localStorage.setItem('rated_food_'+order.id,'1');
      localStorage.setItem('rated_store_'+order.id,'1');
    }catch(e){}
    div.remove();
  });

  div.querySelector('#btnSubmitRating').addEventListener('click', async ()=>{
    const statusEl=div.querySelector('#ratingStatus');
    if(driverRating===0 && storeRating===0){
      statusEl.textContent='Pilih minimal 1 rating ⭐';
      statusEl.style.color='#ef4444';
      return;
    }
    const btn=div.querySelector('#btnSubmitRating');
    btn.disabled=true; btn.textContent='⏳ Mengirim...';
    statusEl.textContent='';

    try{
      const customerId = order.customer_id;
      const storeId = order.store_id;

      // 1. Rating Driver jika dipilih
      if(driverRating>0 && order.driver_id){
        const dComment = div.querySelector('#driverComment').value;
        await submitDriverRatingForFood({
          driver_id: order.driver_id,
          customer_id: customerId,
          food_order_id: order.id,
          rating: driverRating,
          comment: dComment
        });
      }

      // 2. Rating Store jika dipilih
      if(storeRating>0 && storeId){
        const sComment = div.querySelector('#storeComment').value;
        await submitStoreRating({
          store_id: storeId,
          customer_id: customerId,
          food_order_id: order.id,
          rating: storeRating,
          comment: sComment
        });
      }

      statusEl.textContent='✅ Terima kasih atas ratingnya!';
      statusEl.style.color=theme.primary;
      setTimeout(()=>div.remove(), 1200);

    }catch(err){
      console.error('submit rating fail', err);
      statusEl.textContent='❌ Gagal: '+(err.message||'error');
      statusEl.style.color='#ef4444';
      btn.disabled=false; btn.textContent='Kirim Rating';
    }
  });
}

// ===== UPDATE getPassengerHistory UNTUK CEK store_ratings JUGA =====
export async function getPassengerHistoryWithStoreRating(passengerId, limit=20){
  const { getPassengerHistory } = await import('./history_combined_final.js');
  const orders = await getPassengerHistory(passengerId, limit);
  
  // cek store_ratings untuk food orders
  const foodIds = orders.filter(o=>o._type==='food').map(o=>o.id);
  if(foodIds.length){
    try{
      const { data: storeRatings } = await supabase.from('store_ratings').select('food_order_id, rating').in('food_order_id', foodIds);
      const map={};
      (storeRatings||[]).forEach(r=>map[r.food_order_id]=r);
      orders.forEach(o=>{
        if(o._type==='food' && map[o.id]){
          o._storeRated=true;
          o._storeRatingData=map[o.id];
          try{ localStorage.setItem('rated_store_'+o.id,'1'); }catch(e){}
        }
      });
    }catch(e){ console.warn('cek store_ratings fail', e); }
  }
  return orders;
}

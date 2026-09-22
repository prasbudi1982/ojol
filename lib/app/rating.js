
// rating.js - Rating driver - ADAPTIF TEMA HP
import { supabase } from './supabase.js';

function getAppTheme(){
  try{ const s=JSON.parse(localStorage.getItem('app_settings')||'{}'); return { primary:s.primaryColor||'#16a34a', secondary:s.secondaryColor||'#f59e0b' }; }
  catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}

export function openRatingModal(driverId, driverName, orderId){
  let modal = document.getElementById('ratingModal');
  if(modal) modal.remove();
  const theme = getAppTheme();
  const div = document.createElement('div');
  div.id='ratingModal';
  div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `
    <div style="background:var(--card);border-radius:20px;max-width:380px;width:100%;overflow:hidden;border:2px solid ${theme.primary};box-shadow:0 20px 50px var(--shadow)">
      <div style="background:${theme.primary};color:white;padding:18px;text-align:center">
        <div style="font-size:36px">⭐</div>
        <div style="font-weight:800;font-size:16px;margin-top:6px">Beri Rating Driver</div>
        <div style="font-size:12px;opacity:0.9;margin-top:2px">${driverName}</div>
      </div>
      <div style="padding:20px;text-align:center;background:var(--card)">
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Bagaimana pelayanan driver?</div>
        <div id="ratingStars" style="display:flex;justify-content:center;gap:8px;margin:12px 0">
          ${[1,2,3,4,5].map(n=>`<button data-star="${n}" style="font-size:36px;background:none;border:none;cursor:pointer;transition:transform 0.1s">⭐</button>`).join('')}
        </div>
        <div id="ratingLabel" style="font-size:13px;font-weight:700;color:var(--text);height:18px">Tap bintang</div>
        <textarea id="ratingComment" placeholder="Komentar (opsional)..." style="width:100%;margin-top:12px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:12px;height:70px;resize:none"></textarea>
        <div id="ratingStatus" style="font-size:11px;margin-top:8px;min-height:14px;color:var(--muted)"></div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button id="btnSubmitRating" style="flex:1;background:${theme.primary};color:white;border:none;padding:12px;border-radius:12px;font-weight:800">Kirim Rating</button>
          <button id="btnSkipRating" style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:12px 16px;border-radius:12px;font-weight:700">Lewati</button>
        </div>
        <input type="hidden" id="ratingDriverId" value="${driverId}">
        <input type="hidden" id="ratingOrderId" value="${orderId}">
        <input type="hidden" id="ratingValue" value="0">
      </div>
    </div>
  `;
  document.body.appendChild(div);
  
  let selected = 0;
  const labels = {1:'Buruk 😠',2:'Kurang 😕',3:'Cukup 🙂',4:'Baik 😊',5:'Luar Biasa 🤩'};
  div.querySelectorAll('[data-star]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selected = parseInt(btn.dataset.star);
      document.getElementById('ratingValue').value = selected;
      div.querySelectorAll('[data-star]').forEach((b,i)=>{
        b.style.opacity = (i+1)<=selected ? '1' : '0.3';
        b.style.transform = (i+1)<=selected ? 'scale(1.2)' : 'scale(1)';
      });
      document.getElementById('ratingLabel').textContent = labels[selected]||'';
    });
  });
  
  document.getElementById('btnSkipRating').onclick = ()=> div.remove();
  document.getElementById('btnSubmitRating').onclick = async ()=>{
    if(selected===0){ document.getElementById('ratingStatus').textContent='❌ Pilih bintang dulu'; return; }
    document.getElementById('ratingStatus').textContent='⏳ Mengirim...';
    try{
      const comment = document.getElementById('ratingComment').value.trim();
      let passengerId = null;
      try{
        const { data: { user } } = await supabase.auth.getUser();
        if(user){
          const { data: u } = await supabase.from('users').select('id').eq('google_id', user.id).maybeSingle();
          if(u) passengerId = u.id;
          else {
            const cp = JSON.parse(localStorage.getItem('current_profile')||'null');
            if(cp) passengerId = cp.id;
          }
        }
      }catch(e){}
      const payload = {
        driver_id: driverId,
        order_id: orderId,
        passenger_id: passengerId,
        rating: selected,
        comment: comment||null,
        created_at: new Date().toISOString()
      };
      const { error } = await supabase.from('ratings').insert(payload);
      if(error) throw error;
      document.getElementById('ratingStatus').textContent='✅ Terima kasih ratingnya!';
      setTimeout(()=>div.remove(), 1000);
    }catch(e){
      const local = JSON.parse(localStorage.getItem('local_ratings')||'[]');
      local.push({ driver_id:driverId, order_id:orderId, rating:selected, comment:document.getElementById('ratingComment').value, created_at:new Date().toISOString() });
      localStorage.setItem('local_ratings', JSON.stringify(local));
      document.getElementById('ratingStatus').textContent='✅ Disimpan lokal';
      setTimeout(()=>div.remove(), 1200);
    }
  };
  div.addEventListener('click', (e)=>{ if(e.target===div) div.remove(); });
}

export async function getDriverAverageRating(driverId){
  try{
    const { data } = await supabase.from('ratings').select('rating').eq('driver_id', driverId);
    if(!data || data.length===0) return null;
    const avg = data.reduce((s,r)=>s+r.rating,0)/data.length;
    return { avg: avg.toFixed(1), count: data.length };
  }catch(e){ return null; }
}

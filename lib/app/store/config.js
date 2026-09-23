// store/config.js - ISOLASI, tidak ubah config.js utama
// Tarif food pakai motor ojol, tapi bisa di-override admin setting
export const TARIF_FOOD = {
  base: 3000,
  perKm: 2500,
  min: 5000,
  pickupFreeKm: 2,
  pickupPerKm: 1000,
  label: 'Food Delivery'
};

export const FOOD_STATUS = {
  searching_driver: { label: 'Mencari Driver', color: '#f59e0b', icon: '🔍' },
  merchant_confirm: { label: 'Konfirmasi Warung', color: '#3b82f6', icon: '🏪' },
  cooking: { label: 'Dimasak', color: '#f97316', icon: '🍳' },
  ready: { label: 'Siap Diambil', color: '#22c55e', icon: '✅' },
  picked: { label: 'Diantar Driver', color: '#16a34a', icon: '🛵' },
  delivering: { label: 'OTW Customer', color: '#16a34a', icon: '🚀' },
  completed: { label: 'Selesai', color: '#16a34a', icon: '🎉' },
  cancelled: { label: 'Batal', color: '#ef4444', icon: '❌' }
};

export const FOOD_CATEGORIES = ['Makanan', 'Minuman', 'Jajanan', 'Lainnya'];

export function getFoodTheme(){
  try{
    const s = JSON.parse(localStorage.getItem('app_settings')||'{}');
    return { primary: s.primaryColor||'#16a34a', secondary: s.secondaryColor||'#f59e0b' };
  }catch(e){ return { primary:'#16a34a', secondary:'#f59e0b' }; }
}


// admin.js - Dashboard & Settings untuk role admin
import { supabase } from './supabase.js';
import { SURUH_CENTER, SURUH_RADIUS_KM, SURUH_BBOX, TRENGGALEK_BBOX, TARIF, VEHICLE_TYPES } from './config.js';

export const DEFAULT_SETTINGS = {
  app_name: 'OJOL SURUH',
  wilayah_name: 'Kecamatan Suruh',
  kabupaten_name: 'Kabupaten Trenggalek',
  coverage_radius_km: SURUH_RADIUS_KM,
  suruh_center: SURUH_CENTER,
  suruh_bbox: SURUH_BBOX,
  trenggalek_bbox: TRENGGALEK_BBOX,
  tarif_motor_base: TARIF.motor.base,
  tarif_motor_perkm: TARIF.motor.perKm,
  tarif_motor_min: TARIF.motor.min,
  tarif_mobil_base: TARIF.mobil.base,
  tarif_mobil_perkm: TARIF.mobil.perKm,
  tarif_mobil_min: TARIF.mobil.min,
  pp_multiplier: TARIF.ppMultiplier
};

export async function getAppSettings(){
  // coba dari supabase table app_settings, kalau tidak ada pakai localStorage + default
  try{
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', 'main').single();
    if(!error && data){
      return { ...DEFAULT_SETTINGS, ...data.settings, _source: 'supabase' };
    }
  }catch(e){}
  try{
    const ls = JSON.parse(localStorage.getItem('admin_settings')||'null');
    if(ls) return { ...DEFAULT_SETTINGS, ...ls, _source: 'localStorage' };
  }catch(e){}
  return { ...DEFAULT_SETTINGS, _source: 'default' };
}

export async function saveAppSettings(newSettings){
  // save to localStorage always, try supabase if table exists
  localStorage.setItem('admin_settings', JSON.stringify(newSettings));
  try{
    const { error } = await supabase.from('app_settings').upsert({ id: 'main', settings: newSettings, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if(error) console.warn('app_settings upsert fail (table belum ada?)', error.message);
    else console.log('saved to supabase app_settings');
  }catch(e){ console.warn('save supabase skip', e.message); }
  return true;
}

export async function getDashboardStats(){
  let totalUsers = 0, totalDrivers = 0, totalPassengers = 0, driversOnline = 0, totalOrders = 0;
  let totalReports = 0, totalBanned = 0;
  try{
    const { count: c1 } = await supabase.from('users').select('*', { count: 'exact', head: true });
    totalUsers = c1||0;
  }catch{}
  try{
    const { count: c2 } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role','driver');
    totalDrivers = c2||0;
  }catch{}
  try{
    const { count: c3 } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role','passenger');
    totalPassengers = c3||0;
  }catch{}
  try{
    const { count: c4 } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status','online');
    driversOnline = c4||0;
  }catch{}
  try{
    const { count: c5 } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    totalOrders = c5||0;
  }catch{}
  try{
    const { count: c6 } = await supabase.from('reports').select('*', { count: 'exact', head: true });
    totalReports = c6||0;
  }catch{}
  try{
    const { count: c7 } = await supabase.from('banned_users').select('*', { count: 'exact', head: true }).eq('is_active', true);
    totalBanned = c7||0;
  }catch{}
  return { totalUsers, totalDrivers, totalPassengers, driversOnline, totalOrders, totalReports, totalBanned };
}

export async function getAllUsers(limit=100){
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(limit);
  if(error) throw error;
  return data;
}

export async function searchUsers(q){
  const { data, error } = await supabase.from('users').select('*').or(`name.ilike.%${q}%,email.ilike.%${q}%,nopol.ilike.%${q}%,desa.ilike.%${q}%`).limit(50);
  if(error) throw error;
  return data;
}

export async function updateUserRole(userId, newRole){
  const { data, error } = await supabase.from('users').update({ role: newRole }).eq('id', userId).select().single();
  if(error) throw error;
  return data;
}

export async function getRecentOrders(limit=20){
  const { data, error } = await supabase.from('orders').select('*, passenger:passenger_id(name,email), driver:driver_id(name,email)').order('created_at', { ascending: false }).limit(limit);
  if(error) return [];
  return data||[];
}

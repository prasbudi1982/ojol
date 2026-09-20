// admin.js - Modul Admin / Pengelola Aplikasi
import { supabase } from './supabase.js';
import { APP_SETTINGS_DEFAULT } from './config.js';

// ===== STATS DASHBOARD =====
export async function getAdminStats(){
  try{
    // Ambil semua users
    const { data: users, error } = await supabase.from('users').select('id, role, status, banned, created_at');
    if(error) throw error;
    
    const total = users?.length||0;
    const active = users?.filter(u=>u.status==='online' || u.status==='active').length||0;
    const offline = users?.filter(u=>u.status==='offline').length||0;
    const banned = users?.filter(u=>u.banned===true || u.status==='banned').length||0;
    const drivers = users?.filter(u=>u.role==='driver').length||0;
    const passengers = users?.filter(u=>u.role==='passenger').length||0;
    const admins = users?.filter(u=>u.role==='admin').length||0;
    
    // Orders hari ini
    let ordersToday = 0;
    try{
      const today = new Date().toISOString().slice(0,10);
      const { count } = await supabase.from('orders').select('id', {count:'exact', head:true}).gte('created_at', today);
      ordersToday = count||0;
    }catch(e){}

    return { total, active, offline, banned, drivers, passengers, admins, ordersToday, users };
  }catch(e){
    console.error('getAdminStats error', e);
    return { total:0, active:0, offline:0, banned:0, drivers:0, passengers:0, admins:0, ordersToday:0, users:[] };
  }
}

// ===== LIST USERS dengan filter =====
export async function getUsersList(filter='all', search=''){
  try{
    let query = supabase.from('users').select('*').order('created_at', {ascending:false}).limit(100);
    if(filter==='active') query = query.eq('status','active').or('status.eq.online');
    else if(filter==='offline') query = query.eq('status','offline');
    else if(filter==='banned') query = query.eq('banned', true);
    else if(filter==='driver') query = query.eq('role','driver');
    else if(filter==='passenger') query = query.eq('role','passenger');
    else if(filter==='admin') query = query.eq('role','admin');
    
    if(search){
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,hp.ilike.%${search}%`);
    }
    
    const { data, error } = await query;
    if(error) throw error;
    return data||[];
  }catch(e){
    console.error('getUsersList error', e);
    return [];
  }
}

// ===== DETAIL USER =====
export async function getUserDetail(userId){
  try{
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if(error) throw error;
    // Ambil statistik order user
    const { data: orders } = await supabase.from('orders').select('id,status').or(`passenger_id.eq.${userId},driver_id.eq.${userId}`).limit(20);
    return { user: data, orders: orders||[] };
  }catch(e){ return null; }
}

// ===== BAN / UNBAN =====
export async function banUser(userId, reason='Pelanggaran'){
  try{
    const { error } = await supabase.from('users').update({ banned:true, status:'banned', banned_reason:reason, banned_at:new Date().toISOString() }).eq('id', userId);
    if(error) throw error;
    // Simpan ke reports/banned_logs jika ada tabel
    try{ await supabase.from('banned_logs').insert({ user_id:userId, reason, created_at:new Date().toISOString() }); }catch(e){}
    return true;
  }catch(e){ alert('Gagal ban: '+e.message); return false; }
}

export async function unbanUser(userId){
  try{
    const { error } = await supabase.from('users').update({ banned:false, status:'active', banned_reason:null, banned_at:null }).eq('id', userId);
    if(error) throw error;
    return true;
  }catch(e){ alert('Gagal unban: '+e.message); return false; }
}

// ===== REPORTS / LAPORAN AKUN =====
export async function getReports(){
  try{
    // Coba ambil dari tabel reports, kalau belum ada return dummy
    const { data, error } = await supabase.from('reports').select('*, reporter:reporter_id(name), reported:reported_id(name, role)').order('created_at',{ascending:false}).limit(50);
    if(error) throw error;
    return data||[];
  }catch(e){
    console.warn('Tabel reports belum ada, pakai dummy. Buat tabel reports via SQL admin.');
    return [];
  }
}

export async function createReport(reportedId, reporterId, reason, description){
  try{
    const { error } = await supabase.from('reports').insert({ reported_id:reportedId, reporter_id:reporterId, reason, description, status:'pending', created_at:new Date().toISOString() });
    if(error) throw error;
    return true;
  }catch(e){ alert('Gagal lapor: '+e.message); return false; }
}

// ===== APP SETTINGS =====
export function getAppSettings(){
  try{
    const saved = localStorage.getItem('app_settings');
    if(saved) return { ...APP_SETTINGS_DEFAULT, ...JSON.parse(saved) };
  }catch(e){}
  return APP_SETTINGS_DEFAULT;
}

export async function saveAppSettings(newSettings){
  try{
    // Simpan ke localStorage
    localStorage.setItem('app_settings', JSON.stringify(newSettings));
    // Coba simpan ke Supabase app_settings jika ada tabel
    try{
      await supabase.from('app_settings').upsert({ id:1, settings:newSettings, updated_at:new Date().toISOString() }, {onConflict:'id'});
    }catch(e){ console.log('app_settings table belum ada, pakai localStorage saja'); }
    
    // Apply langsung ke CSS variable
    applyAppTheme(newSettings);
    return true;
  }catch(e){ alert('Gagal simpan: '+e.message); return false; }
}

export function applyAppTheme(settings){
  try{
    const root = document.documentElement;
    if(settings.primaryColor) root.style.setProperty('--primary', settings.primaryColor);
    if(settings.secondaryColor) root.style.setProperty('--secondary', settings.secondaryColor);
    // Update title
    if(settings.appName) document.title = settings.appName;
  }catch(e){}
}

// ===== SQL HELPER untuk admin setup =====
export const ADMIN_SQL = `
-- Buat tabel reports (laporan driver/penumpang)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),
  reported_id uuid references users(id),
  reason text, -- spam, pelecehan, tarif tidak wajar, dll
  description text,
  status text default 'pending', -- pending, reviewed, banned
  created_at timestamptz default now()
);

-- Tambah kolom banned di users jika belum ada
alter table users add column if not exists banned boolean default false;
alter table users add column if not exists banned_reason text;
alter table users add column if not exists banned_at timestamptz;

-- Tabel banned_logs
create table if not exists banned_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  reason text,
  banned_by uuid references users(id),
  created_at timestamptz default now()
);

-- Tabel app_settings
create table if not exists app_settings (
  id int primary key,
  settings jsonb,
  updated_at timestamptz default now()
);

-- Jadikan user admin (ganti email)
-- update users set role='admin' where email='admin@example.com';
`;

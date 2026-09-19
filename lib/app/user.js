// user.js - Auth & profile
import { supabase } from './supabase.js';

export async function getSession(){ const { data } = await supabase.auth.getSession(); return data.session; }

export async function getProfile(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return null;
  const { data, error } = await supabase.from('users').select('*').eq('google_id', user.id).single();
  if(error && error.code==='PGRST116'){
    const { data:created } = await supabase.from('users').insert({ google_id:user.id, name:user.user_metadata.full_name || user.email, email:user.email, picture:user.user_metadata.avatar_url, role:'passenger', status:'active' }).select().single();
    return created;
  }
  if(error) throw error; return data;
}

export async function deleteAccount(profileId){
  // 1. hapus lokasi driver
  try{ await supabase.from('driver_locations').delete().eq('driver_id', profileId); }catch(e){}
  // 2. hapus orders terkait (jika RLS allow, kalau tidak akan di-skip)
  try{ await supabase.from('orders').delete().eq('passenger_id', profileId); }catch(e){}
  try{ await supabase.from('orders').delete().eq('driver_id', profileId); }catch(e){}
  // 3. hapus user di tabel users
  const { error } = await supabase.from('users').delete().eq('id', profileId);
  if(error) throw error;
  // 4. logout auth
  await supabase.auth.signOut();
}

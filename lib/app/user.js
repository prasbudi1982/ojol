// user.js - Auth & profile + Banned + Delete
import { supabase } from './supabase.js';
export async function getSession(){ const { data } = await supabase.auth.getSession(); return data.session; }
export async function getProfile(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return null;
  try{
    const { data: banned } = await supabase.from('banned_users').select('*').eq('google_id', user.id).eq('is_active', true).maybeSingle();
    if(banned){ try{ await supabase.auth.signOut(); }catch{} const err = new Error(`🚫 Akun dibanned: ${banned.reason}`); err.code='BANNED'; err.bannedDetail=banned; throw err; }
    if(user.email){
      const { data: bannedEmail } = await supabase.from('banned_users').select('*').eq('email', user.email).eq('is_active', true).maybeSingle();
      if(bannedEmail){ try{ await supabase.auth.signOut(); }catch{} const err = new Error(`🚫 Email dibanned: ${bannedEmail.reason}`); err.code='BANNED'; err.bannedDetail=bannedEmail; throw err; }
    }
  }catch(e){ if(e.code==='BANNED') throw e; }
  const { data, error } = await supabase.from('users').select('*').eq('google_id', user.id).single();
  if(error && error.code==='PGRST116'){
    const { data:created } = await supabase.from('users').insert({ google_id:user.id, name:user.user_metadata.full_name || user.email, email:user.email, picture:user.user_metadata.avatar_url, role:'passenger', status:'active' }).select().single();
    return created;
  }
  if(error) throw error;
  if(data?.is_banned){ try{ await supabase.auth.signOut(); }catch{} const err = new Error(`🚫 Akun dibanned: ${data.banned_reason}`); err.code='BANNED'; throw err; }
  return data;
}
export async function deleteAccount(userId){
  try{ await supabase.from('driver_locations').delete().eq('driver_id', userId); }catch{}
  try{ await supabase.from('push_subscriptions').delete().eq('user_id', userId); }catch{}
  try{ await supabase.from('orders').delete().eq('passenger_id', userId); }catch{}
  try{ await supabase.from('orders').delete().eq('driver_id', userId); }catch{}
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if(error) throw error;
  try{ await supabase.auth.signOut(); }catch{}
  return true;
}

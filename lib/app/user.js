// user.js - Auth & profile + Banned Check v2
import { supabase } from './supabase.js';

export async function getSession(){ const { data } = await supabase.auth.getSession(); return data.session; }

export async function getProfile(){
  const { data:{ user } } = await supabase.auth.getUser(); if(!user) return null;

  // ===== CEK BANNED GOOGLE ACCOUNT (baru) =====
  try{
    const { data: banned } = await supabase.from('banned_users').select('*').eq('google_id', user.id).eq('is_active', true).maybeSingle();
    if(banned){
      try{ await supabase.auth.signOut(); }catch{}
      const err = new Error(`🚫 Akun dibanned: ${banned.reason||'Melanggar aturan'}`);
      err.code = 'BANNED'; err.bannedDetail = banned;
      throw err;
    }
    if(user.email){
      const { data: bannedEmail } = await supabase.from('banned_users').select('*').eq('email', user.email).eq('is_active', true).maybeSingle();
      if(bannedEmail){
        try{ await supabase.auth.signOut(); }catch{}
        const err = new Error(`🚫 Email dibanned: ${bannedEmail.reason||'Melanggar aturan'}`);
        err.code = 'BANNED'; err.bannedDetail = bannedEmail;
        throw err;
      }
    }
  }catch(e){
    if(e.code==='BANNED') throw e;
    console.warn('banned check skip (tabel belum ada?)', e.message);
  }

  const { data, error } = await supabase.from('users').select('*').eq('google_id', user.id).single();
  if(error && error.code==='PGRST116'){
    const { data:created } = await supabase.from('users').insert({ google_id:user.id, name:user.user_metadata.full_name || user.email, email:user.email, picture:user.user_metadata.avatar_url, role:'passenger', status:'active' }).select().single();
    if(created?.is_banned){
      try{ await supabase.auth.signOut(); }catch{}
      throw new Error(`🚫 Akun dibanned: ${created.banned_reason||''}`);
    }
    return created;
  }
  if(error) throw error;
  if(data?.is_banned){
    try{ await supabase.auth.signOut(); }catch{}
    const err = new Error(`🚫 Akun dibanned: ${data.banned_reason||'Melanggar aturan'}`);
    err.code='BANNED'; throw err;
  }
  return data;
}

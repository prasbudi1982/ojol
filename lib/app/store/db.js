// store/db.js - wrapper supabase khusus food, isolasi dari orders ojol
import { supabase } from '../app/supabase.js';

export async function getSupabase(){ return supabase; }

// Helper untuk handle jika tabel belum ada (fallback localStorage)
export function isTableMissingError(err){
  if(!err) return false;
  const msg = (err.message||'').toLowerCase();
  return msg.includes('does not exist') || msg.includes('relation') || msg.includes('not found') || err.code==='42P01';
}

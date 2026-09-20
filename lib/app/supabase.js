// lib/app/supabase.js - PRODUCTION - uaeajeuoteerqhacmhmh
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uaeajeuoteerqhacmhmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWFqZXVvdGVlcnFoYWNtaG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTMzNDYsImV4cCI6MjEwNTI4OTM0Nn0.BS7f_aOtLkAjPxWLbPoPEYl3L2T0VinMdxn2eHkEToo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  realtime: { params: { eventsPerSecond: 10 } }
});

export function getSupabase(){ return supabase; }
export async function testConnection(){
  const { error, count } = await supabase.from('users').select('id', { count:'exact', head:true });
  if(error) throw error;
  return count;
}

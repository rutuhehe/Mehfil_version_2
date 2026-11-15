import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseReady = Boolean(url && anonKey && !url.includes('your-project'))
export const supabase = supabaseReady
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add the existing project URL and publishable key to .env.local.')
  return supabase
}

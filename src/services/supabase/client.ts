/**
 * Supabase client — singleton.
 * Credentials come from environment variables and are never hard-coded.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your project values.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage (Capacitor SecureStorage in Phase 7)
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

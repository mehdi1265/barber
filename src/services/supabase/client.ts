/**
 * Supabase client — singleton.
 * Credentials come from environment variables and are never hard-coded.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { normalizeProjectUrl } from './project-url'
import { secureSessionStorage } from './secure-session-storage'

const supabaseUrl = normalizeProjectUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your project values.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Native: Keychain/Keystore. Web: localStorage (development only, D-21).
    storage: secureSessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

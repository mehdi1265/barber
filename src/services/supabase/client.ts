/**
 * Supabase client — singleton.
 * Credentials come from environment variables and are never hard-coded.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { secureSessionStorage } from './secure-session-storage'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in your project values.'
  )
}

if (/\/rest\/v1$/i.test(supabaseUrl)) {
  throw new Error(
    'VITE_SUPABASE_URL must be the project URL (https://<ref>.supabase.co), not the REST endpoint (/rest/v1).'
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

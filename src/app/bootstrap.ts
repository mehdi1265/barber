/**
 * Application bootstrap.
 * Called once at startup before the React tree mounts.
 * Initialises the SQLite database and restores the auth session.
 */

import { supabase } from '@services/supabase/client'
import { useAuthStore } from '@state/auth.store'
import { getDatabase } from '@database/sqlite/database'
import { runMigrations } from '@database/sqlite/migrations'

export async function bootstrapApp(): Promise<void> {
  const { setSession, setLoading } = useAuthStore.getState()

  try {
    setLoading(true)

    // 1. Init SQLite and run migrations
    const db = await getDatabase()
    await runMigrations(db)
    console.log('[bootstrap] Database ready')

    // 2. Restore Supabase session
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[bootstrap] Could not restore session:', error.message)
      setSession(null)
    } else {
      setSession(data.session)
    }

    // 3. Listen for auth state changes
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    console.log('[bootstrap] Done')
  } catch (err) {
    console.error('[bootstrap] Error:', err)
    setSession(null)
    throw err
  } finally {
    setLoading(false)
  }
}

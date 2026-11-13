/**
 * Application bootstrap.
 * Called once at startup before the React tree mounts.
 * Initialises the SQLite database and restores the auth session.
 *
 * A database failure is recorded in the database store instead of aborting the
 * whole boot. The router still mounts, so the login screen remains available
 * and the UI can offer a retry action.
 */

import { supabase } from '@services/supabase/client'
import { useAuthStore } from '@state/auth.store'
import { useDatabaseStore } from '@state/database.store'
import { getDatabase } from '@database/sqlite/database'
import { runMigrations } from '@database/sqlite/migrations'

export async function initializeDatabase(): Promise<void> {
  const { setStatus } = useDatabaseStore.getState()
  setStatus('initializing')

  try {
    const db = await getDatabase()
    await runMigrations(db)
    setStatus('ready')
    console.log('[bootstrap] Database ready')
  } catch (err) {
    console.error('[bootstrap] Database initialisation failed:', err)
    setStatus('error')
  }
}

async function restoreAuthSession(): Promise<void> {
  const { setSession } = useAuthStore.getState()

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[bootstrap] Could not restore session:', error.message)
      setSession(null)
    } else {
      setSession(data.session)
    }
  } catch (err) {
    console.error('[bootstrap] Session restore failed:', err)
    setSession(null)
  }

  // Listen for auth state changes. Registration is independent of database
  // availability because Supabase Auth is the only network dependency here.
  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  } catch (err) {
    console.error('[bootstrap] Could not subscribe to auth changes:', err)
  }
}

export async function bootstrapApp(): Promise<void> {
  const { setLoading } = useAuthStore.getState()

  setLoading(true)
  try {
    await initializeDatabase()
    await restoreAuthSession()
    console.log('[bootstrap] Done')
  } finally {
    setLoading(false)
  }
}

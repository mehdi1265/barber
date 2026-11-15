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
import { ensureProfile } from '@features/auth/auth.usecases'
import { errorDetails, logger } from '@shared/utils/logger'

const DATABASE_INIT_TIMEOUT_MS = 15_000

// A plugin call that never resolves must not keep the login screen hidden.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    )
  })
}

export async function initializeDatabase(): Promise<void> {
  const { setStatus } = useDatabaseStore.getState()
  setStatus('initializing')

  try {
    const db = await withTimeout(
      getDatabase(),
      DATABASE_INIT_TIMEOUT_MS,
      'Database initialisation timed out'
    )
    await runMigrations(db)
    setStatus('ready')
    logger.info('Database ready')
  } catch (err) {
    logger.error('Database initialisation failed', { error: errorDetails(err) })
    setStatus('error')
  }
}

async function restoreAuthSession(): Promise<void> {
  const { setSession } = useAuthStore.getState()

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      logger.warn('Could not restore session', { error: error.message })
      setSession(null)
    } else {
      setSession(data.session)
    }
  } catch (err) {
    logger.error('Session restore failed', { error: errorDetails(err) })
    setSession(null)
  }

  // Listen for auth state changes. Registration is independent of database
  // availability because Supabase Auth is the only network dependency here.
  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) void ensureProfile(session.user)
    })
  } catch (err) {
    logger.error('Could not subscribe to auth changes', { error: errorDetails(err) })
  }
}

export async function bootstrapApp(): Promise<void> {
  const { setLoading } = useAuthStore.getState()

  setLoading(true)
  try {
    // Database and session restore are independent: a slow or failing database
    // must not delay the login screen.
    await Promise.all([initializeDatabase(), restoreAuthSession()])

    // The profile row is created on every launch if it is missing (e.g. the
    // database failed on the first run or the account was created elsewhere).
    const currentUser = useAuthStore.getState().user
    if (currentUser) await ensureProfile(currentUser)

    logger.info('Bootstrap done')
  } finally {
    setLoading(false)
  }
}

/**
 * useDatabase — returns a ready SQLiteDBConnection from the singleton.
 * Throws if called before bootstrap completes.
 */

import { useEffect, useState } from 'react'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getDatabase } from '@database/sqlite/database'

interface DbState {
  db: SQLiteDBConnection | null
  ready: boolean
  error: Error | null
}

export function useDatabase(): DbState {
  const [state, setState] = useState<DbState>({ db: null, ready: false, error: null })

  useEffect(() => {
    let cancelled = false
    getDatabase()
      .then(db => {
        if (!cancelled) setState({ db, ready: true, error: null })
      })
      .catch(err => {
        if (!cancelled) setState({ db: null, ready: false, error: err as Error })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

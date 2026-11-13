/**
 * Database bootstrap status.
 *
 * Kept separate from the auth store so a database failure can be rendered
 * without blocking authentication screens.
 */

import { create } from 'zustand'

export type DatabaseStatus = 'idle' | 'initializing' | 'ready' | 'error'

interface DatabaseState {
  status: DatabaseStatus
  setStatus: (status: DatabaseStatus) => void
}

export const useDatabaseStore = create<DatabaseState>(set => ({
  status: 'idle',
  setStatus: status => set({ status }),
}))

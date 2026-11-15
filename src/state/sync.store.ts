/**
 * Sync status store — tracks sync state shown in UI header.
 */

import { create } from 'zustand'

type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface SyncStoreState {
  status: SyncState
  lastSyncAt: string | null
  pendingCount: number
  /** Remote rows skipped during the last pull because local edits were queued. */
  conflicts: number
  errorMessage: string | null

  setStatus: (status: SyncState) => void
  setSynced: (at: string) => void
  setPending: (count: number) => void
  setConflicts: (count: number) => void
  setError: (msg: string) => void
  setOffline: () => void
}

export const useSyncStore = create<SyncStoreState>()(set => ({
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  conflicts: 0,
  errorMessage: null,

  setStatus: status => set({ status, errorMessage: null }),
  // The real pending count is set separately after a run; a run can finish
  // while some rows are still waiting for their backoff window.
  setSynced: at => set({ status: 'synced', lastSyncAt: at, errorMessage: null }),
  setPending: count => set({ pendingCount: count }),
  setConflicts: count => set({ conflicts: count }),
  setError: msg => set({ status: 'error', errorMessage: msg }),
  setOffline: () => set({ status: 'offline' }),
}))

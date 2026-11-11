/**
 * Sync status store — tracks sync state shown in UI header.
 */

import { create } from 'zustand'

type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

interface SyncStoreState {
  status: SyncState
  lastSyncAt: string | null
  pendingCount: number
  errorMessage: string | null

  setStatus: (status: SyncState) => void
  setSynced: (at: string) => void
  setPending: (count: number) => void
  setError: (msg: string) => void
  setOffline: () => void
}

export const useSyncStore = create<SyncStoreState>()((set) => ({
  status: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  errorMessage: null,

  setStatus: (status) => set({ status, errorMessage: null }),
  setSynced: (at) => set({ status: 'synced', lastSyncAt: at, pendingCount: 0, errorMessage: null }),
  setPending: (count) => set({ pendingCount: count }),
  setError: (msg) => set({ status: 'error', errorMessage: msg }),
  setOffline: () => set({ status: 'offline' }),
}))

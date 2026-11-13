/**
 * Mounts the background sync lifecycle for an authenticated session.
 * Renders nothing; all state lives in the sync store.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@state/auth.store'
import {
  refreshPendingCount,
  runSync,
  scheduleSync,
  startSyncTriggers,
} from '../engine/sync.manager'

export function SyncManager() {
  const queryClient = useQueryClient()
  const userId = useAuthStore(state => state.user?.id)

  useEffect(() => {
    if (!userId) return

    void refreshPendingCount()
    void runSync('startup')

    // Every successful local mutation queues an outbox row; push shortly after
    // the burst settles instead of one request per repository call.
    const unsubscribe = queryClient.getMutationCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'success') scheduleSync()
    })

    const stopTriggers = startSyncTriggers()

    return () => {
      unsubscribe()
      stopTriggers()
    }
  }, [queryClient, userId])

  return null
}

/**
 * Sync manager: owns the run lifecycle and the automatic triggers.
 *
 * One run at a time (module-level mutex). Automatic runs are debounced so a
 * burst of local mutations (a visit + services + payment) becomes one push.
 * Every run is best-effort: local-first writes never wait for the network.
 */

import { getDatabase } from '@database/sqlite/database'
import { useAuthStore } from '@state/auth.store'
import { useSyncStore } from '@state/sync.store'
import { countPendingOutbox } from '@sync/outbox/outbox.repository'
import { pushOutbox } from './push'
import { pullFromCloud } from './pull'
import { createSupabaseSyncClient } from './supabase-sync-client'
import { RemoteError, type SyncOutcome, type SyncReason } from './sync.types'

const DEBOUNCE_MS = 2_000

let running: Promise<SyncOutcome> | null = null
let scheduled: ReturnType<typeof setTimeout> | null = null
let triggersInstalled = false

export interface RunOptions {
  /** Ignore the pull cursor (Settings → restore from cloud). */
  fullPull?: boolean
}

function skipped(pending: number): SyncOutcome {
  return { ran: false, pushed: 0, pulled: 0, pending, conflicts: 0, error: null }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function errorMessage(err: unknown): string {
  if (err instanceof RemoteError && err.kind === 'auth') {
    return 'نشست شما منقضی شده است. دوباره وارد شوید.'
  }
  if (err instanceof RemoteError) {
    return 'همگام‌سازی با ابر ناموفق بود. اتصال اینترنت را بررسی کنید.'
  }
  return 'همگام‌سازی انجام نشد. دوباره تلاش کنید.'
}

export async function refreshPendingCount(): Promise<number> {
  try {
    const db = await getDatabase()
    const count = await countPendingOutbox(db)
    useSyncStore.getState().setPending(count)
    return count
  } catch {
    return useSyncStore.getState().pendingCount
  }
}

export async function runSync(
  reason: SyncReason = 'manual',
  options: RunOptions = {}
): Promise<SyncOutcome> {
  if (running) return running

  running = execute(reason, options).finally(() => {
    running = null
  })
  return running
}

/** Full history pull; local rows are updated, never deleted. */
export async function restoreFromCloud(): Promise<SyncOutcome> {
  if (running) await running
  return runSync('manual', { fullPull: true })
}

async function execute(reason: SyncReason, options: RunOptions): Promise<SyncOutcome> {
  const store = useSyncStore.getState()
  const user = useAuthStore.getState().user

  if (!user) return skipped(store.pendingCount)

  let db
  try {
    db = await getDatabase()
  } catch (err) {
    console.error('[sync] database unavailable:', err)
    store.setError('پایگاه داده محلی در دسترس نیست؛ همگام‌سازی ممکن نشد.')
    return { ...skipped(store.pendingCount), ran: true, error: 'database unavailable' }
  }

  if (!isOnline()) {
    const pending = await countPendingOutbox(db).catch(() => store.pendingCount)
    store.setOffline()
    store.setPending(pending)
    return skipped(pending)
  }

  console.info(`[sync] run started (${reason})`)
  store.setStatus('syncing')

  try {
    const client = await createSupabaseSyncClient()

    const push = await pushOutbox({ db, client, userId: user.id })

    if (push.stoppedForAuth) {
      const pending = await countPendingOutbox(db).catch(() => store.pendingCount)
      store.setPending(pending)
      store.setError('نشست شما منقضی شده است. دوباره وارد شوید.')
      return {
        ran: true,
        pushed: push.pushed,
        pulled: 0,
        pending,
        conflicts: store.conflicts,
        error: 'session expired',
      }
    }

    const pull = await pullFromCloud({
      db,
      client,
      userId: user.id,
      full: options.fullPull === true,
    })

    const pending = await countPendingOutbox(db).catch(() => 0)
    const finishedAt = new Date().toISOString()

    store.setPending(pending)
    store.setConflicts(pull.conflicts)
    store.setSynced(finishedAt)

    if (push.terminal > 0) {
      store.setError(
        `${push.terminal.toLocaleString('fa-IR')} تغییر به دلیل خطای دائمی ارسال نشد. جزئیات را در گزارش‌ها بررسی کنید.`
      )
    }

    return {
      ran: true,
      pushed: push.pushed,
      pulled: pull.pulled,
      pending,
      conflicts: pull.conflicts,
      error: push.terminal > 0 ? 'terminal failures' : null,
    }
  } catch (err) {
    console.error('[sync] run failed:', err)
    const message = errorMessage(err)
    useSyncStore.getState().setError(message)
    const pending = await countPendingOutbox(db).catch(() => 0)
    useSyncStore.getState().setPending(pending)
    return {
      ran: true,
      pushed: 0,
      pulled: 0,
      pending,
      conflicts: useSyncStore.getState().conflicts,
      error: message,
    }
  }
}

/** Coalesces a burst of local mutations into one run. */
export function scheduleSync(delay = DEBOUNCE_MS): void {
  if (scheduled) clearTimeout(scheduled)
  scheduled = setTimeout(() => {
    scheduled = null
    void runSync('mutation')
  }, delay)
}

/**
 * Network-regain and app-resume triggers.
 * Returns a cleanup function; safe to call twice (React StrictMode).
 */
export function startSyncTriggers(): () => void {
  if (triggersInstalled) return () => {}
  triggersInstalled = true

  const onOnline = () => scheduleSync(500)
  const onOffline = () => useSyncStore.getState().setOffline()
  const onVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync(1_000)
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    triggersInstalled = false
  }
}

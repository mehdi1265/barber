/**
 * Shared types for the sync engine.
 *
 * The engine talks to the cloud through the small `SyncClient` interface so
 * push/pull logic can be exercised against a fake in tests without a Supabase
 * project, and so the real adapter can be loaded lazily (the Supabase client
 * throws at import time when environment variables are missing).
 */

export type RemoteRow = Record<string, unknown>

/** Tables that exist both locally and on the server. */
export type SyncTable =
  | 'profiles'
  | 'customers'
  | 'services'
  | 'appointments'
  | 'appointment_services'
  | 'visits'
  | 'visit_services'
  | 'payments'
  | 'expenses'
  | 'color_formulas'
  | 'color_formula_items'
  | 'customer_photos'

export interface SelectOptions {
  /** Only rows with `updated_at` strictly greater than this ISO timestamp. */
  since?: string
  limit: number
  offset: number
}

export interface PhotoUpload {
  userId: string
  photoId: string
  customerId: string | null
  /** Path inside app-private storage; read on the device, never sent to PostgREST. */
  localPath: string
}

export interface SyncClient {
  upsert(table: SyncTable, rows: RemoteRow[]): Promise<void>
  deleteByIds(table: SyncTable, ids: string[]): Promise<void>
  select(table: SyncTable, options: SelectOptions): Promise<RemoteRow[]>
  /** Uploads local bytes and returns the remote storage path. */
  uploadPhoto?(upload: PhotoUpload): Promise<string>
  /** Removes the remote object after a tombstone. */
  deletePhoto?(storagePath: string): Promise<void>
}

export type RemoteErrorKind = 'auth' | 'terminal' | 'retryable'

/**
 * A rejected cloud request, carrying the HTTP status when one is known.
 *
 * Classification:
 * - 401 → `auth`: the whole run stops; the session must be refreshed.
 * - 408/429 → `retryable`: throttling or transient timeout.
 * - other 4xx → `terminal`: retrying the same row cannot succeed.
 * - 5xx / unknown (network failure) → `retryable`.
 */
export class RemoteError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'RemoteError'
    this.status = status
  }

  get kind(): RemoteErrorKind {
    if (this.status === 401) return 'auth'
    if (this.status === 408 || this.status === 429) return 'retryable'
    if (this.status !== null && this.status >= 400 && this.status < 500) return 'terminal'
    return 'retryable'
  }
}

export interface PushResult {
  pushed: number
  /** Rows that failed but remain retryable. */
  retryable: number
  /** Rows marked as permanently failed. */
  terminal: number
  /** The run stopped after a 401; remaining rows stay pending. */
  stoppedForAuth: boolean
}

export interface PullResult {
  pulled: number
  /** Remote rows skipped because the local copy has a queued operation. */
  conflicts: number
  full: boolean
  cursor: string | null
}

export type SyncReason = 'startup' | 'mutation' | 'online' | 'resume' | 'manual'

export interface SyncOutcome {
  ran: boolean
  pushed: number
  pulled: number
  pending: number
  conflicts: number
  error: string | null
}

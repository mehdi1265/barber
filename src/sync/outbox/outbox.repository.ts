/**
 * Sync Outbox repository.
 * Every mutating operation writes an entry here so the SyncEngine can
 * replay it to Supabase when connectivity is restored.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { SyncOutbox, OutboxOperation, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'

type AddOutboxInput = {
  entity_type: string
  entity_id: UUID
  operation: OutboxOperation
  payload: string
  /** Optional idempotency key; generated when omitted */
  client_op_id?: string
}

/**
 * Enqueues one row for sync.
 * `client_op_id` is unique; re-enqueueing the same key is a no-op so a
 * retried user action cannot create duplicate operations.
 */
export async function addToOutbox(db: SQLiteDBConnection, input: AddOutboxInput): Promise<void> {
  const id = generateUUID()
  const now = nowISO()
  const clientOpId = input.client_op_id ?? generateUUID()
  await db.run(
    `INSERT OR IGNORE INTO sync_outbox
      (id, entity_type, entity_id, operation, payload, client_op_id, created_at, attempt_count, last_error, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending')`,
    [id, input.entity_type, input.entity_id, input.operation, input.payload, clientOpId, now]
  )
}

export async function getPendingOutbox(db: SQLiteDBConnection, limit = 50): Promise<SyncOutbox[]> {
  const result = await db.query(
    `SELECT * FROM sync_outbox
     WHERE status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit]
  )
  return (result.values as SyncOutbox[]) ?? []
}

/** Rows the push worker may still attempt, excluding exhausted ones. */
export async function getRetryableOutbox(
  db: SQLiteDBConnection,
  limit: number,
  maxAttempts: number
): Promise<SyncOutbox[]> {
  const result = await db.query(
    `SELECT * FROM sync_outbox
     WHERE status IN ('pending', 'failed') AND attempt_count < ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [maxAttempts, limit]
  )
  return (result.values as SyncOutbox[]) ?? []
}

/** Number of operations not yet accepted by the server (pending or failed). */
export async function countPendingOutbox(db: SQLiteDBConnection): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*) as cnt FROM sync_outbox WHERE status IN ('pending', 'failed')`
  )
  return (result.values?.[0] as { cnt: number })?.cnt ?? 0
}

export async function markOutboxDone(db: SQLiteDBConnection, id: UUID): Promise<void> {
  const now = nowISO()
  await db.run(
    `UPDATE sync_outbox SET status = 'done', processed_at = ?, last_attempt_at = ? WHERE id = ?`,
    [now, now, id]
  )
}

export async function markOutboxFailed(
  db: SQLiteDBConnection,
  id: UUID,
  error: string
): Promise<void> {
  await db.run(
    `UPDATE sync_outbox
     SET status = 'failed', last_error = ?, attempt_count = attempt_count + 1, last_attempt_at = ?
     WHERE id = ?`,
    [error, nowISO(), id]
  )
}

export async function markOutboxProcessing(db: SQLiteDBConnection, id: UUID): Promise<void> {
  await db.run(`UPDATE sync_outbox SET status = 'processing', last_attempt_at = ? WHERE id = ?`, [
    nowISO(),
    id,
  ])
}

/** Marks an operation as terminally failed so it is never retried automatically. */
export async function markOutboxTerminal(
  db: SQLiteDBConnection,
  id: UUID,
  error: string,
  attempts: number
): Promise<void> {
  await db.run(
    `UPDATE sync_outbox
     SET status = 'failed', last_error = ?, attempt_count = ?, last_attempt_at = ?
     WHERE id = ?`,
    [error, attempts, nowISO(), id]
  )
}

/**
 * Puts one row back to `pending` without counting an attempt.
 * Used when the whole run stops for an expired session: the row was not
 * rejected, so it must not burn a retry.
 */
export async function markOutboxPending(db: SQLiteDBConnection, id: UUID): Promise<void> {
  await db.run(`UPDATE sync_outbox SET status = 'pending' WHERE id = ?`, [id])
}

/**
 * A crash can leave rows in `processing`. On the next start they must become
 * retryable again, otherwise the queue stalls forever.
 */
export async function resetStaleProcessing(db: SQLiteDBConnection): Promise<void> {
  await db.run(`UPDATE sync_outbox SET status = 'pending' WHERE status = 'processing'`)
}

/** True when the entity has a queued operation that has not reached the server. */
export async function hasPendingOperation(
  db: SQLiteDBConnection,
  entityId: string
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM sync_outbox
     WHERE entity_id = ? AND status IN ('pending', 'processing', 'failed')
     LIMIT 1`,
    [entityId]
  )
  return (result.values?.length ?? 0) > 0
}

/** Remove done items older than 7 days to keep the table clean */
export async function pruneOutbox(db: SQLiteDBConnection): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.run(
    `DELETE FROM sync_outbox WHERE status = 'done' AND COALESCE(processed_at, created_at) < ?`,
    [cutoff]
  )
}

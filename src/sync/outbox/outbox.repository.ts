/**
 * Sync Outbox repository.
 * Every mutating operation writes an entry here so the SyncEngine can
 * replay it to Supabase when connectivity is restored.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { SyncOutbox, OutboxOperation, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'

/** Attempt cap after which a row is terminal and never retried automatically. */
export const MAX_OUTBOX_ATTEMPTS = 5

type AddOutboxInput = {
  /** Account that owns this operation; required so rows cannot cross accounts. */
  user_id: UUID
  entity_type: string
  entity_id: UUID
  operation: OutboxOperation
  payload: string
  /** Optional idempotency key; generated when omitted */
  client_op_id?: string
}

/**
 * Enqueues one row for sync, owned by the current account.
 * `client_op_id` is unique; re-enqueueing the same key is a no-op so a
 * retried user action cannot create duplicate operations.
 */
export async function addToOutbox(db: SQLiteDBConnection, input: AddOutboxInput): Promise<void> {
  if (!input.user_id) throw new Error('addToOutbox requires user_id')
  const id = generateUUID()
  const now = nowISO()
  const clientOpId = input.client_op_id ?? generateUUID()
  await db.run(
    `INSERT OR IGNORE INTO sync_outbox
      (id, user_id, entity_type, entity_id, operation, payload, client_op_id, created_at, attempt_count, last_error, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'pending')`,
    [
      id,
      input.user_id,
      input.entity_type,
      input.entity_id,
      input.operation,
      input.payload,
      clientOpId,
      now,
    ]
  )
}

export async function getPendingOutbox(
  db: SQLiteDBConnection,
  userId: UUID,
  limit = 50
): Promise<SyncOutbox[]> {
  const result = await db.query(
    `SELECT * FROM sync_outbox
     WHERE user_id = ? AND status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT ?`,
    [userId, limit]
  )
  return (result.values as SyncOutbox[]) ?? []
}

/** Rows the push worker may still attempt, excluding exhausted ones. */
export async function getRetryableOutbox(
  db: SQLiteDBConnection,
  userId: UUID,
  limit: number,
  maxAttempts: number
): Promise<SyncOutbox[]> {
  const result = await db.query(
    `SELECT * FROM sync_outbox
     WHERE user_id = ? AND status IN ('pending', 'failed') AND attempt_count < ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [userId, maxAttempts, limit]
  )
  return (result.values as SyncOutbox[]) ?? []
}

/** Number of operations not yet accepted by the server (pending or failed). */
export async function countPendingOutbox(db: SQLiteDBConnection, userId: UUID): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*) as cnt FROM sync_outbox
     WHERE user_id = ? AND status IN ('pending', 'failed')`,
    [userId]
  )
  return (result.values?.[0] as { cnt: number })?.cnt ?? 0
}

/**
 * Operations that can still reach the server.
 *
 * A `failed` row whose attempts reached the cap is terminal (permanent 4xx, or
 * five failed retries) and will never be picked up again. Counting it as
 * unsynced would block a local-data wipe forever, so it is excluded here.
 */
export async function countUnsyncedOutbox(db: SQLiteDBConnection, userId: UUID): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*) as cnt FROM sync_outbox
     WHERE user_id = ?
       AND (status IN ('pending', 'processing')
         OR (status = 'failed' AND attempt_count < ?))`,
    [userId, MAX_OUTBOX_ATTEMPTS]
  )
  return Number((result.values?.[0] as { cnt: number | string })?.cnt ?? 0)
}

export async function markOutboxDone(
  db: SQLiteDBConnection,
  userId: UUID,
  id: UUID
): Promise<void> {
  const now = nowISO()
  await db.run(
    `UPDATE sync_outbox SET status = 'done', processed_at = ?, last_attempt_at = ?
     WHERE id = ? AND user_id = ?`,
    [now, now, id, userId]
  )
}

export async function markOutboxFailed(
  db: SQLiteDBConnection,
  userId: UUID,
  id: UUID,
  error: string
): Promise<void> {
  await db.run(
    `UPDATE sync_outbox
     SET status = 'failed', last_error = ?, attempt_count = attempt_count + 1, last_attempt_at = ?
     WHERE id = ? AND user_id = ?`,
    [error, nowISO(), id, userId]
  )
}

export async function markOutboxProcessing(
  db: SQLiteDBConnection,
  userId: UUID,
  id: UUID
): Promise<void> {
  await db.run(
    `UPDATE sync_outbox SET status = 'processing', last_attempt_at = ?
     WHERE id = ? AND user_id = ?`,
    [nowISO(), id, userId]
  )
}

/** Marks an operation as terminally failed so it is never retried automatically. */
export async function markOutboxTerminal(
  db: SQLiteDBConnection,
  userId: UUID,
  id: UUID,
  error: string,
  attempts: number
): Promise<void> {
  await db.run(
    `UPDATE sync_outbox
     SET status = 'failed', last_error = ?, attempt_count = ?, last_attempt_at = ?
     WHERE id = ? AND user_id = ?`,
    [error, attempts, nowISO(), id, userId]
  )
}

/**
 * Puts one row back to `pending` without counting an attempt.
 * Used when the whole run stops for an expired session: the row was not
 * rejected, so it must not burn a retry.
 */
export async function markOutboxPending(
  db: SQLiteDBConnection,
  userId: UUID,
  id: UUID
): Promise<void> {
  await db.run(`UPDATE sync_outbox SET status = 'pending' WHERE id = ? AND user_id = ?`, [
    id,
    userId,
  ])
}

/**
 * A crash can leave rows in `processing`. On the next start they must become
 * retryable again, otherwise the queue stalls forever. Only the current
 * account's rows are touched.
 */
export async function resetStaleProcessing(db: SQLiteDBConnection, userId: UUID): Promise<void> {
  await db.run(
    `UPDATE sync_outbox SET status = 'pending' WHERE status = 'processing' AND user_id = ?`,
    [userId]
  )
}

/** True when the entity has a queued operation that has not reached the server. */
export async function hasPendingOperation(
  db: SQLiteDBConnection,
  userId: UUID,
  entityId: string
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM sync_outbox
     WHERE user_id = ? AND entity_id = ? AND status IN ('pending', 'processing', 'failed')
     LIMIT 1`,
    [userId, entityId]
  )
  return (result.values?.length ?? 0) > 0
}

/** Remove done items older than 7 days to keep the table clean */
export async function pruneOutbox(db: SQLiteDBConnection, userId: UUID): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.run(
    `DELETE FROM sync_outbox
     WHERE user_id = ? AND status = 'done' AND COALESCE(processed_at, created_at) < ?`,
    [userId, cutoff]
  )
}

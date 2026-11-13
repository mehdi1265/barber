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

/** Remove done items older than 7 days to keep the table clean */
export async function pruneOutbox(db: SQLiteDBConnection): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.run(
    `DELETE FROM sync_outbox WHERE status = 'done' AND COALESCE(processed_at, created_at) < ?`,
    [cutoff]
  )
}

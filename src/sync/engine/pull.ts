/**
 * Pull worker: merges cloud rows into local SQLite.
 *
 * Tables are read in foreign-key-safe order. Every row is upserted by `id`, so
 * an interrupted pull can simply run again without duplicating anything.
 *
 * Conflict policy: a remote row is skipped while the same entity still has an
 * operation in the outbox (pending, processing, or failed). Local edits win
 * until they have reached the server; after that the cloud copy wins.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { withTransaction } from '@database/sqlite/transaction'
import { generateUUID } from '@shared/utils/helpers'
import { hasPendingOperation } from '@sync/outbox/outbox.repository'
import { normalizeRemoteRow } from './payload'
import type { PullResult, RemoteRow, SyncClient, SyncTable } from './sync.types'

/** Parents before children while reading: a child never references a missing parent. */
export const PULL_ORDER: readonly SyncTable[] = [
  'profiles',
  'customers',
  'services',
  'appointments',
  'appointment_services',
  'visits',
  'visit_services',
  'payments',
  'expenses',
  'color_formulas',
  'color_formula_items',
  'customer_photos',
]

/**
 * Children before parents while deleting: SQLite FKs without ON DELETE CASCADE
 * (payments→visits, color_formulas→visits, *_services→services) reject a parent
 * delete while a child still exists.
 */
export const DELETE_ORDER: readonly SyncTable[] = [
  'color_formula_items',
  'visit_services',
  'payments',
  'appointment_services',
  'color_formulas',
  'visits',
  'services',
]

export const PULL_PAGE_SIZE = 500
/** Re-read a window before the cursor to cover clock skew and in-flight writes. */
export const CURSOR_OVERLAP_MS = 5 * 60 * 1000

interface PendingDelete {
  table: SyncTable
  id: string
  updatedAt: string
}

type MergeOutcome =
  | { kind: 'merged' }
  | { kind: 'skipped' }
  | { kind: 'conflict' }
  | { kind: 'tombstone'; deletion: PendingDelete }

async function localColumns(db: SQLiteDBConnection, table: SyncTable): Promise<Set<string>> {
  const result = await db.query('SELECT name FROM pragma_table_info(?)', [table])
  return new Set((result.values ?? []).map(row => String((row as { name: unknown }).name)))
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function laterIso(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current
  if (!current) return candidate
  return Date.parse(candidate) > Date.parse(current) ? candidate : current
}

const DATA_TABLES: readonly SyncTable[] = [
  'customers',
  'services',
  'appointments',
  'visits',
  'payments',
  'expenses',
  'color_formulas',
  'customer_photos',
]

/** A wiped device must restore everything, even if a cursor somehow survived. */
async function hasLocalData(db: SQLiteDBConnection, userId: string): Promise<boolean> {
  for (const table of DATA_TABLES) {
    const result = await db.query(`SELECT 1 FROM ${table} WHERE user_id = ? LIMIT 1`, [userId])
    if ((result.values?.length ?? 0) > 0) return true
  }
  return false
}

async function mergeRow(
  db: SQLiteDBConnection,
  table: SyncTable,
  row: RemoteRow,
  userId: string,
  columns: Set<string>
): Promise<MergeOutcome> {
  const normalized = normalizeRemoteRow(table, row)
  const id = normalized.id
  if (typeof id !== 'string' || !id) return { kind: 'skipped' }

  // RLS should already guarantee this, but a session that changed mid-run can
  // return another account's rows. Never stamp a foreign row with this
  // account's ownership.
  const remoteOwner = normalized.user_id
  if (typeof remoteOwner === 'string' && remoteOwner && remoteOwner !== userId) {
    return { kind: 'skipped' }
  }

  if (await hasPendingOperation(db, userId, id)) return { kind: 'conflict' }

  const deletedAt = toIso(normalized.deleted_at)
  // Tables without a local `deleted_at` column cannot store a tombstone; the
  // row is removed instead. The delete itself waits until every table has been
  // read (child→parent) so FK-restricted rows never block the pull.
  if (deletedAt && !columns.has('deleted_at')) {
    const local = await db.query(
      `SELECT updated_at FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    )
    const localRow = local.values?.[0] as { updated_at?: string | null } | undefined
    if (!localRow) return { kind: 'skipped' }

    const localUpdatedAt = toIso(localRow.updated_at)
    // An edit that itself has not reached the queue is newer than the delete;
    // it wins and is reported instead of being silently destroyed.
    if (localUpdatedAt && Date.parse(localUpdatedAt) > Date.parse(deletedAt)) {
      return { kind: 'conflict' }
    }

    return { kind: 'tombstone', deletion: { table, id, updatedAt: deletedAt } }
  }

  // RLS already limits rows to the signed-in user; forcing the local owner
  // keeps a malformed payload from writing a foreign `user_id`.
  normalized.user_id = userId

  const insertColumns = Object.keys(normalized).filter(column => columns.has(column))
  if (!insertColumns.includes('id')) return { kind: 'skipped' }

  const placeholders = insertColumns.map(() => '?').join(', ')
  const updates = insertColumns
    .filter(column => column !== 'id')
    .map(column => `${column} = excluded.${column}`)
  // A colliding id must never transfer an existing local row to another
  // account (hard-deleted rows can free an id for reuse on the server).
  // A newer local tombstone also wins: a stale server copy must not
  // resurrect a row this device already deleted.
  const tombstoneGuard = columns.has('deleted_at')
    ? ` AND NOT (deleted_at IS NOT NULL
                AND (excluded.deleted_at IS NULL OR excluded.deleted_at = '')
                AND excluded.updated_at < deleted_at)`
    : ''
  const conflictClause = updates.length
    ? `ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
       WHERE user_id = excluded.user_id${tombstoneGuard}`
    : 'ON CONFLICT(id) DO NOTHING'

  const result = await db.run(
    `INSERT INTO ${table} (${insertColumns.join(', ')})
     VALUES (${placeholders})
     ${conflictClause}`,
    insertColumns.map(column => normalized[column] ?? null)
  )

  return changedRows(result) > 0 ? { kind: 'merged' } : { kind: 'conflict' }
}

/** `run` reports changes as a number (test harness) or `{ changes }` (Capacitor). */
function changedRows(result: unknown): number {
  const changes = (result as { changes?: number | { changes?: number } } | undefined)?.changes
  if (typeof changes === 'number') return changes
  if (changes && typeof changes === 'object' && typeof changes.changes === 'number') {
    return changes.changes
  }
  return 0
}

/**
 * Applies collected tombstones in one transaction, youngest relation first.
 * A row that gained a queued operation or a newer timestamp since phase 1 is
 * left untouched and reported as a conflict.
 */
async function applyDeletions(
  db: SQLiteDBConnection,
  userId: string,
  deletions: readonly PendingDelete[]
): Promise<{ deleted: number; conflicts: number }> {
  let deleted = 0
  let conflicts = 0
  if (deletions.length === 0) return { deleted, conflicts }

  await withTransaction(db, async () => {
    for (const table of DELETE_ORDER) {
      for (const item of deletions) {
        if (item.table !== table) continue

        if (await hasPendingOperation(db, userId, item.id)) {
          conflicts += 1
          continue
        }

        try {
          const result = await db.run(
            `DELETE FROM ${table}
             WHERE id = ? AND user_id = ? AND (updated_at IS NULL OR updated_at <= ?)`,
            [item.id, userId, item.updatedAt]
          )
          if (changedRows(result) > 0) deleted += 1
          else conflicts += 1
        } catch {
          // A surviving child row (FK without CASCADE) means the delete cannot
          // be applied yet. Keep the row and let the next pull retry.
          conflicts += 1
        }
      }
    }
  })

  return { deleted, conflicts }
}

async function localPhotoPath(
  db: SQLiteDBConnection,
  userId: string,
  photoId: string
): Promise<string | null> {
  const result = await db.query(
    `SELECT local_path FROM customer_photos WHERE id = ? AND user_id = ? LIMIT 1`,
    [photoId, userId]
  )
  const path = (result.values?.[0] as { local_path?: unknown } | undefined)?.local_path
  return typeof path === 'string' && path ? path : null
}

export interface PullOptions {
  db: SQLiteDBConnection
  client: SyncClient
  userId: string
  /** Ignore the stored cursor and fetch the full history. */
  full?: boolean
  pageSize?: number
  overlapMs?: number
  now?: () => Date
  /**
   * Returns false once the signed-in account no longer matches `userId`.
   * The run stops before merging a page fetched under another session and
   * without advancing the stored cursor.
   */
  isAccountCurrent?: () => boolean
}

export async function pullFromCloud({
  db,
  client,
  userId,
  full: forceFull = false,
  pageSize = PULL_PAGE_SIZE,
  overlapMs = CURSOR_OVERLAP_MS,
  now = () => new Date(),
  isAccountCurrent = () => true,
}: PullOptions): Promise<PullResult> {
  const state = await db.query('SELECT last_pull_at, cursor_user_id FROM sync_state WHERE id = 1')
  const stateRow = state.values?.[0] as
    | { last_pull_at: string | null; cursor_user_id: string | null }
    | undefined
  // Another account's cursor must never truncate this account's first pull.
  const lastPullAt = stateRow?.cursor_user_id === userId ? stateRow.last_pull_at : null

  const full = forceFull || !lastPullAt || !(await hasLocalData(db, userId))
  const since =
    !full && lastPullAt ? new Date(Date.parse(lastPullAt) - overlapMs).toISOString() : undefined

  let pulled = 0
  let conflicts = 0
  let newest: string | null = null
  const deletions: PendingDelete[] = []
  const photoFiles: string[] = []

  // An aborted run keeps the previous cursor: the next run re-reads the same
  // window and no row can be skipped.
  const stopped = (): PullResult => ({ pulled, conflicts, full, cursor: lastPullAt })

  if (!isAccountCurrent()) return stopped()

  for (const table of PULL_ORDER) {
    if (!isAccountCurrent()) return stopped()

    const columns = await localColumns(db, table)
    let after: { updatedAt: string; id: string } | undefined

    for (;;) {
      if (!isAccountCurrent()) return stopped()

      const rows = await client.select(table, { since, limit: pageSize, after })

      // The request may have been answered by a session that replaced this
      // account mid-flight; those rows must not be merged.
      if (!isAccountCurrent()) return stopped()

      for (const row of rows) {
        newest = laterIso(newest, toIso(row.updated_at))

        // A photo tombstone hides the row; the file on this device is unlinked
        // only after the database transaction commits.
        if (table === 'customer_photos' && toIso(row.deleted_at)) {
          const photoId = typeof row.id === 'string' ? row.id : ''
          if (photoId) {
            const path = await localPhotoPath(db, userId, photoId)
            if (path) photoFiles.push(path)
          }
        }

        const outcome = await mergeRow(db, table, row, userId, columns)
        if (outcome.kind === 'merged') pulled += 1
        else if (outcome.kind === 'conflict') conflicts += 1
        else if (outcome.kind === 'tombstone') deletions.push(outcome.deletion)
      }

      const last = rows.at(-1)
      const lastUpdatedAt = toIso(last?.updated_at)
      const lastId = typeof last?.id === 'string' ? last.id : null
      if (rows.length < pageSize || !lastUpdatedAt || !lastId) break
      after = { updatedAt: lastUpdatedAt, id: lastId }
    }
  }

  const applied = await applyDeletions(db, userId, deletions)
  pulled += applied.deleted
  conflicts += applied.conflicts

  const cursor = laterIso(newest, lastPullAt) ?? now().toISOString()

  await db.run(
    `UPDATE sync_state
     SET last_pull_at = ?, cursor_user_id = ?, device_id = COALESCE(device_id, ?)
     WHERE id = 1`,
    [cursor, userId, generateUUID()]
  )

  if (photoFiles.length > 0) {
    try {
      const { deletePhotoFile } = await import('@features/photos/photo-storage')
      for (const path of photoFiles) {
        try {
          await deletePhotoFile(path)
        } catch {
          // A missing or already-unlinked file is not a sync failure.
        }
      }
    } catch {
      // Storage plugin unavailable (web/test): the row is still hidden.
    }
  }

  return { pulled, conflicts, full, cursor }
}

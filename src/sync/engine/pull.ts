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
import { generateUUID } from '@shared/utils/helpers'
import { hasPendingOperation } from '@sync/outbox/outbox.repository'
import { normalizeRemoteRow } from './payload'
import type { PullResult, RemoteRow, SyncClient, SyncTable } from './sync.types'

/** Parents before children: a child row never references a missing parent. */
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

export const PULL_PAGE_SIZE = 500
/** Re-read a window before the cursor to cover clock skew and in-flight writes. */
export const CURSOR_OVERLAP_MS = 5 * 60 * 1000

type MergeOutcome = 'merged' | 'skipped' | 'conflict'

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
async function hasLocalData(db: SQLiteDBConnection): Promise<boolean> {
  for (const table of DATA_TABLES) {
    const result = await db.query(`SELECT 1 FROM ${table} LIMIT 1`)
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
  if (typeof id !== 'string' || !id) return 'skipped'

  if (await hasPendingOperation(db, id)) return 'conflict'

  // RLS already limits rows to the signed-in user; forcing the local owner
  // keeps a malformed payload from writing a foreign `user_id`.
  normalized.user_id = userId

  const insertColumns = Object.keys(normalized).filter(column => columns.has(column))
  if (!insertColumns.includes('id')) return 'skipped'

  const placeholders = insertColumns.map(() => '?').join(', ')
  const updates = insertColumns
    .filter(column => column !== 'id')
    .map(column => `${column} = excluded.${column}`)
  const conflictClause = updates.length
    ? `ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
    : 'ON CONFLICT(id) DO NOTHING'

  await db.run(
    `INSERT INTO ${table} (${insertColumns.join(', ')})
     VALUES (${placeholders})
     ${conflictClause}`,
    insertColumns.map(column => normalized[column] ?? null)
  )

  return 'merged'
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
}

export async function pullFromCloud({
  db,
  client,
  userId,
  full: forceFull = false,
  pageSize = PULL_PAGE_SIZE,
  overlapMs = CURSOR_OVERLAP_MS,
  now = () => new Date(),
}: PullOptions): Promise<PullResult> {
  const state = await db.query('SELECT last_pull_at FROM sync_state WHERE id = 1')
  const lastPullAt =
    (state.values?.[0] as { last_pull_at: string | null } | undefined)?.last_pull_at ?? null

  const full = forceFull || !lastPullAt || !(await hasLocalData(db))
  const since =
    !full && lastPullAt ? new Date(Date.parse(lastPullAt) - overlapMs).toISOString() : undefined

  let pulled = 0
  let conflicts = 0
  let newest: string | null = null

  for (const table of PULL_ORDER) {
    const columns = await localColumns(db, table)
    let offset = 0

    for (;;) {
      const rows = await client.select(table, { since, limit: pageSize, offset })

      for (const row of rows) {
        newest = laterIso(newest, toIso(row.updated_at))
        const outcome = await mergeRow(db, table, row, userId, columns)
        if (outcome === 'merged') pulled += 1
        else if (outcome === 'conflict') conflicts += 1
      }

      offset += rows.length
      if (rows.length < pageSize) break
    }
  }

  const cursor = laterIso(newest, lastPullAt) ?? now().toISOString()

  await db.run(
    `UPDATE sync_state
     SET last_pull_at = ?, device_id = COALESCE(device_id, ?)
     WHERE id = 1`,
    [cursor, generateUUID()]
  )

  return { pulled, conflicts, full, cursor }
}

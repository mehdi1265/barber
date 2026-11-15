/**
 * Entity → cloud-table mapping and row conversion.
 *
 * Local SQLite stores booleans as 0/1 and keeps a few columns that must never
 * leave the device (`customer_photos.local_path`). The server stores real
 * booleans and has no local_path column, so every row is normalised on the way
 * out and on the way in.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { SyncOutbox } from '@shared/types'
import type { PhotoUpload, RemoteRow, SyncTable } from './sync.types'

export const ENTITY_TABLES = {
  profiles: 'profiles',
  customers: 'customers',
  services: 'services',
  appointments: 'appointments',
  appointment_services: 'appointment_services',
  visits: 'visits',
  visit_services: 'visit_services',
  payments: 'payments',
  expenses: 'expenses',
  color_formulas: 'color_formulas',
  color_formula_items: 'color_formula_items',
  customer_photos: 'customer_photos',
} as const satisfies Record<string, SyncTable>

export type EntityType = keyof typeof ENTITY_TABLES

/**
 * Tables whose server schema has `deleted_at`; deletes are tombstones.
 * Every synced data table is soft-deleted on the server (migration 005), so a
 * delete is discoverable by other devices and cannot be resurrected by an
 * offline queue that never saw it. `profiles` is never deleted.
 */
export const SOFT_DELETE_TABLES: ReadonlySet<SyncTable> = new Set<SyncTable>([
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
])

/** Local-only columns that must be stripped before a row is pushed. */
const LOCAL_ONLY_COLUMNS: Partial<Record<SyncTable, readonly string[]>> = {
  customer_photos: ['local_path'],
}

/** SQLite INTEGER flags that become real booleans on the server. */
const BOOLEAN_COLUMNS: Partial<Record<SyncTable, readonly string[]>> = {
  services: ['is_active'],
  visits: ['is_quick_sale'],
  customer_photos: ['consent_given'],
}

/** Server NUMERIC columns arrive as strings through PostgREST. */
const NUMERIC_COLUMNS: Partial<Record<SyncTable, readonly string[]>> = {
  services: ['default_price', 'suggested_duration_minutes'],
  appointments: ['duration_minutes'],
  appointment_services: ['price', 'duration_minutes'],
  visit_services: ['quantity', 'unit_price', 'discount_amount', 'line_total', 'duration_minutes'],
  payments: ['amount'],
  expenses: ['amount'],
  color_formulas: ['oxidant_percent', 'processing_minutes'],
  color_formula_items: ['amount'],
}

const TIMESTAMP_SUFFIX = /_at$/

function isTable(value: string): value is SyncTable {
  return value in ENTITY_TABLES
}

export function tableFor(entityType: string): SyncTable | null {
  return isTable(entityType) ? ENTITY_TABLES[entityType] : null
}

function stripLocalColumns(table: SyncTable, row: RemoteRow): RemoteRow {
  const local = LOCAL_ONLY_COLUMNS[table]
  if (!local) return { ...row }

  const copy = { ...row }
  for (const column of local) delete copy[column]
  return copy
}

function toServerBoolean(value: unknown): unknown {
  if (value === 0 || value === 1) return value === 1
  if (value === '0' || value === '1') return value === '1'
  return value
}

/** Converts a local row to the JSON shape the cloud expects. */
export function toRemoteRow(table: SyncTable, row: RemoteRow): RemoteRow {
  const result = stripLocalColumns(table, row)

  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    if (column in result) result[column] = toServerBoolean(result[column])
  }

  return result
}

function toSqliteBoolean(value: unknown): unknown {
  if (value === true) return 1
  if (value === false) return 0
  return value
}

/** Converts a cloud row to the local SQLite shape (booleans/numbers/ISO dates). */
export function normalizeRemoteRow(table: SyncTable, row: RemoteRow): RemoteRow {
  const result = stripLocalColumns(table, row)

  for (const column of BOOLEAN_COLUMNS[table] ?? []) {
    if (column in result) result[column] = toSqliteBoolean(result[column])
  }

  for (const column of NUMERIC_COLUMNS[table] ?? []) {
    const value = result[column]
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) result[column] = parsed
    }
  }

  for (const column of Object.keys(result)) {
    const value = result[column]
    if (TIMESTAMP_SUFFIX.test(column) && typeof value === 'string' && value) {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) result[column] = parsed.toISOString()
    }
  }

  return result
}

export interface UpsertPush {
  table: SyncTable
  mode: 'upsert'
  row: RemoteRow
  /** Present when a photo still has local bytes waiting to be uploaded. */
  photo?: PhotoUpload
}

export interface DeletePush {
  table: SyncTable
  mode: 'delete'
  id: string
}

export type PushEntity = UpsertPush | DeletePush

async function findLocalRow(
  db: SQLiteDBConnection,
  table: SyncTable,
  id: string,
  userId: string
): Promise<RemoteRow | null> {
  const result = await db.query(`SELECT * FROM ${table} WHERE id = ? AND user_id = ? LIMIT 1`, [
    id,
    userId,
  ])
  return (result.values?.[0] as RemoteRow) ?? null
}

/**
 * Builds the exact operation to send for one outbox entry.
 *
 * Payloads are sometimes partial (`{ id, status, updated_at }` for a status
 * change, `{ id, deleted_at }` for a soft delete). For inserts/updates the
 * current local row is merged underneath the payload so the server receives a
 * complete row, which also makes the upsert safe if the original insert never
 * reached the server. A delete becomes a tombstone whose `updated_at` is
 * pushed forward, so incremental pulls on other devices can see it.
 */
export async function buildPushEntity(
  db: SQLiteDBConnection,
  entry: Pick<SyncOutbox, 'entity_type' | 'entity_id' | 'operation' | 'payload'>,
  userId: string
): Promise<PushEntity> {
  const table = tableFor(entry.entity_type)
  if (!table) throw new Error(`Unsupported sync entity type: ${entry.entity_type}`)

  let parsed: RemoteRow
  try {
    parsed = JSON.parse(entry.payload) as RemoteRow
  } catch {
    throw new Error(`Invalid outbox payload JSON for ${entry.entity_type} ${entry.entity_id}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Outbox payload is not an object for ${entry.entity_type} ${entry.entity_id}`)
  }

  const parsedId = parsed.id
  const id = typeof parsedId === 'string' && parsedId ? parsedId : entry.entity_id

  if (entry.operation === 'delete' && !SOFT_DELETE_TABLES.has(table)) {
    return { table, mode: 'delete', id }
  }

  const local = await findLocalRow(db, table, id, userId)
  const merged: RemoteRow = { ...(local ?? {}), ...parsed }

  merged.id = id
  merged.user_id = merged.user_id ?? userId

  if (entry.operation === 'delete') {
    // A tombstone without a fresh timestamp is never discoverable by an
    // incremental pull: another device whose cursor is already past the row's
    // last edit would never see the delete and could resurrect the row.
    const deletedAt =
      typeof merged.deleted_at === 'string' && merged.deleted_at
        ? merged.deleted_at
        : new Date().toISOString()
    merged.deleted_at = deletedAt
    const current = typeof merged.updated_at === 'string' ? merged.updated_at : null
    // Keep a newer local edit (resurrection by an offline device) intact, but
    // never let the tombstone fall behind its own deletion time.
    merged.updated_at =
      current && !Number.isNaN(Date.parse(current)) && Date.parse(current) > Date.parse(deletedAt)
        ? current
        : deletedAt
  }

  let photo: PhotoUpload | undefined
  if (table === 'customer_photos') {
    const localPath = merged.local_path
    if (entry.operation !== 'delete' && typeof localPath === 'string' && localPath) {
      photo = {
        userId,
        photoId: id,
        customerId: typeof merged.customer_id === 'string' ? merged.customer_id : null,
        localPath,
      }
    }
  }

  return { table, mode: 'upsert', row: toRemoteRow(table, merged), photo }
}

/** True when deletes for this table are tombstones rather than hard deletes. */
export function isSoftDelete(table: SyncTable): boolean {
  return SOFT_DELETE_TABLES.has(table)
}

/**
 * Local-data wipe for handing a device to another account.
 *
 * Wipes only the signed-in account's business rows, its outbox, its pull
 * cursor, and its local photo files. `schema_migrations`, `profiles`, and any
 * other account's rows are never touched.
 *
 * The wipe is refused while outbox rows that can still reach the server exist:
 * those rows are the only copy of that work until the server accepts them.
 * Terminal failures (permanent 4xx / attempt cap) will never be retried, so
 * they do not block the wipe.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getDatabase } from '@database/sqlite/database'
import { withTransaction } from '@database/sqlite/transaction'
import { countUnsyncedOutbox } from '@sync/outbox/outbox.repository'
import { deleteUserPhotoFiles } from '@features/photos/photo-storage'

export class PendingOutboxError extends Error {
  readonly pending: number

  constructor(pending: number) {
    super(`Cannot delete local data while ${pending} operation(s) are unsynced`)
    this.name = 'PendingOutboxError'
    this.pending = pending
  }
}

// Children before parents. `visits.appointment_id` has no ON DELETE action,
// so visits must go before appointments.
const WIPE_ORDER = [
  'color_formula_items',
  'color_formulas',
  'customer_photos',
  'visit_services',
  'payments',
  'visits',
  'appointment_services',
  'appointments',
  'expenses',
  'customers',
  'services',
] as const

/**
 * Deletes one account's local business rows. Callers should wrap it in
 * `withTransaction`; `deleteLocalAccountData` does.
 */
export async function wipeAccountRows(db: SQLiteDBConnection, userId: string): Promise<void> {
  if (!userId) throw new Error('wipeAccountRows requires user_id')

  const unsynced = await countUnsyncedOutbox(db, userId)
  if (unsynced > 0) throw new PendingOutboxError(unsynced)

  for (const table of WIPE_ORDER) {
    await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId])
  }
  await db.run(`DELETE FROM sync_outbox WHERE user_id = ?`, [userId])
  await db.run(
    `UPDATE sync_state SET last_pull_at = NULL, cursor_user_id = NULL WHERE cursor_user_id = ?`,
    [userId]
  )
}

export interface LocalDataWipeDeps {
  db?: SQLiteDBConnection
  deletePhotoFiles?: (userId: string) => Promise<void>
}

export async function deleteLocalAccountData(
  userId: string,
  deps: LocalDataWipeDeps = {}
): Promise<void> {
  if (!userId) throw new Error('deleteLocalAccountData requires user_id')

  const db = deps.db ?? (await getDatabase())
  await withTransaction(db, () => wipeAccountRows(db, userId))
  await (deps.deletePhotoFiles ?? deleteUserPhotoFiles)(userId)
}

/**
 * Transaction helper for SQLite write operations.
 *
 * Repositories must use this instead of calling beginTransaction directly so
 * that a failure anywhere inside the unit of work rolls back every statement,
 * including the outbox row.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

const activeTransactions = new WeakSet<SQLiteDBConnection>()

/**
 * Runs `fn` inside a single transaction.
 * Nested calls on the same connection are rejected: SQLite has no real
 * savepoint-free nesting here, and silent partial commits are worse than a
 * loud failure.
 */
export async function withTransaction<T>(db: SQLiteDBConnection, fn: () => Promise<T>): Promise<T> {
  if (activeTransactions.has(db)) {
    throw new Error('Nested transactions are not supported')
  }

  activeTransactions.add(db)
  try {
    await db.beginTransaction()
    try {
      const result = await fn()
      await db.commitTransaction()
      return result
    } catch (error) {
      try {
        await db.rollbackTransaction()
      } catch {
        // Rollback failure must not hide the original error.
      }
      throw error
    }
  } finally {
    activeTransactions.delete(db)
  }
}

/**
 * Transaction helper for SQLite write operations.
 *
 * Repositories must use this instead of calling beginTransaction directly so
 * that a failure anywhere inside the unit of work rolls back every statement,
 * including the outbox row.
 *
 * The native plugin defaults `run()`/`execute()` to `transaction: true`, and
 * its `beginTransaction()` throws "Already in transaction" when one is already
 * open. A statement issued on the raw connection inside this helper would
 * therefore fail every time on Android/iOS, so the callback receives a scoped
 * connection that disables the per-statement transaction.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

/** Connection surface available inside an open transaction. */
export type TxConnection = Pick<SQLiteDBConnection, 'run' | 'execute' | 'executeSet' | 'query'>

const activeTransactions = new WeakSet<SQLiteDBConnection>()

function scopeStatements(db: SQLiteDBConnection): TxConnection {
  return {
    run: (statement, values) => db.run(statement, values, false),
    execute: statements => db.execute(statements, false),
    executeSet: set => db.executeSet(set, false),
    query: (statement, values) => db.query(statement, values),
  }
}

/**
 * Runs `fn` inside a single transaction.
 * Nested calls on the same connection are rejected: SQLite has no real
 * savepoint-free nesting here, and silent partial commits are worse than a
 * loud failure.
 */
export async function withTransaction<T>(
  db: SQLiteDBConnection,
  fn: (tx: TxConnection) => Promise<T>
): Promise<T> {
  if (activeTransactions.has(db)) {
    throw new Error('Nested transactions are not supported')
  }

  activeTransactions.add(db)
  try {
    await db.beginTransaction()
    try {
      const result = await fn(scopeStatements(db))
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

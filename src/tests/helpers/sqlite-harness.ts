/**
 * Real-SQLite test harness.
 *
 * Uses Node's built-in `node:sqlite` (Node 22.5+) so repository and outbox
 * tests exercise the actual schema and SQL instead of hand-written mocks.
 *
 * The `run`/`execute`/`beginTransaction` methods reproduce the native plugin's
 * transaction rules: each statement defaults to opening its own transaction and
 * refuses to do so while one is already open ("Already in transaction"). A
 * repository that forgets to use the scoped connection inside `withTransaction`
 * therefore fails here exactly as it would on a device.
 */

import { DatabaseSync } from 'node:sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import migration001 from '@database/migrations/001_initial.sql?raw'
import migration002 from '@database/migrations/002_outbox_hardening.sql?raw'
import migration003 from '@database/migrations/003_sync_state.sql?raw'
import migration004 from '@database/migrations/004_expense_tombstones.sql?raw'
import migration005 from '@database/migrations/005_outbox_user_scope.sql?raw'
import migration006 from '@database/migrations/006_sync_cursor_user.sql?raw'

export interface TestDbOptions {
  /** Throw before executing the Nth `run` call (1-based) */
  failOnRun?: number
  /** Apply only migration 001, simulating a database created before T03 */
  skipMigration002?: boolean
  /** Start with an empty database so the migration runner can be tested */
  skipMigrations?: boolean
}

export interface OutboxRow {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  operation: string
  payload: string
  client_op_id: string | null
  status: string
  attempt_count: number
  last_error: string | null
  processed_at: string | null
  last_attempt_at: string | null
}

export interface TestDb {
  db: SQLiteDBConnection
  raw: DatabaseSync
  runCount: () => number
  countRows: (table: string) => number
  rows: <T = Record<string, unknown>>(table: string) => T[]
  outboxRows: () => OutboxRow[]
  exec: (sql: string) => void
}

const ALREADY_IN_TRANSACTION = 'Failed in beginTransactionAlready in transaction'

export function createTestDb(options: TestDbOptions = {}): TestDb {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  if (!options.skipMigrations) {
    raw.exec(migration001)
    if (!options.skipMigration002) {
      raw.exec(migration002)
      raw.exec(migration003)
      raw.exec(migration004)
      raw.exec(migration005)
      raw.exec(migration006)
    }
  }

  let runs = 0
  let inTransaction = false

  const begin = () => {
    if (inTransaction) throw new Error(ALREADY_IN_TRANSACTION)
    raw.exec('BEGIN')
    inTransaction = true
  }
  const commit = () => {
    if (!inTransaction) throw new Error('Failed in commitTransactionNo transaction active')
    raw.exec('COMMIT')
    inTransaction = false
  }
  const rollback = () => {
    if (inTransaction) raw.exec('ROLLBACK')
    inTransaction = false
  }

  /** Runs `fn` the way the plugin does for `transaction: true`. */
  const withImplicitTransaction = <T>(transaction: boolean, fn: () => T): T => {
    if (!transaction) return fn()
    begin()
    try {
      const value = fn()
      commit()
      return value
    } catch (error) {
      rollback()
      throw error
    }
  }

  const db = {
    execute: (sql: string, transaction = true) =>
      new Promise<void>((resolve, reject) => {
        try {
          withImplicitTransaction(transaction, () => raw.exec(sql))
          resolve()
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }),
    query: (sql: string, params: unknown[] = []) =>
      Promise.resolve({
        values: raw
          .prepare(sql)
          .all(...(params as never[]))
          .map(row => ({ ...row })),
      }),
    run: (sql: string, params: unknown[] = [], transaction = true) => {
      runs += 1
      if (options.failOnRun !== undefined && runs === options.failOnRun) {
        return Promise.reject(new Error(`injected failure on statement ${runs}`))
      }
      try {
        return Promise.resolve(
          withImplicitTransaction(transaction, () => {
            const result = raw.prepare(sql).run(...(params as never[]))
            return {
              changes: Number(result.changes),
              lastId: Number(result.lastInsertRowid),
            }
          })
        )
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
    },
    beginTransaction: () => {
      begin()
      return Promise.resolve()
    },
    commitTransaction: () => {
      commit()
      return Promise.resolve()
    },
    rollbackTransaction: () => {
      rollback()
      return Promise.resolve()
    },
  }

  const rows = <T = Record<string, unknown>>(table: string): T[] =>
    raw
      .prepare(`SELECT * FROM ${table}`)
      .all()
      .map(row => ({ ...row })) as T[]

  return {
    db: db as unknown as SQLiteDBConnection,
    raw,
    runCount: () => runs,
    countRows: (table: string) =>
      (raw.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number }).cnt,
    rows,
    outboxRows: () => rows<OutboxRow>('sync_outbox'),
    exec: (sql: string) => raw.exec(sql),
  }
}

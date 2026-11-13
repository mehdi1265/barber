/**
 * Real-SQLite test harness.
 *
 * Uses Node's built-in `node:sqlite` (Node 22.5+) so repository and outbox
 * tests exercise the actual schema and SQL instead of hand-written mocks.
 */

import { DatabaseSync } from 'node:sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import migration001 from '@database/migrations/001_initial.sql?raw'
import migration002 from '@database/migrations/002_outbox_hardening.sql?raw'
import migration003 from '@database/migrations/003_sync_state.sql?raw'
import migration004 from '@database/migrations/004_expense_tombstones.sql?raw'

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

export function createTestDb(options: TestDbOptions = {}): TestDb {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  if (!options.skipMigrations) {
    raw.exec(migration001)
    if (!options.skipMigration002) {
      raw.exec(migration002)
      raw.exec(migration003)
      raw.exec(migration004)
    }
  }

  let runs = 0

  const db = {
    execute: (sql: string) => {
      raw.exec(sql)
      return Promise.resolve()
    },
    query: (sql: string, params: unknown[] = []) =>
      Promise.resolve({
        values: raw
          .prepare(sql)
          .all(...(params as never[]))
          .map(row => ({ ...row })),
      }),
    run: (sql: string, params: unknown[] = []) => {
      runs += 1
      if (options.failOnRun !== undefined && runs === options.failOnRun) {
        return Promise.reject(new Error(`injected failure on statement ${runs}`))
      }
      const result = raw.prepare(sql).run(...(params as never[]))
      return Promise.resolve({
        changes: Number(result.changes),
        lastId: Number(result.lastInsertRowid),
      })
    },
    beginTransaction: () => {
      raw.exec('BEGIN')
      return Promise.resolve()
    },
    commitTransaction: () => {
      raw.exec('COMMIT')
      return Promise.resolve()
    },
    rollbackTransaction: () => {
      raw.exec('ROLLBACK')
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

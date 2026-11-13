import { describe, it, expect } from 'vitest'
import {
  addToOutbox,
  getPendingOutbox,
  markOutboxDone,
  markOutboxFailed,
  markOutboxProcessing,
  pruneOutbox,
} from '@sync/outbox/outbox.repository'
import { DatabaseSync } from 'node:sqlite'
import migration001 from '@database/migrations/001_initial.sql?raw'
import migration002 from '@database/migrations/002_outbox_hardening.sql?raw'
import { createTestDb } from '../helpers/sqlite-harness'
import { runMigrations } from '@database/sqlite/migrations'

const baseInput = {
  entity_type: 'customers',
  entity_id: 'entity-1',
  operation: 'insert' as const,
  payload: JSON.stringify({ id: 'entity-1' }),
}

describe('Outbox repository', () => {
  it('markOutboxDone روی SQLite واقعی کار می‌کند', async () => {
    const { db, outboxRows } = createTestDb()
    await addToOutbox(db, { ...baseInput, client_op_id: 'op-1' })

    const [row] = outboxRows()
    await markOutboxDone(db, row.id)

    const [done] = outboxRows()
    expect(done.status).toBe('done')
    expect(done.processed_at).not.toBeNull()
    expect(done.last_attempt_at).not.toBeNull()
  })

  it('همان client_op_id رکورد تکراری نمی‌سازد', async () => {
    const { db, outboxRows } = createTestDb()

    await addToOutbox(db, { ...baseInput, client_op_id: 'op-dup' })
    await addToOutbox(db, { ...baseInput, client_op_id: 'op-dup' })

    expect(outboxRows()).toHaveLength(1)
  })

  it('رکورد بدون client_op_id یکتا است', async () => {
    const { db, outboxRows } = createTestDb()

    await addToOutbox(db, baseInput)
    await addToOutbox(db, baseInput)

    expect(outboxRows()).toHaveLength(2)
    expect(new Set(outboxRows().map(r => r.client_op_id)).size).toBe(2)
  })

  it('markOutboxProcessing وضعیت و زمان تلاش را ثبت می‌کند', async () => {
    const { db, outboxRows } = createTestDb()
    await addToOutbox(db, baseInput)
    await markOutboxProcessing(db, outboxRows()[0].id)

    const [row] = outboxRows()
    expect(row.status).toBe('processing')
    expect(row.last_attempt_at).not.toBeNull()
  })

  it('markOutboxFailed تلاش و خطا را ثبت می‌کند', async () => {
    const { db, outboxRows } = createTestDb()
    await addToOutbox(db, baseInput)
    const id = outboxRows()[0].id

    await markOutboxFailed(db, id, 'network down')
    await markOutboxFailed(db, id, 'network down again')

    const [row] = outboxRows()
    expect(row.status).toBe('failed')
    expect(row.attempt_count).toBe(2)
    expect(row.last_error).toBe('network down again')
    expect(row.last_attempt_at).not.toBeNull()
  })

  it('getPendingOutbox فقط pending و failed را برمی‌گرداند', async () => {
    const { db, outboxRows } = createTestDb()
    await addToOutbox(db, { ...baseInput, client_op_id: 'a' })
    await addToOutbox(db, { ...baseInput, client_op_id: 'b' })
    await addToOutbox(db, { ...baseInput, client_op_id: 'c' })

    const ids = outboxRows().map(r => r.id)
    await markOutboxDone(db, ids[0])
    await markOutboxProcessing(db, ids[1])

    const pending = await getPendingOutbox(db)
    expect(pending.map(r => r.id)).toEqual([ids[2]])
  })

  it('pruneOutbox ردیف‌های done قدیمی را حذف می‌کند', async () => {
    const { db, outboxRows, exec } = createTestDb()
    await addToOutbox(db, baseInput)
    const id = outboxRows()[0].id
    await markOutboxDone(db, id)
    exec(`UPDATE sync_outbox SET processed_at = '2020-01-01T00:00:00.000Z' WHERE id = '${id}'`)

    await pruneOutbox(db)
    expect(outboxRows()).toHaveLength(0)
  })
})

describe('Migration 002', () => {
  it('روی دیتابیس موجود با داده‌های قبلی تمیز اعمال می‌شود', () => {
    // Simulate an installation created before T03: 001 only, with a pending row
    const raw = new DatabaseSync(':memory:')
    raw.exec(migration001)
    raw
      .prepare(
        `INSERT INTO sync_outbox
          (id, entity_type, entity_id, operation, payload, created_at, attempt_count, last_error, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 'pending')`
      )
      .run('legacy-1', 'customers', 'c-1', 'insert', '{}', '2026-01-01T00:00:00.000Z')

    raw.exec(migration002)

    const row = raw.prepare('SELECT * FROM sync_outbox WHERE id = ?').get('legacy-1') as Record<
      string,
      unknown
    >
    expect(row.status).toBe('pending')
    expect(row.processed_at).toBeNull()
    expect(row.last_attempt_at).toBeNull()
    expect(row.client_op_id).toBeNull()

    const columns = raw
      .prepare("SELECT name FROM pragma_table_info('sync_outbox')")
      .all()
      .map(c => (c as { name: string }).name)
    expect(columns).toEqual(
      expect.arrayContaining(['processed_at', 'last_attempt_at', 'client_op_id'])
    )

    const indexes = raw
      .prepare("SELECT name FROM pragma_index_list('sync_outbox')")
      .all()
      .map(i => (i as { name: string }).name)
    expect(indexes).toContain('idx_outbox_client_op_id')
    expect(indexes).toContain('idx_outbox_status_created')
  })

  it('روی نصب تازه (001 + 002) همه ستون‌ها را دارد', () => {
    const { raw } = createTestDb()
    const columns = raw
      .prepare("SELECT name FROM pragma_table_info('sync_outbox')")
      .all()
      .map(c => (c as { name: string }).name)

    expect(columns).toEqual(
      expect.arrayContaining(['client_op_id', 'processed_at', 'last_attempt_at'])
    )

    const expenseColumns = raw
      .prepare("SELECT name FROM pragma_table_info('expenses')")
      .all()
      .map(c => (c as { name: string }).name)
    expect(expenseColumns).toContain('deleted_at')
  })

  it('migration runner همه نسخه‌ها را فقط یک بار اعمال می‌کند', async () => {
    const harness = createTestDb({ skipMigrations: true })

    await runMigrations(harness.db)
    await runMigrations(harness.db)

    const versions = harness
      .rows<{ version: number }>('schema_migrations')
      .map(r => r.version)
      .sort((a, b) => a - b)
    expect(versions).toEqual([1, 2, 3, 4])
  })

  it('migration 003 یک ردیف sync_state می‌سازد', () => {
    const { rows, exec } = createTestDb()
    const state = rows<{ id: number; last_pull_at: string | null; device_id: string | null }>(
      'sync_state'
    )

    expect(state).toHaveLength(1)
    expect(state[0]).toMatchObject({ id: 1, last_pull_at: null, device_id: null })

    // INSERT OR IGNORE must not create a second row when the migration reruns.
    exec(`INSERT OR IGNORE INTO sync_state (id, schema_version) VALUES (1, 1)`)
    expect(rows('sync_state')).toHaveLength(1)
  })
})

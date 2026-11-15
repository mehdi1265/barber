import { beforeEach, describe, expect, it } from 'vitest'
import { withTransaction } from '@database/sqlite/transaction'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

describe('withTransaction', () => {
  let harness: TestDb

  beforeEach(() => {
    harness = createTestDb({ skipMigrations: true })
    harness.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT NOT NULL)')
  })

  it('commits every statement and they are visible immediately', async () => {
    await withTransaction(harness.db, async tx => {
      await tx.run('INSERT INTO t (id, v) VALUES (?, ?)', ['a', '1'])
      const inside = await tx.query('SELECT * FROM t WHERE id = ?', ['a'])
      expect(inside.values).toHaveLength(1)
    })

    const rows = harness.rows<{ id: string; v: string }>('t')
    expect(rows).toEqual([{ id: 'a', v: '1' }])
  })

  it('rolls back everything when the unit of work throws', async () => {
    await expect(
      withTransaction(harness.db, async tx => {
        await tx.run('INSERT INTO t (id, v) VALUES (?, ?)', ['b', '2'])
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    expect(harness.rows('t')).toHaveLength(0)
  })

  it('runs multi-statement execute without opening a second transaction', async () => {
    await withTransaction(harness.db, async tx => {
      await tx.execute(
        "INSERT INTO t (id, v) VALUES ('c', '3'); INSERT INTO t (id, v) VALUES ('d', '4');"
      )
    })

    expect(harness.rows('t')).toHaveLength(2)
  })

  it('the raw connection cannot be used inside the callback', async () => {
    // Reproduces the native plugin rule: run() defaults to transaction: true
    // and refuses to start a second transaction.
    await expect(
      withTransaction(harness.db, async () => {
        await harness.db.run('INSERT INTO t (id, v) VALUES (?, ?)', ['e', '5'])
      })
    ).rejects.toThrow('Already in transaction')
  })

  it('rejects a nested withTransaction on the same connection', async () => {
    await expect(
      withTransaction(harness.db, async () => {
        await withTransaction(harness.db, () => Promise.resolve(undefined))
      })
    ).rejects.toThrow('Nested transactions are not supported')
  })
})

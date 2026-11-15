import { describe, it, expect } from 'vitest'
import { ExpenseRepository } from '@database/repositories/expense.repository'
import { VisitRepository } from '@database/repositories/visit.repository'
import { createTestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-write-001'

describe('ExpenseRepository.delete', () => {
  it('رکورد کامل حذف‌شده را به‌صورت tombstone در payload outbox نگه می‌دارد', async () => {
    const { db, rows, outboxRows } = createTestDb()
    const repo = new ExpenseRepository(db, USER_ID)

    const expense = await repo.create({
      title: 'رنگ مو',
      category: 'مواد مصرفی',
      amount: 250000,
      note: 'خرید از عمده‌فروشی',
    })
    await repo.delete(expense.id)

    const deletes = outboxRows().filter(r => r.operation === 'delete')
    expect(deletes).toHaveLength(1)

    const payload = JSON.parse(deletes[0].payload) as Record<string, unknown>
    expect(payload.id).toBe(expense.id)
    expect(payload.title).toBe('رنگ مو')
    expect(payload.amount).toBe(250000 * 100)
    expect(payload.spent_at).toBe(expense.spent_at)
    expect(payload.deleted_at).toBeTruthy()

    // The row is retained locally with a tombstone so pull cannot resurrect it.
    const [stored] = rows<{ deleted_at: string | null }>('expenses')
    expect(stored.deleted_at).toBe(payload.deleted_at)
    expect(await repo.findById(expense.id)).toBeNull()
    expect(
      await repo.findByDateRange('2020-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
    ).toHaveLength(0)
  })

  it('حذف رکورد ناموجود هیچ outbox ثبت نمی‌کند', async () => {
    const { db, outboxRows } = createTestDb()
    const repo = new ExpenseRepository(db, USER_ID)

    await repo.delete('missing-id')
    expect(outboxRows()).toHaveLength(0)
  })

  it('خطا در ثبت outbox حذف را برمی‌گرداند', async () => {
    // 1st run = UPDATE tombstone, 2nd run = outbox insert
    const failing = createTestDb({ failOnRun: 2 })
    const failingRepo = new ExpenseRepository(failing.db, USER_ID)
    failing.exec(
      `INSERT INTO expenses (id, user_id, title, amount, spent_at, created_at, updated_at)
       VALUES ('exp-rollback', '${USER_ID}', 'خرید', 1000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    )

    await expect(failingRepo.delete('exp-rollback')).rejects.toThrow('injected failure')
    const [row] = failing.rows<{ deleted_at: string | null }>('expenses')
    expect(row.deleted_at).toBeNull()
    expect(failing.outboxRows().filter(r => r.operation === 'delete')).toHaveLength(0)
  })
})

describe('VisitRepository.create', () => {
  it('برای هر خدمت ردیف outbox جدا ثبت می‌کند', async () => {
    const { db, countRows, outboxRows } = createTestDb()
    const repo = new VisitRepository(db, USER_ID)

    await repo.create({
      services: [
        { service_name_snapshot: 'کوتاهی', unit_price: 150000, quantity: 1 },
        { service_name_snapshot: 'ریش', unit_price: 80000, quantity: 1 },
      ],
    })

    expect(countRows('visits')).toBe(1)
    expect(countRows('visit_services')).toBe(2)
    expect(outboxRows().filter(r => r.entity_type === 'visits')).toHaveLength(1)
    expect(outboxRows().filter(r => r.entity_type === 'visit_services')).toHaveLength(2)
  })

  it('اگر ثبت پرداخت شکست بخورد، هیچ ردیفی باقی نمی‌ماند', async () => {
    // 1 visit + 2 services + 3 outbox = 6 writes; fail on the last one
    const { db, countRows } = createTestDb({ failOnRun: 6 })
    const repo = new VisitRepository(db, USER_ID)

    await expect(
      repo.create({
        services: [
          { service_name_snapshot: 'کوتاهی', unit_price: 150000 },
          { service_name_snapshot: 'ریش', unit_price: 80000 },
        ],
      })
    ).rejects.toThrow('injected failure')

    expect(countRows('visits')).toBe(0)
    expect(countRows('visit_services')).toBe(0)
    expect(countRows('sync_outbox')).toBe(0)
  })
})

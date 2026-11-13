import { describe, it, expect, beforeEach } from 'vitest'
import {
  OverpaymentError,
  VisitRepository,
  type CreateVisitInput,
} from '@database/repositories/visit.repository'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { FinanceRepository } from '@features/finance/finance.repository'
import { localDateISO } from '@shared/utils/datetime'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-finance-001'
const OTHER_USER = 'user-finance-999'

const VISITED_AT = '2026-01-15T10:00:00.000Z'

function makeInput(overrides: Partial<CreateVisitInput> = {}): CreateVisitInput {
  return {
    visited_at: VISITED_AT,
    services: [
      { service_name_snapshot: 'کوتاهی', unit_price: 150_000 },
      { service_name_snapshot: 'ریش', unit_price: 80_000 },
      { service_name_snapshot: 'اصلاح', unit_price: 50_000 },
    ],
    ...overrides,
  }
}

describe('VisitRepository', () => {
  let harness: TestDb
  let repo: VisitRepository
  let finance: FinanceRepository

  beforeEach(() => {
    harness = createTestDb()
    repo = new VisitRepository(harness.db, USER_ID)
    finance = new FinanceRepository(harness.db, USER_ID)
  })

  describe('create', () => {
    it('ویزیت، خدمات و پرداخت اولیه را در یک تراکنش ذخیره می‌کند', async () => {
      const visit = await repo.create(
        makeInput({
          payment: { amount: 100_000, method: 'cash' },
        })
      )

      expect(harness.countRows('visits')).toBe(1)
      expect(harness.countRows('visit_services')).toBe(3)
      expect(harness.countRows('payments')).toBe(1)

      const payment = harness.rows<{ amount: number; visit_id: string }>('payments')[0]
      expect(payment.amount).toBe(10_000_000) // 100,000 Toman × 100
      expect(payment.visit_id).toBe(visit.id)

      const outbox = harness.outboxRows()
      expect(outbox.filter(r => r.entity_type === 'visits')).toHaveLength(1)
      expect(outbox.filter(r => r.entity_type === 'visit_services')).toHaveLength(3)
      expect(outbox.filter(r => r.entity_type === 'payments')).toHaveLength(1)

      const payOutbox = outbox.find(r => r.entity_type === 'payments')!
      expect(payOutbox.client_op_id).toMatch(/:pay:/)
    })

    it('پرداخت اولیه بیشتر از مبلغ خدمات را رد می‌کند و چیزی نمی‌نویسد', async () => {
      await expect(
        repo.create(makeInput({ payment: { amount: 300_000, method: 'cash' } }))
      ).rejects.toBeInstanceOf(OverpaymentError)

      expect(harness.countRows('visits')).toBe(0)
      expect(harness.countRows('visit_services')).toBe(0)
      expect(harness.countRows('payments')).toBe(0)
      expect(harness.countRows('sync_outbox')).toBe(0)
    })

    it('مبلغ خطا برابر باقی‌مانده ذخیره‌شده است', async () => {
      try {
        await repo.create(makeInput({ payment: { amount: 300_000, method: 'cash' } }))
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(OverpaymentError)
        expect((err as OverpaymentError).remaining).toBe(28_000_000) // (150+80+50) Toman × 100
      }
    })
  })

  describe('addPayment', () => {
    it('پرداخت جزئی را ثبت و در outbox صف می‌کند', async () => {
      const visit = await repo.create(makeInput())
      const payment = await repo.addPayment({
        visit_id: visit.id,
        amount: 120_000,
        method: 'card',
      })

      expect(payment.amount).toBe(12_000_000)
      expect(harness.countRows('payments')).toBe(1)
      expect(harness.outboxRows().filter(r => r.entity_type === 'payments')).toHaveLength(1)
    })

    it('پرداخت بیش از باقی‌مانده را رد می‌کند و چیزی نمی‌نویسد', async () => {
      const visit = await repo.create(makeInput({ payment: { amount: 100_000, method: 'cash' } }))

      await expect(
        repo.addPayment({ visit_id: visit.id, amount: 250_000, method: 'cash' })
      ).rejects.toBeInstanceOf(OverpaymentError)

      expect(harness.countRows('payments')).toBe(1) // only the initial payment
      expect(harness.outboxRows().filter(r => r.entity_type === 'payments')).toHaveLength(1)
    })

    it('پرداخت برای ویزیت کاربر دیگر را رد می‌کند', async () => {
      const visit = await repo.create(makeInput())
      const intruder = new VisitRepository(harness.db, OTHER_USER)

      await expect(
        intruder.addPayment({ visit_id: visit.id, amount: 10_000, method: 'cash' })
      ).rejects.toThrow('Visit not found')

      expect(harness.countRows('payments')).toBe(0)
    })
  })

  describe('findSummariesByDay', () => {
    it('نام مشتری و جمع خدمات/پرداخت را برمی‌گرداند', async () => {
      const customers = new CustomerRepository(harness.db, USER_ID)
      const customer = await customers.create({ name: 'رضا' })

      const visit = await repo.create(
        makeInput({
          customer_id: customer.id,
          payment: { amount: 100_000, method: 'cash' },
        })
      )
      await repo.create({ visited_at: '2026-01-16T10:00:00.000Z', services: [] })

      const summaries = await repo.findSummariesByDay(localDateISO(visit.visited_at))
      expect(summaries).toHaveLength(1)
      expect(summaries[0].customer_name).toBe('رضا')
      expect(summaries[0].service_total).toBe(28_000_000)
      expect(summaries[0].paid_total).toBe(10_000_000)
    })

    it('برای ویزیت بدون مشتری نام null است', async () => {
      const visit = await repo.create(makeInput())
      const [summary] = await repo.findSummariesByDay(localDateISO(visit.visited_at))
      expect(summary.customer_name).toBeNull()
    })
  })

  describe('findSummariesByCustomer', () => {
    it('مراجعات مشتری را با جمع خدمات و پرداخت‌ها به ترتیب نزولی برمی‌گرداند', async () => {
      const customers = new CustomerRepository(harness.db, USER_ID)
      const customer = await customers.create({ name: 'سارا' })
      const other = await customers.create({ name: 'مینا' })

      const older = await repo.create(
        makeInput({
          customer_id: customer.id,
          visited_at: '2026-01-15T10:00:00.000Z',
          services: [{ service_name_snapshot: 'کوتاهی', unit_price: 150_000 }],
          payment: { amount: 100_000, method: 'cash' },
        })
      )
      const newer = await repo.create({
        customer_id: customer.id,
        visited_at: '2026-01-20T10:00:00.000Z',
        services: [{ service_name_snapshot: 'ریش', unit_price: 80_000 }],
      })
      await repo.create({
        customer_id: other.id,
        visited_at: '2026-01-21T10:00:00.000Z',
        services: [],
      })

      const summaries = await repo.findSummariesByCustomer(customer.id)
      expect(summaries.map(row => row.id)).toEqual([newer.id, older.id])
      expect(summaries[0].service_total).toBe(8_000_000)
      expect(summaries[0].paid_total).toBe(0)
      expect(summaries[1].service_total).toBe(15_000_000)
      expect(summaries[1].paid_total).toBe(10_000_000)
      expect(summaries[0].customer_name).toBe('سارا')
    })
  })

  describe('FinanceRepository.getOpenDebts', () => {
    it('بدهی باز را به ازای هر مشتری تجمیع می‌کند', async () => {
      const customers = new CustomerRepository(harness.db, USER_ID)
      const reza = await customers.create({ name: 'رضا' })
      const ali = await customers.create({ name: 'علی' })

      // Reza: two visits, one partial payment each → debts 18M and 13M
      await repo.create(
        makeInput({ customer_id: reza.id, payment: { amount: 100_000, method: 'cash' } })
      )
      await repo.create({
        customer_id: reza.id,
        visited_at: '2026-01-16T10:00:00.000Z',
        services: [{ service_name_snapshot: 'کوتاهی', unit_price: 150_000 }],
        payment: { amount: 20_000, method: 'cash' },
      })

      // Ali: fully paid → not a debt
      await repo.create({
        customer_id: ali.id,
        visited_at: '2026-01-17T10:00:00.000Z',
        services: [{ service_name_snapshot: 'کوتاهی', unit_price: 100_000 }],
        payment: { amount: 100_000, method: 'cash' },
      })

      const debts = await finance.getOpenDebts()
      expect(debts).toHaveLength(1)
      expect(debts[0].customer_id).toBe(reza.id)
      expect(debts[0].total_debt).toBe(18_000_000 + 13_000_000)
      expect(debts[0].visit_count).toBe(2)
    })

    it('بدهی کل با جمع بدهی‌های باز برابر است', async () => {
      await repo.create(makeInput({ payment: { amount: 50_000, method: 'cash' } }))
      const [debts, total] = await Promise.all([finance.getOpenDebts(), finance.getTotalOpenDebt()])
      expect(debts.reduce((sum, d) => sum + d.total_debt, 0)).toBe(total)
    })
  })
})

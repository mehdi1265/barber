import { describe, it, expect } from 'vitest'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { ExpenseRepository } from '@database/repositories/expense.repository'
import { markOutboxProcessing, addToOutbox } from '@sync/outbox/outbox.repository'
import { pushOutbox, MAX_ATTEMPTS } from '@sync/engine/push'
import { RemoteError, type RemoteRow, type SyncClient } from '@sync/engine/sync.types'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-1'

interface ClientCall {
  kind: 'upsert' | 'delete'
  table: string
  rows?: RemoteRow[]
  ids?: string[]
}

function createFakeClient() {
  const calls: ClientCall[] = []
  let failure: RemoteError | null = null

  const client: SyncClient = {
    upsert(table, rows) {
      calls.push({ kind: 'upsert', table, rows })
      return failure ? Promise.reject(failure) : Promise.resolve()
    },
    deleteByIds(table, ids) {
      calls.push({ kind: 'delete', table, ids })
      return failure ? Promise.reject(failure) : Promise.resolve()
    },
    select() {
      return Promise.resolve([])
    },
  }

  return {
    calls,
    client,
    failWith: (error: RemoteError | null) => {
      failure = error
    },
  }
}

describe('pushOutbox', () => {
  it('ردیف‌های صف را ارسال و done می‌کند', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })
    await repo.create({ name: 'رضا' })

    const fake = createFakeClient()
    const result = await pushOutbox({ db: harness.db, client: fake.client, userId: USER })

    expect(result).toMatchObject({ pushed: 2, retryable: 0, terminal: 0, stoppedForAuth: false })
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls.every(c => c.kind === 'upsert' && c.table === 'customers')).toBe(true)
    expect(harness.outboxRows().every(row => row.status === 'done')).toBe(true)
  })

  it('خطای 401 کل اجرا را متوقف می‌کند و تلاش را حساب نمی‌کند', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })
    await repo.create({ name: 'رضا' })

    const fake = createFakeClient()
    fake.failWith(new RemoteError('JWT expired', 401))

    const result = await pushOutbox({ db: harness.db, client: fake.client, userId: USER })

    expect(result.stoppedForAuth).toBe(true)
    expect(fake.calls).toHaveLength(1)
    const rows = harness.outboxRows()
    expect(rows.every(row => row.status === 'pending')).toBe(true)
    expect(rows.every(row => row.attempt_count === 0)).toBe(true)
  })

  it('خطای 4xx دائمی است و دیگر تلاش نمی‌شود', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })

    const fake = createFakeClient()
    fake.failWith(new RemoteError('invalid row', 400))

    const base = new Date()
    const first = await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      now: () => base,
    })

    expect(first.terminal).toBe(1)
    const [row] = harness.outboxRows()
    expect(row.status).toBe('failed')
    expect(row.attempt_count).toBe(MAX_ATTEMPTS)
    expect(row.last_error).toBe('invalid row')

    fake.failWith(null)
    fake.calls.length = 0
    await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      now: () => new Date(base.getTime() + 60 * 60 * 1000),
    })
    expect(fake.calls).toHaveLength(0)
  })

  it('خطای 5xx با backoff دوباره تلاش می‌شود و در نهایت موفق می‌شود', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    const customer = await repo.create({ name: 'علی' })

    const fake = createFakeClient()
    fake.failWith(new RemoteError('server down', 500))

    const base = new Date()
    const first = await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      now: () => base,
    })
    expect(first.retryable).toBe(1)
    expect(harness.outboxRows()[0]).toMatchObject({ status: 'failed', attempt_count: 1 })

    // Immediately after the failure the backoff window is still open.
    const callsBefore = fake.calls.length
    const immediate = await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      now: () => base,
    })
    expect(immediate.pushed).toBe(0)
    expect(fake.calls).toHaveLength(callsBefore)

    fake.failWith(null)
    const later = await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      now: () => new Date(base.getTime() + 31_000),
    })

    expect(later.pushed).toBe(1)
    expect(harness.outboxRows()[0].status).toBe('done')
    const upsertedIds = fake.calls
      .filter(call => call.kind === 'upsert')
      .flatMap(call => (call.rows ?? []).map(row => row.id))
    expect(upsertedIds).toEqual([customer.id, customer.id])
  })

  it('پس از سقف تلاش‌ها ردیف terminal می‌شود', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })

    const fake = createFakeClient()
    fake.failWith(new RemoteError('server down', 503))

    const base = new Date()
    await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      maxAttempts: 2,
      now: () => base,
    })
    const second = await pushOutbox({
      db: harness.db,
      client: fake.client,
      userId: USER,
      maxAttempts: 2,
      now: () => new Date(base.getTime() + 31_000),
    })

    expect(second.terminal).toBe(1)
    const [row] = harness.outboxRows()
    expect(row.status).toBe('failed')
    expect(row.attempt_count).toBe(2)
  })

  it('ردیف processing جامانده در شروع اجرا آزاد می‌شود', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })
    await markOutboxProcessing(harness.db, harness.outboxRows()[0].id)

    const fake = createFakeClient()
    const result = await pushOutbox({ db: harness.db, client: fake.client, userId: USER })

    expect(result.pushed).toBe(1)
    expect(harness.outboxRows()[0].status).toBe('done')
  })

  it('حذف نرم را upsert و حذف سخت را delete می‌کند', async () => {
    const harness = createTestDb()
    const customers = new CustomerRepository(harness.db, USER)
    const expenses = new ExpenseRepository(harness.db, USER)

    const customer = await customers.create({ name: 'علی' })
    await customers.delete(customer.id)

    const expense = await expenses.create({
      title: 'مواد',
      category: null,
      amount: 10_000,
      spent_at: new Date().toISOString(),
      note: null,
    })
    await expenses.delete(expense.id)

    await addToOutbox(harness.db, {
      entity_type: 'appointment_services',
      entity_id: 'as-hard-1',
      operation: 'delete',
      payload: JSON.stringify({ id: 'as-hard-1' }),
    })

    const fake = createFakeClient()
    const result = await pushOutbox({ db: harness.db, client: fake.client, userId: USER })

    expect(result.pushed).toBe(5)
    const customerCalls = fake.calls.filter(call => call.table === 'customers')
    expect(customerCalls.every(call => call.kind === 'upsert')).toBe(true)
    expect(customerCalls.at(-1)?.rows?.[0].deleted_at).toBeTruthy()

    const expenseCalls = fake.calls.filter(call => call.table === 'expenses')
    expect(expenseCalls.every(call => call.kind === 'upsert')).toBe(true)
    expect(expenseCalls.at(-1)?.rows?.[0].deleted_at).toBeTruthy()

    const serviceCalls = fake.calls.filter(call => call.table === 'appointment_services')
    expect(serviceCalls.at(-1)).toMatchObject({ kind: 'delete', ids: ['as-hard-1'] })
  })
})

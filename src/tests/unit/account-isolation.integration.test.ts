/**
 * Account isolation on a shared device.
 *
 * The app keeps rows on disk after logout so the same account can resume
 * offline. These tests prove that a second account on the same database cannot
 * read, mutate, or push the first account's records.
 */

import { describe, expect, it } from 'vitest'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { countPendingOutbox, getPendingOutbox } from '@sync/outbox/outbox.repository'
import { pushOutbox } from '@sync/engine/push'
import type { RemoteRow, SyncClient } from '@sync/engine/sync.types'
import { createTestDb } from '../helpers/sqlite-harness'

const USER_A = 'account-a'
const USER_B = 'account-b'

function createFakeClient(): { client: SyncClient; upserts: RemoteRow[] } {
  const upserts: RemoteRow[] = []
  const client: SyncClient = {
    upsert(_table, rows) {
      upserts.push(...rows)
      return Promise.resolve()
    },
    deleteByIds() {
      return Promise.resolve()
    },
    select() {
      return Promise.resolve([])
    },
  }
  return { client, upserts }
}

describe('logout / account switch isolation', () => {
  it("B cannot read, update, or delete A's rows after A logs out", async () => {
    const harness = createTestDb()
    const repoA = new CustomerRepository(harness.db, USER_A)
    const created = await repoA.create({ name: 'مشتری الف', phone: '09120000001' })

    // A logs out; B signs in on the same device.
    const repoB = new CustomerRepository(harness.db, USER_B)

    expect(await repoB.findAll()).toEqual([])
    expect(await repoB.findById(created.id)).toBeNull()
    expect(await repoB.search('مشتری')).toEqual([])
    expect(await repoB.update(created.id, { name: 'دستکاری' })).toBeNull()
    await repoB.delete(created.id)

    // A re-logs in and still owns the untouched row.
    const repoAAgain = new CustomerRepository(harness.db, USER_A)
    const row = await repoAAgain.findById(created.id)
    expect(row?.name).toBe('مشتری الف')
    expect(harness.rows<{ user_id: string }>('customers')).toHaveLength(1)
  })

  it("B cannot see or push A's queued operations", async () => {
    const harness = createTestDb()
    const repoA = new CustomerRepository(harness.db, USER_A)
    await repoA.create({ name: 'مشتری الف' })

    expect(await getPendingOutbox(harness.db, USER_A)).toHaveLength(1)
    expect(await getPendingOutbox(harness.db, USER_B)).toHaveLength(0)
    expect(await countPendingOutbox(harness.db, USER_B)).toBe(0)

    const fakeB = createFakeClient()
    const resultB = await pushOutbox({
      db: harness.db,
      client: fakeB.client,
      userId: USER_B,
      maxAttempts: 5,
    })

    expect(resultB.pushed).toBe(0)
    expect(fakeB.upserts).toEqual([])
    expect(await countPendingOutbox(harness.db, USER_A)).toBe(1)

    // A signs back in and the queued row is pushed under A's identity.
    const fakeA = createFakeClient()
    const resultA = await pushOutbox({
      db: harness.db,
      client: fakeA.client,
      userId: USER_A,
      maxAttempts: 5,
    })

    expect(resultA.pushed).toBe(1)
    expect(fakeA.upserts).toHaveLength(1)
    expect(fakeA.upserts[0].user_id).toBe(USER_A)
    expect(await countPendingOutbox(harness.db, USER_A)).toBe(0)
  })

  it('every queued row records its owner', async () => {
    const harness = createTestDb()
    await new CustomerRepository(harness.db, USER_A).create({ name: 'الف' })
    await new CustomerRepository(harness.db, USER_B).create({ name: 'ب' })

    const owners = harness.outboxRows().map(row => row.user_id)
    expect(owners.sort()).toEqual([USER_A, USER_B])
  })
})

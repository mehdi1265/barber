/**
 * Local-data wipe.
 *
 * Proves that the Settings wipe removes one account's business rows, outbox,
 * cursor, and photo files, refuses to run while work is unsynced, and never
 * touches another account's data or the schema bookkeeping.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  deleteLocalAccountData,
  PendingOutboxError,
  wipeAccountRows,
} from '@features/settings/local-data'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-11-13T10:00:00.000Z'

const BUSINESS_TABLES = [
  'customers',
  'services',
  'appointments',
  'appointment_services',
  'visits',
  'visit_services',
  'payments',
  'expenses',
  'color_formulas',
  'color_formula_items',
  'customer_photos',
] as const

function countFor(harness: TestDb, table: string, userId: string): number {
  return harness.rows<{ user_id: string }>(table).filter(row => row.user_id === userId).length
}

function seedBusinessRows(harness: TestDb, userId: string, prefix: string): void {
  harness.exec(`
    INSERT INTO customers (id, user_id, name, created_at, updated_at)
      VALUES ('${prefix}-cust', '${userId}', 'مشتری', '${NOW}', '${NOW}');
    INSERT INTO services (id, user_id, name, created_at, updated_at)
      VALUES ('${prefix}-svc', '${userId}', 'خدمت', '${NOW}', '${NOW}');
    INSERT INTO appointments
      (id, user_id, customer_id, title, start_at, duration_minutes, end_at, created_at, updated_at)
      VALUES ('${prefix}-appt', '${userId}', '${prefix}-cust', 'نوبت', '${NOW}', 30, '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO appointment_services
      (id, user_id, appointment_id, service_id, service_name_snapshot, created_at, updated_at)
      VALUES ('${prefix}-as', '${userId}', '${prefix}-appt', '${prefix}-svc', 'خدمت', '${NOW}', '${NOW}');
    INSERT INTO visits (id, user_id, customer_id, appointment_id, visited_at, created_at, updated_at)
      VALUES ('${prefix}-visit', '${userId}', '${prefix}-cust', '${prefix}-appt', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO visit_services
      (id, user_id, visit_id, service_name_snapshot, created_at, updated_at)
      VALUES ('${prefix}-vs', '${userId}', '${prefix}-visit', 'خدمت', '${NOW}', '${NOW}');
    INSERT INTO payments (id, user_id, visit_id, amount, paid_at, created_at, updated_at)
      VALUES ('${prefix}-pay', '${userId}', '${prefix}-visit', 1000, '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO expenses (id, user_id, title, amount, spent_at, created_at, updated_at)
      VALUES ('${prefix}-exp', '${userId}', 'هزینه', 500, '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO color_formulas (id, user_id, title, customer_id, created_at, updated_at)
      VALUES ('${prefix}-formula', '${userId}', 'فرمول', '${prefix}-cust', '${NOW}', '${NOW}');
    INSERT INTO color_formula_items
      (id, user_id, formula_id, product_name, amount, created_at, updated_at)
      VALUES ('${prefix}-item', '${userId}', '${prefix}-formula', 'رنگ', 10, '${NOW}', '${NOW}');
    INSERT INTO customer_photos (id, user_id, customer_id, local_path, created_at, updated_at)
      VALUES ('${prefix}-photo', '${userId}', '${prefix}-cust',
        'photos/${userId}/${prefix}-photo.jpg', '${NOW}', '${NOW}');
  `)
}

function seedOutbox(harness: TestDb, userId: string, id: string, status: string): void {
  harness.exec(`
    INSERT INTO sync_outbox
      (id, entity_type, entity_id, operation, payload, created_at, status, user_id)
    VALUES ('${id}', 'customers', '${id}', 'insert', '{}', '${NOW}', '${status}', '${userId}');
  `)
}

function setCursor(harness: TestDb, userId: string): void {
  harness.exec(
    `UPDATE sync_state SET last_pull_at = '${NOW}', cursor_user_id = '${userId}' WHERE id = 1;`
  )
}

describe('local data wipe', () => {
  it("removes A's business rows, outbox, and cursor but keeps B and the schema", async () => {
    const harness = createTestDb()
    seedBusinessRows(harness, USER_A, 'a')
    seedBusinessRows(harness, USER_B, 'b')
    seedOutbox(harness, USER_A, 'a-done', 'done')
    seedOutbox(harness, USER_B, 'b-pending', 'pending')
    setCursor(harness, USER_A)

    await wipeAccountRows(harness.db, USER_A)

    for (const table of BUSINESS_TABLES) {
      expect(countFor(harness, table, USER_A), table).toBe(0)
      expect(countFor(harness, table, USER_B), table).toBe(1)
    }
    expect(harness.rows<{ user_id: string }>('sync_outbox')).toEqual([
      expect.objectContaining({ user_id: USER_B }),
    ])
    const state = harness.rows<{ last_pull_at: string | null; cursor_user_id: string | null }>(
      'sync_state'
    )[0]
    expect(state).toMatchObject({ last_pull_at: null, cursor_user_id: null })
    expect(harness.countRows('sync_state')).toBe(1)
  })

  it("leaves another account's pull cursor untouched", async () => {
    const harness = createTestDb()
    setCursor(harness, USER_B)

    await wipeAccountRows(harness.db, USER_A)

    const state = harness.rows<{ last_pull_at: string | null; cursor_user_id: string | null }>(
      'sync_state'
    )[0]
    expect(state).toMatchObject({ last_pull_at: NOW, cursor_user_id: USER_B })
  })

  it('refuses while the account has unsynced rows and deletes nothing', async () => {
    const harness = createTestDb()
    seedBusinessRows(harness, USER_A, 'a')
    seedOutbox(harness, USER_A, 'a-pending', 'pending')
    seedOutbox(harness, USER_A, 'a-processing', 'processing')

    await expect(wipeAccountRows(harness.db, USER_A)).rejects.toMatchObject({
      name: 'PendingOutboxError',
      pending: 2,
    })
    await expect(wipeAccountRows(harness.db, USER_A)).rejects.toBeInstanceOf(PendingOutboxError)
    expect(countFor(harness, 'customers', USER_A)).toBe(1)
    expect(harness.countRows('sync_outbox')).toBe(2)
  })

  it('does not let permanently failed operations block the wipe', async () => {
    const harness = createTestDb()
    seedBusinessRows(harness, USER_A, 'a')
    seedOutbox(harness, USER_A, 'a-terminal', 'failed')
    harness.exec(`UPDATE sync_outbox SET attempt_count = 5 WHERE id = 'a-terminal'`)

    await wipeAccountRows(harness.db, USER_A)

    expect(countFor(harness, 'customers', USER_A)).toBe(0)
    expect(harness.rows('sync_outbox')).toHaveLength(0)
  })

  it('still refuses while a retryable failure has attempts left', async () => {
    const harness = createTestDb()
    seedOutbox(harness, USER_A, 'a-retry', 'failed')
    harness.exec(`UPDATE sync_outbox SET attempt_count = 1 WHERE id = 'a-retry'`)

    await expect(wipeAccountRows(harness.db, USER_A)).rejects.toMatchObject({ pending: 1 })
  })

  it('deletes rows before removing local photo files', async () => {
    const harness = createTestDb()
    seedBusinessRows(harness, USER_A, 'a')
    seedOutbox(harness, USER_A, 'a-done', 'done')

    const deletePhotoFiles = vi.fn((userId: string) => {
      // Rows are already committed when the file cleanup starts.
      expect(countFor(harness, 'customers', userId)).toBe(0)
      return Promise.resolve()
    })

    await deleteLocalAccountData(USER_A, { db: harness.db, deletePhotoFiles })

    expect(deletePhotoFiles).toHaveBeenCalledTimes(1)
    expect(deletePhotoFiles).toHaveBeenCalledWith(USER_A)
    expect(countFor(harness, 'customers', USER_A)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { buildPushEntity, SOFT_DELETE_TABLES } from '@sync/engine/payload'
import { pullFromCloud } from '@sync/engine/pull'
import type { RemoteRow, SelectOptions, SyncClient, SyncTable } from '@sync/engine/sync.types'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER = 'user-1'
const T0 = '2026-11-13T10:00:00.000Z'
const T1 = '2026-11-13T11:00:00.000Z'
const T2 = '2026-11-13T12:00:00.000Z'
const T3 = '2026-11-13T13:00:00.000Z'

function createFakeClient(rowsByTable: Partial<Record<SyncTable, RemoteRow[]>> = {}) {
  const calls: { table: SyncTable; options: SelectOptions }[] = []

  const client: SyncClient = {
    upsert: () => Promise.resolve(),
    deleteByIds: () => Promise.resolve(),
    select(table, options) {
      calls.push({ table, options })
      let rows = rowsByTable[table] ?? []
      if (options.since) {
        const since = options.since
        rows = rows.filter(row => String(row.updated_at) > since)
      }
      if (options.after) {
        const { updatedAt, id } = options.after
        rows = rows.filter(row => {
          const rowUpdatedAt = String(row.updated_at)
          return rowUpdatedAt > updatedAt || (rowUpdatedAt === updatedAt && String(row.id) > id)
        })
      }
      return Promise.resolve(rows.slice(0, options.limit))
    },
  }

  return { client, calls }
}

function tombstone(tableId: string, updatedAt = T1): RemoteRow {
  return { id: tableId, user_id: USER, updated_at: updatedAt, deleted_at: updatedAt }
}

/** Seeds a visit graph whose foreign keys restrict naive delete ordering. */
function seedVisitGraph(harness: TestDb): void {
  harness.exec(`
    INSERT INTO services
      (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
    VALUES ('svc-1', '${USER}', 'اصلاح', 250000, 30, 1, '${T0}', '${T0}');

    INSERT INTO appointments
      (id, user_id, customer_id, title, start_at, duration_minutes, end_at, status, notes, created_at, updated_at)
    VALUES ('appt-1', '${USER}', NULL, 'نوبت', '${T0}', 30, '${T0}', 'reserved', NULL, '${T0}', '${T0}');

    INSERT INTO appointment_services
      (id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at)
    VALUES ('as-1', '${USER}', 'appt-1', 'svc-1', 'اصلاح', 250000, 30, '${T0}', '${T0}');

    INSERT INTO visits
      (id, user_id, customer_id, appointment_id, is_quick_sale, visited_at, notes, created_at, updated_at)
    VALUES ('visit-1', '${USER}', NULL, 'appt-1', 0, '${T0}', NULL, '${T0}', '${T0}');

    INSERT INTO visit_services
      (id, user_id, visit_id, service_id, service_name_snapshot, quantity, unit_price, discount_amount, line_total, duration_minutes, created_at, updated_at)
    VALUES ('vs-1', '${USER}', 'visit-1', 'svc-1', 'اصلاح', 1, 250000, 0, 250000, 30, '${T0}', '${T0}');

    INSERT INTO payments
      (id, user_id, visit_id, amount, method, paid_at, note, created_at, updated_at)
    VALUES ('pay-1', '${USER}', 'visit-1', 250000, 'cash', '${T0}', NULL, '${T0}', '${T0}');

    INSERT INTO color_formulas
      (id, user_id, title, brand, color_code, oxidant_type, oxidant_percent, mix_ratio, processing_minutes, notes, customer_id, visit_id, created_at, updated_at)
    VALUES ('cf-1', '${USER}', 'رنگ', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'visit-1', '${T0}', '${T0}');

    INSERT INTO color_formula_items
      (id, user_id, formula_id, product_name, color_code, amount, unit, created_at, updated_at)
    VALUES ('cfi-1', '${USER}', 'cf-1', 'رنگ', NULL, 30, 'g', '${T0}', '${T0}');
  `)
}

describe('pullFromCloud — deletion reconciliation', () => {
  it('tombstones را برای هر هفت جدول بدون deleted_at محلی حذف فیزیکی می‌کند', async () => {
    const harness = createTestDb()
    seedVisitGraph(harness)

    // Server sends parents first; the pull must still delete children first.
    const { client } = createFakeClient({
      services: [tombstone('svc-1')],
      visits: [tombstone('visit-1')],
      color_formulas: [tombstone('cf-1')],
      payments: [tombstone('pay-1')],
      visit_services: [tombstone('vs-1')],
      appointment_services: [tombstone('as-1')],
      color_formula_items: [tombstone('cfi-1')],
    })

    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.conflicts).toBe(0)
    expect(result.pulled).toBe(7)
    for (const table of [
      'services',
      'appointment_services',
      'visits',
      'visit_services',
      'payments',
      'color_formulas',
      'color_formula_items',
    ]) {
      expect(harness.countRows(table), table).toBe(0)
    }
    // The appointment was not tombstoned and must survive.
    expect(harness.countRows('appointments')).toBe(1)
    const [state] = harness.rows<{ last_pull_at: string }>('sync_state')
    expect(state.last_pull_at).toBe(T1)
  })

  it('عملیات در صف را قربانی tombstone نمی‌کند', async () => {
    const harness = createTestDb()
    harness.exec(`
      INSERT INTO services
        (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
      VALUES ('svc-1', '${USER}', 'اصلاح', 250000, 30, 1, '${T0}', '${T0}')
    `)
    await addToOutbox(harness.db, {
      user_id: USER,
      entity_type: 'services',
      entity_id: 'svc-1',
      operation: 'update',
      payload: JSON.stringify({ id: 'svc-1', name: 'اصلاح ویژه' }),
    })

    const { client } = createFakeClient({ services: [tombstone('svc-1')] })
    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.pulled).toBe(0)
    expect(result.conflicts).toBe(1)
    expect(harness.countRows('services')).toBe(1)
    expect(harness.outboxRows()[0].status).toBe('pending')
  })

  it('ردیف محلی جدیدتر از tombstone را پاک نمی‌کند', async () => {
    const harness = createTestDb()
    harness.exec(`
      INSERT INTO services
        (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
      VALUES ('svc-1', '${USER}', 'اصلاح', 250000, 30, 1, '${T0}', '${T2}')
    `)

    const { client } = createFakeClient({ services: [tombstone('svc-1', T1)] })
    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.pulled).toBe(0)
    expect(result.conflicts).toBe(1)
    expect(harness.countRows('services')).toBe(1)
  })

  it('نسخه قدیمی سرور tombstone محلی را زنده نمی‌کند', async () => {
    const harness = createTestDb()
    harness.exec(`
      INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
      VALUES ('cus-1', '${USER}', 'حذف‌شده', NULL, NULL, '${T0}', '${T2}', '${T2}');

      INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
      VALUES ('cus-2', '${USER}', 'حذف‌شده ۲', NULL, NULL, '${T0}', '${T2}', '${T2}');
    `)

    const { client } = createFakeClient({
      customers: [
        {
          id: 'cus-1',
          user_id: USER,
          name: 'نسخه قدیمی',
          phone: null,
          notes: null,
          created_at: T0,
          updated_at: T1,
          deleted_at: null,
        },
        {
          id: 'cus-2',
          user_id: USER,
          name: 'بازیابی از دستگاه دیگر',
          phone: null,
          notes: null,
          created_at: T0,
          updated_at: T3,
          deleted_at: null,
        },
      ],
    })

    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.pulled).toBe(1)
    expect(result.conflicts).toBe(1)
    const rows = harness.rows<{ id: string; name: string; deleted_at: string | null }>('customers')
    const first = rows.find(row => row.id === 'cus-1')
    const second = rows.find(row => row.id === 'cus-2')
    expect(first).toMatchObject({ name: 'حذف‌شده', deleted_at: T2 })
    expect(second).toMatchObject({ name: 'بازیابی از دستگاه دیگر', deleted_at: null })
  })

  it('صفحه‌بندی keyset ردیفی را هنگام حذف میان دو صفحه جا نمی‌اندازد', async () => {
    const harness = createTestDb()
    const serverRows = [1, 2, 3, 4].map(index => ({
      id: `cus-${index}`,
      user_id: USER,
      name: `مشتری ${index}`,
      phone: null,
      notes: null,
      created_at: T0,
      updated_at: `2026-11-13T10:0${index}:00.000Z`,
      deleted_at: null,
    }))
    let mutated = false

    const client: SyncClient = {
      upsert: () => Promise.resolve(),
      deleteByIds: () => Promise.resolve(),
      select(table, options) {
        if (table !== 'customers') return Promise.resolve([])
        if (options.after && !mutated) {
          // Another device deletes the first row between page 1 and page 2.
          // Offset pagination would now skip `cus-3`.
          serverRows.shift()
          mutated = true
        }
        let rows = [...serverRows]
        if (options.after) {
          const { updatedAt, id } = options.after
          rows = rows.filter(row => {
            const rowUpdatedAt = String(row.updated_at)
            return rowUpdatedAt > updatedAt || (rowUpdatedAt === updatedAt && row.id > id)
          })
        }
        return Promise.resolve(rows.slice(0, options.limit))
      },
    }

    const result = await pullFromCloud({ db: harness.db, client, userId: USER, pageSize: 2 })

    // Page 1 already merged cus-1, so it stays locally until its own tombstone
    // arrives; what matters is that cus-3 is not skipped.
    expect(result.pulled).toBe(4)
    expect(
      harness
        .rows<{ id: string }>('customers')
        .map(row => row.id)
        .sort()
    ).toEqual(['cus-1', 'cus-2', 'cus-3', 'cus-4'])
  })
})

describe('buildPushEntity — tombstones', () => {
  it('همه جداول داده‌ای نرم‌حذف می‌شوند و profiles نه', () => {
    expect(SOFT_DELETE_TABLES.size).toBe(11)
    expect(SOFT_DELETE_TABLES.has('appointment_services')).toBe(true)
    expect(SOFT_DELETE_TABLES.has('profiles')).toBe(false)
  })

  it('updated_at را برای دیده‌شدن در pull افزایشی جلو می‌برد', async () => {
    const harness = createTestDb()
    harness.exec(`
      INSERT INTO services
        (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
      VALUES ('svc-1', '${USER}', 'اصلاح', 250000, 30, 1, '${T0}', '${T0}')
    `)

    const bumped = await buildPushEntity(
      harness.db,
      {
        entity_type: 'services',
        entity_id: 'svc-1',
        operation: 'delete',
        payload: JSON.stringify({ id: 'svc-1', deleted_at: T1 }),
      },
      USER
    )

    expect(bumped.mode).toBe('upsert')
    if (bumped.mode !== 'upsert') throw new Error('unreachable')
    expect(bumped.row).toMatchObject({ deleted_at: T1, updated_at: T1 })

    // A newer local edit must not be pushed backwards by the tombstone.
    harness.exec(`UPDATE services SET updated_at = '${T2}' WHERE id = 'svc-1'`)
    const kept = await buildPushEntity(
      harness.db,
      {
        entity_type: 'services',
        entity_id: 'svc-1',
        operation: 'delete',
        payload: JSON.stringify({ id: 'svc-1', deleted_at: T1 }),
      },
      USER
    )

    expect(kept.mode).toBe('upsert')
    if (kept.mode !== 'upsert') throw new Error('unreachable')
    expect(kept.row.updated_at).toBe(T2)
  })
})

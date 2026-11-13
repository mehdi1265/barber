import { describe, it, expect } from 'vitest'
import { CustomerRepository } from '@database/repositories/customer.repository'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { pullFromCloud, CURSOR_OVERLAP_MS, PULL_ORDER } from '@sync/engine/pull'
import type { RemoteRow, SelectOptions, SyncClient, SyncTable } from '@sync/engine/sync.types'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-1'
const T0 = '2026-11-13T10:00:00.000Z'

function createFakeClient(rowsByTable: Partial<Record<SyncTable, RemoteRow[]>> = {}) {
  const calls: { table: SyncTable; options: SelectOptions }[] = []

  const client: SyncClient = {
    upsert() {
      return Promise.resolve()
    },
    deleteByIds() {
      return Promise.resolve()
    },
    select(table, options) {
      calls.push({ table, options })
      const all = rowsByTable[table] ?? []
      return Promise.resolve(all.slice(options.offset, options.offset + options.limit))
    },
  }

  return { client, calls }
}

function customerRow(overrides: Partial<RemoteRow> = {}): RemoteRow {
  return {
    id: 'cus-1',
    user_id: USER,
    name: 'علی',
    phone: null,
    notes: null,
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    ...overrides,
  }
}

describe('pullFromCloud', () => {
  it('بازیابی کامل را به ترتیب کلید خارجی انجام می‌دهد', async () => {
    const harness = createTestDb()
    const { client, calls } = createFakeClient({
      profiles: [
        {
          id: USER,
          user_id: USER,
          display_name: 'آرایشگر',
          phone: null,
          currency_code: 'IRR',
          created_at: T0,
          updated_at: T0,
        },
      ],
      customers: [customerRow()],
      services: [
        {
          id: 'svc-1',
          user_id: USER,
          name: 'اصلاح',
          default_price: 250000,
          suggested_duration_minutes: 30,
          is_active: true,
          created_at: T0,
          updated_at: T0,
        },
      ],
      appointments: [
        {
          id: 'appt-1',
          user_id: USER,
          customer_id: 'cus-1',
          title: 'نوبت',
          start_at: T0,
          duration_minutes: 30,
          end_at: T0,
          status: 'reserved',
          notes: null,
          created_at: T0,
          updated_at: T0,
          deleted_at: null,
        },
      ],
      appointment_services: [
        {
          id: 'as-1',
          user_id: USER,
          appointment_id: 'appt-1',
          service_id: 'svc-1',
          service_name_snapshot: 'اصلاح',
          price: 250000,
          duration_minutes: 30,
          created_at: T0,
          updated_at: T0,
        },
      ],
      visits: [
        {
          id: 'visit-1',
          user_id: USER,
          customer_id: 'cus-1',
          appointment_id: 'appt-1',
          is_quick_sale: false,
          visited_at: T0,
          notes: null,
          created_at: T0,
          updated_at: T0,
        },
      ],
      visit_services: [
        {
          id: 'vs-1',
          user_id: USER,
          visit_id: 'visit-1',
          service_id: 'svc-1',
          service_name_snapshot: 'اصلاح',
          quantity: 1,
          unit_price: 250000,
          discount_amount: 0,
          line_total: 250000,
          duration_minutes: 30,
          created_at: T0,
          updated_at: T0,
        },
      ],
      payments: [
        {
          id: 'pay-1',
          user_id: USER,
          visit_id: 'visit-1',
          amount: 100000,
          method: 'cash',
          paid_at: T0,
          note: null,
          created_at: T0,
          updated_at: T0,
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          user_id: USER,
          title: 'مواد',
          category: null,
          amount: 5000,
          spent_at: T0,
          note: null,
          created_at: T0,
          updated_at: T0,
        },
      ],
      color_formulas: [
        {
          id: 'formula-1',
          user_id: USER,
          title: 'رنگ',
          brand: null,
          color_code: null,
          oxidant_type: null,
          oxidant_percent: null,
          mix_ratio: null,
          processing_minutes: null,
          notes: null,
          customer_id: 'cus-1',
          visit_id: 'visit-1',
          created_at: T0,
          updated_at: T0,
        },
      ],
      color_formula_items: [
        {
          id: 'item-1',
          user_id: USER,
          formula_id: 'formula-1',
          product_name: 'رنگ',
          color_code: null,
          amount: 30,
          unit: 'g',
          created_at: T0,
          updated_at: T0,
        },
      ],
      customer_photos: [
        {
          id: 'photo-1',
          user_id: USER,
          customer_id: 'cus-1',
          visit_id: 'visit-1',
          storage_path: 'user/cus/photo.jpg',
          photo_type: 'after',
          caption: null,
          consent_given: true,
          created_at: T0,
          updated_at: T0,
          deleted_at: null,
        },
      ],
    })

    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.full).toBe(true)
    expect(result.pulled).toBe(PULL_ORDER.length)
    expect(result.conflicts).toBe(0)
    expect(calls.map(call => call.table)).toEqual(PULL_ORDER)
    expect(calls[0].options.since).toBeUndefined()

    expect(harness.countRows('customers')).toBe(1)
    expect(harness.countRows('appointments')).toBe(1)
    expect(harness.countRows('appointment_services')).toBe(1)
    expect(harness.countRows('visit_services')).toBe(1)
    expect(harness.countRows('payments')).toBe(1)
    expect(harness.countRows('color_formula_items')).toBe(1)
    expect(harness.countRows('customer_photos')).toBe(1)

    const [state] = harness.rows<{ last_pull_at: string; device_id: string | null }>('sync_state')
    expect(state.last_pull_at).toBe(T0)
    expect(state.device_id).toBeTruthy()
  })

  it('برای تاریخچه بزرگ صفحه‌بندی می‌کند', async () => {
    const harness = createTestDb()
    const rows = [1, 2, 3].map(index =>
      customerRow({
        id: `cus-${index}`,
        name: `مشتری ${index}`,
        updated_at: `2026-11-13T10:0${index}:00.000Z`,
      })
    )
    const { client, calls } = createFakeClient({ customers: rows })

    const result = await pullFromCloud({ db: harness.db, client, userId: USER, pageSize: 2 })

    expect(result.pulled).toBe(3)
    expect(harness.countRows('customers')).toBe(3)
    expect(
      calls.filter(call => call.table === 'customers').map(call => call.options.offset)
    ).toEqual([0, 2])
  })

  it('تا وقتی تغییر محلی در صف است نسخه ابری را اعمال نمی‌کند', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    const local = await repo.create({ name: 'محلی' })

    const { client } = createFakeClient({
      customers: [customerRow({ id: local.id, name: 'ابر' })],
    })

    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.conflicts).toBe(1)
    expect(result.pulled).toBe(0)
    const [row] = harness.rows<{ name: string }>('customers')
    expect(row.name).toBe('محلی')
    // The queued operation is untouched by the pull.
    expect(harness.outboxRows()[0].status).toBe('pending')
  })

  it('tombstone ابری را روی ردیف محلی اعمال می‌کند', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    const local = await repo.create({ name: 'علی' })
    harness.exec(`UPDATE sync_outbox SET status = 'done'`)

    const { client } = createFakeClient({
      customers: [customerRow({ id: local.id, deleted_at: '2026-11-13T11:00:00.000Z' })],
    })

    await pullFromCloud({ db: harness.db, client, userId: USER })

    const [row] = harness.rows<{ deleted_at: string | null }>('customers')
    expect(row.deleted_at).toBe('2026-11-13T11:00:00.000Z')
    expect(await repo.findAll()).toHaveLength(0)
  })

  it('بولین‌ها، اعداد رشته‌ای و تاریخ‌ها را نرمال می‌کند', async () => {
    const harness = createTestDb()
    const { client } = createFakeClient({
      services: [
        {
          id: 'svc-1',
          user_id: USER,
          name: 'اصلاح',
          default_price: '250000',
          suggested_duration_minutes: '30',
          is_active: true,
          created_at: '2026-11-13T10:00:00+00:00',
          updated_at: '2026-11-13T10:00:00+00:00',
        },
      ],
      visits: [
        {
          id: 'visit-1',
          user_id: USER,
          customer_id: null,
          appointment_id: null,
          is_quick_sale: false,
          visited_at: T0,
          notes: null,
          created_at: T0,
          updated_at: T0,
        },
      ],
      customer_photos: [
        {
          id: 'photo-1',
          user_id: USER,
          customer_id: null,
          visit_id: null,
          storage_path: null,
          photo_type: 'other',
          caption: null,
          consent_given: true,
          created_at: T0,
          updated_at: T0,
          deleted_at: null,
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          user_id: USER,
          title: 'مواد',
          category: null,
          amount: '5000',
          spent_at: T0,
          note: null,
          created_at: T0,
          updated_at: T0,
        },
      ],
    })

    await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(harness.rows('services')[0]).toMatchObject({
      default_price: 250000,
      suggested_duration_minutes: 30,
      is_active: 1,
    })
    expect(harness.rows('visits')[0].is_quick_sale).toBe(0)
    expect(harness.rows('customer_photos')[0]).toMatchObject({
      consent_given: 1,
      local_path: null,
    })
    expect(harness.rows('expenses')[0].amount).toBe(5000)
  })

  it('در حالت افزایشی با پنج دقیقه هم‌پوشانی می‌خواند', async () => {
    const harness = createTestDb()
    harness.exec(`UPDATE sync_state SET last_pull_at = '${T0}'`)
    // Any local row means the database is not empty, so the cursor is used.
    harness.exec(
      `INSERT INTO customers (id, user_id, name, created_at, updated_at)
       VALUES ('local-1', '${USER}', 'محلی', '${T0}', '${T0}')`
    )

    const { client, calls } = createFakeClient()
    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.full).toBe(false)
    const expectedSince = new Date(Date.parse(T0) - CURSOR_OVERLAP_MS).toISOString()
    expect(calls[0].options.since).toBe(expectedSince)
    // No new rows: the cursor must not move forward or the overlap window is lost.
    const [state] = harness.rows<{ last_pull_at: string }>('sync_state')
    expect(state.last_pull_at).toBe(T0)
  })

  it('full اجباری حتی با کرسور موجود همه تاریخچه را می‌خواند', async () => {
    const harness = createTestDb()
    harness.exec(`UPDATE sync_state SET last_pull_at = '${T0}'`)
    harness.exec(
      `INSERT INTO customers (id, user_id, name, created_at, updated_at)
       VALUES ('local-1', '${USER}', 'محلی', '${T0}', '${T0}')`
    )

    const { client, calls } = createFakeClient()
    await pullFromCloud({ db: harness.db, client, userId: USER, full: true })

    expect(calls[0].options.since).toBeUndefined()
  })

  it('اگر همه داده‌های محلی پاک شده باشند خودکار بازیابی کامل می‌کند', async () => {
    const harness = createTestDb()
    harness.exec(`UPDATE sync_state SET last_pull_at = '${T0}'`)

    const { client, calls } = createFakeClient()
    const result = await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(result.full).toBe(true)
    expect(calls[0].options.since).toBeUndefined()
  })

  it('local_path عکس با نسخه ابری از بین نمی‌رود', async () => {
    const harness = createTestDb()
    harness.exec(
      `INSERT INTO customer_photos
        (id, user_id, customer_id, visit_id, storage_path, local_path, photo_type, caption, consent_given, created_at, updated_at, deleted_at)
       VALUES ('photo-1', '${USER}', NULL, NULL, NULL, '/local/photo.jpg', 'other', 'قدیمی', 1, '${T0}', '${T0}', NULL)`
    )

    const { client } = createFakeClient({
      customer_photos: [
        {
          id: 'photo-1',
          user_id: USER,
          customer_id: null,
          visit_id: null,
          storage_path: 'user/photo.jpg',
          photo_type: 'after',
          caption: 'جدید',
          consent_given: true,
          created_at: T0,
          updated_at: '2026-11-13T11:00:00.000Z',
          deleted_at: null,
        },
      ],
    })

    await pullFromCloud({ db: harness.db, client, userId: USER })

    const [row] = harness.rows<{ local_path: string; caption: string; photo_type: string }>(
      'customer_photos'
    )
    expect(row.local_path).toBe('/local/photo.jpg')
    expect(row.caption).toBe('جدید')
    expect(row.photo_type).toBe('after')
  })

  it('ستون‌های ناشناخته سرور را نادیده می‌گیرد', async () => {
    const harness = createTestDb()
    const { client } = createFakeClient({
      customers: [customerRow({ unknown_column: 'boom' })],
    })

    await pullFromCloud({ db: harness.db, client, userId: USER })

    const [row] = harness.rows<Record<string, unknown>>('customers')
    expect(row).not.toHaveProperty('unknown_column')
  })

  it('ردیف‌های صف را دست نمی‌زند', async () => {
    const harness = createTestDb()
    const repo = new CustomerRepository(harness.db, USER)
    await repo.create({ name: 'علی' })
    await addToOutbox(harness.db, {
      entity_type: 'customers',
      entity_id: 'other',
      operation: 'update',
      payload: JSON.stringify({ id: 'other' }),
    })

    const { client } = createFakeClient()
    await pullFromCloud({ db: harness.db, client, userId: USER })

    expect(harness.outboxRows()).toHaveLength(2)
  })
})

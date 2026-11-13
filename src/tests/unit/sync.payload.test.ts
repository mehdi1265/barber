import { describe, it, expect } from 'vitest'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { buildPushEntity, normalizeRemoteRow, tableFor, toRemoteRow } from '@sync/engine/payload'
import type { SyncOutbox } from '@shared/types'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-1'

async function firstOutboxEntry(db: Parameters<typeof addToOutbox>[0]): Promise<SyncOutbox> {
  const result = await db.query('SELECT * FROM sync_outbox LIMIT 1')
  return result.values?.[0] as SyncOutbox
}

describe('entity/table mapping', () => {
  it('همه موجودیت‌های پشتیبانی‌شده را به جدول ابری نگاشت می‌کند', () => {
    expect(tableFor('customers')).toBe('customers')
    expect(tableFor('appointment_services')).toBe('appointment_services')
    expect(tableFor('color_formula_items')).toBe('color_formula_items')
    expect(tableFor('customer_photos')).toBe('customer_photos')
    expect(tableFor('unknown')).toBeNull()
  })

  it('ستون‌های محلی را حذف و بولین‌ها را تبدیل می‌کند', () => {
    const row = toRemoteRow('customer_photos', {
      id: 'p-1',
      local_path: '/private/photo.jpg',
      storage_path: null,
      consent_given: 1,
      photo_type: 'after',
    })

    expect(row).not.toHaveProperty('local_path')
    expect(row.consent_given).toBe(true)
    expect(toRemoteRow('services', { id: 's-1', is_active: 0 }).is_active).toBe(false)
    expect(toRemoteRow('visits', { id: 'v-1', is_quick_sale: 1 }).is_quick_sale).toBe(true)
  })

  it('ردیف ابری را به شکل SQLite محلی تبدیل می‌کند', () => {
    const row = normalizeRemoteRow('color_formula_items', {
      id: 'i-1',
      amount: '12.50',
      created_at: '2026-11-13T10:00:00+00:00',
      updated_at: '2026-11-13T10:30:00.123456+00:00',
    })

    expect(row.amount).toBe(12.5)
    expect(row.created_at).toBe('2026-11-13T10:00:00.000Z')
    expect(row.updated_at).toBe('2026-11-13T10:30:00.123Z')
    expect(normalizeRemoteRow('services', { id: 's-1', is_active: true }).is_active).toBe(1)
    expect(normalizeRemoteRow('visits', { id: 'v-1', is_quick_sale: false }).is_quick_sale).toBe(0)
  })
})

describe('buildPushEntity', () => {
  it('پیلود جزئی را با ردیف کامل محلی ادغام می‌کند', async () => {
    const { db, raw } = createTestDb()
    const now = '2026-11-13T10:00:00.000Z'
    raw
      .prepare(
        `INSERT INTO services
          (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run('svc-1', USER, 'اصلاح سر', 250000, 30, now, now)

    await addToOutbox(db, {
      entity_type: 'services',
      entity_id: 'svc-1',
      operation: 'update',
      payload: JSON.stringify({ id: 'svc-1', is_active: false, updated_at: now }),
    })
    const entry = await firstOutboxEntry(db)

    const push = await buildPushEntity(db, entry, USER)

    expect(push.mode).toBe('upsert')
    if (push.mode !== 'upsert') return
    expect(push.table).toBe('services')
    expect(push.row).toMatchObject({
      id: 'svc-1',
      name: 'اصلاح سر',
      default_price: 250000,
      is_active: false,
      user_id: USER,
    })
  })

  it('حذف نرم را به tombstone کامل با updated_at تبدیل می‌کند', async () => {
    const { db, raw } = createTestDb()
    const created = '2026-11-13T09:00:00.000Z'
    const deleted = '2026-11-13T10:00:00.000Z'
    raw
      .prepare(
        `INSERT INTO customers
          (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`
      )
      .run('cus-1', USER, 'علی', created, deleted, deleted)

    await addToOutbox(db, {
      entity_type: 'customers',
      entity_id: 'cus-1',
      operation: 'delete',
      payload: JSON.stringify({ id: 'cus-1', deleted_at: deleted }),
    })
    const entry = await firstOutboxEntry(db)

    const push = await buildPushEntity(db, entry, USER)

    expect(push.mode).toBe('upsert')
    if (push.mode !== 'upsert') return
    expect(push.row.deleted_at).toBe(deleted)
    expect(push.row.updated_at).toBe(deleted)
    expect(push.row.name).toBe('علی')
  })

  it('حذف سخت فقط شناسه را برمی‌گرداند', async () => {
    const { db } = createTestDb()
    await addToOutbox(db, {
      entity_type: 'appointment_services',
      entity_id: 'as-1',
      operation: 'delete',
      payload: JSON.stringify({ id: 'as-1' }),
    })
    const entry = await firstOutboxEntry(db)

    const push = await buildPushEntity(db, entry, USER)
    expect(push).toEqual({ table: 'appointment_services', mode: 'delete', id: 'as-1' })
  })

  it('برای عکس دارای فایل محلی، مسیر آپلود را جدا می‌کند', async () => {
    const { db, raw } = createTestDb()
    const now = '2026-11-13T10:00:00.000Z'
    raw
      .prepare(
        `INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
         VALUES (?, ?, 'مشتری', NULL, NULL, ?, ?, NULL)`
      )
      .run('cus-1', USER, now, now)
    raw
      .prepare(
        `INSERT INTO customer_photos
          (id, user_id, customer_id, visit_id, storage_path, local_path,
           photo_type, caption, consent_given, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, NULL, ?, 'before', NULL, 1, ?, ?, NULL)`
      )
      .run('ph-1', USER, 'cus-1', 'photos/user-1/ph-1.jpg', now, now)

    await addToOutbox(db, {
      entity_type: 'customer_photos',
      entity_id: 'ph-1',
      operation: 'insert',
      payload: JSON.stringify({ id: 'ph-1' }),
    })
    const entry = await firstOutboxEntry(db)

    const push = await buildPushEntity(db, entry, USER)

    expect(push.mode).toBe('upsert')
    if (push.mode !== 'upsert') return
    expect(push.row).not.toHaveProperty('local_path')
    expect(push.row.consent_given).toBe(true)
    expect(push.photo).toEqual({
      userId: USER,
      photoId: 'ph-1',
      customerId: 'cus-1',
      localPath: 'photos/user-1/ph-1.jpg',
    })
  })

  it('نوع موجودیت ناشناخته یا پیلود خراب را رد می‌کند', async () => {
    const { db } = createTestDb()
    await expect(
      buildPushEntity(
        db,
        { entity_type: 'aliens', entity_id: 'x', operation: 'insert', payload: '{}' },
        USER
      )
    ).rejects.toThrow(/Unsupported sync entity type/)

    await expect(
      buildPushEntity(
        db,
        { entity_type: 'customers', entity_id: 'x', operation: 'insert', payload: '{broken' },
        USER
      )
    ).rejects.toThrow(/Invalid outbox payload/)
  })
})

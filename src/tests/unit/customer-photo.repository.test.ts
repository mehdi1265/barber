import { describe, it, expect } from 'vitest'
import { CustomerPhotoRepository } from '@database/repositories/customer-photo.repository'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-1'

function addCustomer(harness: ReturnType<typeof createTestDb>, id: string): void {
  const now = '2026-01-01T00:00:00.000Z'
  harness.raw
    .prepare(
      `INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'مشتری', NULL, NULL, ?, ?, NULL)`
    )
    .run(id, USER, now, now)
}

describe('CustomerPhotoRepository', () => {
  it('عکس را همراه یک ردیف outbox ذخیره می‌کند و بدون رضایت رد می‌کند', async () => {
    const harness = createTestDb()
    addCustomer(harness, 'cus-1')
    const repo = new CustomerPhotoRepository(harness.db, USER)

    await expect(
      repo.create({
        customer_id: 'cus-1',
        local_path: 'photos/user-1/p0.jpg',
        consent_given: false,
      })
    ).rejects.toThrow(/رضایت/)
    expect(harness.countRows('customer_photos')).toBe(0)
    expect(harness.outboxRows()).toHaveLength(0)

    const photo = await repo.create({
      customer_id: 'cus-1',
      local_path: 'photos/user-1/p1.jpg',
      photo_type: 'before',
      caption: '  قبل از رنگ  ',
      consent_given: true,
    })

    expect(photo).toMatchObject({
      customer_id: 'cus-1',
      photo_type: 'before',
      caption: 'قبل از رنگ',
      storage_path: null,
      local_path: 'photos/user-1/p1.jpg',
      consent_given: true,
    })

    const rows = harness.outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity_type: 'customer_photos',
      entity_id: photo.id,
      operation: 'insert',
    })
    expect(JSON.parse(rows[0].payload) as { local_path: string }).toMatchObject({
      local_path: 'photos/user-1/p1.jpg',
    })
  })

  it('عکس‌های هر مشتری را تازه‌ترین‌اول برمی‌گرداند و حذف‌شده‌ها را کنار می‌گذارد', async () => {
    const harness = createTestDb()
    addCustomer(harness, 'cus-1')
    addCustomer(harness, 'cus-2')
    const repo = new CustomerPhotoRepository(harness.db, USER)

    const first = await repo.create({
      customer_id: 'cus-1',
      local_path: 'photos/u/a.jpg',
      consent_given: true,
    })
    const second = await repo.create({
      customer_id: 'cus-1',
      local_path: 'photos/u/b.jpg',
      photo_type: 'after',
      consent_given: true,
    })
    await repo.create({
      customer_id: 'cus-2',
      local_path: 'photos/u/c.jpg',
      consent_given: true,
    })

    harness.raw
      .prepare('UPDATE customer_photos SET created_at = ? WHERE id = ?')
      .run('2026-01-01T10:00:00.000Z', first.id)
    harness.raw
      .prepare('UPDATE customer_photos SET created_at = ? WHERE id = ?')
      .run('2026-01-02T10:00:00.000Z', second.id)

    const list = await repo.listByCustomer('cus-1')
    expect(list.map(photo => photo.id)).toEqual([second.id, first.id])

    await repo.delete(first.id)
    expect(await repo.findById(first.id)).toBeNull()
    expect((await repo.listByCustomer('cus-1')).map(photo => photo.id)).toEqual([second.id])
  })

  it('حذف، tombstone می‌نویسد و مسیر فایل محلی را برمی‌گرداند', async () => {
    const harness = createTestDb()
    const repo = new CustomerPhotoRepository(harness.db, USER)

    const photo = await repo.create({
      customer_id: null,
      local_path: 'photos/user-1/p9.jpg',
      consent_given: true,
    })

    const localPath = await repo.delete(photo.id)
    expect(localPath).toBe('photos/user-1/p9.jpg')

    const stored = harness.raw
      .prepare('SELECT deleted_at, storage_path FROM customer_photos WHERE id = ?')
      .get(photo.id) as { deleted_at: string | null; storage_path: string | null }
    expect(stored.deleted_at).not.toBeNull()

    const deleteEntry = harness
      .outboxRows()
      .find(row => row.entity_type === 'customer_photos' && row.operation === 'delete')
    expect(deleteEntry).toBeDefined()
    expect((JSON.parse(deleteEntry!.payload) as { deleted_at: string }).deleted_at).toBe(
      stored.deleted_at
    )

    expect(await repo.delete(photo.id)).toBeNull()
  })
})

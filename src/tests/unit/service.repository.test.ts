import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ServiceRepository } from '@database/repositories/service.repository'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

type Row = Record<string, unknown>

function createMockDb() {
  const tables: Record<string, Row[]> = {
    services: [],
    sync_outbox: [],
  }

  const db = {
    query: vi.fn((sql: string, params: unknown[]) => {
      const s = sql.toLowerCase()

      if (s.includes('from services')) {
        // findById
        if (s.includes('where id = ?')) {
          const [id, uid] = params as string[]
          const row = tables.services.find(r => r.id === id && r.user_id === uid)
          return { values: row ? [row] : [] }
        }
        // search
        if (s.includes('like')) {
          const uid = params[0] as string
          const q = (params[1] as string).replace(/%/g, '')
          const rows = tables.services.filter(
            r => r.user_id === uid && r.is_active && String(r.name).includes(q)
          )
          return { values: rows }
        }
        // findAll
        const uid = params[0] as string
        const activeOnly = s.includes('is_active = 1')
        const rows = tables.services.filter(r => r.user_id === uid && (!activeOnly || r.is_active))
        return { values: rows }
      }

      return { values: [] }
    }),

    run: vi.fn((sql: string, params: unknown[]) => {
      const s = sql.toLowerCase()

      if (s.startsWith('insert into services')) {
        const [
          id,
          user_id,
          name,
          default_price,
          suggested_duration_minutes,
          created_at,
          updated_at,
        ] = params
        tables.services.push({
          id,
          user_id,
          name,
          default_price,
          suggested_duration_minutes,
          is_active: true,
          created_at,
          updated_at,
        })
      }

      if (s.startsWith('update services')) {
        if (s.includes('is_active = 0')) {
          const id = params[1] as string
          const row = tables.services.find(r => r.id === id)
          if (row) row.is_active = false
        } else {
          const [name, default_price, suggested_duration_minutes, is_active, updated_at, id] =
            params
          const row = tables.services.find(r => r.id === id)
          if (row) {
            row.name = name
            row.default_price = default_price
            row.suggested_duration_minutes = suggested_duration_minutes
            row.is_active = !!is_active
            row.updated_at = updated_at
          }
        }
      }

      if (s.includes('sync_outbox')) {
        tables.sync_outbox.push({ id: params[0] })
      }
    }),

    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),

    _tables: tables,
  }

  return db as unknown as SQLiteDBConnection & { _tables: typeof tables }
}

const USER_ID = 'user-svc-001'

describe('ServiceRepository', () => {
  let db: ReturnType<typeof createMockDb>
  let repo: ServiceRepository

  beforeEach(() => {
    db = createMockDb()
    repo = new ServiceRepository(db, USER_ID)
  })

  describe('create', () => {
    it('خدمت جدید ایجاد و برمی‌گرداند', async () => {
      const svc = await repo.create({ name: 'کوتاهی', default_price: 150000 })
      expect(svc.name).toBe('کوتاهی')
      expect(svc.is_active).toBe(true)
      expect(svc.user_id).toBe(USER_ID)
    })

    it('قیمت تومان به storage تبدیل می‌شود (×100)', async () => {
      const svc = await repo.create({ name: 'رنگ', default_price: 500000 })
      // 500000 toman → 50000000 in storage
      expect(svc.default_price).toBe(500000 * 100)
    })

    it('بدون قیمت قابل ایجاد است', async () => {
      const svc = await repo.create({ name: 'مشاوره' })
      expect(svc.default_price).toBeNull()
    })

    it('outbox رکورد ثبت می‌کند', async () => {
      await repo.create({ name: 'تست' })
      expect(db._tables.sync_outbox.length).toBeGreaterThan(0)
    })
  })

  describe('findAll', () => {
    it('فقط خدمات فعال برمی‌گرداند', async () => {
      const svc = await repo.create({ name: 'خدمت فعال' })
      await repo.deactivate(svc.id)
      const actives = await repo.findAll(true)
      expect(actives.find(s => s.id === svc.id)).toBeUndefined()
    })
  })

  describe('update', () => {
    it('اطلاعات خدمت را به‌روز می‌کند', async () => {
      const svc = await repo.create({ name: 'قدیمی' })
      const updated = await repo.update(svc.id, { name: 'جدید' })
      expect(updated?.name).toBe('جدید')
    })

    it('برای آیدی ناموجود null برمی‌گرداند', async () => {
      const result = await repo.update('no-id', { name: 'تست' })
      expect(result).toBeNull()
    })
  })

  describe('deactivate', () => {
    it('خدمت را غیرفعال می‌کند', async () => {
      const svc = await repo.create({ name: 'برای غیرفعال' })
      await repo.deactivate(svc.id)
      const row = db._tables.services.find(r => r.id === svc.id)
      expect(row?.is_active).toBe(false)
    })
  })
})

/**
 * Tests for CustomerRepository.
 * Uses an in-memory mock of SQLiteDBConnection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CustomerRepository } from '@database/repositories/customer.repository'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

// ── In-memory SQLite mock ──────────────────────────────────────────────────────

type Row = Record<string, unknown>

function createMockDb() {
  const tables: Record<string, Row[]> = {
    customers: [],
    sync_outbox: [],
  }

  const db = {
    query: vi.fn((sql: string, params: unknown[]) => {
      const sqlLower = sql.toLowerCase().trim()

      // COUNT(*)
      if (sqlLower.includes('count(*)')) {
        const table = sqlLower.match(/from (\w+)/)?.[1] ?? ''
        const rows = tables[table] ?? []
        const userId = params[0] as string
        const cnt = rows.filter(
          r => r.user_id === userId && r.deleted_at === null
        ).length
        return { values: [{ cnt }] }
      }

      // SELECT customers
      if (sqlLower.includes('from customers')) {
        // findById: WHERE id = ? AND user_id = ? (id comes first)
        if (sqlLower.includes('where id = ?')) {
          const id = params[0] as string
          const uid = params[1] as string
          const row = tables.customers.find(
            r => r.id === id && r.user_id === uid && r.deleted_at === null
          )
          return { values: row ? [row] : [] }
        }

        // search with LIKE: WHERE user_id = ? AND ... LIKE ?
        if (sqlLower.includes('like')) {
          const userId = params[0] as string
          const likeParam = (params[1] as string).replace(/%/g, '')
          const rows = tables.customers.filter(
            r =>
              r.user_id === userId &&
              r.deleted_at === null &&
              (String(r.name).includes(likeParam) ||
                String((r.phone as string | null) ?? '').includes(likeParam))
          )
          return { values: rows }
        }

        // findAll: WHERE user_id = ?
        const userId = params[0] as string
        const rows = tables.customers.filter(
          r => r.user_id === userId && r.deleted_at === null
        )
        return { values: rows }
      }

      return { values: [] }
    }),

    run: vi.fn((sql: string, params: unknown[]) => {
      const sqlLower = sql.toLowerCase().trim()

      if (sqlLower.startsWith('insert into customers')) {
        const [id, user_id, name, phone, notes, created_at, updated_at] = params
        tables.customers.push({
          id, user_id, name, phone, notes, created_at, updated_at, deleted_at: null,
        })
      }

      if (sqlLower.startsWith('update customers')) {
        if (sqlLower.includes('deleted_at')) {
          // soft delete
          const id = params[2] as string
          const row = tables.customers.find(r => r.id === id)
          if (row) {
            row.deleted_at = params[0]
            row.updated_at = params[1]
          }
        } else {
          // update
          const [name, phone, notes, updated_at, id] = params
          const row = tables.customers.find(r => r.id === id)
          if (row) {
            row.name = name
            row.phone = phone
            row.notes = notes
            row.updated_at = updated_at
          }
        }
      }

      if (sqlLower.startsWith('insert into sync_outbox')) {
        tables.sync_outbox.push({ id: params[0] })
      }
    }),

    _tables: tables,
  }

  return db as unknown as SQLiteDBConnection & { _tables: typeof tables }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-001'

describe('CustomerRepository', () => {
  let db: ReturnType<typeof createMockDb>
  let repo: CustomerRepository

  beforeEach(() => {
    db = createMockDb()
    repo = new CustomerRepository(db, USER_ID)
  })

  describe('create', () => {
    it('مشتری جدید ایجاد می‌کند و برمی‌گرداند', async () => {
      const customer = await repo.create({ name: 'سارا محمدی', phone: '09121234567' })

      expect(customer.name).toBe('سارا محمدی')
      expect(customer.phone).toBe('09121234567')
      expect(customer.user_id).toBe(USER_ID)
      expect(customer.id).toBeTruthy()
      expect(customer.deleted_at).toBeNull()
    })

    it('فضاهای اضافه نام را trim می‌کند', async () => {
      const customer = await repo.create({ name: '  علی  ' })
      expect(customer.name).toBe('علی')
    })

    it('رکورد outbox ثبت می‌کند', async () => {
      await repo.create({ name: 'تست' })
      const outbox = db._tables.sync_outbox
      expect(outbox.length).toBeGreaterThan(0)
    })

    it('phone خالی به null تبدیل می‌شود', async () => {
      const customer = await repo.create({ name: 'بدون شماره', phone: null })
      expect(customer.phone).toBeNull()
    })
  })

  describe('findAll', () => {
    it('مشتریان حذف‌شده برنمی‌گرداند', async () => {
      await repo.create({ name: 'مشتری فعال' })
      const all = await repo.findAll()
      expect(all.every(c => c.deleted_at === null)).toBe(true)
    })

    it('لیست خالی وقتی مشتری نیست', async () => {
      const all = await repo.findAll()
      expect(all).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('اطلاعات مشتری را به‌روز می‌کند', async () => {
      const created = await repo.create({ name: 'قدیم' })
      const updated = await repo.update(created.id, { name: 'جدید' })
      expect(updated?.name).toBe('جدید')
    })

    it('برای مشتری ناموجود null برمی‌گرداند', async () => {
      const result = await repo.update('non-existent-id', { name: 'تست' })
      expect(result).toBeNull()
    })
  })

  describe('delete (soft)', () => {
    it('مشتری را soft delete می‌کند', async () => {
      const customer = await repo.create({ name: 'برای حذف' })
      await repo.delete(customer.id)

      const row = db._tables.customers.find(r => r.id === customer.id)
      expect(row?.deleted_at).not.toBeNull()
    })

    it('بعد از حذف در findAll نمی‌آید', async () => {
      const customer = await repo.create({ name: 'حذف‌شده' })
      await repo.delete(customer.id)

      const all = await repo.findAll()
      expect(all.find(c => c.id === customer.id)).toBeUndefined()
    })
  })

  describe('search', () => {
    it('جست‌وجو با نام کار می‌کند', async () => {
      await repo.create({ name: 'مریم احمدی' })
      await repo.create({ name: 'علی حسینی' })

      const results = await repo.search('مریم')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].name).toContain('مریم')
    })
  })
})

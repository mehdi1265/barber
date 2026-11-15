/**
 * Tests for CustomerRepository.
 * Runs against a real in-memory SQLite database (node:sqlite), so the actual
 * SQL, constraints, transactions, and outbox rows are exercised.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CustomerRepository } from '@database/repositories/customer.repository'
import type { Customer } from '@shared/types'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

type OutboxPayload = { name?: string; id?: string }

const USER_ID = 'user-test-001'
const OTHER_USER = 'user-test-002'

describe('CustomerRepository (real SQLite)', () => {
  let harness: TestDb
  let repo: CustomerRepository

  beforeEach(() => {
    harness = createTestDb()
    repo = new CustomerRepository(harness.db, USER_ID)
  })

  describe('create', () => {
    it('مشتری جدید در دیتابیس ذخیره می‌کند', async () => {
      const customer = await repo.create({ name: 'سارا محمدی', phone: '09121234567' })

      expect(customer.name).toBe('سارا محمدی')
      expect(customer.phone).toBe('09121234567')
      expect(customer.user_id).toBe(USER_ID)
      expect(customer.deleted_at).toBeNull()

      const rows = harness.rows<Customer>('customers')
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(customer.id)
      expect(rows[0].name).toBe('سارا محمدی')
    })

    it('فضاهای اضافه نام را trim می‌کند', async () => {
      const customer = await repo.create({ name: '  علی  ' })
      expect(customer.name).toBe('علی')
      expect(harness.rows<Customer>('customers')[0].name).toBe('علی')
    })

    it('phone خالی به null تبدیل می‌شود', async () => {
      const customer = await repo.create({ name: 'بدون شماره', phone: null })
      expect(customer.phone).toBeNull()
      expect(harness.rows<Customer>('customers')[0].phone).toBeNull()
    })

    it('یک ردیف outbox از نوع insert برای همین کاربر ثبت می‌کند', async () => {
      const customer = await repo.create({ name: 'تست' })
      const outbox = harness.outboxRows()
      expect(outbox).toHaveLength(1)
      expect(outbox[0].entity_type).toBe('customers')
      expect(outbox[0].entity_id).toBe(customer.id)
      expect(outbox[0].operation).toBe('insert')
      expect(outbox[0].user_id).toBe(USER_ID)
      expect(outbox[0].status).toBe('pending')
      expect((JSON.parse(outbox[0].payload) as OutboxPayload).name).toBe('تست')
    })
  })

  describe('findAll / findById', () => {
    it('لیست خالی وقتی مشتری نیست', async () => {
      expect(await repo.findAll()).toHaveLength(0)
    })

    it('مشتریان حذف‌شده را برنمی‌گرداند', async () => {
      const kept = await repo.create({ name: 'مشتری فعال' })
      const removed = await repo.create({ name: 'حذف‌شده' })
      await repo.delete(removed.id)

      const all = await repo.findAll()
      expect(all.map(c => c.id)).toEqual([kept.id])
      expect(all.every(c => c.deleted_at === null)).toBe(true)
    })

    it('ردیف کاربر دیگر را برنمی‌گرداند', async () => {
      const other = new CustomerRepository(harness.db, OTHER_USER)
      const foreign = await other.create({ name: 'مشتری دیگر' })

      expect(await repo.findById(foreign.id)).toBeNull()
      expect(await repo.findAll()).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('اطلاعات مشتری را در دیتابیس به‌روز می‌کند', async () => {
      const created = await repo.create({ name: 'قدیم', phone: '09120000000' })
      const updated = await repo.update(created.id, { name: 'جدید' })

      expect(updated?.name).toBe('جدید')
      expect(updated?.phone).toBe('09120000000')
      const row = harness.rows<Customer>('customers')[0]
      expect(row.name).toBe('جدید')
      expect(row.phone).toBe('09120000000')
      expect(row.updated_at).toBe(updated?.updated_at)
    })

    it('برای مشتری ناموجود null برمی‌گرداند و outbox نمی‌نویسد', async () => {
      const before = harness.countRows('sync_outbox')
      expect(await repo.update('non-existent-id', { name: 'تست' })).toBeNull()
      expect(harness.countRows('sync_outbox')).toBe(before)
    })

    it('ردیف کاربر دیگر را به‌روز نمی‌کند', async () => {
      const other = new CustomerRepository(harness.db, OTHER_USER)
      const foreign = await other.create({ name: 'مالک دیگر' })

      expect(await repo.update(foreign.id, { name: 'دستکاری' })).toBeNull()
      expect(harness.rows<Customer>('customers')[0].name).toBe('مالک دیگر')
    })

    it('یک ردیف outbox از نوع update ثبت می‌کند', async () => {
      const created = await repo.create({ name: 'قدیم' })
      await repo.update(created.id, { name: 'جدید' })

      const updates = harness.outboxRows().filter(r => r.operation === 'update')
      expect(updates).toHaveLength(1)
      expect(updates[0].entity_id).toBe(created.id)
      expect((JSON.parse(updates[0].payload) as OutboxPayload).name).toBe('جدید')
    })
  })

  describe('delete (soft)', () => {
    it('deleted_at را در دیتابیس تنظیم می‌کند', async () => {
      const customer = await repo.create({ name: 'برای حذف' })
      await repo.delete(customer.id)

      const row = harness.rows<Customer>('customers')[0]
      expect(row.deleted_at).not.toBeNull()
      expect(row.id).toBe(customer.id)
    })

    it('بعد از حذف در findAll نمی‌آید', async () => {
      const customer = await repo.create({ name: 'حذف‌شده' })
      await repo.delete(customer.id)
      expect(await repo.findAll()).toHaveLength(0)
    })

    it('حذف دوباره ردیف تکراری در outbox نمی‌سازد', async () => {
      const customer = await repo.create({ name: 'تکراری' })
      await repo.delete(customer.id)
      const afterFirst = harness.countRows('sync_outbox')
      await repo.delete(customer.id)
      expect(harness.countRows('sync_outbox')).toBe(afterFirst)
    })

    it('یک ردیف outbox از نوع delete ثبت می‌کند', async () => {
      const customer = await repo.create({ name: 'برای حذف' })
      await repo.delete(customer.id)

      const deletes = harness.outboxRows().filter(r => r.operation === 'delete')
      expect(deletes).toHaveLength(1)
      expect(deletes[0].entity_id).toBe(customer.id)
      expect((JSON.parse(deletes[0].payload) as OutboxPayload).id).toBe(customer.id)
    })

    it('ردیف کاربر دیگر را حذف نمی‌کند', async () => {
      const other = new CustomerRepository(harness.db, OTHER_USER)
      const foreign = await other.create({ name: 'مالک دیگر' })
      const before = harness.countRows('sync_outbox')

      await repo.delete(foreign.id)

      expect(harness.rows<Customer>('customers')[0].deleted_at).toBeNull()
      expect(harness.countRows('sync_outbox')).toBe(before)
    })
  })

  describe('search', () => {
    it('با نام جست‌وجو می‌کند', async () => {
      await repo.create({ name: 'مریم احمدی' })
      await repo.create({ name: 'علی حسینی' })

      const results = await repo.search('مریم')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('مریم احمدی')
    })

    it('با شماره تلفن جست‌وجو می‌کند', async () => {
      await repo.create({ name: 'سارا', phone: '09121234567' })
      await repo.create({ name: 'علی', phone: '09350000000' })

      const results = await repo.search('0912')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('سارا')
    })

    it('ردیف حذف‌شده را برنمی‌گرداند', async () => {
      const customer = await repo.create({ name: 'مریم' })
      await repo.delete(customer.id)
      expect(await repo.search('مریم')).toHaveLength(0)
    })
  })

  describe('countAll', () => {
    it('فقط ردیف‌های فعال همین کاربر را می‌شمارد', async () => {
      await repo.create({ name: 'یک' })
      const second = await repo.create({ name: 'دو' })
      await repo.delete(second.id)
      await new CustomerRepository(harness.db, OTHER_USER).create({ name: 'دیگری' })

      expect(await repo.countAll()).toBe(1)
    })
  })
})

/**
 * Tests for ServiceRepository.
 * Runs against a real in-memory SQLite database (node:sqlite), so the actual
 * SQL, constraints, transactions, and outbox rows are exercised.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ServiceRepository } from '@database/repositories/service.repository'
import type { Service } from '@shared/types'
import { tomanToStorage } from '@shared/utils/helpers'
import { createTestDb, type TestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-svc-001'
const OTHER_USER = 'user-svc-002'

type OutboxPayload = {
  name?: string
  default_price?: number | null
  is_active?: boolean
}

describe('ServiceRepository (real SQLite)', () => {
  let harness: TestDb
  let repo: ServiceRepository

  beforeEach(() => {
    harness = createTestDb()
    repo = new ServiceRepository(harness.db, USER_ID)
  })

  describe('create', () => {
    it('خدمت جدید را در دیتابیس ذخیره می‌کند', async () => {
      const svc = await repo.create({
        name: 'کوتاهی',
        default_price: 150000,
        suggested_duration_minutes: 30,
      })

      expect(svc.name).toBe('کوتاهی')
      expect(svc.user_id).toBe(USER_ID)
      expect(svc.is_active).toBe(true)

      const rows = harness.rows<Service>('services')
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(svc.id)
      expect(rows[0].name).toBe('کوتاهی')
      expect(rows[0].suggested_duration_minutes).toBe(30)
    })

    it('قیمت تومان در دیتابیس به storage تبدیل می‌شود (×100)', async () => {
      const svc = await repo.create({ name: 'رنگ', default_price: 500000 })

      expect(svc.default_price).toBe(tomanToStorage(500000))
      expect(svc.default_price).toBe(50_000_000)
      expect(harness.rows<Service>('services')[0].default_price).toBe(50_000_000)
    })

    it('بدون قیمت، مقدار null ذخیره می‌شود', async () => {
      const svc = await repo.create({ name: 'مشاوره' })

      expect(svc.default_price).toBeNull()
      expect(harness.rows<Service>('services')[0].default_price).toBeNull()
    })

    it('نام را trim می‌کند', async () => {
      const svc = await repo.create({ name: '  اصلاح  ' })
      expect(svc.name).toBe('اصلاح')
    })

    it('یک رکورد insert در outbox ثبت می‌کند', async () => {
      const svc = await repo.create({ name: 'تست', default_price: 1000 })

      const outbox = harness.outboxRows()
      expect(outbox).toHaveLength(1)
      expect(outbox[0]).toMatchObject({
        user_id: USER_ID,
        entity_type: 'services',
        entity_id: svc.id,
        operation: 'insert',
        status: 'pending',
      })

      const payload = JSON.parse(outbox[0].payload) as OutboxPayload
      expect(payload.name).toBe('تست')
      expect(payload.default_price).toBe(tomanToStorage(1000))
    })
  })

  describe('findById', () => {
    it('خدمت ذخیره‌شده را برمی‌گرداند', async () => {
      const svc = await repo.create({ name: 'ریش' })
      const found = await repo.findById(svc.id)
      expect(found?.id).toBe(svc.id)
      expect(found?.name).toBe('ریش')
    })

    it('برای آیدی ناموجود null برمی‌گرداند', async () => {
      expect(await repo.findById('missing-id')).toBeNull()
    })

    it('خدمت متعلق به حساب دیگر را برنمی‌گرداند', async () => {
      const svc = await repo.create({ name: 'خصوصی' })
      const otherRepo = new ServiceRepository(harness.db, OTHER_USER)

      expect(await otherRepo.findById(svc.id)).toBeNull()
      expect(await otherRepo.findAll(false)).toHaveLength(0)
    })
  })

  describe('findAll', () => {
    it('به‌طور پیش‌فرض فقط خدمات فعال را برمی‌گرداند', async () => {
      const active = await repo.create({ name: 'فعال' })
      const inactive = await repo.create({ name: 'غیرفعال' })
      await repo.deactivate(inactive.id)

      const actives = await repo.findAll()
      expect(actives.map(s => s.id)).toEqual([active.id])

      const all = await repo.findAll(false)
      expect(all.map(s => s.id).sort()).toEqual([active.id, inactive.id].sort())
    })

    it('خدمات حساب دیگر را برنمی‌گرداند', async () => {
      await repo.create({ name: 'مال من' })
      const otherRepo = new ServiceRepository(harness.db, OTHER_USER)
      await otherRepo.create({ name: 'مال دیگری' })

      const mine = await repo.findAll(false)
      expect(mine).toHaveLength(1)
      expect(mine[0].name).toBe('مال من')
    })
  })

  describe('search', () => {
    it('نام‌های شامل عبارت جستجو را برمی‌گرداند', async () => {
      await repo.create({ name: 'کوتاهی مو' })
      await repo.create({ name: 'رنگ مو' })
      await repo.create({ name: 'اصلاح ریش' })

      const results = await repo.search('مو')
      expect(results.map(s => s.name).sort()).toEqual(['رنگ مو', 'کوتاهی مو'].sort())
    })

    it('خدمات غیرفعال در جستجو پیدا نمی‌شوند', async () => {
      const svc = await repo.create({ name: 'کوتاهی ویژه' })
      await repo.deactivate(svc.id)

      expect(await repo.search('کوتاهی')).toHaveLength(0)
    })
  })

  describe('update', () => {
    it('اطلاعات خدمت را به‌روزرسانی می‌کند', async () => {
      const svc = await repo.create({ name: 'قدیمی', default_price: 100000 })

      const updated = await repo.update(svc.id, {
        name: 'جدید',
        default_price: 200000,
        suggested_duration_minutes: 45,
      })

      expect(updated?.name).toBe('جدید')
      expect(updated?.default_price).toBe(tomanToStorage(200000))

      const row = harness.rows<Service>('services')[0]
      expect(row.name).toBe('جدید')
      expect(row.default_price).toBe(tomanToStorage(200000))
      expect(row.suggested_duration_minutes).toBe(45)

      const operations = harness.outboxRows().map(r => r.operation)
      expect(operations).toEqual(['insert', 'update'])
    })

    it('قیمت را می‌توان به null تغییر داد', async () => {
      const svc = await repo.create({ name: 'با قیمت', default_price: 50000 })
      const updated = await repo.update(svc.id, { default_price: null })

      expect(updated?.default_price).toBeNull()
      expect(harness.rows<Service>('services')[0].default_price).toBeNull()
    })

    it('برای آیدی ناموجود null برمی‌گرداند و outbox نمی‌نویسد', async () => {
      const result = await repo.update('no-id', { name: 'تست' })
      expect(result).toBeNull()
      expect(harness.outboxRows()).toHaveLength(0)
    })

    it('خدمت حساب دیگر را تغییر نمی‌دهد', async () => {
      const svc = await repo.create({ name: 'مال من' })
      const otherRepo = new ServiceRepository(harness.db, OTHER_USER)

      expect(await otherRepo.update(svc.id, { name: 'دستکاری' })).toBeNull()
      expect(harness.rows<Service>('services')[0].name).toBe('مال من')
      expect(harness.outboxRows()).toHaveLength(1)
    })
  })

  describe('deactivate', () => {
    it('خدمت را غیرفعال می‌کند و update در outbox ثبت می‌کند', async () => {
      const svc = await repo.create({ name: 'برای غیرفعال' })
      await repo.deactivate(svc.id)

      expect(harness.rows<{ is_active: number }>('services')[0].is_active).toBe(0)

      const outbox = harness.outboxRows()
      expect(outbox).toHaveLength(2)
      expect(outbox[1]).toMatchObject({
        entity_type: 'services',
        entity_id: svc.id,
        operation: 'update',
        user_id: USER_ID,
      })
      const payload = JSON.parse(outbox[1].payload) as OutboxPayload
      expect(payload.is_active).toBe(false)
    })

    it('برای آیدی ناموجود کاری انجام نمی‌دهد', async () => {
      await repo.deactivate('missing-id')
      expect(harness.outboxRows()).toHaveLength(0)
    })
  })
})

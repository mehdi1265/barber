import { describe, it, expect } from 'vitest'
import { SearchRepository } from '@features/search/search.repository'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-search-1'
const OTHER = 'user-search-2'
const TS = '2026-01-01T00:00:00.000Z'

function seed(harness: ReturnType<typeof createTestDb>) {
  harness.exec(`
    INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at) VALUES
      ('cus-1', '${USER}', 'سارا محمدی', '09121234567', NULL, '${TS}', '${TS}', NULL),
      ('cus-2', '${USER}', 'رضا کریمی', '۰۹۳۵۱۱۱۲۲۳۳', NULL, '${TS}', '${TS}', NULL),
      ('cus-3', '${USER}', 'مشتری حذف‌شده', '09120000000', NULL, '${TS}', '${TS}', '${TS}'),
      ('cus-4', '${USER}', 'تخفیف 100%', NULL, NULL, '${TS}', '${TS}', NULL),
      ('cus-5', '${OTHER}', 'سارای دیگر', '09129999999', NULL, '${TS}', '${TS}', NULL),
      ('cus-6', '${USER}', 'مریم یک', NULL, NULL, '${TS}', '${TS}', NULL),
      ('cus-7', '${USER}', 'مریم دو', NULL, NULL, '${TS}', '${TS}', NULL),
      ('cus-8', '${USER}', 'مریم سه', NULL, NULL, '${TS}', '${TS}', NULL);

    INSERT INTO services (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at) VALUES
      ('svc-1', '${USER}', 'کوتاهی مو', 500000, 30, 1, '${TS}', '${TS}'),
      ('svc-2', '${USER}', 'اصلاح ریش قدیمی', 300000, 20, 0, '${TS}', '${TS}');

    INSERT INTO appointments (id, user_id, customer_id, title, start_at, duration_minutes, end_at, status, notes, created_at, updated_at, deleted_at) VALUES
      ('apt-1', '${USER}', 'cus-1', 'رنگ و مش', '2026-02-01T10:00:00.000Z', 60, '2026-02-01T11:00:00.000Z', 'reserved', NULL, '${TS}', '${TS}', NULL),
      ('apt-2', '${USER}', 'cus-1', 'نوبت قدیمی', '2026-01-20T10:00:00.000Z', 30, '2026-01-20T10:30:00.000Z', 'completed', NULL, '${TS}', '${TS}', NULL),
      ('apt-3', '${USER}', 'cus-2', 'نوبت حذف‌شده', '2026-01-21T10:00:00.000Z', 30, '2026-01-21T10:30:00.000Z', 'reserved', NULL, '${TS}', '${TS}', '${TS}');

    INSERT INTO appointment_services
      (id, user_id, appointment_id, service_id, service_name_snapshot, price, duration_minutes, created_at, updated_at)
    VALUES
      ('as-1', '${USER}', 'apt-2', 'svc-2', 'اصلاح ریش قدیمی', 300000, 20, '${TS}', '${TS}');

    INSERT INTO color_formulas (id, user_id, title, brand, color_code, customer_id, created_at, updated_at) VALUES
      ('f-1', '${USER}', 'بلوند دکولوره', 'وللا', '10.1', 'cus-1', '${TS}', '${TS}');
  `)
}

describe('SearchRepository', () => {
  it('جست‌وجوی ارقام فارسی، شماره لاتین ذخیره‌شده را پیدا می‌کند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('۰۹۱۲')
    expect(results.customers.items.map(customer => customer.id)).toContain('cus-1')
    expect(results.customers.items.some(customer => customer.id === 'cus-3')).toBe(false)
  })

  it('جست‌وجوی ارقام لاتین، شماره فارسی ذخیره‌شده را پیدا می‌کند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('0935')
    expect(results.customers.items.map(customer => customer.id)).toEqual(['cus-2'])
  })

  it('رکوردهای حذف‌شده و کاربران دیگر را برنمی‌گرداند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('سارا')
    expect(results.customers.items.map(customer => customer.id)).toEqual(['cus-1'])

    const deleted = await repo.searchAll('حذف‌شده')
    expect(deleted.customers.items).toHaveLength(0)
    expect(deleted.appointments.items).toHaveLength(0)
  })

  it('سقف هر گروه را اعمال می‌کند و has_more را برمی‌گرداند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('مریم', 2)
    expect(results.customers.items).toHaveLength(2)
    expect(results.customers.has_more).toBe(true)
  })

  it('خدمات غیرفعال را بعد از فعال‌ها برمی‌گرداند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('ی')
    expect(results.services.items.map(service => service.id)).toEqual(['svc-1', 'svc-2'])
    expect(results.services.items[0].is_active).toBe(1)
    expect(results.services.items[1].is_active).toBe(0)
  })

  it('نوبت‌ها را با نام مشتری و نام خدمت پیدا می‌کند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const byCustomer = await repo.searchAll('سارا')
    expect(byCustomer.appointments.items.map(appointment => appointment.id).sort()).toEqual([
      'apt-1',
      'apt-2',
    ])
    expect(byCustomer.appointments.items[0].customer_name).toBe('سارا محمدی')

    const byService = await repo.searchAll('ریش')
    expect(byService.appointments.items.map(appointment => appointment.id)).toEqual(['apt-2'])
  })

  it('فرمول‌ها را با عنوان، برند، کد رنگ و نام مشتری پیدا می‌کند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    expect((await repo.searchAll('بلوند')).formulas.items).toHaveLength(1)
    expect((await repo.searchAll('وللا')).formulas.items).toHaveLength(1)
    expect((await repo.searchAll('10.1')).formulas.items).toHaveLength(1)
    expect((await repo.searchAll('سارا')).formulas.items).toHaveLength(1)
  })

  it('کاراکتر % به‌صورت متنی جست‌وجو می‌شود نه wildcard', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    const results = await repo.searchAll('%')
    expect(results.customers.items.map(customer => customer.id)).toEqual(['cus-4'])
  })

  it('عبارت خالی یا فقط فاصله نتیجه‌ای برنمی‌گرداند', async () => {
    const harness = createTestDb()
    seed(harness)
    const repo = new SearchRepository(harness.db, USER)

    for (const query of ['', '   ']) {
      const results = await repo.searchAll(query)
      expect(results.customers.items).toHaveLength(0)
      expect(results.services.items).toHaveLength(0)
      expect(results.appointments.items).toHaveLength(0)
      expect(results.formulas.items).toHaveLength(0)
    }
  })
})

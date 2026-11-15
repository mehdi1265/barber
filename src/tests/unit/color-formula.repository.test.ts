import { describe, it, expect } from 'vitest'
import { ColorFormulaRepository } from '@database/repositories/color-formula.repository'
import { createTestDb } from '../helpers/sqlite-harness'

const USER = 'user-formulas-1'

function seedCustomer(harness: ReturnType<typeof createTestDb>, id = 'cus-1', name = 'سارا') {
  harness.exec(
    `INSERT INTO customers (id, user_id, name, created_at, updated_at, deleted_at)
     VALUES ('${id}', '${USER}', '${name}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`
  )
}

describe('ColorFormulaRepository', () => {
  it('فرمول و هر سه قلم را در یک تراکنش با ردیف outbox جدا ذخیره می‌کند', async () => {
    const harness = createTestDb()
    const repo = new ColorFormulaRepository(harness.db, USER)

    const formula = await repo.create({
      title: 'بلوند دکولوره',
      brand: 'لورآل',
      color_code: '7.1',
      oxidant_type: 'کرم اکسیدان',
      oxidant_percent: 6,
      mix_ratio: '1:1.5',
      processing_minutes: 35,
      items: [
        { product_name: 'پودر دکولوره', amount: 30, unit: 'g' },
        { product_name: 'اکسیدان ۶٪', amount: 45.5, unit: 'ml' },
        { product_name: 'تونر', amount: 15.25, unit: 'g' },
      ],
    })

    expect(harness.countRows('color_formulas')).toBe(1)
    expect(harness.countRows('color_formula_items')).toBe(3)

    const outbox = harness.outboxRows()
    expect(outbox.filter(row => row.entity_type === 'color_formulas')).toHaveLength(1)
    expect(outbox.filter(row => row.entity_type === 'color_formula_items')).toHaveLength(3)
    expect(outbox.every(row => row.operation === 'insert')).toBe(true)

    const detail = await repo.findDetail(formula.id)
    expect(detail?.items.map(item => item.amount)).toEqual([30, 45.5, 15.25])
  })

  it('مقادیر را مانند ستون NUMERIC(5,2) سرور به دو رقم اعشار گرد می‌کند', async () => {
    const harness = createTestDb()
    const repo = new ColorFormulaRepository(harness.db, USER)

    const formula = await repo.create({
      title: 'تست دقت',
      oxidant_percent: 6.125,
      items: [{ product_name: 'رنگ', amount: 12.345 }],
    })

    const detail = await repo.findDetail(formula.id)
    expect(detail?.formula.oxidant_percent).toBe(6.13)
    expect(detail?.items[0].amount).toBe(12.35)
    expect(detail?.items[0].unit).toBe('g')
  })

  it('ویرایش، اقلام حذف‌شده را سخت حذف و اقلام جدید را درج می‌کند', async () => {
    const harness = createTestDb()
    const repo = new ColorFormulaRepository(harness.db, USER)

    const formula = await repo.create({
      title: 'قهوه‌ای',
      items: [
        { product_name: 'رنگ ۴', amount: 30 },
        { product_name: 'اکسیدان', amount: 45 },
      ],
    })
    const before = (await repo.findDetail(formula.id))!
    const [keep, remove] = before.items

    await repo.update(formula.id, {
      title: 'قهوه‌ای شکلاتی',
      items: [
        { id: keep.id, product_name: 'رنگ ۴', amount: 35 },
        { product_name: 'تونر', amount: 10 },
      ],
    })

    const after = (await repo.findDetail(formula.id))!
    expect(after.formula.title).toBe('قهوه‌ای شکلاتی')
    expect(after.items).toHaveLength(2)
    expect(after.items.find(item => item.id === keep.id)?.amount).toBe(35)
    expect(after.items.some(item => item.id === remove.id)).toBe(false)

    const deleteRows = harness
      .outboxRows()
      .filter(row => row.entity_type === 'color_formula_items' && row.operation === 'delete')
    expect(deleteRows).toHaveLength(1)
    expect((JSON.parse(deleteRows[0].payload) as { product_name: string }).product_name).toBe(
      'اکسیدان'
    )
  })

  it('کپی، فرمول و اقلام جدید با شناسه‌های تازه می‌سازد و اصل را تغییر نمی‌دهد', async () => {
    const harness = createTestDb()
    const repo = new ColorFormulaRepository(harness.db, USER)

    const original = await repo.create({
      title: 'مسی',
      customer_id: null,
      items: [{ product_name: 'رنگ مسی', amount: 40 }],
    })

    const copy = await repo.duplicate(original.id)
    expect(copy?.id).not.toBe(original.id)
    expect(copy?.title).toBe('مسی (کپی)')

    const originalDetail = await repo.findDetail(original.id)
    const copyDetail = await repo.findDetail(copy!.id)
    expect(originalDetail?.formula.title).toBe('مسی')
    expect(copyDetail?.items).toHaveLength(1)
    expect(copyDetail?.items[0].id).not.toBe(originalDetail?.items[0].id)
    expect(harness.countRows('color_formulas')).toBe(2)
  })

  it('حذف، اقلام و فرمول را پاک و برای هر کدام ردیف delete می‌سازد', async () => {
    const harness = createTestDb()
    const repo = new ColorFormulaRepository(harness.db, USER)

    const formula = await repo.create({
      title: 'حذف‌شدنی',
      items: [
        { product_name: 'الف', amount: 10 },
        { product_name: 'ب', amount: 20 },
      ],
    })

    await repo.delete(formula.id)

    expect(harness.countRows('color_formulas')).toBe(0)
    expect(harness.countRows('color_formula_items')).toBe(0)
    const deletes = harness.outboxRows().filter(row => row.operation === 'delete')
    expect(deletes).toHaveLength(3)
    expect(deletes.filter(row => row.entity_type === 'color_formulas')).toHaveLength(1)
    expect(deletes.filter(row => row.entity_type === 'color_formula_items')).toHaveLength(2)
  })

  it('جست‌وجو و فهرست مشتری نام مشتری و تعداد اقلام را برمی‌گرداند', async () => {
    const harness = createTestDb()
    seedCustomer(harness)
    const repo = new ColorFormulaRepository(harness.db, USER)

    await repo.create({
      title: 'بلوند',
      brand: 'وللا',
      color_code: '10.1',
      customer_id: 'cus-1',
      items: [
        { product_name: 'الف', amount: 10 },
        { product_name: 'ب', amount: 20 },
      ],
    })
    await repo.create({
      title: 'مشکی',
      brand: 'گارنیه',
      items: [{ product_name: 'ج', amount: 5 }],
    })

    const byCustomer = await repo.findByCustomer('cus-1')
    expect(byCustomer).toHaveLength(1)
    expect(byCustomer[0]).toMatchObject({ customer_name: 'سارا', item_count: 2 })

    expect(await repo.search('وللا')).toHaveLength(1)
    expect(await repo.search('سارا')).toHaveLength(1)
    expect(await repo.search('10.1')).toHaveLength(1)
    expect(await repo.search('چیزی‌که‌نیست')).toHaveLength(0)
  })

  it('خطا در میانه ساخت، کل فرمول را برمی‌گرداند', async () => {
    // 1 formula insert, 2 parent outbox, 3 first item insert
    const harness = createTestDb({ failOnRun: 3 })
    const repo = new ColorFormulaRepository(harness.db, USER)

    await expect(
      repo.create({
        title: 'نیمه‌کاره',
        items: [
          { product_name: 'الف', amount: 10 },
          { product_name: 'ب', amount: 20 },
        ],
      })
    ).rejects.toThrow('injected failure')

    expect(harness.countRows('color_formulas')).toBe(0)
    expect(harness.countRows('color_formula_items')).toBe(0)
    expect(harness.countRows('sync_outbox')).toBe(0)
  })
})

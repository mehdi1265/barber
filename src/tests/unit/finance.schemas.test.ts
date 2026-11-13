import { describe, expect, it } from 'vitest'
import { quickSaleSchema, visitSchema, expenseSchema } from '@features/finance/finance.schemas'

describe('quickSaleSchema', () => {
  it('مبلغ دریافتی بیشتر از مبلغ کل را رد می‌کند', () => {
    const result = quickSaleSchema.safeParse({
      title: 'کوتاهی',
      amount: '150000',
      payment_method: 'cash',
      paid_amount: '200000',
      customer_id: '',
      notes: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('مبلغ دریافتی نمی‌تواند از مبلغ کل بیشتر باشد')
    }
  })

  it('پرداخت خالی به معنی پرداخت کامل است (null)', () => {
    const result = quickSaleSchema.parse({
      title: 'کوتاهی',
      amount: '150000',
      payment_method: 'cash',
      paid_amount: '',
      customer_id: '',
      notes: '',
    })
    expect(result.paid_amount).toBeNull()
    expect(result.amount).toBe(150_000)
  })
})

describe('visitSchema', () => {
  it('تعداد پیش‌فرض ۱ و تخفیف خالی صفر است', () => {
    const result = visitSchema.parse({
      customer_id: '',
      date: '2026-01-15',
      time: '10:00',
      notes: '',
      payment_method: 'cash',
      paid_amount: '',
      services: [
        {
          service_id: '',
          service_name_snapshot: ' کوتاهی ',
          quantity: '',
          unit_price: '150000',
          discount_amount: '',
          duration_minutes: '',
        },
      ],
    })
    expect(result.services[0].quantity).toBe(1)
    expect(result.services[0].unit_price).toBe(150_000)
    expect(result.services[0].discount_amount).toBe(0)
    expect(result.services[0].service_name_snapshot).toBe('کوتاهی')
    expect(result.paid_amount).toBeNull()
  })

  it('حداقل یک خدمت لازم است', () => {
    const result = visitSchema.safeParse({
      date: '2026-01-15',
      time: '10:00',
      services: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('expenseSchema', () => {
  it('تاریخ الزامی است', () => {
    const result = expenseSchema.safeParse({
      title: 'اجاره',
      amount: '500000',
      date: '',
      category: '',
      note: '',
    })
    expect(result.success).toBe(false)
  })
})

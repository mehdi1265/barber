import { describe, expect, it } from 'vitest'
import { colorFormulaSchema } from '@features/color-formulas/color-formulas.schemas'

const base = {
  title: '  بلوند  ',
  brand: '',
  color_code: '',
  oxidant_type: '',
  oxidant_percent: '6',
  mix_ratio: '',
  processing_minutes: '35',
  notes: '',
  customer_id: '',
  visit_id: '',
  items: [{ product_name: '  پودر دکولوره  ', color_code: '', amount: '12.5', unit: '' }],
}

describe('colorFormulaSchema', () => {
  it('متن‌ها را تمیز و اعداد را به عدد تبدیل می‌کند', () => {
    const parsed = colorFormulaSchema.parse(base)
    expect(parsed.title).toBe('بلوند')
    expect(parsed.brand).toBeNull()
    expect(parsed.customer_id).toBeNull()
    expect(parsed.oxidant_percent).toBe(6)
    expect(parsed.processing_minutes).toBe(35)
    expect(parsed.items).toEqual([
      {
        id: undefined,
        product_name: 'پودر دکولوره',
        color_code: null,
        amount: 12.5,
        unit: 'g',
      },
    ])
  })

  it('شناسه قلم را برای ویرایش حفظ می‌کند', () => {
    const parsed = colorFormulaSchema.parse({
      ...base,
      items: [{ ...base.items[0], item_id: 'item-1' }],
    })
    expect(parsed.items[0].id).toBe('item-1')
  })

  it('مقدار صفر یا بیشتر از سقف ستون سرور را رد می‌کند', () => {
    const zero = colorFormulaSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], amount: '0' }],
    })
    expect(zero.success).toBe(false)

    const tooLarge = colorFormulaSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], amount: '1000' }],
    })
    expect(tooLarge.success).toBe(false)
  })

  it('فرمول بدون قلم یا با درصد نامعتبر را رد می‌کند', () => {
    expect(colorFormulaSchema.safeParse({ ...base, items: [] }).success).toBe(false)
    expect(colorFormulaSchema.safeParse({ ...base, oxidant_percent: '120' }).success).toBe(false)
    expect(colorFormulaSchema.safeParse({ ...base, title: '   ' }).success).toBe(false)
  })
})

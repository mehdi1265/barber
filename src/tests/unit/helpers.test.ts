import { describe, it, expect } from 'vitest'
import {
  generateUUID,
  nowISO,
  calcEndAt,
  appointmentsOverlap,
  formatToman,
  tomanToStorage,
  storageToToman,
  matchesSearch,
  normalizeDigits,
} from '@shared/utils/helpers'
import { formatMoney } from '@shared/utils/currency'

describe('generateUUID', () => {
  it('تولید UUID معتبر', () => {
    const id = generateUUID()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('هر بار UUID جدید تولید می‌کند', () => {
    expect(generateUUID()).not.toBe(generateUUID())
  })
})

describe('nowISO', () => {
  it('رشته ISO-8601 معتبر برمی‌گرداند', () => {
    const iso = nowISO()
    expect(() => new Date(iso)).not.toThrow()
    expect(new Date(iso).toISOString()).toBe(iso)
  })
})

describe('calcEndAt', () => {
  it('ساعت پایان از شروع + مدت محاسبه می‌شود', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end = calcEndAt(start, 60)
    expect(new Date(end).getTime()).toBe(new Date(start).getTime() + 60 * 60 * 1000)
  })

  it('مدت ۳۰ دقیقه‌ای درست محاسبه می‌شود', () => {
    const start = '2026-01-01T14:30:00.000Z'
    const end = calcEndAt(start, 30)
    expect(new Date(end).getUTCHours()).toBe(15)
    expect(new Date(end).getUTCMinutes()).toBe(0)
  })
})

describe('appointmentsOverlap', () => {
  const makeAppt = (startH: number, endH: number) => ({
    start_at: `2026-01-01T${String(startH).padStart(2, '0')}:00:00.000Z`,
    end_at: `2026-01-01T${String(endH).padStart(2, '0')}:00:00.000Z`,
  })

  it('تداخل واقعی تشخیص داده می‌شود', () => {
    expect(appointmentsOverlap(makeAppt(10, 11), makeAppt(10, 11))).toBe(true)
    expect(appointmentsOverlap(makeAppt(10, 12), makeAppt(11, 13))).toBe(true)
    expect(appointmentsOverlap(makeAppt(11, 13), makeAppt(10, 12))).toBe(true)
  })

  it('نوبت‌های متوالی (بدون تداخل) تداخل ندارند', () => {
    // [10,11) and [11,12) — touch but don't overlap
    expect(appointmentsOverlap(makeAppt(10, 11), makeAppt(11, 12))).toBe(false)
  })

  it('نوبت‌های کاملاً جدا تداخل ندارند', () => {
    expect(appointmentsOverlap(makeAppt(10, 11), makeAppt(14, 15))).toBe(false)
  })

  it('نوبت داخل نوبت دیگر تداخل دارد', () => {
    expect(appointmentsOverlap(makeAppt(9, 17), makeAppt(11, 12))).toBe(true)
  })
})

describe('formatToman', () => {
  it('مبالغ با جداکننده هزارگان نمایش داده می‌شوند', () => {
    const result = formatToman(1_000_000_00) // 1,000,000 toman
    expect(result).toContain('تومان')
    // fa-IR locale uses Persian digits — check for ۱ not 1
    expect(result).toMatch(/[۱1]/)
  })

  it('صفر را درست نمایش می‌دهد', () => {
    const result = formatToman(0)
    expect(result).toContain('تومان')
  })
})

describe('formatMoney', () => {
  it('فقط برچسب واحد پول را عوض می‌کند و عدد ذخیره‌شده را تغییر نمی‌دهد', () => {
    const toman = formatMoney(12_345_600, 'IRR')
    const dollar = formatMoney(12_345_600, 'USD')

    expect(toman).toContain('تومان')
    expect(dollar).toContain('دلار')
    expect(toman.replace('تومان', '').trim()).toBe(dollar.replace('دلار', '').trim())
  })
})

describe('tomanToStorage / storageToToman', () => {
  it('تبدیل رفت و برگشت صحیح است', () => {
    const original = 50000
    const stored = tomanToStorage(original)
    expect(storageToToman(stored)).toBe(original)
  })

  it('مقادیر اعشاری گرد می‌شوند', () => {
    expect(tomanToStorage(100.5)).toBe(10050)
    // floor: 10050 / 100 = 100.5 → 100
    expect(storageToToman(10050)).toBe(100)
    // exact: 10000 / 100 = 100
    expect(storageToToman(10000)).toBe(100)
  })
})

describe('normalizeDigits', () => {
  it('اعداد فارسی به لاتین تبدیل می‌شوند', () => {
    expect(normalizeDigits('۱۲۳۴')).toBe('1234')
  })

  it('اعداد عربی به لاتین تبدیل می‌شوند', () => {
    expect(normalizeDigits('١٢٣٤')).toBe('1234')
  })

  it('اعداد لاتین تغییر نمی‌کنند', () => {
    expect(normalizeDigits('1234')).toBe('1234')
  })
})

describe('matchesSearch', () => {
  it('جست‌وجوی ساده کار می‌کند', () => {
    expect(matchesSearch('علی احمدی', 'علی')).toBe(true)
    expect(matchesSearch('علی احمدی', 'محمد')).toBe(false)
  })

  it('جست‌وجو حساس به بزرگی/کوچکی نیست', () => {
    expect(matchesSearch('Ali Ahmadi', 'ali')).toBe(true)
    expect(matchesSearch('Ali Ahmadi', 'ALI')).toBe(true)
  })

  it('اعداد فارسی در جست‌وجو پشتیبانی می‌شوند', () => {
    expect(matchesSearch('09121234567', '۰۹۱۲')).toBe(true)
  })

  it('اعداد فارسی داخل متن هم نرمال می‌شوند', () => {
    expect(matchesSearch('شماره ۰۹۱۲۱۲۳۴۵۶۷', '0912')).toBe(true)
    expect(matchesSearch('۱۲۳۴۵', '۱۲۳')).toBe(true)
  })
})

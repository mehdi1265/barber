import { describe, it, expect } from 'vitest'
import {
  formatJalaliDate,
  formatTime,
  getWeekStart,
  getWeekDays,
  isSameDayUtil,
  applyTimeToDate,
  todayISO,
} from '@shared/utils/jalali'

describe('formatJalaliDate', () => {
  it('تاریخ میلادی را به شمسی تبدیل می‌کند', () => {
    // 2026-01-15 → 1404/10/25
    const result = formatJalaliDate('2026-01-15T00:00:00.000Z')
    expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}/)
  })
})

describe('formatTime', () => {
  it('ساعت را به فرمت HH:mm نمایش می‌دهد', () => {
    const result = formatTime('2026-01-15T09:30:00.000Z')
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('getWeekStart', () => {
  it('شنبه‌ی هفته را برمی‌گرداند', () => {
    const d = new Date('2026-01-15') // پنج‌شنبه
    const start = getWeekStart(d)
    // باید شنبه باشد (day === 6)
    expect(start.getDay()).toBe(6)
  })
})

describe('getWeekDays', () => {
  it('دقیقاً ۷ روز برمی‌گرداند', () => {
    const days = getWeekDays(new Date('2026-01-10'))
    expect(days).toHaveLength(7)
  })

  it('روزها پشت سر هم هستند', () => {
    const days = getWeekDays(new Date('2026-01-10'))
    for (let i = 1; i < days.length; i++) {
      const diff = days[i].getTime() - days[i - 1].getTime()
      expect(diff).toBe(24 * 60 * 60 * 1000)
    }
  })
})

describe('isSameDayUtil', () => {
  it('روز یکسان true برمی‌گرداند', () => {
    // Use same date string without timezone ambiguity
    const d1 = new Date(2026, 0, 15, 9, 0, 0) // local 09:00
    const d2 = new Date(2026, 0, 15, 20, 0, 0) // local 20:00
    expect(isSameDayUtil(d1, d2)).toBe(true)
  })

  it('روزهای متفاوت false برمی‌گرداند', () => {
    const d1 = new Date(2026, 0, 15, 9, 0, 0)
    const d2 = new Date(2026, 0, 16, 9, 0, 0)
    expect(isSameDayUtil(d1, d2)).toBe(false)
  })
})

describe('applyTimeToDate', () => {
  it('ساعت را روی تاریخ اعمال می‌کند', () => {
    const result = applyTimeToDate('2026-01-15T00:00:00.000Z', '14:30')
    const d = new Date(result)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
  })
})

describe('todayISO', () => {
  it('فرمت YYYY-MM-DD دارد', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

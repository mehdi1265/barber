import { describe, it, expect } from 'vitest'
import {
  normalizeSearchTerm,
  escapeLikeTerm,
  buildLikePattern,
  sqlNormalizeDigits,
} from '@shared/utils/search'

describe('search utils', () => {
  it('ارقام فارسی و عربی را به لاتین تبدیل و فاصله‌ها را حذف می‌کند', () => {
    expect(normalizeSearchTerm(' ۰۹۱۲۳۴۵۶۷۸۹ ')).toBe('09123456789')
    expect(normalizeSearchTerm('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789')
    expect(normalizeSearchTerm('سارا ۱۲')).toBe('سارا 12')
  })

  it('کاراکترهای ویژه LIKE را escape می‌کند', () => {
    expect(escapeLikeTerm('50%')).toBe('50\\%')
    expect(escapeLikeTerm('a_b')).toBe('a\\_b')
    expect(escapeLikeTerm('c\\d')).toBe('c\\\\d')
  })

  it('الگوی LIKE را با نرمال‌سازی و escape می‌سازد', () => {
    expect(buildLikePattern(' ۰۹۱۲ ')).toBe('%0912%')
    expect(buildLikePattern('100%')).toBe('%100\\%%')
  })

  it('ستون SQL را برای هر دو مجموعه ارقام نرمال می‌کند', () => {
    const expression = sqlNormalizeDigits('phone')
    expect(expression).toContain("COALESCE(phone, '')")
    expect(expression).toContain('REPLACE(')
    expect(expression).toContain("'۰', '0'")
    expect(expression).toContain("'٠', '0'")
    expect(expression).toContain("'۹', '9'")
    expect(expression).toContain("'٩', '9'")
  })
})

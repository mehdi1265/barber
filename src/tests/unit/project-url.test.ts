import { describe, expect, it } from 'vitest'
import { normalizeProjectUrl } from '@services/supabase/project-url'

const BASE = 'https://abcdefghijklmnop.supabase.co'

describe('normalizeProjectUrl', () => {
  it('keeps a project base URL unchanged', () => {
    expect(normalizeProjectUrl(BASE)).toBe(BASE)
  })

  it('strips the REST prefix and trailing slashes', () => {
    // A value pasted from the dashboard as the REST endpoint. This exact shape
    // reached a release build once and left the app on a blank white screen.
    expect(normalizeProjectUrl(`${BASE}/rest/v1/`)).toBe(BASE)
    expect(normalizeProjectUrl(`${BASE}/rest/v1`)).toBe(BASE)
    expect(normalizeProjectUrl(`${BASE}/`)).toBe(BASE)
    expect(normalizeProjectUrl(`  ${BASE}/rest/v1/  `)).toBe(BASE)
  })

  it('returns an empty string when the value is missing', () => {
    expect(normalizeProjectUrl(undefined)).toBe('')
    expect(normalizeProjectUrl('   ')).toBe('')
  })
})

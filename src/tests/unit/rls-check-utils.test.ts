import { describe, expect, it } from 'vitest'
import {
  CLEANUP_ORDER,
  SYNCED_TABLES,
  briefError,
  inspectAnonKey,
  isRlsViolation,
  jwtSubject,
  keyFingerprint,
  maskEmail,
  normalizeBaseUrl,
  normalizeKey,
  parseEnvFile,
  projectRefFromUrl,
  storageProbePath,
} from '../../../scripts/rls-check-utils.ts'

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

describe('RLS check helpers', () => {
  it('parses .env files without evaluating values', () => {
    const env = parseEnvFile(
      [
        '# comment',
        'VITE_SUPABASE_URL=https://example.supabase.co',
        'export RLS_USER_A_EMAIL="a@example.com"',
        "RLS_USER_A_PASSWORD='p@ss=word'",
        'INVALID LINE',
        '',
      ].join('\n')
    )

    expect(env.VITE_SUPABASE_URL).toBe('https://example.supabase.co')
    expect(env.RLS_USER_A_EMAIL).toBe('a@example.com')
    expect(env.RLS_USER_A_PASSWORD).toBe('p@ss=word')
    expect(env.INVALID).toBeUndefined()
  })

  it('normalizes URLs and keys', () => {
    expect(normalizeBaseUrl('https://x.supabase.co///')).toBe('https://x.supabase.co')
    expect(() => normalizeBaseUrl('x.supabase.co')).toThrow('http')
    expect(() => normalizeBaseUrl('https://x.supabase.co/rest/v1/')).toThrow('REST endpoint')
    expect(normalizeKey(' "sb_publishable_abc" ')).toBe('sb_publishable_abc')
  })

  it('detects key shapes without revealing them', () => {
    expect(inspectAnonKey('sb_publishable_abcdefgh').kind).toBe('none')
    expect(inspectAnonKey('b_publishable_abcdefgh').kind).toBe('malformed')
    expect(inspectAnonKey('_publishable_abcdefgh').kind).toBe('malformed')
    expect(inspectAnonKey('sb_secret_abcdefgh').kind).toBe('secret')
    expect(inspectAnonKey('eyJhbGciOiJIUzI1NiJ9.e30.sig').kind).toBe('legacy')

    const fingerprint = keyFingerprint('sb_publishable_abcdefgh')
    expect(fingerprint).not.toContain('abcdefgh')
    expect(fingerprint).toContain('…')
  })

  it('reads the subject from a JWT payload', () => {
    const token = `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'user-1' })}.sig`

    expect(jwtSubject(token)).toBe('user-1')
    expect(jwtSubject('not-a-jwt')).toBeNull()
    expect(jwtSubject(`${base64url({})}.${base64url({ role: 'authenticated' })}.x`)).toBeNull()
  })

  it('recognizes RLS denials', () => {
    expect(isRlsViolation(403, '')).toBe(true)
    expect(isRlsViolation(401, '')).toBe(true)
    expect(isRlsViolation(400, 'new row violates row-level security policy')).toBe(true)
    expect(isRlsViolation(400, '{"code":"42501"}')).toBe(true)
    expect(isRlsViolation(400, 'Object not found')).toBe(false)
    expect(isRlsViolation(200, '[]')).toBe(false)
  })

  it('keeps error text short and single-line', () => {
    expect(briefError('a\n b\t c')).toBe('a b c')
    expect(briefError('x'.repeat(300), 10)).toBe('xxxxxxxxxx…')
  })

  it('extracts the hosted project ref used by the staging guard', () => {
    expect(projectRefFromUrl('https://abcdefghijklmno.supabase.co')).toBe('abcdefghijklmno')
    expect(projectRefFromUrl('https://staging-ref.supabase.in/')).toBe('staging-ref')
    expect(projectRefFromUrl('https://supabase.example.com')).toBeNull()
    expect(projectRefFromUrl('not a url')).toBeNull()
  })

  it('masks test addresses in reports', () => {
    expect(maskEmail('barber-a@example.com')).toBe('b***@example.com')
    expect(maskEmail('not-an-email')).toBe('…')
  })

  it('builds probes under the owner folder and cleans children first', () => {
    expect(storageProbePath('user-1', 'm1')).toBe('user-1/rls-probe-m1.txt')
    expect(CLEANUP_ORDER.indexOf('color_formula_items')).toBeLessThan(
      CLEANUP_ORDER.indexOf('color_formulas')
    )
    expect(CLEANUP_ORDER.indexOf('payments')).toBeLessThan(CLEANUP_ORDER.indexOf('visits'))
    expect(CLEANUP_ORDER.indexOf('visit_services')).toBeLessThan(CLEANUP_ORDER.indexOf('visits'))
    expect(SYNCED_TABLES).toHaveLength(12)
  })
})

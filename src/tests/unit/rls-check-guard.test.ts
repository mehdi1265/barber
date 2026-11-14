import { describe, expect, it } from 'vitest'
import {
  briefError,
  decideProbeCleanup,
  describeEnvPresence,
  describeWritePlan,
  isOwnedProbePath,
  probeDeletePath,
  redactSecrets,
  resolveWriteConfirmation,
  validateStagingGuard,
} from '../../../scripts/rls-check-utils.ts'

const STAGING_URL = 'https://stagingref123.supabase.co'
const STAGING_REF = 'stagingref123'
const PRODUCTION_REF = 'productionref456'

function guard(overrides: Partial<Parameters<typeof validateStagingGuard>[0]> = {}) {
  return validateStagingGuard({
    baseUrl: STAGING_URL,
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    ...overrides,
  })
}

describe('staging guard', () => {
  it('accepts a URL that matches the confirmed Staging ref', () => {
    expect(guard()).toEqual({
      actualRef: STAGING_REF,
      stagingRef: STAGING_REF,
      productionRef: PRODUCTION_REF,
    })
  })

  it('fails when RLS_STAGING_PROJECT_REF is missing', () => {
    expect(() => guard({ stagingRef: undefined })).toThrow(/RLS_STAGING_PROJECT_REF/)
    expect(() => guard({ stagingRef: '   ' })).toThrow(/RLS_STAGING_PROJECT_REF/)
  })

  it('fails when RLS_PRODUCTION_PROJECT_REF is missing or empty', () => {
    expect(() => guard({ productionRef: undefined })).toThrow(/RLS_PRODUCTION_PROJECT_REF/)
    expect(() => guard({ productionRef: '' })).toThrow(/RLS_PRODUCTION_PROJECT_REF/)
  })

  it('fails when the Staging ref is also declared Production', () => {
    expect(() => guard({ productionRef: STAGING_REF })).toThrow(/Production project/)
  })

  it('fails for an unknown (non-Supabase) host instead of guessing a ref', () => {
    expect(() => guard({ baseUrl: 'https://supabase.example.com' })).toThrow(/hosted Supabase/)
    expect(() => guard({ baseUrl: 'not a url' })).toThrow(/hosted Supabase/)
  })

  it('fails when the URL resolves to a different ref than the confirmed one', () => {
    expect(() => guard({ baseUrl: 'https://somethingelse789.supabase.co' })).toThrow(
      /expected Staging/
    )
  })

  it('rejects malformed refs instead of normalizing them', () => {
    expect(() => guard({ stagingRef: 'https://stagingref123.supabase.co' })).toThrow(
      /letters, digits, and dashes/
    )
    expect(() => guard({ productionRef: 'prod ref' })).toThrow(/letters, digits, and dashes/)
  })
})

describe('write confirmation', () => {
  it('never writes during preflight, even with a matching ref', () => {
    expect(
      resolveWriteConfirmation({
        preflight: true,
        confirmRef: STAGING_REF,
        stagingRef: STAGING_REF,
      })
    ).toEqual({ writes: false, confirmRef: null })
    expect(resolveWriteConfirmation({ preflight: true, stagingRef: STAGING_REF })).toEqual({
      writes: false,
      confirmRef: null,
    })
  })

  it('disables writes when --confirm-ref is absent', () => {
    expect(() =>
      resolveWriteConfirmation({ preflight: false, confirmRef: null, stagingRef: STAGING_REF })
    ).toThrow(/writes are disabled/)

    const lines = describeWritePlan(STAGING_REF)
    expect(lines.join('\n')).toContain(STAGING_REF)
    expect(lines.join('\n')).toContain('destructive plan')
  })

  it('fails when --confirm-ref names another project', () => {
    expect(() =>
      resolveWriteConfirmation({
        preflight: false,
        confirmRef: PRODUCTION_REF,
        stagingRef: STAGING_REF,
      })
    ).toThrow(/does not match/)

    expect(() =>
      resolveWriteConfirmation({
        preflight: false,
        confirmRef: `${STAGING_REF}x`,
        stagingRef: STAGING_REF,
      })
    ).toThrow(/does not match/)
  })

  it('passes the guard for an exact ref without performing any I/O', () => {
    const result = resolveWriteConfirmation({
      preflight: false,
      confirmRef: STAGING_REF,
      stagingRef: STAGING_REF,
    })

    expect(result).toEqual({ writes: true, confirmRef: STAGING_REF })
  })

  it('cannot confirm writes when the Staging ref itself is unknown', () => {
    expect(() =>
      resolveWriteConfirmation({ preflight: false, confirmRef: STAGING_REF, stagingRef: ' ' })
    ).toThrow(/unknown/)
  })
})

describe('probe cleanup ownership', () => {
  const expectedIds = new Set(['probe-1'])

  it('deletes only a row created by this run and owned by the signed-in user', () => {
    expect(
      decideProbeCleanup({
        id: 'probe-1',
        row: { id: 'probe-1', user_id: 'user-a' },
        actorId: 'user-a',
        expectedIds,
      })
    ).toBe('delete')
  })

  it('refuses rows owned by another user or not created by this run', () => {
    expect(
      decideProbeCleanup({
        id: 'probe-1',
        row: { id: 'probe-1', user_id: 'user-b' },
        actorId: 'user-a',
        expectedIds,
      })
    ).toBe('refuse')

    expect(
      decideProbeCleanup({
        id: 'someone-elses-row',
        row: { id: 'someone-elses-row', user_id: 'user-a' },
        actorId: 'user-a',
        expectedIds,
      })
    ).toBe('refuse')

    expect(
      decideProbeCleanup({
        id: 'probe-1',
        row: { id: 'probe-1' },
        actorId: 'user-a',
        expectedIds,
      })
    ).toBe('refuse')
  })

  it('treats a vanished probe row as already gone', () => {
    expect(decideProbeCleanup({ id: 'probe-1', row: null, actorId: 'user-a', expectedIds })).toBe(
      'already-gone'
    )
  })

  it('builds every DELETE with an id and an owner filter', () => {
    const path = probeDeletePath('customers', 'probe-1', 'user-a')
    expect(path).toContain('id=eq.probe-1')
    expect(path).toContain('user_id=eq.user-a')
    expect(path.startsWith('/rest/v1/customers?')).toBe(true)
  })

  it('refuses storage paths outside the owner folder', () => {
    expect(isOwnedProbePath('user-a/rls-probe-m1.txt', 'user-a')).toBe(true)
    expect(isOwnedProbePath('user-b/rls-probe-m1.txt', 'user-a')).toBe(false)
    expect(isOwnedProbePath('user-a/../user-b/rls-probe-m1.txt', 'user-a')).toBe(false)
    expect(isOwnedProbePath('user-a/real-photo.jpg', 'user-a')).toBe(false)
  })
})

describe('secret handling', () => {
  it('redacts key-shaped values from diagnostics', () => {
    const text = [
      'apikey: sb_publishable_abcdef123456',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig',
      '"password":"hunter2"',
      'sb_secret_zzz999',
    ].join(' ')

    const redacted = redactSecrets(text)
    expect(redacted).not.toContain('abcdef123456')
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(redacted).not.toContain('hunter2')
    expect(redacted).not.toContain('zzz999')
    expect(redacted).toContain('[redacted]')
  })

  it('applies redaction inside briefError', () => {
    const message = briefError('{"apikey":"sb_publishable_abcdef123456","status":401}')
    expect(message).not.toContain('abcdef123456')
    expect(message).toContain('401')
  })

  it('reports env presence without ever printing values', () => {
    const lines = describeEnvPresence(
      {
        RLS_USER_A_EMAIL: 'a@example.com',
        RLS_USER_A_PASSWORD: 'super-secret',
        RLS_USER_B_EMAIL: '',
      },
      ['RLS_USER_A_EMAIL', 'RLS_USER_A_PASSWORD', 'RLS_USER_B_EMAIL', 'RLS_USER_B_PASSWORD']
    )

    expect(lines).toEqual([
      'RLS_USER_A_EMAIL=set',
      'RLS_USER_A_PASSWORD=set',
      'RLS_USER_B_EMAIL=unset',
      'RLS_USER_B_PASSWORD=unset',
    ])
    expect(lines.join('\n')).not.toContain('super-secret')
  })
})

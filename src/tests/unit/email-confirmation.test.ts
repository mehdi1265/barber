import { describe, expect, it } from 'vitest'
import {
  CONFIRM_MESSAGES,
  NATIVE_CONFIRM_URL,
  isConfirmTarget,
  outcomeFromAuthError,
  outcomeFromProviderError,
  parseConfirmLink,
  parseConfirmOutcome,
  parsePastedConfirmation,
} from '@features/auth/email-confirmation'

const TOKENS = '#access_token=at&refresh_token=rt&type=signup'

describe('confirmation link parsing', () => {
  it('recognises the native and web targets', () => {
    expect(NATIVE_CONFIRM_URL).toBe('barberapp://confirm-email')
    expect(isConfirmTarget(NATIVE_CONFIRM_URL)).toBe(true)
    expect(isConfirmTarget(`${NATIVE_CONFIRM_URL}${TOKENS}`)).toBe(true)
    expect(isConfirmTarget('https://app.example.com/confirm-email#x')).toBe(true)
    expect(isConfirmTarget('https://app.example.com/confirm-email/')).toBe(true)
  })

  it('rejects lookalikes and the recovery target', () => {
    expect(isConfirmTarget('barberapp://confirm-email-evil')).toBe(false)
    expect(isConfirmTarget('https://app.example.com/confirm-email-evil')).toBe(false)
    expect(isConfirmTarget('https://app.example.com/confirm')).toBe(false)
    expect(isConfirmTarget('barberapp://reset-password')).toBe(false)
    expect(isConfirmTarget('not a url')).toBe(false)
  })

  it('reads implicit-flow tokens from the fragment', () => {
    expect(parseConfirmLink(`${NATIVE_CONFIRM_URL}${TOKENS}`)).toEqual({
      kind: 'tokens',
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    })
    expect(parseConfirmLink(`https://app.example.com/confirm-email${TOKENS}`)).toEqual({
      kind: 'tokens',
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    })
  })

  it('accepts a token pair with no explicit type on the confirm target', () => {
    expect(parseConfirmLink(`${NATIVE_CONFIRM_URL}#access_token=at&refresh_token=rt`)).toEqual({
      kind: 'tokens',
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    })
  })

  it('never accepts query-string tokens', () => {
    expect(
      parseConfirmLink(`${NATIVE_CONFIRM_URL}?access_token=at&refresh_token=rt&type=signup`)
    ).toEqual({ kind: 'none' })
  })

  it('does not mix flows: recovery tokens on the confirm target are ignored', () => {
    expect(
      parseConfirmLink(`${NATIVE_CONFIRM_URL}#access_token=at&refresh_token=rt&type=recovery`)
    ).toEqual({ kind: 'none' })
  })

  it('reads a PKCE code from the query string', () => {
    expect(parseConfirmLink(`${NATIVE_CONFIRM_URL}?code=abc`)).toEqual({
      kind: 'code',
      code: 'abc',
    })
  })

  it('ignores tokens and codes on unrelated URLs', () => {
    expect(parseConfirmLink(`barberapp://customers/42${TOKENS}`)).toEqual({ kind: 'none' })
    expect(parseConfirmLink('https://app.example.com/other?code=abc')).toEqual({ kind: 'none' })
  })

  it('classifies provider errors from the link', () => {
    const expired = parseConfirmLink(
      `${NATIVE_CONFIRM_URL}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    )
    expect(expired).toMatchObject({ kind: 'error', outcome: 'expired' })

    const denied = parseConfirmLink(`${NATIVE_CONFIRM_URL}?error=access_denied`)
    expect(denied).toMatchObject({ kind: 'error', outcome: 'invalid' })
  })

  it('returns none for a bare target', () => {
    expect(parseConfirmLink(NATIVE_CONFIRM_URL)).toEqual({ kind: 'none' })
  })
})

describe('pasted confirmation text', () => {
  it('finds the deep link inside copied text', () => {
    expect(parsePastedConfirmation(`لینک: barberapp://confirm-email${TOKENS} پایان`)).toEqual({
      kind: 'url',
      url: `barberapp://confirm-email${TOKENS}`,
    })
  })

  it('reads the provider verify link as a token hash', () => {
    expect(
      parsePastedConfirmation(
        'https://abc.supabase.co/auth/v1/verify?token=hash123&type=signup&redirect_to=barberapp%3A%2F%2Fconfirm-email'
      )
    ).toEqual({ kind: 'token_hash', tokenHash: 'hash123', type: 'signup' })
  })

  it('decodes HTML-escaped separators from a copied email', () => {
    expect(
      parsePastedConfirmation('https://abc.supabase.co/auth/v1/verify?token=h2&amp;type=email')
    ).toEqual({ kind: 'token_hash', tokenHash: 'h2', type: 'email' })
  })

  it('ignores recovery, insecure and unrelated pasted links', () => {
    expect(
      parsePastedConfirmation('https://abc.supabase.co/auth/v1/verify?token=h&type=recovery')
    ).toEqual({ kind: 'none' })
    expect(
      parsePastedConfirmation('http://abc.supabase.co/auth/v1/verify?token=h&type=signup')
    ).toEqual({ kind: 'none' })
    expect(parsePastedConfirmation('https://abc.supabase.co/auth/v1/verify?type=signup')).toEqual({
      kind: 'none',
    })
    expect(parsePastedConfirmation('سلام، لطفاً ایمیل را تأیید کنید')).toEqual({ kind: 'none' })
  })
})

describe('confirmation outcomes', () => {
  it('maps provider codes to user-facing outcomes', () => {
    expect(outcomeFromProviderError('otp_expired', 'Email link is invalid or has expired')).toBe(
      'expired'
    )
    expect(outcomeFromProviderError(null, 'Token has expired or is invalid')).toBe('expired')
    expect(outcomeFromProviderError('access_denied', 'User already confirmed')).toBe('already')
    expect(outcomeFromProviderError('access_denied', 'nope')).toBe('invalid')
  })

  it('maps Supabase error text without leaking it to the user', () => {
    expect(outcomeFromAuthError('Email link is invalid or has expired')).toBe('expired')
    expect(outcomeFromAuthError('Token has expired or is invalid')).toBe('expired')
    expect(outcomeFromAuthError('Invalid Refresh Token')).toBe('expired')
    expect(outcomeFromAuthError('User already confirmed')).toBe('already')
    expect(outcomeFromAuthError('Failed to fetch')).toBe('network')
    expect(outcomeFromAuthError('NetworkError when attempting to fetch resource')).toBe('network')
    expect(outcomeFromAuthError('invalid flow state, no valid flow state found')).toBe('invalid')
    expect(outcomeFromAuthError('something odd')).toBe('error')
  })

  it('accepts only known outcome values from the URL', () => {
    expect(parseConfirmOutcome('confirmed')).toBe('confirmed')
    expect(parseConfirmOutcome('expired')).toBe('expired')
    expect(parseConfirmOutcome('already')).toBe('already')
    expect(parseConfirmOutcome('pwned')).toBeNull()
    expect(parseConfirmOutcome(null)).toBeNull()
    expect(parseConfirmOutcome('')).toBeNull()
  })

  it('has a Persian message for every outcome', () => {
    for (const message of Object.values(CONFIRM_MESSAGES)) {
      expect(message.trim().length).toBeGreaterThan(10)
    }
  })
})

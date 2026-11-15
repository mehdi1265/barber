/**
 * Email-confirmation links, shared by the deep-link handler and the page.
 *
 * The client runs Supabase's **implicit** flow (the default; `client.ts` does
 * not set `flowType`), so a confirmation link comes back as
 * `#access_token=…&refresh_token=…&type=signup`. A PKCE `?code=` is also
 * parsed, but it only works after the project is switched to
 * `flowType: 'pkce'` and the same device holds the code verifier.
 *
 * Tokens are accepted only on a confirmation target, so an arbitrary deep link
 * cannot inject a session. That rule mirrors `recovery-link.ts`.
 */

export const NATIVE_CONFIRM_URL = 'barberapp://confirm-email'
export const CONFIRM_PATH = '/confirm-email'

export type ConfirmOutcome = 'confirmed' | 'expired' | 'invalid' | 'already' | 'network' | 'error'

export const CONFIRM_MESSAGES: Record<ConfirmOutcome, string> = {
  confirmed: 'ایمیل شما با موفقیت تأیید شد.',
  expired:
    'لینک تأیید ایمیل منقضی شده یا قبلاً استفاده شده است. اگر حسابتان قبلاً تأیید شده، وارد شوید؛ در غیر این صورت لینک جدید بگیرید.',
  invalid:
    'لینک تأیید ایمیل نامعتبر است. مطمئن شوید کل آدرس موجود در ایمیل را باز کرده‌اید یا لینک جدید بگیرید.',
  already: 'این ایمیل قبلاً تأیید شده است. کافی است وارد شوید.',
  network: 'خطا در اتصال به سرور. اینترنت را بررسی کنید و دوباره تلاش کنید.',
  error: 'تأیید ایمیل انجام نشد. دوباره تلاش کنید یا لینک جدید بگیرید.',
}

export interface ConfirmTokens {
  accessToken: string
  refreshToken: string
}

export type ConfirmLink =
  | { kind: 'tokens'; tokens: ConfirmTokens }
  | { kind: 'code'; code: string }
  | { kind: 'error'; outcome: ConfirmOutcome; message: string }
  | { kind: 'none' }

const OUTCOMES: readonly ConfirmOutcome[] = [
  'confirmed',
  'expired',
  'invalid',
  'already',
  'network',
  'error',
]

interface LinkParams {
  query: URLSearchParams
  hash: URLSearchParams
  path: string
  host: string
  protocol: string
}

function readParams(url: string): LinkParams | null {
  try {
    const parsed = new URL(url)
    return {
      query: parsed.searchParams,
      hash: new URLSearchParams(parsed.hash.replace(/^#/, '')),
      path: parsed.pathname,
      host: parsed.host,
      protocol: parsed.protocol,
    }
  } catch {
    return null
  }
}

export function isConfirmTarget(url: string, scheme = 'barberapp'): boolean {
  const params = readParams(url)
  if (!params) return false
  if (params.protocol === `${scheme}:`) return params.host === 'confirm-email'
  // Exact path only: `/confirm-email-something` is not a confirmation endpoint.
  return params.path === CONFIRM_PATH || params.path === `${CONFIRM_PATH}/`
}

function isSignupType(type: string | null): boolean {
  return type === 'signup' || type === 'email'
}

/** Classifies the provider's `error`/`error_code` pair from a confirmation link. */
export function outcomeFromProviderError(
  code: string | null,
  description: string | null
): ConfirmOutcome {
  const text = `${code ?? ''} ${description ?? ''}`.toLowerCase()
  if (text.includes('expired') || text.includes('otp_expired')) return 'expired'
  if (text.includes('already')) return 'already'
  return 'invalid'
}

export function parseConfirmLink(url: string): ConfirmLink {
  const params = readParams(url)
  if (!params || !isConfirmTarget(url)) return { kind: 'none' }

  const description = params.hash.get('error_description') ?? params.query.get('error_description')
  const code = params.hash.get('error_code') ?? params.query.get('error_code')
  const providerError = params.hash.get('error') ?? params.query.get('error')
  if (description || code || providerError) {
    const outcome = outcomeFromProviderError(code, description ?? providerError)
    return { kind: 'error', outcome, message: description ?? CONFIRM_MESSAGES[outcome] }
  }

  const type = params.hash.get('type') ?? params.query.get('type')
  if (type !== null && !isSignupType(type)) return { kind: 'none' }

  // Session tokens come from the fragment only; query-string tokens would be
  // sent to the web server and land in proxy/access logs.
  const accessToken = params.hash.get('access_token')
  const refreshToken = params.hash.get('refresh_token')
  if (accessToken && refreshToken) {
    return { kind: 'tokens', tokens: { accessToken, refreshToken } }
  }

  const pkceCode = params.query.get('code')
  if (pkceCode) return { kind: 'code', code: pkceCode }

  return { kind: 'none' }
}

/** Maps a Supabase Auth error message to a user-facing outcome. */
export function outcomeFromAuthError(message: string): ConfirmOutcome {
  const lower = message.toLowerCase()
  if (/(expired|otp_expired|invalid.*(token|link))/.test(lower)) return 'expired'
  if (/already/.test(lower)) return 'already'
  if (/(network|fetch|timed out|timeout)/.test(lower)) return 'network'
  if (/(invalid|not found|flow state|code verifier)/.test(lower)) return 'invalid'
  return 'error'
}

/** Accepts only a known outcome from the URL; anything else is untrusted. */
export function parseConfirmOutcome(value: string | null | undefined): ConfirmOutcome | null {
  if (!value) return null
  return (OUTCOMES as readonly string[]).includes(value) ? (value as ConfirmOutcome) : null
}

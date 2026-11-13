/**
 * Recovery-link parsing shared by the web reset page and native deep links.
 *
 * Supabase can deliver a recovery link in two shapes:
 * - implicit flow: `#access_token=…&refresh_token=…&type=recovery`
 * - PKCE flow: `?code=…` (exchanged by supabase-js)
 *
 * Tokens are accepted only for a recovery URL or an explicit `type=recovery`,
 * so arbitrary deep links cannot inject a session.
 */

export const NATIVE_RECOVERY_URL = 'barberapp://reset-password'
export const RECOVERY_LINK_EVENT = 'barber:recovery-link'
export const INVALID_RECOVERY_MESSAGE = 'لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید'

export interface RecoveryTokens {
  accessToken: string
  refreshToken: string
}

export type RecoveryLink =
  | { kind: 'tokens'; tokens: RecoveryTokens }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

interface LinkParams {
  query: URLSearchParams
  hash: URLSearchParams
  path: string
  host: string
  protocol: string
}

function readParams(url: string): LinkParams | null {
  // Legacy callers pass `window.location.hash` directly.
  if (url.startsWith('#')) {
    return {
      query: new URLSearchParams(),
      hash: new URLSearchParams(url.slice(1)),
      path: '',
      host: '',
      protocol: '',
    }
  }

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

export function isRecoveryTarget(url: string, scheme = 'barberapp'): boolean {
  const params = readParams(url)
  if (!params) return false
  if (!params.protocol) return true // raw hash from the web reset page
  if (params.protocol === `${scheme}:`) {
    return params.host === 'reset-password' || params.path.startsWith('/reset-password')
  }
  return params.path === '/reset-password' || params.path.startsWith('/reset-password')
}

export function parseRecoveryLink(url: string): RecoveryLink {
  const params = readParams(url)
  if (!params) return { kind: 'none' }

  const error =
    params.hash.get('error_description') ??
    params.query.get('error_description') ??
    params.hash.get('error') ??
    params.query.get('error')
  if (error) return { kind: 'error', message: error }

  const type = params.hash.get('type') ?? params.query.get('type')
  const accessToken = params.hash.get('access_token') ?? params.query.get('access_token')
  const refreshToken = params.hash.get('refresh_token') ?? params.query.get('refresh_token')
  const rawHash = !params.protocol

  if (accessToken && refreshToken && (type === 'recovery' || (!rawHash && isRecoveryTarget(url)))) {
    return { kind: 'tokens', tokens: { accessToken, refreshToken } }
  }

  const code = params.query.get('code')
  if (code && !rawHash && isRecoveryTarget(url)) {
    return { kind: 'code', code }
  }

  return { kind: 'none' }
}

export function parseRecoveryTokens(hash: string): RecoveryTokens | null {
  const link = parseRecoveryLink(hash)
  return link.kind === 'tokens' ? link.tokens : null
}

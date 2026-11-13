/**
 * Helpers for the portable two-user RLS check (`scripts/rls-check.ts`).
 *
 * The runner talks to the live project through the public REST/Auth/Storage
 * APIs with two real accounts, so it needs only the publishable key — never
 * the database password or a service-role key.
 */

export const PROFILE_TABLE = 'profiles'

/** Synced tables that carry `user_id` and an owner-only policy. */
export const SYNCED_TABLES = [
  'profiles',
  'customers',
  'services',
  'appointments',
  'appointment_services',
  'visits',
  'visit_services',
  'payments',
  'expenses',
  'color_formulas',
  'color_formula_items',
  'customer_photos',
] as const

export const PHOTO_BUCKET = 'customer-photos'

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+/.test(trimmed)) {
    throw new Error('Supabase URL must start with http:// or https://')
  }
  if (/\/rest\/v1$/i.test(trimmed)) {
    throw new Error(
      'Supabase URL must be the project URL (https://<ref>.supabase.co), not the REST endpoint (/rest/v1)'
    )
  }
  return trimmed
}

/** Project ref of a hosted Supabase URL, or null for self-hosted/unknown hosts. */
export function projectRefFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname
    const match = /^([a-z0-9-]+)\.supabase\.(?:co|in)$/i.exec(host)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export function normalizeKey(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '')
}

/** Safe prefix for diagnostics; never returns the full key. */
export function keyFingerprint(key: string): string {
  if (key.length <= 8) return '…'
  return `${key.slice(0, 12)}…(len ${key.length})`
}

export interface KeyProblem {
  kind: 'secret' | 'legacy' | 'malformed' | 'none'
  hint: string | null
}

/**
 * Detects obviously wrong keys without evaluating their validity.
 * The new Supabase publishable keys start with `sb_publishable_`.
 */
export function inspectAnonKey(key: string): KeyProblem {
  if (key.startsWith('sb_secret_') || key.startsWith('service_role')) {
    return {
      kind: 'secret',
      hint: 'a secret/service key must never be used in the app; use the publishable key',
    }
  }
  if (key.startsWith('sb_publishable_')) return { kind: 'none', hint: null }
  if (/^_?publishable_/.test(key)) {
    return {
      kind: 'malformed',
      hint: 'publishable key looks truncated (it must start with "sb_publishable_")',
    }
  }
  if (key.startsWith('eyJ')) {
    return {
      kind: 'legacy',
      hint: 'legacy anon JWT accepted; prefer the project publishable key',
    }
  }
  return { kind: 'malformed', hint: 'key is neither sb_publishable_… nor a legacy anon JWT' }
}

/** Minimal `.env` reader — no expansion, no printing. */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, name, rawValue] = match
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

export function jwtSubject(token: string): string | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: unknown
    }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export function isRlsViolation(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true
  return /row-level security|42501|insufficient privilege|permission denied/i.test(body)
}

/** Short single-line error text for logs; strips newlines and truncates. */
export function briefError(body: string, limit = 160): string {
  const compact = body.replace(/\s+/g, ' ').trim()
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact
}

export function storageProbePath(userId: string, marker: string): string {
  return `${userId}/rls-probe-${marker}.txt`
}

/** Reverse dependency order: children before their parents. */
export const CLEANUP_ORDER = [
  'color_formula_items',
  'color_formulas',
  'customer_photos',
  'payments',
  'visit_services',
  'visits',
  'appointment_services',
  'appointments',
  'expenses',
  'services',
  'customers',
] as const

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

export interface StagingGuardInput {
  baseUrl: string
  stagingRef?: string | null
  productionRef?: string | null
}

export interface StagingGuardResult {
  actualRef: string
  stagingRef: string
  productionRef: string
}

const REF_SHAPE = /^[a-z0-9-]+$/i

/**
 * Refuses to run unless the URL resolves to the confirmed Staging project and
 * that ref differs from the declared Production ref. Both refs are required;
 * there is no fallback and no guessing.
 */
export function validateStagingGuard(input: StagingGuardInput): StagingGuardResult {
  const stagingRef = (input.stagingRef ?? '').trim()
  const productionRef = (input.productionRef ?? '').trim()
  if (!stagingRef) {
    throw new Error(
      'missing RLS_STAGING_PROJECT_REF: set it to the Staging project ref so this runner refuses to touch Production'
    )
  }
  if (!productionRef) {
    throw new Error(
      'missing RLS_PRODUCTION_PROJECT_REF: set it to the Production project ref so this runner can prove it is not touching Production'
    )
  }
  if (!REF_SHAPE.test(stagingRef) || !REF_SHAPE.test(productionRef)) {
    throw new Error('refusing to run: project refs must contain only letters, digits, and dashes')
  }

  const actualRef = projectRefFromUrl(input.baseUrl)
  if (!actualRef) {
    throw new Error(
      'refusing to run: the configured URL is not a hosted Supabase project URL, so no project ref can be verified'
    )
  }
  if (actualRef === productionRef) {
    throw new Error(`refusing to run: ${actualRef} is marked as the Production project`)
  }
  if (actualRef !== stagingRef) {
    throw new Error(
      `refusing to run: expected Staging project "${stagingRef}", but the configured URL resolves to "${actualRef}"`
    )
  }

  return { actualRef, stagingRef, productionRef }
}

export interface WriteConfirmationInput {
  preflight: boolean
  confirmRef?: string | null
  stagingRef: string
}

export interface WriteConfirmation {
  writes: boolean
  confirmRef: string | null
}

/**
 * Writing probes requires `--confirm-ref=<staging-ref>` on the same invocation.
 * Preflight never writes and therefore never needs confirmation.
 */
export function resolveWriteConfirmation(input: WriteConfirmationInput): WriteConfirmation {
  const stagingRef = input.stagingRef.trim()
  if (!stagingRef) throw new Error('cannot confirm writes: the Staging project ref is unknown')
  if (input.preflight) return { writes: false, confirmRef: null }

  const confirmRef = (input.confirmRef ?? '').trim()
  if (!confirmRef) {
    throw new Error(
      `writes are disabled: rerun with --confirm-ref=${stagingRef} to authorize probe rows on Staging`
    )
  }
  if (confirmRef !== stagingRef) {
    throw new Error('refusing to run: --confirm-ref does not match the confirmed Staging project ref')
  }
  return { writes: true, confirmRef }
}

/** Printed before writes so the operator sees exactly what will happen. */
export function describeWritePlan(projectRef: string): string[] {
  return [
    `INFO  project ref (confirmed): ${projectRef}`,
    'INFO  destructive plan for this run (all rows are marker-prefixed and owned by user A):',
    'INFO    - insert one probe row into 11 public tables as user A',
    'INFO    - attempt update/delete/insert against A as user B (expected to be denied)',
    'INFO    - upload 1 storage probe object and 1 forbidden storage write',
    'INFO    - delete only this run\'s probe rows, filtered by id + user_id',
    'INFO    - delete only this run\'s 2 storage probe objects under A\'s folder',
  ]
}

export interface ProbeRow {
  id?: unknown
  user_id?: unknown
}

export type CleanupDecision = 'delete' | 'already-gone' | 'refuse'

/**
 * Cleanup may only touch rows this run created, owned by the signed-in user.
 * Anything ambiguous (unknown id, foreign owner, duplicate rows) refuses.
 */
export function decideProbeCleanup(input: {
  id: string
  row: ProbeRow | null
  actorId: string
  expectedIds: ReadonlySet<string>
}): CleanupDecision {
  if (!input.expectedIds.has(input.id)) return 'refuse'
  if (input.row === null) return 'already-gone'
  if (input.row.id !== input.id) return 'refuse'
  if (input.row.user_id !== input.actorId) return 'refuse'
  return 'delete'
}

/** PostgREST delete path that always carries both the id and the owner filter. */
export function probeDeletePath(table: string, id: string, ownerId: string): string {
  return `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(ownerId)}`
}

/** Storage cleanup may only remove paths under the signed-in user's folder. */
export function isOwnedProbePath(path: string, ownerId: string): boolean {
  return path.startsWith(`${ownerId}/`) && path.includes('/rls-probe-') && !path.includes('..')
}

/** Presence-only view of env keys; values are never returned. */
export function describeEnvPresence(
  env: Record<string, string>,
  names: readonly string[]
): string[] {
  return names.map((name) => `${name}=${(env[name] ?? '').trim() ? 'set' : 'unset'}`)
}

/** Keeps the report useful without storing the full address. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return '…'
  return `${email.slice(0, 1)}***${email.slice(at)}`
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

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sb_publishable_[A-Za-z0-9_-]+/g, 'sb_publishable_[redacted]'],
  [/sb_secret_[A-Za-z0-9_-]+/g, 'sb_secret_[redacted]'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]'],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]'],
  [/((?:apikey|password|access_token)["']?\s*[:=]\s*["']?)[^&\s"',}]+/gi, '$1[redacted]'],
]

/** Removes key-shaped values from any diagnostic text. */
export function redactSecrets(text: string): string {
  let output = text
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement)
  }
  return output
}

/** Short single-line error text for logs; strips newlines, secrets, and truncates. */
export function briefError(body: string, limit = 160): string {
  const compact = redactSecrets(body).replace(/\s+/g, ' ').trim()
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

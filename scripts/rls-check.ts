/**
 * Portable two-user RLS verification against a live Supabase project.
 *
 * Unlike `supabase/tests/rls_two_user_check.sql`, this runner needs no psql and
 * no database password: it signs in as two real accounts and uses the same
 * PostgREST/Storage APIs as the app, so it also validates the exact surface the
 * client uses. Each run creates a marker-prefixed probe row per table, checks
 * that user B cannot read or write user A's rows, then deletes the probes.
 *
 * Requirements (never commit these):
 *   VITE_SUPABASE_URL / SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY   (publishable key)
 *   RLS_USER_A_EMAIL, RLS_USER_A_PASSWORD
 *   RLS_USER_B_EMAIL, RLS_USER_B_PASSWORD
 *
 * Usage:
 *   npm run rls:check
 *   npm run rls:check -- --out supabase/tests/rls-verification.log
 *
 * Both accounts must already exist and be email-confirmed. A successful run
 * prints "RLS verification passed" and exits 0.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CLEANUP_ORDER,
  PHOTO_BUCKET,
  SYNCED_TABLES,
  briefError,
  inspectAnonKey,
  isRlsViolation,
  jwtSubject,
  keyFingerprint,
  normalizeBaseUrl,
  normalizeKey,
  parseEnvFile,
  storageProbePath,
} from './rls-check-utils.ts'

interface Session {
  label: string
  email: string
  token: string
  userId: string
}

interface Response {
  status: number
  body: string
}

interface RunResult {
  failures: string[]
  checks: number
}

const lines: string[] = []

function log(line: string): void {
  lines.push(line)
  console.log(line)
}

function fail(result: RunResult, message: string): void {
  result.failures.push(message)
  log(`FAIL  ${message}`)
}

function pass(result: RunResult, message: string): void {
  result.checks += 1
  log(`PASS  ${message}`)
}

function expectRows(result: RunResult, message: string, rows: unknown[]): void {
  if (rows.length === 0) pass(result, message)
  else fail(result, `${message} (saw ${rows.length} row(s))`)
}

function expectNoRows(result: RunResult, message: string, response: Response, label: string): void {
  if (response.status >= 400) {
    fail(result, `${label} returned ${response.status}: ${briefError(response.body)}`)
    return
  }
  expectRows(result, message, rowsOf(response.body))
}

async function loadEnv(): Promise<Record<string, string>> {
  let fromFile: Record<string, string> = {}
  try {
    fromFile = parseEnvFile(await readFile(resolve(process.cwd(), '.env.local'), 'utf8'))
  } catch {
    // .env.local is optional when the variables come from the shell.
  }
  return { ...fromFile, ...process.env }
}

function requireEnv(env: Record<string, string>, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`missing ${name} (see docs/11-release-runbook.md §3)`)
  return value
}

function firstEnv(env: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  throw new Error(`missing ${names.join(' or ')} (see docs/11-release-runbook.md §3)`)
}

async function request(
  baseUrl: string,
  key: string,
  token: string | null,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('apikey', key)
  headers.set('Authorization', `Bearer ${token ?? key}`)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  return { status: response.status, body: await response.text() }
}

function parseJson(body: string): unknown {
  try {
    return body ? (JSON.parse(body) as unknown) : null
  } catch {
    return null
  }
}

function rowsOf(body: string): unknown[] {
  const parsed = parseJson(body)
  return Array.isArray(parsed) ? parsed : []
}

async function signIn(
  baseUrl: string,
  key: string,
  label: string,
  email: string,
  password: string
): Promise<Session> {
  const response = await request(baseUrl, key, null, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const payload = parseJson(response.body) as {
    access_token?: unknown
    user?: { id?: unknown }
    error_description?: unknown
    msg?: unknown
  } | null

  if (response.status !== 200 || typeof payload?.access_token !== 'string') {
    const reason =
      typeof payload?.error_description === 'string'
        ? payload.error_description
        : typeof payload?.msg === 'string'
          ? payload.msg
          : briefError(response.body)
    throw new Error(`sign-in failed for ${label} (${response.status}): ${reason}`)
  }

  const userId =
    typeof payload.user?.id === 'string' ? payload.user.id : jwtSubject(payload.access_token)
  if (!userId) throw new Error(`could not resolve the user id for ${label}`)

  return { label, email, token: payload.access_token, userId }
}

interface Seeds {
  customer: string
  service: string
  appointment: string
  appointmentService: string
  visit: string
  visitService: string
  payment: string
  expense: string
  formula: string
  formulaItem: string
  photo: string
}

/** Column used for a harmless "update to the same value" probe per table. */
const UPDATE_COLUMN: Record<string, string> = {
  profiles: 'display_name',
  customers: 'name',
  services: 'name',
  appointments: 'title',
  appointment_services: 'service_name_snapshot',
  visits: 'notes',
  visit_services: 'service_name_snapshot',
  payments: 'note',
  expenses: 'title',
  color_formulas: 'title',
  color_formula_items: 'product_name',
  customer_photos: 'caption',
}

function idsByTable(profileId: string, seeds: Seeds): Record<string, string> {
  return {
    profiles: profileId,
    customers: seeds.customer,
    services: seeds.service,
    appointments: seeds.appointment,
    appointment_services: seeds.appointmentService,
    visits: seeds.visit,
    visit_services: seeds.visitService,
    payments: seeds.payment,
    expenses: seeds.expense,
    color_formulas: seeds.formula,
    color_formula_items: seeds.formulaItem,
    customer_photos: seeds.photo,
  }
}

function seedPayloads(session: Session, seeds: Seeds, marker: string, now: string) {
  return {
    customers: [{ id: seeds.customer, user_id: session.userId, name: `RLS ${marker} customer` }],
    services: [{ id: seeds.service, user_id: session.userId, name: `RLS ${marker} service` }],
    appointments: [
      {
        id: seeds.appointment,
        user_id: session.userId,
        customer_id: seeds.customer,
        title: `RLS ${marker} appointment`,
        start_at: now,
        duration_minutes: 30,
        end_at: new Date(Date.parse(now) + 30 * 60_000).toISOString(),
      },
    ],
    appointment_services: [
      {
        id: seeds.appointmentService,
        user_id: session.userId,
        appointment_id: seeds.appointment,
        service_id: seeds.service,
        service_name_snapshot: `RLS ${marker} service`,
        price: 1000,
      },
    ],
    visits: [
      {
        id: seeds.visit,
        user_id: session.userId,
        customer_id: seeds.customer,
        appointment_id: seeds.appointment,
        visited_at: now,
      },
    ],
    visit_services: [
      {
        id: seeds.visitService,
        user_id: session.userId,
        visit_id: seeds.visit,
        service_id: seeds.service,
        service_name_snapshot: `RLS ${marker} service`,
        unit_price: 1000,
        line_total: 1000,
      },
    ],
    payments: [
      {
        id: seeds.payment,
        user_id: session.userId,
        visit_id: seeds.visit,
        amount: 1000,
        paid_at: now,
      },
    ],
    expenses: [
      {
        id: seeds.expense,
        user_id: session.userId,
        title: `RLS ${marker} expense`,
        amount: 500,
        spent_at: now,
      },
    ],
    color_formulas: [
      {
        id: seeds.formula,
        user_id: session.userId,
        title: `RLS ${marker} formula`,
        customer_id: seeds.customer,
        visit_id: seeds.visit,
      },
    ],
    color_formula_items: [
      {
        id: seeds.formulaItem,
        user_id: session.userId,
        formula_id: seeds.formula,
        product_name: `RLS ${marker} product`,
        amount: 10,
      },
    ],
    customer_photos: [
      {
        id: seeds.photo,
        user_id: session.userId,
        customer_id: seeds.customer,
        visit_id: seeds.visit,
        storage_path: `${session.userId}/rls-${marker}.jpg`,
      },
    ],
  } satisfies Record<string, Record<string, unknown>[]>
}

async function insertSeeds(
  result: RunResult,
  baseUrl: string,
  key: string,
  session: Session,
  seeds: Seeds,
  marker: string
): Promise<void> {
  const payloads = seedPayloads(session, seeds, marker, new Date().toISOString())
  for (const [table, rows] of Object.entries(payloads)) {
    const response = await request(baseUrl, key, session.token, `/rest/v1/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    })
    if (response.status !== 201) {
      throw new Error(`seeding ${table} failed (${response.status}): ${briefError(response.body)}`)
    }
    pass(result, `seeded ${table} as ${session.label}`)
  }
}

async function checkReads(
  result: RunResult,
  baseUrl: string,
  key: string,
  b: Session,
  aProfileId: string,
  seeds: Seeds
): Promise<void> {
  const ids = idsByTable(aProfileId, seeds)

  for (const table of SYNCED_TABLES) {
    const response = await request(
      baseUrl,
      key,
      b.token,
      `/rest/v1/${table}?select=id&id=eq.${ids[table]}`
    )
    if (response.status !== 200) {
      fail(result, `B read ${table} returned ${response.status}: ${briefError(response.body)}`)
      continue
    }
    expectRows(result, `B cannot read A's ${table} row`, rowsOf(response.body))
  }
}

async function checkWrites(
  result: RunResult,
  baseUrl: string,
  key: string,
  b: Session,
  a: Session,
  aProfileId: string,
  seeds: Seeds
): Promise<void> {
  const ids = idsByTable(aProfileId, seeds)

  for (const table of SYNCED_TABLES) {
    const column = UPDATE_COLUMN[table]
    const patch = await request(baseUrl, key, b.token, `/rest/v1/${table}?id=eq.${ids[table]}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ [column]: 'RLS blocked update' }),
    })
    if (patch.status >= 400 && isRlsViolation(patch.status, patch.body)) {
      pass(result, `B's update of A's ${table} row is denied`)
    } else {
      expectNoRows(
        result,
        `B's update of A's ${table} row changes 0 rows`,
        patch,
        `update ${table}`
      )
    }

    const remove = await request(baseUrl, key, b.token, `/rest/v1/${table}?id=eq.${ids[table]}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    if (remove.status >= 400 && isRlsViolation(remove.status, remove.body)) {
      pass(result, `B's delete of A's ${table} row is denied`)
    } else {
      expectNoRows(
        result,
        `B's delete of A's ${table} row removes 0 rows`,
        remove,
        `delete ${table}`
      )
    }
  }

  const forbiddenCustomer = await request(baseUrl, key, b.token, '/rest/v1/customers', {
    method: 'POST',
    body: JSON.stringify({ user_id: a.userId, name: 'RLS forbidden insert' }),
  })
  if (isRlsViolation(forbiddenCustomer.status, forbiddenCustomer.body)) {
    pass(result, "B's insert of an A-owned customer is denied")
  } else {
    fail(result, `B inserted an A-owned customer (${forbiddenCustomer.status})`)
    await request(baseUrl, key, a.token, '/rest/v1/customers?name=eq.RLS forbidden insert', {
      method: 'DELETE',
    })
  }

  const forbiddenVisit = await request(baseUrl, key, b.token, '/rest/v1/visits', {
    method: 'POST',
    body: JSON.stringify({ user_id: a.userId, visited_at: new Date().toISOString() }),
  })
  if (isRlsViolation(forbiddenVisit.status, forbiddenVisit.body)) {
    pass(result, "B's insert of an A-owned visit is denied")
  } else {
    fail(result, `B inserted an A-owned visit (${forbiddenVisit.status})`)
  }
}

async function checkStorage(
  result: RunResult,
  baseUrl: string,
  key: string,
  a: Session,
  b: Session,
  path: string,
  forbiddenPath: string
): Promise<void> {
  const upload = await request(
    baseUrl,
    key,
    a.token,
    `/storage/v1/object/${PHOTO_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'x-upsert': 'true' },
      body: 'rls probe object',
    }
  )
  if (upload.status !== 200) {
    fail(result, `A could not upload a probe object (${upload.status}): ${briefError(upload.body)}`)
    return
  }
  pass(result, "A uploaded an object into A's storage folder")

  const read = await request(
    baseUrl,
    key,
    b.token,
    `/storage/v1/object/authenticated/${PHOTO_BUCKET}/${path}`
  )
  const leaked = read.status === 200 && read.body.includes('rls probe object')
  if (leaked) fail(result, "B downloaded A's storage object")
  else pass(result, "B cannot download A's storage object")

  const write = await request(
    baseUrl,
    key,
    b.token,
    `/storage/v1/object/${PHOTO_BUCKET}/${forbiddenPath}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'forbidden',
    }
  )
  if (isRlsViolation(write.status, write.body)) {
    pass(result, "B's write into A's storage folder is denied")
  } else {
    fail(result, `B wrote into A's storage folder (${write.status})`)
  }

  const remove = await request(
    baseUrl,
    key,
    a.token,
    `/storage/v1/object/${PHOTO_BUCKET}/${path}`,
    {
      method: 'DELETE',
    }
  )
  if (remove.status === 200) pass(result, 'A deleted the probe object')
  else fail(result, `A could not delete the probe object (${remove.status})`)
}

async function cleanup(baseUrl: string, key: string, a: Session, seeds: Seeds): Promise<void> {
  const ids: Record<string, string> = {
    customers: seeds.customer,
    services: seeds.service,
    appointments: seeds.appointment,
    appointment_services: seeds.appointmentService,
    visits: seeds.visit,
    visit_services: seeds.visitService,
    payments: seeds.payment,
    expenses: seeds.expense,
    color_formulas: seeds.formula,
    color_formula_items: seeds.formulaItem,
    customer_photos: seeds.photo,
  }

  for (const table of CLEANUP_ORDER) {
    const response = await request(baseUrl, key, a.token, `/rest/v1/${table}?id=eq.${ids[table]}`, {
      method: 'DELETE',
    })
    if (response.status >= 400) {
      log(`WARN  cleanup of ${table} returned ${response.status}: ${briefError(response.body)}`)
    }
  }
  log('INFO  probe rows cleaned up (profiles are created by the signup trigger and left intact)')
}

function parseArgs(argv: string[]): { out: string | null } {
  let out: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out') {
      const value = argv[index + 1]
      if (!value) throw new Error('--out needs a path')
      out = resolve(process.cwd(), value)
      index += 1
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return { out }
}

async function main(): Promise<void> {
  const { out } = parseArgs(process.argv.slice(2))
  const env = await loadEnv()

  const baseUrl = normalizeBaseUrl(firstEnv(env, ['VITE_SUPABASE_URL', 'SUPABASE_URL']))
  const key = normalizeKey(firstEnv(env, ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']))

  const keyProblem = inspectAnonKey(key)
  log(`INFO  project: ${baseUrl}`)
  log(`INFO  key: ${keyFingerprint(key)} (${keyProblem.kind})`)
  if (keyProblem.hint) log(`INFO  key note: ${keyProblem.hint}`)
  if (keyProblem.kind === 'secret' || keyProblem.kind === 'malformed') {
    throw new Error(
      'the configured key cannot authenticate a client; fix .env.local before running the RLS check'
    )
  }

  const health = await request(baseUrl, key, null, '/auth/v1/health')
  if (health.status !== 200) {
    throw new Error(
      `Supabase rejected the key (auth health ${health.status}): ${briefError(health.body)}`
    )
  }
  log('INFO  auth health OK')

  const schema = await request(baseUrl, key, null, '/rest/v1/profiles?select=id&limit=1')
  if (schema.status === 404 && schema.body.includes('PGRST205')) {
    throw new Error(
      'schema is not applied: run supabase/migrations/001–003 (docs/11-release-runbook.md §2) before the RLS check'
    )
  }
  if (schema.status >= 400) {
    throw new Error(`schema preflight failed (${schema.status}): ${briefError(schema.body)}`)
  }
  log('INFO  schema present (profiles reachable)')

  const a = await signIn(
    baseUrl,
    key,
    'user A',
    requireEnv(env, 'RLS_USER_A_EMAIL'),
    requireEnv(env, 'RLS_USER_A_PASSWORD')
  )
  const b = await signIn(
    baseUrl,
    key,
    'user B',
    requireEnv(env, 'RLS_USER_B_EMAIL'),
    requireEnv(env, 'RLS_USER_B_PASSWORD')
  )

  if (a.userId === b.userId) throw new Error('user A and user B resolve to the same account')
  log(`INFO  user A: ${a.email} (${a.userId.slice(0, 8)}…)`)
  log(`INFO  user B: ${b.email} (${b.userId.slice(0, 8)}…)`)

  const result: RunResult = { failures: [], checks: 0 }

  const profileResponse = await request(
    baseUrl,
    key,
    a.token,
    `/rest/v1/profiles?select=id&user_id=eq.${a.userId}`
  )
  const profiles = rowsOf(profileResponse.body) as { id?: unknown }[]
  const aProfileId = typeof profiles[0]?.id === 'string' ? profiles[0].id : null
  if (profileResponse.status !== 200 || !aProfileId) {
    throw new Error(
      `could not read A's profile (${profileResponse.status}): ${briefError(profileResponse.body)}`
    )
  }
  pass(result, "A can read A's profile")

  const ownProfile = await request(
    baseUrl,
    key,
    b.token,
    `/rest/v1/profiles?select=id&user_id=eq.${b.userId}`
  )
  if (ownProfile.status === 200 && rowsOf(ownProfile.body).length === 1) {
    pass(result, "B can read B's own profile (session is valid)")
  } else {
    throw new Error(`B's session cannot read its own profile (${ownProfile.status})`)
  }

  const marker = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  const seeds: Seeds = {
    customer: randomUUID(),
    service: randomUUID(),
    appointment: randomUUID(),
    appointmentService: randomUUID(),
    visit: randomUUID(),
    visitService: randomUUID(),
    payment: randomUUID(),
    expense: randomUUID(),
    formula: randomUUID(),
    formulaItem: randomUUID(),
    photo: randomUUID(),
  }
  const probePath = storageProbePath(a.userId, marker)
  const forbiddenPath = storageProbePath(a.userId, `${marker}-forbidden`)

  try {
    await insertSeeds(result, baseUrl, key, a, seeds, marker)
    await checkReads(result, baseUrl, key, b, aProfileId, seeds)
    await checkWrites(result, baseUrl, key, b, a, aProfileId, seeds)
    await checkStorage(result, baseUrl, key, a, b, probePath, forbiddenPath)
  } finally {
    await cleanup(baseUrl, key, a, seeds)
    await request(baseUrl, key, a.token, `/storage/v1/object/${PHOTO_BUCKET}/${probePath}`, {
      method: 'DELETE',
    })
    await request(baseUrl, key, a.token, `/storage/v1/object/${PHOTO_BUCKET}/${forbiddenPath}`, {
      method: 'DELETE',
    })
  }

  if (result.failures.length > 0) {
    log(`RLS verification FAILED (${result.failures.length} failure(s))`)
    for (const failure of result.failures) log(` - ${failure}`)
  } else {
    log(`RLS verification passed (${result.checks} checks)`)
  }

  if (out) {
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, `${lines.join('\n')}\n`, 'utf8')
    console.log(`INFO  report written to ${out}`)
  }

  if (result.failures.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[rls] ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  })
}

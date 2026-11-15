import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(process.cwd(), 'src/database/migrations')

const EXPECTED = [
  '001_initial.sql',
  '002_outbox_hardening.sql',
  '003_sync_state.sql',
  '004_expense_tombstones.sql',
  '005_outbox_user_scope.sql',
  '006_sync_cursor_user.sql',
]

describe('SQLite migrations', () => {
  it('keeps every migration file, in order', () => {
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort()
    expect(files).toEqual(EXPECTED)
  })

  it('registers every migration file with the runner', () => {
    const runner = readFileSync(resolve(process.cwd(), 'src/database/sqlite/migrations.ts'), 'utf8')
    for (const file of EXPECTED) {
      expect(runner).toContain(`../migrations/${file}?raw`)
    }
  })
})

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort()

function read(file: string): string {
  return readFileSync(join(migrationsDir, file), 'utf8')
}

describe('Supabase migrations are re-runnable', () => {
  it('finds the committed migrations', () => {
    expect(files).toEqual([
      '001_initial_schema.sql',
      '002_sync_indexes_and_fk.sql',
      '003_photo_storage_policy.sql',
      '004_same_user_ownership.sql',
      '005_sync_tombstones.sql',
    ])
  })

  for (const file of files) {
    it(`${file} uses only idempotent indexes, tables and triggers`, () => {
      const sql = read(file)
      const statements = sql.split('\n')

      for (const line of statements) {
        if (/^CREATE INDEX /.test(line)) {
          expect(line).toContain('IF NOT EXISTS')
        }
        if (/^CREATE TABLE /.test(line)) {
          expect(line).toContain('IF NOT EXISTS')
        }
        if (/^CREATE TRIGGER /.test(line)) {
          const drop = `DROP TRIGGER IF EXISTS ${line.split(' ')[2]}`
          expect(sql).toContain(drop)
        }
      }
    })
  }

  for (const file of files) {
    it(`${file} guards every policy with a drop or a duplicate_object handler`, () => {
      const sql = read(file)
      const guardedByException = sql.includes('when duplicate_object')

      for (const match of sql.matchAll(/CREATE POLICY ("[^"]+") ON ([\w.]+)/g)) {
        const [, name, table] = match
        const drop = `DROP POLICY IF EXISTS ${name} ON ${table};`
        expect(sql.includes(drop) || guardedByException).toBe(true)
      }
    })
  }

  it('creates the private photo bucket without failing on a second run', () => {
    const sql = read('001_initial_schema.sql')
    expect(sql).toContain("VALUES ('customer-photos', 'customer-photos', false)")
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')
  })

  it('adds the expense tombstone column idempotently', () => {
    const sql = read('002_sync_indexes_and_fk.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ')
  })

  it('adds same-user ownership constraints only once and without rewriting rows', () => {
    const sql = read('004_same_user_ownership.sql')
    expect(sql).toContain('select 1 from pg_constraint')
    expect(sql).toContain('not valid')
    expect(sql).toContain('references public.%I (id, user_id)')
  })
})

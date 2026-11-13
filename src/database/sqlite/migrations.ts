/**
 * Migration runner.
 * Reads SQL migration files and applies them in order using
 * a local `schema_migrations` table to track which have been applied.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import migration001 from '../migrations/001_initial.sql?raw'
import migration002 from '../migrations/002_outbox_hardening.sql?raw'
import migration003 from '../migrations/003_sync_state.sql?raw'
import migration004 from '../migrations/004_expense_tombstones.sql?raw'

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: migration001 },
  { version: 2, name: '002_outbox_hardening', sql: migration002 },
  { version: 3, name: '003_sync_state', sql: migration003 },
  { version: 4, name: '004_expense_tombstones', sql: migration004 },
]

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`

export async function runMigrations(db: SQLiteDBConnection): Promise<void> {
  // Ensure migrations table exists
  await db.execute(MIGRATIONS_TABLE)

  for (const migration of MIGRATIONS) {
    const existing = await db.query('SELECT version FROM schema_migrations WHERE version = ?', [
      migration.version,
    ])

    if ((existing.values?.length ?? 0) > 0) {
      continue // already applied
    }

    console.log(`[migrations] Applying migration ${migration.name}…`)

    try {
      await db.execute(migration.sql)
      await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ])
      console.log(`[migrations] ✓ ${migration.name}`)
    } catch (err) {
      console.error(`[migrations] ✗ Failed to apply ${migration.name}:`, err)
      throw err
    }
  }
}

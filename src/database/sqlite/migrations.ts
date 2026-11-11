/**
 * Migration runner.
 * Reads SQL migration files and applies them in order using
 * a local `schema_migrations` table to track which have been applied.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import migration001 from '../migrations/001_initial.sql?raw'

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial', sql: migration001 },
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
    const existing = await db.query(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [migration.version]
    )

    if ((existing.values?.length ?? 0) > 0) {
      continue // already applied
    }

    console.log(`[migrations] Applying migration ${migration.name}…`)

    try {
      await db.execute(migration.sql)
      await db.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, new Date().toISOString()]
      )
      console.log(`[migrations] ✓ ${migration.name}`)
    } catch (err) {
      console.error(`[migrations] ✗ Failed to apply ${migration.name}:`, err)
      throw err
    }
  }
}

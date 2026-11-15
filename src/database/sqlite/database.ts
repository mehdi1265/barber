/**
 * SQLite database bootstrap.
 *
 * Uses @capacitor-community/sqlite.
 *
 * - Native (Android/iOS): SQLCipher with a randomly generated passphrase. The
 *   plugin stores the passphrase in the platform secure store (Android
 *   EncryptedSharedPreferences / iOS Keychain), so it is never written to
 *   localStorage by this app.
 * - Web: jeep-sqlite + IndexedDB, intentionally unencrypted. Browser storage is
 *   for development and demos only; it is not a production security boundary.
 *
 * The connection is a singleton. Every newly opened or retrieved connection
 * gets `PRAGMA foreign_keys = ON` because the pragma is per-connection.
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { ensureWebSqlite } from './web-store'
import { withTimeout } from '@shared/utils/timeout'
import { logger } from '@shared/utils/logger'

const DB_NAME = 'barber_app'
const DB_VERSION = 1
const FOREIGN_KEYS_PRAGMA = 'PRAGMA foreign_keys = ON;'
const OPEN_TIMEOUT_MS = 15_000

// Singleton connection
let _db: SQLiteDBConnection | null = null
let opening: Promise<SQLiteDBConnection> | null = null
let webStoreInitialized = false
let webPersistenceHooked = false
const sqlite = new SQLiteConnection(CapacitorSQLite)

/**
 * Generates the SQLCipher passphrase for a fresh native install.
 *
 * The passphrase is handed to the plugin once and stored in the platform
 * secure store. It must not be persisted in web storage.
 */
function generatePassphrase(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function ensureNativeEncryption(): Promise<void> {
  const secretStored = (await sqlite.isSecretStored()).result ?? false
  if (!secretStored) {
    await sqlite.setEncryptionSecret(generatePassphrase())
  }
}

async function applyConnectionPragmas(db: SQLiteDBConnection): Promise<void> {
  // The plugin wraps execute() in a transaction by default, and SQLite ignores
  // `PRAGMA foreign_keys` while one is open. Pass false or FKs stay off.
  await db.execute(FOREIGN_KEYS_PRAGMA, false)

  // Read it back: a silently ignored pragma turns every child insert into a
  // missing-parent bug that only shows up as "FOREIGN KEY constraint failed".
  const result = await db.query('PRAGMA foreign_keys')
  const enabled = (result.values?.[0] as { foreign_keys?: number } | undefined)?.foreign_keys
  if (enabled !== 1) {
    logger.warn('SQLite foreign_keys pragma did not take effect', { foreign_keys: enabled ?? null })
  }
}

/**
 * jeep-sqlite auto-saves after write statements when `autosave="true"` is set
 * on the element. Flush again when the page is hidden so a pending write is not
 * lost when the browser is closed or backgrounded.
 */
function registerWebPersistence(): void {
  if (webPersistenceHooked) return
  webPersistenceHooked = true

  const flush = () => {
    if (!_db) return
    void sqlite.saveToStore(DB_NAME).catch(err => {
      console.warn('[database] Could not persist web store:', err)
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

export async function getDatabase(): Promise<SQLiteDBConnection> {
  // A native plugin call can stay pending forever (for example a SQLCipher
  // connection that never opens). Every caller gets a bounded wait with a real
  // error instead of a promise that never settles; the shared attempt keeps
  // running in the background, so a later call still succeeds if it recovers.
  return withTimeout(ensureOpening(), OPEN_TIMEOUT_MS, 'Database initialisation timed out')
}

function ensureOpening(): Promise<SQLiteDBConnection> {
  if (_db) return Promise.resolve(_db)
  if (opening) return opening

  opening = openDatabase().finally(() => {
    opening = null
  })
  return opening
}

async function openDatabase(): Promise<SQLiteDBConnection> {
  const isWeb = Capacitor.getPlatform() === 'web'

  try {
    if (isWeb && !webStoreInitialized) {
      // Register the Stencil custom element before the plugin awaits it.
      await ensureWebSqlite()
      await sqlite.initWebStore()
      webStoreInitialized = true
    } else if (!isWeb) {
      // Must run before createConnection/open. The plugin refuses to overwrite
      // an existing secret, so check first on every cold start.
      await ensureNativeEncryption()
    }

    const isConsistent = await sqlite.checkConnectionsConsistency()
    const isConnected = (await sqlite.isConnection(DB_NAME, false)).result ?? false

    if (isConsistent.result && isConnected) {
      _db = await sqlite.retrieveConnection(DB_NAME, false)
      // A previously failed attempt can leave a connection that exists but is
      // not open; retrieveConnection returns it as-is.
      const isOpen = (await _db.isDBOpen()).result ?? false
      if (!isOpen) await _db.open()
    } else {
      _db = await sqlite.createConnection(
        DB_NAME,
        !isWeb, // encrypted: native only
        isWeb ? 'no-encryption' : 'secret',
        DB_VERSION,
        false // readonly
      )
      await _db.open()
    }

    // Per-connection setting: must be applied after open() and after
    // retrieveConnection(), not only inside the initial migration.
    await applyConnectionPragmas(_db)

    if (isWeb) registerWebPersistence()

    return _db
  } catch (err) {
    // Do not leave a half-open connection in the singleton: a retry must create
    // or retrieve a clean connection.
    _db = null
    try {
      await sqlite.closeConnection(DB_NAME, false)
    } catch {
      // The connection may never have been created; nothing to close.
    }
    throw err
  }
}

export async function closeDatabase(): Promise<void> {
  if (!_db) return

  if (Capacitor.getPlatform() === 'web') {
    try {
      await sqlite.saveToStore(DB_NAME)
    } catch (err) {
      console.warn('[database] Could not persist web store before close:', err)
    }
  }

  await sqlite.closeConnection(DB_NAME, false)
  _db = null
}

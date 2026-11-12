/**
 * SQLite database bootstrap.
 *
 * Uses @capacitor-community/sqlite.
 * On web (dev / test) it falls back to jeep-sqlite (in-memory).
 * Database is opened with SQLCipher encryption when a passphrase is available.
 */

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite'

const DB_NAME = 'barber_app'
const DB_VERSION = 1

// Singleton connection
let _db: SQLiteDBConnection | null = null
const sqlite = new SQLiteConnection(CapacitorSQLite)

/**
 * Returns passphrase for SQLCipher.
 * In production this should come from the device secure storage / keychain.
 * For now we derive a device-bound key stored in localStorage as a placeholder
 * until the full secure-storage implementation is added in Phase 7.
 *
 * TODO (Phase 7): Replace with @capacitor/secure-storage or Keychain/Keystore.
 */
function getPassphrase(): string {
  const storageKey = '__barber_dbk__'
  let key = localStorage.getItem(storageKey)
  if (!key) {
    // Generate a random 32-char hex key once per install
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    key = Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    localStorage.setItem(storageKey, key)
  }
  return key
}

export async function getDatabase(): Promise<SQLiteDBConnection> {
  if (_db) return _db

  const platform = Capacitor.getPlatform()

  // Web platform: use jeep-sqlite (must be loaded in index.html for full web support)
  if (platform === 'web') {
    await sqlite.initWebStore()
  }

  const passphrase = getPassphrase()

  const isConsistent = await sqlite.checkConnectionsConsistency()
  const isConnected = (await sqlite.isConnection(DB_NAME, false)).result ?? false

  if (isConsistent.result && isConnected) {
    _db = await sqlite.retrieveConnection(DB_NAME, false)
  } else {
    _db = await sqlite.createConnection(
      DB_NAME,
      true, // encrypted
      'secret', // mode
      DB_VERSION,
      false // readonly
    )
    await _db.open()
    // Set the encryption key (SQLCipher PRAGMA key)
    await _db.execute(`PRAGMA key = '${passphrase}';`)
  }

  return _db
}

export async function closeDatabase(): Promise<void> {
  if (_db) {
    await sqlite.closeConnection(DB_NAME, false)
    _db = null
  }
}

/**
 * Vitest global test setup.
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

declare global {
  // Test-only switch so native-only code paths can be exercised.
  // eslint-disable-next-line no-var
  var __capacitorNative: boolean | undefined
}

// Mock Capacitor plugins (not available in jsdom)
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => (globalThis.__capacitorNative ? 'android' : 'web'),
    isNativePlatform: () => Boolean(globalThis.__capacitorNative),
  },
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn().mockImplementation(() => ({
    initWebStore: vi.fn().mockResolvedValue(undefined),
    saveToStore: vi.fn().mockResolvedValue(undefined),
    isSecretStored: vi.fn().mockResolvedValue({ result: true }),
    setEncryptionSecret: vi.fn().mockResolvedValue(undefined),
    checkConnectionsConsistency: vi.fn().mockResolvedValue({ result: false }),
    isConnection: vi.fn().mockResolvedValue({ result: false }),
    createConnection: vi.fn().mockResolvedValue({
      open: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ values: [] }),
    }),
    retrieveConnection: vi.fn(),
    closeConnection: vi.fn().mockResolvedValue(undefined),
  })),
  SQLiteDBConnection: vi.fn(),
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    createChannel: vi.fn().mockResolvedValue(undefined),
    getPending: vi.fn().mockResolvedValue({ notifications: [] }),
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}))

// Polyfill crypto.randomUUID for jsdom
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    }) as `${string}-${string}-${string}-${string}-${string}`
  }
}

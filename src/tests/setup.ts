/**
 * Vitest global test setup.
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Capacitor plugins (not available in jsdom)
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'web',
    isNativePlatform: () => false,
  },
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn().mockImplementation(() => ({
    initWebStore: vi.fn().mockResolvedValue(undefined),
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
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
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

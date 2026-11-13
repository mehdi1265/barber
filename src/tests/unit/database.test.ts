import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const db = {
    open: vi.fn(),
    isDBOpen: vi.fn(),
    execute: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  }

  const connection = {
    initWebStore: vi.fn(),
    saveToStore: vi.fn(),
    isSecretStored: vi.fn(),
    setEncryptionSecret: vi.fn(),
    checkConnectionsConsistency: vi.fn(),
    isConnection: vi.fn(),
    createConnection: vi.fn(),
    retrieveConnection: vi.fn(),
    closeConnection: vi.fn(),
  }

  return {
    db,
    connection,
    platform: 'web',
  }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => state.platform,
    isNativePlatform: () => state.platform !== 'web',
  },
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(function () {
    return state.connection
  }),
  SQLiteDBConnection: vi.fn(),
}))

vi.mock('@database/sqlite/web-store', () => ({
  ensureWebSqlite: vi.fn().mockResolvedValue(undefined),
}))

const PRAGMA = 'PRAGMA foreign_keys = ON;'

describe('database bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    state.platform = 'web'
    state.connection.initWebStore.mockResolvedValue(undefined)
    state.connection.saveToStore.mockResolvedValue(undefined)
    state.connection.isSecretStored.mockResolvedValue({ result: false })
    state.connection.setEncryptionSecret.mockResolvedValue(undefined)
    state.connection.checkConnectionsConsistency.mockResolvedValue({ result: false })
    state.connection.isConnection.mockResolvedValue({ result: false })
    state.connection.createConnection.mockResolvedValue(state.db)
    state.connection.retrieveConnection.mockResolvedValue(state.db)
    state.connection.closeConnection.mockResolvedValue(undefined)

    state.db.open.mockResolvedValue(undefined)
    state.db.isDBOpen.mockResolvedValue({ result: true })
    state.db.execute.mockResolvedValue(undefined)
    state.db.run.mockResolvedValue(undefined)
    state.db.query.mockResolvedValue({ values: [] })
  })

  it('initialises the web store without encryption and applies foreign keys', async () => {
    const { getDatabase } = await import('@database/sqlite/database')

    await getDatabase()

    expect(state.connection.initWebStore).toHaveBeenCalledTimes(1)
    expect(state.connection.setEncryptionSecret).not.toHaveBeenCalled()
    expect(state.connection.createConnection).toHaveBeenCalledWith(
      'barber_app',
      false,
      'no-encryption',
      1,
      false
    )
    expect(state.db.open).toHaveBeenCalledTimes(1)
    expect(state.db.execute).toHaveBeenCalledWith(PRAGMA)
  })

  it('creates the native secret before opening an encrypted connection', async () => {
    state.platform = 'android'
    const { getDatabase } = await import('@database/sqlite/database')

    await getDatabase()

    expect(state.connection.initWebStore).not.toHaveBeenCalled()
    expect(state.connection.isSecretStored).toHaveBeenCalledTimes(1)
    expect(state.connection.setEncryptionSecret).toHaveBeenCalledTimes(1)
    expect(state.connection.setEncryptionSecret.mock.calls[0]?.[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(state.connection.createConnection).toHaveBeenCalledWith(
      'barber_app',
      true,
      'secret',
      1,
      false
    )
    expect(state.db.execute).toHaveBeenCalledWith(PRAGMA)

    const secretOrder = state.connection.setEncryptionSecret.mock.invocationCallOrder[0]
    const openOrder = state.db.open.mock.invocationCallOrder[0]
    expect(secretOrder).toBeLessThan(openOrder)
  })

  it('does not overwrite an existing native secret', async () => {
    state.platform = 'android'
    state.connection.isSecretStored.mockResolvedValue({ result: true })
    const { getDatabase } = await import('@database/sqlite/database')

    await getDatabase()

    expect(state.connection.setEncryptionSecret).not.toHaveBeenCalled()
    expect(state.connection.createConnection).toHaveBeenCalledWith(
      'barber_app',
      true,
      'secret',
      1,
      false
    )
  })

  it('applies foreign keys when retrieving an existing connection', async () => {
    state.connection.checkConnectionsConsistency.mockResolvedValue({ result: true })
    state.connection.isConnection.mockResolvedValue({ result: true })
    const { getDatabase } = await import('@database/sqlite/database')

    await getDatabase()

    expect(state.connection.retrieveConnection).toHaveBeenCalledWith('barber_app', false)
    expect(state.connection.createConnection).not.toHaveBeenCalled()
    expect(state.db.execute).toHaveBeenCalledTimes(1)
    expect(state.db.execute).toHaveBeenCalledWith(PRAGMA)
  })

  it('opens a retrieved connection that was left closed', async () => {
    state.connection.checkConnectionsConsistency.mockResolvedValue({ result: true })
    state.connection.isConnection.mockResolvedValue({ result: true })
    state.db.isDBOpen.mockResolvedValue({ result: false })
    const { getDatabase } = await import('@database/sqlite/database')

    await getDatabase()

    expect(state.connection.retrieveConnection).toHaveBeenCalledWith('barber_app', false)
    expect(state.db.open).toHaveBeenCalledTimes(1)
    expect(state.db.execute).toHaveBeenCalledWith(PRAGMA)
  })

  it('reuses the singleton and applies the pragma once', async () => {
    const { getDatabase } = await import('@database/sqlite/database')

    const first = await getDatabase()
    const second = await getDatabase()

    expect(second).toBe(first)
    expect(state.connection.createConnection).toHaveBeenCalledTimes(1)
    expect(state.db.execute).toHaveBeenCalledTimes(1)
  })

  it('clears a failed connection so a retry can open cleanly', async () => {
    state.connection.createConnection.mockRejectedValueOnce(new Error('open failed'))
    const { getDatabase } = await import('@database/sqlite/database')

    await expect(getDatabase()).rejects.toThrow('open failed')
    expect(state.connection.closeConnection).toHaveBeenCalled()

    const db = await getDatabase()
    expect(db).toBe(state.db)
    expect(state.connection.createConnection).toHaveBeenCalledTimes(2)
  })
})

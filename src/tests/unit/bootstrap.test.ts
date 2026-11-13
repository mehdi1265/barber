import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  runMigrations: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('@database/sqlite/database', () => ({
  getDatabase: state.getDatabase,
}))

vi.mock('@database/sqlite/migrations', () => ({
  runMigrations: state.runMigrations,
}))

vi.mock('@services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: state.getSession,
      onAuthStateChange: state.onAuthStateChange,
    },
  },
}))

import { bootstrapApp, initializeDatabase } from '@/app/bootstrap'
import { useAuthStore } from '@state/auth.store'
import { useDatabaseStore } from '@state/database.store'

describe('bootstrap resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      user: null,
      session: null,
      userId: null,
      isAuthenticated: false,
      isLoading: true,
    })
    useDatabaseStore.setState({ status: 'idle' })

    state.getDatabase.mockResolvedValue({})
    state.runMigrations.mockResolvedValue(undefined)
    state.getSession.mockResolvedValue({ data: { session: null }, error: null })
    state.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  })

  it('records a database error without throwing', async () => {
    state.getDatabase.mockRejectedValue(new Error('database unavailable'))

    await expect(initializeDatabase()).resolves.toBeUndefined()
    expect(useDatabaseStore.getState().status).toBe('error')
  })

  it('marks the database ready after migrations', async () => {
    await initializeDatabase()

    expect(state.runMigrations).toHaveBeenCalledTimes(1)
    expect(useDatabaseStore.getState().status).toBe('ready')
  })

  it('still restores auth and finishes loading when the database fails', async () => {
    state.getDatabase.mockRejectedValue(new Error('database unavailable'))

    await expect(bootstrapApp()).resolves.toBeUndefined()

    expect(useDatabaseStore.getState().status).toBe('error')
    expect(useAuthStore.getState().isLoading).toBe(false)
    expect(state.getSession).toHaveBeenCalledTimes(1)
    expect(state.onAuthStateChange).toHaveBeenCalledTimes(1)
  })
})

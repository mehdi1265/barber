import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from '@features/settings/SettingsPage'
import { PendingOutboxError } from '@features/settings/local-data'
import { useAuthStore } from '@state/auth.store'

const { deleteLocalAccountData } = vi.hoisted(() => ({
  deleteLocalAccountData: vi.fn(),
}))

vi.mock('@features/settings/local-data', async importOriginal => {
  const actual = await importOriginal<typeof import('@features/settings/local-data')>()
  return { ...actual, deleteLocalAccountData }
})

vi.mock('@features/settings/settings.hooks', () => ({
  useProfile: () => ({ data: null, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@features/auth/auth.usecases', () => ({
  logoutUseCase: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@sync/engine/sync.manager', () => ({
  restoreFromCloud: vi.fn(),
  runSync: vi.fn(),
}))

vi.mock('@services/notifications/local-notifications', () => ({
  getNotificationPermission: vi.fn().mockResolvedValue('denied'),
  requestNotificationPermission: vi.fn().mockResolvedValue(false),
  rescheduleAllReminders: vi.fn(),
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function confirmWipe() {
  fireEvent.click(screen.getByRole('button', { name: 'حذف داده‌های این دستگاه' }))
  const dialog = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'حذف کن' }))
    await Promise.resolve()
  })
  return dialog
}

describe('Settings — local data wipe', () => {
  beforeEach(() => {
    deleteLocalAccountData.mockReset()
  })

  it('wipes only after confirmation and reports success', async () => {
    useAuthStore.setState({ userId: 'user-1', isAuthenticated: true })
    deleteLocalAccountData.mockResolvedValueOnce(undefined)
    renderPage()

    await confirmWipe()

    await waitFor(() => expect(deleteLocalAccountData).toHaveBeenCalledWith('user-1'))
    expect(await screen.findByText('داده‌های محلی حذف شد.')).toBeInTheDocument()
  })

  it('refuses and explains when unsynced changes exist', async () => {
    useAuthStore.setState({ userId: 'user-1', isAuthenticated: true })
    deleteLocalAccountData.mockRejectedValueOnce(new PendingOutboxError(2))
    renderPage()

    await confirmWipe()

    expect(
      await screen.findByText(/تغییرات ارسال‌نشده دارید؛ ابتدا همگام‌سازی کنید/)
    ).toBeInTheDocument()
    expect(screen.queryByText('داده‌های محلی حذف شد.')).not.toBeInTheDocument()
  })

  it('does not wipe when the dialog is cancelled', async () => {
    useAuthStore.setState({ userId: 'user-1', isAuthenticated: true })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'حذف داده‌های این دستگاه' }))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))

    expect(deleteLocalAccountData).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountMenu } from '@features/auth/AccountMenu'

function renderMenu(getPendingCount = vi.fn().mockResolvedValue(0)) {
  const onLogout = vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter>
      <AccountMenu email="ali@example.com" onLogout={onLogout} getPendingCount={getPendingCount} />
    </MemoryRouter>
  )
  return { onLogout, getPendingCount }
}

async function openLogoutDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'منوی حساب' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'خروج از حساب' }))
  return screen.findByRole('alertdialog')
}

describe('AccountMenu', () => {
  it('shows the email and a pending-sync warning before logout', async () => {
    const { getPendingCount } = renderMenu(vi.fn().mockResolvedValue(3))

    fireEvent.click(screen.getByRole('button', { name: 'منوی حساب' }))
    expect(screen.getByText('ali@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'خروج از حساب' }))
    const dialog = await screen.findByRole('alertdialog')

    expect(getPendingCount).toHaveBeenCalledTimes(1)
    expect(dialog).toHaveTextContent(/۳ تغییر در انتظار همگام‌سازی/)
  })

  it('logs out after confirmation', async () => {
    const { onLogout } = renderMenu()
    await openLogoutDialog()

    fireEvent.click(screen.getByRole('button', { name: 'خروج' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('keeps the session when the dialog is cancelled', async () => {
    const { onLogout } = renderMenu()
    await openLogoutDialog()

    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))

    expect(onLogout).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('treats a failed count as zero and still confirms', async () => {
    renderMenu(vi.fn().mockRejectedValue(new Error('database unavailable')))
    const dialog = await openLogoutDialog()

    expect(dialog).toHaveTextContent(/اطلاعات محلی این دستگاه حفظ می‌شود/)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  hasActiveSession: vi.fn(),
  applyRecoverySession: vi.fn(),
  updatePasswordUseCase: vi.fn(),
}))

vi.mock('@features/auth/auth.usecases', () => ({
  hasActiveSession: state.hasActiveSession,
  applyRecoverySession: state.applyRecoverySession,
  updatePasswordUseCase: state.updatePasswordUseCase,
}))

import ResetPasswordPage from '@features/auth/ResetPasswordPage'

function renderPage() {
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a retry path when the recovery link is invalid', async () => {
    state.hasActiveSession.mockResolvedValue(false)
    state.applyRecoverySession.mockResolvedValue({
      error: { message: 'لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید' },
    })

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('لینک بازیابی نامعتبر')
    expect(screen.getByRole('link', { name: 'درخواست لینک جدید' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('saves a new password when a session already exists', async () => {
    state.hasActiveSession.mockResolvedValue(true)
    state.updatePasswordUseCase.mockResolvedValue({ error: null })

    renderPage()

    const password = await screen.findByLabelText(/رمز عبور جدید/)
    fireEvent.change(password, { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/تکرار رمز عبور/), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره رمز جدید' }))

    await waitFor(() => expect(state.updatePasswordUseCase).toHaveBeenCalledWith('secret123'))
    expect(await screen.findByText(/رمز عبور شما تغییر کرد/)).toBeInTheDocument()
  })
})

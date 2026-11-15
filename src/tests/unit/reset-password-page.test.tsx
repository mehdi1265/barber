import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({
  hasActiveSession: vi.fn(),
  applyRecoverySession: vi.fn(),
  updatePasswordUseCase: vi.fn(),
  verifyRecoveryOtpUseCase: vi.fn(),
}))

vi.mock('@features/auth/auth.usecases', () => ({
  hasActiveSession: state.hasActiveSession,
  applyRecoverySession: state.applyRecoverySession,
  updatePasswordUseCase: state.updatePasswordUseCase,
  verifyRecoveryOtpUseCase: state.verifyRecoveryOtpUseCase,
}))

import ResetPasswordPage from '@features/auth/ResetPasswordPage'
import { RECOVERY_LINK_EVENT } from '@features/auth/recovery-link'

function renderPage(entry = '/reset-password') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ResetPasswordPage />
    </MemoryRouter>
  )
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('shows a retry path when the recovery link is invalid', async () => {
    window.history.replaceState(null, '', '/reset-password#access_token=at&refresh_token=rt')
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
    expect(screen.getByLabelText(/کد بازیابی/)).toBeInTheDocument()
  })

  it('shows the code form when no link is present', async () => {
    state.hasActiveSession.mockResolvedValue(false)

    renderPage('/reset-password?email=ali%40example.com')

    expect(await screen.findByLabelText(/کد بازیابی/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ایمیل/)).toHaveValue('ali@example.com')
    expect(state.applyRecoverySession).not.toHaveBeenCalled()
  })

  it('re-checks the session when a native recovery link arrives', async () => {
    state.hasActiveSession.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    renderPage()

    expect(await screen.findByLabelText(/کد بازیابی/)).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new CustomEvent(RECOVERY_LINK_EVENT, { detail: { ok: true } }))
    })

    expect(await screen.findByLabelText(/رمز عبور جدید/)).toBeInTheDocument()
  })

  it('verifies an emailed code before showing the password form', async () => {
    state.hasActiveSession.mockResolvedValue(false)
    state.verifyRecoveryOtpUseCase.mockResolvedValue({ error: null })

    renderPage('/reset-password?email=ali%40example.com')

    fireEvent.change(await screen.findByLabelText(/کد بازیابی/), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأیید کد' }))

    await waitFor(() =>
      expect(state.verifyRecoveryOtpUseCase).toHaveBeenCalledWith('ali@example.com', '123456')
    )
    expect(await screen.findByLabelText(/رمز عبور جدید/)).toBeInTheDocument()
  })

  it('keeps the code form and shows an error for a rejected code', async () => {
    state.hasActiveSession.mockResolvedValue(false)
    state.verifyRecoveryOtpUseCase.mockResolvedValue({
      error: { message: 'کد بازیابی نامعتبر یا منقضی شده است' },
    })

    renderPage('/reset-password?email=ali%40example.com')

    fireEvent.change(await screen.findByLabelText(/کد بازیابی/), {
      target: { value: '000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأیید کد' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('کد بازیابی نامعتبر')
    expect(screen.getByLabelText(/کد بازیابی/)).toBeInTheDocument()
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

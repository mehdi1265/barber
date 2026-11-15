import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { clearLogEntries, getLogEntries } from '@shared/utils/logger'

function Boom(): never {
  throw new Error('raw internal detail')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    clearLogEntries()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('صفحه خطای فارسی نشان می‌دهد و متن خام خطا را نمایش نمی‌دهد', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )

    expect(screen.getByRole('heading', { name: 'مشکلی پیش آمد' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'بارگذاری دوباره' })).toBeInTheDocument()
    expect(screen.queryByText(/raw internal detail/)).not.toBeInTheDocument()
  })

  it('جزئیات خطا را فقط در دفترچه محلی ثبت می‌کند', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )

    const entry = getLogEntries().find(item => item.message === 'Unhandled UI error')
    expect(entry).toBeDefined()
    expect(entry?.context?.error).toMatchObject({ message: 'raw internal detail' })
  })
})

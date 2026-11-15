import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '@features/dashboard/DashboardPage'

vi.mock('@features/appointments/appointments.hooks', () => ({
  useAppointmentsByDay: vi.fn(),
  useCreateAppointment: vi.fn(),
  useNextAppointment: vi.fn(),
}))

vi.mock('@features/finance/finance.hooks', () => ({
  useDailyReport: vi.fn(),
}))

vi.mock('@features/customers/customers.hooks', () => ({
  useCustomer: vi.fn(),
}))

vi.mock('@features/appointments/AppointmentForm', () => ({
  AppointmentForm: () => <div>فرم نوبت</div>,
}))

import {
  useAppointmentsByDay,
  useCreateAppointment,
  useNextAppointment,
} from '@features/appointments/appointments.hooks'
import { useDailyReport } from '@features/finance/finance.hooks'
import { useCustomer } from '@features/customers/customers.hooks'

const appointment = {
  id: 'a1',
  user_id: 'u',
  customer_id: 'c1',
  title: 'کوتاهی + ریش',
  start_at: '2026-01-15T10:00:00.000Z',
  end_at: '2026-01-15T11:00:00.000Z',
  duration_minutes: 60,
  status: 'reserved',
  notes: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAppointmentsByDay).mockReturnValue({
      data: [appointment, { ...appointment, id: 'a2' }],
      isLoading: false,
    } as never)
    vi.mocked(useNextAppointment).mockReturnValue({
      data: appointment,
      isLoading: false,
    } as never)
    vi.mocked(useDailyReport).mockReturnValue({
      data: {
        date: '2026-01-15',
        visit_count: 3,
        service_count: 4,
        total_service_amount: 28_000_000,
        total_received: 10_000_000,
        total_debt: 18_000_000,
        total_expenses: 2_000_000,
        net_after_expenses: 8_000_000,
      },
      isLoading: false,
    } as never)
    vi.mocked(useCustomer).mockReturnValue({ data: { name: 'رضا' } } as never)
    vi.mocked(useCreateAppointment).mockReturnValue({
      mutateAsync: vi.fn(),
    } as never)
  })

  function renderPage() {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )
  }

  it('نوبت بعدی، نام مشتری و خلاصه امروز را نشان می‌دهد', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'خانه' })).toBeInTheDocument()
    expect(screen.getByText('نوبت بعدی')).toBeInTheDocument()
    expect(screen.getByText('کوتاهی + ریش')).toBeInTheDocument()
    expect(screen.getByText(/رضا/)).toBeInTheDocument()

    expect(screen.getByText('نوبت‌ها')).toBeInTheDocument()
    expect(screen.getByText('ویزیت‌ها')).toBeInTheDocument()
    expect(screen.getByText('دریافتی')).toBeInTheDocument()
    expect(screen.getByText('بدهی')).toBeInTheDocument()
  })

  it('اقدام‌های سریع نوبت جدید و فروش سریع را ارائه می‌دهد', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '+ نوبت جدید' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /فروش سریع/ })).toHaveAttribute(
      'href',
      '/finance/quick-sale'
    )
    expect(screen.getByRole('link', { name: /مشتری جدید/ })).toHaveAttribute('href', '/customers')
  })
})

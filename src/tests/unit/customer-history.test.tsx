import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CustomerHistory } from '@features/customers/CustomerHistory'
import { formatMoney } from '@shared/utils/currency'
import type { Appointment } from '@shared/types'
import type { VisitSummary } from '@database/repositories/visit.repository'

const base = {
  user_id: 'user-1',
  created_at: '2026-01-01T08:00:00.000Z',
  updated_at: '2026-01-01T08:00:00.000Z',
}

const UPCOMING: Appointment = {
  ...base,
  id: 'appt-upcoming',
  customer_id: 'customer-1',
  title: 'کوتاهی مو',
  start_at: '2027-01-10T09:00:00.000Z',
  duration_minutes: 60,
  end_at: '2027-01-10T10:00:00.000Z',
  status: 'confirmed',
  notes: null,
  deleted_at: null,
}

const PAST: Appointment = {
  ...base,
  id: 'appt-past',
  customer_id: 'customer-1',
  title: 'اصلاح ریش',
  start_at: '2026-01-05T09:00:00.000Z',
  duration_minutes: 30,
  end_at: '2026-01-05T09:30:00.000Z',
  status: 'completed',
  notes: null,
  deleted_at: null,
}

const VISITS: VisitSummary[] = [
  {
    ...base,
    id: 'visit-1',
    customer_id: 'customer-1',
    appointment_id: null,
    is_quick_sale: false,
    visited_at: '2026-02-10T10:00:00.000Z',
    notes: null,
    customer_name: 'علی',
    service_total: 8_000_000,
    paid_total: 8_000_000,
  },
  {
    ...base,
    id: 'visit-2',
    customer_id: 'customer-1',
    appointment_id: null,
    is_quick_sale: false,
    visited_at: '2026-01-10T10:00:00.000Z',
    notes: null,
    customer_name: 'علی',
    service_total: 15_000_000,
    paid_total: 10_000_000,
  },
]

describe('CustomerHistory', () => {
  it('نوبت‌های آینده و گذشته، مراجعات و خلاصه مالی را نمایش می‌دهد', () => {
    const onOpenAppointment = vi.fn()
    render(
      <CustomerHistory
        appointments={[UPCOMING, PAST]}
        visits={VISITS}
        currencyCode="IRR"
        onOpenAppointment={onOpenAppointment}
      />
    )

    expect(screen.getByText('نوبت‌های آینده')).toBeInTheDocument()
    expect(screen.getByText('کوتاهی مو')).toBeInTheDocument()
    expect(screen.getByText('اصلاح ریش')).toBeInTheDocument()
    expect(screen.getByText('تأیید شده')).toBeInTheDocument()
    expect(screen.getByText('انجام شده')).toBeInTheDocument()

    expect(screen.getByText(formatMoney(23_000_000, 'IRR'))).toBeInTheDocument()
    expect(screen.getByText(formatMoney(18_000_000, 'IRR'))).toBeInTheDocument()
    expect(screen.getByText(`بدهی ${formatMoney(5_000_000, 'IRR')}`)).toBeInTheDocument()
    expect(screen.getByText('تسویه‌شده')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'مشاهده نوبت کوتاهی مو' }))
    expect(onOpenAppointment).toHaveBeenCalledWith('appt-upcoming')
  })

  it('حالت‌های خالی را با متن فارسی نشان می‌دهد', () => {
    render(
      <CustomerHistory
        appointments={[]}
        visits={[]}
        currencyCode="IRR"
        onOpenAppointment={vi.fn()}
      />
    )

    expect(screen.getByText('نوبتی برای این مشتری ثبت نشده است.')).toBeInTheDocument()
    expect(
      screen.getByText('پس از ثبت اولین مراجعه، تاریخچه اینجا نمایش داده می‌شود.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('بعد از ثبت اولین مراجعه، اطلاعات مالی اینجا می‌آید.')
    ).toBeInTheDocument()
  })

  it('برچسب واحد پول انتخاب‌شده را بدون تغییر عدد نمایش می‌دهد', () => {
    render(
      <CustomerHistory
        appointments={[]}
        visits={VISITS}
        currencyCode="USD"
        onOpenAppointment={vi.fn()}
      />
    )

    expect(screen.getByText(formatMoney(23_000_000, 'USD'))).toBeInTheDocument()
    expect(screen.getByText(formatMoney(23_000_000, 'USD'))).toHaveTextContent('دلار')
  })
})

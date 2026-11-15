import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FinancePage from '@features/finance/FinancePage'

const mutationStub = () => ({ mutateAsync: vi.fn(), isError: false, error: null })

vi.mock('@features/finance/finance.hooks', () => ({
  useDailyReport: vi.fn(),
  useFinanceSummary: vi.fn(),
  useVisitSummariesByDay: vi.fn(),
  useVisitDetail: vi.fn(),
  useCreateVisit: vi.fn(),
  useAddPayment: vi.fn(),
  useExpensesByDay: vi.fn(),
  useCreateExpense: vi.fn(),
  useUpdateExpense: vi.fn(),
  useDeleteExpense: vi.fn(),
  useOpenDebts: vi.fn(),
}))

import {
  useDailyReport,
  useFinanceSummary,
  useVisitSummariesByDay,
  useVisitDetail,
  useCreateVisit,
  useAddPayment,
  useExpensesByDay,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useOpenDebts,
} from '@features/finance/finance.hooks'

const report = {
  date: '2026-01-15',
  visit_count: 1,
  service_count: 3,
  total_service_amount: 28_000_000,
  total_received: 10_000_000,
  total_debt: 18_000_000,
  total_expenses: 2_000_000,
  net_after_expenses: 8_000_000,
}

function mockAll() {
  vi.mocked(useDailyReport).mockReturnValue({ data: report, isLoading: false } as never)
  vi.mocked(useFinanceSummary).mockReturnValue({
    data: { ...report, period_start: 'a', period_end: 'b' },
    isLoading: false,
  } as never)
  vi.mocked(useVisitSummariesByDay).mockReturnValue({
    data: [
      {
        id: 'v1',
        user_id: 'u',
        customer_id: 'c1',
        appointment_id: null,
        is_quick_sale: false,
        visited_at: '2026-01-15T10:00:00.000Z',
        notes: null,
        created_at: '',
        updated_at: '',
        customer_name: 'رضا',
        service_total: 28_000_000,
        paid_total: 10_000_000,
      },
    ],
    isLoading: false,
  } as never)
  vi.mocked(useVisitDetail).mockReturnValue({ data: undefined, isLoading: true } as never)
  vi.mocked(useExpensesByDay).mockReturnValue({
    data: [
      {
        id: 'e1',
        user_id: 'u',
        title: 'اجاره صندلی',
        category: 'اجاره',
        amount: 2_000_000,
        spent_at: '2026-01-15T09:00:00.000Z',
        note: null,
        created_at: '',
        updated_at: '',
      },
    ],
    isLoading: false,
  } as never)
  vi.mocked(useOpenDebts).mockReturnValue({
    data: [{ customer_id: 'c1', customer_name: 'رضا', total_debt: 18_000_000, visit_count: 1 }],
    isLoading: false,
  } as never)
  vi.mocked(useCreateVisit).mockReturnValue(mutationStub() as never)
  vi.mocked(useAddPayment).mockReturnValue(mutationStub() as never)
  vi.mocked(useCreateExpense).mockReturnValue(mutationStub() as never)
  vi.mocked(useUpdateExpense).mockReturnValue(mutationStub() as never)
  vi.mocked(useDeleteExpense).mockReturnValue(mutationStub() as never)
}

function renderPage() {
  render(
    <MemoryRouter>
      <FinancePage />
    </MemoryRouter>
  )
}

describe('FinancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAll()
  })

  it('tab روز کارت‌های گزارش و فهرست ویزیت را نشان می‌دهد', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'مالی' })).toBeInTheDocument()
    expect(screen.getByText('خدمات')).toBeInTheDocument()
    expect(screen.getByText('دریافتی')).toBeInTheDocument()
    expect(screen.getByText('رضا')).toBeInTheDocument()
    expect(screen.getAllByText(/بدهی/).length).toBeGreaterThan(0)
  })

  it('tab خلاصه کارت‌های دوره را نشان می‌دهد', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'خلاصه' }))
    expect(screen.getByText('مبلغ خدمات')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'هفته' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ماه' })).toBeInTheDocument()
  })

  it('tab هزینه‌ها فهرست هزینه را نشان می‌دهد', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'هزینه‌ها' }))
    expect(screen.getByText('اجاره صندلی')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /حذف اجاره صندلی/ })).toBeInTheDocument()
  })

  it('tab بدهی‌ها بدهی هر مشتری را نشان می‌دهد', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'بدهی‌ها' }))
    expect(screen.getByText('رضا')).toBeInTheDocument()
    expect(screen.getByText(/ویزیت/)).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SearchPage from '@features/search/SearchPage'
import type { SearchResults } from '@features/search/search.repository'

vi.mock('@features/search/search.hooks', () => ({
  useGlobalSearch: vi.fn(),
}))

import { useGlobalSearch } from '@features/search/search.hooks'

function emptyResults(): SearchResults {
  return {
    customers: { items: [], has_more: false },
    services: { items: [], has_more: false },
    appointments: { items: [], has_more: false },
    formulas: { items: [], has_more: false },
  }
}

const RESULTS: SearchResults = {
  customers: {
    items: [{ id: 'cus-1', name: 'سارا محمدی', phone: '09121234567' }],
    has_more: false,
  },
  services: {
    items: [{ id: 'svc-1', name: 'کوتاهی مو', default_price: 500000, is_active: true }],
    has_more: false,
  },
  appointments: {
    items: [
      {
        id: 'apt-1',
        title: 'رنگ و مش',
        start_at: '2026-02-01T10:00:00.000Z',
        status: 'reserved',
        customer_name: 'سارا محمدی',
      },
    ],
    has_more: false,
  },
  formulas: {
    items: [
      {
        id: 'f-1',
        title: 'بلوند دکولوره',
        brand: 'وللا',
        color_code: '10.1',
        customer_name: 'سارا محمدی',
      },
    ],
    has_more: false,
  },
}

function mockQuery(overrides: Record<string, unknown> = {}) {
  vi.mocked(useGlobalSearch).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as never)
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

function renderPage() {
  render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  )
}

describe('SearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery()
  })

  it('پیش از ورود عبارت، راهنما نشان می‌دهد', () => {
    renderPage()
    expect(screen.getByText('چه چیزی را جست‌وجو می‌کنید؟')).toBeInTheDocument()
    expect(screen.queryByText('نتیجه‌ای پیدا نشد')).not.toBeInTheDocument()
  })

  it('نتایج را گروه‌بندی‌شده نشان می‌دهد', async () => {
    mockQuery({ data: RESULTS })
    renderPage()

    typeQuery('سارا')

    expect(await screen.findByRole('heading', { name: /مشتریان/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /خدمات/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /نوبت‌ها/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /فرمول‌های رنگ/ })).toBeInTheDocument()

    expect(screen.getByText('09121234567')).toBeInTheDocument()
    expect(screen.getByText('کوتاهی مو')).toBeInTheDocument()
    expect(screen.getByText('وللا')).toBeInTheDocument()
    expect(screen.getByText('رزرو شده')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'مشتری سارا محمدی' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'نوبت رنگ و مش' })).toBeInTheDocument()
  })

  it('حالت بارگذاری و خالی را نشان می‌دهد', async () => {
    mockQuery({ isLoading: true })
    renderPage()
    typeQuery('سارا')
    expect(await screen.findByRole('status', { name: 'در حال جست‌وجو…' })).toBeInTheDocument()
  })

  it('وقتی نتیجه‌ای نیست پیام فارسی نشان می‌دهد', async () => {
    mockQuery({ data: emptyResults() })
    renderPage()

    typeQuery('ناموجود')
    expect(await screen.findByText('نتیجه‌ای پیدا نشد')).toBeInTheDocument()
  })

  it('گروه‌های بزرگ‌تر را با «نمایش همه» باز می‌کند', async () => {
    const manyCustomers = Array.from({ length: 6 }, (_, index) => ({
      id: `cus-${index + 1}`,
      name: `مشتری ${index + 1}`,
      phone: null,
    }))
    mockQuery({
      data: {
        ...emptyResults(),
        customers: { items: manyCustomers, has_more: false },
      },
    })
    renderPage()

    typeQuery('مشتری')
    expect(await screen.findByRole('button', { name: 'مشتری مشتری 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'مشتری مشتری 6' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'نمایش همه' }))
    expect(screen.getByRole('button', { name: 'مشتری مشتری 6' })).toBeInTheDocument()
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildDailyReport,
  buildFinancialSummary,
  calcDebt,
  calcExpenses,
  calcNet,
  calcReceived,
  calcServiceAmount,
  dayRange,
  monthRange,
  weekRange,
  type VisitWithServices,
} from '@features/finance/finance.calculator'
import type { Expense, Payment, VisitService } from '@shared/types'

const ENTITY = {
  user_id: 'user-1',
  created_at: '2026-11-12T00:00:00.000Z',
  updated_at: '2026-11-12T00:00:00.000Z',
}

function service(id: string, lineTotal: number): VisitService {
  return {
    ...ENTITY,
    id,
    visit_id: 'visit-1',
    service_id: null,
    service_name_snapshot: 'کوتاهی',
    quantity: 1,
    unit_price: lineTotal,
    discount_amount: 0,
    line_total: lineTotal,
    duration_minutes: null,
  }
}

function payment(id: string, amount: number, visitId = 'visit-1'): Payment {
  return {
    ...ENTITY,
    id,
    visit_id: visitId,
    amount,
    method: 'cash',
    paid_at: '2026-11-12T09:00:00.000Z',
    note: null,
  }
}

function expense(id: string, amount: number): Expense {
  return {
    ...ENTITY,
    id,
    title: 'خرید',
    category: null,
    amount,
    spent_at: '2026-11-12T10:00:00.000Z',
    note: null,
  }
}

describe('calcServiceAmount', () => {
  it('sums line totals (stored Toman ×100)', () => {
    expect(calcServiceAmount([])).toBe(0)
    expect(calcServiceAmount([service('s1', 150000), service('s2', 250000)])).toBe(400000)
  })
})

describe('calcReceived', () => {
  it('sums payments in the period', () => {
    expect(calcReceived([payment('p1', 100000), payment('p2', 50000)])).toBe(150000)
  })
})

describe('calcDebt', () => {
  it('counts only positive per-visit balances', () => {
    const visits: VisitWithServices[] = [
      {
        visitId: 'visit-1',
        visitedAt: '2026-11-12T09:00:00.000Z',
        services: [service('s1', 1000000)],
        payments: [payment('p1', 400000)],
      },
      {
        visitId: 'visit-2',
        visitedAt: '2026-11-12T11:00:00.000Z',
        services: [service('s2', 500000)],
        payments: [payment('p2', 700000, 'visit-2')],
      },
    ]

    // 600,000 owed on visit-1; the over-paid visit-2 contributes nothing.
    expect(calcDebt(visits)).toBe(600000)
  })

  it('is zero for a fully paid visit', () => {
    const visits: VisitWithServices[] = [
      {
        visitId: 'visit-1',
        visitedAt: '2026-11-12T09:00:00.000Z',
        services: [service('s1', 300000)],
        payments: [payment('p1', 300000)],
      },
    ]
    expect(calcDebt(visits)).toBe(0)
  })
})

describe('calcExpenses and calcNet', () => {
  it('sums expenses', () => {
    expect(calcExpenses([expense('e1', 200000), expense('e2', 300000)])).toBe(500000)
  })

  it('net is received minus expenses (cash based)', () => {
    expect(calcNet(1000000, 250000)).toBe(750000)
    expect(calcNet(100000, 250000)).toBe(-150000)
  })
})

describe('buildDailyReport', () => {
  it('assembles all totals for the day', () => {
    const visitsWithServices: VisitWithServices[] = [
      {
        visitId: 'visit-1',
        visitedAt: '2026-11-12T09:00:00.000Z',
        services: [service('s1', 400000), service('s2', 200000)],
        payments: [payment('p1', 300000)],
      },
    ]

    const report = buildDailyReport(
      '2026-11-12',
      [service('s1', 400000), service('s2', 200000)],
      [payment('p1', 300000)],
      visitsWithServices,
      [expense('e1', 100000)]
    )

    expect(report).toEqual({
      date: '2026-11-12',
      visit_count: 1,
      service_count: 2,
      total_service_amount: 600000,
      total_received: 300000,
      total_debt: 300000,
      total_expenses: 100000,
      net_after_expenses: 200000,
    })
  })
})

describe('buildFinancialSummary', () => {
  it('uses the supplied period bounds and totals', () => {
    const summary = buildFinancialSummary(
      '2026-11-01T00:00:00.000Z',
      '2026-12-01T00:00:00.000Z',
      [service('s1', 1000000)],
      [payment('p1', 900000)],
      [
        {
          visitId: 'visit-1',
          visitedAt: '2026-11-12T09:00:00.000Z',
          services: [service('s1', 1000000)],
          payments: [payment('p1', 900000)],
        },
      ],
      [expense('e1', 150000)]
    )

    expect(summary).toEqual({
      period_start: '2026-11-01T00:00:00.000Z',
      period_end: '2026-12-01T00:00:00.000Z',
      total_service_amount: 1000000,
      total_received: 900000,
      total_debt: 100000,
      total_expenses: 150000,
      net_after_expenses: 750000,
    })
  })
})

describe('period helpers', () => {
  it('dayRange uses local midnight boundaries', () => {
    expect(dayRange('2026-11-12', 'Asia/Tehran')).toEqual({
      start: '2026-11-11T20:30:00.000Z',
      end: '2026-11-12T20:30:00.000Z',
    })
  })

  it('weekRange spans exactly 7 local days', () => {
    const { start, end } = weekRange('2026-11-14', 'Asia/Tehran')
    expect(start).toBe('2026-11-13T20:30:00.000Z')
    expect(Date.parse(end) - Date.parse(start)).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('monthRange spans exactly one local month', () => {
    const { start, end } = monthRange('2026-11', 'Asia/Tehran')
    expect(start).toBe('2026-10-31T20:30:00.000Z')
    expect(end).toBe('2026-11-30T20:30:00.000Z')
  })
})

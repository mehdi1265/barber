import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  addLocalDays,
  localDateISO,
  localDayRange,
  localJalaliMonthRange,
  localMonthRange,
  localTodayISO,
  localWeekRange,
} from '@shared/utils/datetime'
import { applyTimeToDate, todayISO } from '@shared/utils/jalali'

const TEHRAN = 'Asia/Tehran'
const NEW_YORK = 'America/New_York'

describe('localDateISO', () => {
  it('uses the local calendar day, not the UTC day', () => {
    // 21:00Z on the 11th is 00:30 on the 12th in Tehran (UTC+03:30).
    expect(localDateISO('2026-11-11T21:00:00.000Z', TEHRAN)).toBe('2026-11-12')
    expect(localDateISO('2026-11-11T20:29:59.999Z', TEHRAN)).toBe('2026-11-11')
    expect(localDateISO('2026-11-12T20:29:59.999Z', TEHRAN)).toBe('2026-11-12')
    expect(localDateISO('2026-11-12T20:30:00.000Z', TEHRAN)).toBe('2026-11-13')
  })

  it('handles a negative-offset zone', () => {
    // 2026-01-15T02:00Z is still 21:00 on the 14th in New York.
    expect(localDateISO('2026-01-15T02:00:00.000Z', NEW_YORK)).toBe('2026-01-14')
  })
})

describe('localDayRange', () => {
  it('covers exactly one Tehran day (00:00 and 23:59)', () => {
    const { start, end } = localDayRange('2026-11-12', TEHRAN)
    expect(start).toBe('2026-11-11T20:30:00.000Z')
    expect(end).toBe('2026-11-12T20:30:00.000Z')

    const noon = Date.parse('2026-11-12T08:30:00.000Z') // 12:00 local
    expect(noon).toBeGreaterThanOrEqual(Date.parse(start))
    expect(noon).toBeLessThan(Date.parse(end))

    const lastMinute = Date.parse('2026-11-12T20:29:00.000Z') // 23:59 local
    expect(localDateISO(new Date(lastMinute), TEHRAN)).toBe('2026-11-12')
    expect(lastMinute).toBeLessThan(Date.parse(end))

    const nextMidnight = Date.parse('2026-11-12T20:30:00.000Z')
    expect(nextMidnight).toBe(Date.parse(end))
    expect(localDateISO(new Date(nextMidnight), TEHRAN)).toBe('2026-11-13')
  })

  it('is 23 hours long on a spring-forward day', () => {
    const { start, end } = localDayRange('2026-03-08', NEW_YORK)
    expect(start).toBe('2026-03-08T05:00:00.000Z')
    expect(end).toBe('2026-03-09T04:00:00.000Z')
    expect(Date.parse(end) - Date.parse(start)).toBe(23 * 60 * 60 * 1000)
  })

  it('is 25 hours long on a fall-back day', () => {
    const { start, end } = localDayRange('2026-11-01', NEW_YORK)
    expect(Date.parse(end) - Date.parse(start)).toBe(25 * 60 * 60 * 1000)
  })

  it('keeps every instant of the local day inside the range', () => {
    for (const instant of [
      '2026-11-12T04:30:00.000Z', // 08:00
      '2026-11-12T08:30:00.000Z', // 12:00
      '2026-11-12T20:29:59.999Z', // 23:59:59.999
    ]) {
      const { start, end } = localDayRange(localDateISO(instant, TEHRAN), TEHRAN)
      expect(Date.parse(instant)).toBeGreaterThanOrEqual(Date.parse(start))
      expect(Date.parse(instant)).toBeLessThan(Date.parse(end))
    }
  })
})

describe('localWeekRange', () => {
  it('covers exactly 7 local days from Saturday', () => {
    // 2026-11-14 is a Saturday in the Iranian week.
    const { start, end } = localWeekRange('2026-11-14', TEHRAN)
    expect(start).toBe('2026-11-13T20:30:00.000Z')
    expect(end).toBe('2026-11-20T20:30:00.000Z')
    expect(Date.parse(end) - Date.parse(start)).toBe(7 * 24 * 60 * 60 * 1000)
    expect(localDateISO(start, TEHRAN)).toBe('2026-11-14')
    expect(localDateISO(new Date(Date.parse(end) - 1), TEHRAN)).toBe('2026-11-20')
  })
})

describe('localMonthRange', () => {
  it('covers a Gregorian month in local time', () => {
    const { start, end } = localMonthRange('2026-11', TEHRAN)
    expect(start).toBe('2026-10-31T20:30:00.000Z')
    expect(end).toBe('2026-11-30T20:30:00.000Z')
  })

  it('rolls over December to the next year', () => {
    const { start, end } = localMonthRange('2026-12', TEHRAN)
    expect(start).toBe('2026-11-30T20:30:00.000Z')
    expect(end).toBe('2026-12-31T20:30:00.000Z')
  })

  it('covers a Jalali month (Aban 1405, 30 days)', () => {
    const { start, end } = localJalaliMonthRange('1405-08', TEHRAN)
    expect(localDateISO(start, TEHRAN)).toBe('2026-10-23')
    expect(localDateISO(new Date(Date.parse(end) - 1), TEHRAN)).toBe('2026-11-21')
    expect(Date.parse(end) - Date.parse(start)).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('addLocalDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addLocalDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('respects leap days', () => {
    expect(addLocalDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addLocalDays('2027-02-28', 1)).toBe('2027-03-01')
  })
})

describe('applyTimeToDate', () => {
  it('stores 09:00 local as the correct UTC instant', () => {
    expect(applyTimeToDate('2026-11-12', '09:00', TEHRAN)).toBe('2026-11-12T05:30:00.000Z')
  })

  it('keeps the calendared day in a negative-offset zone', () => {
    const iso = applyTimeToDate('2026-01-15', '09:00', NEW_YORK)
    expect(iso).toBe('2026-01-15T14:00:00.000Z')
    expect(localDateISO(iso, NEW_YORK)).toBe('2026-01-15')
    expect(localDateISO(iso, NEW_YORK)).not.toBe('2026-01-14')
  })

  it('round-trips an evening time', () => {
    const iso = applyTimeToDate('2026-11-12', '23:59', TEHRAN)
    expect(iso).toBe('2026-11-12T20:29:00.000Z')
    expect(localDateISO(iso, TEHRAN)).toBe('2026-11-12')
  })
})

describe('device-local "today" (TZ=Asia/Tehran)', () => {
  const originalTZ = process.env.TZ

  beforeAll(() => {
    process.env.TZ = TEHRAN
    vi.useFakeTimers()
    // 00:30 on 2026-11-12 in Tehran.
    vi.setSystemTime(new Date('2026-11-11T21:00:00.000Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  it('reports the local day at 00:30, not the previous UTC day', () => {
    expect(todayISO()).toBe('2026-11-12')
    expect(localTodayISO()).toBe('2026-11-12')
  })

  it('builds the agenda range around that local day', () => {
    const { start, end } = localDayRange(todayISO())
    expect(start).toBe('2026-11-11T20:30:00.000Z')
    expect(end).toBe('2026-11-12T20:30:00.000Z')
  })
})

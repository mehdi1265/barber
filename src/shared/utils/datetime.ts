/**
 * Local-day arithmetic.
 *
 * Storage is always UTC ISO-8601. Reports, agendas and "today" are defined by
 * the user's local calendar day, so every day/week/month boundary must be
 * derived from a time zone instead of string concatenation with `T00:00:00Z`.
 *
 * Time zone source: the device's local zone (`Intl` resolvedOptions). Every
 * function accepts an optional IANA `timeZone` so tests and future profile
 * overrides can pin a zone explicitly. Previously persisted timestamps need no
 * migration — they are already UTC instants.
 */

import { newDate as newJalaliDate } from 'date-fns-jalali'

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export interface DateRange {
  /** Inclusive UTC instant. */
  start: string
  /** Exclusive UTC instant (i.e. the next local midnight). */
  end: string
}

export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isDateISO(value: string): boolean {
  return DATE_ISO_RE.test(value)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatterCache.set(timeZone, formatter)
  return formatter
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find(p => p.type === type)
    return part ? Number(part.value) : 0
  }
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 * Positive east of Greenwich (e.g. +03:30 for Asia/Tehran).
 */
function zoneOffsetMs(timeZone: string, date: Date): number {
  const p = zonedParts(date, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - Math.floor(date.getTime() / 1000) * 1000
}

/** Converts a wall-clock date/time in `timeZone` to the matching UTC instant. */
export function zonedDateTimeToUTC(
  dateISO: string,
  timeHHMM: string,
  timeZone = getLocalTimeZone()
): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hour, minute] = timeHHMM.split(':').map(Number)
  const wallClockUTC = Date.UTC(year, month - 1, day, hour, minute, 0)

  const firstOffset = zoneOffsetMs(timeZone, new Date(wallClockUTC))
  let instant = wallClockUTC - firstOffset
  // A DST transition between the guess and the real instant changes the
  // offset; one refinement resolves it.
  const secondOffset = zoneOffsetMs(timeZone, new Date(instant))
  if (secondOffset !== firstOffset) instant = wallClockUTC - secondOffset
  return new Date(instant)
}

/** `YYYY-MM-DD` of the calendar day `date` falls on inside `timeZone`. */
export function localDateISO(
  date: Date | string = new Date(),
  timeZone = getLocalTimeZone()
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const p = zonedParts(d, timeZone)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/** Local wall-clock date + time → UTC ISO instant. */
export function localDateTimeToISO(
  dateISO: string,
  timeHHMM: string,
  timeZone = getLocalTimeZone()
): string {
  return zonedDateTimeToUTC(dateISO, timeHHMM, timeZone).toISOString()
}

/** Adds whole calendar days to a `YYYY-MM-DD` string without touching UTC. */
export function addLocalDays(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day))
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/** Local midnight of a `YYYY-MM-DD` string, as a Date in the process zone. */
export function parseLocalDate(dateISO: string): Date {
  const [year, month, day] = dateISO.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** UTC instants bounding one local calendar day; `end` is exclusive. */
export function localDayRange(dateISO: string, timeZone = getLocalTimeZone()): DateRange {
  const start = zonedDateTimeToUTC(dateISO, '00:00', timeZone)
  const nextMidnight = zonedDateTimeToUTC(addLocalDays(dateISO, 1), '00:00', timeZone)
  return { start: start.toISOString(), end: nextMidnight.toISOString() }
}

/** UTC instants bounding 7 local days starting at `weekStartISO`; end exclusive. */
export function localWeekRange(weekStartISO: string, timeZone = getLocalTimeZone()): DateRange {
  const start = zonedDateTimeToUTC(weekStartISO, '00:00', timeZone)
  const weekEnd = zonedDateTimeToUTC(addLocalDays(weekStartISO, 7), '00:00', timeZone)
  return { start: start.toISOString(), end: weekEnd.toISOString() }
}

/** UTC instants bounding a Gregorian month (`YYYY-MM`); end exclusive. */
export function localMonthRange(yearMonth: string, timeZone = getLocalTimeZone()): DateRange {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstISO = `${year}-${pad2(month)}-01`
  const nextISO = month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`
  const start = zonedDateTimeToUTC(firstISO, '00:00', timeZone)
  const end = zonedDateTimeToUTC(nextISO, '00:00', timeZone)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * UTC instants bounding a Jalali month (`YYYY-MM`, e.g. `1403-08`).
 * The Jalali date is converted to its Gregorian calendar date first, then the
 * same local-midnight rules apply.
 */
export function localJalaliMonthRange(
  jalaliYearMonth: string,
  timeZone = getLocalTimeZone()
): DateRange {
  const [year, month] = jalaliYearMonth.split('-').map(Number)
  const start = newJalaliDate(year, month - 1, 1)
  const end = newJalaliDate(year, month, 1)
  return localDayRangeRange(start, end, timeZone)
}

function localDayRangeRange(start: Date, end: Date, timeZone: string): DateRange {
  const startISO = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`
  const endISO = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`
  return {
    start: zonedDateTimeToUTC(startISO, '00:00', timeZone).toISOString(),
    end: zonedDateTimeToUTC(endISO, '00:00', timeZone).toISOString(),
  }
}

/** True when both instants fall on the same local calendar day. */
export function isSameLocalDay(
  a: Date | string,
  b: Date | string,
  timeZone = getLocalTimeZone()
): boolean {
  return localDateISO(a, timeZone) === localDateISO(b, timeZone)
}

/** `YYYY-MM-DD` of the current local day. */
export function localTodayISO(timeZone = getLocalTimeZone()): string {
  return localDateISO(new Date(), timeZone)
}

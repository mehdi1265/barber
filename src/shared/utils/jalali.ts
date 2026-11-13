/**
 * Jalali (Shamsi) date utilities built on date-fns-jalali.
 *
 * All functions accept/return JavaScript Date or ISO-8601 strings.
 * The database always stores dates in ISO-8601 (Gregorian) — Jalali
 * is only used for display.
 */

import { format as jalaliFormat, startOfWeek, addDays, parseISO } from 'date-fns-jalali'
import {
  getLocalTimeZone,
  isDateISO,
  isSameLocalDay,
  localDateISO,
  localDateTimeToISO,
  parseLocalDate,
} from './datetime'

function parseDateInput(value: string): Date {
  return isDateISO(value) ? parseLocalDate(value) : new Date(value)
}

/** Format a date as Jalali — e.g. "۱۴۰۳/۰۸/۱۵" */
export function formatJalaliDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return jalaliFormat(d, 'yyyy/MM/dd')
}

/** Format a date as Jalali day name + date — e.g. "دوشنبه ۱۵ آبان" */
export function formatJalaliDateFull(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return jalaliFormat(d, 'EEEE d MMMM')
}

/** Format just the Jalali day number */
export function formatJalaliDay(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return jalaliFormat(d, 'd')
}

/** Format Jalali month name + year — e.g. "آبان ۱۴۰۳" */
export function formatJalaliMonthYear(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return jalaliFormat(d, 'MMMM yyyy')
}

/** Format time as HH:mm — e.g. "14:30" (always latin digits) */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Format appointment time range — e.g. "۱۴:۳۰ — ۱۵:۳۰" */
export function formatTimeRange(startAt: string, endAt: string): string {
  return `${formatTime(startAt)} — ${formatTime(endAt)}`
}

/** Returns "YYYY-MM-DD" of the current local calendar day */
export function todayISO(): string {
  return localDateISO()
}

/** Returns the Saturday starting the week containing the given date (Iranian week) */
export function getWeekStart(date: Date | string): Date {
  const d = typeof date === 'string' ? parseDateInput(date) : date
  return startOfWeek(d, { weekStartsOn: 6 })
}

/** Returns 7 days starting from weekStart */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** True if two dates fall on the same local calendar day */
export function isSameDayUtil(a: Date | string, b: Date | string): boolean {
  const da = typeof a === 'string' ? parseDateInput(a) : a
  const db = typeof b === 'string' ? parseDateInput(b) : b
  return isSameLocalDay(da, db)
}

/** Jalali short day names (Saturday first, Iranian week) */
export const JALALI_WEEKDAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** Jalali weekday name for a given Date */
export function jalaliWeekdayShort(date: Date): string {
  const day = date.getDay() // 0=Sunday
  // Map JS day (Sun=0…Sat=6) to Iranian week (Sat=0…Fri=6)
  const iranDay = (day + 1) % 7
  return JALALI_WEEKDAY_SHORT[iranDay]
}

/** Format Jalali date for display in day column headers — e.g. "ش ۱۵" */
export function formatWeekDayHeader(date: Date): string {
  return `${jalaliWeekdayShort(date)} ${formatJalaliDay(date)}`
}

/**
 * Apply a local time to a local `YYYY-MM-DD` date, returning a UTC ISO string.
 * The date is built from explicit year/month/day, never by parsing a UTC
 * string, so negative-offset zones keep the intended calendar day.
 */
export function applyTimeToDate(
  baseDateISO: string,
  timeHHMM: string,
  timeZone = getLocalTimeZone()
): string {
  return localDateTimeToISO(baseDateISO.slice(0, 10), timeHHMM, timeZone)
}

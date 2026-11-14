/**
 * Shared utility functions used across the entire application.
 */

import { localDateISO } from './datetime'

// ── UUID ──────────────────────────────────────────────────────────────────────

/**
 * Generates a RFC-4122 v4 UUID.
 * Uses crypto.randomUUID when available (Node 19+, modern browsers),
 * falls back to a manual implementation for older environments.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ── Timestamps ───────────────────────────────────────────────────────────────

/** Returns the current time as an ISO-8601 string */
export function nowISO(): string {
  return new Date().toISOString()
}

/** Parses an ISO-8601 string to a Date */
export function parseISO(value: string): Date {
  return new Date(value)
}

/** Formats a Date (or ISO string) as the local calendar-day YYYY-MM-DD */
export function toDateString(value: Date | string): string {
  return localDateISO(value)
}

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * Monetary values are stored as integers (Toman × 100).
 * Display functions convert back to human-readable form.
 */

/** Convert Toman integer (×100) to display string with thousands separator */
export function formatToman(amountCents: number): string {
  const toman = Math.round(amountCents / 100)
  return new Intl.NumberFormat('fa-IR').format(toman) + ' تومان'
}

/** Convert raw Toman (no ×100) to storage integer */
export function tomanToStorage(toman: number): number {
  return Math.round(toman * 100)
}

/** Convert storage integer to Toman for display inputs */
export function storageToToman(cents: number): number {
  return Math.floor(cents / 100)
}

// ── Appointment time ──────────────────────────────────────────────────────────

/**
 * Calculates end time from start time and duration.
 * @param startAt - ISO-8601 string
 * @param durationMinutes - positive integer
 * @returns ISO-8601 string
 */
export function calcEndAt(startAt: string, durationMinutes: number): string {
  const start = new Date(startAt)
  start.setMinutes(start.getMinutes() + durationMinutes)
  return start.toISOString()
}

/**
 * Returns true if two appointment time ranges overlap.
 * Uses half-open intervals [start, end).
 * Does NOT count touching endpoints as overlapping.
 */
export function appointmentsOverlap(
  a: { start_at: string; end_at: string },
  b: { start_at: string; end_at: string }
): boolean {
  const aStart = new Date(a.start_at).getTime()
  const aEnd = new Date(a.end_at).getTime()
  const bStart = new Date(b.start_at).getTime()
  const bEnd = new Date(b.end_at).getTime()
  return aStart < bEnd && bStart < aEnd
}

// ── String helpers ────────────────────────────────────────────────────────────

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

/** Normalize Persian/Arabic digits to Latin for comparison */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
}

/** Simple search: checks if needle exists (case-insensitive) in haystack */
export function matchesSearch(haystack: string, needle: string): boolean {
  return normalizeDigits(haystack).toLowerCase().includes(normalizeDigits(needle).toLowerCase())
}

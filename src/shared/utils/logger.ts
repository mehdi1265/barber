/**
 * Small structured logger with a bounded in-memory ring buffer.
 *
 * The buffer is for local diagnostics only: nothing is uploaded, and the UI
 * never renders raw error messages or stacks. Sensitive context keys are
 * redacted before they enter the buffer.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  time: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
}

const MAX_ENTRIES = 200
const SENSITIVE_KEY = /token|password|secret|authorization|apikey|api_key/i

let entries: LogEntry[] = []
let sequence = 0

function sanitize(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value
  }
  return safe
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    id: ++sequence,
    time: new Date().toISOString(),
    level,
    message,
    context: sanitize(context),
  }

  entries.push(entry)
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES)
  }

  console[level](`[${level}] ${message}`, entry.context ?? '')
  return entry
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
}

/** Converts an unknown thrown value into log-safe details. */
export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null }
  }
  return { message: String(error) }
}

/** Newest-last snapshot of the ring buffer. */
export function getLogEntries(): readonly LogEntry[] {
  return entries
}

export function clearLogEntries(): void {
  entries = []
}

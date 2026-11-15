/**
 * Persian messages for failed local writes.
 *
 * Repository errors are SQLite/plugin errors and are never shown as-is: the
 * user gets a short explanation, the raw text only reaches the log.
 */

export const DB_UNAVAILABLE_MESSAGE =
  'پایگاه داده محلی در دسترس نیست. برنامه را ببندید و دوباره باز کنید.'

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase()
  if (typeof error === 'string') return error.toLowerCase()
  return ''
}

/** A local-database failure will not heal on an automatic retry. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const lower = errorText(error)
  return lower.includes('timeout') || lower.includes('database') || lower.includes('not available')
}

export function userMessageFor(error: unknown, fallback: string): string {
  const lower = errorText(error)

  if (lower.includes('nested transactions')) {
    return 'عملیات قبلی هنوز در حال انجام است؛ چند لحظه بعد دوباره تلاش کنید.'
  }
  if (lower.includes('requires user_id') || lower.includes('jwt') || lower.includes('session')) {
    return 'نشست شما معتبر نیست. دوباره وارد شوید.'
  }
  if (lower.includes('unique constraint')) {
    return 'این مورد قبلاً ثبت شده است.'
  }
  if (lower.includes('foreign key')) {
    return 'این مورد به داده‌های دیگری وابسته است و ذخیره نشد.'
  }
  if (lower.includes('timeout') || lower.includes('database') || lower.includes('not available')) {
    return DB_UNAVAILABLE_MESSAGE
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.'
  }
  return fallback
}

/**
 * Display-currency helpers.
 *
 * Stored amounts are always integer Toman × 100; `currency_code` only changes
 * the label shown next to a number. No exchange-rate conversion is performed.
 */

export const CURRENCY_OPTIONS = [
  { code: 'IRR', label: 'تومان' },
  { code: 'AFN', label: 'افغانی' },
  { code: 'USD', label: 'دلار' },
] as const

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]['code']

export function currencyLabel(code: string): string {
  return CURRENCY_OPTIONS.find(option => option.code === code)?.label ?? code
}

/** Formats a stored Toman × 100 amount with the selected currency label. */
export function formatMoney(amountCents: number, currencyCode = 'IRR'): string {
  const amount = Math.round(amountCents / 100)
  return `${new Intl.NumberFormat('fa-IR').format(amount)} ${currencyLabel(currencyCode)}`
}

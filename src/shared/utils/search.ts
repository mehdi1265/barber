/**
 * Helpers for cross-entity search.
 *
 * Persian (۰-۹) and Arabic-Indic (٠-٩) digits are normalised to Latin on both
 * sides of the comparison, so a query typed with one keyboard finds a value
 * stored with another.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Converts Persian/Arabic digits to Latin and trims surrounding whitespace. */
export function normalizeSearchTerm(value: string): string {
  return value
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .trim()
}

/** Escapes LIKE wildcards so `%`, `_`, and `\` are matched literally. */
export function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

/** Builds a `%term%` pattern ready for `LIKE ? ESCAPE '\'`. */
export function buildLikePattern(value: string): string {
  return `%${escapeLikeTerm(normalizeSearchTerm(value))}%`
}

/**
 * Wraps a SQL column in nested `REPLACE` calls that map both Persian and
 * Arabic digits to Latin. Use for the column side of a LIKE comparison.
 */
export function sqlNormalizeDigits(expression: string): string {
  let sql = `COALESCE(${expression}, '')`
  for (const [index, digit] of [...PERSIAN_DIGITS].entries()) {
    sql = `REPLACE(${sql}, '${digit}', '${index}')`
  }
  for (const [index, digit] of [...ARABIC_DIGITS].entries()) {
    sql = `REPLACE(${sql}, '${digit}', '${index}')`
  }
  return sql
}

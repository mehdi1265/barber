/**
 * Supabase project base URL built from a hand-written environment value.
 *
 * A value copied from the dashboard often carries the REST prefix
 * (`/rest/v1`) or a trailing slash, and `createClient` rejects both shapes.
 * Normalising here matters because this module is evaluated at import time:
 * throwing would abort the whole import graph, React would never mount, and the
 * installed app would show a blank white screen instead of an error.
 */
export function normalizeProjectUrl(raw: string | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '')
    .replace(/\/+$/, '')
}

/**
 * Lazy Supabase adapter for the sync engine.
 *
 * The adapter is loaded with a dynamic `import` so the rest of the engine
 * (and its tests) can run without Supabase environment variables. The
 * PostgREST builder is described structurally here because the generated
 * `Database` type only covers a subset of the server tables.
 */

import type { RemoteRow, SelectOptions, SyncClient, SyncTable } from './sync.types'
import { RemoteError } from './sync.types'

interface PostgrestErrorLike {
  message: string
  code?: string | null
  status?: number | null
}

interface SupabaseResult {
  data?: unknown
  error: PostgrestErrorLike | null
}

interface SupabaseQuery extends PromiseLike<SupabaseResult> {
  select(columns: string): SupabaseQuery
  upsert(rows: unknown, options: { onConflict: string }): SupabaseQuery
  delete(): SupabaseQuery
  in(column: string, values: readonly string[]): SupabaseQuery
  gt(column: string, value: string): SupabaseQuery
  order(column: string, options: { ascending: boolean }): SupabaseQuery
  range(from: number, to: number): SupabaseQuery
}

/** PostgREST reports most failures in `code` rather than an HTTP status. */
function statusFromCode(code: string | null | undefined): number | null {
  switch (code) {
    case 'PGRST301':
      return 401 // JWT expired
    case 'PGRST116':
      return 404
    case '42501':
      return 403
    case '23505':
      return 409 // unique violation
    case '23503':
      return 409 // foreign key violation
    case '23502':
      return 400 // not-null violation
    case '22P02':
      return 400 // invalid input syntax
    default:
      return null
  }
}

function toRemoteError(error: PostgrestErrorLike): RemoteError {
  const status =
    typeof error.status === 'number' && error.status > 0 ? error.status : statusFromCode(error.code)
  return new RemoteError(error.message, status)
}

/** Storage errors carry a string status code; 404/403 are terminal. */
function storageRemoteError(error: {
  message: string
  statusCode?: string | number | null
}): RemoteError {
  const raw = error.statusCode
  const status = typeof raw === 'string' ? Number(raw) : raw
  return new RemoteError(
    error.message,
    typeof status === 'number' && Number.isFinite(status) ? status : null
  )
}

export async function createSupabaseSyncClient(): Promise<SyncClient> {
  const { supabase } = await import('@services/supabase/client')

  const query = (table: SyncTable): SupabaseQuery =>
    supabase.from(table as never) as unknown as SupabaseQuery

  const run = async (builder: SupabaseQuery): Promise<SupabaseResult> => {
    try {
      const result = await builder
      if (result.error) throw toRemoteError(result.error)
      return result
    } catch (err) {
      if (err instanceof RemoteError) throw err
      // fetch failed / network error: no status, retryable
      throw new RemoteError(err instanceof Error ? err.message : String(err), null)
    }
  }

  return {
    async upsert(table, rows) {
      await run(query(table).upsert(rows, { onConflict: 'id' }))
    },

    async deleteByIds(table, ids) {
      if (ids.length === 0) return
      await run(query(table).delete().in('id', ids))
    },

    async select(table, options: SelectOptions) {
      let builder = query(table).select('*')
      if (options.since) builder = builder.gt('updated_at', options.since)
      builder = builder
        .order('updated_at', { ascending: true })
        .range(options.offset, options.offset + options.limit - 1)

      const { data } = await run(builder)
      return Array.isArray(data) ? (data as RemoteRow[]) : []
    },

    async uploadPhoto(upload) {
      // Loaded lazily: Camera/Filesystem plugins are only needed for photos.
      const { readPhotoBytes, storagePathFor, photoContentType } = await import(
        '@features/photos/photo-storage'
      )
      const bytes = await readPhotoBytes(upload.localPath)
      if (!bytes) throw new RemoteError('فایل عکس روی دستگاه پیدا نشد', 404)

      const path = storagePathFor(
        upload.userId,
        upload.customerId,
        upload.photoId,
        upload.localPath
      )
      const { error } = await supabase.storage
        .from('customer-photos')
        .upload(path, bytes, { contentType: photoContentType(upload.localPath), upsert: true })
      if (error) throw storageRemoteError(error)
      return path
    },

    async deletePhoto(storagePath) {
      const { error } = await supabase.storage.from('customer-photos').remove([storagePath])
      if (error) throw storageRemoteError(error)
    },
  }
}

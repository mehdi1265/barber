/**
 * Push worker: replays queued local operations to the cloud.
 *
 * Each outbox row is one physical database row, so retries can never duplicate
 * a payment or a child line: the server upserts by `id`. A run stops
 * immediately on a 401 (the session must be refreshed) and marks permanent
 * 4xx failures as terminal instead of retrying forever.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { SyncOutbox } from '@shared/types'
import { setPhotoStoragePath } from '@database/repositories/customer-photo.repository'
import {
  getRetryableOutbox,
  markOutboxDone,
  markOutboxFailed,
  markOutboxPending,
  markOutboxProcessing,
  markOutboxTerminal,
  resetStaleProcessing,
} from '@sync/outbox/outbox.repository'
import { buildPushEntity, type PushEntity } from './payload'
import { RemoteError, type PushResult, type SyncClient } from './sync.types'

export const MAX_ATTEMPTS = 5
export const BASE_BACKOFF_MS = 30_000
export const MAX_BACKOFF_MS = 30 * 60_000
export const PUSH_BATCH_SIZE = 50

/** Exponential backoff after `attempts` failed pushes (30s, 1m, 2m, 4m…). */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1))
}

function isDue(row: SyncOutbox, now: Date): boolean {
  if (row.attempt_count <= 0) return true
  if (!row.last_attempt_at) return true
  const last = Date.parse(row.last_attempt_at)
  if (Number.isNaN(last)) return true
  return now.getTime() >= last + backoffMs(row.attempt_count)
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

export interface PushOptions {
  db: SQLiteDBConnection
  client: SyncClient
  userId: string
  batchSize?: number
  maxAttempts?: number
  /** Injection point for deterministic backoff tests. */
  now?: () => Date
}

export async function pushOutbox({
  db,
  client,
  userId,
  batchSize = PUSH_BATCH_SIZE,
  maxAttempts = MAX_ATTEMPTS,
  now = () => new Date(),
}: PushOptions): Promise<PushResult> {
  const result: PushResult = {
    pushed: 0,
    retryable: 0,
    terminal: 0,
    stoppedForAuth: false,
  }

  // A crash between `processing` and the server response leaves rows that no
  // later run would pick up.
  await resetStaleProcessing(db)

  for (;;) {
    const batch = await getRetryableOutbox(db, batchSize, maxAttempts)
    if (batch.length === 0) break

    let progressed = false

    for (const entry of batch) {
      if (!isDue(entry, now())) continue
      progressed = true

      let entity: PushEntity
      try {
        entity = await buildPushEntity(db, entry, userId)
      } catch (err) {
        // A malformed payload can never succeed on retry. Storing the maximum
        // attempt count removes the row from the retryable set permanently.
        await markOutboxTerminal(db, entry.id, errorMessage(err), maxAttempts)
        result.terminal += 1
        continue
      }

      await markOutboxProcessing(db, entry.id)

      try {
        if (entity.mode === 'delete') {
          await client.deleteByIds(entity.table, [entity.id])
        } else {
          if (entity.photo && client.uploadPhoto) {
            const storagePath = await client.uploadPhoto(entity.photo)
            entity.row.storage_path = storagePath
            await setPhotoStoragePath(db, userId, entity.photo.photoId, storagePath)
          }
          // Tombstones keep the remote path so the object is removed too.
          if (
            client.deletePhoto &&
            typeof entity.row.storage_path === 'string' &&
            entity.row.deleted_at
          ) {
            await client.deletePhoto(entity.row.storage_path)
          }
          await client.upsert(entity.table, [entity.row])
        }
        await markOutboxDone(db, entry.id)
        result.pushed += 1
      } catch (err) {
        const remote = err instanceof RemoteError ? err : new RemoteError(errorMessage(err), null)

        if (remote.kind === 'auth') {
          await markOutboxPending(db, entry.id)
          result.stoppedForAuth = true
          return result
        }

        const attempts = entry.attempt_count + 1
        if (remote.kind === 'terminal' || attempts >= maxAttempts) {
          await markOutboxTerminal(db, entry.id, remote.message, maxAttempts)
          result.terminal += 1
        } else {
          await markOutboxFailed(db, entry.id, remote.message)
          result.retryable += 1
        }
      }
    }

    if (!progressed || batch.length < batchSize) break
  }

  return result
}

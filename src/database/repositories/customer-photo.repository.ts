/**
 * Customer photo repository.
 *
 * Photos are captured offline into app-private storage; the row keeps a
 * `local_path` that never leaves the device. Uploading the bytes and filling
 * `storage_path` is the sync worker's job. Deletes are tombstones so the
 * removal reaches other devices (and triggers a remote object delete).
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { CustomerPhoto, PhotoType, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { withTransaction } from '@database/sqlite/transaction'

export interface CreatePhotoInput {
  customer_id: UUID | null
  visit_id?: UUID | null
  /** Path inside app-private storage; never synced. */
  local_path: string
  photo_type?: PhotoType
  caption?: string | null
  consent_given: boolean
}

export class CustomerPhotoRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  async findById(id: UUID): Promise<CustomerPhoto | null> {
    const result = await this.db.query(
      `SELECT * FROM customer_photos
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as CustomerPhoto) ?? null
  }

  async listByCustomer(customerId: UUID): Promise<CustomerPhoto[]> {
    const result = await this.db.query(
      `SELECT * FROM customer_photos
       WHERE customer_id = ? AND user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [customerId, this.userId]
    )
    return (result.values as CustomerPhoto[]) ?? []
  }

  async listByVisit(visitId: UUID): Promise<CustomerPhoto[]> {
    const result = await this.db.query(
      `SELECT * FROM customer_photos
       WHERE visit_id = ? AND user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [visitId, this.userId]
    )
    return (result.values as CustomerPhoto[]) ?? []
  }

  async create(input: CreatePhotoInput): Promise<CustomerPhoto> {
    if (!input.consent_given) {
      throw new Error('برای نگهداری عکس، رضایت مشتری لازم است')
    }

    const photo: CustomerPhoto = {
      id: generateUUID(),
      user_id: this.userId,
      customer_id: input.customer_id,
      visit_id: input.visit_id ?? null,
      storage_path: null,
      local_path: input.local_path,
      photo_type: input.photo_type ?? 'other',
      caption: input.caption?.trim() || null,
      consent_given: true,
      created_at: nowISO(),
      updated_at: nowISO(),
      deleted_at: null,
    }

    await withTransaction(this.db, async () => {
      await this.db.run(
        `INSERT INTO customer_photos
          (id, user_id, customer_id, visit_id, storage_path, local_path,
           photo_type, caption, consent_given, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          photo.id,
          photo.user_id,
          photo.customer_id,
          photo.visit_id,
          photo.storage_path,
          photo.local_path,
          photo.photo_type,
          photo.caption,
          photo.consent_given ? 1 : 0,
          photo.created_at,
          photo.updated_at,
          photo.deleted_at,
        ]
      )

      await addToOutbox(this.db, {
        user_id: this.userId,
        entity_type: 'customer_photos',
        entity_id: photo.id,
        operation: 'insert',
        payload: JSON.stringify(photo),
        client_op_id: `photo:${photo.id}:insert`,
      })
    })

    return photo
  }

  /** Soft-deletes the row and returns the local path so the caller can unlink the file. */
  async delete(id: UUID): Promise<string | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const tombstone: CustomerPhoto = { ...existing, deleted_at: now, updated_at: now }

    await withTransaction(this.db, async () => {
      await this.db.run(
        `UPDATE customer_photos SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [now, now, id, this.userId]
      )
      await addToOutbox(this.db, {
        user_id: this.userId,
        entity_type: 'customer_photos',
        entity_id: id,
        operation: 'delete',
        payload: JSON.stringify(tombstone),
        client_op_id: `photo:${id}:delete`,
      })
    })

    return existing.local_path
  }
}

/**
 * Records the remote object path after a successful upload.
 * No outbox row is written: the push already carries this path to the server.
 */
export async function setPhotoStoragePath(
  db: SQLiteDBConnection,
  userId: UUID,
  photoId: UUID,
  storagePath: string
): Promise<void> {
  await db.run(
    `UPDATE customer_photos SET storage_path = ?
     WHERE id = ? AND user_id = ?`,
    [storagePath, photoId, userId]
  )
}

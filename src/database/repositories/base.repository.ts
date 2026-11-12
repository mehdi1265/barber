/**
 * BaseRepository — provides common CRUD helpers on top of SQLite.
 * All concrete repositories extend this class.
 */

import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { BaseEntity, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { useAuthStore } from '@state/auth.store'

export abstract class BaseRepository<T extends BaseEntity> {
  constructor(
    protected readonly db: SQLiteDBConnection,
    protected readonly tableName: string
  ) {}

  protected get userId(): string {
    const uid = useAuthStore.getState().userId
    if (!uid) throw new Error('Not authenticated')
    return uid
  }

  protected newId(): UUID {
    return generateUUID()
  }

  protected now(): string {
    return nowISO()
  }

  async findById(id: UUID): Promise<T | null> {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as T) ?? null
  }

  async findAll(includeDeleted = false): Promise<T[]> {
    const deletedClause =
      !includeDeleted && this.hasSoftDelete() ? `AND deleted_at IS NULL` : ''
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE user_id = ? ${deletedClause} ORDER BY created_at DESC`,
      [this.userId]
    )
    return (result.values as T[]) ?? []
  }

  async softDelete(id: UUID): Promise<void> {
    const now = this.now()
    await this.db.run(
      `UPDATE ${this.tableName} SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [now, now, id, this.userId]
    )
    await addToOutbox(this.db, {
      entity_type: this.tableName,
      entity_id: id,
      operation: 'delete',
      payload: JSON.stringify({ id, deleted_at: now }),
    })
  }

  async hardDelete(id: UUID): Promise<void> {
    await this.db.run(
      `DELETE FROM ${this.tableName} WHERE id = ? AND user_id = ?`,
      [id, this.userId]
    )
  }

  /**
   * Override in subclass and return false if the table has no deleted_at column.
   */
  protected hasSoftDelete(): boolean {
    return true
  }
}

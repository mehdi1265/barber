import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Service, UUID } from '@shared/types'
import { generateUUID, nowISO, tomanToStorage } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'

type CreateServiceInput = {
  name: string
  default_price?: number | null   // Toman (display value)
  suggested_duration_minutes?: number | null
}

type UpdateServiceInput = Partial<CreateServiceInput & { is_active: boolean }>

export class ServiceRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  async findById(id: UUID): Promise<Service | null> {
    const result = await this.db.query(
      'SELECT * FROM services WHERE id = ? AND user_id = ? LIMIT 1',
      [id, this.userId]
    )
    return (result.values?.[0] as Service) ?? null
  }

  async findAll(activeOnly = true): Promise<Service[]> {
    const whereActive = activeOnly ? 'AND is_active = 1' : ''
    const result = await this.db.query(
      `SELECT * FROM services
       WHERE user_id = ? ${whereActive}
       ORDER BY name ASC`,
      [this.userId]
    )
    return (result.values as Service[]) ?? []
  }

  async search(query: string): Promise<Service[]> {
    const like = `%${query}%`
    const result = await this.db.query(
      `SELECT * FROM services
       WHERE user_id = ? AND is_active = 1 AND name LIKE ?
       ORDER BY name ASC
       LIMIT 30`,
      [this.userId, like]
    )
    return (result.values as Service[]) ?? []
  }

  async create(input: CreateServiceInput): Promise<Service> {
    const now = nowISO()
    const service: Service = {
      id: generateUUID(),
      user_id: this.userId,
      name: input.name.trim(),
      // Store as integer (Toman × 100); null if not provided
      default_price:
        input.default_price != null ? tomanToStorage(input.default_price) : null,
      suggested_duration_minutes: input.suggested_duration_minutes ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    }

    await this.db.run(
      `INSERT INTO services
        (id, user_id, name, default_price, suggested_duration_minutes, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        service.id,
        service.user_id,
        service.name,
        service.default_price,
        service.suggested_duration_minutes,
        service.created_at,
        service.updated_at,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'services',
      entity_id: service.id,
      operation: 'insert',
      payload: JSON.stringify(service),
    })

    return service
  }

  async update(id: UUID, input: UpdateServiceInput): Promise<Service | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const updated: Service = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      default_price:
        input.default_price !== undefined
          ? input.default_price != null
            ? tomanToStorage(input.default_price)
            : null
          : existing.default_price,
      suggested_duration_minutes:
        input.suggested_duration_minutes !== undefined
          ? input.suggested_duration_minutes
          : existing.suggested_duration_minutes,
      is_active: input.is_active !== undefined ? input.is_active : existing.is_active,
      updated_at: now,
    }

    await this.db.run(
      `UPDATE services
       SET name = ?, default_price = ?, suggested_duration_minutes = ?, is_active = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name,
        updated.default_price,
        updated.suggested_duration_minutes,
        updated.is_active ? 1 : 0,
        updated.updated_at,
        id,
        this.userId,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'services',
      entity_id: id,
      operation: 'update',
      payload: JSON.stringify(updated),
    })

    return updated
  }

  /** Deactivate instead of delete — preserves snapshot history */
  async deactivate(id: UUID): Promise<void> {
    const now = nowISO()
    await this.db.run(
      `UPDATE services SET is_active = 0, updated_at = ? WHERE id = ? AND user_id = ?`,
      [now, id, this.userId]
    )

    await addToOutbox(this.db, {
      entity_type: 'services',
      entity_id: id,
      operation: 'update',
      payload: JSON.stringify({ id, is_active: false, updated_at: now }),
    })
  }
}

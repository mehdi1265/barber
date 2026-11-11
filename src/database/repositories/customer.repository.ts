import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Customer, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'

type CreateCustomerInput = {
  name: string
  phone?: string | null
  notes?: string | null
}

type UpdateCustomerInput = Partial<CreateCustomerInput>

export class CustomerRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  async findById(id: UUID): Promise<Customer | null> {
    const result = await this.db.query(
      'SELECT * FROM customers WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1',
      [id, this.userId]
    )
    return (result.values?.[0] as Customer) ?? null
  }

  async findAll(): Promise<Customer[]> {
    const result = await this.db.query(
      `SELECT * FROM customers
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY name ASC`,
      [this.userId]
    )
    return (result.values as Customer[]) ?? []
  }

  async search(query: string): Promise<Customer[]> {
    const like = `%${query}%`
    const result = await this.db.query(
      `SELECT * FROM customers
       WHERE user_id = ? AND deleted_at IS NULL
         AND (name LIKE ? OR phone LIKE ?)
       ORDER BY name ASC
       LIMIT 50`,
      [this.userId, like, like]
    )
    return (result.values as Customer[]) ?? []
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const now = nowISO()
    const customer: Customer = {
      id: generateUUID(),
      user_id: this.userId,
      name: input.name.trim(),
      phone: input.phone?.trim() ?? null,
      notes: input.notes?.trim() ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }

    await this.db.run(
      `INSERT INTO customers (id, user_id, name, phone, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        customer.id,
        customer.user_id,
        customer.name,
        customer.phone,
        customer.notes,
        customer.created_at,
        customer.updated_at,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'customers',
      entity_id: customer.id,
      operation: 'insert',
      payload: JSON.stringify(customer),
    })

    return customer
  }

  async update(id: UUID, input: UpdateCustomerInput): Promise<Customer | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const updated: Customer = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      phone: input.phone !== undefined ? (input.phone?.trim() ?? null) : existing.phone,
      notes: input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes,
      updated_at: now,
    }

    await this.db.run(
      `UPDATE customers
       SET name = ?, phone = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [updated.name, updated.phone, updated.notes, updated.updated_at, id, this.userId]
    )

    await addToOutbox(this.db, {
      entity_type: 'customers',
      entity_id: id,
      operation: 'update',
      payload: JSON.stringify(updated),
    })

    return updated
  }

  /** Soft delete — keeps record for sync propagation */
  async delete(id: UUID): Promise<void> {
    const now = nowISO()
    await this.db.run(
      `UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      [now, now, id, this.userId]
    )

    await addToOutbox(this.db, {
      entity_type: 'customers',
      entity_id: id,
      operation: 'delete',
      payload: JSON.stringify({ id, deleted_at: now }),
    })
  }

  async countAll(): Promise<number> {
    const result = await this.db.query(
      'SELECT COUNT(*) as cnt FROM customers WHERE user_id = ? AND deleted_at IS NULL',
      [this.userId]
    )
    return (result.values?.[0] as { cnt: number })?.cnt ?? 0
  }
}

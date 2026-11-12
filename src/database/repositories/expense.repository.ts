import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Expense, UUID } from '@shared/types'
import { generateUUID, nowISO, tomanToStorage } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'

export interface CreateExpenseInput {
  title: string
  category?: string | null
  amount: number // Toman (display)
  spent_at?: string // ISO-8601; defaults to today
  note?: string | null
}

export class ExpenseRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  async findById(id: UUID): Promise<Expense | null> {
    const result = await this.db.query(
      `SELECT * FROM expenses WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as Expense) ?? null
  }

  async findByDateRange(startISO: string, endISO: string): Promise<Expense[]> {
    const result = await this.db.query(
      `SELECT * FROM expenses
       WHERE user_id = ? AND spent_at >= ? AND spent_at <= ?
       ORDER BY spent_at DESC`,
      [this.userId, startISO, endISO]
    )
    return (result.values as Expense[]) ?? []
  }

  async findByDay(dateISO: string): Promise<Expense[]> {
    return this.findByDateRange(`${dateISO}T00:00:00.000Z`, `${dateISO}T23:59:59.999Z`)
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const now = nowISO()
    const expense: Expense = {
      id: generateUUID(),
      user_id: this.userId,
      title: input.title.trim(),
      category: input.category?.trim() ?? null,
      amount: tomanToStorage(input.amount),
      spent_at: input.spent_at ?? now,
      note: input.note?.trim() ?? null,
      created_at: now,
      updated_at: now,
    }

    await this.db.run(
      `INSERT INTO expenses
        (id, user_id, title, category, amount, spent_at, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expense.id,
        expense.user_id,
        expense.title,
        expense.category,
        expense.amount,
        expense.spent_at,
        expense.note,
        expense.created_at,
        expense.updated_at,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'expenses',
      entity_id: expense.id,
      operation: 'insert',
      payload: JSON.stringify(expense),
    })

    return expense
  }

  async update(id: UUID, input: Partial<CreateExpenseInput>): Promise<Expense | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const updated: Expense = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      category: input.category !== undefined ? (input.category?.trim() ?? null) : existing.category,
      amount: input.amount !== undefined ? tomanToStorage(input.amount) : existing.amount,
      spent_at: input.spent_at ?? existing.spent_at,
      note: input.note !== undefined ? (input.note?.trim() ?? null) : existing.note,
      updated_at: now,
    }

    await this.db.run(
      `UPDATE expenses
       SET title = ?, category = ?, amount = ?, spent_at = ?, note = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.title,
        updated.category,
        updated.amount,
        updated.spent_at,
        updated.note,
        updated.updated_at,
        id,
        this.userId,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'expenses',
      entity_id: id,
      operation: 'update',
      payload: JSON.stringify(updated),
    })

    return updated
  }

  async delete(id: UUID): Promise<void> {
    await this.db.run(`DELETE FROM expenses WHERE id = ? AND user_id = ?`, [id, this.userId])
    await addToOutbox(this.db, {
      entity_type: 'expenses',
      entity_id: id,
      operation: 'delete',
      payload: JSON.stringify({ id }),
    })
  }
}

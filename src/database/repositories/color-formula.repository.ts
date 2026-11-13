import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { ColorFormula, ColorFormulaItem, UUID } from '@shared/types'
import { generateUUID, nowISO } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'
import { withTransaction } from '@database/sqlite/transaction'

export interface ColorFormulaItemInput {
  /** Present when an existing line is kept during an edit */
  id?: UUID
  product_name: string
  color_code?: string | null
  amount: number
  unit?: string
}

export interface ColorFormulaInput {
  title: string
  brand?: string | null
  color_code?: string | null
  oxidant_type?: string | null
  oxidant_percent?: number | null
  mix_ratio?: string | null
  processing_minutes?: number | null
  notes?: string | null
  customer_id?: UUID | null
  visit_id?: UUID | null
  items: ColorFormulaItemInput[]
}

export interface ColorFormulaSummary extends ColorFormula {
  customer_name: string | null
  item_count: number
}

export interface ColorFormulaDetail {
  formula: ColorFormula
  items: ColorFormulaItem[]
}

/**
 * The server stores these columns as NUMERIC(5,2)/(8,2); rounding here keeps
 * the local REAL and the cloud value identical after a round-trip.
 */
function round2(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export class ColorFormulaRepository {
  constructor(
    private readonly db: SQLiteDBConnection,
    private readonly userId: UUID
  ) {}

  async findById(id: UUID): Promise<ColorFormula | null> {
    const result = await this.db.query(
      `SELECT * FROM color_formulas WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, this.userId]
    )
    return (result.values?.[0] as ColorFormula) ?? null
  }

  async getItems(formulaId: UUID): Promise<ColorFormulaItem[]> {
    const result = await this.db.query(
      `SELECT * FROM color_formula_items
       WHERE formula_id = ? AND user_id = ?
       ORDER BY created_at ASC`,
      [formulaId, this.userId]
    )
    return (result.values as ColorFormulaItem[]) ?? []
  }

  async findDetail(id: UUID): Promise<ColorFormulaDetail | null> {
    const formula = await this.findById(id)
    if (!formula) return null
    return { formula, items: await this.getItems(id) }
  }

  async findAll(): Promise<ColorFormulaSummary[]> {
    const result = await this.db.query(
      `SELECT f.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM color_formula_items i
                WHERE i.formula_id = f.id AND i.user_id = f.user_id) AS item_count
       FROM color_formulas f
       LEFT JOIN customers c ON c.id = f.customer_id
       WHERE f.user_id = ?
       ORDER BY f.updated_at DESC`,
      [this.userId]
    )
    return (result.values as ColorFormulaSummary[]) ?? []
  }

  async search(query: string): Promise<ColorFormulaSummary[]> {
    const like = `%${query}%`
    const result = await this.db.query(
      `SELECT f.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM color_formula_items i
                WHERE i.formula_id = f.id AND i.user_id = f.user_id) AS item_count
       FROM color_formulas f
       LEFT JOIN customers c ON c.id = f.customer_id
       WHERE f.user_id = ?
         AND (f.title LIKE ? OR f.brand LIKE ? OR f.color_code LIKE ? OR c.name LIKE ?)
       ORDER BY f.updated_at DESC
       LIMIT 100`,
      [this.userId, like, like, like, like]
    )
    return (result.values as ColorFormulaSummary[]) ?? []
  }

  async findByCustomer(customerId: UUID): Promise<ColorFormulaSummary[]> {
    const result = await this.db.query(
      `SELECT f.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM color_formula_items i
                WHERE i.formula_id = f.id AND i.user_id = f.user_id) AS item_count
       FROM color_formulas f
       LEFT JOIN customers c ON c.id = f.customer_id
       WHERE f.user_id = ? AND f.customer_id = ?
       ORDER BY f.updated_at DESC`,
      [this.userId, customerId]
    )
    return (result.values as ColorFormulaSummary[]) ?? []
  }

  async create(input: ColorFormulaInput): Promise<ColorFormula> {
    const now = nowISO()
    const actionId = generateUUID()
    const formula: ColorFormula = {
      id: generateUUID(),
      user_id: this.userId,
      title: input.title.trim(),
      brand: text(input.brand),
      color_code: text(input.color_code),
      oxidant_type: text(input.oxidant_type),
      oxidant_percent: round2(input.oxidant_percent),
      mix_ratio: text(input.mix_ratio),
      processing_minutes: input.processing_minutes ?? null,
      notes: text(input.notes),
      customer_id: input.customer_id || null,
      visit_id: input.visit_id || null,
      created_at: now,
      updated_at: now,
    }

    await withTransaction(this.db, async () => {
      await this.insertFormula(formula)
      await addToOutbox(this.db, {
        entity_type: 'color_formulas',
        entity_id: formula.id,
        operation: 'insert',
        payload: JSON.stringify(formula),
        client_op_id: actionId,
      })

      for (const item of input.items) {
        const row = this.buildItem(formula.id, item, now)
        await this.insertItem(row)
        await addToOutbox(this.db, {
          entity_type: 'color_formula_items',
          entity_id: row.id,
          operation: 'insert',
          payload: JSON.stringify(row),
          client_op_id: `${actionId}:${row.id}`,
        })
      }
    })

    return formula
  }

  async update(id: UUID, input: Partial<ColorFormulaInput>): Promise<ColorFormula | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const now = nowISO()
    const actionId = generateUUID()
    const updated: ColorFormula = {
      ...existing,
      title: input.title?.trim() ?? existing.title,
      brand: input.brand !== undefined ? text(input.brand) : existing.brand,
      color_code: input.color_code !== undefined ? text(input.color_code) : existing.color_code,
      oxidant_type:
        input.oxidant_type !== undefined ? text(input.oxidant_type) : existing.oxidant_type,
      oxidant_percent:
        input.oxidant_percent !== undefined
          ? round2(input.oxidant_percent)
          : existing.oxidant_percent,
      mix_ratio: input.mix_ratio !== undefined ? text(input.mix_ratio) : existing.mix_ratio,
      processing_minutes:
        input.processing_minutes !== undefined
          ? input.processing_minutes
          : existing.processing_minutes,
      notes: input.notes !== undefined ? text(input.notes) : existing.notes,
      customer_id:
        input.customer_id !== undefined ? input.customer_id || null : existing.customer_id,
      visit_id: input.visit_id !== undefined ? input.visit_id || null : existing.visit_id,
      updated_at: now,
    }

    await withTransaction(this.db, async () => {
      await this.db.run(
        `UPDATE color_formulas
         SET title = ?, brand = ?, color_code = ?, oxidant_type = ?, oxidant_percent = ?,
             mix_ratio = ?, processing_minutes = ?, notes = ?, customer_id = ?, visit_id = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          updated.title,
          updated.brand,
          updated.color_code,
          updated.oxidant_type,
          updated.oxidant_percent,
          updated.mix_ratio,
          updated.processing_minutes,
          updated.notes,
          updated.customer_id,
          updated.visit_id,
          updated.updated_at,
          id,
          this.userId,
        ]
      )

      await addToOutbox(this.db, {
        entity_type: 'color_formulas',
        entity_id: id,
        operation: 'update',
        payload: JSON.stringify(updated),
        client_op_id: actionId,
      })

      if (input.items) {
        await this.replaceItems(id, input.items, actionId, now)
      }
    })

    return updated
  }

  /** Copies a formula and its lines into a new formula. */
  async duplicate(id: UUID): Promise<ColorFormula | null> {
    const detail = await this.findDetail(id)
    if (!detail) return null

    return this.create({
      ...detail.formula,
      title: `${detail.formula.title} (کپی)`,
      items: detail.items.map(item => ({
        product_name: item.product_name,
        color_code: item.color_code,
        amount: item.amount,
        unit: item.unit,
      })),
    })
  }

  /** Hard delete (the cloud schema has no tombstone for formulas). */
  async delete(id: UUID): Promise<void> {
    const formula = await this.findById(id)
    if (!formula) return

    const items = await this.getItems(id)
    const actionId = generateUUID()

    await withTransaction(this.db, async () => {
      for (const item of items) {
        await this.db.run(`DELETE FROM color_formula_items WHERE id = ? AND user_id = ?`, [
          item.id,
          this.userId,
        ])
        await addToOutbox(this.db, {
          entity_type: 'color_formula_items',
          entity_id: item.id,
          operation: 'delete',
          payload: JSON.stringify(item),
          client_op_id: `${actionId}:del:${item.id}`,
        })
      }

      await this.db.run(`DELETE FROM color_formulas WHERE id = ? AND user_id = ?`, [
        id,
        this.userId,
      ])
      await addToOutbox(this.db, {
        entity_type: 'color_formulas',
        entity_id: id,
        operation: 'delete',
        payload: JSON.stringify(formula),
        client_op_id: actionId,
      })
    })
  }

  private buildItem(formulaId: UUID, input: ColorFormulaItemInput, now: string): ColorFormulaItem {
    return {
      id: input.id ?? generateUUID(),
      user_id: this.userId,
      formula_id: formulaId,
      product_name: input.product_name.trim(),
      color_code: text(input.color_code),
      amount: round2(input.amount) ?? 0,
      unit: input.unit?.trim() || 'g',
      created_at: now,
      updated_at: now,
    }
  }

  private async insertFormula(formula: ColorFormula): Promise<void> {
    await this.db.run(
      `INSERT INTO color_formulas
        (id, user_id, title, brand, color_code, oxidant_type, oxidant_percent, mix_ratio,
         processing_minutes, notes, customer_id, visit_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        formula.id,
        formula.user_id,
        formula.title,
        formula.brand,
        formula.color_code,
        formula.oxidant_type,
        formula.oxidant_percent,
        formula.mix_ratio,
        formula.processing_minutes,
        formula.notes,
        formula.customer_id,
        formula.visit_id,
        formula.created_at,
        formula.updated_at,
      ]
    )
  }

  private async insertItem(item: ColorFormulaItem): Promise<void> {
    await this.db.run(
      `INSERT INTO color_formula_items
        (id, user_id, formula_id, product_name, color_code, amount, unit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.user_id,
        item.formula_id,
        item.product_name,
        item.color_code,
        item.amount,
        item.unit,
        item.created_at,
        item.updated_at,
      ]
    )
  }

  private async replaceItems(
    formulaId: UUID,
    inputs: ColorFormulaItemInput[],
    actionId: string,
    now: string
  ): Promise<void> {
    const previous = await this.getItems(formulaId)
    const keepIds = new Set(inputs.map(item => item.id).filter((value): value is UUID => !!value))
    const previousById = new Map(previous.map(item => [item.id, item]))

    for (const old of previous) {
      if (keepIds.has(old.id)) continue
      await this.db.run(`DELETE FROM color_formula_items WHERE id = ? AND user_id = ?`, [
        old.id,
        this.userId,
      ])
      await addToOutbox(this.db, {
        entity_type: 'color_formula_items',
        entity_id: old.id,
        operation: 'delete',
        payload: JSON.stringify(old),
        client_op_id: `${actionId}:del:${old.id}`,
      })
    }

    for (const input of inputs) {
      if (input.id && previousById.has(input.id)) {
        const old = previousById.get(input.id)!
        const updated: ColorFormulaItem = {
          ...old,
          product_name: input.product_name.trim(),
          color_code: text(input.color_code),
          amount: round2(input.amount) ?? 0,
          unit: input.unit?.trim() || 'g',
          updated_at: now,
        }
        await this.db.run(
          `UPDATE color_formula_items
           SET product_name = ?, color_code = ?, amount = ?, unit = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
          [
            updated.product_name,
            updated.color_code,
            updated.amount,
            updated.unit,
            updated.updated_at,
            updated.id,
            this.userId,
          ]
        )
        await addToOutbox(this.db, {
          entity_type: 'color_formula_items',
          entity_id: updated.id,
          operation: 'update',
          payload: JSON.stringify(updated),
          client_op_id: `${actionId}:${updated.id}`,
        })
      } else {
        const row = this.buildItem(formulaId, input, now)
        await this.insertItem(row)
        await addToOutbox(this.db, {
          entity_type: 'color_formula_items',
          entity_id: row.id,
          operation: 'insert',
          payload: JSON.stringify(row),
          client_op_id: `${actionId}:${row.id}`,
        })
      }
    }
  }
}

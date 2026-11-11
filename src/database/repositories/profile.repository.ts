import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Profile, UUID } from '@shared/types'
import { nowISO } from '@shared/utils/helpers'
import { addToOutbox } from '@sync/outbox/outbox.repository'

type CreateProfileInput = {
  id: UUID
  user_id: UUID
  display_name: string
  phone: string | null
  currency_code: string
}

type UpdateProfileInput = Partial<
  Pick<Profile, 'display_name' | 'phone' | 'currency_code'>
>

export class ProfileRepository {
  constructor(private readonly db: SQLiteDBConnection) {}

  async getProfile(userId: UUID): Promise<Profile | null> {
    const result = await this.db.query(
      'SELECT * FROM profiles WHERE user_id = ? LIMIT 1',
      [userId]
    )
    return (result.values?.[0] as Profile) ?? null
  }

  async createProfile(input: CreateProfileInput): Promise<Profile> {
    const now = nowISO()
    const profile: Profile = {
      id: input.id,
      user_id: input.user_id,
      display_name: input.display_name,
      phone: input.phone,
      currency_code: input.currency_code,
      created_at: now,
      updated_at: now,
    }

    await this.db.run(
      `INSERT OR REPLACE INTO profiles
        (id, user_id, display_name, phone, currency_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        profile.user_id,
        profile.display_name,
        profile.phone,
        profile.currency_code,
        profile.created_at,
        profile.updated_at,
      ]
    )

    await addToOutbox(this.db, {
      entity_type: 'profiles',
      entity_id: profile.id,
      operation: 'insert',
      payload: JSON.stringify(profile),
    })

    return profile
  }

  async updateProfile(userId: UUID, input: UpdateProfileInput): Promise<void> {
    const now = nowISO()
    const fields: string[] = []
    const values: unknown[] = []

    if (input.display_name !== undefined) {
      fields.push('display_name = ?')
      values.push(input.display_name)
    }
    if (input.phone !== undefined) {
      fields.push('phone = ?')
      values.push(input.phone)
    }
    if (input.currency_code !== undefined) {
      fields.push('currency_code = ?')
      values.push(input.currency_code)
    }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(now)
    values.push(userId)

    await this.db.run(
      `UPDATE profiles SET ${fields.join(', ')} WHERE user_id = ?`,
      values
    )

    const updated = await this.getProfile(userId)
    if (updated) {
      await addToOutbox(this.db, {
        entity_type: 'profiles',
        entity_id: updated.id,
        operation: 'update',
        payload: JSON.stringify(updated),
      })
    }
  }
}

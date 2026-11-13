import { describe, it, expect } from 'vitest'
import { ProfileRepository } from '@database/repositories/profile.repository'
import { createTestDb } from '../helpers/sqlite-harness'

const USER_ID = 'user-profile-001'

describe('ProfileRepository', () => {
  it('پروفایل را محلی ذخیره و یک ردیف outbox برای ارسال می‌سازد', async () => {
    const { db, outboxRows } = createTestDb()
    const repo = new ProfileRepository(db)

    const profile = await repo.createProfile({
      id: USER_ID,
      user_id: USER_ID,
      display_name: 'آرایشگاه علی',
      phone: null,
      currency_code: 'IRR',
    })

    expect(await repo.getProfile(USER_ID)).toMatchObject({
      display_name: 'آرایشگاه علی',
      currency_code: 'IRR',
    })

    const outbox = outboxRows()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity_type: 'profiles', operation: 'insert' })
    expect((JSON.parse(outbox[0].payload) as { id: string }).id).toBe(profile.id)
  })

  it('ویرایش پروفایل را ذخیره می‌کند و بدون تبدیل مبلغ، واحد پول را عوض می‌کند', async () => {
    const { db, outboxRows } = createTestDb()
    const repo = new ProfileRepository(db)
    await repo.createProfile({
      id: USER_ID,
      user_id: USER_ID,
      display_name: 'آرایشگاه علی',
      phone: null,
      currency_code: 'IRR',
    })

    await repo.updateProfile(USER_ID, {
      display_name: 'آرایشگاه رضا',
      phone: '09120000000',
      currency_code: 'USD',
    })

    expect(await repo.getProfile(USER_ID)).toMatchObject({
      display_name: 'آرایشگاه رضا',
      phone: '09120000000',
      currency_code: 'USD',
    })

    const outbox = outboxRows()
    expect(outbox).toHaveLength(2)
    expect(outbox[1]).toMatchObject({ entity_type: 'profiles', operation: 'update' })
    expect(JSON.parse(outbox[1].payload)).toMatchObject({
      display_name: 'آرایشگاه رضا',
      currency_code: 'USD',
    })
  })
})

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

  it('bootstrap placeholder is not queued for push', async () => {
    const { db, outboxRows } = createTestDb()
    const repo = new ProfileRepository(db)

    const profile = await repo.ensureLocalProfile({
      id: USER_ID,
      user_id: USER_ID,
      display_name: 'علی',
      phone: null,
      currency_code: 'IRR',
    })

    expect(profile.display_name).toBe('علی')
    expect(await repo.getProfile(USER_ID)).toMatchObject({ phone: null, currency_code: 'IRR' })
    // Pushing this placeholder would overwrite the cloud phone/currency.
    expect(outboxRows()).toHaveLength(0)
  })

  it('bootstrap placeholder never replaces an existing cloud row', async () => {
    const { db } = createTestDb()
    const repo = new ProfileRepository(db)
    await repo.createProfile({
      id: USER_ID,
      user_id: USER_ID,
      display_name: 'آرایشگاه علی',
      phone: '09120000000',
      currency_code: 'USD',
    })

    const profile = await repo.ensureLocalProfile({
      id: USER_ID,
      user_id: USER_ID,
      display_name: 'علی',
      phone: null,
      currency_code: 'IRR',
    })

    expect(profile).toMatchObject({
      display_name: 'آرایشگاه علی',
      phone: '09120000000',
      currency_code: 'USD',
    })
  })
})

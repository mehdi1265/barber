import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileSettings } from '@features/settings/ProfileSettings'
import type { ProfileFormData } from '@features/settings/settings.schemas'
import type { Profile } from '@shared/types'

const PROFILE: Profile = {
  id: 'user-1',
  user_id: 'user-1',
  display_name: 'آرایشگاه علی',
  phone: null,
  currency_code: 'IRR',
  created_at: '2026-11-13T10:00:00.000Z',
  updated_at: '2026-11-13T10:00:00.000Z',
}

describe('ProfileSettings', () => {
  it('نام، تلفن و واحد پول را ذخیره می‌کند و یادآوری می‌کند که واحد پول فقط نمایشی است', async () => {
    const onSave = vi.fn(async (_data: ProfileFormData) => {})
    render(<ProfileSettings profile={PROFILE} saved={false} error={null} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/نام نمایشی/), {
      target: { value: 'آرایشگاه رضا' },
    })
    fireEvent.change(screen.getByLabelText(/شماره تماس/), {
      target: { value: '09120000000' },
    })
    fireEvent.change(screen.getByLabelText('واحد پول'), {
      target: { value: 'USD' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      display_name: 'آرایشگاه رضا',
      phone: '09120000000',
      currency_code: 'USD',
    })
    expect(screen.getByText(/فقط برچسب نمایش/)).toBeInTheDocument()
  })

  it('نام خالی را با پیام فارسی رد می‌کند', async () => {
    const onSave = vi.fn(async (_data: ProfileFormData) => {})
    render(<ProfileSettings profile={PROFILE} saved={false} error={null} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/نام نمایشی/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره پروفایل' }))

    expect(await screen.findByText('نام نمایشی الزامی است')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('خطای ذخیره و پیام موفقیت را نمایش می‌دهد', () => {
    const { rerender } = render(
      <ProfileSettings
        profile={PROFILE}
        saved={false}
        error="ذخیره پروفایل ناموفق بود."
        onSave={vi.fn(async () => {})}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('ذخیره پروفایل ناموفق بود.')

    rerender(
      <ProfileSettings profile={PROFILE} saved error={null} onSave={vi.fn(async () => {})} />
    )
    expect(screen.getByRole('status')).toHaveTextContent('پروفایل ذخیره شد')
  })
})

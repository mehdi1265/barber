import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PhotoCaptureForm } from '@features/photos/PhotoCaptureForm'
import { capturePhoto } from '@features/photos/photo-storage'

vi.mock('@features/photos/photo-storage', async importOriginal => {
  const actual = await importOriginal<typeof import('@features/photos/photo-storage')>()
  return { ...actual, capturePhoto: vi.fn() }
})

describe('PhotoCaptureForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(capturePhoto).mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,AAAA',
      format: 'jpeg',
    })
  })

  it('تا زمانی که عکس و رضایت انتخاب نشده، ذخیره را غیرفعال نگه می‌دارد', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<PhotoCaptureForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /گرفتن یا انتخاب عکس/ }))
    await screen.findByAltText('پیش‌نمایش عکس')

    const save = screen.getByRole('button', { name: 'ذخیره عکس' })
    expect(save).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(save).not.toBeDisabled()

    fireEvent.click(save)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        dataUrl: 'data:image/jpeg;base64,AAAA',
        format: 'jpeg',
        photoType: 'other',
        caption: null,
        consentGiven: true,
      })
    )
  })
})

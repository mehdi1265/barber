/**
 * Capture/select a photo, ask for consent, and hand the data URL to the caller.
 * The preview never leaves the device until the sync worker uploads it.
 */

import { useState } from 'react'
import { Button } from '@shared/components/ui/Button'
import { capturePhoto, type CapturedPhoto } from './photo-storage'
import type { PhotoType } from '@shared/types'
import styles from './PhotoCaptureForm.module.css'

export interface PhotoFormValue {
  dataUrl: string
  format: string
  photoType: PhotoType
  caption: string | null
  consentGiven: boolean
}

interface PhotoCaptureFormProps {
  onSubmit: (value: PhotoFormValue) => Promise<void>
  onCancel: () => void
}

const TYPE_LABELS: Record<PhotoType, string> = {
  before: 'قبل',
  after: 'بعد',
  other: 'سایر',
}

export function PhotoCaptureForm({ onSubmit, onCancel }: PhotoCaptureFormProps) {
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null)
  const [photoType, setPhotoType] = useState<PhotoType>('other')
  const [caption, setCaption] = useState('')
  const [consent, setConsent] = useState(false)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePick = async () => {
    setError(null)
    setPicking(true)
    try {
      setPhoto(await capturePhoto())
    } catch (err) {
      // A cancelled picker is not an error worth shouting about.
      const message = err instanceof Error ? err.message : ''
      if (message && !/cancel/i.test(message)) setError('گرفتن عکس انجام نشد. دوباره تلاش کنید.')
    } finally {
      setPicking(false)
    }
  }

  const handleSubmit = async () => {
    if (!photo || !consent || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        dataUrl: photo.dataUrl,
        format: photo.format,
        photoType,
        caption: caption.trim() || null,
        consentGiven: consent,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ذخیره عکس انجام نشد')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.form}>
      {photo ? (
        <img src={photo.dataUrl} alt="پیش‌نمایش عکس" className={styles.preview} />
      ) : (
        <div className={styles.previewEmpty}>هنوز عکسی انتخاب نشده است</div>
      )}

      <Button
        type="button"
        variant="ghost"
        fullWidth
        loading={picking}
        onClick={() => {
          void handlePick()
        }}
      >
        📷 گرفتن یا انتخاب عکس
      </Button>

      <div className={styles.row}>
        <label htmlFor="photo-type" className={styles.label}>
          نوع عکس
        </label>
        <select
          id="photo-type"
          className={styles.select}
          value={photoType}
          onChange={event => setPhotoType(event.target.value as PhotoType)}
        >
          {(Object.keys(TYPE_LABELS) as PhotoType[]).map(type => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <label htmlFor="photo-caption" className={styles.label}>
          توضیح
        </label>
        <input
          id="photo-caption"
          className={styles.input}
          value={caption}
          maxLength={200}
          placeholder="اختیاری"
          onChange={event => setCaption(event.target.value)}
          dir="auto"
        />
      </div>

      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={consent}
          onChange={event => setConsent(event.target.checked)}
        />
        <span>
          مشتری با نگهداری و پردازش این عکس موافق است. عکس فقط در فضای خصوصی حساب شما ذخیره می‌شود.
        </span>
      </label>

      {error && (
        <p className={styles.errorMsg} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" fullWidth onClick={onCancel} disabled={saving}>
          انصراف
        </Button>
        <Button
          type="button"
          fullWidth
          loading={saving}
          disabled={!photo || !consent}
          onClick={() => {
            void handleSubmit()
          }}
        >
          ذخیره عکس
        </Button>
      </div>
    </div>
  )
}

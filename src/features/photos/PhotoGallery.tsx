/**
 * Photo gallery: thumbnails resolve from local bytes first, then a signed URL.
 * Local-first means an offline capture is visible immediately.
 */

import { useEffect, useState } from 'react'
import { Modal } from '@shared/components/ui/Modal'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { createPhotoSignedUrl, readPhotoDataUrl } from './photo-storage'
import type { CustomerPhoto, PhotoType } from '@shared/types'
import styles from './PhotoGallery.module.css'

const TYPE_LABELS: Record<PhotoType, string> = {
  before: 'قبل',
  after: 'بعد',
  other: 'سایر',
}

function usePhotoUrl(photo: CustomerPhoto | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)

    async function load() {
      if (!photo) return
      const local = photo.local_path ? await readPhotoDataUrl(photo.local_path) : null
      if (cancelled) return
      if (local) {
        setUrl(local)
        return
      }
      if (photo.storage_path) {
        const signed = await createPhotoSignedUrl(photo.storage_path)
        if (!cancelled) setUrl(signed)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [photo])

  return url
}

function PhotoThumb({ photo, onOpen }: { photo: CustomerPhoto; onOpen: () => void }) {
  const url = usePhotoUrl(photo)

  return (
    <button type="button" className={styles.thumb} onClick={onOpen} aria-label="نمایش عکس">
      {url ? (
        <img src={url} alt={photo.caption ?? `عکس ${TYPE_LABELS[photo.photo_type]}`} />
      ) : (
        <span className={styles.thumbPlaceholder} aria-hidden="true">
          🖼️
        </span>
      )}
      <span className={styles.thumbBadge}>{TYPE_LABELS[photo.photo_type]}</span>
      {!photo.storage_path && <span className={styles.pendingBadge}>در انتظار ارسال</span>}
    </button>
  )
}

interface PhotoGalleryProps {
  photos: CustomerPhoto[]
  onDelete: (id: string) => Promise<void>
}

export function PhotoGallery({ photos, onDelete }: PhotoGalleryProps) {
  const [openPhoto, setOpenPhoto] = useState<CustomerPhoto | null>(null)
  const [deleting, setDeleting] = useState<CustomerPhoto | null>(null)
  const openUrl = usePhotoUrl(openPhoto)

  if (photos.length === 0) {
    return <p className={styles.empty}>هنوز عکسی برای این مشتری ثبت نشده است.</p>
  }

  return (
    <>
      <div className={styles.grid}>
        {photos.map(photo => (
          <PhotoThumb key={photo.id} photo={photo} onOpen={() => setOpenPhoto(photo)} />
        ))}
      </div>

      <Modal isOpen={openPhoto !== null} onClose={() => setOpenPhoto(null)} title="عکس مشتری">
        {openPhoto && (
          <div className={styles.lightbox}>
            {openUrl ? (
              <img
                src={openUrl}
                alt={openPhoto.caption ?? `عکس ${TYPE_LABELS[openPhoto.photo_type]}`}
                className={styles.fullImage}
              />
            ) : (
              <p className={styles.empty}>این عکس هنوز روی دستگاه یا سرور در دسترس نیست.</p>
            )}
            <div className={styles.meta}>
              <span className={styles.badge}>{TYPE_LABELS[openPhoto.photo_type]}</span>
              {openPhoto.caption && <p className={styles.caption}>{openPhoto.caption}</p>}
              {!openPhoto.storage_path && (
                <p className={styles.pendingHint}>
                  این عکس پس از اتصال به اینترنت به‌صورت خودکار در فضای ابری ذخیره می‌شود.
                </p>
              )}
            </div>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => {
                setDeleting(openPhoto)
                setOpenPhoto(null)
              }}
            >
              🗑️ حذف عکس
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="حذف عکس"
        message="این عکس از دستگاه و فضای ابری حذف می‌شود. ادامه می‌دهید؟"
        confirmLabel="بله، حذف شود"
        cancelLabel="انصراف"
        danger
        onConfirm={() => {
          const photo = deleting
          setDeleting(null)
          if (photo) void onDelete(photo.id)
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

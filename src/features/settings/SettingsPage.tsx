/**
 * SettingsPage — account, sync, and catalog entry points.
 *
 * Phase 7 expands this page; for now it exposes the sync controls required by
 * T09/T10 and the service catalog link.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { useSyncStore } from '@state/sync.store'
import { restoreFromCloud, runSync } from '@sync/engine/sync.manager'
import { formatJalaliDate, formatTime } from '@shared/utils/jalali'
import styles from './SettingsPage.module.css'

const STATUS_LABELS: Record<string, string> = {
  idle: 'آماده',
  syncing: 'در حال همگام‌سازی…',
  synced: 'همگام‌سازی شده',
  error: 'خطا در همگام‌سازی',
  offline: 'آفلاین',
}

export default function SettingsPage() {
  const { status, lastSyncAt, pendingCount, conflicts, errorMessage } = useSyncStore()
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)

  const syncNow = async () => {
    setBusy(true)
    try {
      await runSync('manual')
    } finally {
      setBusy(false)
    }
  }

  const confirmRestore = async () => {
    setBusy(true)
    try {
      await restoreFromCloud()
    } finally {
      setBusy(false)
      setRestoreOpen(false)
    }
  }

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader title="تنظیمات" />

      <section className={styles.section} aria-labelledby="sync-heading">
        <h2 id="sync-heading" className={styles.sectionTitle}>
          همگام‌سازی
        </h2>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>وضعیت</dt>
            <dd className={styles[status] ?? ''}>{STATUS_LABELS[status] ?? status}</dd>
          </div>
          <div className={styles.fact}>
            <dt>در انتظار ارسال</dt>
            <dd>{pendingCount.toLocaleString('fa-IR')} تغییر</dd>
          </div>
          {lastSyncAt && (
            <div className={styles.fact}>
              <dt>آخرین همگام‌سازی</dt>
              <dd>
                {formatJalaliDate(lastSyncAt)} — {formatTime(lastSyncAt)}
              </dd>
            </div>
          )}
          {conflicts > 0 && (
            <div className={styles.fact}>
              <dt>تعارض‌های محلی</dt>
              <dd>
                {conflicts.toLocaleString('fa-IR')} ردیف ابری فعلاً اعمال نشد؛ تغییرات محلی
                ارسال‌نشده اولویت دارند.
              </dd>
            </div>
          )}
        </dl>

        {errorMessage && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            onClick={() => {
              void syncNow()
            }}
            loading={busy}
            disabled={status === 'syncing'}
          >
            همگام‌سازی اکنون
          </Button>
          <Button
            variant="secondary"
            onClick={() => setRestoreOpen(true)}
            disabled={busy || status === 'syncing'}
          >
            بازیابی کامل از ابر
          </Button>
        </div>

        <p className={styles.note}>
          همه اطلاعات ابتدا روی این دستگاه ذخیره می‌شود. همگام‌سازی در پس‌زمینه و پس از اتصال
          اینترنت انجام می‌شود. تغییرات ارسال‌نشده در بازیابی حفظ می‌شوند.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="catalog-heading">
        <h2 id="catalog-heading" className={styles.sectionTitle}>
          خدمات
        </h2>
        <Link to="/settings/services" className={styles.linkRow}>
          <span>مدیریت لیست خدمات</span>
          <span aria-hidden="true">←</span>
        </Link>
      </section>

      <ConfirmDialog
        isOpen={restoreOpen}
        title="بازیابی کامل از ابر"
        message="همه ردیف‌های ابری دوباره خوانده و با داده‌های محلی ادغام می‌شوند. هیچ ردیف محلی حذف نمی‌شود و تغییرات ارسال‌نشده اولویت دارند. ادامه می‌دهید؟"
        confirmLabel="بازیابی"
        cancelLabel="انصراف"
        onConfirm={() => {
          void confirmRestore()
        }}
        onCancel={() => setRestoreOpen(false)}
      />
    </div>
  )
}

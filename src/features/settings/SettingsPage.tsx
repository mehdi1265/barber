/**
 * SettingsPage — account, sync, and catalog entry points.
 *
 * Phase 7 expands this page; for now it exposes the sync controls required by
 * T09/T10 and the service catalog link.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { useSyncStore } from '@state/sync.store'
import { useAuthStore } from '@state/auth.store'
import { REMINDER_LEAD_OPTIONS, usePreferencesStore } from '@state/preferences.store'
import { restoreFromCloud, runSync } from '@sync/engine/sync.manager'
import {
  getNotificationPermission,
  requestNotificationPermission,
  rescheduleAllReminders,
  type NotificationPermission,
} from '@services/notifications/local-notifications'
import { formatJalaliDate, formatTime } from '@shared/utils/jalali'
import styles from './SettingsPage.module.css'

const STATUS_LABELS: Record<string, string> = {
  idle: 'آماده',
  syncing: 'در حال همگام‌سازی…',
  synced: 'همگام‌سازی شده',
  error: 'خطا در همگام‌سازی',
  offline: 'آفلاین',
}

const PERMISSION_LABELS: Record<NotificationPermission, string> = {
  granted: 'اجازه داده شده',
  denied: 'اجازه داده نشده',
  prompt: 'هنوز پرسیده نشده',
}

const LEAD_LABELS: Record<number, string> = {
  10: '۱۰ دقیقه قبل',
  30: '۳۰ دقیقه قبل',
  60: '۱ ساعت قبل',
}

export default function SettingsPage() {
  const { status, lastSyncAt, pendingCount, conflicts, errorMessage } = useSyncStore()
  const userId = useAuthStore(state => state.userId)
  const remindersEnabled = usePreferencesStore(state => state.remindersEnabled)
  const reminderLeadMinutes = usePreferencesStore(state => state.reminderLeadMinutes)
  const setRemindersEnabled = usePreferencesStore(state => state.setRemindersEnabled)
  const setReminderLeadMinutes = usePreferencesStore(state => state.setReminderLeadMinutes)
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('denied')
  const [reminderBusy, setReminderBusy] = useState(false)

  const native = Capacitor.isNativePlatform()

  useEffect(() => {
    if (!native) return
    void getNotificationPermission().then(setPermission)
  }, [native])

  const applyReminderSettings = async () => {
    if (userId) await rescheduleAllReminders(userId)
    if (native) setPermission(await getNotificationPermission())
  }

  const toggleReminders = async (enabled: boolean) => {
    setReminderBusy(true)
    try {
      setRemindersEnabled(enabled)
      if (enabled && native && permission !== 'granted') {
        const granted = await requestNotificationPermission()
        setPermission(granted ? 'granted' : 'denied')
      }
      await applyReminderSettings()
    } finally {
      setReminderBusy(false)
    }
  }

  const changeLead = async (minutes: number) => {
    setReminderBusy(true)
    try {
      setReminderLeadMinutes(minutes)
      await applyReminderSettings()
    } finally {
      setReminderBusy(false)
    }
  }

  const requestPermission = async () => {
    setReminderBusy(true)
    try {
      const granted = await requestNotificationPermission()
      setPermission(granted ? 'granted' : 'denied')
      await applyReminderSettings()
    } finally {
      setReminderBusy(false)
    }
  }

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

      <section className={styles.section} aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className={styles.sectionTitle}>
          یادآوری نوبت
        </h2>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={remindersEnabled}
            disabled={reminderBusy}
            onChange={event => {
              void toggleReminders(event.target.checked)
            }}
          />
          <span>یادآوری نوبت‌ها را نمایش بده</span>
        </label>

        <div className={styles.leadRow}>
          <span>زمان یادآوری</span>
          <select
            className={styles.select}
            value={reminderLeadMinutes}
            disabled={!remindersEnabled || reminderBusy}
            onChange={event => {
              void changeLead(Number(event.target.value))
            }}
            aria-label="زمان یادآوری"
          >
            {REMINDER_LEAD_OPTIONS.map(minutes => (
              <option key={minutes} value={minutes}>
                {LEAD_LABELS[minutes]}
              </option>
            ))}
          </select>
        </div>

        {native ? (
          <>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>اجازه اعلان</dt>
                <dd className={permission === 'granted' ? styles.synced : ''}>
                  {PERMISSION_LABELS[permission]}
                </dd>
              </div>
            </dl>
            {permission !== 'granted' && (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  loading={reminderBusy}
                  onClick={() => {
                    void requestPermission()
                  }}
                >
                  درخواست اجازه اعلان
                </Button>
              </div>
            )}
            <p className={styles.note}>
              اعلان‌ها فقط روی این دستگاه ساخته می‌شوند و به اینترنت نیاز ندارند. با تغییر زمان
              یادآوری، همه نوبت‌های آینده دوباره زمان‌بندی می‌شوند.
            </p>
          </>
        ) : (
          <p className={styles.note}>
            یادآوری محلی فقط در نسخه اندروید و iOS کار می‌کند؛ در مرورگر اعلانی ساخته نمی‌شود.
          </p>
        )}
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

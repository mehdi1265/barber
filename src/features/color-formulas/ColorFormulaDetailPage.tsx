import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useFormulaDetail,
  useUpdateFormula,
  useDuplicateFormula,
  useDeleteFormula,
} from './color-formulas.hooks'
import { ColorFormulaForm } from './ColorFormulaForm'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { formatJalaliDate } from '@shared/utils/jalali'
import type { ColorFormulaFormData } from './color-formulas.schemas'
import styles from './ColorFormulaDetailPage.module.css'

export default function ColorFormulaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useFormulaDetail(id!)
  const updateMutation = useUpdateFormula()
  const duplicateMutation = useDuplicateFormula()
  const deleteMutation = useDeleteFormula()

  const handleUpdate = async (formData: ColorFormulaFormData) => {
    setError(null)
    try {
      await updateMutation.mutateAsync({ id: id!, input: formData })
      setShowEdit(false)
    } catch (err) {
      console.error('[color-formulas] update failed:', err)
      setError('ذخیره تغییرات انجام نشد. دوباره تلاش کنید.')
    }
  }

  const handleDuplicate = async () => {
    setError(null)
    try {
      const copy = await duplicateMutation.mutateAsync(id!)
      if (copy) void navigate(`/color-formulas/${copy.id}`)
    } catch (err) {
      console.error('[color-formulas] duplicate failed:', err)
      setError('ساخت کپی انجام نشد.')
    }
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id!)
    void navigate('/color-formulas', { replace: true })
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری فرمول…" />

  if (!data) {
    return (
      <div className={styles.notFound}>
        <p>فرمول پیدا نشد</p>
        <Button
          variant="ghost"
          onClick={() => {
            void navigate('/color-formulas')
          }}
        >
          بازگشت
        </Button>
      </div>
    )
  }

  const { formula, items } = data

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title={formula.title}
        backTo="/color-formulas"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEdit(true)}
            aria-label="ویرایش فرمول"
          >
            ✏️ ویرایش
          </Button>
        }
      />

      <div className={styles.content}>
        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}

        <div className={styles.card}>
          {formula.brand && (
            <div className={styles.row}>
              <span className={styles.label}>برند</span>
              <span>{formula.brand}</span>
            </div>
          )}
          {formula.color_code && (
            <div className={styles.row}>
              <span className={styles.label}>کد رنگ</span>
              <span className={styles.code} dir="ltr">
                {formula.color_code}
              </span>
            </div>
          )}
          {formula.oxidant_type && (
            <div className={styles.row}>
              <span className={styles.label}>اکسیدان</span>
              <span>
                {formula.oxidant_type}
                {formula.oxidant_percent != null && ` — ${formula.oxidant_percent}٪`}
              </span>
            </div>
          )}
          {formula.mix_ratio && (
            <div className={styles.row}>
              <span className={styles.label}>نسبت ترکیب</span>
              <span dir="ltr">{formula.mix_ratio}</span>
            </div>
          )}
          {formula.processing_minutes != null && (
            <div className={styles.row}>
              <span className={styles.label}>زمان روی سر</span>
              <span>{formula.processing_minutes.toLocaleString('fa-IR')} دقیقه</span>
            </div>
          )}
          {formula.customer_id && (
            <div className={styles.row}>
              <span className={styles.label}>مشتری</span>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  void navigate(`/customers/${formula.customer_id}`)
                }}
              >
                مشاهده پرونده مشتری
              </button>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.label}>آخرین ویرایش</span>
            <span>{formatJalaliDate(formula.updated_at)}</span>
          </div>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>اجزای ترکیب</h3>
          {items.length === 0 ? (
            <p className={styles.empty}>قلمی برای این فرمول ثبت نشده است.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>محصول</th>
                  <th>کد</th>
                  <th>مقدار</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td dir="ltr">{item.color_code ?? '—'}</td>
                    <td>
                      {item.amount.toLocaleString('fa-IR')} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {formula.notes && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>یادداشت</h3>
            <p className={styles.notes}>{formula.notes}</p>
          </section>
        )}

        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={() => {
              void handleDuplicate()
            }}
            loading={duplicateMutation.isPending}
          >
            📋 ساخت کپی
          </Button>
          <Button variant="danger" onClick={() => setShowDelete(true)}>
            🗑️ حذف فرمول
          </Button>
        </div>
      </div>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="ویرایش فرمول">
        <ColorFormulaForm
          defaultValues={{ ...formula, items }}
          onSubmit={handleUpdate}
          onCancel={() => setShowEdit(false)}
          submitLabel="ذخیره تغییرات"
          error={error}
        />
      </Modal>

      <ConfirmDialog
        isOpen={showDelete}
        title="حذف فرمول"
        message={`فرمول «${formula.title}» و همه اجزای آن حذف می‌شود. این عمل قابل بازگشت نیست.`}
        confirmLabel="بله، حذف شود"
        cancelLabel="انصراف"
        danger
        onConfirm={() => {
          void handleDelete()
        }}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  )
}

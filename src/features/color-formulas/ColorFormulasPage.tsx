import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFormulas, useCreateFormula } from './color-formulas.hooks'
import { ColorFormulaForm } from './ColorFormulaForm'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { SearchBar } from '@shared/components/ui/SearchBar'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { formatJalaliDate } from '@shared/utils/jalali'
import type { ColorFormulaFormData } from './color-formulas.schemas'
import styles from './ColorFormulasPage.module.css'

export default function ColorFormulasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customer') ?? undefined

  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: formulas, isLoading, error: loadError } = useFormulas(query)
  const createMutation = useCreateFormula()

  const handleCreate = async (data: ColorFormulaFormData) => {
    setError(null)
    try {
      const created = await createMutation.mutateAsync(data)
      setShowAdd(false)
      void navigate(`/color-formulas/${created.id}`)
    } catch (err) {
      console.error('[color-formulas] create failed:', err)
      setError('ثبت فرمول انجام نشد. دوباره تلاش کنید.')
    }
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری فرمول‌ها…" />

  if (loadError) {
    return (
      <div className={styles.errorState} role="alert">
        خطا در بارگذاری فرمول‌ها
      </div>
    )
  }

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader
        title="دفترچه رنگ"
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + فرمول
          </Button>
        }
      />

      <div className={styles.searchWrap}>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="جست‌وجو با عنوان، برند، کد رنگ یا مشتری…"
        />
      </div>

      {!query && formulas && formulas.length > 0 && (
        <p className={styles.count}>{formulas.length} فرمول</p>
      )}

      {formulas && formulas.length === 0 ? (
        <EmptyState
          icon="🎨"
          title={query ? 'نتیجه‌ای پیدا نشد' : 'هنوز فرمولی ثبت نشده'}
          description={
            query
              ? 'با عبارت دیگری جست‌وجو کنید'
              : 'فرمول‌های رنگ را ذخیره کنید تا دفعه بعد سریع‌تر آماده شوید'
          }
          action={
            !query ? <Button onClick={() => setShowAdd(true)}>+ فرمول جدید</Button> : undefined
          }
        />
      ) : (
        <ul className={styles.list} role="list">
          {formulas?.map(formula => (
            <li key={formula.id} className={styles.item}>
              <button
                className={styles.itemBtn}
                onClick={() => {
                  void navigate(`/color-formulas/${formula.id}`)
                }}
                aria-label={`مشاهده فرمول ${formula.title}`}
              >
                <div className={styles.info}>
                  <span className={styles.title}>{formula.title}</span>
                  <div className={styles.meta}>
                    {formula.brand && <span>{formula.brand}</span>}
                    {formula.color_code && (
                      <span className={styles.code} dir="ltr">
                        {formula.color_code}
                      </span>
                    )}
                    {formula.customer_name && (
                      <span className={styles.customer}>👤 {formula.customer_name}</span>
                    )}
                  </div>
                  <span className={styles.sub}>
                    {formula.item_count.toLocaleString('fa-IR')} قلم ·{' '}
                    {formatJalaliDate(formula.updated_at)}
                  </span>
                </div>
                <span className={styles.arrow} aria-hidden="true">
                  ‹
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="فرمول رنگ جدید">
        <ColorFormulaForm
          defaultCustomerId={customerId}
          onSubmit={handleCreate}
          onCancel={() => setShowAdd(false)}
          submitLabel="ثبت فرمول"
          error={error}
        />
      </Modal>
    </div>
  )
}

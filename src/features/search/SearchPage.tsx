import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@shared/components/ui/PageHeader'
import { SearchBar } from '@shared/components/ui/SearchBar'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import { Button } from '@shared/components/ui/Button'
import { formatToman } from '@shared/utils/helpers'
import { formatJalaliDate, formatTime } from '@shared/utils/jalali'
import { STATUS_COLORS, STATUS_LABELS } from '@features/appointments/appointments.schemas'
import { useGlobalSearch } from './search.hooks'
import { useDebouncedValue } from './useDebouncedValue'
import styles from './SearchPage.module.css'

/** Rows shown per group before "see all". */
const GROUP_LIMIT = 5
/** Rows fetched per group; expanding a group reveals up to this many. */
const FETCH_LIMIT = 50
const DEBOUNCE_MS = 250

interface ResultGroupProps {
  title: string
  icon: string
  hasMore: boolean
  expanded: boolean
  onExpand: () => void
  children: ReactNode
}

function ResultGroup({ title, icon, hasMore, expanded, onExpand, children }: ResultGroupProps) {
  return (
    <section className={styles.group} aria-label={title}>
      <div className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>
          <span aria-hidden="true">{icon}</span> {title}
        </h2>
        {hasMore && !expanded && (
          <button type="button" className={styles.seeAll} onClick={onExpand}>
            نمایش همه
          </button>
        )}
      </div>
      <ul className={styles.list} role="list">
        {children}
      </ul>
      {expanded && hasMore && (
        <p className={styles.moreHint}>
          فقط {FETCH_LIMIT} نتیجه اول نمایش داده شد؛ عبارت دقیق‌تری وارد کنید.
        </p>
      )}
    </section>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  const debounced = useDebouncedValue(query, DEBOUNCE_MS)
  const term = debounced.trim()

  useEffect(() => {
    setExpandedGroups([])
  }, [term])

  const { data, isLoading, isError, refetch } = useGlobalSearch(term, FETCH_LIMIT)

  const isExpanded = (group: string) => expandedGroups.includes(group)
  const expand = (group: string) => {
    setExpandedGroups(previous => (previous.includes(group) ? previous : [...previous, group]))
  }
  const visibleCount = (group: string) => (isExpanded(group) ? FETCH_LIMIT : GROUP_LIMIT)

  const customers = data?.customers.items.slice(0, visibleCount('customers')) ?? []
  const services = data?.services.items.slice(0, visibleCount('services')) ?? []
  const appointments = data?.appointments.items.slice(0, visibleCount('appointments')) ?? []
  const formulas = data?.formulas.items.slice(0, visibleCount('formulas')) ?? []
  const total = data
    ? data.customers.items.length +
      data.services.items.length +
      data.appointments.items.length +
      data.formulas.items.length
    : 0

  return (
    <div className={styles.page} dir="rtl">
      <PageHeader title="جست‌وجو" backTo="/dashboard" />

      <div className={styles.searchWrap}>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="نام، شماره، خدمت یا فرمول…"
          autoFocus
        />
      </div>

      <div className={styles.body}>
        {!term ? (
          <EmptyState
            icon="🔎"
            title="چه چیزی را جست‌وجو می‌کنید؟"
            description="نام مشتری، شماره تلفن، خدمت، نوبت یا فرمول رنگ"
          />
        ) : isLoading ? (
          <LoadingScreen message="در حال جست‌وجو…" />
        ) : isError ? (
          <div className={styles.errorState} role="alert">
            <p>جست‌وجو انجام نشد.</p>
            <Button
              size="sm"
              onClick={() => {
                void refetch()
              }}
            >
              تلاش دوباره
            </Button>
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon="🔍"
            title="نتیجه‌ای پیدا نشد"
            description={`برای «${term}» چیزی پیدا نشد.`}
          />
        ) : (
          <>
            <p className={styles.count}>{total.toLocaleString('fa-IR')} نتیجه</p>

            {customers.length > 0 && data && (
              <ResultGroup
                title="مشتریان"
                icon="👤"
                hasMore={data.customers.has_more || data.customers.items.length > GROUP_LIMIT}
                expanded={isExpanded('customers')}
                onExpand={() => expand('customers')}
              >
                {customers.map(customer => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        void navigate(`/customers/${customer.id}`)
                      }}
                      aria-label={`مشتری ${customer.name}`}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {customer.name.charAt(0)}
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{customer.name}</span>
                        {customer.phone && (
                          <span className={styles.rowMeta} dir="ltr">
                            {customer.phone}
                          </span>
                        )}
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        ‹
                      </span>
                    </button>
                  </li>
                ))}
              </ResultGroup>
            )}

            {services.length > 0 && data && (
              <ResultGroup
                title="خدمات"
                icon="✂️"
                hasMore={data.services.has_more || data.services.items.length > GROUP_LIMIT}
                expanded={isExpanded('services')}
                onExpand={() => expand('services')}
              >
                {services.map(service => (
                  <li key={service.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        void navigate('/settings/services')
                      }}
                      aria-label={`خدمت ${service.name}`}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        ✂️
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{service.name}</span>
                        <span className={styles.rowMeta}>
                          {service.default_price != null && (
                            <span>{formatToman(service.default_price)}</span>
                          )}
                          {!service.is_active && <span className={styles.inactive}>غیرفعال</span>}
                        </span>
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        ‹
                      </span>
                    </button>
                  </li>
                ))}
              </ResultGroup>
            )}

            {appointments.length > 0 && data && (
              <ResultGroup
                title="نوبت‌ها"
                icon="📅"
                hasMore={data.appointments.has_more || data.appointments.items.length > GROUP_LIMIT}
                expanded={isExpanded('appointments')}
                onExpand={() => expand('appointments')}
              >
                {appointments.map(appointment => (
                  <li key={appointment.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        void navigate(`/appointments/${appointment.id}`)
                      }}
                      aria-label={`نوبت ${appointment.title}`}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        📅
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{appointment.title}</span>
                        <span className={styles.rowMeta}>
                          {appointment.customer_name && <span>{appointment.customer_name}</span>}
                          <span>{formatJalaliDate(appointment.start_at)}</span>
                          <span>{formatTime(appointment.start_at)}</span>
                          <span
                            className={styles.status}
                            style={{
                              background: STATUS_COLORS[appointment.status] + '22',
                              color: STATUS_COLORS[appointment.status],
                            }}
                          >
                            {STATUS_LABELS[appointment.status]}
                          </span>
                        </span>
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        ‹
                      </span>
                    </button>
                  </li>
                ))}
              </ResultGroup>
            )}

            {formulas.length > 0 && data && (
              <ResultGroup
                title="فرمول‌های رنگ"
                icon="🎨"
                hasMore={data.formulas.has_more || data.formulas.items.length > GROUP_LIMIT}
                expanded={isExpanded('formulas')}
                onExpand={() => expand('formulas')}
              >
                {formulas.map(formula => (
                  <li key={formula.id}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        void navigate(`/color-formulas/${formula.id}`)
                      }}
                      aria-label={`فرمول ${formula.title}`}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        🎨
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTitle}>{formula.title}</span>
                        <span className={styles.rowMeta}>
                          {formula.brand && <span>{formula.brand}</span>}
                          {formula.color_code && (
                            <span className={styles.code} dir="ltr">
                              {formula.color_code}
                            </span>
                          )}
                          {formula.customer_name && <span>👤 {formula.customer_name}</span>}
                        </span>
                      </span>
                      <span className={styles.arrow} aria-hidden="true">
                        ‹
                      </span>
                    </button>
                  </li>
                ))}
              </ResultGroup>
            )}
          </>
        )}
      </div>
    </div>
  )
}

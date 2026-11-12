import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCustomerSearch,
  useCreateCustomer,
} from './customers.hooks'
import { CustomerForm } from './CustomerForm'
import { SearchBar } from '@shared/components/ui/SearchBar'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { Button } from '@shared/components/ui/Button'
import { Modal } from '@shared/components/ui/Modal'
import { LoadingScreen } from '@shared/components/ui/LoadingScreen'
import type { CustomerFormData } from './customers.schemas'
import styles from './CustomersPage.module.css'

export default function CustomersPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: customers, isLoading, error } = useCustomerSearch(query)
  const createMutation = useCreateCustomer()

  const handleCreate = async (data: CustomerFormData) => {
    await createMutation.mutateAsync(data)
    setShowAddModal(false)
  }

  if (isLoading) return <LoadingScreen message="در حال بارگذاری مشتریان…" />

  if (error) {
    return (
      <div className={styles.errorState}>
        <p>خطا در بارگذاری مشتریان</p>
        <p className={styles.errorDetail}>{String(error)}</p>
      </div>
    )
  }

  return (
    <div className={styles.page} dir="rtl">
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>مشتریان</h1>
        <Button
          size="sm"
          onClick={() => setShowAddModal(true)}
          aria-label="افزودن مشتری جدید"
        >
          + مشتری
        </Button>
      </header>

      {/* Search */}
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="جست‌وجو با نام یا شماره…"
      />

      {/* Count */}
      {!query && customers && customers.length > 0 && (
        <p className={styles.countLabel}>{customers.length} مشتری</p>
      )}

      {/* List */}
      {customers && customers.length === 0 ? (
        <EmptyState
          icon="👥"
          title={query ? 'نتیجه‌ای پیدا نشد' : 'هنوز مشتری ندارید'}
          description={
            query
              ? 'با عبارت دیگری جست‌وجو کنید'
              : 'اولین مشتری خود را اضافه کنید'
          }
          action={
            !query ? (
              <Button onClick={() => setShowAddModal(true)}>+ مشتری جدید</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className={styles.list} role="list">
          {customers?.map(customer => (
            <li key={customer.id} className={styles.listItem}>
              <button
                className={styles.customerBtn}
                onClick={() => { void navigate(`/customers/${customer.id}`) }}
                aria-label={`مشاهده پرونده ${customer.name}`}
              >
                {/* Avatar */}
                <div className={styles.avatar} aria-hidden="true">
                  {customer.name.charAt(0)}
                </div>

                {/* Info */}
                <div className={styles.info}>
                  <span className={styles.name}>{customer.name}</span>
                  {customer.phone && (
                    <span className={styles.phone} dir="ltr">
                      {customer.phone}
                    </span>
                  )}
                </div>

                <span className={styles.arrow} aria-hidden="true">‹</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add customer modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="مشتری جدید"
      >
        <CustomerForm
          onSubmit={handleCreate}
          onCancel={() => setShowAddModal(false)}
          submitLabel="افزودن مشتری"
        />
      </Modal>
    </div>
  )
}

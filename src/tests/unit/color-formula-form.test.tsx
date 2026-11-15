import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ColorFormulaForm } from '@features/color-formulas/ColorFormulaForm'

vi.mock('@features/customers/customers.hooks', () => ({
  useCustomers: () => ({ data: [{ id: 'c1', name: 'سارا' }] }),
}))

vi.mock('@features/color-formulas/color-formulas.hooks', () => ({
  useCustomerVisits: () => ({ data: [] }),
}))

describe('ColorFormulaForm', () => {
  it('یک فرمول با قلم مواد را فقط یک بار ارسال می‌کند', async () => {
    let release: () => void = () => {}
    const onSubmit = vi.fn(
      (_data: unknown) =>
        new Promise<void>(resolve => {
          release = resolve
        })
    )

    const { container } = render(
      <ColorFormulaForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="ثبت فرمول" />
    )

    fireEvent.change(screen.getByLabelText(/عنوان فرمول/), {
      target: { value: 'بلوند دکولوره' },
    })
    fireEvent.change(screen.getByLabelText('نام محصول 1'), {
      target: { value: 'پودر دکولوره' },
    })
    fireEvent.change(screen.getByLabelText('مقدار 1'), { target: { value: '12.5' } })

    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'بلوند دکولوره',
      customer_id: null,
      items: [{ product_name: 'پودر دکولوره', amount: 12.5, unit: 'g' }],
    })

    await act(() => {
      release()
      return Promise.resolve()
    })
  })
})

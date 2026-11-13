import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppointmentForm } from '@features/appointments/AppointmentForm'

vi.mock('@features/customers/customers.hooks', () => ({
  useCustomers: () => ({ data: [] }),
}))

vi.mock('@features/services/services.hooks', () => ({
  useServices: () => ({ data: [] }),
}))

describe('AppointmentForm', () => {
  it('submits only once when the form is submitted twice quickly', async () => {
    let release: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        })
    )

    const { container } = render(
      <AppointmentForm onSubmit={onSubmit} onCancel={vi.fn()} submitLabel="ثبت نوبت" />
    )

    fireEvent.change(screen.getByLabelText(/عنوان نوبت/), { target: { value: 'کوتاهی' } })
    fireEvent.change(screen.getByPlaceholderText('نام خدمت *'), {
      target: { value: 'کوتاهی' },
    })

    const form = container.querySelector('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

    await act(() => {
      release()
      return Promise.resolve()
    })
  })
})

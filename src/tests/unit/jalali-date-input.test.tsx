import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { JalaliDateInput } from '@shared/components/forms/JalaliDateInput'

function renderInput(value: string, onChange = vi.fn()) {
  render(<JalaliDateInput label="تاریخ" value={value} onChange={onChange} />)
  return {
    onChange,
    year: screen.getByLabelText<HTMLSelectElement>('سال'),
    month: screen.getByLabelText<HTMLSelectElement>('ماه'),
    day: screen.getByLabelText<HTMLSelectElement>('روز'),
  }
}

describe('JalaliDateInput', () => {
  it('shows the Jalali parts of a Gregorian storage value', () => {
    const { year, month, day } = renderInput('2026-11-12')
    // 2026-11-12 == 1405/08/21
    expect(year.value).toBe('1405')
    expect(month.value).toBe('8')
    expect(day.value).toBe('21')
  })

  it('emits the Gregorian date when the month changes', () => {
    const { onChange, month } = renderInput('2026-11-12')
    // Azar 21, 1405 == 2026-12-12
    fireEvent.change(month, { target: { value: '9' } })
    expect(onChange).toHaveBeenCalledWith('2026-12-12')
  })

  it('clamps the day when the target month is shorter', () => {
    // 1403/12/30 (leap year) == 2025-03-20; 1404 Esfand has 29 days.
    const { onChange, year, day } = renderInput('2025-03-20')
    expect(day.value).toBe('30')

    fireEvent.change(year, { target: { value: '1404' } })
    expect(onChange).toHaveBeenCalledWith('2026-03-20')
  })

  it('shows an error message with an alert role', () => {
    render(
      <JalaliDateInput
        label="تاریخ"
        value="2026-11-12"
        onChange={vi.fn()}
        error="تاریخ الزامی است"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('تاریخ الزامی است')
  })
})

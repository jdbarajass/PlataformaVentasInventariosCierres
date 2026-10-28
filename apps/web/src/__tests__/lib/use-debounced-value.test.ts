import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from '@/lib/use-debounced-value'

describe('useDebouncedValue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no entrega las fechas intermedias mientras se digita, solo la final', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 500), {
      initialProps: { v: '2026-10-27' },
    })
    expect(result.current).toBe('2026-10-27')

    // Digitando el mes del 21/10/2026: pasa por 21/01 antes de llegar a 21/10.
    rerender({ v: '2026-01-21' })
    act(() => { vi.advanceTimersByTime(200) })
    rerender({ v: '2026-10-21' })
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe('2026-10-27') // todavía no se asienta

    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe('2026-10-21') // nunca pasó por 2026-01-21
  })
})

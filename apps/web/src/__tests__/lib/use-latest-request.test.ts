import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLatestRequest } from '@/lib/use-latest-request'

describe('useLatestRequest', () => {
  it('una respuesta vieja que llega de última no pisa a la más reciente', async () => {
    const { result } = renderHook(() => useLatestRequest())
    let shown = ''

    // Simula escribir la fecha a mano: 21/01 (intermedia, lenta) y 21/10 (final, rápida).
    const load = async (date: string, ms: number) => {
      const isStale = result.current()
      await new Promise((r) => setTimeout(r, ms))
      if (isStale()) return
      shown = date
    }

    await Promise.all([load('2026-01-21', 30), load('2026-10-21', 5)])

    expect(shown).toBe('2026-10-21')
  })

  it('devuelve la misma función entre renders (segura como dependencia de useCallback)', () => {
    const { result, rerender } = renderHook(() => useLatestRequest())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

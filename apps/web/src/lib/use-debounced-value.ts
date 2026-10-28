import { useEffect, useState } from 'react'

// Devuelve `value` solo cuando deja de cambiar durante `delayMs`. Pensado
// para filtros de fecha que buscan solos: al digitar la fecha a mano en un
// <input type="date">, el valor pasa por fechas intermedias (21/01 → 21/10)
// y sin esto cada una disparaba su propia búsqueda (y mostraba por un
// instante datos de la fecha intermedia). Así se busca una sola vez, cuando
// se termina de escribir, sin necesidad de un botón "Consultar" que se pueda
// olvidar. Complementa a useLatestRequest, que sigue descartando respuestas
// viejas si de todas formas se cruzan dos búsquedas.
export const DATE_FILTER_DEBOUNCE_MS = 500

export function useDebouncedValue<T>(value: T, delayMs: number = DATE_FILTER_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

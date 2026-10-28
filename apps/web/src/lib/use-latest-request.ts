import { useCallback, useRef } from 'react'

// Evita que una respuesta vieja pise a una nueva cuando una pantalla busca
// sola al cambiar un filtro (típicamente una fecha). Al escribir la fecha a
// mano en un <input type="date">, el valor pasa por fechas intermedias
// (ej. 21/01 → 21/10) y cada una dispara su propia búsqueda; si la de la
// fecha intermedia responde de última, la pantalla mostraba datos de otro
// día con el título del día correcto (bug reportado en Ventas del Día).
//
// Uso: `const beginSales = useLatestRequest()`; dentro del fetch,
// `const isStale = beginSales()` antes de pedir los datos y
// `if (isStale()) return` después de cada `await`, antes de cualquier set*.
export function useLatestRequest() {
  const counter = useRef(0)
  return useCallback(() => {
    const id = ++counter.current
    return () => id !== counter.current
  }, [])
}

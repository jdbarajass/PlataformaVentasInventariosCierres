// ¿El nombre de un ítem "fuera de catálogo" corresponde a un producto que SÍ
// está en el catálogo? (auditoría B10, 2026-11-27)
//
// Decisión del usuario (2026-10-31): el ítem manual se permite sin pedir
// confirmación, porque revender productos de otros locales es una venta
// legítima. Pero si se vende así un producto propio, el inventario no baja.
// Registrar Venta usa esta función para AVISAR (sin bloquear) y ofrecer el
// producto del catálogo.

const DIACRITICOS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g')

/** Minúsculas, sin tildes, solo letras y números separados por un espacio. */
export function normalizarNombre(texto: string): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Devuelve el producto del catálogo que coincide con el nombre escrito, o null.
 * Coincide si el nombre es igual (sin tildes ni mayúsculas), o si tiene al menos
 * dos palabras y todas están en el nombre del producto (ej. "casco xone" →
 * "CASCO XONE 500"). Con varias coincidencias gana la igual y, si no, la de
 * nombre más corto (la más parecida).
 */
export function buscarCoincidenciaCatalogo<T extends { title: string }>(nombre: string, productos: T[]): T | null {
  const buscado = normalizarNombre(nombre)
  if (buscado.length < 4) return null
  const palabras = buscado.split(' ')

  let mejor: T | null = null
  let mejorLargo = Infinity
  for (const producto of productos) {
    const titulo = normalizarNombre(producto.title)
    if (!titulo) continue
    if (titulo === buscado) return producto
    const palabrasTitulo = new Set(titulo.split(' '))
    const todas = palabras.length >= 2 && palabras.every((p) => palabrasTitulo.has(p))
    if (todas && titulo.length < mejorLargo) {
      mejor = producto
      mejorLargo = titulo.length
    }
  }
  return mejor
}

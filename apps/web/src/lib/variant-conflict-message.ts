// Traduce un error 23505 (unique_violation) de Postgres al crear/editar una
// fila de product_variants a un mensaje específico según cuál restricción
// se violó — antes ambos casos (talla repetida vs. código de barras
// repetido) mostraban el mismo texto genérico, lo que confundía: un usuario
// creando la talla "S" (que no existía) veía "ya existe" y asumía que era
// un bug, cuando en realidad el CÓDIGO de barras coincidía con el de otra
// talla del mismo producto.
export function variantConflictMessage(error: { message?: string; details?: string }): string {
  const text = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  if (text.includes('barcode')) {
    return 'Ese código de barras ya lo tiene otra talla — usa uno distinto (o borra el campo para que se sugiera uno nuevo).'
  }
  if (text.includes('talla')) {
    return 'Esta talla ya existe para este producto.'
  }
  return 'Ya existe una variante con esa talla o ese código de barras'
}

// Parser de órdenes de DISTRIFABRICA RAMIREZ SAS (SHAFT / SHAFT PRO / HRO / ICH).
// Puerto fiel de VENTAS_YJBMOTOCOM/services/pdf_distrifabrica_parser.py,
// adaptado a como pdf-parse (Node) extrae este PDF: cada ítem inicia con
// "<N>[<codigo>] CASCO ..." y la talla puede quedar pegada sin espacio a la
// cantidad (ej. "T L1" = talla L, cantidad 1) cuando la descripción es corta.

export interface DistrifabricaRawItem {
  descripcion: string
  talla: string
  precioUnitario: number
  dctoPct: number
  cantidad: number
  costoSinIva: number
  codigoProveedor: string
}

const ITEM_START_RE = /^(\d+)\[(\d+)\]\s+(CASCO.+)$/i
const NUM_BLOCK_RE = /^(\d{1,3}(?:\.\d{3})*,\d{2})(\d{1,3},\d{2})19%\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/
const TALLA_FIN_RE = /\bT\s+(XS|S|M|L|XL|2XL)(\d*)$/i
const DIGITS_RE = /^\d+$/

export function parseDistrifabrica(text: string): DistrifabricaRawItem[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const items: DistrifabricaRawItem[] = []
  let i = 0

  while (i < lines.length) {
    const m = lines[i].match(ITEM_START_RE)
    if (!m) {
      i++
      continue
    }
    const codigoProveedor = m[2]
    const descParts = [m[3]]
    i++

    // Escanea hacia adelante hasta que el texto acumulado termine en
    // "T <talla>" — a veces la cantidad queda pegada sin espacio (ej. "T L1").
    let talla = ''
    let cantidadInline: number | null = null
    let descFinal = ''
    let guard = 0
    while (guard < 6) {
      const fullSoFar = descParts.join(' ').replace(/\s+/g, ' ').trim()
      const tm = fullSoFar.match(TALLA_FIN_RE)
      if (tm) {
        talla = tm[1].toUpperCase()
        if (tm[2]) cantidadInline = parseInt(tm[2], 10)
        descFinal = fullSoFar.slice(0, tm.index).trim()
        break
      }
      if (i >= lines.length) break
      descParts.push(lines[i])
      i++
      guard++
    }
    if (!talla || !/CASCO/i.test(descFinal)) continue

    let cantidad: number
    if (cantidadInline !== null) {
      cantidad = cantidadInline
    } else if (i < lines.length && DIGITS_RE.test(lines[i])) {
      cantidad = parseInt(lines[i], 10)
      i++
    } else {
      cantidad = 1
    }
    if (i < lines.length && lines[i].toLowerCase() === 'unidades') i++
    if (i >= lines.length) break
    const numMatch = lines[i].match(NUM_BLOCK_RE)
    if (!numMatch) continue
    i++

    const precioUnitario = parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.'))
    const dctoPct = parseFloat(numMatch[2].replace(',', '.'))
    const importe = parseFloat(numMatch[3].replace(/\./g, '').replace(',', '.'))

    const costoUnit =
      cantidad > 0 && importe > 0
        ? Math.round((importe / cantidad) * 100) / 100
        : Math.round(((precioUnitario * (1 - dctoPct / 100)) / 1.19) * 100) / 100

    items.push({
      descripcion: generarNombre(descFinal),
      talla,
      precioUnitario,
      dctoPct,
      cantidad,
      costoSinIva: costoUnit,
      codigoProveedor,
    })
  }

  return items
}

// "CASCO INT SHAFT 560 EVO..." -> "CASCO SHAFT 560 EVO..." (quita el tipo
// INT/MUL/ABT, que no aporta información comercial — igual que el local).
function generarNombre(desc: string): string {
  const nombre = desc.replace(/CASCO\s+(?:INT|MUL|ABT)\s+/i, 'CASCO ')
  return nombre.trim().toUpperCase()
}

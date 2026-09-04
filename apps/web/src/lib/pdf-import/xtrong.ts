// Parser de facturas/pedidos de ACCESORIOS PARA MOTOS S.A.S. (XTRONG).
// Puerto fiel de VENTAS_YJBMOTOCOM/services/pdf_pedido_parser.py, adaptado a
// como pdf-parse (Node) extrae el texto de este PDF — a diferencia de pypdf
// (Python), cada campo de la fila de datos queda en su PROPIA línea en vez de
// una sola línea concatenada, así que el parseo es secuencial (mirar hacia
// adelante 4 líneas: VALOR, PRECIO, DCTO%, CODIGO) en vez de un único regex
// por línea. La cantidad NUNCA se lee de la columna CANT./IVA combinada (que
// queda ilegible tras la extracción, ej. "191" = IVA 19% + CANT 1) — se
// recalcula como VALOR ÷ costo_unitario, igual que el software local.

const TALLAS_VALIDAS = new Set(['XS', 'S', 'M', 'L', 'XL', '2XL'])
const TALLA_DIGITO: Record<string, string> = { XS: '1', S: '2', M: '3', L: '4', XL: '5', '2XL': '6' }
const PREFIJO_XTRONG = '1106'

const MODEL_DISPLAY: Record<string, string> = {
  DREXO: 'GP 80 XTR-DREXO',
  M70: 'M70',
  M69: 'M69',
  '902': '902',
  '820': '820',
  R1: 'R1',
}

import { BRAND } from '@/config/brand'

const RUIDO_RE = /\b(?:SET|ECE-\w+|XTRONG(?:-GP)?|FLY|SP|FOTO-\S+|RACING)\b|\bVISOR\s+\S+/gi

// El nombre del comprador (este negocio) aparece impreso en el encabezado
// del PDF del proveedor — se filtra junto con el resto del ruido de cabecera.
const HEADER_RE = new RegExp(
  `ACCESORIOS PARA MOTOS|${escapeRegExp(BRAND.name)}|BOGOT|NIT\\.|TEL[EÉ]FONO|VENDEDOR|SE[NÑ]ORES|EMAIL|PEDIDOS|DIRECCI[OÓ]N|CIUDAD|DEPENDEN|RECIB[IÍ] CONFORME|OBSERVACIONES|BRUTO|DESCUENTO|SUBTOTAL|IVA:|NETO|FECHA|pag:|CANT\\.|VALOR|PRECIO|C[OÓ]DIGO|PORCENTAJE|RTE\\.|TOTAL`,
  'i'
)

const PRICE_RE = /^\d{1,3}(?:,\d{3})+$/
const PCT_RE = /^\d+(?:\.\d+)?%$/
const DIGITS_RE = /^\d+$/

export interface XtrongRawItem {
  modeloPdf: string
  talla: string
  precioConIva: number
  costoSinIva: number
  dctoPct: number
  cantidad: number
  codigoProveedor: string
  nombreSugerido: string
  colorKey: string
}

export function parseXtrong(text: string): XtrongRawItem[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const items: XtrongRawItem[] = []

  for (let i = 0; i + 3 < lines.length; i++) {
    if (
      !(
        PRICE_RE.test(lines[i]) &&
        PRICE_RE.test(lines[i + 1]) &&
        PCT_RE.test(lines[i + 2]) &&
        DIGITS_RE.test(lines[i + 3])
      )
    ) {
      continue
    }

    const valor = parseFloat(lines[i].replace(/,/g, ''))
    const precio = parseFloat(lines[i + 1].replace(/,/g, ''))
    const dctoPct = parseFloat(lines[i + 2].replace('%', ''))

    // Backward scan: reconstruye descripción + talla mirando hacia atrás
    // desde el bloque de datos, igual que _parsear_texto en Python.
    let talla = ''
    const descPartes: string[] = []
    let j = i - 1
    let steps = 0
    while (j >= 0 && steps < 6) {
      const ln = lines[j]
      if (PRICE_RE.test(ln) || PCT_RE.test(ln) || DIGITS_RE.test(ln)) break
      if (HEADER_RE.test(ln)) break
      if (TALLAS_VALIDAS.has(ln) && !talla) {
        talla = ln
        j--
        steps++
        continue
      }
      const palabras = ln.split(/\s+/)
      const last = palabras[palabras.length - 1]
      if (TALLAS_VALIDAS.has(last) && !talla) {
        talla = last
        const resto = palabras.slice(0, -1).join(' ').trim()
        if (resto) descPartes.unshift(resto)
        j--
        steps++
        continue
      }
      descPartes.unshift(ln)
      j--
      steps++
    }

    const descripcionRaw = descPartes.join(' ').trim()
    const modMatch = descripcionRaw.match(/XTR-(\w+)/i)
    if (!(modMatch && talla)) continue

    const modeloPdf = `XTR-${modMatch[1].toUpperCase()}`
    const costoUnit = Math.round((precio / 1.19) * 100) / 100
    const cantidad = costoUnit > 0 ? Math.max(1, Math.round(valor / costoUnit)) : 1

    const nombreSugerido = generarNombre(modeloPdf, descripcionRaw, talla)
    const colorKey = generarColorKey(modeloPdf, descripcionRaw, talla)

    items.push({
      modeloPdf,
      talla,
      precioConIva: precio,
      costoSinIva: costoUnit,
      dctoPct,
      cantidad,
      codigoProveedor: lines[i + 3],
      nombreSugerido,
      colorKey,
    })
  }

  return items
}

function limpiarDescripcion(modeloPdf: string, descripcionRaw: string, talla: string): string {
  let desc = descripcionRaw.replace(/-\s+/g, '-')
  desc = desc.replace(new RegExp(escapeRegExp(modeloPdf), 'i'), '')
  desc = desc.replace(RUIDO_RE, ' ')
  desc = desc.replace(new RegExp(`\\b${escapeRegExp(talla)}\\b`), '')
  desc = desc.replace(/\b[A-Z]\b/g, ' ')
  return desc.replace(/\s+/g, ' ').trim().toUpperCase()
}

// A diferencia del software local (que embebía "-T:talla" en el nombre
// porque su tabla `inventario` es plana), aquí la talla vive en su propia
// columna de `product_variants`, así que el nombre no la repite.
function generarNombre(modeloPdf: string, descripcionRaw: string, talla: string): string {
  const codigo = modeloPdf.replace('XTR-', '')
  const display = MODEL_DISPLAY[codigo] || codigo
  const desc = limpiarDescripcion(modeloPdf, descripcionRaw, talla)
  return `CASCO XTRONG ${display} ${desc}`.replace(/\s+/g, ' ').trim()
}

function generarColorKey(modeloPdf: string, descripcionRaw: string, talla: string): string {
  return limpiarDescripcion(modeloPdf, descripcionRaw, talla)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Generación de códigos de barras — puerto de generar_codigos_barras()
// ---------------------------------------------------------------------------
// Estructura CB XTRONG (10 dígitos): 1106 NNN SS T (marca, modelo, sub-ref
// de color, dígito de talla). `existingBarcodes` son los barcodes XTRONG ya
// usados en product_variants (para no repetir número de modelo/sub-ref), y
// `existingModelMap` liga un código de modelo (ej. "902") al num_modelo ya
// asignado en el catálogo, a partir del título de producto existente.
export function generateXtrongBarcodes(
  items: XtrongRawItem[],
  existingBarcodes: string[],
  existingModelMap: Record<string, string>
): Map<number, string> {
  const numsModeloUsados = new Set<number>()
  const subRefsPorModelo = new Map<string, Set<number>>()

  for (const cb of existingBarcodes) {
    if (!(cb.startsWith(PREFIJO_XTRONG) && cb.length === 10)) continue
    const numMod = cb.slice(4, 7)
    numsModeloUsados.add(parseInt(numMod, 10))
    const set = subRefsPorModelo.get(numMod) || new Set<number>()
    set.add(parseInt(cb.slice(7, 9), 10))
    subRefsPorModelo.set(numMod, set)
  }

  const modeloANum: Record<string, string> = { ...existingModelMap }
  let nextModelo = (numsModeloUsados.size > 0 ? Math.max(...numsModeloUsados) : 0) + 1

  const resultado = new Map<number, string>()
  const colorASubref = new Map<string, string>()

  items.forEach((item, i) => {
    const codigo = item.modeloPdf.replace('XTR-', '')

    if (!modeloANum[codigo]) {
      modeloANum[codigo] = String(nextModelo).padStart(3, '0')
      nextModelo += 1
    }
    const numMod = modeloANum[codigo]

    const grupo = `${codigo}::${item.colorKey}`
    let subStr = colorASubref.get(grupo)
    if (!subStr) {
      const usados = subRefsPorModelo.get(numMod) || new Set<number>()
      const nextSub = (usados.size > 0 ? Math.max(...usados) : 0) + 1
      subStr = String(nextSub).padStart(2, '0')
      colorASubref.set(grupo, subStr)
      usados.add(nextSub)
      subRefsPorModelo.set(numMod, usados)
    }

    const tallaDig = TALLA_DIGITO[item.talla] || '1'
    resultado.set(i, `${PREFIJO_XTRONG}${numMod}${subStr}${tallaDig}`)
  })

  return resultado
}

export function buildXtrongModelMap(existingProducts: { title: string; barcode: string }[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of existingProducts) {
    const cb = p.barcode || ''
    if (!(cb.startsWith(PREFIJO_XTRONG) && cb.length === 10)) continue
    const nombre = (p.title || '').toUpperCase()
    for (const [code, display] of Object.entries(MODEL_DISPLAY)) {
      if (nombre.includes(display.toUpperCase()) || nombre.includes(`XTR-${code}`)) {
        map[code] = cb.slice(4, 7)
        break
      }
    }
  }
  return map
}

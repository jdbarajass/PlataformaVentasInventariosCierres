// Puerto de services/inventario_gen.py (software local VENTAS_YJBMOTOCOM).
// Genera serial y código de barras automáticos para la pestaña "Ingresar"
// de /admin/inventario. Formato del código de barras (10 dígitos):
//   CC MM NNN VV T
//   CC  — categoría (11=Casco, 12=Baúl, 13=Chaqueta, 14=Cuello, 15=Guante,
//                    16=Impermeable, 17=Audio/Intercomunicador, 18=Tech,
//                    19=Slider, 20=Parrilla, 10=Accesorios)
//   MM  — subtipo/marca más frecuente dentro de la categoría (01-99)
//   NNN — número de modelo (001-999)
//   VV  — variante/color dentro del modelo (01-99)
//   T   — dígito de talla (0=N/A, 1=XS, 2=S, 3=M, 4=L, 5=XL, 6=2XL, 7=3XL)

const CAT_PREFIJOS: Record<string, string> = {
  casco: '11',
  baul: '12',
  baúl: '12',
  chaqueta: '13',
  cuello: '14',
  guante: '15',
  impermeable: '16',
  audio: '17',
  intercomunicador: '17',
  tech: '18',
  tecnología: '18',
  tecnologia: '18',
  slider: '19',
  parrilla: '20',
  accesorio: '10',
  accesorios: '10',
}

const TALLA_DIGITO: Record<string, string> = {
  'n/a': '0',
  xs: '1',
  s: '2',
  m: '3',
  l: '4',
  xl: '5',
  '2xl': '6',
  xxl: '6',
  '3xl': '7',
}

export const TALLAS_DISPONIBLES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'N/A']

// Prefijo CC del código de barras según la categoría de la base de datos
// (slug de public.categories, ver scripts/categorias-como-yjbmotocom.sql).
// Repuestos y Lubricantes no tienen prefijo propio: con ellas se sigue
// detectando por el nombre. "Tech" (18) no tiene categoría propia.
const SLUG_A_PREFIJO: Record<string, string> = {
  accesorios: '10',
  cascos: '11',
  baules: '12',
  chaquetas: '13',
  cuellos: '14',
  guantes: '15',
  impermeables: '16',
  'audio-intercomunicadores': '17',
  sliders: '19',
  parrillas: '20',
}

export function prefijoDeCategoria(slug: string | null | undefined): string | null {
  return (slug && SLUG_A_PREFIJO[slug]) || null
}

// Slug de la categoría que se sugiere en "Ingresar" a partir del nombre.
// Solo sugiere cuando alguna palabra clave coincide — el '10' por defecto
// de detectarCategoria no cuenta como sugerencia.
export function sugerirSlugCategoria(nombre: string): string | null {
  const nombreLc = nombre.toLowerCase()
  const kw = Object.keys(CAT_PREFIJOS).find((k) => nombreLc.includes(k))
  if (!kw) return null
  const cc = CAT_PREFIJOS[kw]
  return Object.keys(SLUG_A_PREFIJO).find((s) => SLUG_A_PREFIJO[s] === cc) || null
}

export function detectarCategoria(nombre: string): string {
  const nombreLc = nombre.toLowerCase()
  for (const [kw, cc] of Object.entries(CAT_PREFIJOS)) {
    if (nombreLc.includes(kw)) return cc
  }
  return '10'
}

export function tallaADigito(talla: string): string {
  return TALLA_DIGITO[talla.toLowerCase().trim()] ?? '0'
}

// Deriva el código de barras de una talla nueva a partir de un código
// "hermano" ya existente del MISMO producto (misma categoría+subtipo+
// modelo+variante — los primeros 9 dígitos — solo cambia el último dígito
// de talla). Usado al agregar una talla a un producto que ya tiene al
// menos una variante con código válido, para no generar un modelo nuevo
// por error (ver docs/UNIFICACION_YJBMOTOCOM.md sección 58).
export function derivarCodigoBarrasHermano(codigoHermano: string, talla: string): string | null {
  if (!codigoHermano || !/^\d{10}$/.test(codigoHermano)) return null
  return `${codigoHermano.slice(0, 9)}${tallaADigito(talla)}`
}

function codigosValidos(codigos: (string | null | undefined)[]): string[] {
  return codigos.filter((c): c is string => !!c && c.length === 10 && /^\d{10}$/.test(c))
}

function mmMasFrecuente(codigos: string[]): string | null {
  if (codigos.length === 0) return null
  const freq: Record<string, number> = {}
  for (const cod of codigos) {
    const mm = cod.slice(2, 4)
    freq[mm] = (freq[mm] || 0) + 1
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
}

export function generarCodigoBarrasAuto(
  nombre: string,
  talla: string,
  codigosExistentes: (string | null | undefined)[],
  // Prefijo de la categoría elegida en el formulario; si no viene, se
  // detecta por el nombre como siempre.
  ccCategoria?: string | null
): string {
  const cc = ccCategoria || detectarCategoria(nombre)
  const tDigit = tallaADigito(talla)
  const codigosCat = codigosValidos(codigosExistentes).filter((c) => c.slice(0, 2) === cc)
  const codigosSet = new Set(codigosCat)
  const mm = mmMasFrecuente(codigosCat) || '01'
  const codigosCcmm = codigosCat.filter((c) => c.slice(2, 4) === mm)

  let nnnMax = 0
  for (const cod of codigosCcmm) {
    const n = parseInt(cod.slice(4, 7), 10)
    if (!isNaN(n) && n > nnnMax) nnnMax = n
  }
  let nnn = nnnMax + 1

  for (let iter = 0; iter < 999; iter++) {
    const nnnStr = String(nnn).padStart(3, '0')
    for (let vv = 1; vv < 100; vv++) {
      const candidato = `${cc}${mm}${nnnStr}${String(vv).padStart(2, '0')}${tDigit}`
      if (!codigosSet.has(candidato)) return candidato
    }
    nnn++
  }
  // Fallback extremadamente improbable (miles de códigos en la misma categoría/modelo)
  const fallbackNnn = String((Math.floor(Date.now() / 1000) % 999) + 1).padStart(3, '0')
  return `${cc}${mm}${fallbackNnn}01${tDigit}`
}

export function generarSiguienteSerial(skusExistentes: (string | null | undefined)[]): number {
  let maximo = 0
  for (const sku of skusExistentes) {
    const n = parseInt(String(sku ?? ''), 10)
    if (!isNaN(n) && String(n) === String(sku).trim() && n > maximo) maximo = n
  }
  return maximo + 1
}

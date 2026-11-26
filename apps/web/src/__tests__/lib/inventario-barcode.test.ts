import { describe, it, expect } from 'vitest'
import {
  generarCodigoBarrasAuto,
  prefijoDeCategoria,
  sugerirSlugCategoria,
} from '@/lib/inventario-barcode'

describe('categoría en Inventario → Ingresar', () => {
  it('sugiere la categoría por palabra clave del nombre', () => {
    expect(sugerirSlugCategoria('CASCO XTRONG M70 NEGRO MATE')).toBe('cascos')
    expect(sugerirSlugCategoria('Guante Alpinestars GP Pro')).toBe('guantes')
    expect(sugerirSlugCategoria('Intercomunicador Cardo')).toBe('audio-intercomunicadores')
    expect(sugerirSlugCategoria('Baúl Givi 45L')).toBe('baules')
  })

  it('no sugiere nada si ninguna palabra clave coincide', () => {
    expect(sugerirSlugCategoria('Llanta Michelin')).toBeNull()
    expect(sugerirSlugCategoria('')).toBeNull()
  })

  it('da el prefijo del código de barras según la categoría', () => {
    expect(prefijoDeCategoria('cascos')).toBe('11')
    expect(prefijoDeCategoria('parrillas')).toBe('20')
    expect(prefijoDeCategoria('repuestos')).toBeNull()
    expect(prefijoDeCategoria(null)).toBeNull()
  })

  it('el código de barras usa la categoría elegida aunque el nombre no la diga', () => {
    expect(generarCodigoBarrasAuto('Llanta Michelin', 'N/A', [], '11')).toMatch(/^11\d{8}$/)
  })

  it('sin categoría elegida sigue detectando por el nombre', () => {
    expect(generarCodigoBarrasAuto('Guante GP Pro', 'M', [])).toBe('1501001013')
    expect(generarCodigoBarrasAuto('Llanta Michelin', 'N/A', [], null)).toMatch(/^10/)
  })
})

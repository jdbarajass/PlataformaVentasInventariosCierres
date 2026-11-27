import { describe, it, expect } from 'vitest'
import { buscarCoincidenciaCatalogo, normalizarNombre } from '@/lib/coincidencia-catalogo'

const catalogo = [
  { id: '1', title: 'CASCO XONE 500' },
  { id: '2', title: 'CASCO XONE 500 MONTADO' },
  { id: '3', title: 'Guantes Alpinestars GP Plus' },
  { id: '4', title: 'Impermeable siliconado negro/azul' },
]

describe('normalizarNombre', () => {
  it('quita tildes, mayúsculas y signos', () => {
    expect(normalizarNombre('  Chaqueta  Térmica/NEGRA ')).toBe('chaqueta termica negra')
  })
})

describe('buscarCoincidenciaCatalogo (auditoría B10)', () => {
  it('encuentra el producto con el mismo nombre aunque cambien tildes y mayúsculas', () => {
    expect(buscarCoincidenciaCatalogo('casco xone 500', catalogo)?.id).toBe('1')
    expect(buscarCoincidenciaCatalogo('IMPERMEABLE SILICONADO NEGRO AZUL', catalogo)?.id).toBe('4')
  })

  it('con dos o más palabras que están todas en el nombre, elige el más parecido (el más corto)', () => {
    expect(buscarCoincidenciaCatalogo('Casco Xone', catalogo)?.id).toBe('1')
    expect(buscarCoincidenciaCatalogo('guantes gp plus', catalogo)?.id).toBe('3')
  })

  it('no avisa con una sola palabra suelta ni con nombres cortos', () => {
    expect(buscarCoincidenciaCatalogo('casco', catalogo)).toBeNull()
    expect(buscarCoincidenciaCatalogo('gp', catalogo)).toBeNull()
  })

  it('no avisa si alguna palabra no está en el catálogo (reventa de otro local)', () => {
    expect(buscarCoincidenciaCatalogo('casco shaft 562', catalogo)).toBeNull()
    expect(buscarCoincidenciaCatalogo('Servicio de lavado', catalogo)).toBeNull()
  })
})

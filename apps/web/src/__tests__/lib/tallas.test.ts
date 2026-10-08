import { describe, it, expect } from 'vitest'
import { compararTallas, ordenarPorTalla } from '@/lib/tallas'

describe('orden de tallas', () => {
  it('ordena tallas de letra de menor a mayor, no alfabético', () => {
    const tallas = ['2XL', 'L', 'M', 'S', 'XL', 'XS']
    expect([...tallas].sort(compararTallas)).toEqual(['XS', 'S', 'M', 'L', 'XL', '2XL'])
  })

  it('acepta prefijo "Talla", minúsculas y equivalentes XXL/XXXL', () => {
    const tallas = ['Talla XL', 'xxxl', 'talla xs', 'XXL', 'm', '3XL']
    expect([...tallas].sort(compararTallas)).toEqual(['talla xs', 'm', 'Talla XL', 'XXL', 'xxxl', '3XL'])
  })

  it('letras primero, luego numéricas, luego otras, y sin talla al final', () => {
    const tallas = [null, '42', 'N/A', 'Única', '38', 'S', '40.5']
    expect([...tallas].sort(compararTallas)).toEqual(['S', '38', '40.5', '42', 'Única', null, 'N/A'])
  })

  it('ordenarPorTalla no muta el arreglo original', () => {
    const variantes = [{ talla: 'XL' }, { talla: 'XS' }, { talla: 'M' }]
    const ordenadas = ordenarPorTalla(variantes)
    expect(ordenadas.map((v) => v.talla)).toEqual(['XS', 'M', 'XL'])
    expect(variantes.map((v) => v.talla)).toEqual(['XL', 'XS', 'M'])
  })
})

import { describe, it, expect } from 'vitest'
import {
  STOCK_MINIMO_DEFECTO,
  enStockMinimo,
  tallasEnStockMinimo,
  productoEnStockMinimo,
  getStockStatus,
} from '@/lib/utils'

describe('stock mínimo (regla única de stock bajo)', () => {
  it('el mínimo por defecto es 2', () => {
    expect(STOCK_MINIMO_DEFECTO).toBe(2)
  })

  it('sale en rojo con el mínimo o menos', () => {
    expect(enStockMinimo(3, 2)).toBe(false)
    expect(enStockMinimo(2, 2)).toBe(true)
    expect(enStockMinimo(1, 2)).toBe(true)
    expect(enStockMinimo(0, 2)).toBe(true)
  })

  it('mínimo 0 nunca avisa (tallas que no se mueven)', () => {
    expect(enStockMinimo(0, 0)).toBe(false)
    expect(enStockMinimo(5, 0)).toBe(false)
  })

  it('sin mínimo guardado usa el de por defecto', () => {
    expect(enStockMinimo(2, null)).toBe(true)
    expect(enStockMinimo(3, undefined)).toBe(false)
  })

  it('producto con tallas: basta una talla activa en su mínimo', () => {
    const producto = { stock_qty: 20, low_stock_threshold: 2 }
    const tallas = [
      { stock_qty: 10, low_stock_threshold: 2, active: true },
      { stock_qty: 1, low_stock_threshold: 2, active: true },
    ]
    expect(productoEnStockMinimo(producto, tallas)).toBe(true)
    expect(tallasEnStockMinimo(tallas)).toHaveLength(1)
  })

  it('producto con tallas: tallas con mínimo 0 o inactivas no cuentan', () => {
    const producto = { stock_qty: 10, low_stock_threshold: 2 }
    const tallas = [
      { stock_qty: 10, low_stock_threshold: 2, active: true },
      { stock_qty: 0, low_stock_threshold: 0, active: true },
      { stock_qty: 0, low_stock_threshold: 2, active: false },
    ]
    expect(productoEnStockMinimo(producto, tallas)).toBe(false)
  })

  it('producto sin tallas: su propio stock contra su mínimo', () => {
    expect(productoEnStockMinimo({ stock_qty: 2, low_stock_threshold: 2 }, [])).toBe(true)
    expect(productoEnStockMinimo({ stock_qty: 3, low_stock_threshold: 2 })).toBe(false)
  })

  it('getStockStatus de la tienda sigue la misma regla', () => {
    expect(getStockStatus(0, 2)).toBe('out-of-stock')
    expect(getStockStatus(2, 2)).toBe('low-stock')
    expect(getStockStatus(3, 2)).toBe('in-stock')
    expect(getStockStatus(1, 0)).toBe('in-stock')
  })
})

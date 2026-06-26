import { describe, it, expect } from 'vitest'
import { decrementStockAtomic } from '@/lib/inventory'
import { createSupabaseMock } from '../helpers/supabase-mock'

describe('decrementStockAtomic', () => {
  it('returns the updated row from the decrement_stock RPC', async () => {
    const { client, calls } = createSupabaseMock({}, {
      decrement_stock: {
        data: [{ id: 'p1', title: 'Casco', stock_qty: 8 }],
        error: null,
      },
    })

    const result = await decrementStockAtomic(client as any, 'p1', 2)

    expect(result).toEqual({ id: 'p1', title: 'Casco', stock_qty: 8 })
    expect(calls['rpc.decrement_stock'][0][0]).toEqual({ p_product_id: 'p1', p_qty: 2 })
  })

  it('returns null when the product does not exist', async () => {
    const { client } = createSupabaseMock({}, {
      decrement_stock: { data: [], error: null },
    })

    const result = await decrementStockAtomic(client as any, 'missing', 1)
    expect(result).toBeNull()
  })

  it('throws when the RPC call fails', async () => {
    const { client } = createSupabaseMock({}, {
      decrement_stock: { data: null, error: { message: 'function not found' } },
    })

    await expect(decrementStockAtomic(client as any, 'p1', 1)).rejects.toThrow(/function not found/)
  })
})

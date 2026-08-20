import { describe, it, expect } from 'vitest'
import { awardLoyaltyPointsForOrder, pointsForPurchase } from '@/lib/loyalty'
import { createSupabaseMock } from '../helpers/supabase-mock'

describe('pointsForPurchase', () => {
  it('da 1 punto por cada $1.000 COP (100.000 centavos)', () => {
    expect(pointsForPurchase(1_000_000)).toBe(10) // $10.000 -> 10 puntos
  })

  it('redondea hacia abajo, no da puntos por el sobrante', () => {
    expect(pointsForPurchase(150_000)).toBe(1) // $1.500 -> 1 punto, no 1.5
  })

  it('no da puntos por compras menores a $1.000', () => {
    expect(pointsForPurchase(50_000)).toBe(0)
  })
})

describe('awardLoyaltyPointsForOrder', () => {
  it('no hace nada si la orden no tiene cliente registrado (checkout de invitado)', async () => {
    const { client, calls } = createSupabaseMock({
      orders: { data: { user_id: null, total_cents: 500_000, order_number: 'YJBM-1', channel: 'online' }, error: null },
    })

    await awardLoyaltyPointsForOrder(client as any, 'order-1')

    expect(calls['rpc.award_loyalty_points']).toBeUndefined()
  })

  it('otorga los puntos correctos para una orden online con cliente registrado', async () => {
    const { client, calls } = createSupabaseMock({
      orders: { data: { user_id: 'u1', total_cents: 500_000, order_number: 'YJBM-1', channel: 'online' }, error: null },
    })

    await awardLoyaltyPointsForOrder(client as any, 'order-1')

    expect(calls['rpc.award_loyalty_points'][0][0]).toEqual({
      p_user_id: 'u1',
      p_points: 5,
      p_order_id: 'order-1',
      p_description: 'Compra YJBM-1',
    })
  })

  it('usa una descripción distinta para ventas de mostrador', async () => {
    const { client, calls } = createSupabaseMock({
      orders: { data: { user_id: 'u1', total_cents: 500_000, order_number: 'YJBM-2', channel: 'pos' }, error: null },
    })

    await awardLoyaltyPointsForOrder(client as any, 'order-2')

    expect(calls['rpc.award_loyalty_points'][0][0].p_description).toBe('Venta de mostrador YJBM-2')
  })

  it('no truena si la orden no existe (nunca debe tumbar el flujo que la llama)', async () => {
    const { client } = createSupabaseMock({
      orders: { data: null, error: { message: 'not found' } },
    })

    await expect(awardLoyaltyPointsForOrder(client as any, 'missing')).resolves.toBeUndefined()
  })
})

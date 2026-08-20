import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const requireAuthMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/order-fulfillment', () => ({
  decrementStockForOrder: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/email', () => ({
  sendOrderShipped: vi.fn(() => Promise.resolve()),
  sendOrderConfirmation: vi.fn(() => Promise.resolve()),
}))

const ADMIN_AUTH = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }

function buildRequest(body: any) {
  return new NextRequest('http://localhost/api/orders/order-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PUT /api/orders/[id] — puntos al marcar pago manual como pagado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('otorga puntos cuando se confirma un pago manual de una orden con cliente registrado', async () => {
    const { client, calls } = createSupabaseMock({
      orders: {
        data: {
          payment_status: 'pending',
          order_number: 'YJBM-3',
          user_id: 'u2',
          total_cents: 300_000,
          channel: 'online',
        },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/orders/[id]/route')
    const res = await PUT(buildRequest({ mark_paid: true }), { params: { id: 'order-1' } })

    expect(res.status).toBe(200)
    expect(calls['rpc.award_loyalty_points'][0][0]).toEqual({
      p_user_id: 'u2',
      p_points: 3,
      p_order_id: 'order-1',
      p_description: 'Compra YJBM-3',
    })
  })

  it('no intenta otorgar puntos si la orden ya estaba pagada (evita doble intento)', async () => {
    const { client, calls } = createSupabaseMock({
      orders: { data: { payment_status: 'paid', order_number: 'YJBM-4' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/orders/[id]/route')
    const res = await PUT(buildRequest({ mark_paid: true }), { params: { id: 'order-1' } })

    expect(res.status).toBe(200)
    expect(calls['rpc.award_loyalty_points']).toBeUndefined()
  })
})

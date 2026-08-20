import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const createAuthenticatedClientMock = vi.fn()
const requireAuthMock = vi.fn()
const resolveSaleMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/pos-sale', () => ({
  resolveSale: (...args: any[]) => resolveSaleMock(...args),
}))
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const ADMIN_AUTH = { success: true, user: { id: 'seller-1', email: 'vendedor@test.com', role: 'seller' }, token: 't' }

function buildRequest(body: any) {
  return new NextRequest('http://localhost/api/pos/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/pos/sales — vincular cliente registrado para puntos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    resolveSaleMock.mockResolvedValue({
      resolvedItems: [{ product_id: 'p1', qty: 1, price_cents: 300_000, total_cents: 300_000 }],
      resolvedPayments: [{ method: 'cash', amount_cents: 300_000, commission_cents: 0 }],
      subtotal_cents: 300_000,
      discount_cents: 0,
      total_cents: 300_000,
    })
  })

  const baseBody = {
    items: [{ product_id: '11111111-1111-1111-1111-111111111111', qty: 1, price_cents: 300_000 }],
    payments: [{ method: 'cash', amount_cents: 300_000 }],
  }

  it('cuando se selecciona un cliente registrado, la venta queda vinculada (user_id) y otorga puntos', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { client: serviceClient, calls: serviceCalls } = createSupabaseMock(
      {
        orders: { data: { id: 'order-1', user_id: '22222222-2222-2222-2222-222222222222', total_cents: 300_000, order_number: 'YJBM-5', channel: 'pos' }, error: null },
      },
      { create_pos_sale: { data: { id: 'order-1', order_number: 'YJBM-5' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(serviceClient)

    const { POST } = await import('@/app/api/pos/sales/route')
    const res = await POST(buildRequest({ ...baseBody, customer_user_id: '22222222-2222-2222-2222-222222222222' }))

    expect(res.status).toBe(201)
    expect(serviceCalls['rpc.create_pos_sale'][0][0].p_order.user_id).toBe('22222222-2222-2222-2222-222222222222')
    expect(serviceCalls['rpc.award_loyalty_points'][0][0]).toEqual({
      p_user_id: '22222222-2222-2222-2222-222222222222',
      p_points: 3,
      p_order_id: 'order-1',
      p_description: 'Venta de mostrador YJBM-5',
    })
  })

  it('sin cliente seleccionado, la venta se registra igual que siempre, sin puntos', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { client: serviceClient, calls: serviceCalls } = createSupabaseMock(
      {
        orders: { data: { id: 'order-2', user_id: null, total_cents: 300_000, order_number: 'YJBM-6', channel: 'pos' }, error: null },
      },
      { create_pos_sale: { data: { id: 'order-2', order_number: 'YJBM-6' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(serviceClient)

    const { POST } = await import('@/app/api/pos/sales/route')
    const res = await POST(buildRequest(baseBody))

    expect(res.status).toBe(201)
    expect(serviceCalls['rpc.create_pos_sale'][0][0].p_order.user_id).toBeNull()
    expect(serviceCalls['rpc.award_loyalty_points']).toBeUndefined()
  })
})

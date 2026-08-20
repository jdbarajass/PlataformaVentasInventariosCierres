import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const createAuthenticatedClientMock = vi.fn()
const requireAuthMock = vi.fn()
const checkRateLimitMock = vi.fn((..._args: any[]) => null)

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: any[]) => checkRateLimitMock(...args),
}))

const VIEWER_AUTH = { success: true, user: { id: 'u1', email: 'cliente@test.com', role: 'viewer' }, token: 't' }

describe('GET /api/loyalty', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('devuelve el saldo y el historial del cliente autenticado', async () => {
    requireAuthMock.mockResolvedValue(VIEWER_AUTH)
    const { client } = createSupabaseMock({
      users: { data: { loyalty_points_balance: 350 }, error: null },
      loyalty_points_ledger: { data: [{ id: 'l1', points: 50, type: 'earn' }], error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/loyalty/route')
    const res = await GET(new NextRequest('http://localhost/api/loyalty'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.balance).toBe(350)
    expect(body.data.ledger).toHaveLength(1)
  })

  it('401 sin sesión', async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    const { GET } = await import('@/app/api/loyalty/route')
    const res = await GET(new NextRequest('http://localhost/api/loyalty'))

    expect(res.status).toBe(401)
  })
})

function buildRedeemRequest(body: any) {
  return new NextRequest('http://localhost/api/loyalty/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/loyalty/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(VIEWER_AUTH)
    checkRateLimitMock.mockReturnValue(null)
  })

  it('rechaza canjear menos de 100 puntos', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loyalty/redeem/route')
    const res = await POST(buildRedeemRequest({ points: 50 }))

    expect(res.status).toBe(400)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una cantidad que no sea múltiplo de 100', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loyalty/redeem/route')
    const res = await POST(buildRedeemRequest({ points: 150 }))

    expect(res.status).toBe(400)
  })

  it('canjea 200 puntos por un cupón de $2.000 de descuento, siempre sobre el propio usuario autenticado', async () => {
    const { client, calls } = createSupabaseMock({}, {
      redeem_loyalty_points_for_coupon: {
        data: { id: 'coupon-1', code: 'PUNTOS-ABC123', discount_value: 2_000 },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loyalty/redeem/route')
    const res = await POST(buildRedeemRequest({ points: 200 }))

    expect(res.status).toBe(201)
    const rpcArgs = calls['rpc.redeem_loyalty_points_for_coupon'][0][0]
    expect(rpcArgs.p_user_id).toBe('u1') // el del token autenticado, no uno inventado
    expect(rpcArgs.p_points).toBe(200)
    expect(rpcArgs.p_discount_cents).toBe(200_000) // 200 * 1.000 centavos por punto
  })

  it('responde 400 legible cuando el saldo de puntos no alcanza', async () => {
    const { client } = createSupabaseMock({}, {
      redeem_loyalty_points_for_coupon: {
        data: null,
        error: { message: 'Puntos insuficientes' },
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loyalty/redeem/route')
    const res = await POST(buildRedeemRequest({ points: 100_000 }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no tienes suficientes puntos/i)
  })
})

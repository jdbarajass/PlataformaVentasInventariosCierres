import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const checkRateLimitMock = vi.fn((..._args: any[]) => null)
const sendWelcomeCouponEmailMock = vi.fn((..._args: any[]) => Promise.resolve(true))

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: any[]) => checkRateLimitMock(...args),
}))
vi.mock('@/lib/email', () => ({
  sendWelcomeCouponEmail: (...args: any[]) => sendWelcomeCouponEmailMock(...args),
}))

function buildRequest(body: any) {
  return new NextRequest('http://localhost/api/coupons/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/coupons/welcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimitMock.mockReturnValue(null)
  })

  it('exige user_id', async () => {
    const { POST } = await import('@/app/api/coupons/welcome/route')
    const res = await POST(buildRequest({}))

    expect(res.status).toBe(400)
  })

  it('404 si el usuario no existe', async () => {
    const { client } = createSupabaseMock({
      users: { data: null, error: { message: 'not found' } },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/coupons/welcome/route')
    const res = await POST(buildRequest({ user_id: 'missing' }))

    expect(res.status).toBe(404)
  })

  it('crea un cupón de un solo uso, 10% de descuento, sin monto mínimo, y envía el email', async () => {
    // users.single() (lookup) y coupons.single() (¿ya existe? -> no, luego
    // insert) van por tablas distintas, así que sí puede modelarse con el
    // helper compartido (una respuesta fija por tabla) — pero coupons se
    // consulta dos veces (maybeSingle de "¿existe?" y luego el insert). Se
    // arma un mock manual para esa tabla igual que en daily-closures.test.ts.
    let couponSingleCalls = 0
    const insertedCoupons: any[] = []
    const couponsChain: any = {}
    couponsChain.select = vi.fn(() => couponsChain)
    couponsChain.eq = vi.fn(() => couponsChain)
    couponsChain.insert = vi.fn((data: any) => {
      insertedCoupons.push(data)
      return couponsChain
    })
    couponsChain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
    couponsChain.single = vi.fn(() => {
      couponSingleCalls += 1
      return Promise.resolve({
        data: { id: 'c1', code: insertedCoupons[0]?.code, ...insertedCoupons[0] },
        error: null,
      })
    })
    const usersChain: any = {}
    usersChain.select = vi.fn(() => usersChain)
    usersChain.eq = vi.fn(() => usersChain)
    usersChain.single = vi.fn(() =>
      Promise.resolve({ data: { id: 'u1', email: 'nueva@test.com', name: 'Nueva Clienta' }, error: null })
    )
    const client = {
      from: vi.fn((table: string) => (table === 'coupons' ? couponsChain : usersChain)),
    }
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/coupons/welcome/route')
    const res = await POST(buildRequest({ user_id: 'u1' }))

    expect(res.status).toBe(201)
    expect(couponSingleCalls).toBe(1)
    const insertArgs = insertedCoupons[0]
    expect(insertArgs.code).toMatch(/^BIENVENIDA-/)
    expect(insertArgs.discount_type).toBe('percentage')
    expect(insertArgs.discount_value).toBe(10)
    expect(insertArgs.min_purchase_cents).toBe(0)
    expect(insertArgs.max_uses).toBe(1)
    expect(insertArgs.user_id).toBe('u1')

    // La vigencia son 15 días desde ahora
    const validFrom = new Date(insertArgs.valid_from).getTime()
    const validUntil = new Date(insertArgs.valid_until).getTime()
    const days = Math.round((validUntil - validFrom) / 86_400_000)
    expect(days).toBe(15)

    expect(sendWelcomeCouponEmailMock).toHaveBeenCalledTimes(1)
    expect(sendWelcomeCouponEmailMock.mock.calls[0][0]).toMatchObject({ to: 'nueva@test.com' })
  })

  it('es idempotente: si el cliente ya tiene un cupón de bienvenida, devuelve el mismo en vez de crear otro', async () => {
    const existingCoupon = { id: 'c-existing', code: 'BIENVENIDA-ABC123', user_id: 'u1' }
    const couponsChain: any = {}
    couponsChain.select = vi.fn(() => couponsChain)
    couponsChain.eq = vi.fn(() => couponsChain)
    couponsChain.maybeSingle = vi.fn(() => Promise.resolve({ data: existingCoupon, error: null }))
    couponsChain.insert = vi.fn(() => {
      throw new Error('No debería llamarse insert si ya existe un cupón')
    })
    const usersChain: any = {}
    usersChain.select = vi.fn(() => usersChain)
    usersChain.eq = vi.fn(() => usersChain)
    usersChain.single = vi.fn(() => Promise.resolve({ data: { id: 'u1', email: 'x@test.com', name: 'X' }, error: null }))
    const client = {
      from: vi.fn((table: string) => (table === 'coupons' ? couponsChain : usersChain)),
    }
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/coupons/welcome/route')
    const res = await POST(buildRequest({ user_id: 'u1' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.code).toBe('BIENVENIDA-ABC123')
    expect(sendWelcomeCouponEmailMock).not.toHaveBeenCalled()
  })
})

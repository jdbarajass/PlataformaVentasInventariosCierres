import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const requireAuthMock = vi.fn()
const checkRateLimitMock = vi.fn((..._args: any[]) => null)
const getStoreSettingsMock = vi.fn()
const createCheckoutSessionMock = vi.fn()
const createPreferenceMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: any[]) => checkRateLimitMock(...args),
}))
vi.mock('@/lib/settings', () => ({
  getStoreSettings: () => getStoreSettingsMock(),
}))
vi.mock('@/lib/email', () => ({
  sendPaymentInstructions: vi.fn(() => Promise.resolve()),
  sendNewOrderAdmin: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/stripe-helpers', () => ({
  isStripeConfigured: () => true,
  createCheckoutSession: (...args: any[]) => createCheckoutSessionMock(...args),
}))
vi.mock('@/lib/mercadopago-helpers', () => ({
  isMercadoPagoConfigured: () => true,
  createPreference: (...args: any[]) => createPreferenceMock(...args),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const SHIPPING_CONFIG = {
  enabled: true,
  free_shipping_threshold_cents: 200_000,
  default_shipping_cost_cents: 15_000,
}

const PRODUCT = {
  id: 'p1',
  title: 'Casco Integral',
  price_cents: 50_000,
  stock_qty: 10,
  active: true,
  images: ['casco.jpg'],
}

function buildRequest(body: any) {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const baseCustomer = {
  email: 'cliente@test.com',
  name: 'Cliente Test',
  phone: '3001234567',
  address: 'Calle 1',
  city: 'Bogota',
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimitMock.mockReturnValue(null)
    getStoreSettingsMock.mockResolvedValue({ shipping_config: SHIPPING_CONFIG })
  })

  it('recomputes subtotal/shipping/total from the DB price, ignoring tampered client values', async () => {
    const { client, calls } = createSupabaseMock({
      products: { data: [PRODUCT], error: null },
    }, {
      create_order_with_items: {
        data: { id: 'order-1', order_number: 'YJBM-1', total_cents: 115_000 },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/orders/route')

    // Client tries to pay 1 cent for 2 helmets that actually cost 50,000 each.
    const res = await POST(
      buildRequest({
        items: [{ id: 'p1', qty: 2, price_cents: 1, title: 'hacked', image: 'x.jpg' }],
        customer: baseCustomer,
        payment_method: 'transfer',
        subtotal_cents: 1,
        shipping_cents: 0,
        total_cents: 1,
      })
    )

    expect(res.status).toBe(200)

    const rpcArgs = calls['rpc.create_order_with_items'][0][0]
    expect(rpcArgs.p_order.subtotal_cents).toBe(100_000) // 2 * 50,000
    expect(rpcArgs.p_order.shipping_cents).toBe(15_000) // below free-shipping threshold
    expect(rpcArgs.p_order.discount_cents).toBe(0)
    expect(rpcArgs.p_order.total_cents).toBe(115_000)
    expect(rpcArgs.p_items[0].price_cents).toBe(50_000) // DB price, not the client's 1

    const paymentArgs = calls['payments.insert'][0][0]
    expect(paymentArgs.amount_cents).toBe(115_000)
  })

  it('rejects the order when requested quantity exceeds stock', async () => {
    const { client } = createSupabaseMock({
      products: { data: [PRODUCT], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/orders/route')

    const res = await POST(
      buildRequest({
        items: [{ id: 'p1', qty: 99, price_cents: 50_000 }],
        customer: baseCustomer,
        payment_method: 'transfer',
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Stock insuficiente/i)
  })

  it('rejects the order when the product is inactive', async () => {
    const { client } = createSupabaseMock({
      products: { data: [{ ...PRODUCT, active: false }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/orders/route')

    const res = await POST(
      buildRequest({
        items: [{ id: 'p1', qty: 1 }],
        customer: baseCustomer,
        payment_method: 'transfer',
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no disponible/i)
  })

  it('recomputes the coupon discount server-side, ignoring a forged client discount', async () => {
    const { client, calls } = createSupabaseMock({
      products: { data: [PRODUCT], error: null },
      coupons: {
        data: {
          code: 'PROMO10',
          active: true,
          valid_from: null,
          valid_until: null,
          max_uses: null,
          used_count: 0,
          min_purchase_cents: 0,
          discount_type: 'percentage',
          discount_value: 10,
        },
        error: null,
      },
    }, {
      create_order_with_items: {
        data: { id: 'order-2', order_number: 'YJBM-2', total_cents: 105_000 },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/orders/route')

    const res = await POST(
      buildRequest({
        items: [{ id: 'p1', qty: 2 }],
        customer: baseCustomer,
        payment_method: 'transfer',
        coupon_code: 'PROMO10',
        discount_cents: 999_999_999, // forged — must be ignored
      })
    )

    expect(res.status).toBe(200)
    const rpcArgs = calls['rpc.create_order_with_items'][0][0]
    // subtotal 100,000 - 10% (10,000) + shipping 15,000 = 105,000
    expect(rpcArgs.p_order.discount_cents).toBe(10_000)
    expect(rpcArgs.p_order.total_cents).toBe(105_000)
  })

  it('charges Stripe a single line item equal to the recomputed total, not the per-item client price', async () => {
    const { client } = createSupabaseMock({
      products: { data: [PRODUCT], error: null },
    }, {
      create_order_with_items: {
        data: { id: 'order-3', order_number: 'YJBM-3', total_cents: 115_000 },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(client)
    createCheckoutSessionMock.mockResolvedValue({ id: 'sess_1', url: 'https://stripe.test/sess_1' })

    const { POST } = await import('@/app/api/orders/route')

    await POST(
      buildRequest({
        items: [{ id: 'p1', qty: 2, price_cents: 1 }],
        customer: baseCustomer,
        payment_method: 'card',
      })
    )

    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1)
    const sessionArgs = createCheckoutSessionMock.mock.calls[0][0]
    expect(sessionArgs.items).toHaveLength(1)
    expect(sessionArgs.items[0].price_cents).toBe(115_000)
  })

  it('rejects an empty cart', async () => {
    const { POST } = await import('@/app/api/orders/route')
    const res = await POST(buildRequest({ items: [], customer: baseCustomer, payment_method: 'transfer' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when the caller is not authenticated', async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/orders/route')
    const res = await GET(new NextRequest('http://localhost/api/orders'))

    expect(res.status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('returns orders when called by an authenticated admin', async () => {
    requireAuthMock.mockResolvedValue({
      success: true,
      user: { id: 'u1', email: 'admin@test.com', role: 'admin' },
      token: 'token',
    })
    const { client } = createSupabaseMock({
      orders: { data: [{ id: 'order-1' }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/orders/route')
    const res = await GET(new NextRequest('http://localhost/api/orders'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ id: 'order-1' }])
  })
})

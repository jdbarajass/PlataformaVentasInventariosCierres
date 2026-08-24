import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const validateStripeWebhookMock = vi.fn()
const validateMercadoPagoWebhookMock = vi.fn((..._args: any[]) => true)
const getMercadoPagoPaymentMock = vi.fn()
const markWebhookProcessedMock = vi.fn((..._args: any[]) => Promise.resolve(true))
const decrementStockAtomicMock = vi.fn()
const headersGetMock = vi.fn()

vi.mock('next/headers', () => ({
  headers: () => ({ get: (name: string) => headersGetMock(name) }),
}))
vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
}))
vi.mock('@/lib/stripe-helpers', () => ({
  validateStripeWebhook: (...args: any[]) => validateStripeWebhookMock(...args),
  mapStripePaymentStatus: (s: string) => s,
}))
vi.mock('@/lib/mercadopago-helpers', () => ({
  validateMercadoPagoWebhook: (...args: any[]) => validateMercadoPagoWebhookMock(...args),
  getMercadoPagoPayment: (...args: any[]) => getMercadoPagoPaymentMock(...args),
  mapMercadoPagoStatus: (s: string) => s,
}))
vi.mock('@/lib/webhook-idempotency', () => ({
  markWebhookProcessed: (...args: any[]) => markWebhookProcessedMock(...args),
}))
vi.mock('@/lib/inventory', () => ({
  decrementStockAtomic: (...args: any[]) => decrementStockAtomicMock(...args),
}))
vi.mock('@/lib/email', () => ({
  sendOrderConfirmation: vi.fn(() => Promise.resolve(true)),
  sendLowStockAlert: vi.fn(() => Promise.resolve()),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

function buildStripeRequest(rawBody = '{}') {
  headersGetMock.mockImplementation((name: string) => (name === 'stripe-signature' ? 'sig_test' : null))
  return new NextRequest('http://localhost/api/payments/webhook', { method: 'POST', body: rawBody })
}

describe('POST /api/payments/webhook (Stripe)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    markWebhookProcessedMock.mockResolvedValue(true)
    decrementStockAtomicMock.mockResolvedValue({ id: 'p1', title: 'Casco', stock_qty: 8, actual_deducted: 2 })
  })

  it('skips processing when the event was already handled (idempotency)', async () => {
    markWebhookProcessedMock.mockResolvedValue(false)
    validateStripeWebhookMock.mockReturnValue({
      id: 'evt_dup',
      type: 'checkout.session.completed',
      data: { object: { metadata: { order_id: 'order-1' } } },
    })
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildStripeRequest())

    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('flags and does not confirm the order when the charged amount does not match the order total', async () => {
    validateStripeWebhookMock.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_1',
          payment_intent: 'pi_1',
          amount_total: 1, // attacker-tampered session
          metadata: { order_id: 'order-1' },
        },
      },
    })
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 115_000 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const Sentry = await import('@sentry/nextjs')
    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildStripeRequest())

    const body = await res.json()
    expect(body.flagged).toBe('amount_mismatch')
    expect(calls['orders.update']).toBeUndefined()
    expect(calls['audit_logs.insert'][0][0].action).toBe('payment_amount_mismatch')
    expect(Sentry.captureMessage).toHaveBeenCalled()
  })

  it('confirms the order and decrements stock when the charged amount matches', async () => {
    validateStripeWebhookMock.mockReturnValue({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_2',
          payment_intent: 'pi_2',
          amount_total: 115_000,
          metadata: { order_id: 'order-1' },
        },
      },
    })
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 115_000 }, error: null },
      order_items: { data: [{ id: 'oi1', product_id: 'p1', qty: 2 }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildStripeRequest())

    expect(res.status).toBe(200)
    expect(calls['orders.update'][0][0]).toMatchObject({ status: 'confirmed', payment_status: 'paid' })
    expect(decrementStockAtomicMock).toHaveBeenCalledWith(client, 'p1', 2)
  })

  it('otorga puntos de fidelización cuando la orden tiene un cliente registrado', async () => {
    validateStripeWebhookMock.mockReturnValue({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_3',
          payment_intent: 'pi_3',
          amount_total: 500_000,
          metadata: { order_id: 'order-1' },
        },
      },
    })
    // awardLoyaltyPointsForOrder vuelve a consultar `orders` (user_id,
    // total_cents, order_number, channel) — el mock comparte una sola
    // respuesta fija por tabla, así que el fixture ya trae user_id.
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 500_000, user_id: 'u1', order_number: 'YJBM-1', channel: 'online' }, error: null },
      order_items: { data: [{ id: 'oi1', product_id: 'p1', qty: 1 }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/payments/webhook/route')
    const res = await POST(buildStripeRequest())

    expect(res.status).toBe(200)
    expect(calls['rpc.award_loyalty_points'][0][0]).toEqual({
      p_user_id: 'u1',
      p_points: 5,
      p_order_id: 'order-1',
      p_description: 'Compra YJBM-1',
    })
  })
})

function buildMercadoPagoRequest(parsedBody: Record<string, any>) {
  headersGetMock.mockImplementation((name: string) => (name === 'x-signature' ? 'v1=sig' : null))
  return new NextRequest('http://localhost/api/payments/mercadopago/webhook?topic=payment&id=mp_1', {
    method: 'POST',
    body: JSON.stringify(parsedBody),
  })
}

describe('POST /api/payments/mercadopago/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    markWebhookProcessedMock.mockResolvedValue(true)
    decrementStockAtomicMock.mockResolvedValue({ id: 'p1', title: 'Casco', stock_qty: 8, actual_deducted: 2 })
  })

  it('flags and does not confirm the order when the paid amount does not match the order total', async () => {
    getMercadoPagoPaymentMock.mockResolvedValue({
      id: 'mp_1',
      status: 'approved',
      external_reference: 'order-1',
      transaction_amount: 0.01, // attacker-tampered amount (in pesos)
    })
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 115_000 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const Sentry = await import('@sentry/nextjs')
    const { POST } = await import('@/app/api/payments/mercadopago/webhook/route')
    const res = await POST(buildMercadoPagoRequest({ action: 'payment.updated', data: { id: 'mp_1' } }))

    const body = await res.json()
    expect(body.flagged).toBe('amount_mismatch')
    expect(calls['orders.update']).toBeUndefined()
    expect(calls['audit_logs.insert'][0][0].action).toBe('payment_amount_mismatch')
    expect(Sentry.captureMessage).toHaveBeenCalled()
  })

  it('confirms the order and decrements stock when the paid amount matches (pesos -> cents)', async () => {
    getMercadoPagoPaymentMock.mockResolvedValue({
      id: 'mp_2',
      status: 'approved',
      external_reference: 'order-1',
      transaction_amount: 1150, // pesos; order total is 115,000 cents
    })
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 115_000 }, error: null },
      order_items: { data: [{ id: 'oi1', product_id: 'p1', qty: 2 }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/payments/mercadopago/webhook/route')
    const res = await POST(buildMercadoPagoRequest({ action: 'payment.updated', data: { id: 'mp_2' } }))

    expect(res.status).toBe(200)
    expect(calls['orders.update'][0][0]).toMatchObject({ status: 'confirmed', payment_status: 'paid' })
    expect(decrementStockAtomicMock).toHaveBeenCalledWith(client, 'p1', 2)
  })

  it('otorga puntos de fidelización cuando la orden tiene un cliente registrado', async () => {
    getMercadoPagoPaymentMock.mockResolvedValue({
      id: 'mp_3',
      status: 'approved',
      external_reference: 'order-1',
      transaction_amount: 5000, // pesos; 500.000 centavos
    })
    const { client, calls } = createSupabaseMock({
      orders: { data: { total_cents: 500_000, user_id: 'u1', order_number: 'YJBM-2', channel: 'online' }, error: null },
      order_items: { data: [{ id: 'oi1', product_id: 'p1', qty: 1 }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/payments/mercadopago/webhook/route')
    const res = await POST(buildMercadoPagoRequest({ action: 'payment.updated', data: { id: 'mp_3' } }))

    expect(res.status).toBe(200)
    expect(calls['rpc.award_loyalty_points'][0][0]).toEqual({
      p_user_id: 'u1',
      p_points: 5,
      p_order_id: 'order-1',
      p_description: 'Compra YJBM-2',
    })
  })
})

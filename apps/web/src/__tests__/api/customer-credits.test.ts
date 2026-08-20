import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const createAuthenticatedClientMock = vi.fn()
const getServiceSupabaseMock = vi.fn()
const requireAuthMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
  getServiceSupabase: () => getServiceSupabaseMock(),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const ADMIN_AUTH = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }
const SELLER_AUTH = { success: true, user: { id: 'u2', email: 'vendedor@test.com', role: 'seller' }, token: 't' }

function buildRequest(body: any, method = 'POST') {
  return new NextRequest('http://localhost/api/customer-credits', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/customer-credits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('rechaza un fiado con monto en cero (el local sí lo permitía, la nube ya no)', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/customer-credits/route')
    const res = await POST(
      buildRequest({ customer_name: 'Juan', description: 'Casco', total_amount_cents: 0 })
    )

    expect(res.status).toBe(400)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rechaza un fiado sin descripción', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/customer-credits/route')
    const res = await POST(
      buildRequest({ customer_name: 'Juan', description: '', total_amount_cents: 50_000 })
    )

    expect(res.status).toBe(400)
  })

  it('crea el fiado y, si trae abono inicial, lo aplica vía pay_customer_credit en vez de dejarlo sin abonar', async () => {
    const { client } = createSupabaseMock({
      customer_credits: { data: { id: 'credit-1', total_amount_cents: 100_000 }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { client: serviceClient, calls: serviceCalls } = createSupabaseMock({}, {
      pay_customer_credit: {
        data: { id: 'credit-1', total_amount_cents: 100_000, paid_amount_cents: 30_000, status: 'pending' },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(serviceClient)

    const { POST } = await import('@/app/api/customer-credits/route')
    const res = await POST(
      buildRequest({
        customer_name: 'Juan',
        description: 'Casco',
        total_amount_cents: 100_000,
        initial_payment_cents: 30_000,
        initial_payment_account_id: '11111111-1111-1111-1111-111111111111',
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.paid_amount_cents).toBe(30_000)
    expect(serviceCalls['rpc.pay_customer_credit'][0][0]).toEqual({
      p_credit_id: 'credit-1',
      p_amount_cents: 30_000,
      p_account_id: '11111111-1111-1111-1111-111111111111',
      p_notes: 'Abono inicial',
      p_created_by: null,
    })
  })
})

describe('PUT /api/customer-credits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('un vendedor NO puede condonar saldo con force_paid (solo admin)', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/customer-credits/[id]/route')
    const res = await PUT(buildRequest({ force_paid: true }, 'PUT'), { params: Promise.resolve({ id: 'credit-1' }) })

    expect(res.status).toBe(403)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('un admin SÍ puede condonar saldo con force_paid, y el fiado queda "paid"', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock({
      customer_credits: { data: { id: 'credit-1', status: 'paid' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/customer-credits/[id]/route')
    const res = await PUT(buildRequest({ force_paid: true }, 'PUT'), { params: Promise.resolve({ id: 'credit-1' }) })

    expect(res.status).toBe(200)
    expect(calls['customer_credits.update'][0][0]).toMatchObject({ status: 'paid' })
  })

  it('rechaza bajar el monto total por debajo de lo ya abonado', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock({
      customer_credit_payments: { data: [{ amount_cents: 60_000 }, { amount_cents: 20_000 }], error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/customer-credits/[id]/route')
    // Ya abonaron 80.000 en total, intenta bajar el monto total a 50.000
    const res = await PUT(
      buildRequest({ total_amount_cents: 50_000 }, 'PUT'),
      { params: Promise.resolve({ id: 'credit-1' }) }
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no puede ser menor a lo ya abonado/i)
  })

  it('si el nuevo monto total queda cubierto por lo ya abonado, pasa a "paid" automáticamente', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock({
      customer_credit_payments: { data: [{ amount_cents: 80_000 }], error: null },
      customer_credits: { data: { id: 'credit-1', status: 'paid' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/customer-credits/[id]/route')
    // Ya abonaron 80.000, el nuevo total (80.000) queda exactamente cubierto
    const res = await PUT(
      buildRequest({ total_amount_cents: 80_000 }, 'PUT'),
      { params: Promise.resolve({ id: 'credit-1' }) }
    )

    expect(res.status).toBe(200)
    expect(calls['customer_credits.update'][0][0]).toMatchObject({ status: 'paid' })
  })
})

describe('DELETE /api/customer-credits/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('devuelve 404 cuando el fiado no existe', async () => {
    const { client } = createSupabaseMock({}, {
      delete_customer_credit: { data: null, error: { message: 'Fiado no encontrado' } },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/customer-credits/[id]/route')
    const res = await DELETE(buildRequest({}, 'DELETE'), { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
  })
})

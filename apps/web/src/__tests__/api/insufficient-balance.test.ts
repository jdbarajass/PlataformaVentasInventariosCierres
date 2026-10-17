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
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const ADMIN_AUTH = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'

function buildRequest(url: string, body: any) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Las funciones SQL que debitan cuentas restan sin validar; estas rutas
// deben rechazar el débito antes de llamarlas si el saldo no alcanza.
describe('POST /api/supplier-invoices/[id]/payments — saldo insuficiente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('rechaza con 400 un abono mayor al saldo de la cuenta y no llama pay_supplier_invoice', async () => {
    const { client } = createSupabaseMock({
      accounts: { data: { name: 'NEQUI.', balance_cents: 91_405_100 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/supplier-invoices/[id]/payments/route')
    const res = await POST(
      buildRequest('http://localhost/api/supplier-invoices/inv-1/payments', { amount_cents: 107_000_000, account_id: ACCOUNT_ID }),
      { params: Promise.resolve({ id: 'inv-1' }) }
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Saldo insuficiente en NEQUI.')
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('un abono "Sin cuenta" no consulta saldo y se registra', async () => {
    const { client } = createSupabaseMock({}, {
      pay_supplier_invoice: { data: { id: 'inv-1', status: 'pending' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/supplier-invoices/[id]/payments/route')
    const res = await POST(
      buildRequest('http://localhost/api/supplier-invoices/inv-1/payments', { amount_cents: 107_000_000, account_id: null }),
      { params: Promise.resolve({ id: 'inv-1' }) }
    )

    expect(res.status).toBe(201)
    expect(client.from).not.toHaveBeenCalledWith('accounts')
  })

  it('un abono que alcanza justo con el saldo se registra', async () => {
    const { client } = createSupabaseMock({
      accounts: { data: { name: 'NEQUI.', balance_cents: 107_000_000 }, error: null },
    }, {
      pay_supplier_invoice: { data: { id: 'inv-1', status: 'paid' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/supplier-invoices/[id]/payments/route')
    const res = await POST(
      buildRequest('http://localhost/api/supplier-invoices/inv-1/payments', { amount_cents: 107_000_000, account_id: ACCOUNT_ID }),
      { params: Promise.resolve({ id: 'inv-1' }) }
    )

    expect(res.status).toBe(201)
  })
})

describe('POST /api/operating-expenses — saldo insuficiente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('rechaza con 400 un gasto mayor al saldo de la cuenta y no llama record_operating_expense', async () => {
    const { client } = createSupabaseMock({
      accounts: { data: { name: 'Efectivo', balance_cents: 1_000_000 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/operating-expenses/route')
    const res = await POST(
      buildRequest('http://localhost/api/operating-expenses', {
        description: 'Pago luz', amount_cents: 2_000_000, category: 'servicios', account_id: ACCOUNT_ID,
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Saldo insuficiente en Efectivo')
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

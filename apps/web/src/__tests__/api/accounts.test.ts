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

function buildRequest(body: any, method = 'POST', url = 'http://localhost/api/accounts') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
}

describe('GET /api/accounts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('oculta balance_cents a un vendedor (el saldo es 100% admin)', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    const { client } = createSupabaseMock({
      accounts: { data: [{ id: 'a1', name: 'Efectivo', balance_cents: 500_000 }], error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET(buildRequest(null, 'GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0]).not.toHaveProperty('balance_cents')
    expect(body.data[0].name).toBe('Efectivo')
  })

  it('un admin SÍ ve el saldo real de la cuenta', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock({
      accounts: { data: [{ id: 'a1', name: 'Efectivo', balance_cents: 500_000 }], error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET(buildRequest(null, 'GET'))

    const body = await res.json()
    expect(body.data[0].balance_cents).toBe(500_000)
  })
})

describe('POST /api/accounts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('un vendedor no puede crear cuentas (solo admin)', async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    })
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(buildRequest({ name: 'Nueva cuenta', payment_method: 'cash' }))

    expect(res.status).toBe(403)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('responde 409 (no 500) cuando ya existe una cuenta con ese nombre', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock({
      accounts: { data: null, error: { code: '23505', message: 'duplicate key value' } },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(buildRequest({ name: 'Efectivo', payment_method: 'cash' }))

    expect(res.status).toBe(409)
  })
})

describe('PUT /api/accounts/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ignora silenciosamente un intento de cambiar balance_cents directo (no está en el schema)', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock({
      accounts: { data: { id: 'a1', name: 'Efectivo' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/accounts/[id]/route')
    const res = await PUT(
      buildRequest({ name: 'Efectivo', balance_cents: 999_999_999 }, 'PUT'),
      { params: Promise.resolve({ id: 'a1' }) }
    )

    expect(res.status).toBe(200)
    // El saldo nunca debe llegar al UPDATE — solo cambia vía movimientos.
    expect(calls['accounts.update'][0][0]).not.toHaveProperty('balance_cents')
  })
})

describe('POST /api/account-movements (ajuste manual)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('rechaza un ajuste manual de monto cero', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/account-movements/route')
    const res = await POST(
      buildRequest({ account_id: '11111111-1111-1111-1111-111111111111', amount_cents: 0 })
    )

    expect(res.status).toBe(400)
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('un ajuste negativo (salida de caja) se manda tal cual a la función atómica de la BD', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock({}, {
      adjust_account_balance: { data: { id: 'mov-1', amount_cents: -50_000 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/account-movements/route')
    const res = await POST(
      buildRequest({
        account_id: '11111111-1111-1111-1111-111111111111',
        amount_cents: -50_000,
        description: 'Retiro de caja',
      })
    )

    expect(res.status).toBe(201)
    expect(calls['rpc.adjust_account_balance'][0][0]).toMatchObject({
      p_account_id: '11111111-1111-1111-1111-111111111111',
      p_amount_cents: -50_000,
    })
  })
})

describe('POST /api/account-movements/transfer', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('traduce el error de saldo insuficiente de la BD en un 400 legible, no un 500', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock({}, {
      transfer_between_accounts: { data: null, error: { message: 'Saldo insuficiente en la cuenta origen' } },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/account-movements/transfer/route')
    const res = await POST(
      buildRequest({
        from_account_id: '11111111-1111-1111-1111-111111111111',
        to_account_id: '22222222-2222-2222-2222-222222222222',
        amount_cents: 1_000_000,
      })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/saldo insuficiente/i)
  })

  it('rechaza transferir un monto negativo o cero', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/account-movements/transfer/route')
    const res = await POST(
      buildRequest({
        from_account_id: '11111111-1111-1111-1111-111111111111',
        to_account_id: '22222222-2222-2222-2222-222222222222',
        amount_cents: -1,
      })
    )

    expect(res.status).toBe(400)
    expect(client.rpc).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const createAuthenticatedClientMock = vi.fn()
const requireAuthMock = vi.fn()
const verifyAdminAuthorizationMock = vi.fn()
const logAuditMock = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: () => createAuthenticatedClientMock(),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/admin-authorization', () => ({
  verifyAdminAuthorization: (...args: any[]) => verifyAdminAuthorizationMock(...args),
}))
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: any[]) => (logAuditMock as any)(...args),
}))

const SELLER_AUTH = { success: true, user: { id: 's1', email: 'vendedor@test.com', role: 'seller' }, token: 't' }
const ADMIN_AUTH = { success: true, user: { id: 'a1', email: 'admin@test.com', role: 'admin' }, token: 't' }
const CREDENTIALS = { adminEmail: 'admin@test.com', adminPassword: 'clave' }
const params = { params: Promise.resolve({ id: 'venta-1' }) }

const EDIT_BODY = {
  items: [{ manual_title: 'Casco de reventa', manual_cost_cents: 1000, qty: 1, price_cents: 5000 }],
  payments: [{ method: 'cash', amount_cents: 5000 }],
}
const BULK_BODY = {
  orderIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
  method: 'nequi',
}

function buildRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const editRequest = (body: unknown) => buildRequest('http://localhost/api/pos/sales/venta-1', body)
const bulkRequest = (body: unknown) => buildRequest('http://localhost/api/pos/sales/bulk-method', body)

describe('PUT /api/pos/sales/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
  })

  it('un vendedor sin autorización no edita', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/pos/sales/[id]/route')
    const res = await PUT(editRequest(EDIT_BODY), params)

    expect(res.status).toBe(403)
    expect(calls['rpc.edit_pos_sale']).toBeUndefined()
  })

  it('un vendedor con credenciales de admin incorrectas no edita', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    verifyAdminAuthorizationMock.mockResolvedValue(null)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/pos/sales/[id]/route')
    const res = await PUT(editRequest({ ...EDIT_BODY, ...CREDENTIALS }), params)

    expect(res.status).toBe(403)
    expect(calls['rpc.edit_pos_sale']).toBeUndefined()
  })

  it('un vendedor autorizado edita, queda quién autorizó y la clave no se registra', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    verifyAdminAuthorizationMock.mockResolvedValue('admin@test.com')
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/pos/sales/[id]/route')
    const res = await PUT(editRequest({ ...EDIT_BODY, ...CREDENTIALS }), params)

    expect(res.status).toBe(200)
    expect(calls['rpc.edit_pos_sale']).toHaveLength(1)
    expect(logAuditMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        actorEmail: 'vendedor@test.com',
        newData: expect.objectContaining({ authorized_by: 'admin@test.com' }),
      })
    )
    expect(JSON.stringify(logAuditMock.mock.calls)).not.toContain('clave')
    expect(JSON.stringify(calls['rpc.edit_pos_sale'])).not.toContain('clave')
  })

  it('un admin edita sin pedir credenciales', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/pos/sales/[id]/route')
    const res = await PUT(editRequest(EDIT_BODY), params)

    expect(res.status).toBe(200)
    expect(verifyAdminAuthorizationMock).not.toHaveBeenCalled()
    expect(calls['rpc.edit_pos_sale']).toHaveLength(1)
  })
})

describe('PUT /api/pos/sales/bulk-method', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    getServiceSupabaseMock.mockReturnValue(client)
  })

  it('un vendedor sin autorización no cambia el método', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)

    const { PUT } = await import('@/app/api/pos/sales/bulk-method/route')
    const res = await PUT(bulkRequest(BULK_BODY))

    expect(res.status).toBe(403)
    expect(createAuthenticatedClientMock).not.toHaveBeenCalled()
  })

  it('un vendedor autorizado cambia el método y queda quién autorizó', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    verifyAdminAuthorizationMock.mockResolvedValue('admin@test.com')

    const { PUT } = await import('@/app/api/pos/sales/bulk-method/route')
    const res = await PUT(bulkRequest({ ...BULK_BODY, ...CREDENTIALS }))

    expect(res.status).toBe(200)
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'pos_sales_bulk_method_changed',
        newData: expect.objectContaining({ authorized_by: 'admin@test.com' }),
      })
    )
  })
})

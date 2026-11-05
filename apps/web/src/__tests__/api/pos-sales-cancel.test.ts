import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const requireAuthMock = vi.fn()
const verifyAdminAuthorizationMock = vi.fn()
const logAuditMock = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: vi.fn(),
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
const params = { params: Promise.resolve({ id: 'venta-1' }) }

function buildRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/pos/sales/venta-1', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('DELETE /api/pos/sales/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('un vendedor sin autorización no cancela', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/pos/sales/[id]/route')
    const res = await DELETE(buildRequest(), params)

    expect(res.status).toBe(403)
    expect(calls['rpc.cancel_pos_sale']).toBeUndefined()
  })

  it('un vendedor con credenciales de admin incorrectas no cancela', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    verifyAdminAuthorizationMock.mockResolvedValue(null)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/pos/sales/[id]/route')
    const res = await DELETE(buildRequest({ adminEmail: 'admin@test.com', adminPassword: 'mala' }), params)

    expect(res.status).toBe(403)
    expect(calls['rpc.cancel_pos_sale']).toBeUndefined()
  })

  it('un vendedor autorizado cancela y queda registrado qué admin autorizó', async () => {
    requireAuthMock.mockResolvedValue(SELLER_AUTH)
    verifyAdminAuthorizationMock.mockResolvedValue('admin@test.com')
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/pos/sales/[id]/route')
    const res = await DELETE(buildRequest({ adminEmail: 'admin@test.com', adminPassword: 'buena' }), params)

    expect(res.status).toBe(200)
    expect(calls['rpc.cancel_pos_sale']).toHaveLength(1)
    expect(logAuditMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ actorEmail: 'vendedor@test.com', newData: { authorized_by: 'admin@test.com' } })
    )
  })

  it('un admin cancela sin pedir credenciales', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/pos/sales/[id]/route')
    const res = await DELETE(buildRequest(), params)

    expect(res.status).toBe(200)
    expect(verifyAdminAuthorizationMock).not.toHaveBeenCalled()
    expect(calls['rpc.cancel_pos_sale']).toHaveLength(1)
  })
})

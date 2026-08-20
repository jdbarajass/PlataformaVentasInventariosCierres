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

function buildRequest(query: string) {
  return new NextRequest(`http://localhost/api/customers/search${query}`)
}

describe('GET /api/customers/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue({
      success: true,
      user: { id: 'seller-1', email: 'vendedor@test.com', role: 'seller' },
      token: 't',
    })
  })

  it('un vendedor SÍ puede buscar clientes (no es una operación de admin exclusiva)', async () => {
    const { client } = createSupabaseMock({
      users: { data: [{ id: 'c1', name: 'Juan Pérez', email: 'juan@test.com', phone: '3001234567', loyalty_points_balance: 250 }], error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/customers/search/route')
    const res = await GET(buildRequest('?q=juan'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].name).toBe('Juan Pérez')
  })

  it('no busca con menos de 2 caracteres (evita traer medio directorio de clientes)', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { GET } = await import('@/app/api/customers/search/route')
    const res = await GET(buildRequest('?q=j'))

    const body = await res.json()
    expect(body.data).toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it('401 sin sesión', async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })

    const { GET } = await import('@/app/api/customers/search/route')
    const res = await GET(buildRequest('?q=juan'))

    expect(res.status).toBe(401)
  })
})

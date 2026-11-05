import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const requireAuthMock = vi.fn()
const resolveSaleMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => ({}),
  createAuthenticatedClient: () => ({}),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/pos-sale', () => ({
  resolveSale: (...args: any[]) => resolveSaleMock(...args),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(() => Promise.resolve()) }))

function buildRequest(body: any) {
  return new NextRequest('http://localhost/api/pos/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const payments = [{ method: 'cash', amount_cents: 120_000_00 }]

describe('POST /api/pos/sales — ítems fuera de catálogo exigen costo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue({ success: true, user: { id: 'u1', email: 'v@test.com', role: 'seller' }, token: 't' })
  })

  it.each([undefined, 0])('rechaza un ítem manual con costo %s, sin tocar la venta', async (cost) => {
    const { POST } = await import('@/app/api/pos/sales/route')
    const res = await POST(buildRequest({
      items: [{ product_id: null, manual_title: 'PARRILLA GIXXER', manual_cost_cents: cost, qty: 1, price_cents: 120_000_00 }],
      payments,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/necesitan su costo/)
    expect(resolveSaleMock).not.toHaveBeenCalled()
  })

  it('un producto del catálogo no necesita manual_cost_cents', async () => {
    resolveSaleMock.mockRejectedValue(new Error('detener aquí'))
    const { POST } = await import('@/app/api/pos/sales/route')
    const res = await POST(buildRequest({
      items: [{ product_id: '11111111-1111-1111-1111-111111111111', qty: 1, price_cents: 120_000_00 }],
      payments,
    }))
    expect(resolveSaleMock).toHaveBeenCalled() // pasó la validación
    expect(res.status).not.toBe(400)
  })
})

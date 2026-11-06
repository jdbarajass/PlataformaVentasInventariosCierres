import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const getServiceSupabaseMock = vi.fn()
const requireAuthMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: () => ({}),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(() => Promise.resolve()) }))

const ADMIN = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }
const CURRENT = {
  id: 'inv-1', description: 'XONE ABATIBLE PLANO Y CALCA', supplier: 'YBMOTOCOM', amount_cents: 173_694_800,
  arrival_date: '2026-10-01', due_date: '2026-10-07', notes: null, status: 'pending', paid_at: null,
  payments: [{ amount_cents: 50_000_000 }],
}

const put = (body: any) =>
  new NextRequest('http://localhost/api/supplier-invoices/inv-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: 'inv-1' }) }

describe('PUT /api/supplier-invoices/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN)
  })

  it('solo admin', async () => {
    const { PUT } = await import('@/app/api/supplier-invoices/[id]/route')
    await PUT(put({ amount_cents: 150_000_000 }), params)
    expect(requireAuthMock.mock.calls[0][1]).toEqual(['admin'])
  })

  it('baja el total y recalcula el estado', async () => {
    const mock = createSupabaseMock({ supplier_invoices: { data: CURRENT, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)
    const { PUT } = await import('@/app/api/supplier-invoices/[id]/route')
    const res = await PUT(put({ amount_cents: 150_000_000, description: 'XONE (con descuento)' }), params)
    expect(res.status).toBe(200)
    const sent = mock.calls['supplier_invoices.update'][0][0]
    expect(sent).toMatchObject({ amount_cents: 150_000_000, description: 'XONE (con descuento)', status: 'pending', paid_at: null })
  })

  it('rechaza un total menor a lo abonado sin escribir nada', async () => {
    const mock = createSupabaseMock({ supplier_invoices: { data: CURRENT, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)
    const { PUT } = await import('@/app/api/supplier-invoices/[id]/route')
    const res = await PUT(put({ amount_cents: 40_000_000 }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/ya abonado/)
    expect(mock.calls['supplier_invoices.update']).toBeUndefined()
  })

  it('sin cambio de total no toca el estado', async () => {
    const mock = createSupabaseMock({ supplier_invoices: { data: CURRENT, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)
    const { PUT } = await import('@/app/api/supplier-invoices/[id]/route')
    await PUT(put({ due_date: '2026-11-15' }), params)
    const sent = mock.calls['supplier_invoices.update'][0][0]
    expect(sent.status).toBeUndefined()
    expect(sent.due_date).toBe('2026-11-15')
  })
})

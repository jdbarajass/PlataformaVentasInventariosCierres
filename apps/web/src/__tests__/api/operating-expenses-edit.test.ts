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
const OTHER_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222'
const CREATOR_ID = '33333333-3333-3333-3333-333333333333'

const CURRENT = {
  id: 'exp-1', date: '2026-10-21', description: 'VARSOL Y VUELTAS', amount_cents: 1_200_000,
  category: 'Otro', account_id: ACCOUNT_ID, created_by: CREATOR_ID,
}

function patch(body: any) {
  return new NextRequest('http://localhost/api/operating-expenses/exp-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = { params: Promise.resolve({ id: 'exp-1' }) }

describe('PATCH /api/operating-expenses/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('si solo cambia descripción/categoría hace UPDATE directo y no toca cuentas', async () => {
    const { client, calls } = createSupabaseMock({
      operating_expenses: { data: CURRENT, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PATCH } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(
      patch({ description: 'Varsol', amount_cents: 1_200_000, category: 'Montado', account_id: ACCOUNT_ID }),
      params
    )

    expect(res.status).toBe(200)
    expect(calls['operating_expenses.update']).toEqual([[{ description: 'Varsol', category: 'Montado' }]])
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('si cambia el monto revierte y re-registra conservando fecha y creador', async () => {
    const { client, calls } = createSupabaseMock(
      {
        operating_expenses: { data: CURRENT, error: null },
        accounts: { data: { name: 'Efectivo', balance_cents: 500_000 }, error: null },
      },
      { record_operating_expense: { data: { ...CURRENT, id: 'exp-2', amount_cents: 1_500_000 }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(client)

    const { PATCH } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(
      patch({ description: 'VARSOL Y VUELTAS', amount_cents: 1_500_000, category: 'Otro', account_id: ACCOUNT_ID }),
      params
    )

    // Misma cuenta: solo debe alcanzar la diferencia (300.000 ≤ 500.000).
    expect(res.status).toBe(200)
    expect(calls['rpc.delete_operating_expense']).toEqual([[{ p_expense_id: 'exp-1' }]])
    expect(calls['rpc.record_operating_expense'][0][0]).toMatchObject({
      p_date: '2026-10-21', p_amount_cents: 1_500_000, p_account_id: ACCOUNT_ID, p_created_by: CREATOR_ID,
    })
  })

  it('rechaza con 400 si la cuenta nueva no alcanza, sin revertir nada', async () => {
    const { client } = createSupabaseMock({
      operating_expenses: { data: CURRENT, error: null },
      accounts: { data: { name: 'Nequi', balance_cents: 1_000_000 }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PATCH } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(
      patch({ description: 'VARSOL Y VUELTAS', amount_cents: 1_200_000, category: 'Otro', account_id: OTHER_ACCOUNT_ID }),
      params
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Saldo insuficiente en Nequi')
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('editar y eliminar exigen rol admin (el vendedor no puede)', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)
    const forbidden = new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 })
    requireAuthMock.mockResolvedValue({ success: false, response: forbidden })

    const { PATCH, DELETE } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(patch({ description: 'X', amount_cents: 100, category: 'Otro' }), params)
    await DELETE(new NextRequest('http://localhost/api/operating-expenses/exp-1', { method: 'DELETE' }), params)

    expect(res.status).toBe(403)
    expect(requireAuthMock.mock.calls.map((c) => c[1])).toEqual([['admin'], ['admin']])
    expect(client.rpc).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalled()
  })

  it('devuelve 404 si el gasto no existe', async () => {
    const { client } = createSupabaseMock({ operating_expenses: { data: null, error: null } })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PATCH } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(
      patch({ description: 'X', amount_cents: 100, category: 'Otro', account_id: null }),
      params
    )

    expect(res.status).toBe(404)
  })
})

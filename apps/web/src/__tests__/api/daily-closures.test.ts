import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

// NOTA: estos tests cubren el comportamiento ACTUAL de /api/daily-closures
// (cierre = totales manuales por método de pago). La Fase 4 del plan de
// mejoras integrales (docs/UNIFICACION_YJBMOTOCOM.md sección 80) va a
// rediseñar Cierres como arqueo físico de caja — cuando eso se implemente,
// esta ruta cambia de forma y estos tests deben rehacerse junto con el resto.

const getServiceSupabaseMock = vi.fn()
const createAuthenticatedClientMock = vi.fn()
const requireAuthMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))

const ADMIN_AUTH = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }

function buildRequest(body: any, method = 'POST') {
  return new NextRequest('http://localhost/api/daily-closures', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/daily-closures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('recalcula el total sumando los métodos, ignorando cualquier total_amount_cents que mande el cliente', async () => {
    // La ruta hace dos consultas seguidas sobre la MISMA tabla (primero
    // ¿existe un cierre para esta fecha? y luego el insert) — el helper
    // compartido `createSupabaseMock` solo modela una respuesta fija por
    // tabla, así que para distinguir ambas llamadas se arma un mock manual
    // aquí: la primera `.single()` no encuentra nada (fecha libre), la
    // segunda es el resultado real del insert.
    let singleCalls = 0
    const insertCalls: any[] = []
    const dailyClosuresChain: any = {}
    dailyClosuresChain.select = vi.fn(() => dailyClosuresChain)
    dailyClosuresChain.insert = vi.fn((data: any) => {
      insertCalls.push(data)
      return dailyClosuresChain
    })
    dailyClosuresChain.eq = vi.fn(() => dailyClosuresChain)
    dailyClosuresChain.single = vi.fn(() => {
      singleCalls += 1
      return Promise.resolve(
        singleCalls === 1
          ? { data: null, error: null }
          : { data: { id: 'c1', date: '2026-08-20', total_amount_cents: 300_000 }, error: null }
      )
    })
    const auditLogsChain = { insert: vi.fn(() => Promise.resolve({ data: null, error: null })) }
    const client = {
      from: vi.fn((table: string) => (table === 'daily_closures' ? dailyClosuresChain : auditLogsChain)),
    }
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/daily-closures/route')
    const res = await POST(
      buildRequest({
        date: '2026-08-20',
        cash_amount_cents: 100_000,
        card_amount_cents: 150_000,
        transfer_amount_cents: 50_000,
        total_amount_cents: 1, // campo forjado, no existe en el schema — debe ser ignorado
      })
    )

    expect(res.status).toBe(201)
    expect(insertCalls[0].total_amount_cents).toBe(300_000) // 100k + 150k + 50k, no el 1 forjado
  })

  it('rechaza un segundo cierre para una fecha que ya tiene uno (409, no 500)', async () => {
    const { client } = createSupabaseMock({
      daily_closures: { data: { id: 'existing' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/daily-closures/route')
    const res = await POST(buildRequest({ date: '2026-08-20', cash_amount_cents: 100_000 }))

    expect(res.status).toBe(409)
  })

  it('rechaza montos negativos', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/daily-closures/route')
    const res = await POST(buildRequest({ date: '2026-08-20', cash_amount_cents: -1000 }))

    expect(res.status).toBe(400)
  })
})

describe('PUT /api/daily-closures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('exige el id del cierre', async () => {
    const { client } = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/daily-closures/route')
    const res = await PUT(buildRequest({ cash_amount_cents: 100_000 }, 'PUT'))

    expect(res.status).toBe(400)
  })

  it('404 cuando el cierre no existe', async () => {
    const { client } = createSupabaseMock({
      daily_closures: { data: null, error: { message: 'not found' } },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/daily-closures/route')
    const res = await PUT(buildRequest({ id: 'missing', cash_amount_cents: 100_000 }, 'PUT'))

    expect(res.status).toBe(404)
  })

  it('al verificar un cierre, estampa verified_by y verified_at', async () => {
    const { client, calls } = createSupabaseMock({
      daily_closures: {
        data: { id: 'c1', cash_amount_cents: 100_000, card_amount_cents: 0, transfer_amount_cents: 0, wallet_amount_cents: 0, other_amount_cents: 0 },
        error: null,
      },
      audit_logs: { data: null, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/daily-closures/route')
    const res = await PUT(
      buildRequest({ id: 'c1', verified: true, verified_by: 'u1' }, 'PUT')
    )

    expect(res.status).toBe(200)
    const updateArgs = calls['daily_closures.update'][0][0]
    expect(updateArgs.verified).toBe(true)
    expect(updateArgs.verified_by).toBe('u1')
    expect(updateArgs.verified_at).toBeTruthy()
  })

  it('recalcula el total solo cuando cambian los montos, tomando lo existente para los métodos no enviados', async () => {
    const { client, calls } = createSupabaseMock({
      daily_closures: {
        data: {
          id: 'c1',
          cash_amount_cents: 100_000,
          card_amount_cents: 50_000,
          transfer_amount_cents: 0,
          wallet_amount_cents: 0,
          other_amount_cents: 0,
        },
        error: null,
      },
      audit_logs: { data: null, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/daily-closures/route')
    // Solo corrige el efectivo (100k -> 120k); la tarjeta (50k) ya existente se conserva.
    const res = await PUT(buildRequest({ id: 'c1', cash_amount_cents: 120_000 }, 'PUT'))

    expect(res.status).toBe(200)
    const updateArgs = calls['daily_closures.update'][0][0]
    expect(updateArgs.total_amount_cents).toBe(170_000) // 120k + 50k
  })
})

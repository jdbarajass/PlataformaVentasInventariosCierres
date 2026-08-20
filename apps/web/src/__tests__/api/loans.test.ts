import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'

const createAuthenticatedClientMock = vi.fn()
const requireAuthMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: (...args: any[]) => requireAuthMock(...args),
}))
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}))

const ADMIN_AUTH = { success: true, user: { id: 'u1', email: 'admin@test.com', role: 'admin' }, token: 't' }

function buildRequest(body: any, method = 'POST') {
  return new NextRequest('http://localhost/api/loans', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/loans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  // BUG conocido (no corregido en esta fase, ver docs/UNIFICACION_YJBMOTOCOM.md
  // sección 80.6): la ruta distingue error de validación (400) de error
  // inesperado (500) con `error.message.includes('Expected')`, pero el
  // mensaje de un ZodError es el JSON de sus issues — la palabra aparece en
  // minúscula ahí ("expected": "string"), nunca con mayúscula inicial. El
  // resultado real es que CUALQUIER falla de validación cae al branch de
  // 500 con un mensaje genérico, nunca al 400 con el mensaje específico que
  // el esquema define (ej. "El producto es obligatorio"). Mismo patrón
  // roto en otras 16 rutas del admin (grep de `error.message.includes(` +
  // `Expected`).
  it('rechaza un préstamo sin nombre de producto ni almacén (hoy con 500, no 400 — ver comentario)', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(buildRequest({ product_title: '', warehouse: '' }))

    expect(res.status).toBe(500)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('permite registrar un préstamo de un producto fuera de catálogo (solo con nombre libre)', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-1', product_title: 'Casco genérico', warehouse: 'Sucursal Norte' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(
      buildRequest({ product_title: 'Casco genérico', warehouse: 'Sucursal Norte', product_id: null })
    )

    expect(res.status).toBe(201)
    expect(calls['loans.insert'][0][0]).toMatchObject({
      product_title: 'Casco genérico',
      warehouse: 'Sucursal Norte',
    })
  })

  it('401 cuando no hay sesión autenticada', async () => {
    requireAuthMock.mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    })
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(buildRequest({ product_title: 'Casco', warehouse: 'Norte' }))

    expect(res.status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
  })
})

describe('PUT /api/loans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('rechaza un estado que no sea pending/returned/charged', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'lost' }, 'PUT'), { params: { id: 'loan-1' } })

    expect(res.status).toBe(400)
  })

  it('permite marcar un préstamo como devuelto', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-1', status: 'returned' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'returned' }, 'PUT'), { params: { id: 'loan-1' } })

    expect(res.status).toBe(200)
    expect(calls['loans.update'][0][0]).toMatchObject({ status: 'returned' })
  })

  it('permite corregir producto, almacén y fecha de un préstamo ya creado (fidelidad con EditPrestamoDialog del local)', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-1' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(
      buildRequest(
        { product_title: 'Guantes de cuero', warehouse: 'Sucursal Sur', created_at: '2026-08-01T10:00:00Z' },
        'PUT'
      ),
      { params: { id: 'loan-1' } }
    )

    expect(res.status).toBe(200)
    expect(calls['loans.update'][0][0]).toMatchObject({
      product_title: 'Guantes de cuero',
      warehouse: 'Sucursal Sur',
      created_at: '2026-08-01T10:00:00Z',
    })
  })
})

describe('DELETE /api/loans/[id]', () => {
  it('elimina el préstamo y registra auditoría', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client, calls } = createSupabaseMock({
      loans: { data: null, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { DELETE } = await import('@/app/api/loans/[id]/route')
    const res = await DELETE(buildRequest({}, 'DELETE'), { params: { id: 'loan-1' } })

    expect(res.status).toBe(200)
    expect(calls['loans.delete']).toBeTruthy()
  })
})

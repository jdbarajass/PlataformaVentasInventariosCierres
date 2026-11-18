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

  it('registra un préstamo sin "direction" con el valor por defecto "lent" (lo que nos deben)', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-1', product_title: 'Casco genérico', warehouse: 'Sucursal Norte', direction: 'lent' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(
      buildRequest({ product_title: 'Casco genérico', warehouse: 'Sucursal Norte' })
    )

    expect(res.status).toBe(201)
    expect(calls['loans.insert'][0][0]).toMatchObject({ direction: 'lent' })
  })

  it('registra una deuda con direction "borrowed" (lo que nosotros debemos)', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-2', product_title: 'Guantes prestados', warehouse: 'Sucursal Sur', direction: 'borrowed' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(
      buildRequest({ product_title: 'Guantes prestados', warehouse: 'Sucursal Sur', direction: 'borrowed' })
    )

    expect(res.status).toBe(201)
    expect(calls['loans.insert'][0][0]).toMatchObject({ direction: 'borrowed' })
  })

  it('un préstamo de catálogo se guarda sin tocar inventario (migración 00062)', async () => {
    const { client, calls } = createSupabaseMock({
      loans: { data: { id: 'loan-3', product_id: '11111111-1111-4111-8111-111111111111' }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/route')
    const res = await POST(
      buildRequest({ product_id: '11111111-1111-4111-8111-111111111111', product_title: 'Casco', warehouse: 'Norte' })
    )

    expect(res.status).toBe(201)
    expect(calls['loans.insert'][0][0]).toMatchObject({ product_id: '11111111-1111-4111-8111-111111111111' })
    expect(service.client.rpc).not.toHaveBeenCalled()
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

  it('rechaza un estado que no sea pending/returned', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'lost' }, 'PUT'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(400)
  })

  it('no deja marcar "cobrado" a mano: eso va por Cobrar (que registra la venta)', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'charged' }, 'PUT'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Cobrar')
    expect(service.client.rpc).not.toHaveBeenCalled()
  })

  it('reabrir un préstamo que ya tiene venta responde 400 con el motivo', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock({}, {
      set_loan_status: { data: null, error: { message: 'Este préstamo ya tiene una venta: para reabrirlo cancela la venta en Ventas del Día' } },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'pending' }, 'PUT'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('cancela la venta')
  })

  it('permite marcar un préstamo como devuelto', async () => {
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock({}, {
      set_loan_status: { data: { id: 'loan-1', status: 'returned' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { PUT } = await import('@/app/api/loans/[id]/route')
    const res = await PUT(buildRequest({ status: 'returned' }, 'PUT'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(200)
    expect(service.calls['rpc.set_loan_status'][0][0]).toMatchObject({ p_loan_id: 'loan-1', p_status: 'returned' })
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
      { params: Promise.resolve({ id: 'loan-1' }) }
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
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { DELETE } = await import('@/app/api/loans/[id]/route')
    const res = await DELETE(buildRequest({}, 'DELETE'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(200)
    expect(service.calls['rpc.delete_loan'][0][0]).toMatchObject({ p_loan_id: 'loan-1' })
  })

  it('no borra un préstamo con venta o pago registrado (400 con el motivo)', async () => {
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
    const { client } = createSupabaseMock()
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock({}, {
      delete_loan: { data: null, error: { message: 'Este préstamo tiene una venta o un pago registrado: no se puede eliminar' } },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { DELETE } = await import('@/app/api/loans/[id]/route')
    const res = await DELETE(buildRequest({}, 'DELETE'), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(400)
  })
})

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'
const pendingLent = { id: 'loan-1', product_id: PRODUCT_ID, variant_id: null, product_title: 'Casco', warehouse: 'EDEN', direction: 'lent', status: 'pending', sale_order_id: null }

describe('POST /api/loans/[id]/charge (Cobrar)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('crea la venta con el precio digitado, el costo del catálogo y el nombre del local', async () => {
    const { client } = createSupabaseMock({
      loans: { data: pendingLent, error: null },
      product_variants: { data: [], error: null },
      products: { data: [{ id: PRODUCT_ID, title: 'Casco', sku: 'C1', images: [], cost_cents: 30000000 }], error: null },
      store_settings: { data: { pos_commission_rates: {} }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock({}, {
      charge_lent_loan: { data: { id: 'loan-1', status: 'charged', sale_order_id: 'o1' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/charge/route')
    const res = await POST(
      buildRequest({ price_cents: 39000000, payment: { method: 'cash', account_id: ACCOUNT_ID } }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(200)
    const args = service.calls['rpc.charge_lent_loan'][0][0]
    expect(args.p_order).toMatchObject({ customer_name: 'EDEN', total_cents: 39000000, seller_id: 'u1' })
    expect(args.p_items[0]).toMatchObject({ product_id: PRODUCT_ID, price_cents: 39000000, cost_cents: 30000000 })
    expect(args.p_payments[0]).toMatchObject({ method: 'cash', account_id: ACCOUNT_ID, amount_cents: 39000000 })
  })

  it('un préstamo fuera de catálogo pide el costo', async () => {
    const { client } = createSupabaseMock({ loans: { data: { ...pendingLent, product_id: null }, error: null } })
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/charge/route')
    const res = await POST(
      buildRequest({ price_cents: 100000, payment: { method: 'cash' } }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('costo')
    expect(service.client.rpc).not.toHaveBeenCalled()
  })

  it('no cobra un préstamo que no está pendiente', async () => {
    const { client } = createSupabaseMock({ loans: { data: { ...pendingLent, status: 'charged' }, error: null } })
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/charge/route')
    const res = await POST(
      buildRequest({ price_cents: 100000, payment: { method: 'cash' } }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(400)
    expect(service.client.rpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/loans/[id]/sell (Lo vendí)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('vende como ítem manual (sin tocar inventario) con el costo del catálogo', async () => {
    const { client } = createSupabaseMock({
      loans: { data: { ...pendingLent, direction: 'borrowed' }, error: null },
      products: { data: { cost_cents: 25000000 }, error: null },
      store_settings: { data: { pos_commission_rates: {} }, error: null },
    })
    createAuthenticatedClientMock.mockReturnValue(client)
    const service = createSupabaseMock({}, {
      sell_borrowed_loan: { data: { id: 'loan-1', sale_order_id: 'o2' }, error: null },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/sell/route')
    const res = await POST(
      buildRequest({ price_cents: 35000000, payment: { method: 'nequi' } }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(200)
    const item = service.calls['rpc.sell_borrowed_loan'][0][0].p_items[0]
    expect(item).toMatchObject({ product_id: null, variant_id: null, product_title: 'Casco', cost_cents: 25000000 })
  })
})

describe('POST /api/loans/[id]/close (Cerrar deuda)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('pagar en plata revisa el saldo y manda monto y cuenta', async () => {
    const service = createSupabaseMock(
      { accounts: { data: { name: 'Efectivo', balance_cents: 100000000 }, error: null } },
      { close_borrowed_loan: { data: { id: 'loan-1', status: 'charged' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/close/route')
    const res = await POST(
      buildRequest({ method: 'money', amount_cents: 3500000, account_id: ACCOUNT_ID }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(200)
    expect(service.calls['rpc.close_borrowed_loan'][0][0]).toMatchObject({
      p_method: 'money', p_amount_cents: 3500000, p_account_id: ACCOUNT_ID, p_product_id: null,
    })
  })

  it('pagar en plata sin saldo suficiente responde 400 sin cerrar', async () => {
    const service = createSupabaseMock({ accounts: { data: { name: 'Efectivo', balance_cents: 100 }, error: null } })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/close/route')
    const res = await POST(
      buildRequest({ method: 'money', amount_cents: 3500000, account_id: ACCOUNT_ID }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(400)
    expect(service.client.rpc).not.toHaveBeenCalled()
  })

  it('devolver de surtido ya ingresado manda el producto a descontar', async () => {
    const service = createSupabaseMock({}, { close_borrowed_loan: { data: { id: 'loan-1', status: 'returned' }, error: null } })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/close/route')
    const res = await POST(
      buildRequest({ method: 'restock_unit', product_id: PRODUCT_ID }),
      { params: Promise.resolve({ id: 'loan-1' }) }
    )

    expect(res.status).toBe(200)
    expect(service.calls['rpc.close_borrowed_loan'][0][0]).toMatchObject({ p_method: 'restock_unit', p_product_id: PRODUCT_ID, p_amount_cents: null })
  })

  it('una regla de la base (ej. ya se vendió) responde 400 con el mensaje', async () => {
    const service = createSupabaseMock({}, {
      close_borrowed_loan: { data: null, error: { message: 'Ese producto ya se vendió: no se puede devolver la misma unidad' } },
    })
    getServiceSupabaseMock.mockReturnValue(service.client)

    const { POST } = await import('@/app/api/loans/[id]/close/route')
    const res = await POST(buildRequest({ method: 'same_unit' }), { params: Promise.resolve({ id: 'loan-1' }) })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('ya se vendió')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '../helpers/supabase-mock'
import { bogotaDateStr } from '@/lib/bogota-time'

// 4x1000 en abonos a facturas, transferencias y pagos de préstamos, y fecha
// del abono (migración 00063). La BD cobra el 4x1000; las rutas mandan la
// casilla y validan que el saldo cubra el valor + el 4x1000.

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
const OTHER_ID = '22222222-2222-2222-2222-222222222222'

const post = (url: string, body: any, method = 'POST') =>
  new NextRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const payInvoice = async (body: any) => {
  const { POST } = await import('@/app/api/supplier-invoices/[id]/payments/route')
  return POST(post('http://localhost/api/supplier-invoices/inv-1/payments', body), { params: Promise.resolve({ id: 'inv-1' }) })
}

describe('Abono a factura: 4x1000 y fecha', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('manda la fecha y la casilla del 4x1000 a pay_supplier_invoice', async () => {
    const mock = createSupabaseMock(
      { accounts: { data: { name: 'NEQUI', balance_cents: 200_000_000, payment_method: 'nequi' }, error: null } },
      { pay_supplier_invoice: { data: { id: 'inv-1', status: 'pending' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 100_000_000, account_id: ACCOUNT_ID, paid_at: '2026-11-18', apply_gmf: true })

    expect(res.status).toBe(201)
    expect(mock.calls['rpc.pay_supplier_invoice'][0][0]).toMatchObject({
      p_amount_cents: 100_000_000, p_account_id: ACCOUNT_ID, p_paid_at: '2026-11-18', p_apply_gmf: true,
    })
  })

  it('rechaza el abono si el saldo cubre el valor pero no el 4x1000', async () => {
    // $1.000.000 desde Nequi → 4x1000 $4.000: con exactamente $1.000.000 no alcanza.
    const mock = createSupabaseMock({ accounts: { data: { name: 'NEQUI', balance_cents: 100_000_000, payment_method: 'nequi' }, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 100_000_000, account_id: ACCOUNT_ID, apply_gmf: true })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/1\.004\.000/)
    expect(mock.client.rpc).not.toHaveBeenCalled()
  })

  it('en efectivo no suma 4x1000: alcanza justo con el valor', async () => {
    const mock = createSupabaseMock(
      { accounts: { data: { name: 'Efectivo', balance_cents: 100_000_000, payment_method: 'cash' }, error: null } },
      { pay_supplier_invoice: { data: { id: 'inv-1', status: 'paid' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 100_000_000, account_id: ACCOUNT_ID, apply_gmf: true })
    expect(res.status).toBe(201)
  })

  it('con la casilla desmarcada no suma 4x1000 y lo manda en false', async () => {
    const mock = createSupabaseMock(
      { accounts: { data: { name: 'NEQUI', balance_cents: 100_000_000, payment_method: 'nequi' }, error: null } },
      { pay_supplier_invoice: { data: { id: 'inv-1', status: 'paid' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 100_000_000, account_id: ACCOUNT_ID, apply_gmf: false })
    expect(res.status).toBe(201)
    expect(mock.calls['rpc.pay_supplier_invoice'][0][0].p_apply_gmf).toBe(false)
  })

  it('sin fecha manda null (la BD pone hoy en hora Colombia)', async () => {
    const mock = createSupabaseMock({}, { pay_supplier_invoice: { data: { id: 'inv-1' }, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 1_000_000, account_id: null })
    expect(res.status).toBe(201)
    expect(mock.calls['rpc.pay_supplier_invoice'][0][0]).toMatchObject({ p_paid_at: null, p_apply_gmf: false })
  })

  it('rechaza una fecha futura sin llamar a la BD', async () => {
    const mock = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(mock.client)
    const tomorrow = bogotaDateStr(new Date(Date.now() + 86_400_000))

    const res = await payInvoice({ amount_cents: 1_000_000, account_id: null, paid_at: tomorrow })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/futura/)
    expect(mock.client.rpc).not.toHaveBeenCalled()
  })

  it('rechaza una fecha con formato inválido', async () => {
    const mock = createSupabaseMock()
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await payInvoice({ amount_cents: 1_000_000, paid_at: '18/11/2026' })
    expect(res.status).toBe(400)
    expect(mock.client.rpc).not.toHaveBeenCalled()
  })
})

describe('Transferencia entre cuentas: 4x1000', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('manda la casilla del 4x1000 a transfer_between_accounts', async () => {
    const mock = createSupabaseMock({}, { transfer_between_accounts: { data: 'ref-1', error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const { POST } = await import('@/app/api/account-movements/transfer/route')
    const res = await POST(post('http://localhost/api/account-movements/transfer', {
      from_account_id: ACCOUNT_ID, to_account_id: OTHER_ID, amount_cents: 1_000_000, apply_gmf: true,
    }))

    expect(res.status).toBe(201)
    expect(mock.calls['rpc.transfer_between_accounts'][0][0]).toMatchObject({ p_amount_cents: 1_000_000, p_apply_gmf: true })
  })

  it('sin la casilla, no cobra 4x1000 (false)', async () => {
    const mock = createSupabaseMock({}, { transfer_between_accounts: { data: 'ref-1', error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const { POST } = await import('@/app/api/account-movements/transfer/route')
    await POST(post('http://localhost/api/account-movements/transfer', {
      from_account_id: ACCOUNT_ID, to_account_id: OTHER_ID, amount_cents: 1_000_000,
    }))
    expect(mock.calls['rpc.transfer_between_accounts'][0][0].p_apply_gmf).toBe(false)
  })
})

describe('Cerrar deuda en plata: 4x1000', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  const close = async (body: any) => {
    const { POST } = await import('@/app/api/loans/[id]/close/route')
    return POST(post('http://localhost/api/loans/loan-1/close', body), { params: Promise.resolve({ id: 'loan-1' }) })
  }

  it('manda la casilla y valida el saldo con el 4x1000', async () => {
    const mock = createSupabaseMock(
      { accounts: { data: { name: 'NU', balance_cents: 50_200_000, payment_method: 'nu' }, error: null } },
      { close_borrowed_loan: { data: { id: 'loan-1', status: 'charged' }, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await close({ method: 'money', amount_cents: 50_000_000, account_id: ACCOUNT_ID, apply_gmf: true })
    expect(res.status).toBe(200)
    expect(mock.calls['rpc.close_borrowed_loan'][0][0]).toMatchObject({ p_amount_cents: 50_000_000, p_apply_gmf: true })
  })

  it('rechaza si el saldo no cubre el pago + 4x1000', async () => {
    const mock = createSupabaseMock({ accounts: { data: { name: 'NU', balance_cents: 50_100_000, payment_method: 'nu' }, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await close({ method: 'money', amount_cents: 50_000_000, account_id: ACCOUNT_ID, apply_gmf: true })
    expect(res.status).toBe(400)
    expect(mock.client.rpc).not.toHaveBeenCalled()
  })

  it('devolver la misma unidad nunca cobra 4x1000', async () => {
    const mock = createSupabaseMock({}, { close_borrowed_loan: { data: { id: 'loan-1', status: 'returned' }, error: null } })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const res = await close({ method: 'same_unit' })
    expect(res.status).toBe(200)
    expect(mock.calls['rpc.close_borrowed_loan'][0][0].p_apply_gmf).toBe(false)
  })
})

describe('Gasto que es un 4x1000 automático (abono, transferencia o préstamo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthMock.mockResolvedValue(ADMIN_AUTH)
  })

  it('no se puede editar', async () => {
    const mock = createSupabaseMock({
      operating_expenses: {
        data: { id: 'g-1', description: '4x1000: Abono a factura: X', amount_cents: 400_000, category: 'Gastos bancarios', account_id: ACCOUNT_ID, gmf_cents: 0, parent_expense_id: null, gmf_source: 'supplier_payment' },
        error: null,
      },
    })
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const { PATCH } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await PATCH(
      post('http://localhost/api/operating-expenses/g-1', { description: 'otro', amount_cents: 100, category: 'Gastos bancarios', account_id: ACCOUNT_ID }, 'PATCH'),
      { params: Promise.resolve({ id: 'g-1' }) }
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no se edita/)
    expect(mock.client.rpc).not.toHaveBeenCalled()
  })

  it('sí se puede eliminar (la BD devuelve la plata)', async () => {
    const mock = createSupabaseMock(
      { operating_expenses: { data: { id: 'g-1', parent_expense_id: null }, error: null } },
      { delete_operating_expense: { data: null, error: null } }
    )
    getServiceSupabaseMock.mockReturnValue(mock.client)

    const { DELETE } = await import('@/app/api/operating-expenses/[id]/route')
    const res = await DELETE(
      new NextRequest('http://localhost/api/operating-expenses/g-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'g-1' }) }
    )

    expect(res.status).toBe(200)
    expect(mock.calls['rpc.delete_operating_expense'][0][0]).toEqual({ p_expense_id: 'g-1' })
  })
})

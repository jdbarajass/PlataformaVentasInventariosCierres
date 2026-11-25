'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { bogotaDateStr, bogotaTimeStr, bogotaToISO } from '@/lib/bogota-time'
import { ExpenseGmfSummary } from '@/components/finanzas/expense-gmf-summary'

// Diálogos de Préstamos (migración 00062):
//   - LoanSaleDialog: "Cobrar" (Nos deben) y "Lo vendí" (Debemos). Crea una
//     venta de mostrador con un solo pago por el valor que se digite.
//   - LoanCloseDialog: "Cerrar deuda" (Debemos), de tres formas.
//   - LoanDeleteDialog: pregunta si el producto ya se devolvió antes de borrar.

export interface LoanForDialog {
  id: string
  product_id: string | null
  variant_id: string | null
  product_title: string
  warehouse: string
  direction: 'lent' | 'borrowed'
  status: 'pending' | 'returned' | 'charged'
  sale_order_id: string | null
}

export interface AccountOption {
  id: string
  name: string
  payment_method: string
}

type Method = 'cash' | 'card' | 'nequi' | 'nu' | 'qr' | 'daviplata' | 'addi' | 'sistecredito' | 'other'

// Mismos métodos y nombres que Registrar Venta (/admin/ventas).
const methodLabels: Record<Method, string> = {
  cash: 'Efectivo',
  card: 'Datáfono',
  nequi: 'Nequi',
  nu: 'NU',
  qr: 'QR/Bancolombia',
  daviplata: 'Daviplata',
  addi: 'Addi',
  sistecredito: 'SisteCrédito',
  other: 'Otro',
}

// Igual que Registrar Venta: cada método se abona a la cuenta del mismo
// nombre; el datáfono se liquida en la cuenta de NU.
function accountForMethod(accounts: AccountOption[], method: Method): AccountOption | undefined {
  const lookup = method === 'card' ? 'nu' : method
  return accounts.find((a) => a.payment_method === lookup)
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl border bg-card p-4 pb-6 shadow-lg animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none sm:rounded-xl sm:p-6 sm:animate-none"
      >
        <h2 className="mb-1 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const selectClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm touch:h-11'

// ---------------------------------------------------------------------------
// Cobrar / Lo vendí
// ---------------------------------------------------------------------------
export function LoanSaleDialog({
  loan,
  accounts,
  canViewCost,
  authHeaders,
  onClose,
  onDone,
}: {
  loan: LoanForDialog
  accounts: AccountOption[]
  canViewCost: boolean
  authHeaders: () => Record<string, string>
  onClose: () => void
  onDone: (message: string) => void
}) {
  const isCharge = loan.direction === 'lent'
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [date, setDate] = useState(() => bogotaDateStr(new Date()))
  const [sizes, setSizes] = useState<{ id: string; talla: string | null }[]>([])
  const [variantId, setVariantId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Préstamo de un producto con tallas registrado sin talla: hay que elegirla
  // para que la venta descuente la talla correcta.
  const needsSize = isCharge && !!loan.product_id && !loan.variant_id
  useEffect(() => {
    if (!needsSize) return
    fetch(`/api/products/${loan.product_id}/variants`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setSizes((data || []).filter((v: any) => v.active !== false)))
      .catch(() => setSizes([]))
  }, [needsSize, loan.product_id, authHeaders])

  // Costo: fuera de catálogo siempre se escribe. En "Lo vendí" con producto
  // de catálogo se trae del catálogo y solo el admin puede corregirlo.
  const costRequired = !loan.product_id
  const showCost = costRequired || (!isCharge && canViewCost)
  const account = accountForMethod(accounts, method)

  const submit = async () => {
    setError('')
    const priceCents = Math.round(Number(price || 0) * 100)
    const costCents = cost ? Math.round(Number(cost) * 100) : null
    if (priceCents <= 0) return setError('Escribe el valor de venta')
    if (costRequired && !costCents) return setError('Escribe el costo del producto')
    if (needsSize && sizes.length > 0 && !variantId) return setError('Elige la talla')
    // Toda venta entra a una cuenta (00068).
    if (!account) return setError('Ese método no tiene una cuenta activa: elige otro o créala en Cuentas')
    try {
      setSaving(true)
      const res = await fetch(`/api/loans/${loan.id}/${isCharge ? 'charge' : 'sell'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          price_cents: priceCents,
          cost_cents: costCents,
          variant_id: variantId || null,
          payment: { method, account_id: account?.id || null },
          created_at: bogotaToISO(date, bogotaTimeStr(new Date())),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'No se pudo registrar la venta')
      onDone(isCharge ? `Préstamo cobrado: se registró la venta a ${loan.warehouse}.` : 'Venta registrada. La deuda sigue abierta hasta que la cierres.')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isCharge ? 'Cobrar préstamo' : 'Lo vendí'} onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">
        {isCharge
          ? <>«{loan.product_title}» — {loan.warehouse} lo paga. Se registra como venta y ahí sí baja del inventario.</>
          : <>«{loan.product_title}», prestado por {loan.warehouse}. Entra como venta, sin tocar nuestro inventario. La deuda con {loan.warehouse} sigue abierta.</>}
      </p>
      <div className="space-y-3">
        {needsSize && sizes.length > 0 && (
          <Field label="Talla">
            <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={selectClass}>
              <option value="">Elige la talla…</option>
              {sizes.map((s) => <option key={s.id} value={s.id}>{s.talla}</option>)}
            </select>
          </Field>
        )}
        <Field label="Valor de venta">
          <MoneyInput value={price} onChange={setPrice} placeholder="0" className="rounded-lg" autoFocus />
        </Field>
        {showCost && (
          <Field
            label={costRequired ? 'Costo (cuánto nos costó)' : 'Costo (opcional)'}
            hint={!costRequired ? 'Vacío = el costo del catálogo. Si después le pagas en plata al otro local, el costo pasa a ser lo que le pagaste.' : undefined}
          >
            <MoneyInput value={cost} onChange={setCost} placeholder="0" className="rounded-lg" />
          </Field>
        )}
        {!showCost && <p className="text-xs text-muted-foreground">El costo se toma del producto.</p>}
        <Field label="Método de pago" hint={account ? `Entra a la cuenta ${account.name}` : 'No hay una cuenta para este método: la venta queda sin cuenta.'}>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={selectClass}>
            {(Object.keys(methodLabels) as Method[]).map((m) => <option key={m} value={m}>{methodLabels[m]}</option>)}
          </select>
        </Field>
        <Field label="Fecha (la hora se toma real al registrar)">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg" />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1 rounded-lg touch:h-11" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCharge ? 'Cobrar y registrar venta' : 'Registrar venta'}
          </Button>
          <Button variant="outline" className="rounded-lg touch:h-11" onClick={onClose} disabled={saving}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Cerrar deuda (Debemos)
// ---------------------------------------------------------------------------
type CloseMethod = 'same_unit' | 'restock_unit' | 'money'

interface PickedProduct { productId: string; variantId: string | null; label: string }

export function LoanCloseDialog({
  loan,
  accounts,
  authHeaders,
  onClose,
  onDone,
}: {
  loan: LoanForDialog
  accounts: AccountOption[]
  authHeaders: () => Record<string, string>
  onClose: () => void
  onDone: (message: string) => void
}) {
  const sold = !!loan.sale_order_id
  const [method, setMethod] = useState<CloseMethod | ''>(sold ? '' : 'same_unit')
  const [inInventory, setInInventory] = useState<'' | 'yes' | 'no'>('')
  const [picked, setPicked] = useState<PickedProduct | null>(
    loan.product_id ? { productId: loan.product_id, variantId: loan.variant_id, label: loan.product_title } : null
  )
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; title: string; variants: { id: string; talla: string | null }[] }[]>([])
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.payment_method === 'cash')?.id || '')
  // Casilla "cobrar 4x1000" del pago en plata (cuentas que no son efectivo, migración 00063).
  const [applyGmf, setApplyGmf] = useState(true)
  const [date, setDate] = useState(() => bogotaDateStr(new Date()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() })
        if (res.ok) setResults((await res.json()).data || [])
      } catch { /* sin resultados */ }
    }, 250)
    return () => clearTimeout(t)
  }, [query, authHeaders])

  const submit = async () => {
    setError('')
    if (!method) return setError('Elige cómo cerraste la deuda')
    const when = bogotaToISO(date, bogotaTimeStr(new Date()))
    let body: Record<string, unknown>
    if (method === 'same_unit') {
      body = { method, date: when }
    } else if (method === 'restock_unit') {
      if (!inInventory) return setError('Responde si ese producto ya está ingresado en el inventario')
      if (inInventory === 'yes' && !picked) return setError('Elige el producto (y la talla) que devolviste')
      body = {
        method,
        product_id: inInventory === 'yes' ? picked!.productId : null,
        variant_id: inInventory === 'yes' ? picked!.variantId : null,
        date: when,
      }
    } else {
      const cents = Math.round(Number(amount || 0) * 100)
      if (cents <= 0) return setError('Escribe cuánto le pagaste')
      body = { method, amount_cents: cents, account_id: accountId || null, apply_gmf: applyGmf, date: when }
    }
    try {
      setSaving(true)
      const res = await fetch(`/api/loans/${loan.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo cerrar la deuda')
      onDone(
        method === 'money'
          ? `Deuda pagada a ${loan.warehouse}.`
          : method === 'restock_unit' && inInventory === 'yes'
            ? 'Deuda cerrada. Se descontó 1 unidad del inventario.'
            : 'Deuda cerrada.'
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const option = (value: CloseMethod, title: string, detail: string, disabled = false) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${method === value ? 'border-primary bg-primary/5' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input type="radio" name="close-method" className="mt-1" checked={method === value} disabled={disabled} onChange={() => setMethod(value)} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  )

  return (
    <Modal title="Cerrar deuda" onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">
        «{loan.product_title}», prestado por {loan.warehouse}.{sold && ' Ya lo vendiste.'}
      </p>
      <div className="space-y-2">
        {option('same_unit', 'Le devolví su misma unidad', sold ? 'No aplica: ese producto ya se vendió.' : 'Se cierra y no pasa nada más.', sold)}
        {option('restock_unit', 'Le devolví una igual que me llegó de surtido', 'Si ya está ingresada al inventario, baja 1.')}
        {option('money', 'Le pagué en plata', 'Sale de la cuenta como pago a proveedor (no es gasto). Si la cuenta no es efectivo, el 4x1000 va aparte como gasto bancario.')}
      </div>

      {method === 'restock_unit' && (
        <div className="mt-4 space-y-3 rounded-lg border p-3">
          <p className="text-sm font-medium">¿Ese producto ya está ingresado en el inventario?</p>
          <div className="flex gap-2">
            <Button size="sm" variant={inInventory === 'yes' ? 'default' : 'outline'} className="flex-1 rounded-lg touch:h-11" onClick={() => setInInventory('yes')}>Sí, bajarlo 1</Button>
            <Button size="sm" variant={inInventory === 'no' ? 'default' : 'outline'} className="flex-1 rounded-lg touch:h-11" onClick={() => setInInventory('no')}>No, dejarlo igual</Button>
          </div>
          {inInventory === 'yes' && (
            picked && !query ? (
              <div className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span>{picked.label}</span>
                <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setQuery('') }}>Cambiar</Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar el producto y la talla…" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-lg pl-10" />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full space-y-1 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
                    {results.flatMap((p): (PickedProduct & { key: string })[] =>
                      p.variants.length === 0
                        ? [{ key: p.id, productId: p.id, variantId: null, label: p.title }]
                        : p.variants.map((v) => ({ key: v.id, productId: p.id, variantId: v.id, label: `${p.title} (${v.talla})` }))
                    ).map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted touch:py-3"
                        onClick={() => { setPicked({ productId: r.productId, variantId: r.variantId, label: r.label }); setQuery(''); setResults([]) }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {method === 'money' && (
        <div className="mt-4 space-y-3">
          <Field label="Cuánto le pagaste">
            <MoneyInput value={amount} onChange={setAmount} placeholder="0" className="rounded-lg" />
          </Field>
          <Field label="De qué cuenta salió">
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectClass}>
              <option value="">Sin cuenta (no descuenta ningún saldo)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {Math.round(Number(amount || 0) * 100) > 0 && (
            <ExpenseGmfSummary
              amountCents={Math.round(Number(amount || 0) * 100)}
              paymentMethod={accounts.find((a) => a.id === accountId)?.payment_method}
              hasAccount={!!accountId}
              applyGmf={applyGmf}
              onApplyGmfChange={setApplyGmf}
            />
          )}
        </div>
      )}

      {method && (
        <div className="mt-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg" />
          </Field>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button className="flex-1 rounded-lg touch:h-11" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cerrar deuda
        </Button>
        <Button variant="outline" className="rounded-lg touch:h-11" onClick={onClose} disabled={saving}>Cancelar</Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Eliminar
// ---------------------------------------------------------------------------
export function LoanDeleteDialog({
  loan,
  onClose,
  onConfirm,
}: {
  loan: LoanForDialog
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const lent = loan.direction === 'lent'
  const [answer, setAnswer] = useState<'' | 'no'>('')
  const [deleting, setDeleting] = useState(false)

  const confirm = async () => {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  // Solo se pregunta por la devolución si sigue pendiente; uno ya cerrado se
  // borra con una confirmación simple.
  if (loan.status !== 'pending') {
    return (
      <Modal title={lent ? 'Eliminar préstamo' : 'Eliminar deuda'} onClose={onClose}>
        <p className="mb-4 text-sm text-muted-foreground">¿Seguro que deseas eliminar el registro de «{loan.product_title}» ({loan.warehouse})?</p>
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1 rounded-lg touch:h-11" onClick={confirm} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Eliminar
          </Button>
          <Button variant="outline" className="rounded-lg touch:h-11" onClick={onClose}>Cancelar</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={lent ? 'Eliminar préstamo' : 'Eliminar deuda'} onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">
        ¿Seguro que deseas eliminar {lent ? 'el préstamo' : 'la deuda'} de «{loan.product_title}» ({loan.warehouse})?
      </p>
      {answer === 'no' ? (
        <>
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            Entonces no lo elimines: {lent
              ? `si ${loan.warehouse} lo pagó, usa «Cobrar» para registrar la venta.`
              : `cuando le devuelvas el producto o le pagues a ${loan.warehouse}, usa «Cerrar deuda».`}
          </p>
          <Button variant="outline" className="w-full rounded-lg touch:h-11" onClick={onClose}>Entendido</Button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm font-medium">{lent ? '¿Te devolvieron el producto?' : `¿Ya le devolviste el producto a ${loan.warehouse}?`}</p>
          <div className="flex flex-col gap-2">
            <Button variant="destructive" className="w-full rounded-lg touch:h-11" onClick={confirm} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {lent ? 'Sí, me lo devolvieron: eliminar' : 'Sí, ya lo devolví: eliminar'}
            </Button>
            <Button variant="outline" className="w-full rounded-lg touch:h-11" onClick={() => setAnswer('no')} disabled={deleting}>
              {lent ? 'No, no me lo devolvieron' : 'No, todavía no'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

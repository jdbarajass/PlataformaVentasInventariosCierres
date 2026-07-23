'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Landmark, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

const MONEDAS = [50, 100, 200, 500, 1000]
const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000]

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export default function CierreCajaPage() {
  const [date, setDate] = useState(TODAY)
  const [monedas, setMonedas] = useState<Record<number, number>>(
    Object.fromEntries(MONEDAS.map((d) => [d, 0]))
  )
  const [billetes, setBilletes] = useState<Record<number, number>>(
    Object.fromEntries(BILLETES.map((d) => [d, 0]))
  )
  const [gastosOperativos, setGastosOperativos] = useState(0)
  const [gastosNota, setGastosNota] = useState('')
  const [prestamos, setPrestamos] = useState(0)
  const [prestamosNota, setPrestamosNota] = useState('')
  const [nequi, setNequi] = useState(0)
  const [daviplata, setDaviplata] = useState(0)
  const [qr, setQr] = useState(0)
  const [addi, setAddi] = useState(0)
  const [tarjetaDebito, setTarjetaDebito] = useState(0)
  const [tarjetaCredito, setTarjetaCredito] = useState(0)
  const [excedente, setExcedente] = useState(0)
  const [loading, setLoading] = useState(false)
  const [preconsulta, setPreconsulta] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')

  const totalMonedas = MONEDAS.reduce((s, d) => s + d * (monedas[d] || 0), 0)
  const totalBilletes = BILLETES.reduce((s, d) => s + d * (billetes[d] || 0), 0)
  const totalEfectivo = totalMonedas + totalBilletes

  async function handlePreconsulta() {
    setError('')
    setPreconsulta(true)
    try {
      const res = await fetch(`/api/alegra/cierre?date=${date}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Error consultando Alegra')
      } else {
        setResult(data)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setPreconsulta(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)

    const payload = {
      date,
      monedas,
      billetes,
      excedentes: excedente > 0 ? [{ tipo: 'efectivo', valor: excedente }] : [],
      gastos_operativos: gastosOperativos,
      gastos_operativos_nota: gastosNota,
      prestamos,
      prestamos_nota: prestamosNota,
      desfases: [],
      metodos_pago: {
        addi_datafono: addi,
        nequi,
        daviplata,
        qr,
        tarjeta_debito: tarjetaDebito,
        tarjeta_credito: tarjetaCredito,
      },
    }

    try {
      const res = await fetch('/api/alegra/cierre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Error procesando el cierre')
      } else {
        setResult(data)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  function handleLimpiar() {
    setResult(null)
    setError('')
    setMonedas(Object.fromEntries(MONEDAS.map((d) => [d, 0])))
    setBilletes(Object.fromEntries(BILLETES.map((d) => [d, 0])))
    setGastosOperativos(0)
    setGastosNota('')
    setPrestamos(0)
    setPrestamosNota('')
    setNequi(0)
    setDaviplata(0)
    setQr(0)
    setAddi(0)
    setTarjetaDebito(0)
    setTarjetaCredito(0)
    setExcedente(0)
  }

  const validation = result?.validation as Record<string, unknown> | undefined
  const validationStatus = validation?.validation_status as string | undefined

  return (
    <div className="space-y-6">
      {/* Resultado de validación */}
      {validation ? (
        <Card
          className={`border-l-4 ${
            validationStatus === 'success'
              ? 'border-l-green-500'
              : validationStatus === 'warning'
                ? 'border-l-yellow-500'
                : 'border-l-red-500'
          }`}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              {validationStatus === 'success' ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : validationStatus === 'warning' ? (
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <h3 className="font-bold text-lg">
                  {validationStatus === 'success'
                    ? 'Cierre Validado Correctamente'
                    : validationStatus === 'warning'
                      ? 'Cierre con Advertencias'
                      : 'Cierre con Errores'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {String(validation.mensaje_validacion || '')}
                </p>
              </div>
            </div>

            {result?.alegra ? (() => {
              const alegra = result.alegra as Record<string, unknown>
              const totalSale = alegra.total_sale as { formatted?: string } | undefined
              const invoicesSummary = alegra.invoices_summary as {
                active_invoices?: number
                voided_invoices?: number
              } | undefined
              const cashCount = result.cash_count as Record<string, unknown> | undefined
              const consignar = cashCount?.consignar as Record<string, unknown> | undefined
              const voidedCount = invoicesSummary?.voided_invoices ?? 0

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-lg bg-blue-500/10 p-3 text-center border border-blue-500/20">
                    <p className="text-xs text-blue-500 font-semibold">TOTAL ALEGRA</p>
                    <p className="text-lg font-bold">{totalSale?.formatted || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-3 text-center">
                    <p className="text-xs text-muted-foreground font-semibold">FACTURAS</p>
                    <p className="text-lg font-bold">{invoicesSummary?.active_invoices ?? '-'}</p>
                  </div>
                  {voidedCount > 0 && (
                    <div className="rounded-lg bg-red-500/10 p-3 text-center border border-red-500/20">
                      <p className="text-xs text-red-500 font-semibold">ANULADAS</p>
                      <p className="text-lg font-bold text-red-500">{voidedCount}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-green-500/10 p-3 text-center border border-green-500/20">
                    <p className="text-xs text-green-500 font-semibold">A CONSIGNAR</p>
                    <p className="text-lg font-bold">
                      {String(consignar?.efectivo_para_consignar_final_formatted || '-')}
                    </p>
                  </div>
                </div>
              )
            })() : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Resultado detallado */}
      {result?.cash_count ? ((() => {
        const cc = result.cash_count as Record<string, unknown>
        const base = cc.base as Record<string, unknown> | undefined
        const totals = cc.totals as Record<string, unknown> | undefined
        const consignar = cc.consignar as Record<string, unknown> | undefined
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5" />
                Resultado del Cierre
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg bg-secondary p-4">
                  <p className="text-sm text-muted-foreground">Total Efectivo Contado</p>
                  <p className="text-2xl font-bold">
                    {String(totals?.total_general_formatted || '-')}
                  </p>
                </div>
                <div
                  className={`rounded-lg p-4 ${
                    base?.base_status === 'exacta'
                      ? 'bg-green-500/10 border border-green-500/20'
                      : base?.base_status === 'faltante'
                        ? 'bg-red-500/10 border border-red-500/20'
                        : 'bg-blue-500/10 border border-blue-500/20'
                  }`}
                >
                  <p className="text-sm text-muted-foreground">
                    Base&nbsp;
                    <Badge variant="outline" className="ml-1 text-xs">
                      {String(base?.base_status || '-')}
                    </Badge>
                  </p>
                  <p className="text-2xl font-bold">
                    {String(base?.total_base_formatted || '-')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {String(base?.mensaje_base || '')}
                  </p>
                </div>
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                  <p className="text-sm text-muted-foreground">A Consignar</p>
                  <p className="text-2xl font-bold text-green-500">
                    {String(consignar?.efectivo_para_consignar_final_formatted || '-')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })() as React.ReactNode) : null}

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Fecha + pre-consulta */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Fecha del cierre</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-auto"
                  max={TODAY}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handlePreconsulta}
                disabled={preconsulta}
              >
                {preconsulta ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Pre-consultar Alegra
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Conteo de efectivo */}
        <Card>
          <CardHeader>
            <CardTitle>Conteo de Efectivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Monedas */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Monedas
                </h3>
                <div className="space-y-2">
                  {MONEDAS.map((d) => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-sm w-24 text-muted-foreground">{formatCOP(d)}</span>
                      <Input
                        type="number"
                        min={0}
                        value={monedas[d] || 0}
                        onChange={(e) =>
                          setMonedas({ ...monedas, [d]: parseInt(e.target.value) || 0 })
                        }
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-28 text-right">
                        = {formatCOP(d * (monedas[d] || 0))}
                      </span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between mt-2">
                    <span className="text-sm font-semibold">Total monedas</span>
                    <span className="text-sm font-bold">{formatCOP(totalMonedas)}</span>
                  </div>
                </div>
              </div>

              {/* Billetes */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                  Billetes
                </h3>
                <div className="space-y-2">
                  {BILLETES.map((d) => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-sm w-24 text-muted-foreground">{formatCOP(d)}</span>
                      <Input
                        type="number"
                        min={0}
                        value={billetes[d] || 0}
                        onChange={(e) =>
                          setBilletes({ ...billetes, [d]: parseInt(e.target.value) || 0 })
                        }
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground w-28 text-right">
                        = {formatCOP(d * (billetes[d] || 0))}
                      </span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between mt-2">
                    <span className="text-sm font-semibold">Total billetes</span>
                    <span className="text-sm font-bold">{formatCOP(totalBilletes)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-orange-500/10 border border-orange-500/20 p-4 flex justify-between items-center">
              <span className="font-bold text-orange-500">TOTAL EFECTIVO</span>
              <span className="text-2xl font-bold text-orange-500">{formatCOP(totalEfectivo)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Pagos digitales y tarjetas */}
        <Card>
          <CardHeader>
            <CardTitle>Pagos Digitales y Tarjetas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Nequi', value: nequi, setter: setNequi },
                { label: 'Daviplata', value: daviplata, setter: setDaviplata },
                { label: 'QR', value: qr, setter: setQr },
                { label: 'Addi (Datafono)', value: addi, setter: setAddi },
                { label: 'Tarjeta Débito', value: tarjetaDebito, setter: setTarjetaDebito },
                { label: 'Tarjeta Crédito', value: tarjetaCredito, setter: setTarjetaCredito },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="mb-2 block text-sm font-medium">{label}</label>
                  <MoneyInput
                    value={String(value || '')}
                    onChange={(v) => setter(parseInt(v) || 0)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ajustes del día */}
        <Card>
          <CardHeader>
            <CardTitle>Ajustes del Día</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="mb-2 block text-sm font-medium">Excedente en efectivo</label>
                <MoneyInput
                  value={String(excedente || '')}
                  onChange={(v) => setExcedente(parseInt(v) || 0)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Gastos operativos</label>
                <MoneyInput
                  value={String(gastosOperativos || '')}
                  onChange={(v) => setGastosOperativos(parseInt(v) || 0)}
                  placeholder="0"
                />
                <Input
                  type="text"
                  value={gastosNota}
                  onChange={(e) => setGastosNota(e.target.value)}
                  placeholder="Nota de gastos..."
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Préstamos</label>
                <MoneyInput
                  value={String(prestamos || '')}
                  onChange={(v) => setPrestamos(parseInt(v) || 0)}
                  placeholder="0"
                />
                <Input
                  type="text"
                  value={prestamosNota}
                  onChange={(e) => setPrestamosNota(e.target.value)}
                  placeholder="Nota de préstamos..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botones */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleLimpiar}>
            Limpiar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 text-white px-8"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando cierre...
              </>
            ) : (
              <>
                <Landmark className="mr-2 h-4 w-4" />
                Procesar Cierre de Caja
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

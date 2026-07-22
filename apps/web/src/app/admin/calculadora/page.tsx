'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Calculator, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

type MarginMode = 'real' | 'sobre_costo'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', other: 'Otro',
}

const GANANCIAS = [25, 30, 35, 40, 45, 50, 55, 60, 65]
const DCTOS_CLIENTE = [5, 10, 15, 20]
const DCTOS_PROVEEDOR = [0, 3, 5, 8, 10]

function precioDesdePct(costo: number, pct: number, modo: MarginMode): number {
  if (modo === 'real') return costo / (1 - pct / 100)
  return costo * (1 + pct / 100)
}

interface ProductResult {
  id: string
  title: string
  cost_cents: number
  variants: { id: string; talla: string | null; cost_cents: number }[]
}

export default function CalculadoraPage() {
  const [rates, setRates] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<MarginMode>('real')
  const [costo, setCosto] = useState('')
  const [precio, setPrecio] = useState('')
  const [margenDeseado, setMargenDeseado] = useState('')
  const [dctoCliente, setDctoCliente] = useState('')
  const [method, setMethod] = useState('cash')
  const { userProfile, session } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  // Buscador de inventario (autocompleta el costo) — solo admin, para no
  // revelar costos reales del catálogo al rol vendedor (ver docs/
  // UNIFICACION_YJBMOTOCOM.md sección 13.4, ítem 4.4.4).
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculadora de Cascos (factura proveedor)
  const [precioFactura, setPrecioFactura] = useState('')
  const [dctoProveedor, setDctoProveedor] = useState('5')
  const [incluyeIva, setIncluyeIva] = useState(true)

  // Calculadora Rápida
  const [rapCosto, setRapCosto] = useState('')
  const [rapPrecio, setRapPrecio] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.pos_commission_rates) setRates(json.data.pos_commission_rates)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      if (!session?.access_token) return
      const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { data } = await res.json()
      setResults(data || [])
    }, 250)
  }, [query, isAdmin, session?.access_token])

  const formatPrice = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)

  const costoNum = parseFloat(costo) || 0
  const precioNum = parseFloat(precio) || 0

  // A partir de costo + precio: ganancia y las dos formas de margen.
  const ganancia = precioNum - costoNum
  const margenReal = precioNum > 0 ? (ganancia / precioNum) * 100 : 0
  const margenSobreCosto = costoNum > 0 ? (ganancia / costoNum) * 100 : 0

  // Comisión del método elegido: se traslada al cliente como sobreprecio,
  // no reduce la ganancia (misma regla que Registrar Venta / software local).
  const commissionRate = rates[method] || 0
  const comision = precioNum * (commissionRate / 100)
  const totalConComision = precioNum + comision

  // A partir de costo + margen deseado (en el modo elegido): precio sugerido.
  const margenDeseadoNum = parseFloat(margenDeseado) || 0
  const precioSugerido = useMemo(() => {
    if (costoNum <= 0 || margenDeseadoNum <= 0) return 0
    if (mode === 'real') {
      if (margenDeseadoNum >= 100) return 0
      return costoNum / (1 - margenDeseadoNum / 100)
    }
    return costoNum * (1 + margenDeseadoNum / 100)
  }, [costoNum, margenDeseadoNum, mode])

  // Descuento al cliente sobre el precio sugerido (chips 5/10/15/20%).
  const dctoClienteNum = parseFloat(dctoCliente) || 0
  const precioConDcto = dctoClienteNum > 0 && precioSugerido > 0 ? precioSugerido * (1 - dctoClienteNum / 100) : 0
  const gananciaConDcto = precioConDcto - costoNum
  const margenConDcto = precioConDcto > 0 ? (gananciaConDcto / precioConDcto) * 100 : 0

  // Calculadora de Cascos: costo real = (precio factura sin IVA) * (1 - dcto proveedor).
  const precioFacturaNum = parseFloat(precioFactura) || 0
  const dctoProveedorNum = parseFloat(dctoProveedor) || 0
  const costoRealCasco = useMemo(() => {
    if (precioFacturaNum <= 0) return 0
    const base = incluyeIva ? precioFacturaNum / 1.19 : precioFacturaNum
    return Math.round(base * (1 - dctoProveedorNum / 100))
  }, [precioFacturaNum, dctoProveedorNum, incluyeIva])

  const tablaCascos = useMemo(() => {
    if (costoRealCasco <= 0) return []
    return GANANCIAS.map((pct) => {
      const pv = Math.round(precioDesdePct(costoRealCasco, pct, mode))
      return { pct, pv, ganancia: pv - costoRealCasco }
    })
  }, [costoRealCasco, mode])

  // Calculadora Rápida: costo + precio -> ganancia instantánea.
  const rapCostoNum = parseFloat(rapCosto) || 0
  const rapPrecioNum = parseFloat(rapPrecio) || 0
  const rapGanancia = rapPrecioNum - rapCostoNum
  const rapPctCosto = rapCostoNum > 0 ? (rapGanancia / rapCostoNum) * 100 : 0
  const rapPctVenta = rapPrecioNum > 0 ? (rapGanancia / rapPrecioNum) * 100 : 0
  const rapActivo = rapCostoNum > 0 && rapPrecioNum > 0

  const selectFromSearch = (costCents: number) => {
    setCosto((costCents / 100).toString())
    setQuery('')
    setResults([])
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Calculadora</h1>
        <p className="text-muted-foreground">Precio de venta, margen y comisión — no guarda nada, solo calcula</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Costo + Precio -> margen/ganancia/comisión */}
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Calculator className="h-5 w-5" /> Costo + Precio → Margen y comisión
          </h2>
          <div className="space-y-3">
            {isAdmin && (
              <div className="relative">
                <label className="text-sm text-muted-foreground">Buscar producto en inventario (autocompleta el costo)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Nombre o SKU..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="rounded-lg pl-10"
                  />
                </div>
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full space-y-1 overflow-y-auto rounded-lg border bg-card p-2 shadow-lg">
                    {results.map((p) =>
                      p.variants.length === 0 ? (
                        <button key={p.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted" onClick={() => selectFromSearch(p.cost_cents)}>
                          {p.title}
                        </button>
                      ) : (
                        p.variants.map((v) => (
                          <button key={v.id} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted" onClick={() => selectFromSearch(v.cost_cents)}>
                            {p.title} {v.talla ? `(${v.talla})` : ''}
                          </button>
                        ))
                      )
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Costo</label>
              <Input type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} className="rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Precio de venta</label>
              <Input type="number" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} className="rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Método de pago (para la comisión)</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {Object.entries(methodLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label} {rates[value] ? `(${rates[value]}%)` : ''}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border p-4">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Ganancia</span><span className="font-medium">{formatPrice(ganancia)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">% Margen real (sobre precio)</span><span className="font-medium">{margenReal.toFixed(1)}%</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">% Sobre costo (markup)</span><span className="font-medium">{margenSobreCosto.toFixed(1)}%</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Comisión ({commissionRate}%)</span><span className="font-medium">{formatPrice(comision)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total que paga el cliente</span><span>{formatPrice(totalConComision)}</span></div>
              <p className="text-xs text-muted-foreground">La comisión se traslada al cliente como sobreprecio — no reduce la ganancia registrada.</p>
            </div>
          </div>

          <div className="mt-6 border-t pt-4">
            <h3 className="mb-1 text-sm font-semibold">Calculadora Rápida</h3>
            <p className="mb-3 text-xs text-muted-foreground">Costo + precio → ganancia instantánea</p>
            <div className="flex gap-2">
              <Input type="number" min="0" placeholder="Costo" value={rapCosto} onChange={(e) => setRapCosto(e.target.value)} className="rounded-lg" />
              <Input type="number" min="0" placeholder="Precio venta" value={rapPrecio} onChange={(e) => setRapPrecio(e.target.value)} className="rounded-lg" />
            </div>
            {rapActivo && (
              <p className={`mt-2 rounded-lg border p-2 text-sm font-medium ${rapGanancia >= 0 ? 'border-green-500/30 bg-green-500/10 text-green-600' : 'border-red-500/30 bg-red-500/10 text-red-600'}`}>
                {rapGanancia >= 0
                  ? `Ganancia: ${formatPrice(rapGanancia)} · ${rapPctCosto.toFixed(1)}% sobre costo · ${rapPctVenta.toFixed(1)}% margen`
                  : `Pérdida: ${formatPrice(Math.abs(rapGanancia))} — estás vendiendo por debajo del costo`}
              </p>
            )}
          </div>
        </div>

        {/* Costo + Margen deseado -> precio sugerido */}
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Calculator className="h-5 w-5" /> Costo + Margen deseado → Precio sugerido
          </h2>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'real' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 rounded-lg"
                onClick={() => setMode('real')}
              >
                % Margen real
              </Button>
              <Button
                type="button"
                variant={mode === 'sobre_costo' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 rounded-lg"
                onClick={() => setMode('sobre_costo')}
              >
                % Sobre costo
              </Button>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Costo</label>
              <Input type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} className="rounded-lg" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">
                Margen deseado (%) {mode === 'real' ? '— sobre el precio de venta' : '— sobre el costo'}
              </label>
              <Input type="number" min="0" value={margenDeseado} onChange={(e) => setMargenDeseado(e.target.value)} className="rounded-lg" />
            </div>

            <div className="mt-4 rounded-lg border p-4">
              <div className="flex justify-between text-base font-bold">
                <span>Precio sugerido</span>
                <span>{formatPrice(precioSugerido)}</span>
              </div>
              {precioSugerido > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ganancia: {formatPrice(precioSugerido - costoNum)}
                </p>
              )}
            </div>

            {precioSugerido > 0 && (
              <div>
                <label className="text-sm text-muted-foreground">% Descuento al cliente</label>
                <div className="flex gap-1.5">
                  {DCTOS_CLIENTE.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDctoCliente(dctoCliente === String(d) ? '' : String(d))}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${dctoCliente === String(d) ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-input'}`}
                    >
                      {d}%
                    </button>
                  ))}
                </div>
                {dctoClienteNum > 0 && (
                  <p className={`mt-2 rounded-lg border p-2 text-sm font-medium ${gananciaConDcto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Con {dctoClienteNum}% dcto: {formatPrice(precioConDcto)} — Ganancia {formatPrice(gananciaConDcto)} · Margen {margenConDcto.toFixed(1)}%
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calculadora de Cascos (Factura proveedor) */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Calculator className="h-5 w-5" /> Calculadora de Cascos (Factura proveedor)
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Ingresa el precio que aparece en la factura del proveedor (columna PRECIO, con IVA) para calcular el costo real.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Precio en factura por unidad</label>
              <Input type="number" min="0" placeholder="ej. 302500" value={precioFactura} onChange={(e) => setPrecioFactura(e.target.value)} className="rounded-lg" />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-sm text-muted-foreground">% Descuento proveedor</label>
                <div className="flex gap-1.5">
                  {DCTOS_PROVEEDOR.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDctoProveedor(String(d))}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${dctoProveedor === String(d) ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-input'}`}
                    >
                      {d}%
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={incluyeIva} onChange={(e) => setIncluyeIva(e.target.checked)} />
                Precio incluye IVA 19%
              </label>
            </div>
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
              <p className="text-xs text-muted-foreground">Costo real por casco</p>
              <p className="text-xl font-bold text-orange-600">{costoRealCasco > 0 ? formatPrice(costoRealCasco) : '—'}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Tabla de precios de venta según {mode === 'real' ? '% margen real' : '% ganancia'}:
            </p>
            {tablaCascos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ingresa el precio de factura para ver la tabla.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="px-3 py-1.5 text-left">{mode === 'real' ? '% Margen' : '% Ganancia'}</th>
                      <th className="px-3 py-1.5 text-right">Precio de venta</th>
                      <th className="px-3 py-1.5 text-right">Ganancia $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaCascos.map((row) => (
                      <tr key={row.pct} className="border-t">
                        <td className="px-3 py-1">{row.pct}%</td>
                        <td className="px-3 py-1 text-right">{formatPrice(row.pv)}</td>
                        <td className="px-3 py-1 text-right">{formatPrice(row.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

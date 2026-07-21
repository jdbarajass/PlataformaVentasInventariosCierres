'use client'

import { useState, useEffect, useMemo } from 'react'
import { Calculator, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type MarginMode = 'real' | 'sobre_costo'

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', daviplata: 'Daviplata', addi: 'Addi', card: 'Datáfono', other: 'Otro',
}

export default function CalculadoraPage() {
  const [rates, setRates] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<MarginMode>('real')
  const [costo, setCosto] = useState('')
  const [precio, setPrecio] = useState('')
  const [margenDeseado, setMargenDeseado] = useState('')
  const [method, setMethod] = useState('cash')

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data?.pos_commission_rates) setRates(json.data.pos_commission_rates)
      })
      .catch(() => {})
  }, [])

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
      // margen = (precio - costo) / precio  =>  precio = costo / (1 - margen)
      if (margenDeseadoNum >= 100) return 0
      return costoNum / (1 - margenDeseadoNum / 100)
    }
    // sobre costo: margen = (precio - costo) / costo  =>  precio = costo * (1 + margen)
    return costoNum * (1 + margenDeseadoNum / 100)
  }, [costoNum, margenDeseadoNum, mode])

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
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Pendiente:</strong> el software local también tiene un módulo &quot;Cascos desde Factura&quot; que
          extrae ítems automáticamente de PDFs de dos proveedores específicos. No se incluyó todavía porque
          requiere ejemplos reales de esas facturas para replicar el formato exacto — si los tienes, se puede
          construir en una sub-fase aparte.
          <Badge variant="outline" className="ml-2">No implementado</Badge>
        </p>
      </div>
    </div>
  )
}

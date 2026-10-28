'use client'

import { useState } from 'react'
import { Banknote, Coins, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// Mismas denominaciones colombianas que el paso "Efectivo contado" del
// cierre de caja de KOAJ (Cierre-Caja-Puerto-Carreno-Frontend,
// components/Dashboard.jsx): cantidad × denominación = subtotal. Aquí no se
// guarda nada — solo cuenta, igual que el resto de la Calculadora.
const MONEDAS = [50, 100, 200, 500, 1000]
const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000]

type Conteo = Record<number, string>

const vacio = (denoms: number[]): Conteo => Object.fromEntries(denoms.map((d) => [d, '']))

function totalDe(conteo: Conteo): number {
  return Object.entries(conteo).reduce((sum, [denom, qty]) => sum + Number(denom) * (parseInt(qty) || 0), 0)
}

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)

function TablaDenominaciones({
  titulo,
  tipo,
  icon: Icon,
  denoms,
  conteo,
  onChange,
}: {
  titulo: string
  tipo: 'monedas' | 'billetes'
  icon: typeof Coins
  denoms: number[]
  conteo: Conteo
  onChange: (denom: number, qty: string) => void
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="h-4 w-4" /> {titulo}
      </h3>
      <div className="divide-y">
        {denoms.map((denom) => {
          const qty = parseInt(conteo[denom]) || 0
          return (
            <div key={denom} className="grid grid-cols-[5rem_minmax(0,7rem)_1fr] items-center gap-3 py-2">
              <label htmlFor={`${tipo}-${denom}`} className="text-[15px] font-semibold">
                {formatPrice(denom)}
              </label>
              <Input
                id={`${tipo}-${denom}`}
                type="text"
                inputMode="numeric"
                maxLength={9}
                placeholder="0"
                value={conteo[denom]}
                onChange={(e) => onChange(denom, e.target.value.replace(/[^0-9]/g, ''))}
                onFocus={(e) => e.target.select()}
                aria-label={`Cantidad de ${tipo} de ${formatPrice(denom)}`}
                className="h-11 rounded-lg px-2 text-center text-base font-semibold"
              />
              <span className={`text-right text-sm font-medium ${qty > 0 ? '' : 'text-muted-foreground/50'}`}>
                {formatPrice(denom * qty)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t-2 border-foreground pt-3">
        <span className="text-sm font-semibold">Total {titulo}</span>
        <span className="text-xl font-bold">{formatPrice(totalDe(conteo))}</span>
      </div>
    </div>
  )
}

export function ConteoEfectivo() {
  const [monedas, setMonedas] = useState<Conteo>(() => vacio(MONEDAS))
  const [billetes, setBilletes] = useState<Conteo>(() => vacio(BILLETES))

  const totalMonedas = totalDe(monedas)
  const totalBilletes = totalDe(billetes)
  const totalGeneral = totalMonedas + totalBilletes

  const limpiar = () => {
    if (!confirm('¿Limpiar el conteo? Se borrarán todas las cantidades ingresadas.')) return
    setMonedas(vacio(MONEDAS))
    setBilletes(vacio(BILLETES))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Total efectivo contado</p>
            <p className="text-3xl font-bold text-green-700 dark:text-green-400" data-testid="total-efectivo">
              {formatPrice(totalGeneral)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monedas {formatPrice(totalMonedas)} · Billetes {formatPrice(totalBilletes)}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs font-normal touch:h-11" onClick={limpiar}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Limpiar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Escribe cuántas monedas y billetes hay de cada denominación — el total se calcula solo. No se guarda nada.
        </p>
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
          <TablaDenominaciones
            titulo="Monedas"
            tipo="monedas"
            icon={Coins}
            denoms={MONEDAS}
            conteo={monedas}
            onChange={(denom, qty) => setMonedas((prev) => ({ ...prev, [denom]: qty }))}
          />
          <TablaDenominaciones
            titulo="Billetes"
            tipo="billetes"
            icon={Banknote}
            denoms={BILLETES}
            conteo={billetes}
            onChange={(denom, qty) => setBilletes((prev) => ({ ...prev, [denom]: qty }))}
          />
        </div>
      </div>
    </div>
  )
}

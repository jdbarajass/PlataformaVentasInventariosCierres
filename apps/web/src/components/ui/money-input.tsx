'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'

// Input de dinero con separador de miles visual (ej. escribes "2000" y se ve
// "2.000"), igual que MoneyLineEdit del software local (ui/venta_form.py).
// El valor que entra/sale por `value`/`onChange` es siempre el número
// "crudo" en pesos como string (sin puntos), para no tener que tocar la
// lógica de cálculo existente — solo cambia cómo se ve mientras se escribe.
export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onChange: (value: string) => void
}

function formatMiles(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('es-CO')
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={formatMiles(value)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className={className}
      />
    )
  }
)
MoneyInput.displayName = 'MoneyInput'

export { MoneyInput }

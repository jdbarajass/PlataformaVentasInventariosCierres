'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { BRAND } from '@/config/brand'

// Campo "Almacén / destino" de Préstamos: lista desplegable con los locales
// de siempre (BRAND.loanPartners) + botones para elegir con un toque, pero
// sigue siendo texto libre para escribir cualquier otro local.
export function LoanPartnerInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  const listId = useId()
  const current = value.trim().toLowerCase()

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${placeholder} (elige o escribe)`}
        aria-label={placeholder}
        autoComplete="off"
        className="rounded-lg"
      />
      <datalist id={listId}>
        {BRAND.loanPartners.map((p) => <option key={p} value={p} />)}
      </datalist>
      <div className="flex flex-wrap gap-1.5">
        {BRAND.loanPartners.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={current === p.toLowerCase()}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors touch:h-9 touch:px-3 ${
              current === p.toLowerCase()
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

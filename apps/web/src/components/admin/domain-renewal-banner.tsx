'use client'

import { useEffect, useState } from 'react'
import { Globe, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { BRAND } from '@/config/brand'
import { bogotaDateStr } from '@/lib/bogota-time'
import { debeAvisarRenovacion, diasParaRenovacion } from '@/lib/domain-renewal'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Franja de aviso en el panel, solo para admin, desde 5 días antes de la
// renovación anual del dominio hasta ese día (ver lib/domain-renewal.ts).
// Se puede cerrar; vuelve a salir al día siguiente mientras siga en el rango.
export function DomainRenewalBanner() {
  const { userProfile } = useAuth()
  const renewal = BRAND.domainRenewal
  const [hoy, setHoy] = useState<string | null>(null)
  const [cerrado, setCerrado] = useState(true)

  useEffect(() => {
    if (!renewal) return
    const h = bogotaDateStr(new Date())
    setHoy(h)
    setCerrado(localStorage.getItem('aviso_renovacion_dominio_cerrado') === h)
  }, [renewal])

  const esAdmin = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'
  if (!renewal || !hoy || cerrado || !esAdmin || !debeAvisarRenovacion(hoy, renewal.monthDay)) return null

  const dias = diasParaRenovacion(hoy, renewal.monthDay)
  const [mes, dia] = renewal.monthDay.split('-').map(Number)
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`

  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm sm:p-4">
      <Globe className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="font-medium">
          El dominio {renewal.domain} se renueva {cuando} ({dia} de {MESES[mes - 1]}).
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Vercel lo cobra automáticamente a la tarjeta registrada. Revisa que esté vigente en Vercel → menú de la cuenta →
          Domains / Billing. Si el cobro falla, la tienda puede dejar de abrir en {renewal.domain}.
        </p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem('aviso_renovacion_dominio_cerrado', hoy)
          setCerrado(true)
        }}
        aria-label="Cerrar aviso de renovación del dominio"
        className="rounded-lg p-1 hover:bg-secondary touch:p-3"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

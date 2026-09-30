'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface AlertsData {
  invoices: { count: number; items: { description: string; days: number }[] }
  notes: { count: number; items: { text: string; dueDate: string }[] }
  credits: { count: number; items: { customerName: string; daysOld: number }[] }
}

const SESSION_KEY = 'yjb_session_alerts_shown'

// Recordatorios al iniciar sesión (facturas por vencer, notas urgentes,
// fiados viejos) — igual que el popup del software local al arrancar. Se
// muestra una sola vez por sesión de navegador.
export function SessionAlerts() {
  const { session } = useAuth()
  const [data, setData] = useState<AlertsData | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!session?.access_token) return
    if (sessionStorage.getItem(SESSION_KEY)) return

    fetch('/api/admin/session-alerts', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json?.data) return
        const d = json.data as AlertsData
        if (d.invoices.count > 0 || d.notes.count > 0 || d.credits.count > 0) {
          setData(d)
          setDismissed(false)
        }
        sessionStorage.setItem(SESSION_KEY, '1')
      })
      .catch(() => {})
  }, [session?.access_token])

  if (dismissed || !data) return null

  return (
    // < sm: hoja inferior; sm+: el diálogo de siempre. Ver docs/MOVIL_PANEL_ADMIN.md (Fase 5).
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="recordatorios-titulo" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border bg-card p-4 pb-6 shadow-lg animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none sm:max-h-none sm:overflow-visible sm:rounded-xl sm:p-6 sm:animate-none">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 id="recordatorios-titulo" className="text-lg font-semibold">Recordatorios</h2>
          <button onClick={() => setDismissed(true)} aria-label="Cerrar recordatorios" className="ml-auto rounded-lg p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-96 space-y-4 overflow-y-auto text-sm">
          {data.invoices.count > 0 && (
            <div>
              <p className="font-medium">📋 Facturas ({data.invoices.count} próximas a vencer)</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {data.invoices.items.map((f, i) => (
                  <li key={i}>
                    • {f.description.slice(0, 40)} — {f.days < 0 ? 'VENCIDA' : f.days === 0 ? 'hoy' : `${f.days}d`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.notes.count > 0 && (
            <div>
              <p className="font-medium">📝 Notas ({data.notes.count} con fecha límite próxima)</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {data.notes.items.map((n, i) => (
                  <li key={i}>• {n.text.slice(0, 40)} — {n.dueDate}</li>
                ))}
              </ul>
            </div>
          )}
          {data.credits.count > 0 && (
            <div>
              <p className="font-medium">💸 Fiados ({data.credits.count} con más de 30 días pendientes)</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {data.credits.items.map((c, i) => (
                  <li key={i}>• {c.customerName.slice(0, 30)} — {c.daysOld}d sin saldar</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

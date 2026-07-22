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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Recordatorios</h2>
          <button onClick={() => setDismissed(true)} className="ml-auto rounded-lg p-1 hover:bg-secondary">
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

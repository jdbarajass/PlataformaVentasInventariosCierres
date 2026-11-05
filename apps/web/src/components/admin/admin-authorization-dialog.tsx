'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AdminAuthorizationDialogProps {
  title: string
  description: string
  confirmLabel: string
  // Lanza un Error con el mensaje a mostrar si el admin no queda autorizado.
  onAuthorize: (credentials: { adminEmail: string; adminPassword: string }) => Promise<void>
  onClose: () => void
}

// Un admin autoriza en la pantalla del vendedor. Las credenciales solo viven
// en este estado local y se validan en el servidor; autoComplete evita que el
// navegador del local le ofrezca guardarlas al vendedor.
export function AdminAuthorizationDialog({ title, description, confirmLabel, onAuthorize, onClose }: AdminAuthorizationDialogProps) {
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onAuthorize({ adminEmail: adminEmail.trim(), adminPassword })
    } catch (err: any) {
      setError(err.message || 'No se pudo autorizar')
      setAdminPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="autorizacion-admin-titulo"
        onSubmit={handleSubmit}
        autoComplete="off"
        className="w-full max-w-md space-y-3 rounded-t-2xl border bg-card p-4 pb-6 sm:rounded-xl sm:p-6"
      >
        <h2 id="autorizacion-admin-titulo" className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Input
          type="email"
          placeholder="Correo del admin"
          aria-label="Correo del admin"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          autoComplete="off"
          required
          autoFocus
          className="rounded-lg"
        />
        <Input
          type="password"
          placeholder="Contraseña del admin"
          aria-label="Contraseña del admin"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="rounded-lg"
        />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="rounded-lg touch:h-11" onClick={onClose} disabled={submitting}>
            Volver
          </Button>
          <Button type="submit" variant="destructive" className="rounded-lg touch:h-11" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}

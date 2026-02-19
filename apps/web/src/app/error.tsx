'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold">Algo salió mal</h2>
        <p className="mb-6 text-muted-foreground">
          Ocurrió un error al cargar esta página.
        </p>
        <div className="flex justify-center gap-4">
          <Button onClick={reset} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Intentar de nuevo
          </Button>
          <Button asChild className="gap-2">
            <a href="/">
              <Home className="h-4 w-4" />
              Ir al inicio
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

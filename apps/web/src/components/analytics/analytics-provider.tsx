'use client'

import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initAnalytics, analytics } from '@/lib/analytics'

function AnalyticsCore() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Inicializar analytics al montar
  useEffect(() => {
    const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_API_HOST

    // Determinar provider según variables de entorno
    let provider: 'ga' | 'posthog' | 'both' | 'none' = 'none'

    if (gaId && posthogKey) {
      provider = 'both'
    } else if (gaId) {
      provider = 'ga'
    } else if (posthogKey) {
      provider = 'posthog'
    }

    if (provider !== 'none') {
      initAnalytics({
        provider,
        ga: gaId ? { measurementId: gaId } : undefined,
        posthog: posthogKey
          ? { apiKey: posthogKey, apiHost: posthogHost }
          : undefined,
      })
    } else {
      console.log('[Analytics] No analytics provider configured')
    }
  }, [])

  // Track page views al cambiar de ruta
  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    analytics.pageView(url)
  }, [pathname, searchParams])

  return null
}

export function AnalyticsProvider() {
  return (
    <Suspense fallback={null}>
      <AnalyticsCore />
    </Suspense>
  )
}

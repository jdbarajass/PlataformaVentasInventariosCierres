'use client'

import { useEffect } from 'react'
import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Log métricas en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('Web Vital:', metric)
    }

    // En producción, enviar a analytics
    if (process.env.NODE_ENV === 'production') {
      // Ejemplo: Google Analytics
      // window.gtag?.('event', metric.name, {
      //   value: Math.round(metric.value),
      //   event_label: metric.id,
      //   non_interaction: true,
      // })

      // Ejemplo: Posthog
      // window.posthog?.capture('web_vital', {
      //   metric: metric.name,
      //   value: metric.value,
      //   id: metric.id,
      //   rating: metric.rating,
      // })

      // Por ahora solo log en console
      console.log('[Web Vitals]', {
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
      })
    }
  })

  return null
}

'use client'

import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Web Vital:', metric)
    }

    if (process.env.NODE_ENV === 'production') {
      // Google Analytics
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', metric.name, {
          value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
          event_label: metric.id,
          non_interaction: true,
        })
      }

      // Posthog
      if (typeof window !== 'undefined' && window.posthog) {
        window.posthog.capture('web_vital', {
          metric: metric.name,
          value: metric.value,
          id: metric.id,
          rating: metric.rating,
        })
      }
    }
  })

  return null
}

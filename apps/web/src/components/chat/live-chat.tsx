'use client'

import { useEffect } from 'react'

/**
 * Live Chat widget using Tawk.to
 *
 * To configure:
 * 1. Create account at https://www.tawk.to/
 * 2. Create a property for your site
 * 3. Copy the Property ID and Widget ID from the admin
 * 4. Set NEXT_PUBLIC_TAWKTO_PROPERTY_ID and NEXT_PUBLIC_TAWKTO_WIDGET_ID in .env.local
 *
 * The widget will only load if both env vars are set.
 */
export function LiveChat() {
  useEffect(() => {
    const propertyId = process.env.NEXT_PUBLIC_TAWKTO_PROPERTY_ID
    const widgetId = process.env.NEXT_PUBLIC_TAWKTO_WIDGET_ID

    if (!propertyId || !widgetId) return

    // Prevent loading twice
    if (document.getElementById('tawkto-script')) return

    const script = document.createElement('script')
    script.id = 'tawkto-script'
    script.async = true
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`
    script.charset = 'UTF-8'
    script.setAttribute('crossorigin', '*')
    document.body.appendChild(script)

    return () => {
      const el = document.getElementById('tawkto-script')
      if (el) el.remove()
    }
  }, [])

  return null
}

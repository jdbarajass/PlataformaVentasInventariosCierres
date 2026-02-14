/**
 * Analytics wrapper para Google Analytics y Posthog
 * Soporta múltiples proveedores de analytics
 */

// Tipos de eventos personalizados
export type AnalyticsEvent =
  | 'page_view'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'search'
  | 'view_item'
  | 'view_item_list'
  | 'view_category'
  | 'select_item'
  | 'share'
  | 'sign_up'
  | 'login'
  | 'logout'
  | string // Permite eventos custom

export interface AnalyticsEventProperties {
  [key: string]: string | number | boolean | null | undefined
}

// --- Google Analytics ---

export function initGA(measurementId: string) {
  if (typeof window === 'undefined') return

  // Cargar script de GA
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  script.async = true
  document.head.appendChild(script)

  // Inicializar gtag
  window.dataLayer = window.dataLayer || []
  function gtag(...args: any[]) {
    window.dataLayer.push(arguments)
  }
  gtag('js', new Date())
  gtag('config', measurementId, {
    send_page_view: false, // Manejaremos page views manualmente
  })

  console.log('[Analytics] Google Analytics initialized:', measurementId)
}

export function trackGA(event: AnalyticsEvent, properties?: AnalyticsEventProperties) {
  if (typeof window === 'undefined' || !window.gtag) return

  window.gtag('event', event, properties)
  console.log('[Analytics] GA Event:', event, properties)
}

// --- Posthog ---

export function initPosthog(apiKey: string, apiHost?: string) {
  if (typeof window === 'undefined') return

  // Cargar script de Posthog
  const script = document.createElement('script')
  script.innerHTML = `
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${apiKey}',{api_host:'${apiHost || 'https://app.posthog.com'}'})
  `
  document.head.appendChild(script)

  console.log('[Analytics] Posthog initialized:', apiKey)
}

export function trackPosthog(event: AnalyticsEvent, properties?: AnalyticsEventProperties) {
  if (typeof window === 'undefined' || !window.posthog) return

  window.posthog.capture(event, properties)
  console.log('[Analytics] Posthog Event:', event, properties)
}

// --- Analytics Unified ---

let analyticsProvider: 'ga' | 'posthog' | 'both' | 'none' = 'none'

export function initAnalytics(config: {
  provider: 'ga' | 'posthog' | 'both'
  ga?: { measurementId: string }
  posthog?: { apiKey: string; apiHost?: string }
}) {
  analyticsProvider = config.provider

  if (config.provider === 'ga' && config.ga) {
    initGA(config.ga.measurementId)
  } else if (config.provider === 'posthog' && config.posthog) {
    initPosthog(config.posthog.apiKey, config.posthog.apiHost)
  } else if (config.provider === 'both') {
    if (config.ga) initGA(config.ga.measurementId)
    if (config.posthog) initPosthog(config.posthog.apiKey, config.posthog.apiHost)
  }
}

export function track(event: AnalyticsEvent, properties?: AnalyticsEventProperties) {
  if (analyticsProvider === 'ga' || analyticsProvider === 'both') {
    trackGA(event, properties)
  }
  if (analyticsProvider === 'posthog' || analyticsProvider === 'both') {
    trackPosthog(event, properties)
  }
}

// --- Helpers para eventos comunes ---

export const analytics = {
  pageView: (url: string) => {
    track('page_view', { page_path: url })
  },

  addToCart: (productId: string, productName: string, price: number, quantity: number) => {
    track('add_to_cart', {
      item_id: productId,
      item_name: productName,
      price,
      quantity,
      currency: 'COP',
    })
  },

  removeFromCart: (productId: string, productName: string) => {
    track('remove_from_cart', {
      item_id: productId,
      item_name: productName,
    })
  },

  beginCheckout: (value: number, items: number) => {
    track('begin_checkout', {
      value,
      items,
      currency: 'COP',
    })
  },

  purchase: (orderId: string, value: number, items: number) => {
    track('purchase', {
      transaction_id: orderId,
      value,
      items,
      currency: 'COP',
    })
  },

  viewProduct: (productId: string, productName: string, price: number, category?: string) => {
    track('view_item', {
      item_id: productId,
      item_name: productName,
      price,
      currency: 'COP',
      item_category: category,
    })
  },

  search: (searchTerm: string, results: number) => {
    track('search', {
      search_term: searchTerm,
      results,
    })
  },

  signUp: (method: string) => {
    track('sign_up', {
      method,
    })
  },

  login: (method: string) => {
    track('login', {
      method,
    })
  },
}

// Tipos para window
declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
    posthog: any
  }
}

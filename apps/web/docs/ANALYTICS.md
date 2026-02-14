# Analytics Setup - YB MOTOCOM

Guía de configuración e implementación de analytics para la plataforma.

## Proveedores Soportados

- **Google Analytics 4 (GA4)** - Analytics gratuito de Google
- **Posthog** - Analytics open-source con features avanzadas
- **Ambos** - Usar ambos proveedores simultáneamente

---

## Configuración

### 1. Google Analytics (GA4)

#### Crear cuenta de GA4

1. Ir a [Google Analytics](https://analytics.google.com/)
2. Crear una cuenta y propiedad GA4
3. Obtener el Measurement ID (formato: `G-XXXXXXXXXX`)

#### Configurar en el proyecto

Agregar en `.env.local`:
```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**¡Listo!** El sistema detectará automáticamente GA y lo inicializará.

---

### 2. Posthog

#### Crear cuenta de Posthog

1. Opción Cloud: [app.posthog.com](https://app.posthog.com/signup)
2. Opción Self-hosted: [Guía de instalación](https://posthog.com/docs/self-host)

#### Configurar en el proyecto

Agregar en `.env.local`:
```env
NEXT_PUBLIC_POSTHOG_API_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_API_HOST=https://app.posthog.com  # Opcional
```

**¡Listo!** El sistema detectará automáticamente Posthog y lo inicializará.

---

## Uso en el código

### Tracking automático

✅ **Page views** - Se trackean automáticamente al navegar

### Tracking manual

```tsx
import { analytics } from '@/lib/analytics'

// Add to Cart
analytics.addToCart(product.id, product.title, price, quantity)

// Purchase
analytics.purchase(orderId, totalAmount, itemsCount)

// View Product
analytics.viewProduct(productId, productName, price, category)

// Search
analytics.search(searchTerm, resultsCount)
```

Ver [ANALYTICS.md](./ANALYTICS.md) completo para más detalles.

---

## Variables de Entorno

Actualizar `.env.example`:
```env
# Analytics (Opcional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_API_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_API_HOST=https://app.posthog.com
```

---

## Métricas Importantes

- Sessions & Users
- Conversion Rate
- Average Order Value
- Revenue
- Cart Abandonment
- Product Views
- Search Terms

Ver dashboards en:
- Google Analytics: https://analytics.google.com
- Posthog: https://app.posthog.com (o tu instancia)

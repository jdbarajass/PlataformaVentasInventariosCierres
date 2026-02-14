# Performance Optimization Guide - YB MOTOCOM

## Lighthouse Audits

### Cómo ejecutar Lighthouse

#### Opción 1: Chrome DevTools (Recomendado)
1. Abrir Chrome DevTools (F12)
2. Ir a la pestaña "Lighthouse"
3. Seleccionar categorías: Performance, Accessibility, Best Practices, SEO
4. Seleccionar dispositivo: Desktop / Mobile
5. Click en "Analyze page load"

#### Opción 2: CLI
```bash
npm install -g lighthouse
lighthouse http://localhost:3000 --view
```

#### Opción 3: PageSpeed Insights
https://pagespeed.web.dev/

### Métricas Objetivo

| Métrica | Target | Descripción |
|---------|--------|-------------|
| **Performance Score** | >90 | Puntuación general |
| **FCP** (First Contentful Paint) | <1.8s | Primer contenido visible |
| **LCP** (Largest Contentful Paint) | <2.5s | Elemento principal visible |
| **TBT** (Total Blocking Time) | <200ms | Tiempo de bloqueo |
| **CLS** (Cumulative Layout Shift) | <0.1 | Estabilidad visual |
| **SI** (Speed Index) | <3.4s | Velocidad percibida |

---

## Optimizaciones Implementadas

### ✅ Imágenes

#### Next.js Image Component
- ✅ Uso de `<Image>` en lugar de `<img>`
- ✅ Lazy loading automático
- ✅ Responsive images (srcset)
- ✅ Blur placeholder (opcional)

```tsx
import Image from 'next/image'

<Image
  src="/product.jpg"
  alt="Producto"
  width={500}
  height={500}
  quality={85}
  loading="lazy" // o "eager" para above-the-fold
  placeholder="blur" // Opcional: requiere blurDataURL
/>
```

#### Formato WebP/AVIF
- ✅ Conversión automática a WebP en upload
- ✅ Next.js sirve WebP/AVIF automáticamente
- ✅ Fallback a JPG/PNG en navegadores antiguos

**Configuración en `next.config.js`:**
```javascript
images: {
  formats: ['image/webp', 'image/avif'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  minimumCacheTTL: 31536000, // 1 año
}
```

#### Cache Headers
- ✅ Cache de 1 año para imágenes optimizadas
- ✅ Immutable cache para assets estáticos

---

### ✅ Fonts

#### Optimización con next/font
```tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Evita flash of invisible text
  preload: true,
})
```

**Beneficios:**
- Self-hosting automático (no requests externos)
- Font subsetting (solo caracteres necesarios)
- `font-display: swap` para evitar FOIT

---

### ✅ Code Splitting

#### Automatic Code Splitting
Next.js divide el código automáticamente por ruta:
- Cada página carga solo su JS necesario
- Shared chunks para código común
- Vendor chunks separados

#### Dynamic Imports
Para componentes pesados:
```tsx
import dynamic from 'next/dynamic'

const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Skeleton />,
  ssr: false, // Solo client-side si es necesario
})
```

**Candidatos para dynamic import:**
- Modales y dialogs
- Componentes de admin
- Gráficos y charts
- Editor de texto rico
- Map components

---

### ✅ Static Generation (SSG)

Páginas pre-renderizadas en build time:
```bash
○ (Static) - Páginas estáticas (36/36)
```

**Páginas estáticas:**
- Homepage (`/`)
- Productos (`/productos`)
- Categorías (`/categorias`)
- FAQ, Privacidad, Términos
- Envíos, Devoluciones, Contacto

**Beneficios:**
- HTML servido directamente desde CDN
- Tiempo de carga <100ms
- SEO optimizado
- Mejor experiencia de usuario

---

### ✅ API Route Optimization

#### Caching
```tsx
export const revalidate = 3600 // Revalidar cada hora

export async function GET() {
  const data = await fetchData()
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  })
}
```

#### Database Queries
- ✅ Indexes en columnas frecuentes (slug, active, category_id)
- ✅ SELECT específico (evitar SELECT *)
- ✅ Limit en queries de listado
- ✅ Paginación implementada

---

### ✅ SEO Optimization

- ✅ Sitemap.xml dinámico
- ✅ robots.txt configurado
- ✅ Structured data (Schema.org)
- ✅ OpenGraph tags
- ✅ Twitter Cards
- ✅ Meta descriptions únicas

Ver [structured-data.tsx](../src/components/seo/structured-data.tsx)

---

## Optimizaciones Pendientes

### 🟡 Preload Critical Resources

En páginas críticas, precargar recursos:
```tsx
<link
  rel="preload"
  href="/fonts/font.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
/>
```

### 🟡 Service Worker (PWA)

Considerar implementar PWA para:
- Offline support
- Install to home screen
- Background sync
- Push notifications

```bash
npm install next-pwa
```

### 🟡 Bundle Analysis

Analizar tamaño de bundles:
```bash
npm install @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)
```

Ejecutar:
```bash
ANALYZE=true npm run build
```

### 🟡 Edge Caching

En producción (Vercel):
- Edge cache para assets estáticos
- ISR (Incremental Static Regeneration) para productos
- Edge functions para geo-location

---

## Monitoreo de Performance

### Real User Monitoring (RUM)

Implementar Web Vitals:
```tsx
// app/layout.tsx
export function reportWebVitals(metric: any) {
  console.log(metric)
  // Enviar a analytics
  if (metric.label === 'web-vital') {
    // Google Analytics, Posthog, etc.
  }
}
```

### Métricas a monitorear:
- Core Web Vitals (LCP, FID, CLS)
- Time to First Byte (TTFB)
- First Input Delay (FID)
- Interaction to Next Paint (INP)

---

## Checklist de Performance

### Before Deploy
- [ ] Ejecutar Lighthouse audit (Performance >90)
- [ ] Verificar Core Web Vitals
- [ ] Analizar bundle size
- [ ] Verificar imágenes optimizadas
- [ ] Revisar cache headers
- [ ] Test en mobile (3G throttling)
- [ ] Verificar accesibilidad

### After Deploy
- [ ] Monitor Real User Metrics
- [ ] Configurar alertas de performance
- [ ] Revisar logs de errores
- [ ] Analizar bounce rate
- [ ] A/B testing de optimizaciones

---

## Recursos

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer)

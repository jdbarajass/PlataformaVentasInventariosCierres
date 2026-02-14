# Deployment Guide - YB MOTOCOM

Guía completa de deployment para Vercel y Netlify.

---

## 🚀 Opción 1: Vercel (Recomendado)

Vercel es la plataforma creada por el equipo de Next.js. Ofrece la mejor integración y features automáticos.

### Ventajas de Vercel
- ✅ Zero-config para Next.js
- ✅ Edge Functions automáticos
- ✅ Preview deployments en cada PR
- ✅ Incremental Static Regeneration (ISR)
- ✅ Image Optimization incluido
- ✅ Analytics gratis
- ✅ 100GB bandwidth gratis/mes

### Pasos para Deploy en Vercel

#### 1. Crear cuenta en Vercel

1. Ir a [vercel.com](https://vercel.com)
2. Sign up con GitHub (recomendado)
3. Autorizar acceso a tu repositorio

#### 2. Import Project

1. Click en "Add New..." → "Project"
2. Seleccionar el repositorio `PlataformaVentasInventariosCierres`
3. Configurar:
   - **Framework Preset**: Next.js (auto-detectado)
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build` (auto-detectado)
   - **Output Directory**: `.next` (auto-detectado)

#### 3. Configurar Variables de Entorno

En "Environment Variables", agregar:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx  # ⚠️ Usar LIVE keys en producción
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=pedidos@ybmotocom.com

# App
NEXT_PUBLIC_APP_URL=https://ybmotocom.com
NEXT_PUBLIC_SITE_URL=https://ybmotocom.com

# Analytics (Opcional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_API_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_API_HOST=https://app.posthog.com

# Sentry (Opcional)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

**IMPORTANTE**: Usar Production keys, no Test keys.

#### 4. Deploy

1. Click en "Deploy"
2. Esperar ~2-3 minutos
3. ¡Tu sitio está live! 🎉

URL de producción: `https://tu-proyecto.vercel.app`

#### 5. Configurar Dominio Custom (Opcional)

1. Ir a "Settings" → "Domains"
2. Agregar tu dominio: `ybmotocom.com`
3. Configurar DNS según instrucciones de Vercel:
   - **Tipo A**: `76.76.21.21`
   - **Tipo CNAME**: `cname.vercel-dns.com`
4. Esperar propagación DNS (5-60 minutos)

#### 6. Configurar Webhooks de Stripe

1. Ir a [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Agregar endpoint: `https://ybmotocom.com/api/payments/webhook`
3. Seleccionar eventos:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copiar "Signing secret" y actualizar `STRIPE_WEBHOOK_SECRET` en Vercel

---

## 🌐 Opción 2: Netlify

### Ventajas de Netlify
- ✅ Fácil de usar
- ✅ Buen soporte para Next.js
- ✅ 100GB bandwidth gratis/mes
- ✅ Forms y Functions incluidos

### Pasos para Deploy en Netlify

#### 1. Instalar plugin de Next.js

Crear `netlify.toml` en la raíz del proyecto:

```toml
[build]
  base = "apps/web"
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### 2. Crear cuenta en Netlify

1. Ir a [netlify.com](https://netlify.com)
2. Sign up con GitHub
3. Autorizar acceso al repositorio

#### 3. Import Project

1. Click en "Add new site" → "Import an existing project"
2. Seleccionar GitHub
3. Seleccionar el repositorio
4. Configurar:
   - **Base directory**: `apps/web`
   - **Build command**: `npm run build`
   - **Publish directory**: `apps/web/.next`

#### 4. Configurar Variables de Entorno

En "Site settings" → "Environment variables", agregar las mismas variables que en Vercel.

#### 5. Deploy

1. Click en "Deploy site"
2. Esperar ~3-5 minutos
3. ¡Tu sitio está live! 🎉

URL de producción: `https://tu-proyecto.netlify.app`

---

## 📋 Checklist Pre-Deployment

### Variables de Entorno
- [ ] Supabase URL y keys configuradas
- [ ] Stripe keys de PRODUCCIÓN configuradas
- [ ] Resend API key configurada
- [ ] Site URL configurada (`NEXT_PUBLIC_SITE_URL`)
- [ ] Analytics configurado (opcional)

### Supabase
- [ ] Row Level Security (RLS) habilitado en todas las tablas
- [ ] Políticas de seguridad configuradas
- [ ] Storage bucket `product-images` público
- [ ] Auth providers configurados (si usas OAuth)

### Stripe
- [ ] Webhook configurado con URL de producción
- [ ] Productos y precios creados en modo LIVE
- [ ] Métodos de pago habilitados (tarjetas, etc.)

### SEO
- [ ] sitemap.xml generado
- [ ] robots.txt configurado
- [ ] Meta tags en todas las páginas
- [ ] Structured data (Schema.org)
- [ ] OpenGraph images

### Performance
- [ ] Lighthouse score >90
- [ ] Imágenes optimizadas (WebP)
- [ ] Fonts optimizados
- [ ] Cache headers configurados

### Testing
- [ ] Tests E2E pasando (`npm run test:e2e`)
- [ ] Build local exitoso (`npm run build`)
- [ ] No errores en consola
- [ ] Mobile responsiveness verificado

---

## 🔄 CI/CD con GitHub Actions

### Setup automático de deployments

Crear `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: apps/web/package-lock.json

      - name: Install dependencies
        run: cd apps/web && npm ci

      - name: Run tests
        run: cd apps/web && npm run test:run

      - name: Build
        run: cd apps/web && npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/web
```

---

## 🔒 Seguridad Post-Deployment

### 1. Headers de Seguridad

Agregar en `next.config.js`:

```javascript
async headers() {
  return [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'on'
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload'
        },
        {
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN'
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block'
        },
        {
          key: 'Referrer-Policy',
          value: 'origin-when-cross-origin'
        }
      ]
    }
  ]
}
```

### 2. Verificar Supabase RLS

```sql
-- Ejemplo de política RLS para productos
CREATE POLICY "Productos públicos visibles para todos"
ON products FOR SELECT
USING (active = true);

CREATE POLICY "Solo admins pueden insertar productos"
ON products FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);
```

### 3. Rate Limiting

Considerar implementar rate limiting en API routes:

```tsx
// Ejemplo con Vercel Edge Config
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const limiter = rateLimit({
    interval: 60 * 1000, // 1 minuto
    uniqueTokenPerInterval: 500,
  })

  try {
    await limiter.check(10, 'CACHE_TOKEN') // 10 requests por minuto
  } catch {
    return new Response('Rate limit exceeded', { status: 429 })
  }

  // Tu lógica aquí...
}
```

---

## 📊 Monitoreo Post-Deployment

### 1. Vercel Analytics

- Ir a tu proyecto en Vercel
- Habilitar "Analytics" (gratis)
- Ver métricas de Web Vitals en tiempo real

### 2. Sentry (Errores)

```bash
npm install @sentry/nextjs
npx @sentry/wizard -i nextjs
```

### 3. Uptime Monitoring

Servicios recomendados:
- [UptimeRobot](https://uptimerobot.com) - Gratis hasta 50 monitors
- [Better Uptime](https://betteruptime.com) - Gratis hasta 10 monitors

### 4. Google Search Console

1. Ir a [search.google.com/search-console](https://search.google.com/search-console)
2. Agregar propiedad: `ybmotocom.com`
3. Verificar ownership con DNS o archivo HTML
4. Enviar sitemap: `https://ybmotocom.com/sitemap.xml`

---

## 🐛 Troubleshooting

### Build falla

**Error**: `Module not found`
- Verificar que todas las dependencias estén en `package.json`
- Ejecutar `npm install` localmente

**Error**: `Environment variable not found`
- Verificar que todas las variables estén configuradas en Vercel/Netlify
- Variables `NEXT_PUBLIC_*` deben estar presentes en build time

### Imágenes no cargan

- Verificar que el dominio de Supabase esté en `next.config.js` → `images.remotePatterns`
- Verificar que el bucket de Supabase sea público

### API routes fallan

- Verificar CORS en Supabase
- Verificar que las keys de Supabase sean correctas
- Ver logs en Vercel: "Deployments" → Click en deployment → "Functions"

### Stripe webhook no funciona

- Verificar que el endpoint sea accesible: `https://ybmotocom.com/api/payments/webhook`
- Verificar que `STRIPE_WEBHOOK_SECRET` sea el correcto
- Ver logs en Stripe Dashboard → "Webhooks" → "Recent deliveries"

---

## 📈 Optimizaciones Post-Deployment

### 1. CDN para assets estáticos

Vercel y Netlify incluyen CDN automáticamente. No requiere configuración.

### 2. Database indexing

```sql
-- Índices recomendados para Supabase
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(payment_status);
```

### 3. Image optimization

Ya implementado con:
- Next.js Image component
- WebP conversion
- Responsive images

---

## ✅ Checklist Final

### Pre-deployment
- [ ] Todas las variables de entorno configuradas
- [ ] Build local exitoso
- [ ] Tests pasando
- [ ] Lighthouse >90

### Post-deployment
- [ ] Sitio accesible en producción
- [ ] Stripe webhook configurado y funcionando
- [ ] Emails enviándose correctamente (Resend)
- [ ] Analytics funcionando
- [ ] Dominio custom configurado (opcional)
- [ ] SSL/HTTPS habilitado
- [ ] Sitemap enviado a Google Search Console
- [ ] Uptime monitoring configurado

### Seguridad
- [ ] Supabase RLS habilitado
- [ ] Headers de seguridad configurados
- [ ] Secrets rotados (no usar keys de desarrollo)
- [ ] 2FA habilitado en servicios críticos (Vercel, Supabase, Stripe)

---

## 📞 Soporte

### Vercel
- Docs: https://vercel.com/docs
- Support: support@vercel.com
- Discord: https://vercel.com/discord

### Netlify
- Docs: https://docs.netlify.com
- Support: support@netlify.com
- Forum: https://answers.netlify.com

### Next.js
- Docs: https://nextjs.org/docs
- GitHub: https://github.com/vercel/next.js

---

## 🎉 ¡Deployment Completado!

Tu aplicación ahora está en producción. Pasos siguientes:

1. **Monitor**: Ver analytics y errores
2. **Iterate**: Mejorar basado en feedback de usuarios
3. **Scale**: Upgrade plan si es necesario (más tráfico)

**URL de producción**: https://ybmotocom.com 🚀

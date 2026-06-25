# CHANGELOG — YJBMOTOCOM

Historial completo de versiones y cambios del proyecto.

---

## [v10.1] — Fix: carga infinita en Mi Cuenta (2026-06-25)

### Bug fix

Tras login exitoso, `/mi-cuenta` podía quedarse pegada indefinidamente en
"Cargando tu cuenta..." sin mensaje de error ni forma de salir, cuando la
carga de perfil/pedidos fallaba o se colgaba (red lenta, VPN/firewall
corporativo interceptando la petición a Supabase).

#### app/(shop)/mi-cuenta/page.tsx
- `loadData()` envuelto en `try/catch/finally` — `setLoading(false)` ahora
  se ejecuta siempre, incluso si falla la carga de sesión, perfil u órdenes
- Timeout de 10s en `supabase.auth.getSession()` vía `Promise.race` para
  cubrir el caso de una petición que nunca resuelve ni rechaza
- Toast de error visible al usuario si la carga falla, en vez de spinner
  infinito sin feedback

---

## [v9.0] — Racing Dark Premium Frontend (2026-02-19)
**Rama:** `racing-dark-premium`

### Rediseño completo de UI/UX — Racing Dark Premium v3

Transformación del frontend de un diseño funcional a un UI/UX de nivel Awwwards:
glassmorphism, carbon fiber texture, aurora gradients, microinteracciones.

#### globals.css
- Nuevos tokens CSS: `--highlight`, `--highlight-sm`, `--spotlight`
- Nueva clase `.card-premium`: sombra multicapa + highlight inset + glow en hover + `::before` línea gradiente superior
- Nueva clase `.aurora-bg`: fondo con gradiente radial mesh diferente para light/dark
- Nueva clase `.carbon-texture`: textura fibra de carbono con gradientes diagonales
- Nueva clase `.skeleton`: loader con shimmer animado
- Nueva clase `.text-aurora`: texto con gradiente animado `background-size: 200%`
- Nuevas clases `.marquee-track` y `.marquee-track-reverse`: marquee CSS infinito
- Nueva clase `.marquee-wrapper:hover`: pausa la animación al hacer hover
- Nuevos keyframes: `breathe`, `breathe-spotlight`, `marquee`, `aurora-text`, `border-gradient`, `reveal-up`
- Fix: `duration-500` (era `duration-600` que no existe en Tailwind)

#### tailwind.config.ts
- Keyframes añadidos: `breathe`, `marquee`, `reveal-up`, `spin-slow`
- Animaciones añadidas: `breathe`, `breathe-fast`, `marquee`, `marquee-reverse`, `marquee-slow`, `reveal-up`, `spin-slow`
- Sombras añadidas: `glow-red-lg`, `glow-amber`, `glow-white`, `premium`, `premium-hover`, `inner-top`, `whatsapp`, `whatsapp-hover`

#### theme-toggle.tsx (reescritura completa)
- Pill deslizante sol/luna: track de 60px, pill interior que se desliza
- Iconos Sun y Moon siempre visibles (con opacidad) en el track
- Transición spring con `cubic-bezier(0.34,1.56,0.64,1)` via inline style
- Placeholder SSR con mismas dimensiones para evitar layout shift

#### product-card.tsx (reescritura completa)
- Sombra multicapa con hover upgrade via overlay div animado
- Línea inset superior con gradiente
- Rating stars decorativo (4.8 estrellas)
- Área de imagen con `bg-gradient-to-br`
- Borde rojo inset en hover via `box-shadow`
- Botón add-to-cart con slide-up desde abajo

#### header.tsx (reescritura completa)
- Línea degradada roja al fondo al hacer scroll
- Logo con highlight superior `inset 0 1px 0 rgba(255,255,255,0.3)`
- Hint `⌘K` en barra de búsqueda (pantallas grandes)
- `shadow-whatsapp` y `shadow-whatsapp-hover` en botón flotante

#### footer.tsx (reescritura completa)
- Strip CTA con glassmorphism + glow blob animado
- Sección de métodos de pago (Tarjeta, Transferencia, Nequi, Daviplata)
- Íconos de contacto en pills rojos
- Links sociales con `hover:-translate-y-0.5`

#### app/(shop)/page.tsx — Home (reescritura completa)
- Hero cinematográfico: `min-h-[88vh]`, `carbon-texture` + `aurora-bg` + 2 orbs `animate-breathe`
- `text-aurora` en palabra clave del heading
- Hero visual card: `card-glass rounded-3xl` con stats grid (3 columnas) + quick links categorías
- Trust badges con `card-glass` y hover glow
- Chips de categoría con `hover:-translate-y-0.5`
- Use-cases: `card-premium h-56` + `carbon-texture` overlay + escala de icono en hover
- **Marquee infinito de marcas**: 2 filas, direcciones opuestas, pausa en hover. Array duplicado `[...brands, ...brands]` con `translateX(-50%)`
- Comparador rápido: 3 `card-premium` con puntos conectores
- Newsletter: grid 2 columnas, formulario en `card-glass`

#### app/(shop)/ofertas/page.tsx (reescritura completa)
- Hero con `aurora-bg` + `carbon-texture` + flame glow `animate-breathe`
- Stats en 3 `card-glass` (cantidad, descuento máximo, descuento promedio)
- Empty state premium: `card-glass` con glow, 2 CTAs, pill de estado

#### app/(shop)/nosotros/page.tsx (reescritura completa)
- Hero con `aurora-bg` + `carbon-texture` + fila de 5 estrellas
- Stats strip con `group-hover:scale-110`
- Misión/Visión: `card-premium` con overlay de gradiente en hover
- **Timeline de 9 años**: línea central `absolute left-6 bg-gradient-to-b from-primary/50`, year dots circulares
- Values grid: 6 `card-premium` con `hover:-translate-y-1.5`
- CTA con `carbon-texture` + blobs `animate-breathe`

#### app/(shop)/productos/page.tsx (reescritura completa)
- **Sticky top bar**: `sticky top-16 z-30 backdrop-blur-xl` con breadcrumb + contador + sort
- Pill "Filtros activos" con `SlidersHorizontal` icon
- Suspense fallback con skeleton loaders en sidebar
- Paginación con `shadow-glow-red-sm` en página activa
- Empty state con `animate-breathe` glow + icono `rounded-3xl`

---

## [v8.0] — Frontend Rediseño 2 (2026-02-14)
**Rama:** `main`

- Segunda iteración de UI: diseño oscuro con tonos racing
- Componentes shadcn/ui integrados
- Layout header/footer mejorado
- Sistema de design tokens en CSS variables

---

## [v7.0] — Frontend Rediseño 1 (2026-02-10)
**Rama:** `front-principal`

- Primera iteración de UI premium sobre la base funcional
- ThemeToggle dark/light mode con localStorage
- ProductCard con wishlist y carrito
- Header con mega dropdown de categorías

---

## [v6.0] — Features Avanzadas (2026-02-09)

- **Cupones de descuento**: CRUD admin + validación en checkout + API
- **Reseñas y valoraciones**: CRUD + moderación admin + display en producto
- **Comparador de productos**: hasta 3 productos, barra sticky
- **Lista de favoritos (wishlist)**: persistencia en localStorage + context
- **Suscripción a restock**: notificación por email cuando vuelve a haber stock
- **Analytics avanzado**: GA4 + PostHog integrados con eventos custom
- **Chat en vivo**: Tawk.to widget integrado
- **Configuración de tienda**: tabla `store_settings` + API + panel admin

---

## [v5.0] — Suite de Tests (2026-02-08)

- **Tests unitarios (Vitest)**: button, badge, input, utils.cn(), stripe-helpers, products-api
- **Tests E2E (Playwright)**: homepage, products, cart, checkout, admin, public-pages
- Configuración de `vitest.config.ts` con jsdom + alias `@/`
- Configuración de `playwright.config.ts` con Chromium + Mobile Chrome
- Setup de mocks: Next.js router, localStorage, matchMedia, ResizeObserver
- Script `test:coverage` con reporte de cobertura

---

## [v4.0] — SEO y Optimización (2026-02-07)

- **Sitemap dinámico**: `sitemap.ts` con todas las rutas + slugs de productos
- **robots.txt**: generado dinámicamente
- **Open Graph**: metadata completo en todas las páginas
- **JSON-LD structured data**: Product, BreadcrumbList, Organization
- **Web Vitals**: reporter integrado con GA4 + PostHog
- **Imágenes WebP**: script de conversión + optimización Next.js Image
- **Sentry**: error monitoring en browser, server y edge runtime
- **Cache headers**: configurados en `next.config.js` para assets estáticos
- **`commitlint`**: reglas de commits convencionales + Husky

---

## [v3.0] — Pagos y Emails (2026-02-06)

- **Stripe**: checkout completo, webhooks, gestión de estado de órdenes
- **MercadoPago**: preference API, webhooks, instrucciones de pago
- **Resend + React Email**: 6 plantillas transaccionales
  - Confirmación de orden (cliente)
  - Orden enviada (cliente)
  - Nueva orden (admin)
  - Instrucciones de pago MP (cliente)
  - Alerta stock bajo (admin)
  - Notificación restock (cliente)
- Página de confirmación de orden con QR/código
- **Rate limiting** en APIs sensibles
- Validaciones Zod en todos los endpoints

---

## [v2.0] — Panel Admin Completo (2026-02-05)

- **Dashboard**: KPIs en tiempo real (ventas del día, stock bajo, top 5 productos)
- **Productos**: CRUD con carga de imágenes a Supabase Storage (ImageUploader)
- **Inventario**: ajustes de stock, historial, alertas de mínimo
- **Órdenes**: listado, filtros, cambio de estado, generación de factura PDF
- **Cierres diarios**: registro de efectivo, transferencias, pasarelas, gastos
- **Reportes**: ventas por período, exportación CSV
- **Usuarios**: gestión de roles (admin, staff, cliente)
- **Auditoría**: log de todas las acciones admin con usuario + timestamp
- Auth guard en layout admin: redirige a `/login` si no autenticado
- `@supabase/auth-helpers-nextjs` para auth por cookies (SSR-safe)

---

## [v1.0] — Arquitectura Base (2026-02-01)

- Monorepo: `apps/web/` (Next.js), `infra/supabase/` (SQL), `scripts/`, `docs/`
- Schema de base de datos: 11 tablas
  - `products`, `categories`, `orders`, `order_items`
  - `inventory_adjustments`, `daily_closures`
  - `users`, `reviews`, `coupons`, `coupon_uses`
  - `store_settings`, `restock_subscriptions`
- 26 políticas Row Level Security (RLS) en Supabase
- 20+ API Routes RESTful en Next.js App Router
- Contextos React: Auth, Cart, Wishlist, Compare
- Tipos TypeScript completos en `src/types/database.ts`
- Configuración Tailwind con design system base
- `.env.example` con las 28 variables documentadas
- Deploy guide para Vercel en `docs/PENDIENTE_CONFIGURACION.md`

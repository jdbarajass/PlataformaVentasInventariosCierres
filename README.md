# YJBMOTOCOM — Plataforma de Ventas, Inventarios y Cierres

Tienda online premium de accesorios para motos con panel de administración completo.
Diseño **Racing Dark Premium** — UI/UX de nivel Awwwards con glassmorphism, carbon fiber texture y aurora gradients.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Framework** | Next.js 14.1 (App Router) + TypeScript |
| **Estilos** | Tailwind CSS 3.4 + shadcn/ui + tailwindcss-animate |
| **Base de datos** | Supabase (PostgreSQL + Auth + Storage) |
| **Pagos** | Stripe + MercadoPago |
| **Emails** | Resend + React Email |
| **Monitoreo** | Sentry (browser + server + edge) |
| **Analytics** | Google Analytics 4 + PostHog |
| **Chat** | Tawk.to |
| **Tests** | Vitest (unitarios) + Playwright (E2E) |

---

## Ramas Principales

| Rama | Descripción |
|------|-------------|
| `main` | Base estable — frontend segunda iteración |
| `front-principal` | Frontend primera iteración |
| `racing-dark-premium` | **Rama activa** — Racing Dark Premium v3 (UI/UX rediseño completo) |

---

## Estructura del Proyecto

```
PROYECTO_YB_MOTOCOM/
├── apps/
│   └── web/                          # Next.js (frontend + API routes)
│       ├── src/
│       │   ├── app/                  # App Router (páginas y API)
│       │   │   ├── (shop)/           # Rutas públicas (15+ páginas)
│       │   │   ├── admin/            # Panel admin (10 secciones)
│       │   │   └── api/             # API Routes (20+ endpoints)
│       │   ├── components/           # Componentes reutilizables
│       │   ├── lib/                  # Utilidades, contexts, helpers
│       │   ├── emails/               # Plantillas React Email (6)
│       │   └── types/               # Tipos TypeScript
│       └── e2e/                      # Tests E2E con Playwright
├── infra/
│   └── supabase/                     # Migraciones SQL
├── scripts/
│   └── convert-images-webp.js        # Conversión de imágenes a WebP
├── docs/                             # Documentación del proyecto
│   ├── ANALISIS_PROYECTO.md
│   ├── PENDIENTE_CONFIGURACION.md
│   ├── INTEGRACION_PAGOS_STRIPE.md
│   ├── STRIPE_QUICK_START.md
│   └── UX/guide.md                   # Design system Racing Dark
├── ImágenesDeReferenciaPagina/       # Referencias visuales del rediseño
├── CHANGELOG.md                      # Historial de versiones
└── README.md
```

---

## Instalación

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/jdbarajass/PlataformaVentasInventariosCierres.git
git checkout racing-dark-premium
cd apps/web
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con tus credenciales:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# MercadoPago
MERCADOPAGO_ACCESS_TOKEN=tu_access_token
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=tu_public_key

# Email
RESEND_API_KEY=re_xxx
EMAIL_FROM=noreply@yjbmotocom.co

# Monitoreo
SENTRY_DSN=tu_sentry_dsn
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-xxx
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_TAWK_PROPERTY_ID=xxx
```

### 3. Crear tablas en Supabase

```bash
# Ejecutar en Supabase Dashboard > SQL Editor:
infra/supabase/migrations.sql          # Schema principal (ejecutar primero)
infra/supabase/migrations_fix.sql      # Fix inicial
infra/supabase/fix-images-and-user.sql # Fix de imágenes y usuarios
infra/supabase/add_store_settings.sql  # Tabla configuración de tienda
infra/supabase/rls_policies.sql        # Row Level Security (26 políticas)
infra/supabase/fase8_mejoras.sql       # Mejoras fase 8
infra/supabase/fase10_restock.sql      # Notificaciones restock (pendiente)
```

### 4. Iniciar desarrollo

```bash
npm run dev
# → http://localhost:3000
```

---

## Características

### Tienda Pública (15+ rutas)
- Catálogo de productos con filtros avanzados (categoría, precio, stock) y paginación
- Búsqueda en tiempo real
- Carrito de compras persistente
- Checkout con **Stripe** y **MercadoPago**
- Comparador de productos
- Lista de favoritos (wishlist)
- Reseñas y valoraciones
- Suscripción a alertas de restock
- Cupones de descuento
- Diseño **Racing Dark Premium**: glassmorphism, carbon fiber, aurora gradients
- Mobile-first, dark/light mode con toggle animado

### Panel Admin (`/admin`) — 10 secciones
- **Dashboard** con KPIs en tiempo real (ventas, stock bajo, top productos)
- **Productos** — CRUD completo con carga de imágenes a Supabase Storage
- **Inventario** — Gestión de stock con ajustes y alertas
- **Órdenes** — Seguimiento y gestión de pedidos
- **Cierres diarios** — Efectivo, transferencias, MercadoPago, Stripe
- **Reportes** — Ventas con exportación CSV
- **Cupones** — Creación y gestión de descuentos
- **Reseñas** — Moderación de comentarios
- **Usuarios** — Gestión de roles y permisos
- **Auditoría** — Logs de todas las acciones admin
- **Configuración** — Datos de la tienda, métodos de pago

### Emails Transaccionales (6 plantillas)
- Confirmación de orden
- Orden enviada
- Nueva orden (admin)
- Instrucciones de pago (MercadoPago)
- Alerta de stock bajo (admin)
- Notificación de restock (cliente)

---

## Scripts Disponibles

```bash
npm run dev           # Servidor de desarrollo (localhost:3000)
npm run build         # Build de producción
npm run start         # Iniciar producción
npm run lint          # ESLint
npm run test          # Tests unitarios (Vitest, modo watch)
npm run test:run      # Tests unitarios (una sola vez)
npm run test:coverage # Tests con reporte de cobertura
npm run test:e2e      # Tests E2E (Playwright)
npm run test:e2e:ui   # Tests E2E con interfaz visual
```

---

## API Endpoints

### Productos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/products` | Listar productos (filtros, paginación) |
| GET | `/api/products/[id]` | Detalle de producto |
| POST | `/api/products` | Crear producto (admin) |
| PUT | `/api/products/[id]` | Actualizar producto (admin) |
| DELETE | `/api/products/[id]` | Eliminar producto (admin) |

### Órdenes y Pagos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/orders` | Crear orden |
| GET | `/api/orders/[id]` | Detalle de orden |
| PUT | `/api/orders/[id]` | Actualizar estado orden |
| GET | `/api/orders/[id]/invoice` | Descargar factura PDF |
| POST | `/api/payments/webhook` | Webhook Stripe |
| POST | `/api/payments/mercadopago/webhook` | Webhook MercadoPago |

### Admin y Operaciones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/inventory/adjust` | Ajustar inventario |
| GET/POST | `/api/daily-closures` | Cierres diarios |
| GET | `/api/reports/sales` | Reporte de ventas |
| GET | `/api/analytics/top-products` | Top productos |
| GET/POST | `/api/reviews` | Reseñas |
| GET/POST | `/api/coupons` | Cupones |
| POST | `/api/coupons/validate` | Validar cupón |
| POST | `/api/upload` | Subir imagen |
| GET/POST | `/api/users` | Usuarios |
| GET/PUT | `/api/settings` | Configuración tienda |
| POST | `/api/restock/subscribe` | Suscripción restock |
| GET | `/api/admin/audit-logs` | Logs de auditoría |

---

## Frontend — Racing Dark Premium

Design system implementado en `apps/web/src/app/globals.css` y `tailwind.config.ts`:

### Tokens CSS
```css
--primary: red-600           /* Color de marca */
--glass-bg: rgba(...)        /* Fondo glassmorphism */
--highlight: rgba(255,255,255,0.08)  /* Borde superior iluminado */
--spotlight: radial-gradient(...)    /* Spotlight de fondo */
```

### Clases personalizadas
| Clase | Descripción |
|-------|-------------|
| `card-premium` | Card con sombra multicapa + highlight + glow en hover |
| `card-glass` | Card glassmorphism con backdrop-blur |
| `aurora-bg` | Fondo con gradiente radial animado (aurora) |
| `carbon-texture` | Textura fibra de carbono (gradiente diagonal) |
| `text-aurora` | Texto con gradiente animado |
| `btn-racing` | Botón primario Racing Dark (rojo con glow) |
| `btn-outline-racing` | Botón outline Racing Dark |
| `marquee-track` | Marquee infinito (dirección normal) |
| `marquee-track-reverse` | Marquee infinito (dirección inversa) |
| `skeleton` | Loader de carga con shimmer |

### Animaciones Tailwind
`animate-breathe`, `animate-breathe-fast`, `animate-marquee`, `animate-marquee-reverse`, `animate-spin-slow`, `animate-reveal-up`

---

## Despliegue

### Vercel (Recomendado)

1. Conectar repositorio a Vercel
2. Seleccionar rama `racing-dark-premium`
3. Configurar **todas** las variables de entorno del `.env.example` en Vercel Dashboard
4. Deploy automático en cada push

### Variables obligatorias en producción
Ver `apps/web/.env.example` para la lista completa (28 variables).

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/ANALISIS_PROYECTO.md` | Estado detallado v11 del proyecto |
| `docs/PENDIENTE_CONFIGURACION.md` | Checklist de go-live |
| `docs/INTEGRACION_PAGOS_STRIPE.md` | Arquitectura y flujos de Stripe |
| `docs/STRIPE_QUICK_START.md` | Setup rápido de Stripe |
| `docs/UX/guide.md` | Design system Racing Dark Premium |
| `CHANGELOG.md` | Historial completo de versiones |

---

## Licencia

Proyecto privado — YJBMOTOCOM © 2026

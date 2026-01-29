# YB MOTOCOM - Tienda de Accesorios para Motos

Tienda online moderna de accesorios para motos con panel de administración completo.

## Stack Tecnológico

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Estilos**: Tailwind CSS + shadcn/ui
- **Backend/DB**: Supabase (Postgres + Auth + Storage)
- **Pagos**: Stripe (preparado para MercadoPago)
- **Monitoreo**: Sentry

## Estructura del Proyecto

```
PROYECTO_YB_MOTOCOM/
├── apps/
│   └── web/                 # Next.js (frontend + API routes)
├── services/
│   ├── payments/            # Funciones de pago y webhooks
│   └── reports/             # Generación de reportes
├── infra/
│   └── supabase/            # Scripts SQL / migraciones
├── scripts/
├── docs/
│   └── UX/                  # Guías de diseño
└── README.md
```

## Requisitos Previos

- Node.js 18+
- npm o pnpm
- Cuenta en Supabase
- Cuenta en Stripe (modo test)

## Instalación

1. **Clonar e instalar dependencias:**
```bash
cd apps/web
npm install
```

2. **Configurar variables de entorno:**
```bash
cp .env.example .env.local
```

Editar `.env.local` con tus credenciales:
```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
SENTRY_DSN=tu_sentry_dsn
```

3. **Crear tablas en Supabase:**
   - Ir a Supabase Dashboard > SQL Editor
   - Ejecutar el script en `infra/supabase/migrations.sql`

4. **Iniciar desarrollo:**
```bash
npm run dev
```

La app estará disponible en `http://localhost:3000`

## Características

### Tienda Pública
- Catálogo de productos con filtros y búsqueda
- Carrito de compras
- Checkout con Stripe
- Diseño mobile-first futurista

### Panel Admin (`/admin`)
- Dashboard con KPIs (ventas, stock bajo, top productos)
- CRUD de productos con carga de imágenes
- Gestión de inventario
- Cierres diarios (efectivo, transferencias)
- Reportes con exportación CSV
- Auditoría de acciones

## Scripts Disponibles

```bash
npm run dev          # Desarrollo
npm run build        # Build de producción
npm run start        # Iniciar producción
npm run lint         # Linter
npm run test         # Tests unitarios
npm run test:e2e     # Tests E2E
```

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/products` | Listar productos |
| GET | `/api/products/[id]` | Detalle producto |
| POST | `/api/products` | Crear producto (admin) |
| PUT | `/api/products/[id]` | Actualizar producto (admin) |
| DELETE | `/api/products/[id]` | Eliminar producto (admin) |
| POST | `/api/orders` | Crear orden |
| POST | `/api/payments/webhook` | Webhook Stripe |
| GET | `/api/reports/sales` | Reporte de ventas |
| POST | `/api/daily-closures` | Registrar cierre |
| POST | `/api/inventory/adjust` | Ajustar inventario |

## Despliegue

### Vercel (Recomendado)
1. Conectar repositorio a Vercel
2. Configurar variables de entorno en Vercel Dashboard
3. Deploy automático en cada push a main

### Variables de Entorno en Producción
Configurar en el dashboard de Vercel o tu proveedor:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `SENTRY_DSN`

## Licencia

Proyecto privado - YB MOTOCOM

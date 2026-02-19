# Pendientes de Configuración — YB MOTOCOM

> **Documento generado automáticamente** — Fecha: Febrero 2026
> Contiene todo lo que debes configurar manualmente para que la plataforma funcione en producción.
> El código ya está listo; solo debes suministrar las credenciales y ejecutar los pasos indicados.

---

## Índice

1. [Base de datos — Migraciones SQL pendientes](#1-base-de-datos--migraciones-sql-pendientes)
2. [Supabase — Configuración de proyecto](#2-supabase--configuración-de-proyecto)
3. [Stripe — Pagos internacionales](#3-stripe--pagos-internacionales)
4. [MercadoPago — Pagos Colombia](#4-mercadopago--pagos-colombia)
5. [Resend — Servicio de email](#5-resend--servicio-de-email)
6. [Sentry — Monitoreo de errores](#6-sentry--monitoreo-de-errores)
7. [Google Analytics](#7-google-analytics)
8. [PostHog — Analytics avanzado](#8-posthog--analytics-avanzado)
9. [Tawk.to — Live Chat](#9-tawkto--live-chat)
10. [Variables de entorno — Resumen completo](#10-variables-de-entorno--resumen-completo)
11. [Deploy en Vercel](#11-deploy-en-vercel)
12. [Checklist de go-live](#12-checklist-de-go-live)

---

## 1. Base de datos — Migraciones SQL pendientes

### ⚠️ ACCIÓN REQUERIDA — Ejecutar en Supabase SQL Editor

Debes ejecutar los siguientes archivos SQL en el editor SQL de tu proyecto Supabase, **en orden**:

| # | Archivo | Descripción | Estado |
|---|---------|-------------|--------|
| 1 | `infra/supabase/fase1_schema.sql` | Esquema base, tablas principales | Ejecutado (si ya tienes datos) |
| 2 | `infra/supabase/fase2_rls.sql` | Row Level Security policies | Ejecutado (si ya tienes datos) |
| 3 | `infra/supabase/fase3_functions.sql` | Funciones y triggers | Ejecutado (si ya tienes datos) |
| 4–9 | Fases anteriores | Ver historial en `infra/supabase/` | Ejecutados |
| **10** | **`infra/supabase/fase10_restock.sql`** | **Tabla notificaciones de restock** | **⚠️ PENDIENTE** |

### Cómo ejecutar `fase10_restock.sql`:

1. Ir a [supabase.com](https://supabase.com) → tu proyecto
2. Menú izquierdo → **SQL Editor**
3. Clic en **New query**
4. Copiar y pegar el contenido de `infra/supabase/fase10_restock.sql`
5. Clic en **Run** (o `Ctrl+Enter`)
6. Verificar que no aparezcan errores en la consola

---

## 2. Supabase — Configuración de proyecto

### 2.1 Variables de entorno (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Dónde encontrarlas:**
- Dashboard de Supabase → **Settings** → **API**
- `NEXT_PUBLIC_SUPABASE_URL` = "Project URL"
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = "anon public"
- `SUPABASE_SERVICE_ROLE_KEY` = "service_role" (¡mántenerla secreta!)

### 2.2 Configurar URLs de Auth (Redirect URLs)

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. Agregar en **Redirect URLs**:
   - `http://localhost:3000/**` (desarrollo)
   - `https://ybmotocom.com/**` (producción)
   - `https://tu-proyecto.vercel.app/**` (si usas Vercel preview)
3. En **Site URL** poner: `https://ybmotocom.com`

### 2.3 Configurar Storage (para imágenes de productos)

1. Supabase Dashboard → **Storage**
2. Crear bucket `products` con acceso **público**
3. Crear bucket `avatars` con acceso **público**
4. Las políticas RLS ya están definidas en `fase2_rls.sql`

### 2.4 Configurar Email Auth (opcional — para magic links)

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Habilitar **Confirm email** si deseas verificación de correo
3. Personalizar las plantillas en **Authentication** → **Email Templates**

---

## 3. Stripe — Pagos internacionales

### 3.1 Crear cuenta y obtener claves

1. Ir a [stripe.com](https://stripe.com) y crear cuenta
2. Dashboard → **Developers** → **API keys**
3. En modo **Test** primero, luego cambiar a **Live** para producción

### 3.2 Variables de entorno

```env
STRIPE_SECRET_KEY=sk_live_xxx           # o sk_test_xxx para pruebas
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx  # o pk_test_xxx
```

### 3.3 Configurar Webhook

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://ybmotocom.com/api/stripe/webhook`
3. Seleccionar eventos:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copiar el **Signing secret** → pegar en `STRIPE_WEBHOOK_SECRET`

---

## 4. MercadoPago — Pagos Colombia

### 4.1 Crear aplicación

1. Ir a [developers.mercadopago.com](https://developers.mercadopago.com)
2. Crear una aplicación nueva
3. Ir a **Credenciales** → **Credenciales de producción**

### 4.2 Variables de entorno

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx    # Token de producción
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxx      # Clave pública de producción
MERCADOPAGO_WEBHOOK_SECRET=tu_secreto_aqui
```

> Para pruebas usar las credenciales de **sandbox** (prefijo `TEST-`).

### 4.3 Configurar Webhook / IPN

1. MercadoPago Dashboard → **Tu aplicación** → **Webhooks**
2. URL: `https://ybmotocom.com/api/mercadopago/webhook`
3. Seleccionar evento: **Payments**
4. El `MERCADOPAGO_WEBHOOK_SECRET` es opcional; si no lo configuras, comentar la validación de firma en `apps/web/src/app/api/mercadopago/webhook/route.ts`

---

## 5. Resend — Servicio de email

### 5.1 Crear cuenta y dominio

1. Ir a [resend.com](https://resend.com) y crear cuenta
2. Dashboard → **Domains** → **Add Domain**
3. Agregar `ybmotocom.com` y seguir las instrucciones para verificar los registros DNS
4. Dashboard → **API Keys** → **Create API Key**

### 5.2 Variables de entorno

```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=pedidos@ybmotocom.com
ADMIN_NOTIFICATION_EMAIL=ybmotocom@gmail.com
```

> **Nota:** `RESEND_FROM_EMAIL` debe usar un dominio verificado en Resend.
> Si el dominio no está verificado, los emails no se enviarán.

### 5.3 Verificar configuración DNS

Resend requiere agregar registros DNS en tu proveedor de dominio (Cloudflare, GoDaddy, etc.):
- Registro SPF
- Registro DKIM
- Registro DMARC (opcional pero recomendado)

---

## 6. Sentry — Monitoreo de errores

### 6.1 Crear proyecto

1. Ir a [sentry.io](https://sentry.io) y crear cuenta / proyecto
2. Seleccionar plataforma: **Next.js**
3. Copiar el DSN

### 6.2 Variables de entorno

```env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx    # Server-side y edge
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx  # Client-side (browser)
```

> **Importante:** Ambas variables deben tener el **mismo valor DSN**.
> `SENTRY_DSN` se usa en el servidor y edge functions.
> `NEXT_PUBLIC_SENTRY_DSN` se usa en el browser (client components).

### 6.3 Verificar integración

Los archivos de configuración ya están en el proyecto:
- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`

Solo necesitas agregar el DSN en el `.env.local`.

---

## 7. Google Analytics

### 7.1 Crear propiedad GA4

1. Ir a [analytics.google.com](https://analytics.google.com)
2. Crear cuenta / propiedad GA4 para `ybmotocom.com`
3. Obtener el **Measurement ID** (formato: `G-XXXXXXXXXX`)

### 7.2 Variable de entorno

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

> Si no configuras esta variable, el analytics de GA simplemente no se activará.
> El código ya valida que la variable exista antes de inicializar GA.

---

## 8. PostHog — Analytics avanzado

### 8.1 Crear cuenta

1. Ir a [posthog.com](https://posthog.com) y crear cuenta
2. Crear nuevo proyecto
3. Obtener **API Key** y **Host**

### 8.2 Variables de entorno

```env
NEXT_PUBLIC_POSTHOG_API_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_API_HOST=https://app.posthog.com
```

> PostHog es opcional. Si no configuras estas variables, el analytics avanzado no se activará.
> PostHog permite ver grabaciones de sesiones, funnels de conversión, y A/B testing.

---

## 9. Tawk.to — Live Chat

### 9.1 Crear cuenta

1. Ir a [tawk.to](https://tawk.to) y crear cuenta gratuita
2. Crear propiedad para `ybmotocom.com`
3. Ir a **Administration** → **Channels** → **Chat Widget**
4. Obtener el **Property ID** y **Widget ID** del script de integración

El script se verá así:
```javascript
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
  var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
  s1.async=true;
  s1.src='https://embed.tawk.to/PROPERTY_ID/WIDGET_ID';
  // ...
})();
```

### 9.2 Variables de entorno

```env
NEXT_PUBLIC_TAWKTO_PROPERTY_ID=tu_property_id
NEXT_PUBLIC_TAWKTO_WIDGET_ID=tu_widget_id
```

> Si no configuras estas variables, el chat no aparecerá pero el resto del sitio funciona perfectamente.

---

## 10. Variables de entorno — Resumen completo

Crea el archivo `apps/web/.env.local` con el siguiente contenido (reemplaza los valores `xxx`):

```env
# ============================================
# SUPABASE (OBLIGATORIO)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ============================================
# STRIPE (OBLIGATORIO para pagos internacionales)
# ============================================
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# ============================================
# MERCADOPAGO (OBLIGATORIO para pagos Colombia)
# ============================================
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxx
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxx
MERCADOPAGO_WEBHOOK_SECRET=tu_secreto

# ============================================
# EMAIL - RESEND (OBLIGATORIO para emails)
# ============================================
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=pedidos@ybmotocom.com
ADMIN_NOTIFICATION_EMAIL=ybmotocom@gmail.com

# ============================================
# APP URLs (OBLIGATORIO)
# ============================================
NEXT_PUBLIC_APP_URL=https://ybmotocom.com
NEXT_PUBLIC_SITE_URL=https://ybmotocom.com

# ============================================
# SENTRY (Recomendado — monitoreo de errores)
# ============================================
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# ============================================
# ANALYTICS (Opcional)
# ============================================
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_API_KEY=phc_xxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_API_HOST=https://app.posthog.com

# ============================================
# LIVE CHAT - TAWK.TO (Opcional)
# ============================================
NEXT_PUBLIC_TAWKTO_PROPERTY_ID=tu_property_id
NEXT_PUBLIC_TAWKTO_WIDGET_ID=tu_widget_id
```

---

## 11. Deploy en Vercel

### 11.1 Conectar repositorio

1. Ir a [vercel.com](https://vercel.com) y crear cuenta
2. **New Project** → importar repositorio de GitHub/GitLab
3. Seleccionar el directorio raíz: `apps/web` (o configurar como monorepo)
4. Framework preset: **Next.js**

### 11.2 Configurar variables de entorno en Vercel

1. Vercel Dashboard → tu proyecto → **Settings** → **Environment Variables**
2. Agregar todas las variables del [bloque anterior](#10-variables-de-entorno--resumen-completo)
3. Aplicarlas a los entornos: **Production**, **Preview**, **Development**

### 11.3 Configurar dominio

1. Vercel → **Settings** → **Domains**
2. Agregar `ybmotocom.com`
3. Seguir instrucciones para configurar DNS en tu proveedor de dominio

### 11.4 Configurar Supabase para producción

Después de hacer deploy, actualizar en Supabase:
- **Authentication** → **URL Configuration** → agregar URL de Vercel

---

## 12. Checklist de go-live

Marca cada ítem cuando esté completo:

### Base de datos
- [ ] Ejecutar `infra/supabase/fase10_restock.sql` en Supabase SQL Editor
- [ ] Verificar que todas las tablas estén creadas correctamente
- [ ] Verificar que las políticas RLS estén activas

### Autenticación
- [ ] Configurar Redirect URLs en Supabase Auth
- [ ] Crear primer usuario admin desde Supabase Dashboard
- [ ] Asignar rol `admin` en tabla `user_roles`

### Pagos
- [ ] Stripe: cambiar de modo test a modo live
- [ ] Stripe: webhook configurado y verificado en producción
- [ ] MercadoPago: credenciales de producción (no sandbox)
- [ ] MercadoPago: webhook configurado

### Email
- [ ] Dominio verificado en Resend
- [ ] DNS de email configurados (SPF, DKIM)
- [ ] Enviar email de prueba para verificar funcionamiento

### Monitoreo
- [ ] Sentry DSN configurado y verificado
- [ ] Google Analytics ID configurado
- [ ] Hacer deploy y verificar que no hay errores en Sentry

### Chat
- [ ] Tawk.to configurado (opcional pero recomendado)
- [ ] Verificar que el widget aparece en el sitio

### Deploy
- [ ] Variables de entorno configuradas en Vercel
- [ ] Dominio personalizado configurado
- [ ] SSL/HTTPS activo (Vercel lo hace automáticamente)
- [ ] Probar flujo completo de compra en producción

---

## Notas adicionales

### Creación del primer usuario admin

Después del primer deploy:

1. Ir a tu sitio → registrarse con tu email
2. Ir a Supabase Dashboard → **Table Editor** → tabla `user_roles`
3. Insertar fila:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('TU-USER-UUID', 'admin');
   ```
   El UUID lo encuentras en Supabase → **Authentication** → **Users**

### Carga inicial de productos

Puedes cargar productos de dos formas:
1. Desde el panel admin: `/admin/productos` → Nuevo producto
2. Directamente en Supabase SQL Editor con INSERT statements

### Backups

Supabase hace backups automáticos diarios en el plan Pro. En el plan gratuito, se recomienda hacer backups manuales periódicos desde **Settings** → **Database** → **Backups**.

---

*Documento generado por Claude Code — YB MOTOCOM Platform v11.0*

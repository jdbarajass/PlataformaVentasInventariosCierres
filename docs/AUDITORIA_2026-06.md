# Auditoría técnica y plan de remediación — Junio 2026

Documento de referencia de la auditoría integral realizada sobre la plataforma (arquitectura, seguridad, pagos, BD, SEO, tests, deuda técnica) y de **todos los cambios aplicados** en las 4 fases de remediación que siguieron. Sirve como bitácora para entender qué se cambió, por qué, y qué queda pendiente.

> Estado al cierre de este documento: Fases 0, 1, 2 y 3 completadas y commiteadas/pusheadas a `origin/main`. Migraciones `00005`, `00006` y `00007` **aplicadas y verificadas en el proyecto de producción de Supabase** (`YB_MOTOCOM`).

---

## 0. Estado de las migraciones en Supabase

Aplicadas manualmente vía SQL Editor (este proyecto no usa el CLI de Supabase para migraciones — "Last Migration" en el dashboard seguirá diciendo "No migrations" aunque el SQL ya corrió):

| Migración | Qué crea | Estado |
|---|---|---|
| `00005_payment_integrity.sql` | tabla `processed_webhooks`, función `decrement_stock` | ✅ Aplicada y verificada (Database → Functions, Table Editor) |
| `00006_order_atomicity.sql` | función `create_order_with_items` | ✅ Aplicada y verificada |
| `00007_fix_search_path.sql` | fija `search_path = public` en las 2 funciones anteriores | ✅ Aplicada — Security Advisor confirmó que el warning "Function Search Path Mutable" desapareció para ambas |

Si en el futuro se levanta un entorno nuevo de Supabase (staging, otro proyecto), recordar correr **todas** las migraciones `00001` a `00007` en orden vía SQL Editor (o `supabase db push` si en ese entonces sí se usa el CLI).

---

## 1. Qué se encontró (resumen de la auditoría inicial)

Se revisó arquitectura, flujo de usuario, manejo de errores, base de datos, pagos (Stripe/MercadoPago), SEO/accesibilidad, tests/CI-CD, seguridad, mantenibilidad y observabilidad. Hallazgos relevantes, agrupados por severidad:

**Crítico (Fase 0):**
- `GET /api/orders` sin autenticación — expuso datos personales (email, teléfono, dirección) de todos los clientes a cualquiera.
- El monto a cobrar (`price_cents`, `total_cents`) lo definía el cliente sin recálculo en servidor — permitía pagar cualquier monto.
- Webhooks de Stripe/MercadoPago sin idempotencia — un reintento del proveedor podía descontar stock dos veces.
- Reducción de stock con patrón SELECT+UPDATE separado — condición de carrera en ventas concurrentes del mismo producto.

**Importante (Fase 1):**
- Sin verificación de Sentry en webhooks/endpoints de pago — fallos de pago no generaban alertas.
- Cero tests del flujo de pago (webhooks, creación de orden).
- Creación de orden (`orders` + `order_items`) sin atomicidad — riesgo de órdenes huérfanas.
- Webhooks no comparaban el monto confirmado por el proveedor contra el total de la orden.
- Sin headers de seguridad HTTP (CSP, X-Frame-Options, HSTS).

**Mejoras (Fase 2):**
- Validación Zod ausente en `POST /api/orders` y en el formulario de checkout.
- Rate limiting ausente en varios endpoints públicos.
- `sitemap.ts`/`robots.txt` ya existían (corrección a un hallazgo erróneo de la auditoría inicial), pero los componentes de structured data (`ProductSchema`, `BreadcrumbSchema`, `WebPageSchema`) estaban escritos y sin usar.
- Errores de checkout silenciados (`console.error` sin feedback visible al usuario).

**Deuda técnica (Fase 3):**
- `prisma/schema.prisma` presente pero sin un solo import en el código — dos "fuentes de verdad" del esquema de BD.
- `ProductForm` (495 líneas) y `CheckoutPage` mezclaban estado/validación/fetch con JSX.
- Sin `loading.tsx` en ninguna ruta.
- Sin coverage thresholds — CI podía pasar con 0% de cobertura.

**Hallazgo adicional encontrado durante la Fase 2** (corregido de inmediato, fuera del plan original): `/api/alegra/cierre`, `/api/alegra/analytics` y `/api/alegra/ventas-mensuales` solo verificaban que hubiera sesión, no el rol — cualquier cliente logueado podía ver ventas, cierres de caja y analíticas del negocio.

---

## 2. Qué se hizo, fase por fase

### Fase 0 — Urgente (vulnerabilidades explotables con dinero/datos reales)

| Hallazgo | Archivo(s) | Cambio |
|---|---|---|
| Auth faltante en listado de órdenes | [orders/route.ts](../apps/web/src/app/api/orders/route.ts) | `GET` ahora exige `requireAuth(['admin','seller'])` |
| Monto definido por el cliente | [orders/route.ts](../apps/web/src/app/api/orders/route.ts) | `POST` vuelve a consultar `products` en BD, recalcula subtotal/envío/descuento/total server-side; Stripe/MercadoPago cobran un único line item igual al total recalculado |
| Webhooks sin idempotencia | [webhook-idempotency.ts](../apps/web/src/lib/webhook-idempotency.ts), [00005_payment_integrity.sql](../supabase/migrations/00005_payment_integrity.sql) | tabla `processed_webhooks` (PK `provider`+`event_key`); Stripe dedupea por `event.id`, MercadoPago por `paymentId:status` |
| Race condition de stock | [inventory.ts](../apps/web/src/lib/inventory.ts), [00005_payment_integrity.sql](../supabase/migrations/00005_payment_integrity.sql) | función SQL `decrement_stock` (UPDATE atómico con bloqueo de fila), revocada de `anon`/`authenticated`, solo `service_role` |

### Fase 1 — Importante

| Hallazgo | Archivo(s) | Cambio |
|---|---|---|
| Observabilidad de pagos | [webhook/route.ts](../apps/web/src/app/api/payments/webhook/route.ts), [mercadopago/webhook/route.ts](../apps/web/src/app/api/payments/mercadopago/webhook/route.ts), [orders/route.ts](../apps/web/src/app/api/orders/route.ts) | `Sentry.captureException`/`captureMessage` en catches globales y en mismatch de monto |
| Tests de integración de pagos | [orders.test.ts](../apps/web/src/__tests__/api/orders.test.ts), [payment-webhooks.test.ts](../apps/web/src/__tests__/api/payment-webhooks.test.ts), [webhook-idempotency.test.ts](../apps/web/src/__tests__/lib/webhook-idempotency.test.ts), [inventory.test.ts](../apps/web/src/__tests__/lib/inventory.test.ts), helper [supabase-mock.ts](../apps/web/src/__tests__/helpers/supabase-mock.ts) | 19 tests nuevos cubriendo recálculo de precio, idempotencia, mismatch de monto, decremento de stock |
| Atomicidad de orden | [00006_order_atomicity.sql](../supabase/migrations/00006_order_atomicity.sql), [orders/route.ts](../apps/web/src/app/api/orders/route.ts) | función SQL `create_order_with_items` (orders+order_items en una transacción), llamada vía `rpc` |
| Validación de monto en confirmación | ambos webhooks | comparan `order.total_cents` vs `session.amount_total` (Stripe) / `transaction_amount*100` (MercadoPago) antes de marcar pagado; si no coincide, queda pendiente + audit log `payment_amount_mismatch` + alerta Sentry |
| Headers de seguridad | [next.config.js](../apps/web/next.config.js) | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`, y CSP en modo **Report-Only** (no bloquea nada todavía — ver nota en el archivo) |
| *(extra)* Rol faltante en rutas Alegra | [alegra-auth.ts](../apps/web/src/lib/alegra-auth.ts) + 4 rutas en `api/alegra/*` | helper `requireAlegraAdmin()` consolidado, aplicado a `analytics`, `cierre`, `ventas-mensuales` (les faltaba el check de rol) e `inventario` (tenía el check duplicado inline) |
| *(extra, post-deploy)* `search_path` mutable en funciones nuevas | [00007_fix_search_path.sql](../supabase/migrations/00007_fix_search_path.sql) | el Security Advisor de Supabase marcó `decrement_stock` y `create_order_with_items` como "Function Search Path Mutable" (riesgo de search-path hijacking en funciones `SECURITY DEFINER`); se fija `search_path = public` en ambas |

### Fase 2 — Mejoras deseables

| Hallazgo | Archivo(s) | Cambio |
|---|---|---|
| Validaciones Zod | [validations/order.ts](../apps/web/src/lib/validations/order.ts) | `createOrderSchema`/`customerSchema`; usado en `POST /api/orders` y en el checkout (cliente) |
| Rate limiting ampliado | [products/route.ts](../apps/web/src/app/api/products/route.ts), [categories/route.ts](../apps/web/src/app/api/categories/route.ts), [orders/[id]/invoice/route.ts](../apps/web/src/app/api/orders/[id]/invoice/route.ts) | límites generosos (60/min) en listados públicos, 20/min en factura (UUID es el único control de acceso ahí) |
| SEO / structured data | [producto/[slug]/page.tsx](../apps/web/src/app/(shop)/producto/[slug]/page.tsx), [(shop)/page.tsx](../apps/web/src/app/(shop)/page.tsx) | `ProductSchema`+`BreadcrumbSchema` en producto (reemplazando script inline duplicado) + `canonical`/`og:image`; `WebPageSchema` en home. `sitemap.ts`/`robots.txt` ya existían, se verificaron |
| UX de errores en checkout | [checkout/page.tsx](../apps/web/src/app/(shop)/checkout/page.tsx) | toasts visibles en error de validación, error de servidor y error de red (antes solo `console.error`) |

### Fase 3 — Deuda técnica

| Hallazgo | Archivo(s) | Cambio |
|---|---|---|
| Prisma | — | **eliminado** `prisma/schema.prisma` (decisión del usuario). Ver sección 3 abajo. |
| Refactor de componentes grandes | [use-product-form.ts](../apps/web/src/components/products/use-product-form.ts), [product-form.tsx](../apps/web/src/components/products/product-form.tsx) | lógica de estado/validación/submit extraída a un hook; el componente quedó en ~300 líneas de JSX puro |
| Cliente API centralizado | [api-client.ts](../apps/web/src/lib/api-client.ts), [authenticated-fetch.ts](../apps/web/src/lib/authenticated-fetch.ts) | `apiFetch`/`ApiError` reutilizable; `authenticatedFetch` en archivo separado a propósito (ver nota de bundle size abajo) |
| Loading states | [admin/loading.tsx](../apps/web/src/app/admin/loading.tsx), [(shop)/loading.tsx](../apps/web/src/app/(shop)/loading.tsx) | un `loading.tsx` por sección, cubre todas las rutas anidadas sin `loading.tsx` propio |
| Coverage thresholds | [vitest.config.ts](../apps/web/vitest.config.ts) | provider cambiado a `istanbul` (`v8` crasheaba con paths de Windows); piso global bajo (cobertura real ~0.8%, la mayoría de páginas no tienen tests) + thresholds estrictos (40%) sobre los archivos de pago ya cubiertos por tests |
| *(bonus)* Test desactualizado | [button.test.tsx](../apps/web/src/__tests__/components/button.test.tsx) | el test esperaba `h-11` para `size="lg"`, el componente real usa `h-12` desde hace tiempo — ya no hay ninguna falla preexistente en la suite |
| *(bonus)* Regresión de bundle detectada y corregida | `api-client.ts` / `authenticated-fetch.ts` | la primera versión de `api-client.ts` importaba el SDK de Supabase a nivel de módulo; eso inflaba el bundle de `/checkout` de 125kB a 176kB aunque esa página no usa `authenticatedFetch`. Se separó en dos archivos y el bundle volvió a 125kB. |

**Verificación en cada fase:** `tsc --noEmit` sin errores nuevos, `vitest run` en verde (62/62 tests), `next build` exitoso. Detalle completo en el historial de la conversación.

---

## 3. Prisma — qué hacía y cómo retomarlo si se quiere en el futuro

### Qué era

`prisma/schema.prisma` (en la raíz del repo, fuera de `apps/web`) era un **segundo modelo de la misma base de datos PostgreSQL de Supabase**, escrito en el lenguaje de esquema de Prisma. No era un sistema en uso: ningún archivo de `apps/web/src` lo importaba (`grep -r "prisma" apps/web/src` no devolvía nada). El propio archivo lo advertía en su encabezado:

```prisma
// NOTA: Prisma no gestiona RLS ni extensiones de Supabase.
//       Para RLS ejecutar schema.sql en Supabase SQL Editor.
```

Es decir: existía como documentación/borrador de un esquema tipado, pero el acceso real a datos siempre fue 100% Supabase JS client (`@supabase/supabase-js`), con el esquema real viviendo en `supabase/migrations/*.sql`.

### Qué modelaba exactamente

8 enums:
- `UserRole` (admin/seller/viewer)
- `OrderStatus` (pending → confirmed → processing → shipped → delivered, + cancelled/refunded)
- `PaymentStatus` (pending/paid/failed/refunded/partial_refund)
- `PaymentProvider` (stripe/mercadopago/manual/cash/transfer)
- `PaymentMethod` (card/transfer/wallet/cash/nequi/daviplata/other)
- `PaymentTransactionStatus` (pending/processing/succeeded/failed/cancelled/refunded)
- `InventoryMovementType` (in/out/adjustment/sale/return)
- `DiscountType` (percentage/fixed)

14 modelos (correspondientes 1:1 a las tablas reales en `supabase/migrations/00001_initial_schema.sql` y siguientes):

| Modelo | Para qué |
|---|---|
| `User` | usuarios de `auth.users` extendidos con rol |
| `Category` | categorías de producto |
| `Product` | catálogo (precio, costo, stock, imágenes, tags) |
| `InventoryMovement` | historial de entradas/salidas/ajustes/ventas de stock |
| `Order` | órdenes de compra |
| `OrderItem` | líneas de una orden |
| `Payment` | registro de intento/confirmación de pago por proveedor |
| `DailyClosure` | cierres de caja diarios |
| `AuditLog` | bitácora de acciones administrativas |
| `Coupon` | cupones de descuento |
| `StoreSettings` | configuración de tienda (fila única: envío, impuestos, métodos de pago, redes sociales, branding) |
| `Wishlist` | favoritos de usuario |
| `ProductReview` | reseñas de producto |
| `RestockSubscription` | suscripciones a "avísame cuando haya stock" |

Las relaciones (FK con `onDelete` explícito) y los nombres de campo eran consistentes con el SQL real — alguien lo mantuvo sincronizado a mano en algún momento, pero sin que el código lo usara.

### Cómo retomarlo si en el futuro quieren usar Prisma

El archivo fue borrado del working tree pero sigue en el historial de git (aún no comiteado el borrado al momento de escribir esto). Dos caminos:

**Opción A — Recuperar el archivo borrado tal cual:**
```bash
git show HEAD:prisma/schema.prisma > prisma/schema.prisma
```
(Si para entonces ya se comiteó el borrado, buscar el commit anterior con `git log --diff-filter=D -- prisma/schema.prisma` y usar ese hash en vez de `HEAD`.)

**Opción B — Regenerarlo desde la base de datos real (recomendado, más confiable):**
Como Supabase/Postgres sigue siendo la única fuente de verdad (`supabase/migrations/*.sql`), lo más seguro es generar el schema por introspección en vez de confiar en una copia manual que pudo haberse desincronizado:
```bash
npm install -D prisma @prisma/client
npx prisma init
# configurar DATABASE_URL / DIRECT_URL en .env (ver supabase/migrations para las tablas reales)
npx prisma db pull   # introspecciona la BD real y genera schema.prisma actualizado
```
Esto evita arrastrar el desfase que ya existía entre el `schema.prisma` viejo y la BD real.

**Si se decide adoptarlo de verdad** (no solo como documentación), hay que planear:
1. Migrar gradualmente las ~40 rutas de API que hoy usan `supabase.from(...)` a `prisma.modelo.findMany(...)`, etc.
2. Decidir qué pasa con RLS: Prisma no lo respeta (usa conexión directa con privilegios de servicio), así que la autorización tendría que validarse explícitamente en cada query o en una capa intermedia — hoy esa protección la da RLS + `requireAuth()`.
3. Decidir si las migraciones SQL (`supabase/migrations/*.sql`, incluyendo las nuevas `00005`/`00006` de esta auditoría) pasan a generarse con `prisma migrate` o se mantienen manuales y Prisma solo lee el esquema (`db pull`) — mezclar ambos sin disciplina es exactamente el problema que se eliminó en la Fase 3.

---

## 4. Qué quedó pendiente (no se tocó, mencionado explícitamente al usuario)

- **CSP en modo Report-Only**, no enforced. Recomendado: monitorear violaciones ~2 semanas antes de pasar a `Content-Security-Policy` real (ver comentario en `next.config.js`).
- **Página de categoría** (`categoria/[slug]/page.tsx`) sigue siendo un client component sin `generateMetadata` propio — sin structured data ni metadata SEO específica. Requeriría refactor mayor (convertir a server component o fetch de metadata en paralelo).
- **`GET /api/orders/[id]/invoice`** sigue sin autenticación por diseño (el cliente abre su factura sin loguearse); solo se le agregó rate limiting. Si se quiere cerrar del todo, requeriría repensar el flujo de acceso a facturas (ej. token firmado con expiración en vez de solo el UUID).
- **Coverage thresholds** son un piso bajo intencional (~0.8% global) — deben subirse incrementalmente a medida que se agreguen tests a páginas/componentes sin cobertura.
- **12 warnings preexistentes del Security Advisor de Supabase** (no introducidos por esta auditoría) — ver sección 6. Quedan deliberadamente para una sesión futura porque podrían ser intencionales y no se quiso tocar configuración de seguridad ya existente sin revisarla con calma primero.

---

## 6. Warnings preexistentes del Security Advisor (pendientes, deliberadamente no tocados)

Al verificar las migraciones de esta auditoría en el Security Advisor de Supabase (Database → Advisors → Security Advisor), aparecieron **12 warnings + 1 info** que **ya existían antes** de este trabajo (no los introdujo ninguna migración `00005`-`00007`). Se decidió explícitamente dejarlos para otra sesión. Quedan listados aquí para no perderlos de vista:

| Issue type | Entidad | Nota |
|---|---|---|
| Function Search Path Mutable | `public.get_user_role` | mismo tipo de hallazgo que se corrigió en `00007` para las funciones nuevas — aplicaría el mismo fix (`ALTER FUNCTION ... SET search_path = public`) |
| Function Search Path Mutable | `public.generate_order_number` | idem |
| Function Search Path Mutable | `public.update_updated_at_column` | idem |
| RLS Policy Always True | `public.order_items` | política con `USING (true)` o similar — revisar si es intencional (ej. lectura pública de items de orden) o demasiado permisiva |
| RLS Policy Always True | `public.orders` | idem — este es más sensible, revisar con prioridad |
| RLS Policy Always True | `public.restock_subscriptions` | idem |
| Public Bucket Allows Listing | `storage.product-images` | bucket de Storage con política SELECT amplia que permite *listar* todos los objetos, no solo leerlos — revisar si se requiere listar o solo servir imágenes por URL directa |
| Public Can Execute SECURITY DEFINER Function | `public.get_user_role(user_id uuid)` | callable sin iniciar sesión — evaluar restringir a `authenticated` |
| Public Can Execute SECURITY DEFINER Function | `public.rls_auto_enable()` | idem |
| Signed-In Users Can Execute SECURITY DEFINER Function | `public.get_user_role(user_id uuid)` | callable por cualquier usuario logueado — evaluar si debe restringirse más |
| Signed-In Users Can Execute SECURITY DEFINER Function | `public.rls_auto_enable()` | idem |
| Leaked Password Protection Disabled | `Auth` | Supabase Auth no está verificando contraseñas contra la base de HaveIBeenPwned al registrar/cambiar contraseña — activarlo es gratis y de un click en Authentication → Policies |
| *(Info)* RLS Enabled No Policy | `public.processed_webhooks` | **no requiere acción** — es el diseño intencional de la tabla que creamos en `00005` (deny-all para `anon`/`authenticated`, solo `service_role` la usa) |

**Prioridad sugerida para cuando se retomen:** `Leaked Password Protection Disabled` (gratis, un click, cierra una brecha real de credenciales filtradas) y `RLS Policy Always True` en `public.orders` (datos de clientes) primero; el resto puede esperar más.

---

## 5. Cómo verificar que todo sigue funcionando

```bash
cd apps/web
npx tsc --noEmit -p tsconfig.json   # sin errores nuevos
npx vitest run                       # 62/62 tests en verde
npx vitest run --coverage            # coverage thresholds pasan
npx next build                       # build de producción exitoso
```

# Unificación YJBMOTOCOM — tienda en línea + software local de ventas

> **Este documento es el estado vivo del proyecto.** Si retomas este trabajo en una sesión nueva (o después de una pausa larga), lee este archivo completo antes de tocar código — te dice exactamente en qué quedamos, qué decisiones ya se tomaron y por qué, y cuál es el siguiente paso concreto.

**Última actualización**: 2026-07-21
**Estado actual**: Sub-fase 3.1 completada y aplicada en Supabase real. Sub-fase 3.2 completada (commit local, sin pushear). Por iniciar sub-fase 3.3.

Importante: las migraciones 00001-00007 NO deben re-ejecutarse — ya están aplicadas desde el montaje original del sitio, y 00004 hace un DROP masivo de políticas que borraría las nuevas del 00010.

---

## 1. Objetivo del proyecto

Unificar en un solo sistema:
1. La tienda en línea ya en producción (`www.yjbmotocom.com`, este repo, Next.js + Supabase, con clientes reales comprando hoy).
2. El software local de ventas que hoy lleva toda la trazabilidad real del negocio (`C:\Users\JJBarajas\Pictures\VENTAS_YJBMOTOCOM`, Python + PySide6 + SQLite, de escritorio, sin nube).

Meta final: un único inventario, un único catálogo de productos y un único registro de ventas (online + presencial), todo administrado desde el panel de administrador de la tienda en línea. **No se migra historial** del software local — el sistema unificado arranca a registrar desde cero hacia adelante. El local es la fuente de verdad de las **reglas de negocio** (cómo se calculan comisiones, ganancias, cierres, etc.) porque es el que se usa y funciona hoy; la nube nunca se ha probado en producción para esta parte.

## 2. Regla de oro (no negociable)

**La parte pública de la tienda (catálogo, carrito, checkout, cuentas de cliente) no se puede romper en ningún momento.** Hay clientes comprando hoy. Todo cambio de esquema es aditivo (nuevas tablas/columnas), nunca se modifica ni se elimina algo que el checkout ya use.

## 3. Flujo de trabajo acordado con el usuario

- **Sin ramas.** Se trabaja directo sobre `main` (Vercel despliega automáticamente lo que llega a `main` en GitHub, así que no hay rama de preview separada que usar).
- **Commits locales sí, push NO automático.** Cada sub-fase se implementa con commits locales en `main`. **Nunca se hace `git push` sin autorización explícita del usuario** ("pushea"/"despliega" o equivalente) — así se evita disparar un despliegue a producción sin que él lo revise primero.
- Cada sub-fase se entrega pequeña y verificable: qué se hizo + cómo probarlo manualmente, antes de seguir con la siguiente.
- Este documento (`docs/UNIFICACION_YJBMOTOCOM.md`) se actualiza al cerrar cada sub-fase — es la fuente de verdad de progreso, no la memoria de la conversación.

## 4. Fase 1 — Entendimiento (completada y confirmada por el usuario el 2026-07-21)

### 4.1 Los dos stacks son incompatibles a nivel de código

| | Tienda en línea (este repo) | Software local |
|---|---|---|
| Stack | Next.js 14 (App Router) + React + TS, Vercel | Python + PySide6 (escritorio), compilado con PyInstaller |
| BD | Supabase (Postgres remoto) | SQLite local (`yjbmotocom.db`), un archivo por instalación |
| Naturaleza | Multiusuario real, en la nube, RLS | Monousuario por instalación, sin red, sin sync |

Conclusión: nada del local se porta tal cual — todo se **reconstruye** en Next.js/Postgres replicando comportamiento y reglas de negocio, no código. El Excel de 18 pestañas (`YJBMOTOCOM_Historial.xlsx`) es un espejo/backup del mismo modelo relacional del SQLite (no una fuente distinta) — hay que preservar esa función de exportar/importar contra las tablas nuevas de Supabase.

### 4.2 Panel de administrador actual — qué hace cada sección

- **Dashboard** (`/admin`): ventas hoy/semana, pedidos pendientes, stock bajo, top productos, últimas 5 órdenes.
- **Órdenes** (`/admin/ordenes`): gestiona `orders` de la tienda online (estado, tracking). Stock se descuenta solo cuando un pago online se confirma (webhook Stripe/MercadoPago vía RPC `decrement_stock`).
- **Cierres** (`/admin/cierres`): formulario manual simple, totales por método de pago para una fecha (`daily_closures`), sin línea de detalle. Existe una API (`/api/daily-closures`) más completa que la UI actual no usa.
- **Cierre Alegra** (`/admin/cierre-alegra`): módulo aparte que reconcilia la caja de ventas presenciales contra **Alegra** (SaaS externo de facturación/contabilidad). Hoy, las ventas de mostrador viven en Alegra, no en Supabase. Algoritmo de cuadre de caja tipo knapsack (`lib/cash-calculator-alegra.ts`) para armar base/excedentes/desfases.
  **Decisión del usuario (confirmada)**: Alegra sigue funcionando en paralelo, sin tocarlo. El módulo nuevo es adicional.
- **Inventario** (`/admin/inventario`): CRUD + ajustes de stock sobre `products`, sin variantes por talla ni código de barras.
- **Reportes** (`/admin/reportes`): ventas agregadas por día + top 10 productos. Sin costos, comisiones, ganancia ni utilidad.
- Otras secciones sin relación directa con el local: Productos, Cupones, Reseñas, Usuarios, Auditoría, Configuración.

Detalle técnico completo (tablas, RLS, funciones SQL, rutas de archivo) recogido en el análisis original — ver conversación / regenerar con exploración de código si hace falta el detalle línea por línea otra vez.

### 4.3 Software local — qué hace

16 módulos: Registrar Venta (carrito multi-producto, tallas, código de barras, pagos combinados, comisión trasladada al cliente), Calculadora, Ventas del Día, Dashboard, Historial Mensual, Configuración, **Préstamos** (a otros almacenes), Inventario (con tallas/variantes), Exportar/Importar Excel (18 pestañas), **Facturas a proveedores** (con abonos parciales), Presupuesto Mensual, Notas y Pendientes, **Cuentas** (saldo por medio de pago + cierre mensual por snapshot), **Fiado** (clientes deudores/apartados), Mi Cuadre (vista Vendedor), Rendimiento Vendedores.

Roles Admin/Vendedor con **ocultamiento real de costos/ganancia** para el rol Vendedor (`utils/permisos.py`).

Regla de negocio clave y no obvia: la comisión del medio de pago se traslada al cliente como sobreprecio — no reduce la ganancia de la tienda (`ganancia_neta = precio - costo`, sin restar comisión).

### 4.4 Tabla comparativa (resumen)

| Función del local | Estado en el admin (nube) |
|---|---|
| Registrar venta presencial | **No existe** (hueco crítico) |
| Inventario (talla, código de barras) | Parecido, sin variantes/código de barras |
| Cuentas (saldo por medio de pago) | **No existe** |
| Cierre mensual de Cuentas | Distinto en concepto (`daily_closures` diario + Alegra) |
| Facturas a proveedores + abonos | **No existe** |
| Fiado / clientes deudores | **No existe** |
| Préstamos a otros almacenes | **No existe** |
| Notas y pendientes | **No existe** |
| Presupuesto mensual | **No existe** |
| Reportes (ganancia, comisión, utilidad, vendedor) | Parecido pero mucho más pobre |
| Dashboard diario | Parecido, cubre parte |
| Roles con ocultamiento costo/ganancia | Roles existen, sin ocultar campos |
| Auditoría | Existe, cubre parcialmente |
| Recibo de venta (PDF/térmica) | **No existe** |
| Exportar/Importar Excel | **No existe** |
| Productos | Similar, sin talla/variantes ni código de barras |
| Multiusuario con roles | Existe, nomenclatura distinta |

## 5. Fase 2 — Plan de unificación (aprobado por el usuario el 2026-07-21)

### 5.1 Qué se queda tal cual
Tienda pública completa. Esquemas `products`, `categories`, `orders`, `order_items`, `payments`, `coupons`, `store_settings`, `users` (extendidos solo de forma aditiva). Alegra y `/admin/cierre-alegra` intactos. Auth/roles existentes.

### 5.2 Qué se ajusta
- Inventario: se agrega variantes por talla + código de barras (tabla nueva, aditiva; productos sin variantes siguen igual que hoy).
- Reportes: se enriquece con costo, comisión, ganancia neta, utilidad real, rendimiento por vendedor.
- Cierres: se reemplaza conceptualmente por el modelo "Cuentas" del local (saldo por medio de pago + cierre mensual). `daily_closures` se deja sin tocar (no se borra), simplemente deja de ser el flujo real.
- Roles: se replica el ocultamiento de costo/ganancia para el rol Vendedor.
  **Decisión (confirmada)**: `vendedor` del local se mapea al rol `seller` ya existente en la nube (mismas restricciones de visibilidad).

### 5.3 Qué se construye desde cero (módulo nuevo "YJBMOTOCOM" en el admin)
Registrar Venta (POS), Cuentas, Facturas a proveedores + abonos, Fiado + abonos, Préstamos, Notas y pendientes, Presupuesto mensual, Exportar/Importar Excel (mismas 18 pestañas), recibo de venta.
**Decisión (confirmada)**: recibo se genera en PDF y se imprime vía el diálogo de impresión normal del navegador (funciona con la impresora térmica si está instalada como impresora de Windows) — no se intenta replicar la impresión directa ESC/POS que hace la app de escritorio.

### 5.4 Modelo de datos unificado
- Un solo catálogo/inventario: `products` + tabla nueva `product_variants` (talla/código de barras, opcional).
- Un solo registro de ventas: se extiende `orders`/`order_items`/`payments` con un campo `channel` (`'online' | 'pos'`) en vez de crear tablas de ventas paralelas.
- Tablas nuevas exclusivas de la operación presencial (no afectan nada existente): `accounts`, `account_movements`, `account_closures`, `supplier_invoices`, `supplier_invoice_payments`, `customer_credits`, `customer_credit_payments`, `loans`, `notes`, `monthly_budgets`.

### 5.5 Riesgos y mitigación
- Migraciones que rompan constraints → probar en Supabase de staging antes de producción; siempre aditivas.
- RLS afectando políticas existentes → políticas nuevas solo para tablas nuevas.
- Sin tests e2e automatizados de checkout → checklist manual de regresión (catálogo, carrito, checkout por cada método de pago, cuenta de cliente) después de cada sub-fase.
- Trabajo directo en `main` sin push automático (ver sección 3).

## 6. Fase 3 — Sub-fases de implementación

| # | Sub-fase | Estado |
|---|----------|--------|
| 3.1 | Migraciones aditivas del modelo unificado (variantes, cuentas, facturas, fiado, préstamos, notas, presupuesto) — solo schema + RLS, sin UI | ✅ Completada (commit local, sin pushear) |
| 3.2 | Inventario: variantes por talla + código de barras (UI) | ✅ Completada (commit local, sin pushear) |
| 3.3 | Módulo Cuentas | ⏳ Pendiente — siguiente paso |
| 3.4 | Módulo Registrar Venta (POS) + recibo PDF | Pendiente |
| 3.5 | Facturas a proveedores + abonos | Pendiente |
| 3.6 | Fiado + abonos | Pendiente |
| 3.7 | Préstamos, Notas, Presupuesto | Pendiente |
| 3.8 | Reportes enriquecidos + Rendimiento Vendedores + ocultamiento de costos por rol | Pendiente |
| 3.9 | Exportar/Importar Excel (18 pestañas) | Pendiente |
| 3.10 | Revisión final de regresión de la tienda pública + cierre de documentación | Pendiente |

## 6.1 Detalle de la sub-fase 3.1 (completada)

Migraciones nuevas en `supabase/migrations/` (100% aditivas, ninguna toca columnas/tablas usadas por el checkout online):

- **`00008_product_variants_and_pos_order_fields.sql`**: tabla `product_variants` (talla, código de barras, stock y costo por variante — un producto sin variantes sigue usando `products.stock_qty` exactamente igual que hoy); columna `inventory_movements.variant_id`; columnas `orders.channel` (`'online'|'pos'`) y `orders.seller_id`; columnas `order_items.variant_id`, `product_talla`, `cost_cents`, `discount_cents`.
- **`00009_pos_operational_tables.sql`**: tablas nuevas `accounts` (con seed de las 6 cuentas del local: Efectivo, Nequi, QR/Bancolombia, NU, Daviplata, Addi), `account_movements`, `account_closures`, `supplier_invoices`, `supplier_invoice_items`, `supplier_invoice_payments`, `customer_credits` (Fiado), `customer_credit_payments`, `loans` (Préstamos), `notes`, `monthly_budgets`. También amplía `payments` con `method_detail`, `commission_cents`, `account_id`, y amplía (nunca restringe) los CHECK de `provider`/`method` para admitir `'pos'` y `'addi'`.
- **`00010_rls_pos_tables.sql`**: habilita RLS y políticas en todas las tablas nuevas (no toca ninguna política existente de `products`/`orders`/`payments`/etc). Patrón: lectura/gestión general para `admin`+`seller`; `accounts` y `account_closures` con gestión restringida a `admin` (igual que el local, donde Cuentas está protegida por contraseña de Admin).

También se actualizó `apps/web/src/types/database.ts` de forma aditiva (nuevos campos opcionales en `orders`/`order_items`/`payments`/`inventory_movements`, y tipos nuevos para las 12 tablas agregadas).

**Verificación hecha**: `npx tsc --noEmit` en `apps/web` — mismos 68 errores preexistentes (no relacionados, ya tolerados por `ignoreBuildErrors: true`) antes y después del cambio; cero errores nuevos introducidos. No se corrieron las migraciones contra el proyecto Supabase real todavía — **eso requiere un paso manual del usuario** (ver sección "Pendientes" más abajo).

**Pendiente manual antes de dar por buena esta sub-fase**: aplicar estos 3 archivos SQL, en orden (00008 → 00009 → 00010), en el SQL Editor del proyecto Supabase real (idealmente primero en un proyecto de staging/desarrollo, luego en producción), tal como se aplicaron las migraciones anteriores (00001-00007). Avisar cuando esté aplicado para poder continuar con la sub-fase 3.2 usando las tablas reales.

## 6.2 Detalle de la sub-fase 3.2 (completada)

Archivos nuevos:
- **`apps/web/src/app/api/products/[id]/variants/route.ts`**: `GET` (listar variantes de un producto) y `POST` (crear variante — talla, código de barras, stock inicial, costo), rol `admin`/`seller`.
- **`apps/web/src/app/api/product-variants/[id]/route.ts`**: `PUT` (editar variante) y `DELETE` (soft-delete: `active=false`, preserva historial).

Archivos modificados (aditivo, sin romper comportamiento existente para productos sin variantes):
- **`apps/web/src/app/api/inventory/adjust/route.ts`**: ahora acepta `variant_id` opcional en el body. Si viene, el ajuste (entrada/salida/ajuste) se aplica sobre `product_variants.stock_qty` en vez de `products.stock_qty`, y el movimiento queda registrado con `variant_id`. Sin `variant_id`, el comportamiento es idéntico al de antes (verificado por diff de línea).
- **`apps/web/src/lib/validations/product.ts`**: se agregó `productVariantSchema` (Zod), sin tocar `productSchema` existente.
- **`apps/web/src/app/admin/inventario/page.tsx`**: cada fila de producto ahora tiene una columna "Tallas" con un botón que expande una tabla inline de variantes (talla, código de barras, stock, costo, estado de stock bajo), con acciones para ajustar stock de cada variante y desactivarla, y un formulario para agregar una variante nueva. Toda la UI y lógica existente de ajuste a nivel de producto (sin variantes) se dejó intacta.

**Verificación hecha**: `npx tsc --noEmit` — mismos 68 errores preexistentes, cero nuevos (confirmado por diff línea por línea contra la salida de la sub-fase 3.1). `npx eslint` sobre los 5 archivos nuevos/modificados — sin advertencias ni errores.

**Cómo probarlo manualmente** (una vez pusheado y desplegado, o corriendo `npm run dev` local): entrar a `/admin/inventario` como admin, abrir un producto cualquiera con el botón de la columna "Tallas" — debe mostrar "no tiene variantes" la primera vez. Agregar una variante (ej. talla "M", código de barras cualquiera, stock 10, costo 50000), verificar que aparece en la tabla, ajustar su stock con Entrada/Salida/Ajuste y confirmar que el número cambia, y finalmente desactivarla con el botón de basurero y confirmar que desaparece de la lista. Todo esto debe funcionar sin afectar el stock general del producto (columna "Stock" de la tabla principal), que sigue siendo independiente.

## 7. Decisiones tomadas (registro rápido)

1. Alegra convive en paralelo, no se reemplaza ni se toca.
2. `vendedor` (local) = `seller` (nube), mismas restricciones de visibilidad de costos/ganancia.
3. Recibo de venta: PDF + impresión vía diálogo del navegador (no ESC/POS directo).
4. Sin ramas: todo en `main`, commits locales, push solo con autorización explícita del usuario.
5. No se migra historial de ventas/inventario del local — se arranca en cero en la nube.

## 8. Cómo retomar si se interrumpe el trabajo

1. Lee este archivo completo.
2. Revisa `git log` y `git status` en `main` para ver qué commits locales existen ya (recuerda: pueden no estar pusheados).
3. Ubica la sub-fase marcada como "en progreso" o la primera "Pendiente" en la tabla de la sección 6.
4. Si hay migraciones SQL ya creadas en `supabase/migrations/` que no aparecen aquí como completadas, revisa si ya se aplicaron en el proyecto Supabase real antes de reaplicarlas.
5. Continúa desde ahí — no hay que repetir la Fase 1 ni la Fase 2, ya están aprobadas.

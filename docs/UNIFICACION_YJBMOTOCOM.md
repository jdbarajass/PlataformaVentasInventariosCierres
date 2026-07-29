# Unificación YJBMOTOCOM — tienda en línea + software local de ventas

> **Este documento es el estado vivo del proyecto.** Si retomas este trabajo en una sesión nueva (o después de una pausa larga), lee este archivo completo antes de tocar código — te dice exactamente en qué quedamos, qué decisiones ya se tomaron y por qué, y cuál es el siguiente paso concreto.

**Última actualización**: 2026-07-22
**Estado actual**: **Fases 3, 3B y 4 (4.1-4.4) completas**, más una **segunda auditoría exhaustiva sección-por-sección (sección 15/16) también completa** — las 19 secciones del panel admin fueron comparadas contra el software local módulo por módulo y se corrigieron 15 hallazgos reales adicionales que la Fase 4 no había cerrado (ver sección 16 para el resumen ejecutivo). Todos los commits en `main`, ninguno pusheado — esperando autorización explícita del usuario para `git push`. Migraciones 00008-00025 pendientes de aplicar/confirmar por el usuario en Supabase real (la `00025` es nueva, de esta ronda). Se consolidó el login del sitio en una sola ruta (`/iniciar-sesion`, sección 14). Queda documentado un candidato claro para una futura Fase 5: ampliar la cobertura de `audit_logs` a ~8 módulos que hoy no registran nada (sección 15.17).

Contexto de la Fase 3B (sección 10): el usuario comparó una captura del software local corriendo contra la nube y encontró que la Fase 2 (sección 5.3) se había saltado 4 módulos que la Fase 1 sí identificó correctamente: Calculadora, Mi Cuadre, Historial Mensual, y Ventas del Día completo. Ya están cerrados.

---

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
| 3.3 | Módulo Cuentas | ✅ Completada (commit local; falta aplicar migración 00011 en Supabase real) |
| 3.4 | Módulo Registrar Venta (POS) + recibo PDF | ✅ Completada (commit local; falta aplicar migraciones 00012/00013 en Supabase real) |
| 3.5 | Facturas a proveedores + abonos | ✅ Completada (commit local; falta aplicar migración 00014 en Supabase real) |
| 3.6 | Fiado + abonos | ✅ Completada (commit local; falta aplicar migración 00015 en Supabase real) |
| 3.7 | Préstamos, Notas, Presupuesto (+ Gastos operativos) | ✅ Completada (commit local; falta aplicar migración 00016 en Supabase real) |
| 3.8 | Reportes enriquecidos + Rendimiento Vendedores + ocultamiento de costos por rol | ✅ Completada (commit local, sin migración pendiente) |
| 3.9 | Exportar/Importar Excel (18 pestañas) | ✅ Completada (commit local; requiere `npm install` por la dependencia nueva `exceljs`) |
| 3.10 | Revisión final de regresión de la tienda pública + cierre de documentación | ✅ Completada |

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

## 6.3 Detalle de la sub-fase 3.3 (completada)

**Nueva migración**: `supabase/migrations/00011_account_balance_functions.sql` — dos funciones `SECURITY DEFINER` (mismo patrón que `decrement_stock`/`create_order_with_items`, solo ejecutables por `service_role`, `search_path` fijo):
- `adjust_account_balance(...)`: actualiza el saldo de una cuenta e inserta su `account_movements` en una sola transacción. Se reutilizará en sub-fases futuras (venta POS, pago de factura, abono de fiado) para acreditar/debitar cuentas de forma atómica.
- `transfer_between_accounts(...)`: valida saldo suficiente en la cuenta origen, mueve el saldo entre dos cuentas y registra los dos movimientos enlazados (`transfer_out`/`transfer_in`) por un `reference_id` compartido, todo en una transacción.

**⚠️ Pendiente manual**: aplicar `00011_account_balance_functions.sql` en el SQL Editor del proyecto Supabase real (igual que se hizo con 00008/00009/00010) antes de poder usar "Ajuste manual" o "Transferir" en `/admin/cuentas` — sin esto, esos dos botones fallarán con error de función no encontrada. El resto de la pantalla (ver saldos, listar movimientos) sí funcionará porque las tablas del 00009 ya existen.

**API nuevas**:
- `GET/POST /api/accounts` — listar cuentas activas / crear cuenta (creación restringida a `admin`).
- `PUT /api/accounts/[id]` — editar nombre/color/orden/activo de una cuenta. **Nunca acepta `balance_cents` directamente** — el saldo solo cambia a través de movimientos, para que siempre quede trazabilidad.
- `GET/POST /api/account-movements` — listar movimientos (con filtros) / registrar un ajuste manual (usa `adjust_account_balance`).
- `POST /api/account-movements/transfer` — transferir entre dos cuentas (usa `transfer_between_accounts`).
- `GET/POST /api/account-closures` — listar cierres mensuales / hacer (o rehacer) el cierre del mes actual, tomando una foto (`snapshot` jsonb) del saldo de todas las cuentas activas. Solo `admin`, igual que en el software local.

**UI nueva**: `/admin/cuentas` (agregada al sidebar del admin, entre Inventario y Cierres), con 3 pestañas como el software local:
- **Resumen**: tarjetas de saldo por cuenta + saldo total, formulario de ajuste manual y formulario de transferencia entre cuentas.
- **Movimientos**: tabla de los últimos 50 movimientos con cuenta, tipo, descripción, monto (verde/rojo) y fecha.
- **Cierres**: botón "Hacer cierre" (solo admin) que guarda el snapshot del mes actual, y lista de cierres anteriores con el desglose por cuenta.

**Verificación hecha**: `npx tsc --noEmit` (68 errores preexistentes, 0 nuevos), `npx eslint` sin advertencias, y `npx vitest run` — **10 archivos de test, 62 tests, todos pasando** (misma línea base que antes de este cambio — ninguna prueba existente se rompió).

**Cómo probarlo manualmente** (después de aplicar la migración 00011 y desplegar/correr local): entrar a `/admin/cuentas` como admin, ver las 6 cuentas con saldo en $0, hacer un ajuste manual de entrada (ej. $100.000 a Efectivo) y confirmar que el saldo sube y aparece en Movimientos; hacer una transferencia de una cuenta a otra y confirmar que ambos saldos se actualizan y aparecen los dos movimientos enlazados; intentar transferir más de lo que hay en la cuenta origen y confirmar que se rechaza ("Saldo insuficiente"); y finalmente hacer el cierre del mes y confirmar que aparece en la pestaña Cierres con el desglose por cuenta.

## 6.4 Detalle de la sub-fase 3.4 (completada) — el corazón del sistema

**Nuevas migraciones**:
- **`00012_pos_commission_rates.sql`**: columna aditiva `store_settings.pos_commission_rates` (jsonb, default todo en 0%). Se usará para calcular la comisión informativa de cada pago — hoy siempre da $0 porque la UI de Configuración para editar estas tasas todavía no existe (llega en la sub-fase 3.8). No bloquea nada mientras tanto.
- **`00013_pos_sale_functions.sql`**: dos funciones `SECURITY DEFINER` (mismo patrón que 00005/00006/00011):
  - `create_pos_sale(p_order, p_items, p_payments)`: en una sola transacción — crea la orden (`channel='pos'`, `payment_status='paid'`, `status='delivered'`), descuenta stock de cada producto/variante (con bloqueo de fila, igual que `decrement_stock`), inserta cada `order_item` y su `inventory_movement`, inserta cada `payment` y acredita la cuenta enlazada (`account_movements` tipo `sale`). Si el stock no alcanza para algún ítem, revierte todo y lanza error.
  - `cancel_pos_sale(p_order_id)`: reversa completa de una venta de mostrador — restaura stock, revierte crédito de cuentas, marca la orden `cancelled`/`refunded`.

**Nuevas API**:
- `GET /api/pos/search` — busca productos (+ sus variantes) por nombre/SKU (`?q=`) o por código de barras exacto (`?barcode=`, para el lector USB tipo teclado).
- `POST /api/pos/sales` — registra una venta de mostrador: resuelve título/SKU/costo reales desde la BD (nunca confía en eso del cliente), valida que los pagos cubran el total, calcula comisión informativa por método, y llama a `create_pos_sale`.
- `GET /api/pos/sales` — lista ventas de mostrador (para "Ventas de hoy"), filtrable por rango de fecha.
- `DELETE /api/pos/sales/[id]` — cancela una venta (llama a `cancel_pos_sale`).

**UI nueva**: `/admin/ventas` ("Registrar Venta" en el sidebar, entre Órdenes e Inventario) — buscador con soporte de escaneo de código de barras (Enter dispara búsqueda exacta), carrito editable (cantidad, precio, descuento por línea), datos de cliente opcionales (nombre/teléfono/cédula), sección de pago con **métodos combinados** (Efectivo/Datáfono/Transferencia/Addi/Otro, cada uno con su propia cuenta y monto), botón "Registrar venta", enlace al recibo de la última venta, y una lista de "Ventas de hoy" con opción de cancelar.

**Recibo**: se reutilizó el endpoint que ya existía para las facturas online (`/api/orders/[id]/invoice`) — funciona igual para ventas de mostrador porque una venta POS es, debajo, una fila más de `orders`. Se le agregó una rama condicional (`channel==='pos'`): título "RECIBO DE VENTA" en vez de "FACTURA", muestra los métodos de pago usados en vez de la caja de envío, y oculta la línea de envío en los totales. **Para pedidos online (`channel==='online'`, el único valor que existían antes de este cambio) el HTML generado es exactamente igual que antes** — se verificó leyendo el diff línea por línea.

**Decisiones de diseño**:
- La comisión del método de pago se guarda en `payments.commission_cents` solo para reporte — **no se resta del total de la venta ni de la ganancia**, igual que la regla del software local ("la comisión se traslada al cliente").
- El monto que se acredita a cada cuenta es el `amount_cents` completo de cada pago (lo que realmente entra por ese medio), no el monto menos comisión.
- `orders.customer_email` sigue siendo `NOT NULL` (no se tocó esa columna) — una venta de mostrador sin correo usa el valor por defecto `mostrador@yjbmotocom.com`, que el recibo detecta y oculta.
- No se implementó todavía edición de una venta ya registrada (solo cancelación completa) — igual que el local permite editar una venta existente; si hace falta, se agrega como ajuste posterior.

**Verificación hecha**: `npx tsc --noEmit` (0 errores nuevos — de hecho uno menos que la línea base, por un cast que ya estaba mal tipado), `npx eslint` sin advertencias, `npx vitest run` — **10 archivos, 62 tests, todos pasando**, misma línea base que las sub-fases anteriores.

**⚠️ Pendiente manual**: aplicar `00012_pos_commission_rates.sql` y `00013_pos_sale_functions.sql` (en ese orden) en el SQL Editor del proyecto Supabase real antes de poder usar `/admin/ventas` en producción.

**Cómo probarlo manualmente** (después de aplicar 00012/00013 y desplegar/correr local): entrar a `/admin/ventas`, buscar un producto por nombre (o por su código de barras si tiene variantes con código configurado desde Inventario), agregarlo al carrito, ajustar cantidad/precio si hace falta, completar el pago (probar con un solo método y luego con dos métodos combinados que sumen el total), registrar la venta, verificar que: (1) aparece en "Ventas de hoy", (2) el recibo abre correctamente y dice "RECIBO DE VENTA", (3) el stock del producto/variante bajó en Inventario, (4) el saldo de la cuenta usada subió en `/admin/cuentas`. Luego cancelar esa venta y confirmar que el stock y el saldo de la cuenta vuelven a su valor original.

## 6.5 Detalle de la sub-fase 3.5 (completada)

**Nueva migración**: `00014_supplier_invoice_functions.sql` — dos funciones `SECURITY DEFINER` (mismo patrón que las anteriores):
- `pay_supplier_invoice(...)`: inserta el abono, debita la cuenta indicada (si hay) vía `account_movements` tipo `invoice_payment`, y marca la factura `paid` automáticamente cuando la suma de abonos alcanza el monto total — igual que el software local. Sirve tanto para abonos parciales como para "pagar el saldo restante" (la UI solo precarga el monto).
- `delete_supplier_invoice(...)`: antes de borrar, revierte (acredita de vuelta) cualquier abono que hubiera debitado una cuenta.

**Nuevas API**: `GET/POST /api/supplier-invoices`, `GET/PUT/DELETE /api/supplier-invoices/[id]`, `POST /api/supplier-invoices/[id]/payments` (abono), `POST /api/supplier-invoices/[id]/items` + `DELETE /api/supplier-invoice-items/[id]` (ítems de línea, funcionalidad que el propio local documenta como recién agregada y poco usada — se incluyó por paridad, básica).

**UI nueva**: `/admin/facturas` (agregada al sidebar, entre Cuentas y Cierres) — tarjetas de "total pendiente" y "vencen en ≤7 días", filtro pendiente/pagada/todas, formulario de alta, y por cada factura: expandible con fecha de llegada/vencimiento, saldo, lista de abonos, formulario de abono (monto + cuenta opcional + notas, con botón "Usar saldo restante"), y eliminar (con confirmación, avisando que revierte abonos).

**Nota de fidelidad**: el software local muestra una alerta emergente al arrancar (y cada 4h) si hay facturas venciendo en ≤7 días. Eso es un patrón de aplicación de escritorio que no tiene un equivalente directo y automático en una app web sin un sistema de notificaciones — en su lugar, la pantalla de Facturas muestra el conteo y una insignia "Vence pronto"/"Vencida" por factura, visible cada vez que se entra a la sección. Si más adelante se quiere una alerta activa (ej. en el Dashboard), se puede agregar como mejora puntual.

**Verificación hecha**: `npx tsc --noEmit` (0 errores nuevos), `npx eslint` sin advertencias, `npx vitest run` — 10 archivos, 62 tests, todos pasando.

**⚠️ Pendiente manual**: aplicar `00014_supplier_invoice_functions.sql` en el SQL Editor del proyecto Supabase real.

**Cómo probarlo manualmente**: entrar a `/admin/facturas`, crear una factura de prueba con proveedor/monto/fecha de vencimiento, registrar un abono parcial con una cuenta (confirmar que el saldo de esa cuenta baja en `/admin/cuentas`), luego usar "Usar saldo restante" para completarla y confirmar que pasa a "Pagada" automáticamente; después eliminar otra factura de prueba con abonos y confirmar que el saldo de la cuenta se restituye.

## 6.6 Detalle de la sub-fase 3.6 (completada)

**Nueva migración**: `00015_customer_credit_functions.sql`:
- Corrige un detalle de la migración 00009: el `CHECK` de `account_movements.type` incluía `'credit_payment_reversal'` pero **no** `'credit_payment'` (el tipo positivo correspondiente) — se amplía aquí (nunca se restringe).
- `pay_customer_credit(...)`: inserta el abono, **acredita** (no debita — el dinero entra al negocio, al revés que un abono a factura de proveedor) la cuenta indicada, y marca el fiado `paid` automáticamente al completar el monto.
- `delete_customer_credit(...)`: revierte (debita de vuelta) los abonos que hubieran acreditado una cuenta antes de borrar.

**Nuevas API**: `GET/POST /api/customer-credits` (la creación admite abono inicial opcional, para el caso de "dejar algo al apartar"), `GET/PUT/DELETE /api/customer-credits/[id]`, `POST /api/customer-credits/[id]/payments`.

**UI nueva**: `/admin/fiado` ("Fiado" en el sidebar, entre Facturas y Cierres; título de la pantalla "Apartados y Abonos de Clientes" igual que en el local) — mismo patrón que Facturas: alta con abono inicial opcional, filtro pendiente/pagado/todos, por cliente ver abonos, registrar abono con "usar saldo restante", eliminar con reversión.

**Verificación hecha**: `npx tsc --noEmit` (0 errores nuevos), `npx eslint` sin advertencias, `npx vitest run` — 10 archivos, 62 tests, todos pasando.

**⚠️ Pendiente manual**: aplicar `00015_customer_credit_functions.sql` en el SQL Editor del proyecto Supabase real.

**Cómo probarlo manualmente**: entrar a `/admin/fiado`, crear un fiado de prueba con un abono inicial y una cuenta (confirmar que el saldo de esa cuenta **sube** en `/admin/cuentas` — al revés que en Facturas), luego completar el saldo restante y confirmar que pasa a "Pagado"; eliminar un fiado de prueba con abonos y confirmar que el saldo de la cuenta se revierte (baja).

## 6.7 Detalle de la sub-fase 3.7 (completada)

**⚠️ Hallazgo importante corregido en esta sub-fase**: al construir Presupuesto Mensual detecté que la sub-fase 3.1 se quedó corta — el software local compara presupuesto contra **gasto real por categoría**, usando su tabla `gastos_dia` (fecha, descripción, monto, categoría, cuenta). Esa tabla nunca se creó en las migraciones anteriores (00008/00009 listaron 10 tablas nuevas, pero omitieron esta). Sin ella, Presupuesto Mensual no tendría con qué compararse. Se corrige en esta sub-fase con la migración `00016_operating_expenses.sql`, sin necesidad de tocar nada de lo ya aplicado.

**Migración `00016`**:
- Tabla nueva `operating_expenses` (fecha, descripción, monto, categoría, cuenta opcional) + RLS (admin/seller).
- `record_operating_expense(...)`: inserta el gasto y debita la cuenta indicada, si hay.
- `delete_operating_expense(...)`: revierte el débito antes de borrar.

**Nuevas API**: `GET/POST /api/loans`, `PUT/DELETE /api/loans/[id]` — `GET/POST /api/notes`, `PUT/DELETE /api/notes/[id]` — `GET/POST /api/operating-expenses`, `DELETE /api/operating-expenses/[id]` — `GET/POST /api/monthly-budgets` (upsert por año/mes/categoría).

**UI nueva** (3 pantallas, agregadas al sidebar entre Fiado y Cierres):
- **`/admin/prestamos`**: registrar préstamo de un producto/variante (reutiliza el buscador de `/api/pos/search`) a un almacén externo, cambiar estado (pendiente/devuelto/cobrado), eliminar.
- **`/admin/notas`**: notas tipo tarea o resurtido, con fecha límite, marcar completada, insignia de vencida.
- **`/admin/presupuesto`**: pestaña "Presupuesto" (por categoría/mes, con barra de progreso gastado-vs-presupuestado, roja si se excede) y pestaña "Gastos" (alta y listado de gastos operativos del mes, con cuenta opcional que se debita).

**Verificación hecha**: `npx tsc --noEmit` (0 errores nuevos), `npx eslint` sin advertencias, `npx vitest run` — 10 archivos, 62 tests, todos pasando.

**⚠️ Pendiente manual**: aplicar `00016_operating_expenses.sql` en el SQL Editor del proyecto Supabase real.

**Cómo probarlo manualmente**: en `/admin/prestamos` registrar un préstamo y cambiarle el estado; en `/admin/notas` crear una tarea con fecha pasada y confirmar que se ve como vencida, luego marcarla completada; en `/admin/presupuesto` configurar un presupuesto para una categoría (ej. "Arriendo" $500.000), registrar un gasto en esa misma categoría con una cuenta, confirmar que la barra de progreso se actualiza y que el saldo de la cuenta bajó en `/admin/cuentas`.

## 6.8 Detalle de la sub-fase 3.8 (completada) — tocó código ya existente, con cuidado extra

Esta sub-fase, a diferencia de las anteriores, modificó archivos que **ya estaban en producción** (`ProductForm`, `/admin/inventario`, `/admin/reportes`), así que se verificó con más rigor de lo normal antes de dar por buena cada pieza.

**Ocultamiento de costos por rol** (solo `admin` ve costo/comisión/ganancia, igual que "Admin vs Vendedor" en el local):
- **`components/products/product-form.tsx`** (compartido por Nuevo Producto y Editar Producto, **ya en producción**): el campo "Precio de Costo" ahora solo se renderiza si `userProfile.role === 'admin'`. El valor real sigue viajando en `formData.cost` (se carga del producto al editar) y se envía sin cambios al guardar — un vendedor simplemente no ve ni edita ese campo; para un producto nuevo creado por un vendedor, el costo queda en 0 hasta que un admin lo complete. Cambio de una sola condición, sin tocar ningún otro campo ni la lógica de guardado.
- **`/admin/inventario`** (propio de la sub-fase 3.2, aún sin pushear): se ocultó igual la columna "Costo" de la tabla de variantes y el input "Costo unitario" del formulario de alta, para el rol `seller`.
- **Decisión de diseño**: el software local, en vez de ocultar el costo al Vendedor, le muestra un costo "inflado" (`costo × 1.30`) para que la calculadora interna siga funcionando sin revelar el costo real. Para la nube se optó por **ocultar el campo directamente** en vez de fabricar un número falso — es más simple, evita el riesgo de que un número inventado se malinterprete como real, y cumple el mismo objetivo de fondo ("que el vendedor no vea el costo/ganancia real").

**Reportes enriquecidos** (`/admin/reportes`, aditivo — ninguna tarjeta/gráfica existente se tocó ni se quitó):
- La consulta a `orders` ahora también trae `order_items(..., cost_cents)` y `payments(commission_cents)` (antes no los pedía).
- Se agregaron 4 tarjetas nuevas — Costo Total, Comisiones, Ganancia Neta, Utilidad Real — **visibles solo para `admin`** (`canViewProfit`).
- "Utilidad Real" = Ganancia Neta − gastos operativos del periodo (tabla `operating_expenses` de la sub-fase 3.7), como aproximación de la fórmula del local (que usa gastos fijos mensuales prorrateados, un concepto que la nube no modela todavía como una configuración aparte — se documenta como simplificación deliberada, no como pendiente crítico).
- Corrección incidental: si el rango de fechas no tiene órdenes, ahora se limpian los totales a cero (antes quedaban pegados los del último rango con datos) — necesario para que las tarjetas nuevas no muestren cifras de ganancia inconsistentes con ingresos en cero.

**Rendimiento Vendedores** (`/admin/rendimiento-vendedores`, página nueva, **admin-only** como en el local): nueva API `GET /api/reports/seller-performance` (agrupa órdenes `channel='pos'` por `seller_id`), con guardia tanto en el API (`requireAuth(['admin'])`) como en la UI (pantalla de "solo administradores" si el rol no es admin).

**Verificación hecha** (más exhaustiva de lo normal por tocar código en producción):
- `npx tsc --noEmit`: 0 errores nuevos.
- `npx eslint`: 0 advertencias nuevas (se confirmó contra el archivo original que el único warning reportado en `reportes/page.tsx` ya existía antes de mi cambio).
- `npx vitest run`: 10 archivos, 62 tests, todos pasando.
- **`npm run build` (build de producción completo)**: compiló exitosamente **todas** las rutas de la app, incluidas las públicas críticas (`/checkout`, `/productos`, `/producto/[slug]`, `/categoria/[slug]`, `/mi-cuenta`, `/login`, `/registro`, `/orden/[id]/confirmacion`) y todas las de admin nuevas/modificadas — sin errores. Esta es la verificación más fuerte posible sin un navegador interactivo real.

**Cómo probarlo manualmente**: iniciar sesión como `seller` y confirmar que no ve "Precio de Costo" en Productos ni "Costo" en las variantes de Inventario, ni las 4 tarjetas nuevas de Reportes, y que `/admin/rendimiento-vendedores` le muestra el mensaje de "solo administradores". Luego iniciar sesión como `admin` y confirmar que todo lo anterior sí es visible, con cifras coherentes (Ganancia Neta = Ingresos − Costo Total).

## 6.9 Detalle de la sub-fase 3.9 (completada) — el "cerebrito" de la operación

**Decisión de alcance (importante, comunicada antes de construir)**: la exportación trae **las 18 hojas completas** (paridad con `YJBMOTOCOM_Historial.xlsx` del local). La importación, en cambio, **solo escribe en las 13 tablas internas del módulo YJBMOTOCOM** — nunca en `products`, `orders`/`order_items`/`payments`, `users` ni `store_settings`. Así, pase lo que pase en una importación, es físicamente imposible que afecte el catálogo, el checkout o el login. Las 5 hojas de solo-exportación son: **Ventas** (viene de `orders`/`order_items`/`payments`, no tiene sentido reimportarla — recrear ventas históricas requeriría re-descontar stock y re-acreditar cuentas, lo cual es responsabilidad de "Registrar Venta", no de un import genérico), **Usuarios** (no se pueden crear usuarios de Auth desde una fila de Excel), **Configuración** (toca `store_settings`, usado por el checkout), **Log Auditoría** (es un historial de solo-lectura por naturaleza) y **Cierres Cuentas** (ver el hallazgo de abajo).

**Hallazgo corregido durante la construcción**: al diseñar la hoja "Cierres Cuentas" me di cuenta de que el `snapshot` (saldos de cada cuenta al momento del cierre) es un JSON que no se puede aplanar de forma fiel a columnas simples de Excel sin perder información — si se reimportara sin él, **borraría el historial de saldos de ese cierre**. Se decidió dejar esa hoja como solo-exportación en vez de arriesgar esa pérdida de datos.

**Dependencia nueva**: se agregó `exceljs` (`^4.4.0`) a `apps/web/package.json` — **requiere `npm install` antes de correr o desplegar**.

**Archivos nuevos**:
- `apps/web/src/lib/excel/sheets.ts`: definición central de las 18 hojas (columnas, de dónde se leen para exportar, y cómo se reescriben para las 13 importables). Fuente única de verdad para que export e import nunca queden desincronizados.
- `GET /api/admin/excel/export`: genera el .xlsx completo (streaming, sin guardar nada en disco del servidor), solo `admin`.
- `POST /api/admin/excel/import`: recibe el .xlsx subido, y para cada una de las 13 hojas importables hace un `upsert` por `ID` en el orden de dependencias correcto (cuentas antes que sus movimientos, facturas antes que sus ítems/abonos, etc.), devolviendo un resumen por hoja (importadas/omitidas/error). Filas sin `ID` se tratan como altas nuevas (Postgres genera el id); filas con `ID` actualizan la fila existente. Los campos no incluidos en cada hoja (ej. `reference_type`, `created_by`) **no se tocan** en una actualización — solo se actualiza lo que la hoja realmente representa.
- `/admin/exportar-importar` (agregada al sidebar antes de Configuración, **admin-only**): botón de descarga, subida de archivo con confirmación explícita antes de importar, y tabla de resultados por hoja.

**Verificación hecha** (incluyendo un chequeo extra por agregar una dependencia nueva): `npx tsc --noEmit` (0 errores nuevos), `npx eslint` (0 advertencias nuevas), `npx vitest run` (10 archivos, 62 tests, todos pasando), y **`npm run build` de producción completo** — compiló sin errores, con `/api/admin/excel/export` y `/api/admin/excel/import` correctamente marcadas como rutas dinámicas (server-rendered), y **todas las páginas públicas siguen intactas**.

**Cómo probarlo manualmente**: en `/admin/exportar-importar`, descargar el respaldo y abrir el .xlsx para confirmar que las 18 hojas tienen datos coherentes con lo que hay en Cuentas/Facturas/Fiado/etc. Luego, sin modificar nada, volver a subir ese mismo archivo y confirmar que la importación no duplica filas (mismo conteo de filas antes/después, porque cada fila trae su `ID` real y se actualiza en vez de crearse de nuevo). Como prueba adicional, agregar una fila nueva sin `ID` en la hoja "Notas" del Excel descargado, reimportar, y confirmar que aparece como nota nueva en `/admin/notas`.

**Limitación conocida (documentada, no bloqueante)**: este Excel es el respaldo/portabilidad del **sistema en la nube hacia adelante** — no es un puente para importar el `YJBMOTOCOM_Historial.xlsx` real del software local (estructuras de datos incompatibles: IDs autoincrementales de SQLite vs. UUIDs de Postgres, pesos vs. centavos, etc.), consistente con que ya acordamos no migrar el historial.

## 7. Decisiones tomadas (registro rápido)

1. Alegra convive en paralelo, no se reemplaza ni se toca.
2. `vendedor` (local) = `seller` (nube), mismas restricciones de visibilidad de costos/ganancia.
3. Recibo de venta: PDF + impresión vía diálogo del navegador (no ESC/POS directo).
4. Sin ramas: todo en `main`, commits locales, push solo con autorización explícita del usuario.
5. No se migra historial de ventas/inventario del local — se arranca en cero en la nube.

## 8. Cómo retomar si se interrumpe el trabajo

1. Lee este archivo completo.
2. Revisa `git log` y `git status` en `main` para ver qué commits locales existen ya (recuerda: pueden no estar pusheados).
3. Si la Fase 3 y la Fase 3B (secciones 9-11) ya están completas, lo que sigue es: (a) aplicar las migraciones pendientes (00017, 00018) si aún no se hizo, (b) que el usuario autorice el `git push` y despliegue, y/o (c) una posible "Fase 4" de mejoras futuras (ver Limitaciones en la sección 9.6) si el usuario la pide.
4. Si hay migraciones SQL ya creadas en `supabase/migrations/` que no aparecen aquí como completadas, revisa si ya se aplicaron en el proyecto Supabase real antes de reaplicarlas.
5. No hay que repetir la Fase 1, la Fase 2, ni ninguna sub-fase ya marcada ✅ en la sección 6 — ya están aprobadas y verificadas.

## 9.0 Trabajo adicional: 0 errores de TypeScript en todo el proyecto (2026-07-21)

Fuera del alcance original de la Fase 3, pero surgió de una pregunta del usuario sobre los ~68 errores preexistentes de `tsc` que se venían tolerando en cada sub-fase (por `ignoreBuildErrors: true`). Se investigó a fondo, se encontraron 3 causas raíz reales, y se corrigieron en 3 commits (con autorización explícita del usuario antes de tocar archivos de checkout/pagos):

1. **`database.ts` no tenía el campo `Relationships`** que exige la versión instalada de `@supabase/supabase-js` (2.93.2, mucho más nueva que el `^2.39.0` fijado en `package.json`) — se agregó `Relationships: []` a las 27 tablas.
2. **Los `Relationships` vacíos no alcanzaban para los `.select()` con joins** — se declararon las FKs reales (extraídas de `supabase/migrations/*.sql`, ninguna inventada) para las 27 tablas. Se resolvió una ambigüedad real (`orders` tiene 2 FKs hacia `users`) con el hint `!orders_seller_id_fkey` en los 2 selects que lo necesitaban.
3. **`tsconfig.json` nunca declaraba `target`** (default: ES3) — se agregó `"target": "es2020"` (seguro: Next.js transpila el código real con su propio compilador SWC, esto solo afecta el chequeo estático). Esto arregló `rate-limit.ts` solo, y expuso una clave duplicada inofensiva en `stripe-helpers.ts` (`'canceled': 'cancelled'` dos veces, mismo valor) que se quitó.

Los casos restantes (un puñado de archivos, incluyendo `api/orders/route.ts` y las páginas que usan `createClientComponentClient` de `@supabase/auth-helpers-nextjs@0.9.0`, un paquete deprecado con tipos desincronizados de la versión real de `supabase-js`) se resolvieron con el mismo patrón de cast puntual ya usado en el proyecto — **sin actualizar ni tocar el paquete de auth-helpers**, porque eso sí afectaría el manejo real de sesión/cookies en todo el sitio.

**Resultado: 68 → 0 errores.** Verificado con `tsc --noEmit`, `eslint` (0 nuevos), `vitest run` (62/62) y `npm run build` de producción completo después de cada uno de los 3 commits, con atención especial a `/checkout`, `/login`, `/registro`, `/mi-cuenta` y `/productos` en el commit que tocó `api/orders/route.ts` y `stripe-helpers.ts`.

**Nota para el futuro**: `next.config.js` sigue teniendo `typescript.ignoreBuildErrors: true` — no se quitó porque no era parte de lo pedido, pero ahora que `tsc` da 0 errores, se podría quitar esa bandera de forma segura si se quiere que el build falle ante errores de tipos futuros (recomendado, pero es una decisión aparte).

## 9. Cierre de la Fase 3 — entrega final (2026-07-21)

Las 10 sub-fases (3.1 a 3.10) quedaron completas. Esto es la entrega formal de la Fase 3, tal como se pidió al inicio del proyecto.

### 9.1 Tabla comparativa final (qué se reutilizó, qué se ajustó, qué se construyó nuevo)

| Función del software local | Qué pasó en la nube |
|---|---|
| Registrar Venta (POS, tallas, código de barras, pagos combinados, comisión) | **Construido nuevo** — `/admin/ventas` + función atómica `create_pos_sale` (3.4) |
| Inventario (talla, código de barras) | **Ajustado** — se agregaron variantes (`product_variants`) sobre `/admin/inventario` ya existente (3.2) |
| Cuentas (saldo por medio de pago) | **Construido nuevo** — `/admin/cuentas` (3.3) |
| Cierre mensual de Cuentas | **Construido nuevo** — pestaña "Cierres" dentro de `/admin/cuentas`, por snapshot (3.3) |
| Facturas a proveedores + abonos | **Construido nuevo** — `/admin/facturas` (3.5) |
| Fiado / clientes deudores | **Construido nuevo** — `/admin/fiado` (3.6) |
| Préstamos a otros almacenes | **Construido nuevo** — `/admin/prestamos` (3.7) |
| Notas y pendientes | **Construido nuevo** — `/admin/notas` (3.7) |
| Presupuesto mensual (+ gastos operativos, tabla que faltaba) | **Construido nuevo** — `/admin/presupuesto` (3.7) |
| Reportes (ganancia, comisión, utilidad, vendedor) | **Ajustado** — 4 tarjetas nuevas sobre `/admin/reportes` ya existente, solo visibles para admin (3.8) |
| Rendimiento por Vendedor | **Construido nuevo** — `/admin/rendimiento-vendedores`, admin-only (3.8) |
| Roles con ocultamiento costo/ganancia (Admin ve todo, Vendedor no) | **Ajustado** — condición agregada en `ProductForm` (ya en producción) e Inventario; se decidió ocultar el campo en vez de mostrar el "costo inflado ×1.30" del local (3.8) |
| Exportar/Importar Excel (18 pestañas) | **Construido nuevo** — `/admin/exportar-importar`; exportación completa, importación limitada a las 13 tablas internas del módulo por seguridad (3.9) |
| Dashboard, Órdenes, Productos, Cupones, Reseñas, Usuarios, Auditoría, Configuración, Cierre Alegra | **Se quedan tal cual** — no se tocaron (excepto la única condición de costo en Productos) |
| Catálogo, carrito, checkout, cuentas de cliente (tienda pública) | **Se quedan exactamente igual** — cero archivos tocados bajo `app/(shop)/` |

### 9.2 Resumen de los cambios realizados

- **9 commits locales** en `main` (sub-fases 3.1 a 3.9; la 3.10 es esta revisión, sin cambios de código nuevos).
- **9 migraciones SQL** (`00008` a `00016`), todas aditivas, ya aplicadas por el usuario en el Supabase real.
- **1 dependencia nueva**: `exceljs` (para el Excel de la sub-fase 3.9) — requiere `npm install`.
- **12 módulos nuevos** en el panel de administrador: Registrar Venta, Cuentas, Facturas, Fiado, Préstamos, Notas, Presupuesto, Rendimiento Vendedores, Exportar/Importar, más las variantes de Inventario y el enriquecimiento de Reportes.
- **Solo 6 archivos pre-existentes modificados** en todo el proyecto (fuera de `package.json`/lockfile y `docs/README.md`): `admin/layout.tsx` (solo agrega enlaces al menú), `admin/inventario/page.tsx`, `admin/reportes/page.tsx`, `api/inventory/adjust/route.ts`, `api/orders/[id]/invoice/route.ts`, `components/products/product-form.tsx` — todos con cambios acotados y revisados uno por uno (ver detalle en las secciones 6.1 a 6.9 de este documento).
- **Cero archivos tocados** bajo `apps/web/src/app/(shop)/` (confirmado con `git diff --stat`) — la tienda pública no tiene ni un solo cambio.

### 9.3 Confirmación: la parte pública de la tienda sigue funcionando igual

- `git diff origin/main..HEAD --stat -- "apps/web/src/app/(shop)/"` → **sin resultados**: ningún archivo de catálogo, carrito, checkout o cuentas de cliente fue tocado.
- El único archivo compartido con la tienda pública que sí se modificó es `api/orders/[id]/invoice/route.ts` (la factura/recibo) — el cambio es una rama condicional por `channel==='pos'`; para `channel==='online'` (el único valor que existía antes de este proyecto) el HTML generado es exactamente igual, verificado línea por línea en la sub-fase 3.4.
- `npm run build` (producción, corrido al final de las sub-fases 3.4, 3.8, 3.9 y de nuevo en esta revisión final) compiló **sin errores** las 8 rutas públicas críticas: `/`, `/productos`, `/producto/[slug]`, `/categoria/[slug]`, `/checkout`, `/mi-cuenta`, `/login`, `/registro`, `/orden/[id]/confirmacion`.
- `npx vitest run`: 10 archivos, **62 tests, todos pasando**, misma línea base en las 9 sub-fases.
- `npx tsc --noEmit`: mismos 67 errores preexistentes (no relacionados, ya tolerados por `ignoreBuildErrors`) en cada verificación — **cero errores nuevos** introducidos en todo el proyecto.

### 9.4 Instrucciones para probar el flujo de ventas unificado de principio a fin

Antes de nada: correr `npm install` en `apps/web` (por `exceljs`).

1. **Catálogo → checkout (no debe haber cambiado nada)**: navegar el catálogo, agregar un producto al carrito, completar el checkout con cualquier método de pago de prueba, confirmar que llega el correo/confirmación como siempre.
2. **Inventario con tallas**: en `/admin/inventario`, abrir un producto y agregar una variante (talla, código de barras, stock, costo).
3. **Cuentas**: en `/admin/cuentas`, hacer un ajuste manual de saldo a "Efectivo" y una transferencia a otra cuenta.
4. **Venta de mostrador**: en `/admin/ventas`, buscar el producto con la variante creada en el paso 2, agregarlo al carrito, pagar con 2 métodos combinados (ej. mitad efectivo, mitad Nequi), registrar la venta — confirmar que el stock de la variante bajó (paso 2) y que el saldo de las cuentas usadas subió (paso 3).
5. **Recibo**: abrir el recibo de esa venta y confirmar que dice "RECIBO DE VENTA" con el desglose de pagos.
6. **Facturas/Fiado**: crear una factura de proveedor y un fiado de cliente, cada uno con un abono parcial contra una cuenta — confirmar que el saldo de esa cuenta se mueve en la dirección correcta (baja para factura, sube para fiado).
7. **Reportes**: en `/admin/reportes`, confirmar que las 4 tarjetas de costo/ganancia solo aparecen con un usuario `admin`, no con `seller`.
8. **Exportar/Importar**: en `/admin/exportar-importar`, descargar el respaldo y volver a subirlo — confirmar que no duplica filas.
9. **Cancelar una venta**: en `/admin/ventas`, cancelar la venta del paso 4 y confirmar que el stock y los saldos de cuentas vuelven a su valor anterior.

### 9.5 Pasos manuales pendientes de tu parte

1. **`npm install`** en `apps/web` (dependencia `exceljs` nueva).
2. **Revisar y aprobar el `git push`** — todo sigue solo local, en 9 commits sobre `main`. En cuanto lo autorices, hago el push (que dispara el despliegue automático de Vercel).
3. Opcional, no urgente: configurar las tasas de comisión reales por método de pago (hoy en 0% — se guardan en `store_settings.pos_commission_rates`, sin una pantalla de edición todavía; se puede agregar cuando la necesites).

### 9.6 Limitaciones conocidas / pendientes (actualizado — ver sección 11 para el estado final)

- ~~Tasas de comisión POS en 0%~~ → **resuelto en 3.15** (`/admin/configuracion-pos`).
- ~~Edición de una venta de mostrador~~ → **resuelto en 3.13** (`/admin/ventas-dia`).
- **Alertas activas de vencimiento** (facturas por vencer, fiados con +30 días): el software local las muestra como notificación emergente al arrancar; en la nube se muestran como insignias visuales al entrar a la sección, no como notificación push. Se puede agregar al Dashboard si se necesita.
- **Impresión térmica ESC/POS directa**: por decisión ya acordada, el recibo es PDF + diálogo de impresión del navegador, no impresión directa a la impresora térmica como hace la app de escritorio.
- **Excel — importación limitada a 13 hojas** (por diseño de seguridad, ver sección 6.9): Ventas, Usuarios, Configuración, Log Auditoría y Cierres Cuentas son de solo exportación.
- **"Cascos desde Factura"** (extracción automática de PDFs de proveedores, parte de Calculadora en el local): no implementado — requiere muestras reales de esos PDFs para replicar el formato exacto de los dos proveedores que usa el local.
- **Edición masiva de método de pago** (cambiar el método de varias ventas del día a la vez): no implementada — editar una venta a la vez (sí disponible desde 3.13) cubre la misma necesidad con más clics, priorizado así por menor riesgo sobre dinero/stock en lote.
- **Rol `viewer`**: sigue sin endurecerse el acceso al shell del admin (hallazgo original de la Fase 1, no introducido por este proyecto). No se tocó porque no era parte del alcance acordado.
- Ninguna de estas limitaciones bloquea el uso del sistema unificado — son mejoras incrementales para una futura iteración si se necesitan.

## 10. Fase 3B — Cierre de brechas de fidelidad (2026-07-21)

**Origen**: el usuario comparó una captura del software local corriendo (16 módulos en su sidebar) contra la nube. Auditoría reveló que la Fase 2 (sección 5.3) se saltó 4 módulos que la Fase 1 sí había identificado correctamente (sección 6, línea "16 módulos: ..."): **Calculadora, Mi Cuadre, Historial Mensual, y Ventas del Día completo**. También quedó parcial la **Configuración POS**. Ronda de sub-fases adicional, mismo flujo de siempre (commits locales, verificación tsc/eslint/vitest/build después de cada una).

| # | Sub-fase | Estado |
|---|---|---|
| 3.11 | Calculadora (precio/margen/comisión, sin persistir) | ✅ Completada |
| 3.12 | Mi Cuadre (vista en vivo, sin costos, auto-refresh) | ✅ Completada |
| 3.13 | Completar Ventas del Día (selector de fecha, editar venta, gastos del día) | ✅ Completada (requiere migración 00017) |
| 3.14 | Historial Mensual (vista por mes, comisiones acumuladas, exportar/imprimir) | ✅ Completada |
| 3.15 | Configuración POS (comisiones + gastos fijos, cierra "Utilidad Real") | ✅ Completada (requiere migración 00018) |
| 3.16 | Revisión final: regresión completa + tabla comparativa actualizada | ✅ Completada |
| 3.17 | Dashboard con 2 pestañas: "Ventas" (estilo local) + "Tienda Online" (existente) | ✅ Completada |

### 10.1 Sub-fase 3.11 — Calculadora

Pantalla `/admin/calculadora` (100% cliente, no persiste nada): Costo + Precio → ganancia, % margen real, % sobre costo, comisión del método elegido y total que paga el cliente; y Costo + margen deseado → precio sugerido. **Corrección retroactiva en 3.14**: el software local restringe costo/margen/ganancia/comisión "en ninguna pantalla" para el rol Vendedor, incluyendo Calculadora explícitamente — la página completa quedó restringida a `admin` (su contenido entero es esa información, no tenía sentido ocultar solo un campo).

Pendiente documentado: "Cascos desde Factura" (extracción de PDFs de proveedores) no se replicó por no tener muestras reales de esos PDFs.

### 10.2 Sub-fase 3.12 — Mi Cuadre

Pantalla `/admin/mi-cuadre`: unidades vendidas, total recaudado y desglose por método de pago del día, auto-refresh cada 60s, sin costos ni márgenes — accesible a `admin` y `seller` por igual (como en el local). Reutiliza `/api/pos/sales`, sin API nueva.

### 10.3 Sub-fase 3.13 — Completar Ventas del Día

**Migración `00017_edit_pos_sale.sql`**: función `edit_pos_sale`, mismo patrón `SECURITY DEFINER` que `create_pos_sale`/`cancel_pos_sale` — revierte por completo la venta actual (stock + saldo de cuentas) y re-aplica los datos nuevos conservando el mismo `id`/`order_number`, igual que "revierte y re-aplica el crédito de cuenta anterior" del local.

Refactor sin cambio de comportamiento: se extrajo la lógica de resolución de productos/comisión a `lib/pos-sale.ts` (`resolveSale`) para reutilizarla en el `PUT` nuevo (`GET/PUT /api/pos/sales/[id]`).

Pantalla `/admin/ventas-dia`: selector de fecha, editar venta completa (carrito + pagos), cancelar, y gastos operativos del día inline.

No incluido (documentado): edición masiva de método de pago en lote — editar una venta a la vez cubre la necesidad con menor riesgo sobre dinero/stock.

**⚠️ Pendiente manual**: aplicar `00017_edit_pos_sale.sql`.

### 10.4 Sub-fase 3.14 — Historial Mensual

Pantalla `/admin/historial-mensual`: selector de mes/año, ingresos/órdenes/unidades visibles para todos, costo/comisiones acumuladas/ganancia neta/exportar-imprimir solo para `admin` (igual que la regla del local de que Vendedor no puede exportar/imprimir reportes con costo/ganancia). El export reutiliza el patrón HTML + `window.print()` ya usado en el recibo de venta, sin dependencias nuevas.

### 10.5 Sub-fase 3.15 — Configuración POS

**Migración `00018_fixed_monthly_expenses.sql`**: columna aditiva `store_settings.fixed_monthly_expenses` (arriendo, sueldo, servicios, otros, días del mes).

**Hallazgo**: `pos_commission_rates` nunca estuvo en `allowedFields` de `PUT /api/settings` desde que se creó en la migración 00012 (sub-fase 3.4) — no existía ninguna forma de editarlo. Se agregó junto con `fixed_monthly_expenses`.

Pantalla `/admin/configuracion-pos` ("Comisiones y Gastos Fijos", admin-only): editar comisión por método de pago y gastos fijos mensuales. **Cierra el ciclo de "Utilidad Real"**: la fórmula en Reportes ahora también resta los gastos fijos prorrateados por día, igual que el software local.

**⚠️ Pendiente manual**: aplicar `00018_fixed_monthly_expenses.sql`.

### 10.6 Verificación de toda la ronda 3B (sub-fase 3.16)

- `tsc --noEmit`: 0 errores en cada una de las 5 sub-fases y en la verificación final conjunta.
- `eslint`: mismos 5 warnings preexistentes (ninguno nuevo) en cada verificación.
- `vitest run`: 10 archivos, 62 tests, todos pasando en cada sub-fase y en la verificación final.
- `npm run build`: corrido en 3.13 y 3.15 (por tocar dinero/stock nuevo y una ruta ya en producción) y de nuevo al cierre de toda la ronda — compiló sin errores.
- `git diff` (desde el commit de inicio de 3.11 hasta el cierre): **cero archivos tocados bajo `apps/web/src/app/(shop)/`** — la tienda pública sigue sin ningún cambio en toda esta ronda.

### 10.7 Sub-fase 3.17 — Dashboard con 2 pestañas

A pedido explícito del usuario tras revisar la auditoría de la sección 11: en vez de dejar el Dashboard como una diferencia sin cerrar, se convirtió en **2 pestañas** dentro de la misma página `/admin`:

- **"Ventas"** (nueva, estilo del software local): ingresos de hoy (online + mostrador unificado), ganancia y comisiones de hoy (solo `admin`, mismo patrón de ocultamiento por rol que Reportes/Historial), ingresos por método de pago, y gráfica de tendencia de los últimos 7 días — equivalente al Dashboard del local ("resumen diario ganancia/ingresos por método, gráfica de tendencia 7 días, vista sin costos para Vendedor").
- **"Tienda Online"** (la que ya existía): **contenido idéntico, sin ningún cambio** — ventas hoy/semana, órdenes, stock bajo, órdenes recientes, top productos, alerta de stock bajo.

**Cómo se hizo el cambio con seguridad** (esta es la página de entrada del panel, la más visitada): se creó un componente cliente nuevo `components/admin/dashboard-tabs.tsx` que recibe los datos de ambas pestañas ya resueltos por el servidor como props; el JSX de "Tienda Online" se **movió tal cual** (copiado, no reescrito) desde el `page.tsx` original al nuevo componente, y la función de datos original `getDashboardStats()` **no se tocó**. Solo se agregó una función nueva `getVentasStats()` en paralelo.

Verificado con el mismo rigor que las rutas de producción: `tsc --noEmit` (0 errores), `eslint` (0 nuevos), `vitest run` (62/62), y `npm run build` completo — `/admin` se marca `○` (estático) igual que antes del cambio, sin regresión en la estrategia de renderizado.

**Cómo probarlo**: entrar a `/admin`, confirmar que la pestaña "Tienda Online" se ve exactamente igual que antes de este cambio, y que la pestaña "Ventas" muestra los ingresos/tendencia de los últimos 7 días — con un usuario `seller`, confirmar que en "Ventas" no aparecen las tarjetas de Ganancia ni Comisiones.

## 11. Auditoría final de fidelidad — los 16 módulos del software local

Comparación final, módulo por módulo, contra la captura de pantalla real del software local que aportó el usuario:

| # | Módulo (local) | Estado en la nube |
|---|---|---|
| 1 | Registrar Venta | ✅ `/admin/ventas` |
| 2 | Calculadora | ✅ `/admin/calculadora` (admin-only) |
| 3 | Ventas del Día | ✅ `/admin/ventas-dia` |
| 4 | Mi Cuadre | ✅ `/admin/mi-cuadre` |
| 5 | Dashboard | ✅ `/admin` — pestaña "Ventas" (estilo local) + pestaña "Tienda Online" (existente, sin cambios) |
| 6 | Historial Mensual | ✅ `/admin/historial-mensual` |
| 7 | Inventario | ✅ `/admin/inventario` (con variantes por talla) |
| 8 | Préstamos | ✅ `/admin/prestamos` |
| 9 | Apartados y Abonos | ✅ `/admin/fiado` |
| 10 | Facturas | ✅ `/admin/facturas` |
| 11 | Presupuesto | ✅ `/admin/presupuesto` |
| 12 | Notas y Pendientes | ✅ `/admin/notas` |
| 13 | Exportar / Importar | ✅ `/admin/exportar-importar` |
| 14 | Configuración | ✅ `/admin/configuracion` (tienda online) + `/admin/configuracion-pos` (comisiones/gastos fijos) |
| 15 | Cuentas | ✅ `/admin/cuentas` |
| 16 | Rendimiento Vendedores | ✅ `/admin/rendimiento-vendedores` |

**16 de 16 completamente cubiertos** (Dashboard cerrado en la sub-fase 3.17, sección 10.7). Las limitaciones puntuales dentro de cada módulo (Cascos desde Factura, edición masiva, alertas push) están documentadas en la sección 9.6.

**Pasos manuales pendientes de esta ronda**: aplicar `00017_edit_pos_sale.sql` y `00018_fixed_monthly_expenses.sql` en el SQL Editor de Supabase (en ese orden), y `npm install` no es necesario (no se agregó ninguna dependencia nueva en esta ronda). Todo sigue en `main` local, sin pushear.

**✅ Confirmado por el usuario (2026-07-21): las migraciones `00017` y `00018` ya fueron aplicadas.**

## 12. Auditoría de fidelidad DETALLADA — reglas de negocio dentro de cada módulo (2026-07-21)

La auditoría de la sección 11 solo confirmó que los 16 módulos *existen* en la nube. A pedido explícito del usuario ("hay que entrar y detallar muy bien cada sección... no solo que exista, sino cada detalle") se hizo una segunda auditoría, mucho más profunda, comparando código fuente real (no solo UI) de ambos sistemas, campo por campo y regla por regla. Se usaron 5 investigaciones paralelas de solo-lectura sobre el software local. Ninguna de ellas modificó código — esto es un informe de auditoría, **todavía no se ha corregido nada de lo que sigue**.

### 12.1 Resumen ejecutivo

Se encontraron discrepancias en las 5 áreas auditadas. Las más importantes, de mayor a menor impacto en el negocio:

1. **Registrar Venta en la nube exige `product_id` de catálogo** — no se puede vender un ítem fuera de inventario como sí permite el local (venta de texto libre).
2. **Ni Registrar Venta ni Ventas del Día muestran costo/comisión/ganancia neta/utilidad a nadie en la nube, ni siquiera a `admin`** — en el local el admin sí las ve íntegras. Es la brecha más grave porque afecta el control diario del negocio.
3. **Validaciones de guardado de venta más laxas en la nube**: precio en 0 permitido, sin tope de descuento vs. total del carrito, pagos combinados solo exigen `>=` el total (no `==`, no calcula vuelto), sin aviso de "stock insuficiente, ¿continuar?".
4. **El rol `seller` tiene más permisos de los que debería en varias áreas de la nube**: puede editar inventario sin ninguna re-autenticación (el local exige una contraseña maestra de sesión), puede ver saldos y movimientos de Cuentas y hacer ajustes/transferencias (en el local Cuentas es 100% admin), y el sidebar de la nube no oculta ningún enlace por rol (el local sí oculta botones completos de navegación).
5. **`admin/auditoria/page.tsx` usa datos mock**, no está conectada a la tabla real `audit_logs` que sí existe y sí se alimenta desde otras rutas.
6. **La fórmula de "Utilidad Real" prorratea distinto**: la nube prorratea el gasto fijo mensual por los días exactos del rango de fechas elegido; el local siempre resta el mes fijo completo sin prorratear, sin importar el rango. Los números de Reportes **no van a coincidir** entre ambos sistemas salvo que el rango sea exactamente un mes calendario completo.
7. **Historial Mensual de la nube es una versión más reducida**: le faltan Utilidad Real, comparativa contra el mes anterior, rentabilidad por producto, tabla diaria con estado positivo/negativo, detalle/edición de ventas del día, y exportación a PDF real (solo hace impresión de navegador).
8. **Fiado en la nube integra los abonos con el saldo de Cuentas reales** — el software local **nunca tuvo esa integración**; es un cambio de comportamiento, no solo una discrepancia de implementación (a favor de la nube, pero hay que confirmarlo con el usuario porque cambia cómo se mueve el dinero).
9. **Sin validación de datos al importar Excel en la nube** (filas con columnas desplazadas, precios en cero, duplicados por contenido) — el local bloquea importaciones sospechosas y hace un backup de seguridad automático antes de importar; la nube no.
10. **No existe backup automático de base de datos en la nube** (Supabase) — el local respalda el `.sqlite` completo al iniciar y periódicamente, con rotación de 7 copias.
11. **Huecos funcionales completos, sin ningún equivalente en la nube**: cargue de inventario desde PDF de proveedor (cascos), tipo de movimiento "Cambio" (swap de producto), carritos "en standby" (pausar varias ventas a la vez), cambio masivo de método de pago en Ventas del Día, exportación a Excel/PDF de Ventas del Día, alerta de préstamos/facturas/fiados vencidos al iniciar sesión, "Copiar presupuesto del mes anterior", timeout de sesión por inactividad, contraseña maestra de step-up (`clave_inventario`).
12. **Comisiones NU y QR/Bancolombia no existen como tasas independientes en la nube** — quedan mezcladas en el genérico "Transferencia", perdiendo la granularidad de 4 sub-tipos que tiene el local.

El detalle completo de cada punto, con archivo y función exactos de ambos lados, está en las subsecciones 12.2 a 12.6.

### 12.2 Registrar Venta, Ventas del Día, Mi Cuadre, Calculadora

**Registrar Venta — discrepancias:**
- Nube exige `product_id` UUID válido y activo (`saleItemSchema`, `apps/web/src/lib/pos-sale.ts` `resolveSale`); local permite texto libre sin match de inventario.
- Nube no muestra costo/ganancia/comisión en ningún lado de `/admin/ventas`, ni a `admin`; local muestra un panel de preview en tiempo real (`ui/venta_form.py:_panel_preview/_actualizar_preview`).
- `price_cents` acepta 0 en la nube (`route.ts` zod `.min(0)`); local exige `precio > 0` (`controllers/venta_controller.py:_validar`).
- Sin tope de descuento vs. total del carrito en la nube; local rechaza `descuento > total_carrito`.
- Pagos combinados: nube exige `paymentsSum >= total_cents`; local exige igualdad exacta y calcula vuelto/discrepancia.
- Stock insuficiente: nube bloquea duro sin opción de continuar (excepción SQL en `00013_pos_sale_functions.sql`); local pregunta "¿continuar de todos modos?".
- Modelo de descuento: la nube solo tiene un tercer modelo simplificado (`discount_cents` por línea); no replica ni el descuento global de carrito legado ni el `precio_ofertado`/% ahorro que coexisten en el local.
- Comisión combinada: el cálculo en sí coincide, pero faltan NU y QR como sub-tipos propios de comisión de transferencia.
- Atribución de vendedor: la nube liga la venta 1:1 al usuario autenticado (`seller_id: auth.user.id`); el local permite elegir cualquier vendedor del combo (un admin puede registrar a nombre de otro).
- Sin "carritos en standby" (pausar y retener varias ventas a la vez) en la nube.
- Cédula del cliente: se guarda en `metadata`, no editable después vía `PUT /api/pos/sales/[id]` (el schema de edición no la incluye).
- Coincide con fidelidad alta: reversión/reaplicación de crédito de cuenta y restauración de stock por variante al editar/cancelar una venta.

**Ventas del Día — discrepancias:**
- Sin costo, comisión, ganancia neta, % ganancia ni "Utilidad Real" en ningún lugar de `/admin/ventas-dia`, ni para admin (local sí las muestra al admin, `_actualizar_resumen`).
- Sin cambio masivo de método de pago sobre ventas seleccionadas.
- Sin exportación a Excel.
- Sin vista combinada Ventas+Préstamos+Gastos con PDF apaisado (`VistaDiariaDialog` del local).
- Categorías de gasto libres en la nube (texto suelto) vs. lista cerrada de 7 categorías en el local (con fallback a "Otro").
- Coincide: filtro por fecha con navegación, edición/cancelación de venta individual, gastos operativos del día inline con reversión al eliminar.

**Mi Cuadre**: coincide bien (auto-refresh 60s, sin costos/márgenes para nadie). Diferencia menor: no hay botón de "Actualizar" manual en la nube, solo el timer automático.

**Calculadora — discrepancias:**
- Bloqueada por completo para `seller` en la nube (candado); el local sí deja usarla al vendedor, mostrando un costo inflado ×1.30 en vez de ocultar la herramienta entera.
- Módulo "Cascos desde Factura" (entrada manual con IVA/% descuento proveedor/tabla comparativa) no implementado — y el aviso in-page de la nube atribuye la ausencia a "requiere parseo de PDF", cuando en realidad ni la versión manual (sin PDFs) está migrada.
- Falta la tercera sub-calculadora "Costo + Precio → ganancia instantánea" como sección separada.
- Sin buscador de producto de inventario integrado en la Calculadora de la nube.
- Sin chips de descuento al cliente (5/10/15/20%) en modo "Precio de Venta".
- Coincide: fórmulas exactas de los dos modos de % (margen real / sobre costo), y el principio de que la comisión no reduce la ganancia registrada.

### 12.3 Inventario y Préstamos

**Inventario:**
- Modelo de datos: en el local cada fila de inventario tiene su propio nombre/categoría; en la nube el nombre/categoría viven en `products` (nivel padre) y `product_variants` solo aporta talla/stock/costo/barcode — mejora de normalización, pero implica que la categoría no puede variar por talla en la nube.
- Tipo de movimiento **"Cambio"** (swap de dos productos) no tiene ningún equivalente en la nube (ni UI ni tipo de movimiento).
- Movimiento **"Eliminado"** (al borrar con stock>0) no se replica: la nube hace soft-delete (`active=false`) sin insertar movimiento en `inventory_movements`.
- Alertas de stock bajo: local usa `<` estricto y `stock_minimo=0` = alerta desactivada; nube usa `<=` y el default de columna es `5` (no `0`) — productos sin umbral configurado se comportan distinto entre ambos sistemas.
- **Falta el gate de contraseña maestra de Admin** para modificar inventario: en el local, cualquier edición de inventario exige la clave de Admin una vez por sesión aunque esté logueado como vendedor; en la nube, `seller` puede llamar directo a los endpoints de ajuste/variantes sin segunda verificación.
- Cargue de inventario desde PDF de proveedor (cascos, con detección nuevo/suma) — hueco funcional completo, sin nada equivalente en la nube.
- Costo mostrado a vendedor: local infla ×1.30 (referencia); nube oculta la columna completa — mismo objetivo, mecanismo distinto.
- Coincide con fidelidad alta: los 4 tipos de movimiento principales (`Entrada/Ajuste/Venta/Reversa venta` ≡ `in/adjustment/sale/return`), agrupación de variantes por talla (mejorada en la nube con FK real en vez de texto), código de barras único.

**Préstamos:**
- El local permite editar `producto`/`almacén`/fecha de un préstamo ya creado; el endpoint `PUT /api/loans/[id]` de la nube solo acepta `status` y `observations`.
- Sin alerta de "N préstamos pendientes, M con más de 30 días" en la nube.
- Coincide exactamente: los 3 estados (`pendiente/devuelto/cobrado` ≡ `pending/returned/charged`).

### 12.4 Cuentas, Facturas, Fiado

**Cuentas:**
- **Discrepancia de seguridad importante**: en el local, "Cuentas" es 100% admin (el vendedor no ve ni el botón de navegación); en la nube, RLS permite a `seller` ver saldos/movimientos, hacer ajustes manuales y transferir entre cuentas — solo el cierre mensual queda admin-only.
- La API de movimientos sí soporta filtrar por cuenta/fecha, pero `/admin/cuentas` no expone esos controles en la UI (solo muestra los últimos 50 movimientos sin filtro).
- Las 6 cuentas semilla no tienen `color` asignado en la nube (queda NULL, la UI cae a gris); el local sí tiene color propio por cuenta.
- Coincide: transferencias entre cuentas (la nube mejora con lock `FOR UPDATE`), cierres mensuales (snapshot JSON idéntico), ajuste manual sin guardas de saldo negativo en ambos lados.

**Facturas (proveedores):**
- Validaciones cruzadas invertidas: la nube exige `supplier` no vacío pero permite `arrival_date` nulo; el local exige `fecha_llegada` siempre y no valida `proveedor` no-vacío.
- Los ítems de una factura solo se pueden **agregar** en la nube (`items/route.ts` solo tiene POST) — no hay forma de editarlos ni eliminarlos, cosa que el local sí permite.
- Alertas de vencimiento: la nube solo cuenta facturas con vencimiento ≤7 días, sin monto total en riesgo ni bucket de 30 días, y sin popup al iniciar sesión (el local sí tiene ambos).
- Coincide: lógica de abonos parciales y auto-marcado "pagada"; reversión de abonos al eliminar una factura (la nube es más precisa aquí porque cada pago, parcial o final, es una fila propia — el local tiene un caso borde con "marcar pagada directo" que no queda registrado como abono).

**Fiado:**
- **Cambio de comportamiento a confirmar con el usuario**: la nube liga los abonos de fiado al saldo real de Cuentas (`pay_customer_credit` acredita `accounts.balance_cents`); el software local **nunca integró Fiado con Cuentas** — el dinero cobrado no se acreditaba a ninguna cuenta.
- Validaciones invertidas: local exige descripción y monto>0; nube permite ambos vacíos/cero.
- No se puede editar el monto total de un fiado ya creado en la nube (`creditUpdateSchema` no incluye `total_amount_cents`); el local sí lo permite.
- Sin columna de antigüedad/días transcurridos ni alerta de fiados con más de 30 días en la nube (el local sí la tiene, incluida en el popup global de alertas al iniciar sesión).
- No existe "marcar como pagado" forzado (condonar saldo) en la nube; en el local sí es posible.

### 12.5 Presupuesto, Notas, Reportes, Historial Mensual, Rendimiento de Vendedores

- **Presupuesto**: nube usa categorías de texto libre (riesgo de "gasto huérfano" por typo) vs. lista cerrada de 7 categorías en el local; faltan "Copiar mes anterior", alerta al 80% de ejecución, y fila de diferencia/% ejecutado por categoría (la nube solo pinta la barra en rojo si se supera el 100%).
- **Notas**: coinciden en estructura (tipo tarea/resurtido, sin dueño, tabla global). Falta el gradiente de urgencia (vencida/hoy/≤3 días) y el orden combinado "vencidas primero" que sí tiene el local; la nube solo distingue vencida sí/no.
- **Reportes — hallazgo importante de cálculo**: la fórmula de "Utilidad Real" de la nube prorratea el gasto fijo mensual por los días exactos del rango elegido (`dailyFixedExpense * daysInRange`); el local **siempre resta el gasto fijo del mes completo, sin prorratear**, sin importar si se consulta un rango corto. Los resultados no van a coincidir salvo que el rango sea un mes calendario completo. Además faltan en la nube: horas pico de venta, comisión desglosada por método, ticket promedio, categoría top, día más rentable, exportación a PDF (la nube solo exporta CSV).
- **Historial Mensual**: versión reducida frente al local — faltan Utilidad Real, comparativa vs. mes anterior, rentabilidad por producto, tabla diaria con estado positivo/negativo, detalle/edición de ventas del día, y PDF real (usa impresión de navegador).
- **Rendimiento de Vendedores**: la nube no lista vendedores sin ventas en el período (el local sí, en gris); usa rango de fechas libre en vez de mes calendario. Ninguno de los dos calcula comisión ni ganancia por vendedor (en esto coinciden). La nube agrega una columna "% del total" que el local no tiene.

### 12.6 Exportar/Importar, Configuración, Permisos y Seguridad

**Exportar/Importar:**
- Las 18 hojas coinciden exactamente en nombre y contenido entre local y nube — **esto sí es una coincidencia exacta**.
- La nube deja fuera de reimportación, a propósito y documentado, 5 hojas (Ventas, Configuración, Usuarios, Cierres Cuentas, Log Auditoría) para no poder afectar catálogo/checkout/login — el local sí las reimporta todas.
- **Sin validación de datos al importar** en la nube (columnas desplazadas, precios en cero, duplicados por contenido); el local bloquea importaciones sospechosas y hace un backup Excel automático antes de importar.
- Sin backup de base de datos completo ni función de "borrar base de datos" en la nube.
- Sin "plantilla en blanco para llenar a mano" en la nube.

**Configuración:**
- Comisiones NU y QR no existen como tasas independientes en la nube (caen en el genérico "Transferencia").
- Sin contraseña maestra (`clave_inventario`), sin configuración de impresora térmica, sin timeout de inactividad, sin backup automático configurable — ninguno tiene equivalente en la nube.
- Sin validación de rango 0-100% en las tasas de comisión de la nube.

**Permisos/roles — catálogo comparado:**
- El sidebar de la nube (`admin/layout.tsx`) muestra todos los enlaces a todos los roles sin excepción; el local oculta botones de navegación completos para vendedor en 4 páginas (Config, Exportar, Cuentas, Rendimiento).
- `admin/configuracion/page.tsx`, `admin/usuarios/page.tsx` y `admin/auditoria/page.tsx` no tienen gate de rol en el cliente (el servidor sí protege usuarios/configuración vía `requireAuth`, pero la UI se ve rota o expuesta para `seller`).
- **`admin/auditoria/page.tsx` usa datos mock hardcodeados**, no está conectada a la tabla real `audit_logs`.
- `/admin/cuentas` es más permisivo que el local (ver 12.4).
- La Calculadora es más restrictiva en la nube que en el local (bloqueo total vs. costo inflado).
- Ganancia neta/comisión: coincide el gating en Reportes/Historial Mensual, pero Ventas del Día no las muestra a nadie (ver 12.2).

**Autenticación/seguridad:**
- Hash de contraseña del local es SHA-256 sin salt (legacy); Supabase Auth de la nube es más robusto.
- Ninguno de los dos sistemas implementa bloqueo por intentos fallidos de login.
- Sin timeout de sesión por inactividad ni contraseña de step-up en la nube (el local tiene ambos).
- RLS de Postgres en la nube compensa parcialmente los gates de cliente faltantes, pero varias rutas usan `getServiceSupabase()` (bypassa RLS) y confían solo en `requireAuth()` a nivel de aplicación.

### 12.7 Decisiones tomadas (2026-07-21) sobre los puntos abiertos

El usuario resolvió los 3 puntos ambiguos de la auditoría antes de arrancar la corrección:

1. **Fiado ↔ Cuentas**: se **mantiene** la integración de la nube (los abonos de fiado sí acreditan una cuenta real). Se documenta como mejora consciente sobre el software local, que nunca tuvo esa trazabilidad — no se toca código por este punto.
2. **Alcance de la corrección**: se corrige **todo** lo encontrado en la auditoría, no solo lo crítico. Se organiza en sub-fases sucesivas por prioridad (ver sección 13, Fase 4).
3. **Costo mostrado al vendedor**: se **mantiene** el ocultamiento actual de la nube (columna de costo oculta por completo para `seller`, sin markup ficticio ×1.30 como hace el local). Consecuencia directa: en la Calculadora, en vez de reproducir el bloqueo total actual, se habilita la herramienta para `seller` con entrada manual de costo (igual que el local permite), sin buscador de inventario que revele costos reales hasta que ese buscador se implemente (ver 13.4.3).

## 13. Plan de Fase 4 — Corrección de la auditoría de fidelidad

**Documentado 2026-07-21, arranca 2026-07-22.** Cubre absolutamente todo lo encontrado en la sección 12, en 4 sub-fases por prioridad. Mismo patrón de trabajo que las fases anteriores: commits locales en `main` (nunca push sin autorización explícita), verificación completa (`tsc --noEmit`, `eslint`, `vitest run`, y `npm run build` cuando se toquen rutas de producción o dinero/stock) al cierre de cada sub-fase, y actualización de esta misma sección con lo realmente hecho (no solo lo planeado) a medida que avance.

### 13.1 Fase 4.1 — Seguridad y permisos de rol (máxima prioridad)

| # | Ítem | Acción propuesta | Archivos involucrados |
|---|---|---|---|
| 4.1.1 | Vendedor puede editar Inventario sin re-autenticación | Restringir a `admin` las acciones de escritura de inventario (crear/editar/eliminar variante, ajuste de stock) — más simple y igual de seguro que replicar la "clave maestra" del local; el vendedor conserva solo lectura | `api/products/[id]/variants/route.ts`, `api/product-variants/[id]/route.ts`, `api/inventory/adjust/route.ts`, gate de UI en `admin/inventario/page.tsx` |
| 4.1.2 | Vendedor puede ver/operar Cuentas | Restringir todo el módulo Cuentas a `admin` (ver, ajustar, transferir, cerrar mes) — igual que el local, donde el vendedor no ve ni el botón | RLS en migración nueva sobre `accounts`/`account_movements`/`account_closures`, gate `isAdmin` de página completa en `admin/cuentas/page.tsx` (mismo patrón que `admin/calculadora/page.tsx` hoy) |
| 4.1.3 | Sidebar no oculta nada por rol | Ocultar del menú los enlaces que `seller` no debe ver (Cuentas, Configuración tienda, Usuarios, Auditoría, Rendimiento Vendedores ya estaba, Configuración POS ya estaba) | `admin/layout.tsx` |
| 4.1.4 | `admin/configuracion` (tienda online) y `admin/usuarios` sin gate de rol en cliente | Agregar gate `isAdmin` visual (el servidor ya protege, falta la UI) | `admin/configuracion/page.tsx`, `admin/usuarios/page.tsx` |
| 4.1.5 | `admin/auditoria` usa datos mock | Conectar a la tabla real `audit_logs` (ya existe y ya se alimenta desde algunas rutas), quitar el array `mockLogs`, agregar gate `isAdmin` | `admin/auditoria/page.tsx`, revisar qué rutas ya insertan en `audit_logs` y completar las que falten |
| 4.1.6 | Verificación | `tsc`/`eslint`/`vitest`/`build` completo de toda la ronda 4.1 | — |

### 13.2 Fase 4.2 — Cálculos financieros que no coinciden

| # | Ítem | Acción propuesta | Archivos involucrados |
|---|---|---|---|
| 4.2.1 | "Utilidad Real" prorratea distinto | Igualar al local: restar siempre el gasto fijo del **mes completo** (sin prorratear por días del rango), para que ambos sistemas den el mismo número | `admin/reportes/page.tsx`, `admin/historial-mensual/page.tsx` (al agregarle Utilidad Real, ver 4.2.5) |
| 4.2.2 | Faltan comisiones NU y QR como tasas propias | Agregar `nu` y `qr` como sub-tipos independientes de comisión (hoy solo existe `transfer` genérico) | `pos_commission_rates` (migración aditiva), `admin/configuracion-pos/page.tsx`, `lib/pos-sale.ts` (`resolveSale`) |
| 4.2.3 | Registrar Venta / Ventas del Día no muestran costo/ganancia/comisión/utilidad a nadie | Mostrarlas para `admin` (gating igual al resto: oculto a `seller`) | `admin/ventas/page.tsx`, `admin/ventas-dia/page.tsx` |
| 4.2.4 | Validaciones de venta más laxas | `price_cents` &gt; 0 obligatorio; tope de descuento vs. total del carrito; pagos combinados exactos (`==`, con cálculo de vuelto/discrepancia); aviso de "stock insuficiente, ¿continuar?" antes de bloquear | `api/pos/sales/route.ts`, `api/pos/sales/[id]/route.ts`, `lib/pos-sale.ts`, `admin/ventas/page.tsx` |
| 4.2.5 | Historial Mensual reducido | Agregar Utilidad Real, comparativa vs. mes anterior, rentabilidad por producto, tabla diaria con estado, detalle/edición de ventas del día | `admin/historial-mensual/page.tsx` |
| 4.2.6 | Verificación | `tsc`/`eslint`/`vitest`/`build` completo de toda la ronda 4.2 | — |

### 13.2.1 Fase 4.2 completada (2026-07-22)

- **4.2.1** — `admin/reportes/page.tsx`: la Utilidad Real ya no prorratea el gasto fijo por días del rango (`dailyFixedExpense * daysInRange`); ahora resta siempre el gasto fijo mensual **completo** (`arriendo+sueldo+servicios+otros`), igual que el local. Texto de la tarjeta y de `configuracion-pos/page.tsx` actualizado para reflejar que Reportes/Historial usan el gasto fijo completo, mientras que Ventas del Día (4.2.3) sí prorratea por día — porque esa vista es de un solo día.
- **4.2.2** — Nueva migración `00020_nu_qr_payment_methods.sql`: amplía el CHECK `payments_method_check` para aceptar `nu`/`qr`. `lib/pos-sale.ts` y todos los mapas de etiquetas de método (`configuracion-pos`, `dashboard-tabs`, `mi-cuadre`, `calculadora`, export Excel, recibo/invoice) ya reconocen ambos. **Hallazgo adicional durante la implementación**: el selector de método de pago de Registrar Venta y Ventas del Día ni siquiera ofrecía Nequi/Daviplata como opciones (solo `cash/card/transfer/addi/other`) — pese a que sus tasas de comisión sí existían en Configuración, eran inalcanzables en una venta real. Se corrigió reemplazando el `transfer` genérico por los 4 sub-tipos reales (Nequi/NU/QR/Daviplata), igual que el software local (que nunca ofrece "Transferencia" genérica, solo estos 4 nombres).
- **4.2.3** — `admin/ventas/page.tsx` y `admin/ventas-dia/page.tsx` ahora muestran costo/ganancia/comisión (y en Ventas del Día también Utilidad Real del día, prorrateando el gasto fijo **por día** — `calcular_utilidad_real_dia` del local) a `admin`, ocultos a `seller`. En Ventas del Día también se agregó el badge "Ganancia neta / Utilidad real" junto a los totales existentes.
- **4.2.4** — `lib/pos-sale.ts` (`resolveSale`): `discount_cents` no puede superar el subtotal del carrito; la suma de pagos debe ser **exacta** al total (antes solo exigía `>=`). Zod: `price_cents` pasa de `.min(0)` a `.positive()` en ambas rutas de venta. **Nueva migración `00021_pos_sale_force_stock.sql`**: `create_pos_sale`/`edit_pos_sale` ganan un parámetro `p_force` (default `false`, no rompe llamadas existentes) — con `p_force=true`, en vez de bloquear con "Stock insuficiente" decrementan hasta 0 (`GREATEST(0, stock - qty)`), igual que `MAX(0, cantidad - qty)` del software local. El cliente (`admin/ventas/page.tsx`, `admin/ventas-dia/page.tsx`) muestra `confirm()` con el mismo texto de advertencia del local ("¿Continuar de todas formas?") y reintenta con `force: true` si el usuario acepta. La UI también muestra en vivo "Falta $X" / "Sobra $X (vuelto por fuera)" en vez de solo bloquear al enviar.
- **4.2.5** — `admin/historial-mensual/page.tsx`: se agregó Utilidad Real del mes (misma fórmula sin prorratear que Reportes), comparativa contra el mes anterior (% ingresos y % ganancia neta, con flecha arriba/abajo), panel "Rentabilidad por producto" (top 10 por ganancia neta con margen %), y la tabla/gráfica diaria ahora incluye el badge Positivo/Negativo por día más el conteo total de días positivos/negativos. **No incluido** (documentado, no un descuido): detalle/edición de ventas de un día específico dentro de Historial Mensual — esa funcionalidad ya vive completa en Ventas del Día (que permite ir a cualquier fecha), duplicarla aquí sería redundante.
- **4.2.6** — `tsc --noEmit`: 0 errores. `eslint`: mismos 5 warnings preexistentes. `vitest run`: 10 archivos, 62 tests, todos pasando. `npm run build`: completo sin errores. `git status`: cero archivos bajo `apps/web/src/app/(shop)/` tocados.

**⚠️ Pendiente manual**: aplicar `00020_nu_qr_payment_methods.sql` y `00021_pos_sale_force_stock.sql` en el SQL Editor de Supabase (en ese orden, después de `00019`).

### 13.3 Fase 4.3 — Huecos funcionales completos

| # | Ítem | Acción propuesta | Notas |
|---|---|---|---|
| 4.3.1 | Cargue de inventario desde PDF de proveedor | Implementar parser + flujo nuevo/suma | **Necesita PDFs de muestra del usuario** para diseñar el parser — bloqueado hasta que los aporte |
| 4.3.2 | Tipo de movimiento "Cambio" (swap de producto) | Nuevo tipo `exchange` en `inventory_movements` + UI de swap en Inventario | Migración aditiva + `admin/inventario/page.tsx` |
| 4.3.3 | Movimiento "Eliminado" al hacer soft-delete con stock | Insertar movimiento al desactivar una variante con `stock_qty > 0` | `api/product-variants/[id]/route.ts` |
| 4.3.4 | Sin cambio masivo de método de pago ni exportar Excel en Ventas del Día | Selección múltiple + edición de método de pago en lote; botón exportar Excel del día | `admin/ventas-dia/page.tsx`, reutilizar `lib/excel` |
| 4.3.5 | Sin carritos "en standby" en Registrar Venta | Permitir pausar y retomar varias ventas en curso a la vez | `admin/ventas/page.tsx` (estado local, sin persistencia en BD) |
| 4.3.6 | Sin validación de datos ni backup antes de importar Excel | Detectar columnas desplazadas/precios en cero/duplicados por contenido; descargar automáticamente el Excel actual como backup antes de aplicar el import | `api/admin/excel/import/route.ts` |
| 4.3.7 | Sin alertas de vencimiento al iniciar sesión | Banner/notificación de facturas por vencer, fiados &gt;30 días, préstamos pendientes antiguos | Layout del admin o componente de notificaciones al cargar `/admin` |
| 4.3.8 | Presupuesto: falta "copiar mes anterior" y alerta al 80% | Botón de copiar + banner de alerta por franja (verde/ámbar/rojo) + fila de diferencia/% ejecutado | `admin/presupuesto/page.tsx` |
| 4.3.9 | Ítems de factura solo se pueden agregar, no editar/eliminar | Agregar `PUT`/`DELETE` a los ítems de una factura | `api/supplier-invoices/[id]/items/route.ts` |
| 4.3.10 | No se puede editar producto/almacén de un préstamo existente | Ampliar el `PUT` de préstamos a esos campos | `api/loans/[id]/route.ts` |
| 4.3.11 | No se puede editar el monto total de un fiado ya creado | Ampliar `creditUpdateSchema` para incluir `total_amount_cents` | `api/customer-credits/[id]/route.ts` |
| 4.3.12 | Verificación | `tsc`/`eslint`/`vitest`/`build` completo de toda la ronda 4.3 | — |

### 13.3.1 Ítem 4.3.1 completado (2026-07-22) — Cargue de Pedidos (Cascos)

El usuario aportó 3 PDFs reales (2 de ACCESORIOS PARA MOTOS S.A.S. — pedidos 47649 y 51363 — y 1 de DISTRIFABRICA RAMIREZ SAS — orden DF56107), que coinciden exactamente con los dos formatos que el software local ya sabía leer (`services/pdf_pedido_parser.py` y `services/pdf_distrifabrica_parser.py`). Se portó esa misma lógica a la nube, validándola contra los 3 PDFs reales antes de escribir el código de producción (28/28, 21/21 y 53/53 ítems extraídos correctamente, valores de costo/cantidad/descuento verificados contra el PDF).

- **Extracción de texto**: se agregó la dependencia `pdf-parse@1.1.1` (la v2 reescribe la API sobre `pdfjs-dist`/ESM/workers, mucho más pesada; se usó v1, simple y estable). Se importa desde `pdf-parse/lib/pdf-parse.js` (no la raíz del paquete) porque el índice de la v1 ejecuta un auto-test contra un PDF de muestra que no existe en este repo, rompiendo `next build` en "Collecting page data" — el módulo interno expone la misma función sin ese efecto secundario. Se agregó una declaración de tipos local en `types/pdf-parse-lib.d.ts` para esa ruta interna (`@types/pdf-parse` solo cubre la raíz).
- **Diferencia real frente a Python descubierta al validar**: pypdf (Python) concatena los campos de cada fila de datos en una sola línea; pdf-parse (Node) los deja en líneas separadas — así que el parseo no es un único regex por línea sino un escaneo secuencial hacia adelante (VALOR, PRECIO, DCTO%, CODIGO en 4 líneas consecutivas para XTRONG) y hacia atrás para reconstruir descripción+talla. La cantidad nunca se lee de la columna CANT./IVA combinada (queda ilegible tras la extracción, ej. "191" = IVA 19% + CANT 1) — se recalcula como VALOR ÷ costo_unitario, igual que el software local. Para DISTRIFABRICA se encontró y corrigió un caso borde real (ítem `[195856]` del PDF de muestra): cuando la descripción es corta, la talla y la cantidad quedan pegadas sin espacio en la misma línea (`"...T L1"` = talla L, cantidad 1) — el parser lo detecta explícitamente.
- **Puerto de lógica de negocio** (`lib/pdf-import/xtrong.ts`, `lib/pdf-import/distrifabrica.ts`): mismo mapeo modelo→nombre de display, misma limpieza de "ruido" en la descripción (SET/ECE-.../XTRONG/FLY/SP/RACING/VISOR), mismo cálculo `costo_sin_iva = precio_con_iva / 1.19`, mismo algoritmo de generación de código de barras XTRONG de 10 dígitos (`1106` + 3 dígitos de modelo + 2 de sub-referencia de color + 1 de talla, reutilizando números de modelo/color ya usados en el catálogo), y para DISTRIFABRICA el código de barras sugerido es el código interno del proveedor (igual que `generar_codigos_barras_distrifabrica`). **Única diferencia deliberada**: el software local embebía `-T:talla` en el nombre porque su tabla `inventario` es plana (una fila por talla); aquí la talla vive en su propia columna (`product_variants.talla`), así que el nombre sugerido no la repite.
- **Adaptación al modelo de datos normalizado (producto + variantes)**: el local es binario (NUEVO/SUMA, matcheando por nombre+talla exactos en una tabla plana). Aquí se amplió a 3 estados, más preciso dado que el catálogo separa producto de variante: **NUEVO PRODUCTO** (no existe un producto con ese nombre → se crea inactivo + su primera variante), **NUEVA TALLA** (el producto ya existe pero no esa talla → se agrega una variante al producto existente en vez de duplicar el producto), **SUMA STOCK** (producto y talla ya existen → solo se incrementa `stock_qty` de esa variante). Los 3 casos insertan su `inventory_movement` tipo `in` correspondiente.
- **Decisión de seguridad importante**: los productos nuevos se crean con `active: false` y `price_cents: 0`. A diferencia del software local (que no tiene tienda pública y por tanto ninguna consecuencia de "publicar" algo), en la nube `products`/`product_variants` son las MISMAS tablas que alimentan el catálogo público — crear un producto activo automáticamente lo expondría en `yjbmotocom.com` sin fotos, precio de venta ni descripción. El cargue solo dejar el stock/costo en el sistema; un admin debe revisar, poner precio/fotos y activar manualmente desde Productos antes de que se vea en la tienda.
- **API**: `POST /api/admin/inventory-import/parse` (multipart: PDF + proveedor, admin-only, devuelve la lista de ítems con su estado nuevo/nueva_talla/suma) y `POST /api/admin/inventory-import/confirm` (admin-only, aplica los cambios). Ambas exigen `requireAuth(['admin'])`, coherente con la restricción de escritura de inventario de la Fase 4.1.
- **UI**: página nueva `/admin/inventario/cargue-pedidos` (enlazada con un botón "Cargue de Pedidos" desde `/admin/inventario`, visible solo si `canEdit`): selector de proveedor, botón de carga de PDF, tabla de revisión editable (nombre, talla, cantidad) con badge de estado por fila y código de barras sugerido, botón de confirmar. Mismo flujo que `ui/cargue_pedidos_widget.py` del software local.
- **Verificación**: `tsc --noEmit` 0 errores, `eslint` sin warnings nuevos, `vitest run` 62/62, `npm run build` completo (incluida la corrección del problema de `pdf-parse` en "Collecting page data"), `git status` cero archivos de `(shop)/` tocados. Los 3 PDFs de muestra que aportó el usuario NO se commitearon (datos reales de facturas de proveedor).

### 13.3.2 Ítems 4.3.2 a 4.3.12 completados (2026-07-22)

- **4.3.2 (Cambio de producto)** — Nueva migración `00022_inventory_exchange_type.sql` (agrega `'exchange'` al CHECK de `inventory_movements.type`). Nueva ruta `POST /api/inventory/exchange` (admin-only): valida que sale/entra sean artículos distintos y que el que sale tenga stock, descuenta 1 del que sale y suma 1 al que entra, insertando ambos movimientos con el mismo `reference_id` — igual que `_on_confirmar_cambio` del local. Página nueva `/admin/inventario/cambios` (botón "Cambios" en Inventario) con dos columnas de búsqueda (reutiliza `/api/pos/search`) y selector de talla por lado.
- **4.3.3 (Movimiento "Eliminado")** — Nueva migración `00023_inventory_deleted_type.sql` (agrega `'deleted'` al mismo CHECK). `DELETE /api/product-variants/[id]` ahora lee el `stock_qty` antes de desactivar la variante y, si era mayor a 0, inserta un `inventory_movement` tipo `deleted` con `qty = -stock_qty` — igual que `eliminar_producto` del local, que deja rastro en vez de simplemente perder el stock.
- **4.3.4 (Cambio masivo de método + exportar Excel)** — Nueva ruta `PUT /api/pos/sales/bulk-method`: recibe una lista de órdenes, excluye automáticamente las que tienen más de un pago (pago combinado, igual que el local) y recalcula la comisión del nuevo método para las demás. Nueva ruta `GET /api/pos/sales/export` (ExcelJS, columnas de costo/comisión/ganancia solo si quien exporta es admin). En `admin/ventas-dia/page.tsx`: checkbox por venta, barra de selección con selector de método + botón "Cambiar método de pago", y botón "Exportar Excel" junto al selector de fecha.
- **4.3.5 (Carritos en standby)** — `admin/ventas/page.tsx`: botón "Pausar venta" guarda el carrito/pagos/cliente actual en una lista `standbyCarts` (solo estado de React, sin persistencia en BD, igual que el local) y limpia el formulario; una barra de pills permite retomar o descartar cada carrito en espera.
- **4.3.6 (Validación + backup al importar Excel)** — `api/admin/excel/import/route.ts` ahora hace una primera pasada de validación sobre todas las hojas antes de escribir nada: si más de la mitad de las filas de una hoja tienen un campo numérico/monetario ilegible (columna desplazada), aborta toda la importación con el detalle (se puede forzar con `?force=true` tras confirmar). Los gastos con monto negativo se excluyen fila por fila (nunca se insertan). Facturas con más del 50% de filas en $0 generan una advertencia no bloqueante. El cliente (`exportar-importar/page.tsx`) descarga automáticamente un respaldo completo de 18 hojas antes de enviar el archivo a importar, y muestra el diálogo de "¿importar de todas formas?" si la validación encuentra columnas sospechosas.
- **4.3.7 (Alertas de vencimiento al iniciar sesión)** — Nueva ruta `GET /api/admin/session-alerts` (admin+seller) que agrega facturas por vencer (≤7 días), notas con fecha límite próxima (≤3 días) y fiados con más de 30 días pendientes — mismo contenido que `_alertar_facturas_vencimiento` del local. Nuevo componente `components/admin/session-alerts.tsx`, montado en `admin/layout.tsx`: se muestra una vez por sesión de navegador (`sessionStorage`) como un modal con las 3 secciones, solo si hay algo que mostrar.
- **4.3.8 (Presupuesto: copiar mes anterior + alerta 80%)** — `admin/presupuesto/page.tsx`: botón "Copiar mes anterior" (lee el presupuesto del mes previo vía `GET /api/monthly-budgets` y hace upsert de cada categoría al mes actual, reutilizando el endpoint existente sin necesidad de una ruta nueva). Banner de alerta ámbar cuando una o más categorías llegan al 80% o más sin haberlo superado (el rojo por superado ya existía). Cada categoría ahora muestra el % ejecutado junto al monto y una línea de "Diferencia" (o "Superado por $X" en rojo).
- **4.3.9 (Editar/eliminar ítems de factura)** — `GET /api/supplier-invoices` ahora incluye `items:supplier_invoice_items(*)` en el select (antes no se traían en absoluto). Se agregó `PUT /api/supplier-invoice-items/[id]` (el `DELETE` ya existía desde antes, pero **no estaba conectado a ninguna UI** — se descubrió que el módulo de ítems de factura estaba huérfano por completo). `admin/facturas/page.tsx` ganó una sección "Ítems" completa dentro del detalle de cada factura: listar, agregar, editar inline y quitar ítems.
- **4.3.10 (Editar producto/almacén de préstamo)** — `loanUpdateSchema` en `api/loans/[id]/route.ts` ahora acepta `product_title` y `warehouse` además de `status`/`observations`. `admin/prestamos/page.tsx` ganó un botón "Editar" por préstamo que abre un formulario inline con esos 3 campos.
- **4.3.11 (Editar monto de fiado)** — `creditUpdateSchema` en `api/customer-credits/[id]/route.ts` ahora acepta `total_amount_cents`; el servidor recalcula el `status` contra lo ya abonado (rechaza bajar el monto por debajo de lo pagado, y recalcula pending/paid según corresponda). `admin/fiado/page.tsx` ganó edición inline del monto total dentro del detalle expandido.
- **4.3.12 (Verificación)** — `tsc --noEmit`: 0 errores. `eslint`: mismos 5 warnings preexistentes. `vitest run`: 10 archivos, 62 tests, todos pasando. `npm run build`: completo sin errores (incluidas todas las rutas/páginas nuevas de esta ronda). `git status`: cero archivos bajo `apps/web/src/app/(shop)/` tocados.

**⚠️ Pendiente manual**: aplicar `00022_inventory_exchange_type.sql` y `00023_inventory_deleted_type.sql` en el SQL Editor de Supabase (después de las migraciones de las fases anteriores).

**Fase 4.3 completa: los 12 ítems (4.3.1 a 4.3.12) quedaron implementados.**

### 13.4 Fase 4.4 — Calculadora y detalles menores de UX

| # | Ítem | Acción propuesta | Notas |
|---|---|---|---|
| 4.4.1 | Módulo "Cascos desde Factura" no implementado | Construir la versión manual (sin PDF): precio de factura con IVA, % descuento proveedor, tabla comparativa por % de ganancia | `admin/calculadora/page.tsx` |
| 4.4.2 | Falta 3ra sub-calculadora "ganancia instantánea" | Sección separada costo+precio→ganancia/pérdida | `admin/calculadora/page.tsx` |
| 4.4.3 | Habilitar Calculadora para `seller` | Quitar el bloqueo total actual; el vendedor puede usarla con entrada manual de costo (sin buscador de inventario que revele costos reales — ver 4.4.4) | `admin/calculadora/page.tsx` |
| 4.4.4 | Sin buscador de producto de inventario en Calculadora | Agregarlo solo para `admin` (para `seller`, sin buscador hasta decidir cómo evitar exponer costo real) | `admin/calculadora/page.tsx` |
| 4.4.5 | Sin chips de descuento al cliente en modo Precio de Venta | Agregar chips 5/10/15/20% | `admin/calculadora/page.tsx` |
| 4.4.6 | Notas sin gradiente de urgencia ni orden "vencidas primero" | Badge por franja (vencida/hoy/≤3 días) + orden combinado | `admin/notas/page.tsx`, `api/notes/route.ts` |
| 4.4.7 | Mi Cuadre sin botón de actualizar manual | Agregar botón junto al auto-refresh | `admin/mi-cuadre/page.tsx` |
| 4.4.8 | Filtros de cuenta/fecha no expuestos en `/admin/cuentas` | La API ya los soporta — solo falta el control de UI (ojo: esto se hace *después* de 4.1.2, que puede restringir el módulo a admin) | `admin/cuentas/page.tsx` |
| 4.4.9 | Cuentas semilla sin color por defecto | Asignar colores a las 6 cuentas existentes (migración de datos, no de esquema) | Migración nueva `UPDATE accounts SET color=...` |
| 4.4.10 | Verificación y cierre | `tsc`/`eslint`/`vitest`/`build` completo, actualizar tabla de sección 11/13 con el estado final, commit de cierre de Fase 4 | — |

### 13.4.1 Fase 4.4 completada (2026-07-22) — Fase 4 completa

- **4.4.1/4.4.2/4.4.5** — `admin/calculadora/page.tsx` se reescribió agregando: panel "Calculadora de Cascos (Factura proveedor)" (precio con/sin IVA, chips de % descuento proveedor 0/3/5/8/10%, costo real resultante, tabla de precio/ganancia para los 9 niveles de % del local); "Calculadora Rápida" como sección propia dentro del primer panel (costo+precio → ganancia o pérdida instantánea); chips de descuento al cliente (5/10/15/20%) en el panel de "Precio sugerido", mostrando precio/ganancia/margen resultante. Todas las fórmulas son las mismas que `calculadora_panel.py` del local (`costo_real = (precio/1.19) × (1 - dcto%)`, `_precio_desde_pct`, etc.).
- **4.4.3/4.4.4** — Se quitó el bloqueo total a `seller` (y se sacó `Calculadora` de la lista `adminOnly` del sidebar en `admin/layout.tsx`): ahora el vendedor puede usar todos los paneles con entrada manual de costo. El buscador de producto en inventario (que autocompleta el costo desde el catálogo real) quedó condicionado a `isAdmin` — el vendedor no lo ve, solo puede escribir el costo a mano, igual que el software local nunca expone el costo real al vendedor en esta pantalla.
- **4.4.6** — `admin/notas/page.tsx`: nueva función `getUrgency()` con 4 franjas (vencida hace Nd / vence hoy / vence en ≤3 días / vence en fecha futura) y su color correspondiente (rojo/rojo/ámbar/gris), y `sortedNotes` que ordena por urgencia (vencidas primero) en vez del orden de llegada de la API.
- **4.4.7** — `admin/mi-cuadre/page.tsx`: botón "Actualizar" junto al indicador de auto-refresh, con ícono girando mientras refresca.
- **4.4.8** — `admin/cuentas/page.tsx`: la pestaña "Movimientos" ganó selector de cuenta + rango de fechas (la API ya los soportaba desde antes, solo faltaba el control de UI) y un botón "Limpiar filtros".
- **4.4.9** — Nueva migración `00024_account_colors.sql`: asigna a las 6 cuentas semilla los mismos colores exactos que usa `database/schema.py` del software local (Efectivo `#22C55E`, Nequi `#8B5CF6`, QR/Bancolombia `#F59E0B`, NU `#EF4444`, Daviplata `#F97316`, Addi `#06B6D4`), solo si `color` sigue en `NULL` (no pisa un color que el usuario ya haya personalizado).
- **4.4.10** — `tsc --noEmit`: 0 errores. `eslint`: mismos 5 warnings preexistentes. `vitest run`: 10 archivos, 62 tests, todos pasando. `npm run build`: completo sin errores. `git status`: cero archivos bajo `apps/web/src/app/(shop)/` tocados en ninguna sub-fase de la Fase 4.

**⚠️ Pendiente manual**: aplicar `00024_account_colors.sql` en el SQL Editor de Supabase (después de `00019`-`00023`).

**🎉 Fase 4 completa: las 4 sub-fases (4.1 Seguridad, 4.2 Cálculos financieros, 4.3 Huecos funcionales, 4.4 Calculadora y UX) quedaron implementadas — los ~35 hallazgos de la auditoría de fidelidad de la sección 12 fueron corregidos o documentados como mejora consciente (Fiado↔Cuentas, sección 12.7).** Todo el trabajo vive en commits locales en `main`, ninguno pusheado — falta que el usuario autorice el `git push` y aplique las migraciones `00019` a `00024` en Supabase.

### 13.1.1 Fase 4.1 completada (2026-07-22)

Los 6 ítems de 13.1 quedaron implementados y verificados:

- **4.1.1** — `PUT/DELETE /api/product-variants/[id]`, `POST /api/products/[id]/variants` y `POST /api/inventory/adjust` ahora exigen `requireAuth(request, ['admin'])` (antes admitían `seller`). Los `GET` de lectura se mantuvieron para ambos roles. En `admin/inventario/page.tsx` se agregó `canEdit = isAdmin`: para `seller` la columna de acciones de stock general muestra "Solo lectura", y la tabla de variantes/formulario de "Agregar talla" no renderiza ningún control de escritura.
- **4.1.2** — Nueva migración `00019_cuentas_admin_only.sql`: las políticas RLS de `account_movements` (SELECT e INSERT) pasan de `admin+seller` a `admin`-only. `GET/POST /api/account-movements` y `POST /api/account-movements/transfer` ahora exigen `['admin']`. **Importante matiz descubierto durante la implementación**: `GET /api/accounts` se dejó disponible para `seller` (no se restringió, ni en RLS ni en `requireAuth`) porque Registrar Venta, Ventas del Día, Presupuesto, Fiado y Facturas dependen de esa lista para poblar el combo "¿a qué cuenta se acredita/debita este pago?" — restringirla habría roto esos flujos de venta diarios que sí le corresponden al vendedor. En su lugar, el propio handler de `GET /api/accounts` quita el campo `balance_cents` de la respuesta cuando quien pregunta no es admin, replicando el mismo patrón de "ocultar el dato sensible, no la lista completa" que ya se usa para el costo en Inventario. La página `/admin/cuentas` (saldos, movimientos, ajustes, transferencias, cierres) quedó bloqueada por completo a `seller` con el mismo patrón de candado que Calculadora.
- **4.1.3** — `admin/layout.tsx`: se agregó `adminOnly?: boolean` a la lista de navegación y un `.filter()` antes de renderizarla. Se marcaron `adminOnly` los enlaces a Calculadora, Cuentas, Rendimiento Vendedores, Usuarios, Auditoría, Exportar/Importar, Comisiones y Gastos Fijos, y Configuración — todas páginas que ya eran (o quedaron, en esta misma ronda) bloqueadas a `seller` a nivel de página.
- **4.1.4** — Se agregó el mismo candado (`isAdmin` + pantalla de bloqueo) a `admin/usuarios/page.tsx` y `admin/configuracion/page.tsx` (tienda online), que ya estaban protegidas en el servidor pero no en el cliente — un `seller` ya no ve la tabla de usuarios ni el formulario de configuración de la tienda, solo el aviso de acceso restringido.
- **4.1.5** — `admin/auditoria/page.tsx` se reconectó a `GET /api/admin/audit-logs` (ya existía, ya era admin-only, nunca se había usado desde el cliente). Se eliminó el array `mockLogs` y se agregó el mismo candado `isAdmin` de las demás páginas admin-only, más un estado de carga.
- **4.1.6** — `tsc --noEmit`: 0 errores. `eslint`: mismos 5 warnings preexistentes (ninguno nuevo). `vitest run`: 10 archivos, 62 tests, todos pasando. `npm run build`: completo sin errores, todas las rutas nuevas/tocadas compilan. `git status`: cero archivos bajo `apps/web/src/app/(shop)/` tocados.

**⚠️ Pendiente manual**: aplicar `00019_cuentas_admin_only.sql` en el SQL Editor de Supabase.

### 13.5 Cómo retomar

**Fase 4 completa (4.1, 4.2, 4.3 y 4.4) — ver 13.1.1, 13.2.1, 13.3.1/13.3.2, 13.4.1.** No queda ningún ítem pendiente de la auditoría de fidelidad (sección 12). Si el usuario retoma este proyecto, las opciones son: (a) autorizar el `git push` para desplegar todo lo de la Fase 4, (b) pedir el módulo "Cascos desde Factura" **automático por PDF** dentro de Cargue de Pedidos si aparecen más proveedores no soportados, o (c) abrir una fase nueva para peticiones futuras — no hay trabajo abierto de esta ronda.

**Pendientes manuales acumulados de la Fase 4**: aplicar, en este orden, `00019_cuentas_admin_only.sql`, `00020_nu_qr_payment_methods.sql`, `00021_pos_sale_force_stock.sql`, `00022_inventory_exchange_type.sql`, `00023_inventory_deleted_type.sql` y `00024_account_colors.sql` en el SQL Editor de Supabase.

## 14. Consolidación del login del sitio (2026-07-22)

El usuario notó en producción que existían **dos rutas de login distintas**:

- **`/iniciar-sesion`** (dentro de `(shop)/`, con header/footer/nav de la tienda): a donde apuntaba el ícono de cuenta del header (`components/layout/header.tsx`) y las páginas de Registro/Recuperar contraseña. Ya tenía lógica de redirección inteligente post-login (admin/seller → `/admin`, cliente → `/mi-cuenta`).
- **`/login`** (standalone, fuera de `(shop)/`, tema oscuro tipo panel): **no estaba enlazada desde ningún lugar de la tienda** — solo existía como destino de redirección cuando `middleware.ts`/`admin/layout.tsx`/`auth-context.tsx` detectaban una sesión de administrador expirada o ausente al visitar `/admin/*`. Por eso el usuario la veía "vacía"/sin mucho por hacer: es una pantalla de re-login dedicada al panel, nunca pensada para que un visitante llegara ahí por su cuenta.

No era un bug (ambas páginas funcionaban), pero sí era una duplicación innecesaria. El usuario eligió consolidar todo en `/iniciar-sesion`.

**Cambios**:
- `middleware.ts`: el guard de `/admin/*` ahora redirige a `/iniciar-sesion?redirect=<ruta>` en vez de `/login?redirect=<ruta>` — y de paso corrige que antes el redirect de admin perdía la ruta original (`admin/layout.tsx` no pasaba `?redirect=`), ahora la preserva porque `/iniciar-sesion` ya sabía leer ese parámetro.
- `admin/layout.tsx`: el redirect por falta de sesión (chequeo del lado cliente) pasa de `/login` a `/iniciar-sesion`.
- `lib/auth-context.tsx`: `signOut()` (usado por el botón "Cerrar sesión" del panel admin) redirige a `/iniciar-sesion` en vez de `/login`.
- Se eliminó `apps/web/src/app/login/page.tsx` (quedaba sin ningún enlace apuntándole).

**Verificado**: `tsc --noEmit` 0 errores (se limpió el caché `.next/types` que aún referenciaba la página borrada), `eslint` sin warnings nuevos, `vitest run` 62/62, `npm run build` completo (`/login` ya no aparece en la lista de rutas), y prueba manual con `npm run dev` + `curl`: `/login` → 404, `/iniciar-sesion` → 200, `/admin` sin sesión → redirige 307 a `/iniciar-sesion?redirect=%2Fadmin` correctamente.

## 15. Auditoría exhaustiva sección-por-sección (2026-07-22, en curso)

El usuario pidió una segunda vuelta de auditoría, más minuciosa que la de la sección 12: comparar **cada módulo del software local** (`C:\Users\JJBarajas\Pictures\VENTAS_YJBMOTOCOM`) contra su equivalente en la nube, sección por sección (no por fases), verificando fidelidad de **lógica/funcionalidad** (el estilo visual no importa — se prefiere el de la nube). Modo de trabajo elegido explícitamente por el usuario: **auditar y corregir sobre la marcha** (igual que la Fase 4) — si una sección tiene algo faltante o mal, se corrige ahí mismo con su verificación completa (tsc/eslint/vitest, y build si toca `(shop)/`) antes de pasar a la siguiente.

Orden de secciones (sigue el menú de `admin/layout.tsx`, empezando por donde el usuario pidió):

| # | Sección | Estado | Hallazgos |
|---|---------|--------|-----------|
| 1 | Registrar Venta | ✅ Auditada y corregida | Ver 15.1 |
| 2 | Calculadora | ✅ Auditada, sin hallazgos | Ver 15.2 |
| 3 | Mi Cuadre | ✅ Auditada, sin hallazgos | Ver 15.3 |
| 4 | Ventas del Día | ✅ Auditada y corregida | Ver 15.4 |
| 5 | Historial Mensual | ✅ Auditada y corregida | Ver 15.5 |
| 6 | Inventario | ✅ Auditada y corregida | Ver 15.8 |
| 7 | Cuentas | ✅ Auditada, sin hallazgos | Ver 15.6 |
| 8 | Facturas | ✅ Auditada y corregida | Ver 15.7 |
| 9 | Fiado | ✅ Auditada y corregida | Ver 15.9 |
| 10 | Préstamos | ✅ Auditada y corregida | Ver 15.10 |
| 11 | Notas | ✅ Auditada y corregida | Ver 15.11 |
| 12 | Presupuesto | ✅ Auditada y corregida | Ver 15.12 |
| 13 | Cierres | ✅ Auditada, sin cambios (ver nota) | Ver 15.13 |
| 14 | Reportes | ✅ Auditada y corregida | Ver 15.14 |
| 15 | Rendimiento Vendedores | ✅ Auditada y corregida | Ver 15.15 |
| 16 | Usuarios | ✅ Auditada y corregida | Ver 15.16 |
| 17 | Auditoría | ✅ Auditada, hallazgo grande documentado | Ver 15.17 |
| 18 | Exportar/Importar | ✅ Auditada y corregida | Ver 15.18 |
| 19 | Configuración (comisiones/gastos fijos + tienda) | ✅ Auditada y corregida | Ver 15.19 |

### 15.1 Registrar Venta (2026-07-22)

Comparado `ui/venta_form.py` + `controllers/venta_controller.py` + `models/venta.py` (local) contra `admin/ventas/page.tsx` + `api/pos/sales/*` + `lib/pos-sale.ts` (nube).

**Confirmado que ya coincide** (de la Fase 4.2): pagos combinados deben sumar exacto al total, descuento no puede superar el subtotal, aviso de "stock insuficiente, ¿continuar?" con `force` (el stock nunca queda negativo), costo/ganancia/comisión visibles solo a admin, comisión trasladada al cliente sin afectar la ganancia registrada, carritos en standby (solo estado de navegador, sin persistencia — igual que el local), escaneo de código de barras, recibo vía PDF/navegador (decisión ya tomada, no ESC/POS).

**Hallazgo crítico corregido** (venía de la sección 12, nunca se cerró en la Fase 4): Registrar Venta exigía `product_id` (UUID) siempre — no había forma de vender un producto fuera de catálogo. El local sí lo permite (`_LineaProducto._cargar_variantes`, rama "No está en inventario": deja nombre/costo/precio libres). La columna `order_items.product_id` ya era `NULLABLE` en el esquema desde el inicio — el bloqueo estaba solo en la capa de aplicación (zod + `resolveSale()` + las 3 funciones RPC `create_pos_sale`/`edit_pos_sale`/`cancel_pos_sale`, que asumían producto siempre presente). Se corrigió con:
- Nueva migración `00025_manual_pos_sale_items.sql`: las 3 funciones ahora saltan el chequeo/descuento de stock y el insert en `inventory_movements` (que tiene `product_id NOT NULL`) cuando el ítem no trae `product_id` ni `variant_id`.
- `lib/pos-sale.ts` (`resolveSale`): acepta `manual_title`/`manual_cost_cents` como alternativa a `product_id`.
- `api/pos/sales/route.ts` y `api/pos/sales/[id]/route.ts`: zod permite `product_id` ausente si viene `manual_title`.
- `admin/ventas/page.tsx`: botón "Producto fuera de catálogo" con nombre + precio (+ costo solo si `canViewProfit`), badge "Fuera de catálogo" en la fila del carrito.

Commit `21c9651`. Migración `00025` **pendiente de aplicar por el usuario** (se suma a las anteriores sin aplicar, si las hubiera).

**Punto abierto — resuelto sin cambio de código (2026-07-22)**: se le preguntó al usuario cómo se usa en la práctica el combo "Vendedor" del local (atribuye la venta a cualquier usuario registrado, sin importar quién tenga la sesión abierta) frente a la nube (siempre atribuye a `auth.user.id`, el logueado). El usuario confirmó que **cada vendedor tiene su propia cuenta** — no se comparte login en el mostrador. Por lo tanto `seller_id = auth.user.id` ya es equivalente (y más seguro) que el combo manual del local; no hace falta ningún selector adicional.

### 15.2 Calculadora (2026-07-22)

Comparado `ui/calculadora_panel.py` (local) contra `admin/calculadora/page.tsx` (nube). **Sin hallazgos** — coincide en las 3 fórmulas (precio desde % margen real / % sobre costo, con las mismas fórmulas matemáticas exactas), la Calculadora de Cascos (precio de factura → quitar IVA 19% → aplicar descuento de proveedor → costo real, con la misma tabla de precios sugeridos por % de ganancia) y la Calculadora Rápida (costo+precio → ganancia/margen). El buscador de inventario que revela costos reales sigue gateado solo a admin (`isAdmin`), igual que la decisión de la Fase 4.4. La nube incluso añade una mejora que el local no tiene: cálculo de comisión por método de pago sobre el precio calculado. No se tocó código.

### 15.3 Mi Cuadre (2026-07-22)

Comparado `ui/mi_cuadre_panel.py` (local) contra `admin/mi-cuadre/page.tsx` (nube). **Sin hallazgos** — mismas tarjetas (unidades vendidas, total recaudado), mismo desglose por método de pago, mismo auto-refresh cada 60s + botón manual (Fase 4.4), sin costos ni márgenes visibles (ambos). Se detectó una diferencia positiva: el local agrupa toda venta con pago combinado bajo un solo bucket "Combinado" (no la desglosa por sub-método real), mientras la nube sí separa cada venta combinada en sus métodos reales (itera `payments` reales de cada orden) — es una mejora de precisión sobre el local, no una regresión, así que se dejó como está. No se tocó código.

### 15.4 Ventas del Día (2026-07-22)

Comparado `ui/ventas_dia_panel.py` + `controllers/ventas_dia_controller.py` (local) contra `admin/ventas-dia/page.tsx` + `api/pos/sales/bulk-method` + `api/operating-expenses` (nube).

**Confirmado que ya coincide** (de la Fase 4.2/4.3): edición y eliminación de ventas (revierte stock/cuenta), cambio masivo de método de pago excluyendo automáticamente ventas con pago combinado (mismo criterio, misma recalculación de comisión — `api/pos/sales/bulk-method/route.ts` replica `_on_editar_metodo_masivo` casi línea por línea), exportar a Excel, "Utilidad Real" del día prorrateando el gasto fijo mensual por día (`dailyFixedExpense = fixed/dias_mes`, comentario explícito citando `calcular_utilidad_real_dia` del local) a diferencia de Reportes/Historial Mensual que no prorratean.

**Hallazgo nuevo, no cubierto por la auditoría original (sección 12)**: el local tiene un panel inline "Gastos Operativos del Día" **dentro de Ventas del Día** (no solo en Presupuesto) con categoría de una lista **cerrada** de 7 valores (`CATEGORIAS_GASTO`: Montado, Relleno Cascos, Devueltas de dinero, Sueldo, Arriendo, Luz, Otro). La nube ya tenía el panel inline equivalente (Fase 4.3), pero el campo de categoría era **texto libre** tanto ahí como en la pestaña "Gastos" de Presupuesto y en el formulario de "Agregar/actualizar categoría" de Presupuesto — esto era justamente el riesgo de "gasto huérfano" por typo que la sección 12 ya había señalado para Presupuesto, pero que nunca se cerró en la Fase 4. Se corrigió:
- Nuevo `lib/expense-categories.ts` con las 7 categorías exactas del local.
- Los 3 selectores de categoría de gasto/presupuesto (`admin/ventas-dia`, `admin/presupuesto` × 2) pasan de `<Input>` de texto libre a `<select>` con esa lista fija.
- No se tocó el esquema de base de datos (la columna sigue siendo `TEXT` libre — filas viejas con categorías arbitrarias, si las hay, no se ven afectadas) ni las validaciones de servidor (zod ya exige no-vacío, ahora el cliente solo puede elegir de la lista cerrada).

No se creó migración nueva (solo cambio de UI/cliente). Verificado tsc/eslint/vitest.

### 15.5 Historial Mensual (2026-07-22)

Comparado `ui/historial_panel.py` + `controllers/historial_controller.py` (local) contra `admin/historial-mensual/page.tsx` (nube).

**Confirmado que ya coincide** (de la Fase 4.2): Utilidad Real del mes (sin prorratear, igual que Reportes), comparativa vs. mes anterior con % de delta, rentabilidad por producto (top 10 por ganancia neta), tabla diaria con estado Positivo/Negativo, Top 10 productos, gating de costo/ganancia solo a admin, exportar/imprimir con totales.

**Hallazgo corregido**: el local desglosa la comisión por método de pago en un panel de chips (`_panel_comisiones`); la nube solo mostraba el total acumulado sin desglose. Se agregó el desglose por método debajo de la tarjeta "Comisiones acumuladas" (se amplió el `select` de Supabase para traer `payments(method, commission_cents)` en vez de solo `commission_cents`).

**Diferencias que se dejaron como están, por tener equivalente funcional en otra parte de la app (no son huecos reales)**:
- Drill-down para editar/eliminar ventas de un día específico desde este panel: no está aquí, pero `/admin/ventas-dia` ya cubre exactamente eso (elegir cualquier fecha y editar/eliminar).
- Modo "rango de fechas libre" (alternativo al mes calendario): no está aquí, pero `/admin/reportes` ya lo tiene.
- Exportar a Excel con hoja de préstamos incluida (el local lo hace desde Historial): la nube exporta/imprime HTML simple desde aquí, pero el Excel completo de 18 hojas (incluida Préstamos) ya existe en `/admin/exportar-importar`.

Commit pendiente (se incluye junto con el resto de esta sesión). Verificado tsc/eslint/vitest.

### 15.10 Préstamos (2026-07-22)

Comparado `ui/prestamos_panel.py` + `controllers/prestamos_controller.py` + `models/prestamo.py` (local) contra `admin/prestamos/page.tsx` + `api/loans/**` (nube). Es el módulo más simple del sistema: solo registra qué producto se prestó a qué almacén externo, sin ningún valor monetario ni integración con Cuentas/Inventario (3 estados: pendiente/devuelto/cobrado).

**Confirmado que ya coincide**: los 3 estados, edición de producto/almacén/observaciones, eliminación — todo con CRUD completo (`api/loans/[id]/route.ts` con PUT/DELETE).

**Hallazgo corregido**: el backend (`POST /api/loans`) ya aceptaba `product_id` opcional/nulo (`models/prestamo.py` del local nunca exige que el producto exista en inventario, es un campo de texto libre), pero la UI obligaba a elegir un producto de la búsqueda del catálogo antes de poder registrar el préstamo — no había forma de prestar algo que no fuera un producto real (ej. una exhibición, una herramienta). Se agregó un enlace "¿No está en el catálogo? Escribe el nombre a mano" que cambia a un campo de texto libre, enviando `product_id: null`.

Verificado tsc/eslint/vitest.

### 15.11 Notas (2026-07-22)

Comparado `ui/notas_panel.py` (local) contra `admin/notas/page.tsx` (nube).

**Confirmado que ya coincide** (de la Fase 4.4): gradiente de urgencia por colores (vencida/hoy/≤3 días/futura) y orden combinado vencidas-primero — ambos ya implementados, coinciden con `_badge_dias`/`obtener_notas()` del local.

**Hallazgos corregidos** (ambos menores, señalados en la sección 12, nunca cerrados):
1. **Sin contador de resumen**: el local muestra "N pendientes • N en total • ⚠ N vencidas" (`_lbl_count`); la nube no mostraba ningún conteo. Se agregó el mismo contador — esto requirió cambiar `fetchNotes` para traer todas las notas de una sola vez (antes pedía al servidor solo las del filtro activo vía `?completed=`) y filtrar el toggle Pendientes/Completadas en el cliente, para que el conteo sea sobre el total real y no solo lo visible.
2. **Sin edición de texto/fecha**: la nube solo tenía checkbox de completado y eliminar, no un botón para editar el texto o la fecha límite de una nota ya creada (el local sí, vía `_on_edit`/`actualizar_nota`, y la API `PUT /api/notes/[id]` ya soportaba `text`/`due_date` — solo faltaba el botón). Se agregó edición inline (lápiz → campos de texto/fecha → guardar/cancelar).

Verificado tsc/eslint/vitest.

### 15.12 Presupuesto (2026-07-22)

Comparado `ui/presupuesto_panel.py` (local) contra `admin/presupuesto/page.tsx` (nube).

**Confirmado que ya coincide** (de la Fase 4.3/4.4, más la categoría cerrada corregida en 15.4): "Copiar mes anterior", alerta al 80% de ejecución, fila de "Diferencia"/"Superado por" y % ejecutado por categoría, categorías cerradas (7 valores, ya corregido en esta misma auditoría).

**Hallazgo corregido**: faltaba el panel de contexto de gastos fijos mensuales (Arriendo/Sueldo/Servicios/Otros de Comisiones y Gastos Fijos) que el local muestra junto al presupuesto variable (`_panel_gastos_fijos`) — sirve para que el admin vea de un vistazo cuánto es el "piso" fijo del mes además de lo presupuestado por categoría. Se agregó una tarjeta con los 4 montos + el total fijo, reutilizando `store_settings.fixed_monthly_expenses` (la misma fuente que ya usan Reportes/Historial Mensual/Ventas del Día para la Utilidad Real).

Verificado tsc/eslint/vitest.

### 15.13 Cierres (2026-07-22)

El local **no tiene ningún módulo llamado "Cierres"** por separado — su único concepto de cierre es el cierre mensual de cuentas (`hacer_cierre_mes`), que vive dentro de `ui/cuentas_panel.py` (pestaña "Cierres") y que ya se auditó y confirmó fiel en la sección 15.6 (`/admin/cuentas` → pestaña Cierres, tabla `account_closures`).

`/admin/cierres` en la nube (`DailyClosuresPage`, tabla `daily_closures`) es una funcionalidad **preexistente de la tienda, anterior a este proyecto de unificación** — una declaración manual diaria de cuánto se recibió en efectivo/tarjeta/transferencia/billetera/otro, independiente de las ventas reales del sistema. No corresponde a nada del software local, así que no hay nada que "corregir" por fidelidad.

**Observación para decidir con el usuario (no se tocó código)**: `/admin/cierres` (declaración manual) y `/admin/mi-cuadre` (cálculo automático real a partir de las ventas de mostrador, sección 15.3) cubren un terreno similar — reconciliar el efectivo/medios de pago del día — pero una es manual/declarativa y la otra es automática/real. Vale la pena que el usuario confirme si `/admin/cierres` todavía se usa (p. ej. para comparar lo declarado contra lo real y detectar faltantes de caja) o si quedó como remanente de antes de tener ventas de mostrador reales, en cuyo caso podría consolidarse o retirarse. No se modificó ni eliminó nada sin esa confirmación.

### 15.6 Cuentas (2026-07-22)

Comparado `ui/cuentas_panel.py` (local, "visible solo para Admin") contra `admin/cuentas/page.tsx` + rutas API relacionadas. **Sin hallazgos** — confirmado 100% fiel y en algunos puntos más seguro que el local:
- La página completa está gateada a admin (`if (!isAdmin) return <Lock/>...`), igual que el local.
- `GET /api/accounts` sigue disponible para `seller` (porque Registrar Venta/Ventas del Día/Presupuesto/Fiado/Facturas necesitan el combo de cuenta), pero el servidor **elimina `balance_cents` de la respuesta si el rol no es admin** — comentario explícito en el código citando esta misma regla. El vendedor nunca ve saldos, ni siquiera inspeccionando la respuesta de red.
- Ajustes, transferencias, cierres y `DELETE/PUT` de cuentas: los 4 endpoints exigen `requireAuth(request, ['admin'])` server-side, no solo gate de cliente.
- Filtros de Movimientos (cuenta + rango de fechas) de la Fase 4.4 siguen presentes.

No se tocó código.

### 15.7 Facturas (2026-07-22)

Comparado `ui/facturas_panel.py` + `controllers/facturas_controller.py` (local) contra `admin/facturas/page.tsx` + `api/supplier-invoices/**` (nube).

**Confirmado que ya coincide** (de la Fase 4.3): ítems de factura con CRUD completo (`api/supplier-invoice-items/[id]/route.ts` ya tiene PUT y DELETE, no solo POST — el módulo "huérfano" que describía la sección 12 ya está conectado), botón "Usar saldo restante" que precarga el monto pendiente en el formulario de abono (compensa la falta de un "marcar pagada" directo sin crear una fila de abono — mismo efecto neto, modelo de datos más trazable), recordatorio de facturas por vencer al iniciar sesión (`session-alerts.tsx`).

**Revisado y mantenido deliberadamente (no es un bug)**: la "inversión" de validaciones que señalaba la sección 12 (local exige `fecha_llegada` siempre y no valida `proveedor`; la nube exige `proveedor` no vacío y permite `arrival_date` nulo) se mantiene tal cual está en la nube — exigir el proveedor y no la fecha de llegada es la regla más sensata de las dos (se puede registrar una factura antes de que llegue la mercancía, pero no tiene sentido una factura sin proveedor). No se replica la regla del local aquí.

**Hallazgo corregido**: la barra resumen de vencimientos solo mostraba un conteo (`dueSoonCount`, sin $) de facturas que vencen en ≤7 días — el local muestra 3 franjas en **valor de dinero** (Vencidas / ≤7 días / ≤30 días). Se agregaron las 3 franjas en pesos (saldo pendiente ya descontados los abonos, no el monto bruto de la factura), ampliando el grid de 2 a 4 tarjetas.

Verificado tsc/eslint/vitest.

### 15.8 Inventario (2026-07-22)

Comparado `ui/inventario_panel.py` (local, 1796 líneas) contra `admin/inventario/page.tsx` (nube).

**Confirmado que ya coincide/fue decisión deliberada** (no son hallazgos):
- La edición de inventario (ajustar stock, crear/desactivar variantes) es 100% admin-only en la nube (`canEdit = isAdmin`), sin ningún mecanismo de step-up. Esto **no replica** la "clave maestra" (`clave_inventario`) del local (que permite a un vendedor editar tras ingresarla) — es una decisión ya documentada explícitamente en la sección 13 (ítem 4.1.1): "más simple y igual de seguro que replicar la clave maestra del local; el vendedor conserva solo lectura". No se cambia.
- Costo oculto por completo al vendedor (sin el markup ficticio ×1.30 del local) — decisión ya tomada en la sección 12.7.
- Tipos de movimiento "Cambio" (`exchange`) y "Eliminado" (`deleted`) ya existen en el CHECK de `inventory_movements` desde las migraciones 00022/00023 (Fase 4.3).

**Hallazgos corregidos**:
1. **Valor total de inventario** (`_lbl_valor_inventario` del local: `Σ costo_unitario × cantidad`, oculto a vendedor) no tenía ningún equivalente en la nube — el ítem había quedado como "a verificar" en la sección 12, nunca confirmado ni cerrado. Se agregó una 5ª tarjeta "Valor de inventario" (solo si `canViewCost`), calculada aparte de la lista paginada de productos (que no trae costo de variante) con dos consultas directas a `products` y `product_variants` vía `supabaseBrowser`, sumando el costo del nivel correcto según si el producto tiene variantes o no (para no contar el stock dos veces). Se refresca tras cualquier ajuste de stock o cambio de variante.
2. Los tipos de movimiento `exchange`/`deleted` (ya soportados en la base de datos desde Fase 4.3) no tenían etiqueta en español en la lista de "Movimientos recientes" de esta página (`typeLabels` solo tenía los 5 tipos originales) — se agregaron "Cambio" y "Eliminado".

Verificado tsc/eslint/vitest.

### 15.9 Fiado (2026-07-22)

Comparado `ui/fiado_panel.py` + `controllers/fiado_controller.py` (local) contra `admin/fiado/page.tsx` + `api/customer-credits/**` (nube).

**Confirmado que ya coincide** (de la Fase 4.3): edición del monto total de un fiado ya creado (`creditUpdateSchema` sí incluye `total_amount_cents`, contra lo que decía la sección 12 — ya se había cerrado), botón "Usar saldo restante". La integración Fiado↔Cuentas sigue siendo una mejora consciente sobre el local (decisión de la sección 12.7, no se toca).

**Hallazgos corregidos** (ambos señalados en la sección 12, ninguno cerrado hasta ahora):
1. **Validaciones más laxas que el local**: la nube permitía crear un fiado sin descripción y con monto $0; el local exige ambos (`models/fiado.py`). Se corrigió el zod de `POST /api/customer-credits` (`description` ahora obligatoria, `total_amount_cents` debe ser `> 0`, antes `>= 0`) y la validación de cliente en el formulario.
2. **Sin antigüedad ni alertas de fiados vencidos**: el local colorea la fila con los días transcurridos (verde ≤7, naranja ≤30, rojo >30); la nube no tenía ninguna columna de antigüedad (el recordatorio al iniciar sesión de la Fase 4.3 solo cubre el popup, no la vista de la lista). Se agregó un badge de días con los mismos 3 umbrales de color en cada fiado pendiente.
3. **Sin forma de "marcar como pagado" condonando saldo**: el local permite cerrar un fiado como pagado aunque quede saldo sin cubrir (`_on_marcar_pagado`); la nube solo llegaba a `paid` automáticamente cuando la suma de abonos cubría el 100%. Se agregó `force_paid` al endpoint `PUT /api/customer-credits/[id]` (fija `status='paid'` sin validar cobertura) — **restringido a admin únicamente** server-side (a diferencia del resto de acciones de Fiado, que son admin+seller), porque condonar una deuda es una decisión de negocio más sensible que registrar un abono normal. Botón visible solo para admin, con confirmación explícita.

Verificado tsc/eslint/vitest.

### 15.14 Reportes (2026-07-22)

Comparado `services/reportes.py`/`generar_reporte_mensual_pdf` (local) contra `admin/reportes/page.tsx` (nube). Esta era la sección con más huecos pendientes de la auditoría original (sección 12): de la larga lista de "falta completamente en la nube", solo la fórmula de Utilidad Real sin prorratear se había cerrado (Fase 4.2) — el resto seguía exactamente igual que en la auditoría original, nunca tocado.

**Hallazgos corregidos** (todos "ausentes por completo" según la sección 12):
1. **Comisiones detalladas por método de pago** — antes solo el total acumulado; se agregó el desglose (mismo patrón ya usado en Historial Mensual/Mi Cuadre).
2. **Método de pago más usado** — nueva tarjeta, cuenta pagos por método sobre el rango.
3. **Horas pico de venta** (franjas de 2h) — nueva sección con barras, contando órdenes por franja horaria de `created_at`.
4. **Día más rentable** — nueva tarjeta (requirió trackear costo por día, no solo ingreso, en el acumulado diario).
5. **Resumen por día en tabla con "Estado Positivo/Negativo"** — antes solo había gráfica de barras de ingresos; se agregó una tabla con fecha/ventas/ganancia/estado por día (solo admin, ya que necesita costo).

**Revisado y dejado sin cambio, por criterio o por ya estar cubierto en otra parte**:
- **Categoría top**: no se implementó — requeriría un join adicional producto→categoría no trivial dado el modelo de datos actual de la orden; se deja como posible mejora futura, no crítica.
- **Sección de inventario general**: no se duplicó aquí — ya existe una tarjeta "Valor de inventario" dedicada en `/admin/inventario` (sección 15.8), agregar un resumen redundante en Reportes no aporta.
- **Exportación a PDF real** (reportlab del local): se mantiene solo CSV — coherente con la decisión ya tomada para recibos/Historial Mensual (impresión vía navegador en vez de generación de PDF real); no se agregó una versión imprimible aquí para no dispersar el alcance de esta ronda, pero es una mejora candidata a futuro si el usuario la pide explícitamente.
- **Filtro por mes calendario** (alternativa al rango libre): ya existe en Historial Mensual; no se duplicó aquí.

Verificado tsc/eslint/vitest.

### 15.15 Rendimiento Vendedores (2026-07-22)

Comparado `ui/rendimiento_vendedores_panel.py` (local) contra `admin/rendimiento-vendedores/page.tsx` + `api/reports/seller-performance/route.ts` (nube).

**Confirmado que ya coincide**: gating 100% admin, orden por ingreso descendente, columna "% del total" (mejora sobre el local, que no la tiene), filtro por canal `pos` (coherente, el local es 100% mostrador). Ninguno de los dos calcula comisión/ticket promedio/ganancia por vendedor — coincide (ambos se quedan en ventas/unidades/ingresos), como ya señalaba la sección 12.

**Hallazgo corregido**: la nube solo listaba vendedores con al menos una orden en el rango — un vendedor sin ventas ese período simplemente no aparecía. El local siempre muestra **todos los usuarios registrados**, incluso con 0 ventas, marcados en gris con "—" (`obtener_todos_usuarios()`). Se corrigió el endpoint para traer también todos los usuarios `admin`/`seller` y mezclarlos con los datos reales de órdenes (los que no vendieron quedan en 0), y la UI ahora muestra "—" en gris para esas filas en vez de "0" — igual que el local.

Verificado tsc/eslint/vitest.

### 15.16 Usuarios (2026-07-22)

Comparado `config_panel.py._seccion_usuarios` (local: crear usuario con nombre/rol/contraseña, eliminar usuario salvo "Admin", cambiar la contraseña de cualquier usuario) contra `admin/usuarios/page.tsx` + `api/users/route.ts` (nube).

**Confirmado que ya coincide** (de la Fase 4.1): gate de cliente (`if (!isAdmin) return <Lock/>`) — el hallazgo original de la sección 12 (página sin gate visible al vendedor) ya estaba cerrado.

**Hallazgo crítico corregido, no cubierto por la auditoría original**: la API (`api/users/route.ts`) solo tenía `GET` (listar) y `PUT` (editar rol/nombre/teléfono) — **no había forma de crear un usuario nuevo, eliminarlo, ni restablecer su contraseña** desde el panel. El admin de la nube dependía de que la persona se autorregistrara en `/registro` (arrancando siempre en rol `viewer`) y luego promoverle el rol manualmente aquí — sin ningún control directo de alta/baja/contraseña como sí tiene el local. Se agregó:
- `POST /api/users`: crea el login real de Supabase Auth (`auth.admin.createUser`, con el rol elegido desde el inicio, no siempre `viewer`) + su fila en `public.users`; si falla la fila de perfil, revierte el usuario de Auth para no dejar una cuenta huérfana.
- `PUT /api/users` ganó `new_password` opcional: restablece la contraseña de cualquier usuario (`auth.admin.updateUserById`).
- `DELETE /api/users?userId=...`: elimina el usuario (cascada a `public.users` vía FK), bloqueado si es el propio usuario autenticado o si es el único administrador restante (equivalente más general a la protección del local, que solo protegía a un "Admin" fijo por nombre).
- UI: formulario "Nuevo usuario", botón de restablecer contraseña (icono de llave, inline) y botón de eliminar (oculto para el propio usuario) en cada fila.

Todas las acciones nuevas quedan admin-only server-side (`requireAuth(request, ['admin'])`) y registran en `audit_logs`.

Verificado tsc/eslint/vitest.

### 15.17 Auditoría (2026-07-22)

Comparado `utils/auditoria.py` (local: `registrar()` se llama en decenas de puntos — venta registrada, factura creada/eliminada, fiado creado/abono/eliminado, préstamo, gasto, usuario creado/eliminado, nota, presupuesto, cambios de configuración, login...) contra `admin/auditoria/page.tsx` + `api/admin/audit-logs/route.ts` (nube).

**Confirmado que ya coincide** (de la Fase 4.1): la página ya no usa datos mock — el hallazgo explícito de la sección 12 ("admin/auditoria usa datos mock, no está conectada a la tabla real") ya estaba cerrado; ahora consulta `audit_logs` real vía `GET /api/admin/audit-logs`, con filtros por acción/tabla/actor/fecha y admin-only tanto en cliente como servidor.

**Hallazgo corregido (menor)**: las 4 acciones nuevas que introduje en la sección 15.16 (`user_created`, `user_password_reset`, `user_deleted`, y el ya existente `user_updated`) no tenían etiqueta en español en `actionConfig` — se agregaron.

**Hallazgo grande, confirmado pero NO corregido en esta ronda (fuera de alcance por tamaño)**: la cobertura real de `audit_logs.insert()` en la nube es mucho más angosta que la del local. Grep sobre `apps/web/src/app/api` muestra que solo escriben en `audit_logs` hoy: `inventory/adjust`, `orders/[id]`, `payments/*webhook`, `products/[id]`, `settings`, `daily-closures`, y `users` (recién agregado). **No registran nada**: Registrar Venta (`pos/sales`), Facturas (`supplier-invoices`), Fiado (`customer-credits`), Préstamos (`loans`), Notas, Presupuesto (`monthly-budgets`/`operating-expenses`), Cuentas (`account-movements`/`transfer`/`account-closures`). La infraestructura (tabla, API de lectura, UI con filtros) está completa y lista — falta añadir el `insert` correspondiente en cada una de esas ~8 rutas, una tarea mecánica pero extensa (multiplica por cada acción POST/PUT/DELETE de cada módulo). Dado el tamaño, se deja documentado como candidato claro para una **Fase 5 dedicada** en vez de intentarlo apresurado dentro de esta ronda de auditoría.

Verificado tsc/eslint/vitest.

### 15.18 Exportar/Importar (2026-07-22)

Comparado `services/exportador.py`/`services/importador.py` (local) contra `lib/excel/sheets.ts` + `api/admin/excel/{export,import}` + `admin/exportar-importar/page.tsx` (nube).

**Confirmado que ya coincide** (de la Fase 4.3): las 18 hojas exactas, validación de datos al importar (columnas desplazadas/corruptas detectadas ANTES de escribir, aborta si >50% de filas de una hoja tienen un campo numérico ilegible — igual que el "error crítico" del local), backup automático descargado antes de cada importación (`downloadBackup(..., 'Respaldo_previo_import')`, equivalente a `backup_antes_importar_<timestamp>.xlsx`), gastos con monto negativo filtrados, advertencia de facturas con monto=0 mayoritario.

**Hallazgo corregido**: faltaba "Plantilla vacía para llenar a mano" (`generar_plantilla_todo()` del local) — no había forma de descargar un Excel solo con encabezados (sin datos) para llenar manualmente y luego importar. Se agregó `GET /api/admin/excel/template` (reutiliza `sheetDefinitions`, solo las hojas `importable`) + botón "Descargar plantilla vacía" junto al de respaldo.

**Revisado y descartado deliberadamente (no es un hallazgo, es una decisión de seguridad)**: "Borrar base de datos" (`resetear_base_datos()` del local) **no se implementó a propósito**. En el local, la base SQLite es de uso interno exclusivo del negocio — borrarla no afecta nada más. En la nube, la base de datos es la **misma** que sirve la tienda pública en vivo (catálogo, pedidos reales, clientes) — un botón de "borrar todo" aquí sería capaz de destruir la tienda en producción, no solo los datos internos del POS. Replicar esta función literalmente sería peligroso, no fiel; se deja fuera y se documenta el motivo.

Verificado tsc/eslint/vitest.

### 15.19 Configuración (2026-07-22)

Comparado `models/configuracion.py` + `ui/config_panel.py` (local) contra `admin/configuracion-pos/page.tsx` (comisiones/gastos fijos) + `admin/configuracion/page.tsx` (tienda) + `api/settings/route.ts` (nube). Última sección de esta ronda.

**Confirmado que ya coincide** (de la Fase 4.2/4.1): comisiones NU y QR/Bancolombia ya tienen campo independiente (antes cayeron en un "transfer" genérico — hallazgo de la sección 12, ya cerrado), gate de cliente en ambas páginas de configuración (`admin/configuracion-pos` y `admin/configuracion`).

**Hallazgo corregido**: no había ninguna validación de rango en las comisiones (se podía guardar un valor negativo o mayor a 100%) ni en los gastos fijos (montos negativos, "días del mes" fuera de 1-31) — señalado en la sección 12 ("acepta cualquier número, incluso negativo, sin el `min='0'` del HTML siendo suficiente barrera real"). Se agregó validación con zod en `PUT /api/settings` (comisiones 0-100%, gastos fijos ≥0, días del mes 1-31) y en el cliente antes de enviar. A diferencia del local (que solo valida Addi/Datafono/Transferencia, dejando Nequi/NU/QR/Daviplata sin validar — su propia auditoría lo señala como incompleto), aquí se validan **todos** los métodos de forma consistente, sin replicar el hueco del local.

**Confirmado sin cambios, por ser decisiones ya tomadas explícitamente** (sección 12.7/13): `clave_inventario` (step-up de admin) no se replica — Fase 4.1 optó por restringir la escritura de inventario a admin directamente, más simple y "igual de seguro". `nombre_impresora`/ESC-POS no aplica — los recibos usan PDF+navegador. `timeout_minutos`/bloqueo por inactividad y `backup_automatico_activo` no tienen equivalente — el primero no se ha priorizado, el segundo no aplica igual en la nube (Supabase gestiona sus propios backups de infraestructura, a diferencia de una SQLite local sin ningún respaldo automático de la plataforma).

Verificado tsc/eslint/vitest.

---

## 16. Cierre de la auditoría exhaustiva sección-por-sección (2026-07-22)

Las 19 secciones de la sección 15 quedaron auditadas. Resumen ejecutivo:

**Hallazgos reales encontrados y corregidos en esta ronda** (16 commits, todos en `main`, ninguno pusheado):
1. Registrar Venta — ítems fuera de catálogo (crítico, migración `00025` pendiente de aplicar).
2. Ventas del Día / Presupuesto — categorías de gasto cerradas (antes texto libre).
3. Historial Mensual — comisión por método de pago.
4. Inventario — valor total de inventario + etiquetas de movimiento.
5. Facturas — desglose de vencimientos en $ por franja.
6. Fiado — validaciones más estrictas, antigüedad/alertas, condonar saldo (admin-only).
7. Préstamos — producto fuera de catálogo en la UI.
8. Notas — contador de resumen, edición de texto/fecha.
9. Presupuesto — panel de contexto de gastos fijos mensuales.
10. Reportes — comisión por método, método más usado, horas pico, día más rentable, tabla diaria con estado.
11. Rendimiento Vendedores — incluir vendedores sin ventas.
12. Usuarios — crear/eliminar/restablecer contraseña (antes solo editar rol).
13. Auditoría — etiquetas de acciones nuevas.
14. Exportar/Importar — plantilla vacía.
15. Configuración — validación de rango en comisiones/gastos fijos.

**Sin hallazgos, confirmadas 100% fieles**: Calculadora, Mi Cuadre, Cuentas.

**Sin equivalente local / fuera de alcance por diseño (documentado, no corregido)**: Cierres (`/admin/cierres` es una función preexistente de la tienda, posible redundancia con Mi Cuadre — pregunta abierta para el usuario) y la cobertura de `audit_logs` en ~8 módulos que todavía no registran nada (Registrar Venta, Facturas, Fiado, Préstamos, Notas, Presupuesto, Cuentas) — candidato claro para una **Fase 5 dedicada**, ya que la infraestructura de lectura/UI está lista, solo falta agregar el `insert` en cada ruta.

**Decisiones deliberadas confirmadas, no son bugs**: costo oculto al vendedor sin markup ficticio, edición de inventario 100% admin-only sin step-up, "Borrar base de datos" no replicado (peligroso en una BD compartida con la tienda en vivo), validaciones "invertidas" de Facturas mantenidas por ser mejores que las del local, seller_id automático en vez de combo manual de vendedor (confirmado con el usuario que cada vendedor tiene su propia cuenta).

**Pendientes acumulados de todo el proyecto** (sin cambios desde antes de esta ronda): aplicar en Supabase, en orden, las migraciones `00019` a `00025`; autorizar el `git push` cuando el usuario quiera desplegar.

## 17. Bug de producción: `/admin` colgado tras iniciar sesión (2026-07-22)

Tras aplicar las migraciones `00019`-`00025` y hacer el primer `git push` de toda esta ronda, el usuario probó el login en producción (`www.yjbmotocom.com`) con la cuenta `admin@yjbmotocom.com` y reportó: (1) tras iniciar sesión, quedaba en `/mi-cuenta` en vez de `/admin`; (2) al escribir `/admin` a mano, en una ventana de incógnito se quedaba con el spinner girando para siempre, y en un navegador con más pestañas abiertas terminaba rebotando de vuelta a `/iniciar-sesion`.

**Diagnóstico**: se verificó directamente contra Supabase (consulta con `SUPABASE_SERVICE_ROLE_KEY` desde `.env.local`) que la fila de `public.users` para esa cuenta tiene `role = 'admin'` correctamente — no era un problema de datos ni de RLS (se replicó el login + consulta de rol con la clave anónima y funcionó al instante). Se le pidió al usuario dos pruebas de diagnóstico: (a) F5 en `/mi-cuenta` mantenía la sesión (descarta que el navegador no esté guardando la sesión en absoluto); (b) en incógnito, `/admin` se quedaba en un spinner infinito sin resolver nunca.

Esto aisló el problema a `apps/web/src/lib/auth-context.tsx` (el `AuthProvider` que envuelve toda la app): su llamada inicial a `supabase.auth.getSession()` no tenía ninguna protección de timeout. `getSession()` puede quedarse colgada indefinidamente (nunca resuelve ni rechaza) en ciertos navegadores/pestañas — un problema conocido de `@supabase/auth-helpers-nextjs` (paquete deprecado hace tiempo por Supabase, con un lock interno de refresco de sesión entre pestañas que a veces no se libera). Si `getSession()` nunca resuelve, `loading` nunca pasa a `false`, y el layout de `/admin` (`if (!loading && !user) redirigir`) nunca sale del spinner — o, en la variante donde algo más adelante sí fuerza una resolución tardía, termina en un estado inconsistente que se resuelve como "no autenticado" y rebota a `/iniciar-sesion` aunque la sesión sí exista. `mi-cuenta/page.tsx` nunca sufrió este problema porque ya tenía su propia protección de timeout local (`Promise.race` con 10s) desde antes; `auth-context.tsx`, compartido por toda la aplicación, no la tenía.

**Corrección** (commit `9342d57`): se envolvió la llamada inicial a `getSession()` en una carrera con un timeout de 8 segundos (mismo patrón ya validado en `mi-cuenta/page.tsx`). Si se agota, se reintenta con `supabase.auth.getUser()` — una llamada de red independiente que no depende del mismo lock — antes de rendirse. `loading` siempre termina en `false` sin importar qué pase. Verificado `tsc`/`eslint`/`vitest`/**`npm run build` completo** (se corrió el build entero, no solo admin, porque este archivo lo usa toda la app, incluida la tienda pública).

**Pendiente**: el usuario debe volver a probar el login en producción después de este despliegue y confirmar si el panel de administrador ya carga con normalidad. Si el problema persiste, el siguiente paso sería revisar la consola del navegador (F12) en el momento exacto del cuelgue para ver el error subyacente exacto, y considerar como solución de fondo migrar de `@supabase/auth-helpers-nextjs` (deprecado) al paquete moderno `@supabase/ssr` — una migración más grande, fuera del alcance de este parche puntual.

## 18. Bug de producción: `/admin/ordenes` roto y 3 páginas admin sin autenticación (2026-07-22)

Después del fix de la sección 17, el usuario logró entrar a `/admin` y navegó a `/admin/ordenes`, que mostró la pantalla genérica de error de Next.js ("Algo salió mal — Ocurrió un error al cargar esta página").

**Diagnóstico**: `admin/ordenes/page.tsx` llamaba a `fetch(\`/api/orders?${params}\`)` **sin ningún header `Authorization`**, pero `GET /api/orders` exige `requireAuth(request, ['admin', 'seller'])` — sin el token, la API responde `401 {error: '...'}`. El código hacía `setOrders(data || [])` sin validar que `data` fuera un arreglo, así que ese objeto de error terminaba como el estado `orders`; más abajo, `orders.filter(...)` (para el buscador) truena porque `.filter` no existe en un objeto — de ahí la pantalla de error genérica de React. El mismo problema afectaba al `PUT` de actualizar una orden.

**Barrido completo**: dado que este es un patrón de bug (no algo específico de Órdenes), se revisaron las 35 páginas de `admin/` buscando fetches a rutas `/api/*` sin ningún mecanismo de autenticación (ni header `Authorization` inline ni un helper `authHeaders()`). Resultado:
- **3 páginas realmente rotas** (todas sus operaciones de red fallaban con 401, silenciosas o con crash): `admin/ordenes` (crash confirmado, `data || []` sin validar), `admin/cupones` y `admin/resenas` (ambas ya tenían `Array.isArray(data) ? data : []`, así que no truenan, pero mostraban una lista vacía en vez de los cupones/reseñas reales, y crear/editar/eliminar/aprobar siempre fallaba en silencio).
- **`cierre-alegra/*` (4 páginas) no son un bug**: usan un esquema de autenticación distinto y válido — `requireAlegraAdmin()` en `lib/alegra-auth.ts` lee la sesión directamente de las cookies del servidor (`createRouteHandlerClient`), no necesita que el cliente adjunte un Bearer token manualmente.
- El resto de páginas admin ya enviaban el header correctamente (patrón `authHeaders()` o `Authorization: Bearer ${session.access_token}` inline).

**Corrección**: se agregó `useAuth()` + header `Authorization: Bearer ${session.access_token}` a los 2 fetches de `admin/ordenes/page.tsx` (GET y PUT) y a los 4 de `admin/cupones/page.tsx` y los 3 de `admin/resenas/page.tsx` (GET/POST/PUT/DELETE en cada una). `admin/ordenes/page.tsx` también gana `Array.isArray(data) ? data : []` en vez de `data || []`, para que un futuro fallo de red no vuelva a tumbar la página. Verificado `tsc`/`eslint`/`vitest`/`npm run build` completo.

## 19. Migración del historial real del software local a producción (2026-07-22)

El usuario adjuntó `YJBMOTOCOM_Historial_22_07_2026.xlsx`, generado por el software local, y preguntó si la plataforma desplegada podría importarlo tal cual (772 ventas, 758 ítems de inventario, 158 préstamos, 21 notas, 41 facturas, 196 movimientos de cuenta, 193 movimientos de inventario — el historial real y completo del negocio a esa fecha).

**Diagnóstico**: el importador de Excel de la nube (`api/admin/excel/import/route.ts`) espera encabezados en la fila 1 y nombres de columna específicos; el exportador del software local escribe los encabezados en otra fila y con otros nombres, además de que las referencias de producto/cuenta en el local son texto libre mientras que la nube usa UUIDs con relaciones FK. Reimportar el Excel del local tal cual **no funcionaría**. Se le explicó esto al usuario, quien pidió en su lugar un script de migración de una sola vez (no un arreglo del importador genérico, ya que a futuro los backups se generarán y reimportarán desde la propia nube, ciclo que ya funciona bien).

**Decisiones confirmadas con el usuario** (vía preguntas explícitas): (a) yo mismo ejecuto el script contra Supabase, con `--write` solo tras un dry-run limpio; (b) se incluyen las 772 ventas históricas completas, no solo un subconjunto "seguro"; (c) los 3 vendedores nuevos se crean con patrón `nombre@yjbmotocom.com` y clave temporal `1234`; (d) el método de pago descontinuado "Bold" se cuenta como Datáfono; (e) los saldos actuales de cuentas en la nube (solo datos de prueba en $0) se pueden sobrescribir sin riesgo.

**Script**: `migrate-historial.js` (guardado en el scratchpad de la sesión, no en el repo, por manejar datos reales del negocio). Diseño: Cuentas/Inventario son "fotos del presente" (se sobreescribe el saldo/stock actual directamente); Ventas/Préstamos/Notas/Gastos/Facturas se insertan como registros históricos con su fecha original sin generar efectos secundarios de saldo/stock (porque las fotos ya los fijaron); Mov. Cuentas/Mov. Inventario se insertan como bitácora pura.

**Bugs encontrados y corregidos antes y durante la migración real** (varios solo se manifestaron en modo `--write`, ya que el dry-run no ejecuta el código dentro de `if (WRITE)`):
- Resolución de cuenta por método de pago vía regex frágil (`"Transferencia QR"` → intentaba matchear `"QR"` contra el nombre real de cuenta `"QR/Bancolombia"` y fallaba) — se reemplazó por un mapa explícito `METODO_A_CUENTA_NOMBRE`.
- Fechas de "Mov. Cuentas"/"Mov. Inventario" vienen en formato ISO (`YYYY-MM-DD`), a diferencia de Ventas/Facturas/Préstamos que usan `DD/MM/YYYY` — el parseo asumía un solo formato y habría lanzado `RangeError: Invalid time value` a mitad de la escritura real. Se agregó `partesFecha()`, que detecta el separador.
- La fila `Serial: "TOTALES"` de la hoja Inventario es el resumen del reporte local ("213 ref. con stock", costo/cantidad = sumas totales), no un producto real — el primer intento la trató como producto y falló por costo fuera de rango de `INT`. Se excluyó explícitamente.
- **Bug grave real**: "Venta ID" en Mov. Cuentas referencia el `#` de la fila de detalle individual, no el de la primera fila de su factura agrupada — confirmado con datos reales (0/174 coincidían con la primera fila, 174/174 con otra fila del mismo grupo). El script indexaba solo `primera['#']`, así que el enlace `reference_id` habría quedado siempre en null. Se corrigió indexando todas las filas del grupo.
- **Bug grave real, con impacto de datos**: 638 de 769 filas de "Ventas" no tienen "N° Factura" (ventas de una época anterior del local, de un solo producto, sin número de factura ni vendedor). El script las agrupó todas bajo una sola clave `null`, generando una "mega-orden" que desbordó el tipo `INT` de Postgres al sumar los montos de cientos de ventas independientes en un solo total — la escritura real falló a mitad de camino y **638 líneas de venta no se guardaron en el primer intento**. Se corrigió tratando cada fila sin factura como su propia orden individual (`fix-missing-ventas.js`, script de reparación aparte que no duplicó lo ya migrado con éxito) y ajustando `migrate-historial.js` para que futuras corridas no repitan el error.
- Facturas: la hoja usa "Estado": "pendiente"/"pagada" (español), pero `supplier_invoices.status` solo acepta `pending`/`paid` (CHECK constraint) — **las 41 facturas habrían fallado** de no corregirse el mapeo. Una factura también tenía "Proveedor" vacío (columna NOT NULL); se rellenó con "Sin proveedor".
- La consulta de verificación de "stock bajo" del Dashboard (ver sección 21) reveló, de forma relacionada, que `products.barcode` no existía todavía cuando se migraron los ~71 productos sin talla — sus códigos de barra del Excel se perdieron en el primer intento. Se agregó la migración `00026_product_barcode.sql` y se recuperaron los 71 códigos desde el Excel original en un script de backfill aparte.

**Resultado final verificado contra la base de datos real** (consultas directas con la clave de servicio, no solo lo que reportó el script): 704 órdenes, 769 ítems de venta, 749 pagos, 158 préstamos, 21 notas, 41 facturas, 194 productos (190 migrados + 4 demo), 685 variantes, 196 movimientos de cuenta, 193 movimientos de inventario, 6 cuentas actualizadas con su saldo real, 3 vendedores nuevos, gastos fijos mensuales (arriendo/sueldo/servicios) cargados en `store_settings`. El Log de Auditoría del local (111 filas de actividad de sesión) se excluyó a pedido explícito del usuario — no es un registro de negocio reconstruible.

## 20. Construcción completa del módulo Inventario (2026-07-22/23)

El usuario reportó que, tras la migración, `/admin/inventario` solo mostraba 4 productos (los de demo) en vez de los 194 reales, y pidió comparar a fondo contra las 5 pestañas del software local: Detalle, Inventario General, Movimientos, Ingresar, Cambios.

**Bug de visibilidad (dos capas)**: (1) `GET /api/products` filtraba `active=true` a nivel de aplicación sin soportar `include_inactive` a pesar de que la página ya lo pedía; (2) al corregir eso, seguía sin funcionar porque la consulta usaba el cliente Supabase con clave anónima — la política RLS `"Anyone can view active products" USING (active = true)` seguía aplicando porque `auth.uid()` no resuelve sin el JWT del usuario adjunto a la petición. Se corrigió usando `createAuthenticatedClient(auth.token)` cuando `include_inactive=true`, con lo que el rol admin/seller sí satisface la política `"Admins and sellers can manage products" FOR ALL`.

**Gap analysis** (Explore agent leyó `ui/inventario_panel.py`, 1796 líneas, completo): de las 5 pestañas, "Cambios" y "Cargue de Pedidos" ya existían como páginas aparte (`/admin/inventario/cambios`, `/admin/inventario/cargue-pedidos`); faltaban por completo "Inventario General", el historial completo de "Movimientos" (solo se veían los últimos 10) e "Ingresar".

**Construido**:
- **Inventario General**: agrupa por categoría (explícita vía `category_id`, o inferida de la primera palabra del nombre quitando el sufijo `-T:talla`, igual que `_categoria_producto` del local), mostrando referencias/unidades/valor por grupo.
- **Movimientos**: historial completo (últimos 300, igual que `obtener_movimientos_recientes(300)`), con filtro por producto y por tipo, en vez de los 10 recientes que ya se mostraban al pie de Detalle.
- **Ingresar**: alta rápida con autocompletado, generación automática de serial (`MAX(sku numérico)+1`) y código de barras de 10 dígitos `CC+MM+NNN+VV+T` (puerto exacto de `services/inventario_gen.py`, detectando categoría por palabras clave del nombre), panel de "productos similares" de la misma categoría para evitar duplicados. Si el producto/talla ya existe, suma cantidad en vez de duplicar (el local siempre inserta fila nueva porque su modelo es plano; el esquema de la nube tiene `UNIQUE(product_id, talla)`, así que sumar es la adaptación correcta).
- **Editar producto/variante**: no existía ningún lugar en la nube para editar el costo de un producto ya creado (ni en Inventario ni en la página Productos) — se agregó un editor inline (nombre, costo, cantidad, mínimo, código de barras) en Detalle, con la cantidad registrando un movimiento "Ajuste" si cambia.
- **Exportar**: reemplaza el CSV plano anterior por un diálogo con las mismas opciones del local (`_ExportarInventarioDialog`/`generar_pdf_inventario`: alcance, categoría, talla, orden, resumen por categoría) más un selector Excel/PDF que no existía en el local (allá eran botones separados). El PDF se genera como HTML servido en pestaña nueva con un botón "Imprimir / Guardar como PDF" (mismo patrón que el recibo de venta), no con un renderizador de PDF en servidor.
- Migración `00026_product_barcode.sql` (columna `barcode` en `products`, para productos sin variantes — antes solo existía en `product_variants`) + backfill de los 71 códigos perdidos en la migración histórica (sección 19).

**Pendiente, a decisión del usuario**: candado de clave de admin para editar en Detalle (hoy el control es por rol de sesión, no por contraseña puntual); markup +30% del costo visible al vendedor (hoy se oculta del todo en vez de mostrarlo con margen).

## 21. Bug transversal: páginas admin usando el cliente Supabase sin sesión (2026-07-23)

El usuario reportó que la Calculadora tampoco encontraba productos al buscar, y pidió revisar si el mismo problema aparecía en otras secciones.

**Diagnóstico**: `/api/pos/search` (usado por Calculadora y Registrar Venta) filtraba `products.active=true` igual que el catálogo público — pero ese campo solo controla si el producto se muestra en la tienda online, no si se puede vender por mostrador. Los 190 productos migrados quedaron `inactive` a propósito (sección 20), así que nunca aparecían al buscar una venta. Se quitó el filtro (el POS ya es una operación interna protegida por `requireAuth`), y se agregó `barcode` al `OR` de la búsqueda por texto.

**Barrido más amplio**: al confirmar que este era un patrón de bug (cliente sin autenticar o campo `active` mal aplicado a operaciones internas), se encontraron 4 casos más, todos con la misma causa raíz que la sección 20 (RLS o falta de token, no solo el filtro de la app):
- **`admin/page.tsx` (Dashboard principal)** — el más grave: es un Server Component que usaba el cliente anónimo `supabase` (sin JWT, sin cookies). Confirmado con una prueba directa contra la base real: el cliente anónimo veía **0 de 705 órdenes** y solo los 4 productos de demo. Es decir, el Dashboard llevaba mostrando ceros o datos incompletos en ventas de hoy/semana, pedidos pendientes, top productos y stock bajo. Se cambió a `getServiceSupabase()` (la ruta ya está protegida por middleware).
- **`admin/productos/[id]/editar/page.tsx`** — mismo problema: abrir la edición de cualquiera de los 190 productos migrados daba 404 aunque el producto existiera. Mismo fix.
- **`admin/productos/page.tsx`** — la lista de productos pedía `/api/products` sin `include_inactive` ni token de sesión.
- **Bug adicional, sin relación con RLS**: la consulta de "stock bajo" del Dashboard usaba `.filter('stock_qty', 'lte', 'low_stock_threshold')` — PostgREST no soporta comparar dos columnas entre sí con ese operador; trataba `"low_stock_threshold"` como texto literal y fallaba en silencio (`data` quedaba `null` sin lanzar error visible). El widget de stock bajo llevaba **siempre vacío**, independientemente del bug de RLS. Se corrigió trayendo el listado completo y comparando en el servidor.

Verificado `tsc`/`eslint`/`vitest`/`npm run build` en cada corrección.

## 22. Rediseño de Registrar Venta: pestañas en paralelo + interfaz estilo Alegra (2026-07-23)

El usuario pidió dos cosas relacionadas con Registrar Venta: (a) poder atender varios clientes en paralelo con pestañas tipo Alegra (mostró capturas de la interfaz de Alegra como referencia visual), y (b) copiar la forma general de esa interfaz (grilla de productos, panel de factura, modal de pago) sin necesidad de copiar los colores.

**Pestañas en paralelo**: la nube ya tenía un mecanismo de "pausar carrito" (`standbyCarts`, puerto directo del `_parquear_carrito`/`_restaurar_carrito` de `venta_form.py` del local) que exigía un clic explícito de "Pausar" antes de atender a otro cliente, mostrando los carritos pausados como chips aparte. Se reemplazó por pestañas persistentes siempre visibles ("Venta principal", "Venta 2", ... + botón "+"), con cambio directo de un clic — sin el paso de "pausar". Todo el estado por venta (carrito, pagos, cliente, notas, último recibo) se agrupó en un array de "sesiones" en vez de variables sueltas a nivel de página.

**Rediseño estilo Alegra**: grilla de productos navegable con tarjetas (antes solo aparecía una lista de resultados al escribir; ahora `/api/pos/search` soporta "modo catálogo" sin texto de búsqueda, y filtro por categoría), panel "Factura de venta" con cliente colapsado ("Consumidor final" por defecto) y carrito compacto, y el botón "Vender" ahora abre un modal "Pagar factura" con tiles de método de pago (Efectivo, Datáfono, Nequi, NU, QR, Daviplata, Addi, Otro, Combinado) en vez de registrar directo — un método simple pide monto/cuenta y confirma, "Combinado" reutiliza el editor de pagos divididos ya existente. No se perdió funcionalidad previa (descuento por línea, producto fuera de catálogo, comisión estimada, aviso de "Stock insuficiente" con opción de continuar).

**Separador de miles**: el usuario notó que escribir "2000" en un campo de dinero se veía tal cual, sin separador ("2.000"), a diferencia del `MoneyLineEdit` del local. Se creó un componente reutilizable `components/ui/money-input.tsx` (formatea visualmente mientras se escribe, guarda el valor crudo en pesos) y se aplicó en todos los campos de dinero encontrados en el panel: Calculadora, Registrar Venta, Inventario (Ingresar/editar), Configuración POS, Facturas, Fiado, Presupuesto, Ventas del Día y Cierre Alegra.

## 23. Historial Mensual ↔ Vista del Día (2026-07-23)

El usuario mostró capturas del software local: en Historial Mensual, al seleccionar un día y pulsar "Ver Vista del Día", se abre un diálogo con las ventas de ese día, préstamos pendientes y gastos operativos (`ui/historial_panel.py` + `ui/vista_diaria_dialog.py`, 2202 líneas leídas completas por un Explore agent) — función que no aparecía enlazada desde Historial Mensual en la nube.

**Hallazgo clave**: `/admin/ventas-dia` ya era, en la práctica, el equivalente funcional de "Vista del Día" (ventas del día editables, gastos operativos, y la fórmula exacta de Utilidad Real con gasto fijo prorrateado por día) — solo que Historial Mensual no la enlazaba, y le faltaban dos secciones que el diálogo local sí tiene.

**Cambios**:
- Cada día de "Ventas por día" en Historial Mensual ahora es un link a `/admin/ventas-dia?date=YYYY-MM-DD` (la página se envolvió en `Suspense` para leer `useSearchParams`).
- Se agregó "Por método de pago" (ingresos del día agrupados por método, expandiendo cada mitad de un pago combinado por separado — igual que `_build_totales` del diálogo local) y "Préstamos pendientes" — esta última muestra **todos** los préstamos con estado pendiente sin filtrar por fecha, confirmado como comportamiento intencional del local (`obtener_prestamos_pendientes` no filtra por fecha; es un recordatorio persistente de mercancía prestada, no un listado del día).
- **Bug real corregido**: la clasificación "Positivo/Negativo" por día en Historial Mensual (y el conteo de "Días positivos/negativos") usaba solo ingreso−costo, ignorando el gasto fijo diario prorrateado y los gastos operativos puntuales de ese día — no coincidía con la fórmula de Utilidad Real que ya usa correctamente Ventas del Día. Ahora ambas páginas usan la misma fórmula, y los días sin ventas pero con gastos operativos también se cuentan (antes no aparecían en absoluto).

Verificado `tsc`/`eslint`/`vitest`/`npm run build` en todas las secciones 20-23.

**Nota**: este bug (fetch sin token en 3 páginas) es independiente del bug de la sección 17 (cuelgue de `getSession()`) y ya existía desde que se construyeron estas páginas en fases anteriores del proyecto — nunca se había detectado porque `tsc`/`eslint`/`vitest` no prueban el comportamiento real en el navegador con datos reales, solo la corrección de tipos/sintaxis. Vale la pena que, de ahora en adelante, cualquier página nueva de admin se pruebe manualmente contra el sitio desplegado (o con `npm run dev` + sesión real) antes de darla por terminada, no solo con los checks automatizados.

## 24. Spinner infinito en Historial Mensual, lista plana de Ventas del Día, sidebar colapsable, y rediseño de Préstamos (2026-07-23/24)

**Spinner infinito tras inactividad**: el usuario reportó que Historial Mensual (y potencialmente otras páginas) se quedaba cargando indefinidamente tras un rato sin usar la pestaña, solucionable solo con recarga forzada o cerrando/reabriendo sesión. Es la misma causa raíz de la sección 17 (`navigator.locks` de `@supabase/auth-helpers-nextjs` colgando el refresco de sesión entre pestañas) pero manifestada de forma independiente: `auth-context.tsx` ya tenía su propio timeout desde la sección 17, pero varias páginas admin llaman a `supabaseBrowser` **directamente** para sus propias consultas, sin pasar por ese contexto — cada una podía colgarse por su cuenta. Se agregó un helper reutilizable `withTimeout<T>(promise: PromiseLike<T>, ms=12000, label)` en `lib/supabase-browser.ts` (se tipó el parámetro como `PromiseLike<T>`, no `Promise<T>`, porque los query builders de Supabase son "thenable" pero no instancias literales de `Promise`), y se envolvió la carga principal de `historial-mensual`, `reportes`, `cierres` e `inventario` con `try/catch/finally` + estado `loadError` + botón "Reintentar", en vez de quedarse en el spinner para siempre.

**Ventas del Día → lista plana + edición de factura completa**: el usuario mostró capturas del reporte que usa a diario para llevar el registro de qué se vendió, qué ganancia hubo y qué medios de pago se usaron, y explicó que las tarjetas colapsables por venta (había que desplegar cada una) le impedían tomar una sola captura de pantalla como evidencia diaria, y que si un producto tenía que corregirse, la edición debía abrir **la factura completa** (todos los productos de esa venta), no solo la línea del producto clicado — para saber siempre a qué factura pertenece cada producto vendido. Se eliminó el estado `expanded`/tarjetas colapsables y se aplanó todo a una sola tabla (`saleLines = activeSales.flatMap(sale => sale.order_items.map(item => ({item, sale})))`, columnas Producto/Costo/Precio Venta/Método de Pago/Ganancia Neta/Factura/Acciones), con las ventas anuladas aparte en una lista compacta. El botón "Editar" de cualquier línea calcula `editingSale = sales.find(s => s.id === editingId)` y abre un modal con la factura completa (todos sus productos, pagos, y método), nunca un solo producto aislado.

**Sidebar colapsable**: se agregó un botón tipo "hamburguesa" (ícono `Menu`) al layout de `/admin` que colapsa la barra lateral (ancho `w-64` → `w-16`, navegación solo con íconos + `title` como tooltip), con el estado persistido en `localStorage` para que la preferencia sobreviva a recargas.

**Préstamos — hora real de Colombia, fecha editable, badge de días, alerta de pendientes**: comparando la página de Préstamos desplegada contra `ui/prestamos_panel.py` del software local, el usuario señaló tres carencias: (1) no se mostraba la hora, solo la fecha; (2) el local tuvo en el pasado un bug de desincronización de hora que ya se corrigió ahí capturando la hora real (`datetime.now()`) justo en el instante del clic en "Registrar" (no la hora de apertura del formulario) — la nube debía ser igual de robusta; (3) no se podía elegir la fecha al registrar un préstamo nuevo (quedaba fija en "hoy").

Cambios:
- `created_at` (antes generado solo por la base de datos) ahora es un campo opcional en `loanSchema`/`loanUpdateSchema` (`apps/web/src/app/api/loans/route.ts` y `[id]/route.ts`) — si no se envía, sigue usando `NOW()` como antes.
- Se agregaron helpers explícitos de zona horaria de Bogotá (`bogotaDateStr`, `bogotaTimeStr`, `bogotaToISO`, `diasPendientes`) usando `Intl.DateTimeFormat` con `timeZone: 'America/Bogota'` en vez de confiar en la hora del sistema operativo del dispositivo — Colombia no tiene horario de verano, así que el desfase UTC-5 es fijo todo el año.
- **Crear préstamo**: campo "Fecha" editable (por defecto hoy en Bogotá); la hora se sigue capturando fresca (`bogotaTimeStr(new Date())`) en el momento exacto de enviar el formulario, igual que el local, para no arrastrar una hora vieja si el formulario quedó abierto un rato.
- **Editar préstamo**: a diferencia de crear, aquí sí se puede corregir tanto la fecha como la hora libremente (dos inputs `date`/`time`), igual que el `EditPrestamoDialog` local — pensado para corregir historial, no para registrar en tiempo real.
- Badge de "días" por préstamo con el mismo umbral de colores que `_badge_dias` del local (no pendiente = gris; `<30` días = verde; `<60` = ámbar; `≥60` = rojo).
- Banner de alerta ("N préstamos pendientes — M con más de 30 días sin resolver") calculado sobre **todos** los préstamos pendientes sin importar el filtro de estado activo — igual que `_actualizar_alerta` del local, que no depende del filtro visual.
- El listado por fila ahora muestra fecha y hora combinadas con `toLocaleString('es-CO', { timeZone: 'America/Bogota', ... })` en vez de solo la fecha.

**Inventario — reubicación del botón "Cambios"**: el usuario notó que "Cambios" aparecía solo/aparte en la esquina superior derecha en vez de junto a las demás pestañas del módulo. Se movió a la fila de pestañas, después de "Ingresar" (Detalle / Inventario General / Movimientos / Ingresar / Cambios), dejando "Cargue de Pedidos" y "Exportar" donde estaban (son acciones globales, no pestañas de navegación interna).

Verificado `tsc`/`eslint`/`vitest`/`npm run build` en todos los cambios de esta sección.

## 25. Notas y Pendientes: separación en pestañas (2026-07-24)

El usuario mostró capturas comparando `/admin/notas` desplegado (una sola lista donde "por pedir/resurtido" y "tareas operativas" aparecían mezclados, distinguibles solo por una etiqueta `Badge` inline) contra el software local, que ya maneja esto como dos pestañas separadas ("Por Pedir / Resurtido" y "Tareas Operativas"), y pidió recomendaciones para mostrarlo mejor.

El modelo de datos ya traía `type: 'task' | 'restock'` en cada nota (`apps/web/src/app/admin/notas/page.tsx`), así que no hizo falta ningún cambio de esquema ni de API — solo reorganizar la vista:

- Se agregó una fila de pestañas (estado `activeTab: 'restock' | 'task'`, por defecto `'restock'`) con el mismo patrón visual de borde inferior ya usado en el resto del panel.
- `tabNotes = notes.filter(n => n.type === activeTab)` reemplaza el filtrado directo sobre `notes` en el conteo ("N pendientes · N en total · ⚠ N vencidas"), el orden por urgencia y el estado vacío — cada pestaña calcula sus propios totales, igual que `_lbl_count` del local calcula por pestaña, no sobre el total global.
- El formulario "Nueva nota" ya no tiene el selector de tipo (ahora es implícito según la pestaña activa) y cambia su placeholder según el contexto (`"Ej: Cascos XTR-M70 talla M x 5..."` en Por Pedir / Resurtido, `"Ej: Revisar cuentas de Addi del mes..."` en Tareas Operativas).
- Se quitó el `Badge` de tipo por nota (ya redundante, la pestaña activa lo indica) mantenimiento el resto de la funcionalidad intacta: toggle Pendientes/Completadas, checklist (botón ✓ que marca completada con tachado), edición y borrado por nota, y el gradiente de urgencia por fecha de vencimiento.
- Cambiar de pestaña resetea el toggle a "Pendientes" (`setShowCompleted(false)`) para no dejar al usuario viendo, por ejemplo, tareas completadas mientras navega a Por Pedir / Resurtido sin darse cuenta.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 26. Ventas del Día: layout en paralelo para que quepa en una sola captura (2026-07-24)

El usuario comparó `/admin/ventas-dia` desplegado contra "Vista del Día" del software local y señaló tres problemas de evidencia visual: (1) "Por método de pago" ocupaba media fila de ancho para mostrar 2-3 chips, desperdiciando espacio; (2) "Préstamos pendientes" tenía un `max-h-64 overflow-y-auto` que cortaba la lista a ~6 filas visibles, obligando a otro pantallazo aparte para ver los demás; (3) todo estaba apilado verticalmente (método de pago, préstamos, luego productos vendidos como bloques separados) en vez de en paralelo como el local, que muestra ventas a la izquierda y préstamos a la derecha ocupando toda la altura disponible.

Cambios en `apps/web/src/app/admin/ventas-dia/page.tsx`:
- "Por método de pago" pasó de tarjeta de media fila a una tira delgada de chips (`flex flex-wrap`) pegada justo debajo de las tarjetas de resumen (Total del día / Gastos operativos / Ganancia neta / Utilidad real) — ahora ocupa solo el alto de una línea en vez de una tarjeta completa.
- Se quitó el `max-h-64 overflow-y-auto` de la tabla de préstamos pendientes: ahora crece con su contenido igual que la tabla de ventas, sin truncar filas.
- El bloque de ventas (lista plana de productos + ventas canceladas) y el de préstamos pendientes ahora están en un `grid lg:grid-cols-3 items-start`: ventas ocupa `lg:col-span-2` (más ancho, tiene más columnas: Producto/Costo/Precio/Método/G.Neta/Factura/Acciones) y préstamos la columna restante — en paralelo, como en el software local, para que ambos bloques quepan en una sola captura de pantalla sin tener que hacer scroll ni tomar una segunda captura para los préstamos. En pantallas angostas, el grid colapsa a una sola columna (ventas arriba, préstamos abajo) porque `lg:grid-cols-3` solo aplica desde el breakpoint `lg`.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 27. Reporte PDF de Historial Mensual: paridad con el software local (2026-07-24)

El usuario adjuntó dos PDF reales de julio 2026 para comparar (`Reporte_Julio_2026.pdf` del local vs. `Reporte_Julio_2026_1.pdf` del desplegado) y pidió revisar bien qué información trae cada uno, porque el del sitio desplegado "se ve muy pobre".

**Diagnóstico**: el PDF del local (`services/pdf_reporte.py`, generado con `reportlab`) es un reporte completo de 5 páginas: tarjetas KPI (ventas/ingresos/ganancia neta/utilidad real), desglose de gastos fijos + operativos, estadísticas del mes (método más usado, ticket promedio, categoría top, día más rentable), Top 10 productos, comisiones por método de pago, horas pico de ventas (franjas de 2h), resumen por día con estado positivo/negativo, tres gráficas (ingresos diarios, tendencia de ganancia neta últimos 7 días, ingresos por método de pago) e inventario general por categoría. El PDF del desplegado, en cambio, resultó ser literalmente un `window.print()` de una página HTML mínima (`handlePrint` en `apps/web/src/app/admin/historial-mensual/page.tsx`) que solo escribía 8 cifras totales y una tabla de "Ventas por día" — ninguna de las demás secciones existía, aunque varias ya se calculaban en la página (Top 10, comisiones, días positivos/negativos) y simplemente no se incluían en el `handlePrint`.

**Cambios**: se reescribió `handlePrint` para generar el mismo conjunto de secciones que el local, reutilizando datos ya cargados en `orders` más algunos cálculos nuevos:
- **Nuevos cálculos** (antes ausentes en esta página): `revenueByMethod`/`unitsByMethod` por método **dominante** de la orden (si tiene más de un método de pago cuenta como "Combinado" en bloque, igual que `v.metodo_pago = "Combinado"` del local — a diferencia del desglose granular por componente que ya existe en Ventas del Día, que es un reporte distinto); `unitsByCategory` (categoría inferida de la primera palabra del nombre del producto, misma lógica que `inferCategoria` de Inventario); `peakHours` (unidades e ingresos por franja de 2h, de 6am a 10pm); `ticketPromedio`; `diaMasRentable` (por ganancia neta del día); `commissionCountByMethod`; y `gananciaNeta`/`units` por día en `dailyArray` (antes solo tenía `revenue`/`cost`, sin comisión ni unidades — así que "VENTAS" por día ahora son unidades vendidas ese día, no conteo de facturas, igual que `cantidad_ventas` del local).
- **Desglose de gastos fijos**: se guarda el detalle (`arriendo_cents`/`sueldo_cents`/`servicios_cents`/`otros_gastos_cents`) en un nuevo estado `fixedBreakdown`, antes solo se sumaba a un total sin desglosar.
- **Inventario General**: se trae solo al exportar (no en cada carga de la página, para no pesar el render normal), reutilizando la misma consulta y lógica de agrupación por categoría que `fetchCategoryRollup` del módulo Inventario.
- **Gráficas**: como el reporte sigue siendo HTML impreso por el navegador (mismo patrón ya usado en el sitio, sin agregar ninguna librería de PDF nueva), las tres gráficas del local se recrean con barras CSS simples (`div`s con `width`/`height` proporcional) en vez de un canvas — se ven bien tanto en pantalla como al imprimir/guardar como PDF.
- **Ventana emergente**: se abre inmediatamente al hacer clic (antes de cualquier `await`) para que el bloqueador de pop-ups del navegador no la descarte, mostrando "Generando reporte…" mientras se resuelve el fetch de inventario, y un mensaje de error si algo falla en vez de quedar colgada.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 28. Confirmación de "horas pico" + fecha editable en Registrar Venta (2026-07-24)

El usuario preguntó dos cosas tras revisar el reporte de la sección 27: (1) si "horas pico" — que solo existía en el software local — ya está funcionando en el desplegado; (2) si en Registrar Venta se puede elegir la fecha, porque en el local sí se podía (para registrar una venta de un día anterior, ej. si se fue la luz y no se pudo registrar a tiempo) pero en el desplegado la fecha quedaba fija en "hoy" sin ninguna forma de cambiarla — necesitaba esto para poder corregir manualmente unas ventas que tiene registradas en el local pero no en la nube.

**Horas pico — confirmado y corregido un riesgo de zona horaria**: sí quedó implementado en la sección 27 (`peakHours` en `historial-mensual/page.tsx`, calculado desde `order.created_at`). Al revisarlo de nuevo se encontró que usaba `new Date(o.created_at).getHours()`, que depende de la zona horaria del sistema operativo del navegador — exactamente el mismo riesgo que ya se había corregido para Préstamos (sección 24). Se cambió a una función `bogotaHour()` explícita con `Intl.DateTimeFormat({ timeZone: 'America/Bogota' })`, para que la franja horaria no varíe según la configuración del equipo desde el que se genera el reporte.

**Fecha editable en Registrar Venta**: confirmado contra `ui/venta_form.py` del software local — tiene un `campo_fecha` (`QDateEdit` con calendario, por defecto hoy pero editable a cualquier fecha), mientras que la hora siempre se captura real (`datetime.now()`) en `controllers/venta_controller.py` al momento de guardar, sin importar la fecha elegida — igual patrón que ya se usó en Préstamos. La nube no tenía nada de esto: ni el formulario tenía campo de fecha, ni la función `create_pos_sale` aceptaba una fecha (el `INSERT` de `orders` no incluía `created_at` en la lista de columnas, así que siempre usaba el `DEFAULT NOW()` de la tabla).

Cambios:
- Se extrajeron los helpers de zona horaria de Bogotá (antes duplicados solo en Préstamos) a `apps/web/src/lib/bogota-time.ts` (`bogotaDateStr`, `bogotaTimeStr`, `bogotaToISO`, `BOGOTA_TZ`), y se actualizó `prestamos/page.tsx` para importarlos en vez de definirlos localmente.
- `SaleSession` (Registrar Venta) ahora tiene un campo `saleDate` (por defecto hoy en Bogotá), con un input de fecha visible junto al título "Factura de venta" — no escondido en el panel colapsable de cliente, porque es una corrección que se necesita ver de un vistazo. Al enviar la venta, se combina `saleDate` con la hora real capturada en ese instante (`bogotaTimeStr(new Date())`) para construir `created_at`, igual que Préstamos.
- `saleSchema` en `apps/web/src/app/api/pos/sales/route.ts` ahora acepta `created_at` opcional, que se pasa como `p_created_at` a la función RPC.
- Nueva migración `supabase/migrations/00027_pos_sale_created_at.sql`: agrega `p_created_at TIMESTAMPTZ DEFAULT NULL` a `create_pos_sale` (mismo patrón de parámetro nuevo con `DEFAULT` al final ya usado en `00021`/`00025` para `p_force`) y lo incluye explícitamente en el `INSERT` de `orders` (`COALESCE(p_created_at, NOW())`) — antes esa columna nunca se mencionaba en el INSERT, así que siempre tomaba el valor por defecto de la tabla.
- Al terminar una venta con éxito, la pestaña se resetea a una `newSession()` nueva (fecha = hoy otra vez) — la fecha elegida es una corrección puntual, no una preferencia que deba persistir a la siguiente venta.

**⚠️ Pendiente manual**: aplicar `00027_pos_sale_created_at.sql` en el SQL Editor de Supabase antes de que la fecha elegida en Registrar Venta tenga efecto — sin la migración, la API igual funciona pero el parámetro `p_created_at` no existe en la función y Supabase devolvería un error (o, si `postgrest`/`supabase-js` ignora argumentos desconocidos según la versión, la fecha simplemente no se aplicaría). Aplicar en el mismo orden que las migraciones anteriores (00001-00026).

Verificado `tsc`/`eslint`/`vitest`/`npm run build`. Cambios comiteados localmente, sin push (pendiente de confirmación explícita, igual que la sección 27).

**Actualización 2026-07-24**: el usuario aplicó `00027_pos_sale_created_at.sql` en Supabase — la fecha editable de Registrar Venta ya tiene efecto en producción.

## 29. Auditoría completa de zona horaria: "hora"/"hoy" en todo el programa (2026-07-24)

El usuario pidió confirmar si el arreglo de zona horaria (hora explícita de Bogotá) se había hecho solo en 2 secciones o si el mismo problema aparecía en más partes del programa. Se hizo una búsqueda exhaustiva de todos los patrones de fecha/hora dependientes de la zona horaria del dispositivo o del servidor, y aparecieron **dos clases de bug relacionadas pero distintas**, en muchos más lugares de los que se habían corregido hasta ahora:

**Clase 1 — mostrar/agrupar por HORA del día sin zona horaria explícita** (`Date.getHours()`, `.toLocaleTimeString()` sin `timeZone`): ya corregido en Préstamos e Historial Mensual (secciones 24 y 28), pero **no** en:
- `admin/reportes/page.tsx` — cálculo de "horas pico" (mismo bug que Historial Mensual, nunca se replicó el fix ahí).
- `admin/inventario/page.tsx`, `admin/ventas-dia/page.tsx`, `admin/ventas/page.tsx` — columna "Hora" en movimientos/facturas/ventas del día.
- `api/pos/sales/export/route.ts` — columna "Hora" del Excel exportado. Este era el más grave de esta clase: corre **server-side** en el runtime de Vercel (normalmente UTC), así que el Excel exportado mostraba la hora **siempre** mal por 5 horas, sin depender de ningún dispositivo — no era condicional como los demás casos de esta clase (que solo fallan si el equipo del usuario no está configurado en hora de Colombia).

**Clase 2 — "hoy"/límites de rango de fecha construidos con `toISOString()` o naive `${date}T00:00:00`** (más grave y más extendida de lo esperado): `new Date().toISOString().split('T')[0]` da la fecha en **UTC**, no en Bogotá; y pasar `"${date}T00:00:00"` (sin offset) a un filtro sobre una columna `TIMESTAMPTZ` hace que Postgres lo interprete en la zona horaria de la **sesión del servidor** (UTC en Supabase por defecto) — como Bogotá es UTC-5, cualquiera de los dos patrones deja la ventana de "hoy" corrida 5 horas: entre las 7pm y la medianoche en Colombia, todavía no cae dentro de "hoy" en términos UTC. Encontrado en:
- **`admin/page.tsx` (Dashboard) — el más grave de todos**: es un *Server Component* (corre siempre en UTC en Vercel, sin depender de ningún dispositivo). "Ventas de hoy/semana/mes" llevaba mostrando la ventana equivocada todo este tiempo, agravado por un bug adicional de mutación encadenada del mismo objeto `Date` (`today.setHours(...)` → `today.setDate(...)` → `today.setDate(1)`, cada uno sobre el resultado ya modificado del anterior) que además calculaba mal el "inicio del mes" durante los primeros 7 días de cada mes.
- **`admin/ventas-dia/page.tsx`** — la fecha por defecto (`date` state) y el rango de la consulta de ventas (`from`/`to` enviados a `/api/pos/sales`): la página que se usa a diario para el cuadre de caja podía mostrarse vacía o incompleta en la noche.
- **`admin/ventas/page.tsx`** y **`admin/mi-cuadre/page.tsx`** — "ventas de hoy" construido con `setHours(0,0,0,0)` (medianoche del dispositivo, no de Bogotá explícita).
- **`api/pos/sales/export/route.ts`** — mismo rango naive para el Excel de un día específico.
- **`admin/historial-mensual/page.tsx`** y **`admin/reportes/page.tsx`** — agrupación de ventas por día (`created_at.split('T')[0]`, el día UTC crudo del timestamp) y límites de mes/rango.
- **`admin/rendimiento-vendedores/page.tsx`** + **`api/reports/seller-performance/route.ts`**, **`admin/cuentas/page.tsx`** + **`api/account-movements/route.ts`** — mismo patrón de rango naive.
- **`api/admin/session-alerts/route.ts`** — umbrales "en 7 días"/"en 3 días" para facturas/notas por vencer (menor severidad, solo corre server-side en UTC).
- Nombres de archivo con la fecha de hoy (`cierres`, `inventario`, respaldo Excel) — cosmético, corregido de paso por consistencia.
- `api/reports/sales/route.ts` — mismo bug de agrupación, pero es una ruta que **ningún** frontend consume actualmente (código muerto); se corrigió igual por si se usa en el futuro.

**Qué NO se tocó** (evaluado y descartado): `lib/alegra.ts` (aritmética de fechas consistente en UTC de punta a punta, sin mezclar con hora local — no hay bug real); `mi-cuadre`'s "Actualizado a las..." (autorreferencial, mismo instante/dispositivo, no hay comparación entre zonas horarias); construcción de límites de mes en Historial Mensual/Presupuesto que usaba `new Date(year, month-1, 1).toISOString()` (se corrigió de todas formas, ver abajo, aunque el riesgo real era bajo para dispositivos en Colombia).

**Cambios**:
- `lib/bogota-time.ts` ganó tres funciones nuevas: `bogotaHour(iso)` (hora 0-23 en Bogotá, reemplaza `Date.getHours()`), `formatBogotaTime(iso)` (formatea "HH:MM" en hora de Bogotá, reemplaza `.toLocaleTimeString()` sin `timeZone`), y `bogotaDayRange(dateStr)` (límites `{from, to}` de un día de Bogotá en UTC real, pensados para `.gte(from).lt(to)` — límite superior **exclusivo**, para no depender de la precisión de milisegundos de un `.lte()` a las 23:59:59).
- Los endpoints que reciben un `to` de tipo "límite superior exclusivo" (`/api/pos/sales`, `/api/reports/seller-performance`, `/api/account-movements`) cambiaron de `.lte()` a `.lt()` — solo tenían un caller cada uno, así que el cambio de semántica es seguro.
- `admin/page.tsx` (Dashboard): reescrito `getDashboardStats()`/`getVentasStats()` para calcular cada límite (hoy/semana/mes) de forma independiente con `bogotaToISO`, en vez de mutar el mismo objeto `Date` tres veces.
- Historial Mensual e Historial Mensual/Presupuesto: los límites de mes ahora se construyen con strings directos (`${year}-${month}-01`) en vez de `Date`/`toISOString()`, evitando cualquier dependencia de zona horaria para columnas `DATE` puras (`operating_expenses.date`).

Verificado `tsc`/`eslint`/`vitest`/`npm run build` en el barrido completo.

## 30. Bug: "Producto no encontrado o inactivo" al confirmar una venta en Registrar Venta (2026-07-27)

El usuario reportó (con capturas de la interfaz y de la pestaña Network de DevTools) que un producto sí aparecía en el buscador de Registrar Venta, se podía agregar al carrito y armar el pago, pero al darle "Confirmar venta" fallaba con `Producto no encontrado o inactivo: <uuid>`.

**Diagnóstico**: es una reaparición del mismo bug de la sección 21 (`active` solo debe controlar si un producto se muestra en la tienda online, no si se puede vender por mostrador), pero en un lugar distinto que no se tocó en esa corrección. `/api/pos/search` (usado para buscar/agregar productos al carrito) ya no filtraba por `active` desde la sección 21 — por eso el producto aparecía normal en la grilla. Pero `resolveSale()` en `lib/pos-sale.ts` (compartida por `POST /api/pos/sales` y `PUT /api/pos/sales/[id]`, se ejecuta al confirmar la venta) seguía validando `if (!product || !product.active) throw ...` — nunca se había corregido ahí. Resultado: cualquiera de los 190 productos migrados con `active=false` (sección 20, a propósito, para no publicarlos en la tienda online) se podía agregar al carrito pero jamás se podía vender, con un mensaje de error que además decía "inactivo" sin dar más contexto en la interfaz (el usuario solo veía el UUID, tuvo que abrir DevTools para copiarlo). Confirmado contra producción: el producto del reporte (`CANDADO DE ALARMA METALICO 70-60`) tiene `active: false` y `stock_qty: 18` — stock real, pero bloqueado solo por esa bandera.

**Cambio**: se quitó la validación de `active` en `resolveSale()` (`lib/pos-sale.ts`), dejando solo la validación de que el producto exista. Se confirmó que `resolveSale` únicamente la usan las dos rutas de POS (mostrador) — nunca el checkout de la tienda online — así que este cambio no afecta la validación de productos inactivos de cara al cliente público.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 31. Auditoría end-to-end del flujo de venta: crear → pagos combinados → stock → Ventas del Día/Historial → cancelar/editar (2026-07-27)

El usuario pidió recorrer todas las aristas del flujo de venta para confirmar que todo funciona bien de punta a punta: registrar con varios medios de pago (incluido combinado), que descuente el inventario correcto, que quede en Ventas del Día y en el Historial, y que cancelar/anular una venta deshaga *todo* — que el inventario "sume la cantidad que restó" y vuelva a la normalidad.

**Recorrido verificado (correcto, sin cambios)**:
- `create_pos_sale` (RPC): inserta la orden, por cada ítem valida y descuenta stock con bloqueo de fila (`FOR UPDATE`), inserta `order_items` y su `inventory_movement`; por cada pago inserta el `payment` y, si tiene cuenta asociada, acredita el saldo y registra el `account_movement` — todo en una sola transacción atómica.
- Pagos combinados: `resolveSale()` exige que la suma de los pagos coincida EXACTO con el total (ya sea un solo método o varios) antes de llamar al RPC — no hay forma de guardar una venta con pagos que no cuadren.
- Ventas del Día: trae las órdenes del día (sin filtrar por estado, para poder mostrar las canceladas aparte) y separa `activeSales` (`status !== 'cancelled'`) de `cancelledSales` — los totales de la página solo cuentan las activas.
- Historial Mensual y Dashboard: filtran `payment_status = 'paid'` — al cancelar una venta, `cancel_pos_sale` cambia `payment_status` a `'refunded'`, así que la venta cancelada queda excluida automáticamente de ambos sin necesitar ningún filtro adicional.
- `cancel_pos_sale`: por cada ítem restaura el stock y registra un `inventory_movement` tipo `'return'`; por cada pago con cuenta asociada, revierte el crédito con un `account_movement` tipo `'sale_reversal'` — simétrico a la creación.

**Bug real encontrado y corregido**: al forzar una venta con stock insuficiente (el diálogo "Stock insuficiente, ¿continuar de todas formas?"), el descuento real de stock queda en `GREATEST(0, stock_qty - qty)` — nunca baja de 0, igual que el software local (`MAX(0, cantidad - qty)`). Pero tanto el registro en `inventory_movements` como la reversión al cancelar/editar usaban el `qty` **pedido** en la venta, no el descuento **real** aplicado:

- Ejemplo: stock = 2, se fuerza una venta de 5 unidades → el stock real baja a 0 (se descontaron 2, no 5), pero `inventory_movements` registraba "-5" (el registro de auditoría ya quedaba mal), y si luego se cancelaba esa venta, el stock quedaba en `0 + 5 = 5` — 3 unidades más de las que había originalmente. Lo mismo aplicaba al editar la factura (`edit_pos_sale`), que primero revierte los ítems viejos con el mismo problema.
- Se revisó el historial real de movimientos en producción (`inventory_movements` tipo `sale`/`return` con `reference_type='order'`): solo hay 2 registros hasta ahora y ninguno tiene este problema — el volumen de ventas de mostrador reales todavía es bajo, así que no hizo falta ningún script de corrección retroactiva de inventario.

**Cambio**: migración `supabase/migrations/00028_pos_sale_stock_reversal_fix.sql` — agrega `order_items.stock_deducted` (cuánto se descontó REALMENTE del inventario al crear/editar esa línea; `NULL` para ítems fuera de catálogo que nunca tocan stock, y también `NULL` para filas históricas anteriores a la migración, donde se sigue usando `qty` como respaldo por no tener mejor información). `create_pos_sale`/`edit_pos_sale` ahora calculan `LEAST(qty, stock_actual)` y lo guardan ahí además de usarlo para el registro correcto en `inventory_movements`; `cancel_pos_sale` y el paso de reversión de `edit_pos_sale` restauran `COALESCE(stock_deducted, qty)` en vez de `qty` a secas — así el inventario queda exacto sin importar si la venta original se forzó con stock insuficiente o no.

**⚠️ Pendiente manual**: aplicar `00028_pos_sale_stock_reversal_fix.sql` en el SQL Editor de Supabase (mismo procedimiento que las migraciones anteriores).

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

**Actualización 2026-07-27**: el usuario aplicó `00028_pos_sale_stock_reversal_fix.sql` en Supabase — la reversión exacta de stock ya tiene efecto en producción.

## 32. Importación del backup del 27/07/2026 — delta desde la migración histórica (2026-07-27)

El usuario exportó un nuevo backup completo del software local (`YJBMOTOCOM_Historial_27_07_2026.xlsx`, 18 hojas) y pidió subir esa información a Supabase para que quedara "al día y corroborada".

**Verificación previa (antes de tocar nada)**: se confirmó con el usuario que, desde la migración histórica del 22/07 (sección 19), toda la operación real se siguió registrando únicamente en el software local — la única orden en Supabase que no viene de esa migración (`YJBM-20260725-0306`) es una venta de prueba de $85.000 ya cancelada (usada para probar el fix de "producto inactivo" de esta misma sesión). Esto permitió tratar la importación como un "delta" simple, sin riesgo de chocar con actividad real hecha directamente en la nube.

**Diff hoja por hoja** entre el Excel del 22/07 (aún presente sin trackear en la raíz del repo) y el del 27/07: 10 líneas de venta nuevas (facturas 68-76), 13 préstamos nuevos + 5 con cambio de estado, 1 factura de proveedor nueva + 3 con cambio de estado (pendiente→pagada), 18 movimientos de cuenta nuevos (ID 197-214) y 7 movimientos de inventario nuevos — el resto de hojas (Notas, Gastos, Configuración, Usuarios, Presupuesto, Cierres Cuentas, Fiado, Abonos, Abonos Fiado, Facturas Items) sin cambios. Log Auditoría excluido, misma decisión que la sección 19.

**Script**: `migrate-delta-27-07.js` (scratchpad de la sesión, no versionado — datos reales del negocio), mismo patrón que `migrate-historial.js`: dry-run por defecto, `--write` para aplicar. Ventas/Préstamos/Facturas nuevas se insertaron como registros históricos con su fecha/hora original, sin pasar por las funciones RPC en vivo; Inventario/Cuentas se trataron como "foto del presente" (se sobreescribió `stock_qty`/`cost_cents` por `barcode` y `balance_cents` por nombre de cuenta); Mov. Cuentas/Mov. Inventario se insertaron como bitácora pura. Numeración continuada: `HIST-000068` a `HIST-000076`.

**Bug encontrado en el dry-run antes de escribir**: el script leía la columna "Cantidad nueva" de la hoja Mov. Inventario en vez de "Cambio" (el delta real con signo) — habría insertado movimientos de inventario con la cantidad equivocada (ej. `cambio=0` en vez de `-1`). Corregido antes de correr `--write`.

**Resultado verificado contra Supabase** (consultas directas, no solo el reporte del script): 714 órdenes (+9), 780 ítems de venta (+10), 760 pagos (+10, incluye el pago combinado Efectivo+QR de HIST-000074), 171 préstamos (+13, 5 actualizados), 42 facturas de proveedor (+1, 3 actualizadas con `paid_at`/`account_id` cuando la hoja traía cuenta de pago), los 6 saldos de cuentas exactos al Excel, y el stock de varios productos verificado por muestreo (ej. "PIJAMA SIN MALETERO 85-75": `stock_qty=1`, `cost_cents=4.500.000`, igual al Excel).

**Nota — duplicado cosmético en el registro de movimientos de inventario**: `inventory_movements` quedó con 211 filas (195 + 16), no 202 como se esperaba al mirar solo la hoja Mov. Inventario (+7) — los otros 9 vienen de las nuevas órdenes de Ventas (cada ítem con producto real matcheado genera su propio movimiento tipo `sale`). Para varios de los mismos productos/fechas, esto significa que el historial de "Movimientos" en Inventario mostrará **dos** filas para la misma venta física (una desde la orden, otra desde la bitácora del local) — no se intentó deduplicar por el riesgo de borrar la fila equivocada dado que algunos ítems (ej. "MONTADO") comparten código de barras con el producto base. Esto es solo cosmético: no afecta `stock_qty` ni `balance_cents` (ambos son la "foto" final, verificados exactos contra el Excel), solo duplica una línea de auditoría visual en la pestaña Movimientos para ~7-9 productos de esta tanda.

No se tocó ningún archivo del repo (solo datos en Supabase) salvo esta entrada de documentación.

## 33. Bug: Stock del producto en Detalle no sumaba las variantes/tallas (2026-07-27)

El usuario reportó, con captura, que "IMPERMEABLE SILICONADO NEGRO GRIS" en la pestaña Detalle de Inventario mostraba `0 / mín 5` en la columna Stock, pero al desplegar sus tallas, la variante XL sí tenía 1 unidad — la columna debería sumar el stock de todas las tallas, no mostrar 0.

**Diagnóstico**: cuando un producto tiene variantes por talla, el stock real vive en `product_variants.stock_qty` — el `products.stock_qty` del producto base se queda sin usar (en 0). Este cuidado ya estaba resuelto correctamente en `fetchInventoryValue` y `fetchCategoryRollup` (ambas suman por variante si el producto las tiene), pero `fetchProducts` — la función que llena la tabla principal de la pestaña Detalle — nunca se corrigió y seguía usando `products.stock_qty` tal cual, sin sumar variantes.

**Cambio**: `fetchProducts` (`apps/web/src/app/admin/inventario/page.tsx`) ahora trae también `product_variants(product_id, stock_qty)` y, si el producto tiene variantes, usa la suma de sus `stock_qty` en vez del `stock_qty` del producto base — mismo patrón ya usado en `fetchCategoryRollup`. Esto corrige de paso, sin cambios adicionales, el filtro y el conteo de "stock bajo" y el badge "Sin stock"/"Bajo" de la tabla principal, que leen del mismo estado `products`.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 34. Bug: no se podía buscar un producto por el código de barras de una talla (2026-07-27)

El usuario reportó que buscar por el código de barras de la talla M de "CHAQUETA CORTAVIENTO REFLECTIVO GRIS/NEGRO" (`1303001023`) en Detalle de Inventario no encontraba nada.

**Diagnóstico**: el buscador de esa tabla (`filteredProducts`) solo comparaba contra `product.title` y `product.sku` — nunca contra ningún código de barras. Además, cuando un producto tiene variantes por talla, `products.barcode` queda en `null` (el código de barras real vive en `product_variants.barcode`, uno por talla) — confirmado contra producción: la CHAQUETA tiene `barcode: null` a nivel de producto, con 5 variantes cada una con su propio código (`1303001023` es exactamente el de la talla M).

**Cambio**: `fetchProducts` ahora también trae `product_variants(product_id, stock_qty, barcode)` (aprovechando la misma consulta agregada en la sección 33) y guarda la lista de códigos de barras de las variantes de cada producto (`variantBarcodes`). `filteredProducts` ahora compara la búsqueda contra `product.barcode` **y** contra cualquiera de `product.variantBarcodes` — así que buscar el código de una talla específica encuentra el producto correcto sin importar que el código no esté en el producto base. Placeholder del buscador actualizado a "Buscar por nombre, SKU o código de barras...".

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 35. Escaneo de código de barras: confirmado en Registrar Venta + bug real corregido en la API compartida (2026-07-27)

El usuario, tras el fix de la sección 34, pidió confirmar que escanear un código de barras con el lector también funciona en Registrar Venta (y en cualquier otro lugar donde haga falta), ya que ahí la idea es escanear directo y que busque el producto.

**Lo que ya existía**: Registrar Venta (`admin/ventas/page.tsx`) ya tenía un flujo de escaneo dedicado — `handleBarcodeEnter` detecta la tecla Enter que manda el lector USB al terminar de leer, y llama a `/api/pos/search?barcode=...` (búsqueda exacta), igual que el software local. Este flujo nunca se había construido desde cero para este pedido; ya estaba ahí.

**Bug real encontrado al verificarlo**: `/api/pos/search?barcode=` solo buscaba en `product_variants.barcode` — funciona para productos con tallas (el código vive por variante), pero para los ~71 productos migrados **sin tallas** (sección 20), el código de barras vive directamente en `products.barcode`, y esa ruta nunca lo consultaba. Escanear el código de uno de esos 71 productos en Registrar Venta no encontraba nada. Confirmado contra producción con "PIJAMA SIN MALETERO 85-75" (código `1003002010`, sin variantes): la ruta original devolvía `data: []`.

**Otros consumidores de `/api/pos/search`** revisados (Calculadora, Inventario › Cambios, Préstamos, edición de factura en Ventas del Día): ninguno tiene un lector dedicado por Enter como Registrar Venta, pero todos comparten la búsqueda de texto (`?q=`), que tenía el mismo problema de fondo que ya se corrigió en Inventario (sección 34): el filtro solo comparaba contra `products.barcode`, nunca contra el código de las variantes.

**Cambios en `apps/web/src/app/api/pos/search/route.ts`**:
- El camino `?barcode=` (escaneo exacto) ahora, si no encuentra la variante, busca también en `products.barcode` directamente — cubre tanto productos con tallas como sin tallas.
- El camino `?q=` (búsqueda de texto, la que usan Calculadora/Préstamos/Cambios/Ventas del Día) ahora también resuelve productos por código de barras de sus variantes (`product_variants.barcode ilike`), agregando sus `product_id` al filtro `OR` — así que escribir o pegar el código de una talla específica encuentra el producto en cualquiera de esas pantallas, no solo en Registrar Venta.

**Verificado con datos reales de producción** (sin pasar por HTTP, replicando la lógica de la ruta directamente contra Supabase): escanear `1003002010` (PIJAMA, sin variantes) ahora resuelve por el fallback a `products.barcode`; buscar `1303001023` (talla M de la chaqueta) ahora resuelve "CHAQUETA CORTAVIENTO REFLECTIVO GRIS/NEGRO" por el nuevo filtro de variantes.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 36. Generar código de barras para productos sin uno + bug real: el PUT de productos nunca guardaba `barcode` (2026-07-27)

El usuario preguntó por qué algunos productos (ej. "PORTA CELULAR MANUBRIO 40-35") no tienen código de barras y si se podía generar uno siguiendo la misma lógica de categoría que ya usan los demás, sin que choque con otros códigos. También notó que, para un producto sin tallas, el código de barras no se veía en ningún lado del panel expandido — solo aparecía si abrías el editor con el lápiz.

**Diagnóstico de "por qué le falta"**: confirmado contra producción — son exactamente 4 productos (`Casco Integral Pro Racing`, `Guantes Touring Premium`, `Chaqueta Moto Adventure`, `Candado Alarma Premium`, con SKU `CASCO-001`/`GUANTE-001`/`CHAQ-001`/`ACC-001`), los 4 productos **de demo** que ya existían antes de la migración real del historial (sección 19) — nunca pasaron por el software local, así que nunca recibieron un código con la lógica de categoría. Los 190 productos reales migrados sí la tienen. "PORTA CELULAR MANUBRIO 40-35" resultó ser otro caso del mismo tipo.

**Bug real encontrado al implementar el botón de generar**: `productSchema` (`lib/validations/product.ts`), usado por `PUT /api/products/[id]`, **nunca tuvo `barcode` como campo** — `productSchema.parse(body)` lo descartaba en silencio en cada actualización. Esto significa que el campo "Código de barras" del editor inline de producto en Detalle (construido en la sección 20) llevaba desde entonces sin guardar nada — la interfaz no mostraba error, pero el valor nunca se persistía. Confirmado revisando el schema y la ruta directamente: no había ninguna otra referencia a `barcode` en `/api/products/route.ts` ni en `/api/products/[id]/route.ts`. El `POST` de creación no se veía afectado (inserta `...body` directo, sin validar con este schema).

**Cambios**:
- `productSchema` ahora incluye `barcode: z.string().optional().nullable()` — corrige de raíz que el editor inline de producto (y cualquier otro consumidor de esta ruta) pueda guardar el código de barras.
- `apps/web/src/app/admin/inventario/page.tsx`: botón "Generar" (ícono de refrescar) junto al campo de código de barras del editor de producto, que llama a `generarCodigoBarrasAuto` (la misma función ya usada en "Ingresar") contra la lista completa de códigos ya usados en el catálogo (`codigosExistentesGlobal`, construida a partir de `product.barcode` + `product.variantBarcodes` de todos los productos ya cargados) — nunca repite un código existente.
- El panel expandido de un producto sin tallas ahora muestra su código de barras (o "Sin código de barras" + un botón "Generar código de barras" que guarda directo, sin necesidad de abrir el editor) — resuelve la queja de visibilidad: antes no había ningún lugar donde ver ese código sin entrar al modo edición.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 37. Sondeo completo de códigos de barras faltantes + asignación (2026-07-27)

El usuario pidió un sondeo completo de todo el catálogo y asignar de una vez, con la lógica de categoría, el código de barras a todo lo que le faltara — mencionó explícitamente "CAR-PLAY FEARLESS M11" y "MALETA PORTA CASCO TIPO TELA" como ejemplos que seguía viendo sin código, y la sensación de que eran "un montón".

**Sondeo completo** (194 productos, todas sus variantes): solo los mismos **4 productos** de la sección 36 (los de demo: `Casco Integral Pro Racing`, `Guantes Touring Premium`, `Chaqueta Moto Adventure`, `Candado Alarma Premium`) no tenían código de barras en ningún lado — ni un solo producto con tallas tiene alguna variante sin código. Es decir, no había "un montón" adicional.

**Qué pasaba con CAR-PLAY y MALETA PORTA CASCO TIPO TELA**: al revisarlos directamente contra la base de datos, **sí tienen** código de barras (`1801003010` y `1006005010` respectivamente) — el problema no era de datos sino de la interfaz: el cambio de la sección 36 (mostrar el código en el panel expandido de un producto sin tallas) todavía no se había subido a producción cuando el usuario lo revisó, así que el sitio en vivo seguía sin mostrar el código ahí, tuviera valor o no. Al hacer push de esa sección, este síntoma desaparece por sí solo.

**Asignación**: se generó y guardó directamente en Supabase (mismo algoritmo que `generarCodigoBarrasAuto`/`detectarCategoria`, reimplementado idéntico en un script de una sola corrida, sin librerías nuevas) un código para los 4 productos restantes:
- Casco Integral Pro Racing → `1106013010` (categoría 11=Casco)
- Guantes Touring Premium → `1504002010` (categoría 15=Guante)
- Chaqueta Moto Adventure → `1301008010` (categoría 13=Chaqueta)
- Candado Alarma Premium → `1006012010` (categoría 10=Accesorios — "candado" no es una palabra clave reconocida, cae al valor por defecto)

**Verificación de integralidad**: se confirmó, revisando los 760 códigos de barras existentes en `products` + `product_variants` juntos, que no quedó ningún duplicado tras la asignación, y que ya no queda ningún producto simple (sin tallas) sin código de barras. No se tocó ninguna otra tabla ni columna — el `updated_at` de estos productos ya se había actualizado antes por el snapshot de Inventario de la sección 32 (migración del 27/07), sin relación con este cambio.

## 38. Notas y Pendientes: tercera pestaña "Pendientes Generales Admin", exclusiva de admin (2026-07-28)

El usuario pidió una tercera pestaña en Notas y Pendientes (junto a "Por Pedir / Resurtido" y "Tareas Operativas"), con el mismo checklist, pero **solo visible para admin** — el vendedor no debe verla ni tocarla, para notas administrativas que no le competen (ej. contratos, arriendo, temas que solo le interesan al dueño del negocio).

**Decisión de diseño**: no bastaba con ocultar la pestaña en la interfaz — si solo fuera un filtro visual, un vendedor con las herramientas del navegador podría seguir pidiendo `/api/notes` directamente y ver estas notas igual, porque la política RLS de `notes` (`"Admins and sellers can manage notes" FOR ALL`) le daba acceso total a cualquier fila sin distinguir tipo. Se reforzó a nivel de base de datos, no solo en el cliente.

**Cambios**:
- Migración `supabase/migrations/00029_admin_only_notes.sql`: se amplía el `CHECK` de `notes.type` para aceptar `'admin_task'` (nunca se restringe, mismo patrón que `00020_nu_qr_payment_methods.sql`), y se reemplaza la única política RLS por dos: una para admin (acceso total) y otra para vendedor que excluye explícitamente `type = 'admin_task'` — un vendedor autenticado simplemente no puede ver, crear, editar ni borrar esas filas, sin importar por dónde intente acceder.
- `api/notes/route.ts`: el schema de creación ahora acepta `'admin_task'` como tipo válido (la propia RLS es la que impide que alguien sin rol admin logre crear una).
- `admin/notas/page.tsx`: tercera pestaña "Pendientes Generales Admin" (ícono de escudo), renderizada condicionalmente solo cuando `userProfile.role === 'admin'` — mismo checklist, urgencia por fecha límite y contador que ya tienen las otras dos pestañas, sin duplicar ninguna lógica.

**⚠️ Pendiente manual**: aplicar `00029_admin_only_notes.sql` en el SQL Editor de Supabase antes de que la nueva pestaña funcione — sin la migración, `notes.type = 'admin_task'` sería rechazado por el CHECK actual.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

**Actualización 2026-07-28**: el usuario aplicó `00029_admin_only_notes.sql` en Supabase — la pestaña "Pendientes Generales Admin" ya tiene efecto en producción.

## 39. Historial Mensual: "Ventas por día" ordenado del más reciente al más antiguo (2026-07-28)

El usuario notó que la lista "Ventas por día" de Historial Mensual estaba ordenada del primer día del mes al último, así que para ver el día actual (normalmente el último del mes en curso) había que hacer scroll hasta abajo — pidió invertir el orden para que el día más reciente aparezca primero.

**Cuidado al implementarlo**: `dailyArray` (ordenado ascendente por fecha) no solo alimenta esa lista en pantalla — también lo usa el reporte PDF exportable (sección 27): la gráfica de "Ingresos Diarios" espera leerse de izquierda a derecha en orden cronológico, y "Tendencia de Ganancia Neta (Últimos 7 días)" usa `dailyArray.slice(-7)` para tomar los 7 más recientes, algo que dejaría de funcionar (tomaría los 7 más *antiguos*) si `dailyArray` se invertía globalmente.

**Cambio**: se dejó `dailyArray` intacto (sigue ascendente, para no romper el PDF) y se agregó `dailyArrayDesc = [...dailyArray].reverse()`, usado únicamente por la lista "Ventas por día" en pantalla (`apps/web/src/app/admin/historial-mensual/page.tsx`). El reporte PDF exportable no cambia de comportamiento.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 40. Historial Mensual: marcar en rojo los días sin ninguna venta (2026-07-28)

El usuario notó que un día sin ventas (porque no se abrió, o porque el día estuvo difícil) simplemente no aparecía en "Ventas por día" — pidió mostrarlo en rojo como "no hubo venta" y agregar un apartado con el conteo de esos días, revisando además dónde más repercutía este mismo problema.

**Diagnóstico**: `dailyMap` solo se poblaba a partir de los días con órdenes reales, más los días con algún gasto operativo registrado (para que también contaran en el resumen) — un día sin ventas Y sin gastos quedaba completamente ausente de `dailyArray`, no solo "sin badge". No es lo mismo que "Negativo" (que implica que sí hubo ventas, pero con pérdida) — el usuario pidió una tercera categoría separada.

**Cambio** (`apps/web/src/app/admin/historial-mensual/page.tsx`): se rellena `dailyMap` con cada día del mes desde el 1 hasta hoy (en hora de Bogotá — nunca días futuros, que obviamente aún no han pasado), y cada día calcula `sinVenta = unidades vendidas === 0`. Repercusiones que se revisaron y ajustaron para no dañar nada:
- **"Días trabajados"** (KPI del PDF): antes contaba `dailyArray.length`, que ahora incluiría también los días sin venta recién agregados — se cambió a contar solo los días con venta real (`diasConVenta.length`), igual que el software local (`dias_con_ventas` cuenta días con actividad, no días de calendario).
- **"Días positivos / negativos"**: se recalculan excluyendo los días sin venta (antes un día sin venta ni gasto ni existía; un día sin venta pero con gasto se contaba como "Negativo", mezclado con los días que sí vendieron y perdieron plata).
- **"Día más rentable"**: se calcula solo entre días con venta real, para que un día sin ninguna venta (ganancia neta = 0) no gane por accidente si todos los días reales del mes dieron pérdida.
- **Nueva tarjeta "Días sin venta"** junto a "Días positivos / negativos" (grid ajustado a 5 columnas), en rojo si el conteo es mayor a 0.
- El badge de la lista "Ventas por día" y la columna "ESTADO" del reporte PDF exportable ahora muestran "Sin venta" (rojo) en vez de "Negativo" para esos días.
- Efecto colateral positivo (sin cambios de código adicionales): la gráfica "Tendencia de Ganancia Neta (Últimos 7 días)" del PDF, que toma `dailyArray.slice(-7)`, antes podía saltarse silenciosamente un día sin actividad y mostrar menos de 7 días reales o días no consecutivos — ahora siempre muestra exactamente los últimos 7 días de calendario, incluidos los de "sin venta".

**Dónde más repercutía (revisado, no modificado por ahora)**: Reportes (`admin/reportes/page.tsx`) tiene el mismo patrón de "Resumen diario" con Positivo/Negativo por día, con el mismo hueco de fondo (días sin órdenes no aparecen). No se replicó el fix ahí en esta misma pasada porque esa página corta todo el cálculo por completo cuando el rango no tiene ninguna orden (`if (orders.length > 0) {...} else { todo vacío }`) — extenderlo ahí exige reestructurar ese flujo (top productos, métodos de pago, horas pico dependen de la misma rama), un cambio más amplio que el usuario no pidió explícitamente. Queda identificado como pendiente a decisión del usuario.

**Verificado con datos reales de producción** (sin pasar por HTTP): para julio 2026 hasta hoy (28/07), se identificaron 6 días sin ninguna venta (10, 12, 19, 23, 27 y 28 de julio).

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 41. Reportes: mismo fix de "días sin venta" que Historial Mensual (2026-07-28)

El usuario pidió extender a Reportes el mismo fix de la sección 40 (el hueco que se dejó pendiente explícitamente), y confirmar que los días sin venta "entren a las estadísticas" — no solo se vean, sino que cuenten en los cálculos.

**Por qué era más delicado que en Historial Mensual**: `fetchReports` cortaba todo el procesamiento con `if (orders.length > 0) { ... } else { limpiar todo a vacío }` — top productos, método más usado, horas pico, comisión por método y el resumen diario dependían de esa misma rama. Había que quitar ese corte sin romper ninguno de esos cálculos.

**Cambio** (`apps/web/src/app/admin/reportes/page.tsx`):
- Se quitó el `if (orders.length > 0) / else`: todo el bloque corre siempre. No hacía falta el `else` porque cada cálculo ya era seguro sobre un array vacío (`Object.entries({})`, `.reduce(..., 0)`, `avgOrder` ya se guardaba con `? :`) — el único motivo real para el corte era evitar procesar cuando no había nada, no una necesidad de corrección.
- Se agregó el mismo relleno día por día que en Historial Mensual, ahora sobre el rango `dateFrom`–`dateTo` elegido por el usuario (recortado a hoy en hora de Bogotá si `dateTo` cae en el futuro) — cada día sin ninguna orden queda en `dailySales` con ceros en vez de desaparecer.
- `dailyProfit` ahora incluye `sinVenta` (sin ninguna orden ese día). "Día más rentable" se calcula excluyendo esos días (mismo cuidado que `diaMasRentable` en Historial Mensual). Nueva tarjeta "Días sin venta" en el grid de KPIs de admin (ajustado a `lg:grid-cols-6`). La tabla "Resumen diario" muestra "Sin venta" (rojo) en vez de "Negativo" para esos días.
- Repercusión positiva sin cambios de código: "Ventas Diarias" (gráfica) y el CSV exportado ahora también muestran los días sin venta explícitamente, en vez de saltárselos.

**Verificado con datos reales de producción**: para el rango por defecto (últimos 30 días, 28/06 al 28/07), se detectan 25 días con venta real y 6 días sin venta — coincide con los mismos días encontrados en Historial Mensual para julio.

Verificado `tsc`/`eslint`/`vitest`/`npm run build`.

## 42. Bug real de datos: `cost_cents = 0` en 769 de 780 líneas de venta migradas — Ganancia Neta/Utilidad Real desfasadas en Historial Mensual y Reportes (2026-07-28)

El usuario mostró dos capturas (software local vs. nube) del Historial Mensual de julio 2026 con el mismo ingreso ($13.195.500) pero Ganancia Neta y Utilidad Real muy distintas ($4.2M local vs $12.6M nube; -$1.3M local vs +$7.1M nube), y pidió analizar a fondo si era un bug del software desplegado, un error de cálculo, o un problema del local.

**Diagnóstico**: la fórmula de Ganancia Neta/Utilidad Real en la nube es correcta y usa exactamente el mismo criterio que el local (`ingreso - costo`). El problema es de datos, no de fórmula: la migración histórica original (sección 19, 22/07) insertó **769 de 780 `order_items` (98.6%) con `cost_cents = 0`**, porque el script de migración de esa vez no traía el costo desde el Excel para las líneas de `Ventas`. Consulta directa a Supabase confirmó: `order_items` con `cost_cents = 0`: 769; de esos, **412 (53%) además sin `product_id`** (nunca quedaron enlazados a un producto del catálogo).

Para julio, esto se verificó numéricamente contra producción antes de tocar nada: ingreso $13.195.500, costo (con el bug) $583.000 → Ganancia Neta $12.612.500 — coincide exactamente con lo que mostraba la nube en la captura del usuario.

**Fuente de verdad usada para reparar**: el usuario reexportó un Excel fresco del software local (`YJBMOTOCOM_Historial_27_07_2026 (1).xlsx`, 780 filas en Ventas) y aclaró una instrucción importante para este arreglo: **las cantidades de inventario actuales en la nube son las correctas** (las ha venido actualizando directo ahí), no las del Excel — este arreglo es exclusivamente sobre `cost_cents` (y, cuando aplicara, el enlace a producto), nunca sobre `stock_qty`.

**Script de reparación** (`fix-cost-and-links.js`, guardado en el scratchpad de la sesión, no en el repo — mismo criterio que otros scripts de un solo uso sobre datos reales):
- Empareja cada `order_item` con `cost_cents = 0` contra una fila de la hoja `Ventas` del Excel nuevo, por clave compuesta: fecha Bogotá + hora exacta (nivel 1) o solo fecha (nivel 2, respaldo) + título de producto exacto + talla normalizada + cantidad + precio unitario — cada fila del Excel se marca `used` para no reutilizarla en un segundo match.
- Actualiza `cost_cents` con el costo real del Excel. Si el `order_item` no tenía `product_id`, intenta reenlazarlo (por código de barras de la fila del Excel primero, si no por título exacto contra el catálogo actual) — sin tocar `stock_qty` en ningún punto del script.
- Dry-run: **769/769 emparejados, 0 sin emparejar** — el arreglo de costo es 100% preciso. Reenlace de producto: solo 14/412 (ver limitación abajo).
- Ejecutado con `--write` tras validar con el usuario.

**Verificación post-escritura contra Supabase** (no solo el log del script):
- Julio: ingreso $13.195.500, costo corregido $8.993.265 → **Ganancia Neta $4.202.235** — coincide casi al peso con el software local.
- `order_items` con `cost_cents = 0` restantes: 62 (bajó de 769) — estos son legítimos: el Excel también trae costo 0 para esas líneas (ej. artículos sin costo registrado en el local), no es un resto del bug.
- `order_items` sin `product_id`: 399 (bajó de 412; 14 se reenlazaron con éxito vía código de barras/título exacto).

**Limitación conocida, explicada al usuario y aceptada**: de los 412 `order_items` huérfanos originales, solo 14 se pudieron reenlazar a un producto real del catálogo. Se investigó por qué: **0 de los 398 restantes tiene un título que exista tal cual (ni siquiera ignorando mayúsculas) en el catálogo actual de 194 productos** — ejemplos: "GUANTES FOX NEGRO TALLA XL", "PARRILLA HUNK 125", "MECANISMO DE CASCO". Son casi con certeza productos que se agotaron y nunca se reabastecieron/catalogaron formalmente, o que luego se renombraron — la migración original solo creó filas de `products` a partir de lo que seguía en la hoja Inventario en ese momento. Reenlazarlos requeriría *fuzzy matching* (riesgo real de enlaces incorrectos) o crear productos placeholder en el catálogo real solo para ventas históricas puntuales — se decidió NO hacerlo. Estos 399 items quedan con costo correcto pero sin producto vinculado, igual que la convención ya existente de "producto fuera de catálogo" — afecta solo el detalle de "Top Productos"/rentabilidad por producto en Reportes, **no** afecta Ganancia Neta ni Utilidad Real (que ya suman correctamente sin importar si el item tiene `product_id`).

**Pendiente, explícitamente fuera de este arreglo** (no se tocó en esta sesión): el pequeño delta adicional que trae el Excel del 27/07 sobre el ya importado en la sección 32 (1 venta nueva factura 77 "PASAMONTAÑAS LYCRADO", +1 Mov. Cuentas, +1 Mov. Inventario) — pendiente de importar siguiendo el mismo proceso de la sección 32, con la salvedad explícita de **no** sobreescribir `stock_qty`/saldos de Inventario/Cuentas esta vez. (Importado en la sección 43.)

## 43. Delta 27/07→28/07: 1 venta nueva + 3 préstamos devueltos (2026-07-28)

Continuación directa de la sección 42: se importó el pequeño delta que quedaba pendiente del Excel `YJBMOTOCOM_Historial_27_07_2026 (1).xlsx` frente a lo ya migrado en la sección 32 (que llegaba hasta `HIST-000076`).

**Diff hecho antes de escribir nada** (mismo rigor que siempre — consulta directa a Supabase, no solo lectura del Excel):
- **Ventas**: máxima factura en el Excel = 77 ("PASAMONTAÑAS LYCRADO", 27/07/2026 18:42, Efectivo, costo $6.000, precio $15.000, vendedora Sindy Katherine); `HIST-000077` no existía en Supabase.
- **Cuentas**: comparando las 6 cuentas del Excel contra `accounts.balance_cents` actual, 5 coincidían exactamente y solo Efectivo tenía una diferencia de **+$15.000** — exactamente el monto de la venta nueva. Esto confirma que los saldos de cuentas (a diferencia del inventario) no se han tocado manualmente en la nube desde la migración anterior, así que ajustarlo es un simple "ponerse al día", no una sobreescritura arriesgada.
- **Préstamos**: 171 filas en ambos lados, pero por estado: Excel (pendiente 6 / devuelto 122 / cobrado 43) vs Supabase (pending 9 / returned 119 / charged 43). Diff por clave natural (fecha+hora+producto+almacén) encontró exactamente 3 préstamos que pasaron de `pending` a `returned` en el local sin reflejarse aún en la nube.
- **Facturas (proveedores)**: 42 filas y mismo conteo por estado (pending 3 / paid 39) en ambos lados — sin cambios, nada que hacer.

**Cambios aplicados** (script de un solo uso `import-delta-28-07.js`, scratchpad, dry-run revisado antes de `--write`):
- Insertada la orden `HIST-000077` + su `order_item` (enlazado a `product_id` real vía el SKU/código de barras de la fila del Excel) + `payment` (Efectivo).
- Insertado el `account_movement` correspondiente (tipo `sale`, $15.000, mismo patrón que la migración anterior: fecha a las 12:00 hora Bogotá porque la hoja "Mov. Cuentas" no trae columna de hora) y actualizado `accounts.balance_cents` de Efectivo: $3.006.000 → $3.021.000 (coincide exactamente con el Excel).
- Insertado el `inventory_movement` de la venta (tipo `sale`, qty -1, referenciando la nueva orden) **como registro histórico puro — sin tocar `stock_qty`** del producto ni de ninguna variante, por instrucción explícita del usuario (las cantidades actuales en la nube son la fuente de verdad, no las del Excel).
- Actualizados los 3 préstamos de `pending` a `returned` por `id`.

**Verificado contra Supabase tras escribir** (no solo el log del script): la orden, el item, el pago, el saldo de Efectivo (exacto), el `inventory_movement` con su `reference_id` apuntando a la orden nueva, y los 3 préstamos con `status: returned`. Las 6 cuentas quedaron idénticas al Excel. `stock_qty` no se tocó en ningún punto.

## 44. Bug real: "Top 10 Productos" y "Rentabilidad por producto" de Historial Mensual mezclaban productos distintos bajo un solo nombre (2026-07-28)

El usuario vio en Historial Mensual un producto "MECANISMO DE CASCO" con 15 unidades y $1.535.000, pero ese producto no existe en Inventario, y preguntó de dónde salían esas cifras.

**Causa**: `productMap` en `historial-mensual/page.tsx` agrupaba las ventas por `item.product_id`. Los `order_items` huérfanos de la migración histórica (sección 42 — productos descontinuados que ya no están en el catálogo actual) tienen `product_id = null`, y en JavaScript `acc[null]` usa la misma clave `"null"` para todos ellos, así que se sumaban entre sí y se mostraban bajo el título del primero que apareciera en la iteración. Verificado contra Supabase: julio tiene exactamente 15 `order_items` con `product_id IS NULL`, sumando 15 unidades y $1.535.000 — coincide al peso con lo que mostraba la pantalla — y el primero de esos 15 (por orden cronológico) es justo "MECANISMO DE CASCO". Los otros 14 (Visor de casco, Sudadera impermeable, Canilleras, Guantes Fox, etc.) quedaban invisibles, sumados ahí sin mostrarse.

Reportes (`reportes/page.tsx`) ya tenía el filtro correcto (`if (item.product_id) { ... }`, línea ~133) y no sufre este bug — solo Historial Mensual carecía de él.

**Cambio** (`apps/web/src/app/admin/historial-mensual/page.tsx`): se agregó `if (!item.product_id) return` al inicio del `forEach` de `productMap`, igual que ya hace Reportes — los ítems sin producto vinculado se excluyen de "Top 10 Productos" y "Rentabilidad por producto" (ambas tablas comparten el mismo `productMap`) en vez de mezclarse entre sí. No afecta Ganancia Neta/Utilidad Real del mes, que se calculan sobre `orders`/`dailyArray`, no sobre `productMap`.

**Verificado**: recalculando el Top 10 de julio sin los huérfanos, el resultado son 10 productos reales del catálogo (CASCO LS2 STREAM 808, INTERCOMUNICADOR Y10, CASCO SHATF MULTIPROPOSITO MX360, etc.), cada uno con su propia cifra. `tsc --noEmit` limpio.

## 45. Auditoría por fases (Fase 1) + bug crítico: la tienda online no vendía productos con tallas (2026-07-29)

El usuario pidió una revisión integral del proyecto por fases (comprensión profunda + caza de bugs + propuestas de mejora), empezando por re-auditar los módulos admin ya cubiertos en las secciones 11-16, buscando específicamente efectos secundarios de los cambios recientes (fix de `cost_cents=0` de la sección 42, códigos de barra de las secciones 33-37, zona horaria, "días sin venta" de las secciones 40-41, `product_id` null de la sección 44, suma de stock por variantes de la sección 33) que no se hubieran propagado a todos los lugares que dependen del mismo dato.

**Hallazgo crítico**: el fix de la sección 33 (sumar `product_variants.stock_qty` porque `products.stock_qty` queda en 0 para cualquier producto con tallas) solo se aplicó en la pestaña Detalle de Inventario — nunca se propagó a:
- **Toda la tienda pública** (`components/products/product-card.tsx`, usado en inicio/categoría/productos/ofertas/buscar/favoritos/comparar; `(shop)/producto/[slug]/page.tsx`; `(shop)/producto/[slug]/add-to-cart-button.tsx`; el filtro "En stock" de `(shop)/productos/page.tsx`): cualquier producto con tallas (una parte grande del catálogo real migrado) se mostraba "Agotado", con los botones de compra deshabilitados, y quedaba excluido del filtro "En stock". Confirmado que `product_variants` no se referenciaba en ningún archivo de `(shop)/` ni de `components/products/` antes de este fix — el modelo de variantes construido para el panel admin/POS nunca llegó a la tienda de cara al cliente.
- `admin/productos/page.tsx` ("Gestión de Productos"): columna Stock y badge de estado desde `products.stock_qty` crudo.
- `admin/page.tsx` (Dashboard, widget "Stock bajo"): mismo patrón, sin sumar variantes.

**Segundo problema, más profundo, encontrado al plantear la corrección**: aunque se arreglara el número de stock, el carrito/checkout de la tienda pública nunca tuvo forma de elegir talla — `CartItem` (`lib/cart-context.tsx`) no tenía `variant_id`, y `api/orders/route.ts` (creación de orden online) tampoco lo aceptaba ni lo validaba, a diferencia de `create_pos_sale`/`resolveSale` (mostrador), que sí manejan `variant_id`/`product_talla`/`cost_cents` por ítem desde la migración 00008. El usuario, consultado explícitamente sobre el alcance, pidió la corrección completa (selector de talla real, no solo el número).

**Corrección aplicada** (commit pendiente en `main`, sin push):
- **Migración `00030_online_variant_stock_sync.sql`**: (1) trigger `sync_product_stock_from_variants` que mantiene `products.stock_qty` sincronizado como la suma de sus variantes activas en cada INSERT/UPDATE/DELETE de `product_variants` — corrige de raíz, sin tocar cada consulta que lee `products.stock_qty` (tienda pública, Dashboard, Gestión de Productos quedan correctos automáticamente); (2) backfill de una sola vez para los productos con tallas ya migrados que estaban en 0; (3) `create_order_with_items` (RPC de orden online) ampliada para aceptar y guardar `variant_id`/`product_talla`/`cost_cents`/`discount_cents` por ítem — 100% aditivo, los productos sin tallas siguen igual; (4) función nueva `decrement_variant_stock` (mismo patrón que `decrement_stock` de la migración 00005) para descontar la variante exacta al confirmarse el pago.
- **`lib/inventory.ts`**: `decrementVariantStockAtomic`, usada por ambos webhooks de pago (`api/payments/webhook/route.ts` Stripe, `api/payments/mercadopago/webhook/route.ts` MercadoPago) cuando el ítem vendido tiene `variant_id` — si no, cae al `decrementStockAtomic` de siempre.
- **`api/orders/route.ts`**: trae `product_variants` de cada producto; si el producto tiene variantes, exige `variant_id` (rechaza con "Debes elegir una talla para X" si falta), valida stock contra la variante exacta (no el total sumado), y guarda `variant_id`/`product_talla`/`cost_cents` en el ítem. `lib/validations/order.ts` acepta `variant_id` opcional por ítem.
- **`lib/cart-context.tsx`**: `CartItem` gana `variant_id`/`talla` y un `line_id` (`id` o `id:variant_id`) que identifica la línea del carrito — dos tallas del mismo producto son líneas separadas en vez de sumarse. `cart-drawer.tsx` y el resumen de checkout muestran la talla y usan `line_id` para quitar/actualizar cantidad.
- **`(shop)/producto/[slug]/page.tsx` + `add-to-cart-button.tsx`**: selector de talla (botones por variante, tachados y deshabilitados si esa talla está agotada) — obligatorio elegir una para productos con tallas antes de poder agregar al carrito o comprar; el tope de cantidad y el stock mostrado usan el stock de la talla elegida, no el total.
- **`product-card.tsx`** y las consultas de listado (inicio, productos, categoría, buscar, ofertas, favoritos, comparar): todas ahora traen `product_variants(id, talla, stock_qty, active)`; el botón rápido "Agregar al carrito" de la tarjeta, que no tiene dónde elegir talla, se reemplaza por un enlace "Elegir talla" hacia la página del producto cuando el producto tiene variantes (evita agregar una talla al azar).
- Talla comprada visible en la confirmación de orden y en el email de confirmación (`emails/order-confirmation.tsx`).
- **Fuera de alcance, pre-existente y no tocado**: los métodos de pago manuales (transferencia/Nequi/Daviplata) nunca decrementan stock automáticamente (el admin solo cambia `status`, no `payment_status`, y no hay ningún flujo que llame a `decrementStockAtomic`/`decrementVariantStockAtomic` para esos pagos) — gap ya existente para todos los productos, no introducido ni agravado por este fix, queda pendiente de decisión del usuario si se quiere corregir en una fase futura. Tampoco se tocó el flujo "agregar a comparar" (`compare-context.tsx`) porque no tiene ningún botón que lo dispare en el código actual (funcionalidad huérfana).

**⚠️ Pendiente manual**: aplicar `00030_online_variant_stock_sync.sql` en el SQL Editor de Supabase.

Verificado `tsc --noEmit`, `eslint` (sin errores en los archivos tocados), `npm run build` (101 páginas, sin errores) y la suite completa `vitest run` (62/62 tests, incluidos los de webhooks de pago).

**Actualización 2026-07-29**: el usuario aplicó `00030_online_variant_stock_sync.sql` en Supabase y pidió continuar con la Fase 2 (tienda online: checkout, carrito, pagos, cupones, reseñas, favoritos, cuenta).

## 46. Fase 2: cupones sin límite real de uso + "Compra verificada" que nunca se activaba (2026-07-29)

Auditoría de cupones, reseñas, favoritos y "Mi Cuenta". Dos hallazgos reales, corregidos a pedido explícito del usuario:

**1) `coupons.used_count` nunca se incrementaba en ningún lugar del código** — se leía en `api/coupons/validate/route.ts`, en `api/orders/route.ts` (comparación `used_count < max_uses`) y en el panel `admin/cupones/page.tsx` (columna "usados/máximo"), pero ningún flujo lo escribía, y no había trigger de base de datos que lo hiciera (confirmado en la definición de la tabla, migración 00001 — solo el trigger genérico de `updated_at`). Consecuencia: un cupón con "Máx usos: 1" podía usarse un número ilimitado de veces, y el contador del panel admin quedaba congelado en 0 para siempre, dando una falsa sensación de control. Tampoco existía columna `coupon_id` en `orders` — no había forma de rastrear qué orden usó qué cupón.

**Corrección** (migración `00031_coupon_usage_and_verified_reviews.sql`): se agregó `orders.coupon_id` (FK a `coupons`), y `create_order_with_items` (RPC de orden online) ahora recibe un `p_coupon_id` opcional — dentro de la misma transacción, bloquea la fila del cupón (`FOR UPDATE`), revalida `max_uses` (cierra la ventana de carrera de dos checkouts concurrentes usando el mismo cupón de un solo uso, ya que la validación de la API corre sin bloqueo), incrementa `used_count` y guarda `coupon_id` en la orden. `api/orders/route.ts` pasa el `coupon_id` resuelto al RPC y traduce el nuevo error ("límite de uso"/"no encontrado") a un 400 legible en vez de caer al 500 genérico. Decisión deliberada: el conteo se hace al crear la orden (no al confirmarse el pago), porque los métodos de pago manuales (transferencia/Nequi/Daviplata) nunca tienen un evento de "pago confirmado" en el código (gap pre-existente, documentado en la sección 45) — contar solo en el webhook dejaría esos métodos sin control real del límite. No se decrementa `used_count` si la orden se cancela/reembolsa después (se trata como cupón ya consumido, mismo criterio que la mayoría de plataformas de e-commerce).

**2) `product_reviews.verified_purchase` ("Compra verificada") nunca se activaba** — el campo existe y se muestra como insignia verde en `review-section.tsx`, pero el INSERT del formulario de reseña no lo establecía y no había ningún trigger que lo calculara contra el historial de compras — quedaba en `false` (su default) para siempre, incluso para clientes que sí compraron el producto. La política RLS de INSERT tampoco lo validaba (solo exige `auth.uid() = user_id`), así que un cliente hipotéticamente podía intentar mandarlo en `true` directamente sin haber comprado nada.

**Corrección** (misma migración): trigger `BEFORE INSERT` (`set_review_verified_purchase`) que sobrescribe `NEW.verified_purchase` calculándolo server-side — `true` si existe un `order_item` de ese producto en una orden `payment_status='paid'` del mismo `user_id` (o del mismo email, para compras hechas antes de crear cuenta), ignorando cualquier valor que mande el cliente. Incluye backfill de las reseñas ya existentes. No se tocó `review-section.tsx` — el insert ya no necesita mandar el campo, el trigger lo resuelve solo.

**⚠️ Pendiente manual**: aplicar `00031_coupon_usage_and_verified_reviews.sql` en el SQL Editor de Supabase.

Verificado `tsc --noEmit`, `eslint`, `npm run build` (101 páginas) y `vitest run` (62/62 tests).

**Continuación Fase 2**: se revisaron a fondo los webhooks de Stripe y MercadoPago (verificación de firma, verificación de monto contra lo realmente cobrado, idempotencia, manejo de `rejected`/`in_process`/`refunded`) — sin hallazgos, ambos bien construidos. `api/restock/subscribe` funciona correctamente mostrando/aceptando la suscripción según `products.stock_qty` (ya corregido de raíz por el trigger de la migración 00030), con una limitación de diseño anotada para la Fase 5: es a nivel de producto completo, no de talla — si un producto tiene una talla agotada pero otras con stock, el cliente no puede pedir que le avisen de esa talla puntual.

**Corrección adicional**: "Mis Pedidos" (`(shop)/mi-cuenta/page.tsx`) y las políticas RLS de `orders`/`order_items`/`payments` comparaban el email del cliente con `=` (sensible a mayúsculas) — ni el registro ni el checkout normalizaban el email, así que un pedido de invitado con distinta capitalización del mismo email quedaba invisible en el historial del cliente sin haberse perdido realmente. Migración `00032_case_insensitive_order_email_match.sql`: las 3 políticas RLS ahora comparan `lower(customer_email) = lower(...)` — corrige también los pedidos ya existentes, sin necesitar migrar datos. Además, `(shop)/mi-cuenta/page.tsx` ahora filtra por `user_id` O email (`ilike`, con `_`/`%` escapados porque son comodines válidos en un email real) en vez de solo email exacto; y `(shop)/registro/page.tsx` + `lib/validations/order.ts` (`customerSchema`) normalizan el email a minúsculas al guardarlo, para que los datos nuevos no dependan solo de la comparación insensible a mayúsculas.

**⚠️ Pendiente manual**: aplicar `00032_case_insensitive_order_email_match.sql` en el SQL Editor de Supabase.

Verificado `tsc --noEmit`, `eslint`, `npm run build` (101 páginas) y `vitest run` (62/62 tests).

**Actualización 2026-07-29**: el usuario aplicó `00031` y `00032` en Supabase y pidió corregir la mejora anotada para la Fase 5 (avísame cuando vuelva por talla) antes de seguir con la Fase 3.

## 47. "Avísame cuando vuelva" ahora es por talla, no por producto completo (2026-07-29)

Antes: `restock_subscriptions` solo tenía `product_id`+`email` (`UNIQUE(product_id, email)`), y el botón "Notificarme" en la página de producto solo aparecía si `product.stock_qty <= 0` — como ese campo ya refleja el total sumado de todas las tallas desde la migración 00030, un producto con una talla agotada pero otras disponibles se veía "en stock" y el cliente no tenía forma de pedir aviso de esa talla puntual.

**Cambios**:
- Migración `00033_restock_subscriptions_per_variant.sql`: agrega `restock_subscriptions.variant_id`. Reemplaza el `UNIQUE(product_id, email)` por dos índices únicos parciales — uno para "todo el producto" (`variant_id IS NULL`, el caso sin tallas) y otro por talla puntual (`product_id, variant_id, email`) — así un mismo email puede suscribirse a varias tallas distintas del mismo producto sin duplicarse dentro de la misma talla.
- `api/restock/subscribe/route.ts`: si el producto tiene variantes activas, exige `variant_id` y valida el stock de esa talla puntual (no el total); si no tiene tallas, mantiene el comportamiento original. El insert ya no usa `.upsert()` (los índices parciales no son un target válido para `ON CONFLICT` vía el cliente de Supabase) — inserta directo e ignora el código `23505` (ya suscrito), mismo patrón que ya usa `review-section.tsx`.
- `api/inventory/adjust/route.ts` + `lib/email.ts` (`sendRestockNotifications`): cuando el ajuste de stock fue sobre una variante, solo notifica a los suscritos a *esa* talla (no a todos los del producto); el asunto y cuerpo del correo mencionan la talla.
- `components/products/restock-subscribe.tsx`: si el producto tiene tallas agotadas, muestra un selector para elegir a cuál se le avisa (obligatorio antes de poder enviar el formulario).
- `(shop)/producto/[slug]/page.tsx`: el bloque de "Notificarme" ahora se muestra si HAY alguna talla agotada (no solo cuando el total llega a 0), pasando la lista de tallas agotadas al componente.

**Fuera de alcance, anotado**: `sendRestockNotifications` solo se dispara desde `api/inventory/adjust` (usado por "Ingresar" en Inventario). Otros caminos que también suben stock — cargue de pedidos por PDF, importación de Excel, "Cambios" — no llaman a esta función, así que restockear por esas vías no dispara ningún aviso, con o sin talla. Es un hueco preexistente más amplio que lo pedido en esta ronda; queda identificado para una fase futura si se decide unificarlo.

Verificado `tsc --noEmit`, `eslint`, `npm run build` (101 páginas) y `vitest run` (62/62 tests).

**⚠️ Pendiente manual**: aplicar `00033_restock_subscriptions_per_variant.sql` en el SQL Editor de Supabase.

**Actualización 2026-07-29**: el usuario aplicó `00033` en Supabase y pidió seguir con la Fase 3 (seguridad transversal).

## 48. Fase 3 — CRÍTICO: cualquier cliente registrado podía volverse admin (2026-07-29)

Auditoría de seguridad transversal: se revisó que todas las 28 tablas tuvieran RLS habilitado (confirmado, coincide exacto con las tablas creadas), se cruzaron todos los `fetch()` de cada página admin contra sus headers de `Authorization` (sin hallazgos nuevos — el barrido de la sección 18, que encontró `ordenes`/`cupones`/`resenas` rotas, sigue vigente y no hay páginas nuevas con el mismo patrón), y se revisaron los roles exigidos por cada `requireAuth()` de la API contra lo documentado en fases anteriores (sin inconsistencias).

**Hallazgo crítico**: la política RLS `"Users can update own profile"` sobre `public.users` (migración 00004) valida `USING (auth.uid() = id)` — protege QUÉ FILA se puede editar, pero no QUÉ COLUMNAS. Como `get_user_role()` (usado en absolutamente todas las políticas RLS y en `requireAuth()` de cada ruta de la API) lee el rol directo de `public.users.role`, **cualquier cliente autenticado (rol `viewer` de un registro normal) podía convertirse en admin** con una sola llamada autenticada directa a la API REST de Supabase (`PATCH /rest/v1/users?id=eq.<su-propio-id>` con body `{"role":"admin"}`, usando su propio JWT válido, sin pasar por esta aplicación en absoluto ni requerir ningún exploit sofisticado — solo tener una cuenta normal en la tienda). Con eso, todo `requireAuth(['admin'])` de cada ruta y toda política RLS basada en `get_user_role()` lo habrían tratado como administrador real: pedidos, usuarios, cuentas/dinero, inventario, todo el panel.

**Hallazgo relacionado, misma causa**: `"Users can update own reviews"` (`product_reviews`) tampoco restringe columnas — un cliente podía editar su propia reseña por API directa para poner `approved = true` (auto-aprobarse, saltando la moderación del admin) o `verified_purchase = true` sin haber comprado nada — el trigger de `verified_purchase` de la sección 46/migración 00031 solo corría en el INSERT, nunca en el UPDATE.

**Corrección** (migración `00034_prevent_role_self_escalation.sql`):
- Trigger `BEFORE UPDATE` en `users` que revierte `NEW.role` al valor anterior si quien ejecuta el UPDATE no es ya administrador, sin importar qué venga en el payload. Cuidado importante: `getServiceSupabase()` (usado por las rutas admin del backend, ya protegidas por `requireAuth(['admin'])` antes de llegar aquí) conecta sin JWT de usuario, así que `auth.uid()` es `NULL` en ese contexto — el trigger trata `auth.uid() IS NULL` como confiable, lo cual es seguro porque RLS ya impide que cualquier OTRA conexión sin `auth.uid()` real llegue a este UPDATE (`USING auth.uid() = id` nunca es cierto si `auth.uid()` es NULL). No afecta el flujo legítimo (mi-cuenta solo actualiza `name`/`phone`) ni la edición de rol de un admin real desde `/admin/usuarios`.
- Mismo trigger de `verified_purchase` (migración 00031) ampliado a `BEFORE INSERT OR UPDATE`: en INSERT sigue calculando `verified_purchase` real y fuerza `approved = false`; en UPDATE, si quien edita es admin (o backend vía service role) no toca nada — deja pasar la aprobación/rechazo legítima desde `/admin/resenas`; si quien edita es el propio autor, recalcula `verified_purchase` de verdad y **restaura `approved` al valor que ya tenía** (no se puede auto-aprobar ni auto-rechazar).

Verificado `vitest run` (62/62 tests — sin cambios de código de aplicación, solo SQL, así que no aplica `tsc`/`eslint`/`build` para este commit).

**⚠️ Pendiente manual, URGENTE**: aplicar `00034_prevent_role_self_escalation.sql` en el SQL Editor de Supabase cuanto antes — mientras no se aplique, la vulnerabilidad de escalación de privilegios sigue activa en producción.

## 49. Fase 3 (continuación): políticas RLS públicas sin uso real + fuga de datos internos en /api/settings (2026-07-29)

Revisando cada política `WITH CHECK (true)`/`USING (true)` de todas las tablas (mismo patrón de la vulnerabilidad crítica de la sección 48), se encontraron 3 políticas públicas que ningún flujo real de la app usa, y una fuga real de datos internos del negocio.

**Políticas RLS huérfanas** (confirmado con `grep`: ningún `.from(tabla).insert/select(...)` del lado del cliente las usa; todo pasa por `getServiceSupabase()` o las RPC atómicas, que bypasean RLS igual):
- `"Anyone can view active coupons"` (`coupons`) — permitía listar TODOS los cupones activos (código, descuento, compra mínima) sin conocer ninguno de antemano, vía la API REST directa de Supabase — rompe el modelo de distribución selectiva de un cupón.
- `"Anyone can create orders"` / `"Anyone can create order items"` (`orders`/`order_items`, huérfanas desde la migración 00006 cuando la creación de orden pasó a la RPC atómica) — permitían crear órdenes basura directo por API, o peor: insertar un `order_item` referenciando el `order_id` de la orden de OTRO cliente, sin ninguna verificación de dueño, contaminando su factura.

Corrección: migración `00035_remove_unused_public_rls_policies.sql` — se eliminan las 3 políticas. No afecta ningún flujo real (verificado que nada del código las necesitaba).

**Fuga de datos internos**: `GET /api/settings` no tenía ningún `requireAuth` (a propósito, el checkout de un invitado la llama sin sesión para leer `shipping_config`/`payment_methods`), pero devolvía la fila completa de `store_settings` con `select('*')` — incluyendo `pos_commission_rates` (comisiones reales configuradas por método de pago) y `fixed_monthly_expenses` (arriendo, sueldo, servicios, otros gastos fijos del negocio). Cualquier persona en internet podía ver esos datos internos con una sola petición sin autenticación.

**Corrección**: `api/settings/route.ts` ahora verifica (sin exigir, con `getAuthenticatedUser`, no `requireAuth` — la ruta sigue siendo pública) si quien llama es admin/seller, y solo en ese caso incluye `pos_commission_rates`/`fixed_monthly_expenses` en la respuesta; para cualquier otro caso (incluido sin sesión) esos dos campos se omiten. Efecto colateral encontrado al aplicar el fix: `admin/configuracion-pos/page.tsx` (la única página que sí necesita esos campos) llamaba a esta misma ruta **sin** el header `Authorization` — se corrigió para que lo mande, igual que ya hacían sus propios `PUT`.

Verificado `tsc --noEmit`, `eslint`, `npm run build` (101 páginas) y `vitest run` (62/62 tests).

**⚠️ Pendiente manual**: aplicar `00035_remove_unused_public_rls_policies.sql` en el SQL Editor de Supabase (después de `00034`).

**Actualización 2026-07-29**: el usuario aplicó `00034` y `00035` en Supabase y pidió continuar con la Fase 4 (integraciones y datos: webhooks de pago, Alegra, exportar/importar, integridad post-migración).

## 50. Fase 4 — integraciones y datos: sin hallazgos nuevos (2026-07-29)

A diferencia de las Fases 1-3, esta pasada no encontró bugs nuevos — se revisó a fondo cada pieza y todas resultaron sólidas:

- **Webhooks de pago (Stripe/MercadoPago)**: ya revisados a fondo en la Fase 2 (firma, monto real cobrado, idempotencia, estados) — sin cambios adicionales.
- **Alegra** (`lib/alegra.ts`, `lib/alegra-auth.ts`, las 4 rutas `api/alegra/*`): confirmado que las 4 rutas usan consistentemente `requireAlegraAdmin()` (rol admin real, no solo sesión) — coincide con lo ya documentado en la sección 18. Es una integración de solo lectura (consulta ventas/inventario de Alegra para comparar contra el cierre de caja), no escribe nada en Supabase, así que no hay riesgo de integridad de datos ahí. Credenciales (`ALEGRA_USER`/`ALEGRA_TOKEN`) solo se usan server-side.
- **Exportar/Importar Excel** (`api/admin/excel/import`): valida columnas numéricas sospechosas ANTES de escribir nada (columnas desplazadas/corrompidas, mismo criterio que el software local), nunca toca `products`/`orders`/`users`/`store_settings` (solo tablas internas del módulo: cuentas, fiado, notas, presupuesto, facturas, préstamos, inventario vía `product_variants`), y filtra gastos con monto negativo. La hoja "Inventario" sí escribe en `product_variants` — se confirmó que esto se beneficia automáticamente del trigger de sincronización de stock de la migración 00030 (`products.stock_qty` queda correcto sin necesitar ningún cambio en este importador).
- **Cargue de pedidos de proveedor (PDF)** (`api/admin/inventory-import/parse` + `confirm`): admin-only, productos nuevos siempre se crean `active: false` (nunca se publican solos), cada movimiento de stock queda registrado en `inventory_movements` con su nota de origen. Mismo beneficio automático del trigger de la migración 00030.

No se modificó ningún archivo en esta fase.

**Actualización 2026-07-29**: el usuario pidió hacer push de todo lo acumulado (7 commits, hasta `1f812cf`) — hecho. Ahora en producción. Se pidió armar la propuesta de la Fase 5 (mejoras y roadmap).

## 51. Fase 5 — Propuesta de mejoras y roadmap (2026-07-29)

Roadmap agrupado por tipo de impacto, con lo que ya se identificó como pendiente a lo largo de las Fases 1-4 más propuestas nuevas según el contexto del negocio (tienda real de accesorios para motociclistas, familia manejando el día a día, recién unificada con el software local). Ningún ítem de esta sección se implementó todavía — es la propuesta a priorizar con el usuario.

### A. Cerrar huecos ya identificados (bajo esfuerzo, ya diagnosticados)

1. **Métodos de pago manuales no descuentan stock** — transferencia/Nequi/Daviplata nunca disparan ningún descuento de inventario (a diferencia de tarjeta/MercadoPago, que sí lo hacen vía webhook); el admin cambia `status` pero nunca `payment_status`, y no hay ningún flujo que llame a `decrementStockAtomic`/`decrementVariantStockAtomic` para esos pagos. Hoy el inventario de esas ventas se ajusta a mano. Propuesta: un botón "Marcar como pagado" en `/admin/ordenes` que dispare el mismo descuento de stock (por variante si aplica) que ya usan los webhooks.
2. **`sendRestockNotifications` solo se dispara desde "Ingresar" en Inventario** — cargue de pedidos por PDF, importación de Excel y "Cambios" también suben stock pero no avisan a nadie suscrito. Propuesta: mover el disparo a un solo punto (el trigger de sincronización de la migración 00030, vía otro trigger sobre `product_variants`/`products`) en vez de repetirlo en cada ruta de escritura.
3. **Alerta de stock bajo es por producto total, no por talla** — un producto con 8 tallas puede tener el total por encima del umbral aunque cada talla individual esté casi agotada; el widget del Dashboard no lo detecta. Propuesta: sumar un chequeo por variante (`product_variants.stock_qty <= low_stock_threshold`) al widget y a un futuro reporte de reabastecimiento.
4. **`audit_logs` no cubre ~8 módulos** (Registrar Venta, Facturas, Fiado, Préstamos, Notas, Presupuesto, Cuentas) — la UI de Auditoría y la tabla ya existen y funcionan, solo falta el `insert` en cada ruta de escritura de esos módulos. Candidato natural para un barrido dedicado.
5. **Cierres vs. Mi Cuadre** — pregunta abierta desde la Fase 3B: `/admin/cierres` (registro manual de caja) no tiene equivalente en el software local y se solapa conceptualmente con Mi Cuadre (resumen automático del día). Vale la pena decidir si Cierres se conserva, se fusiona con Mi Cuadre, o se redefine su propósito (¿arqueo físico de caja al final del día, distinto del resumen de ventas?).
6. **"Comparar productos" es una función huérfana** — el contexto (`compare-context.tsx`) y la página (`/comparar`) existen y funcionan, pero no hay ningún botón "Agregar a comparar" en ninguna tarjeta o página de producto que lo dispare. O se conecta (agregar el botón, como ya existe para Favoritos) o se retira del código.
7. **Reseñas: no hay forma de editar la propia reseña** — la política RLS lo permite y el backend ya está listo (incluido el trigger que la revalida), pero `review-section.tsx` solo tiene formulario de creación.
8. **Migrar de `@supabase/auth-helpers-nextjs` a `@supabase/ssr`** — paquete deprecado, causante del bug de spinner colgado de la sección 17 (ya mitigado con timeout, pero el problema de fondo sigue ahí). Es la librería recomendada actual de Supabase para Next.js App Router.

### B. Operación diaria del negocio (impacto directo, mediano esfuerzo)

9. **Notificaciones de pedido por WhatsApp**, no solo email — en Colombia es el canal que la mayoría de clientes revisa primero; hoy todo el flujo de confirmación/envío es por correo (Resend). Se podría integrar la API de WhatsApp Business (o un proveedor como Twilio) para el mismo punto donde hoy se llama a `sendOrderConfirmation`/`sendOrderShipped`.
10. **Recordatorio automático de vencimientos consolidado** — hoy existen alertas de sesión para facturas/notas/fiados vencidos (sección 13.3), pero solo se ven si un admin inicia sesión ese día. Un resumen diario por email a primera hora evitaría que un vencimiento pase inadvertido en un día que nadie entra al panel.
11. **Backup / exportación automática recurrente** (no solo manual desde Exportar/Importar) — un job programado (ej. semanal) que genere y envíe el mismo Excel de respaldo que ya existe como botón manual.

### C. Crecimiento y conversión (más esfuerzo, impacto en ventas)

12. **Recuperación de carrito abandonado** — el carrito ya persiste en `localStorage`; capturar el email en el primer paso del checkout (antes de completarlo) y enviar un recordatorio a las horas si no se completó la compra es una mejora clásica de conversión para una tienda con tráfico real.
13. **Cupón automático de bienvenida / primera compra** — con el bug de `used_count` ya corregido (Fase 3), ahora sí se puede confiar en un cupón de un solo uso real para captar clientes nuevos.
14. **Pedir reseña después de una compra entregada** — un email automático unos días después de `status = 'delivered'` pidiendo calificar el producto, aprovechando que `verified_purchase` ahora sí funciona de verdad (Fase 3).
15. **Programa de puntos/fidelización simple** — dado que ya existe `customer_credits` (fiado) y el modelo de cuentas de cliente, un sistema de puntos por compra no partiría de cero.

### D. Calidad del catálogo (tarea del usuario, no de código)

16. Completar **descripciones y fotos** de los productos migrados que aún no las tienen — ya mencionado por el usuario como el siguiente paso de su lado. El panel de Inventario/Productos ya soporta editarlas producto por producto; si el volumen es alto, se podría considerar una vista dedicada de "productos incompletos" (sin foto o sin descripción) para no tener que ir buscándolos uno por uno entre los ~194 del catálogo — mejora chica de UX si hace falta.

**Actualización 2026-07-29**: el usuario pidió implementar la propuesta completa. Se hizo en 4 commits (`dfed877`, `fdf73fa`, y el de la migración de auth-helpers `85f15c2`, más este doc), cubriendo los 12 ítems del bloque A + 4 del B/C que no dependían de una cuenta externa (WhatsApp) ni de una decisión de negocio (puntos de fidelización, cupón de bienvenida automático — este último se deja manual por decisión del usuario: ya se puede crear un cupón de un solo uso real desde `/admin/cupones` sin código nuevo, tras el fix de la Fase 2).

## 52. Implementación de la Fase 5 (2026-07-29)

**A.1 — Pagos manuales descuentan stock**: nuevo botón "Marcar como pagado" en `/admin/ordenes` (visible si `payment_status !== 'paid'`) que replica exactamente lo que ya hacían los webhooks de Stripe/MercadoPago (descuento por variante + `inventory_movements` + email de confirmación), pero disparado a mano. Se extrajo `lib/order-fulfillment.ts` (`decrementStockForOrder`) para no duplicar la lógica de descuento en un tercer lugar. Idempotente: si la orden ya estaba pagada, no vuelve a descontar.

**A.2 — Restock notifications centralizadas**: antes solo `/api/inventory/adjust` ("Ingresar") disparaba el aviso; cargue de PDF, importación de Excel y "Cambios" nunca avisaban a nadie. Migración `00036`: dos triggers (`product_variants` y `products`, este último excluyendo productos con variantes para no duplicar) detectan la transición 0→positivo y encolan en `restock_notification_queue` sin importar por qué ruta se escribió el stock. Un cron (`api/cron/restock-notifications`) procesa la cola y es quien de verdad llama a Resend (Postgres no puede).

**A.3 — Alerta de stock bajo por talla**: el Dashboard (`admin/page.tsx`) ahora también revisa `product_variants` con su propio `low_stock_threshold`, además de los productos sin tallas (excluidos explícitamente de la revisión por total, que ya no es una señal útil desde que ese total sea la suma de tallas).

**A.4 — Cobertura de `audit_logs`**: nuevo helper `lib/audit.ts` (`logAudit`, nunca lanza — un fallo de auditoría no debe tumbar la operación real). Agregado a los 13 archivos de rutas que faltaban: `pos/sales` (crear/editar/cancelar), `supplier-invoices` (crear/editar/eliminar), `customer-credits` (crear/editar incluido `force_paid`/eliminar), `loans` (crear/editar/eliminar), `notes` (crear/editar/eliminar), `monthly-budgets` (guardar), `operating-expenses` (crear/eliminar), `accounts` (crear/editar), `account-movements` (ajuste manual/transferencia), `account-closures` (crear).

**A.5 — Cierres ↔ Mi Cuadre**: en vez de fusionar o decidir cuál sobra, `/admin/cierres` ahora muestra, al elegir la fecha del formulario, el "Total esperado según Ventas de mostrador" de ese día (mismo cálculo que Mi Cuadre) con desglose por método — para reconciliar el conteo manual, no reemplazarlo.

**A.6 — "Comparar" conectado**: nuevo `components/products/compare-button.tsx` (mismo patrón que `wishlist-button.tsx`), agregado a `product-card.tsx` (tarjetas, variante ícono) y a la página de producto (variante completa). El contexto/página `/comparar` ya existían y funcionaban — solo faltaba el botón que los alimentara.

**A.7 — Edición de reseña propia**: `review-section.tsx` ahora carga también la reseña propia aunque esté pendiente de aprobación (antes el filtro `approved=true` la escondía incluso de su propio autor), muestra una insignia "Pendiente de aprobación", y agrega un botón de editar que reutiliza el mismo formulario en modo edición. El trigger de la migración 00034 ya protegía `approved`/`verified_purchase` de que el propio autor los manipule.

**B.9 — Resumen diario de vencimientos**: `sendDailyDigest()` (mismo contenido que las alertas de sesión existentes) + `emails/daily-digest.tsx` + cron diario (`api/cron/daily-digest`).

**B.10 — Backup automático recurrente**: `api/cron/backup-export` reutiliza `sheetDefinitions` (la misma fuente que el botón manual de Exportar/Importar) y envía el `.xlsx` como adjunto por email, semanal.

**C.13 — Email pidiendo reseña**: `orders.metadata.delivered_at` se estampa la primera vez que una orden pasa a `status='delivered'` (en `PUT /api/orders/[id]`); un cron diario (`api/cron/review-requests`) busca órdenes entregadas hace ≥3 días sin `review_requested` y manda `emails/review-request.tsx` con enlaces a cada producto comprado.

**C.14 — Carrito abandonado**: nueva tabla `abandoned_carts` (migración `00037`, sin políticas RLS para anon/authenticated — solo service_role la toca). `checkout/page.tsx` registra email+carrito al perder foco el campo de email (`onBlur`, fire-and-forget, nunca bloquea el checkout si falla); `api/orders/route.ts` marca `recovered_at` si ese email sí completó una compra; un cron (`api/cron/abandoned-carts`) recuerda por email los que llevan ≥2 horas sin recuperar y nunca se les recordó.

**Infraestructura de cron compartida**: `lib/cron-auth.ts` verifica que la petición traiga `Authorization: Bearer $CRON_SECRET` (Vercel lo adjunta automáticamente a las peticiones de cron cuando esa variable de entorno existe) — sin esto, `/api/cron/*` serían rutas GET públicas sin protección. 5 entradas nuevas en `vercel.json` (`crons`). **Nota importante**: Vercel Hobby limita los cron jobs a una ejecución diaria — si el proyecto está en ese plan, `restock-notifications` y `abandoned-carts` (programados cada hora) quedarán en 1 vez/día hasta subir de plan; no rompe nada, solo tarda más en avisar.

**A.8 — Migración de `@supabase/auth-helpers-nextjs` a `@supabase/ssr`**: el paquete deprecado que ya había causado el bug del spinner colgado (sección 17). Solo 3 archivos importaban el paquete de verdad (`lib/supabase-browser.ts`, `middleware.ts`, `lib/alegra-auth.ts`) — los demás solo lo mencionaban en comentarios. `@supabase/ssr` exige `@supabase/supabase-js >=2.111.0` (el paquete viejo solo pedía `>=2.19.0`), lo que forzó un salto de versión del cliente base y expuso 2 chequeos de tipos más estrictos de `@supabase/postgrest-js` en rutas sin relación con el login (`api/pos/search`, `api/settings`) — corregidos con el mismo patrón de `@ts-ignore` ya usado en el resto del proyecto para esta limitación de tipos conocida (documentada desde antes de esta sesión).

**Verificación de este ítem** (el de mayor riesgo, toca el login de todo el sitio): además de `tsc`/`eslint`/`build`/`vitest` limpios, se levantó el servidor de desarrollo real y se probó por HTTP: `/admin` y `/checkout` sin sesión redirigen correctamente a `/iniciar-sesion?redirect=...` vía middleware; `/api/settings` público sigue ocultando `pos_commission_rates`/`fixed_monthly_expenses` (fix de la Fase 3, confirmado que sigue vigente). **No se pudo probar el envío real de credenciales** (eso requiere un navegador de verdad, no `curl`) — el usuario debe probar el login (cliente, vendedor y admin) antes de confiar del todo en este cambio.

**Hallazgo aparte, descubierto al leer `middleware.ts` para esta migración (no se tocó, es comportamiento preexistente)**: `/checkout` está en la lista de rutas protegidas (`protectedUserRoutes`) — un cliente sin sesión iniciada que intente pagar es redirigido a `/iniciar-sesion`. Esto parece contradecir el resto del diseño (checkout de invitado: `customerSchema` no exige cuenta, `orders.user_id` es opcional, hay lógica de "Vincular carrito abandonado" pensada para compradores sin cuenta). Queda como pregunta abierta para el usuario: ¿es intencional exigir cuenta antes de pagar, o es un bug que bloquea las compras de invitado?

Verificado `tsc --noEmit`, `eslint`, `npm run build` (105 páginas) y `vitest run` (62/62 tests) en cada bloque de commits.

**⚠️ Pendientes manuales**:
- ~~Aplicar `00036`/`00037` en Supabase~~ — hecho por el usuario el 2026-07-29.
- **Configurar `CRON_SECRET` en Vercel — pendiente** (el usuario tuvo problemas al intentarlo, queda para retomar en una sesión futura; recordárselo). Sin esto, `/api/cron/*` queda sin protección real contra llamadas externas (aunque no expone datos sensibles directamente, sí permitiría a cualquiera disparar el envío de emails o el procesamiento de las colas a voluntad).
- Confirmar que los 5 cron jobs quedaron registrados en el dashboard de Vercel tras el próximo deploy (Project → Settings → Cron Jobs).
- Probar el login real (cliente/vendedor/admin) tras el deploy, por el cambio de la migración A.8.

**Actualización 2026-07-29**: el hallazgo de `/checkout` protegido se corrigió (commit `388d011`) — `middleware.ts` ya solo exige sesión real en `/mi-cuenta`; `/favoritos`, `/checkout` y `/orden/*` quedan accesibles para invitados, verificado con servidor de desarrollo real (200 sin sesión en los tres, 307 sin cambios en `/mi-cuenta` y `/admin`).

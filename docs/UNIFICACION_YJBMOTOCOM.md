# Unificación YJBMOTOCOM — tienda en línea + software local de ventas

> **Este documento es el estado vivo del proyecto.** Si retomas este trabajo en una sesión nueva (o después de una pausa larga), lee este archivo completo antes de tocar código — te dice exactamente en qué quedamos, qué decisiones ya se tomaron y por qué, y cuál es el siguiente paso concreto.

**Última actualización**: 2026-07-21
**Estado actual**: Fase 3 (3.1-3.10) completa + limpieza de tipos (68→0 errores) + `ignoreBuildErrors` quitado. 14 commits locales en `main`, ninguno pusheado — esperando autorización explícita del usuario para `git push`. Migraciones 00008-00016 ya aplicadas por el usuario en Supabase real.

**⚠️ Hallazgo de auditoría (2026-07-21)**: el usuario comparó una captura del software local corriendo (16 módulos en su sidebar) contra la nube y encontró que la Fase 2 (sección 5.3) **se saltó 4 módulos** que la Fase 1 sí había identificado correctamente (línea 58 de este documento): **Calculadora, Mi Cuadre, Historial Mensual, y Ventas del Día completo** (solo existe una versión parcial dentro de Registrar Venta). También quedó parcial la **Configuración POS** (comisiones por método sin pantalla de edición, gastos fijos mensuales sin modelar). Se abre una ronda nueva de sub-fases (3.11-3.16) para cerrar estas brechas — ver sección 10.

---

### 10.x Detalle de la sub-fase 3.13 (completada)

**Migración `00017_edit_pos_sale.sql`**: función `edit_pos_sale(p_order_id, p_order, p_items, p_payments)` — mismo patrón `SECURITY DEFINER` que `create_pos_sale`/`cancel_pos_sale`. Revierte por completo los efectos de la venta actual (restaura stock, revierte crédito de cuentas, borra items/pagos viejos) y vuelve a aplicar los nuevos, **conservando el mismo `id`/`order_number`** en vez de crear una orden nueva — igual que "revierte y re-aplica el crédito de cuenta anterior" del software local.

**Refactor sin cambio de comportamiento**: se extrajo la lógica de resolución de productos/comisión (antes duplicada solo en `POST /api/pos/sales`) a `lib/pos-sale.ts` (`resolveSale`), para reutilizarla también en el nuevo `PUT`. Se verificó que el `POST` sigue devolviendo exactamente los mismos códigos/mensajes de error que antes.

**Nuevas rutas**: `GET /api/pos/sales/[id]` (detalle, para precargar el formulario de edición) y `PUT /api/pos/sales/[id]` (edita vía `edit_pos_sale`).

**Pantalla nueva** `/admin/ventas-dia` (agregada al sidebar): selector de fecha (no solo "hoy"), lista de ventas de esa fecha con **editar** (carrito completo: agregar/quitar productos, cambiar cantidad/precio, cambiar métodos de pago) y cancelar, más una sección de **gastos operativos del día** (reutiliza la tabla de la sub-fase 3.7).

**Alcance no incluido (documentado, no crítico)**: la "edición masiva de método de pago" del local (cambiar el método de varias ventas a la vez) no se construyó — editar una venta a la vez (ya disponible) cubre la misma necesidad funcional con más clics para lotes grandes. Se prioriza así por ser la opción más segura (cualquier operación en lote sobre dinero/stock aumenta el riesgo).

**Verificación reforzada** (por tocar dinero + stock con lógica nueva): `tsc --noEmit` (0 errores), `eslint` (0 nuevos), `vitest run` (62/62), y además un `npm run build` de producción completo.

**⚠️ Pendiente manual**: aplicar `00017_edit_pos_sale.sql` en el SQL Editor del proyecto Supabase real antes de poder usar "Editar" en `/admin/ventas-dia`.

**Cómo probarlo**: registrar una venta de prueba en Registrar Venta, ir a `/admin/ventas-dia` en la fecha de hoy, editarla (cambiar cantidad de un producto y agregar un segundo método de pago), guardar, y confirmar que el stock y los saldos de cuentas quedan coherentes con los valores nuevos (no con la suma de ambos). Agregar un gasto operativo del día y confirmar que se refleja en el total.

### 10.x Detalle de la sub-fase 3.14 (completada) + corrección retroactiva a 3.11

**Corrección importante encontrada al releer la ficha del local con cuidado**: el software local dice explícitamente que el rol Vendedor no ve costo/margen/ganancia/comisión **"en ninguna pantalla (Registrar Venta, Ventas del Día, Historial, Dashboard, Calculadora, Inventario)"**. La Calculadora que construí en 3.11 no tenía ningún control de rol — se corrigió ahora: **la página completa queda restringida a `admin`** (igual que Rendimiento Vendedores), porque todo su contenido es precisamente margen/ganancia/comisión — no tenía sentido ocultar solo un campo y dejar el resto.

**`/admin/historial-mensual`** (agregada al sidebar): selector de mes/año, ingresos/órdenes/unidades visibles para todos (igual que "ventas, ingresos y cantidades" que sí ve el Vendedor), pero **costo, comisiones acumuladas, ganancia neta y el botón "Exportar/Imprimir" quedan solo para `admin`** — coincide con la regla del local de que Vendedor "no puede exportar/imprimir reportes con costo/ganancia". El export/print reutiliza el mismo patrón ya usado en el recibo de venta (HTML con botón que llama a `window.print()`), sin agregar ninguna dependencia nueva de generación de PDF.

Verificado: `tsc --noEmit` (0 errores), `eslint` (0 nuevos), `vitest run` (62/62).

**Cómo probarlo**: entrar como `seller` a Calculadora y confirmar que aparece el mensaje de "solo administradores"; entrar a Historial Mensual y confirmar que ve ingresos/órdenes pero no ganancia/comisión ni el botón de exportar. Como `admin`, confirmar que todo es visible y que el botón abre una pestaña nueva imprimible.

## 10. Fase 3B — Cierre de brechas de fidelidad (2026-07-21 en adelante)

Ronda de sub-fases adicional, con el mismo flujo de siempre (commits locales en `main`, verificación tsc/eslint/vitest/build después de cada una, documentación al cierre).

| # | Sub-fase | Estado |
|---|---|---|
| 3.11 | Calculadora (precio/margen/comisión, sin persistir; "Cascos desde Factura" con PDF se evalúa aparte, ver nota) | ⏳ En curso |
| 3.12 | Mi Cuadre (vista en vivo, sin costos, auto-refresh) | Pendiente |
| 3.13 | Completar Ventas del Día (selector de fecha, **editar** una venta ya registrada, gastos operativos del día inline) | ✅ Completada (commit local; requiere aplicar migración 00017) |
| 3.14 | Historial Mensual (vista por mes, comisiones acumuladas, exportar/imprimir PDF) | ✅ Completada (commit local) |
| 3.15 | Configuración POS (comisiones por método de pago + gastos fijos mensuales — cierra el ciclo de "Utilidad Real" de la sub-fase 3.8) | ⏳ Pendiente — siguiente paso |
| 3.16 | Revisión final: regresión completa + tabla comparativa actualizada | Pendiente |

**Nota sobre "Cascos desde Factura"** (parte de Calculadora en el local): en el local usa dos parsers de PDF (`pdf_pedido_parser.py`, `pdf_distrifabrica_parser.py`) hechos a la medida del formato exacto de facturas de dos proveedores específicos. No tengo muestras de esos PDFs para replicar el parseo exacto, así que en 3.11 se construye la calculadora completa (funcional, fiel) y esta pieza específica de extracción de PDF se deja como pendiente documentado, a menos que el usuario provea ejemplos de esas facturas para diseñarlo correctamente.

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
3. Si la Fase 3 (sección 9) ya está completa, lo que sigue es: (a) que el usuario autorice el `git push` y despliegue, y/o (b) una posible "Fase 4" de mejoras futuras (ver Limitaciones en la sección 9.6) si el usuario la pide.
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

### 9.6 Limitaciones conocidas / pendientes

- **Tasas de comisión POS**: quedan en 0% hasta que se construya una pantalla para editarlas (hoy solo existen en la base de datos).
- **Alertas activas de vencimiento** (facturas por vencer, fiados con +30 días): el software local las muestra como notificación emergente al arrancar; en la nube se muestran como insignias visuales al entrar a la sección, no como notificación push. Se puede agregar al Dashboard si se necesita.
- **Edición de una venta de mostrador ya registrada**: hoy solo se puede cancelar (reversa completa), no editar in-place; el local sí permite editar una venta existente.
- **Impresión térmica ESC/POS directa**: por decisión ya acordada, el recibo es PDF + diálogo de impresión del navegador, no impresión directa a la impresora térmica como hace la app de escritorio.
- **Excel — importación limitada a 13 hojas** (por diseño de seguridad, ver sección 6.9): Ventas, Usuarios, Configuración, Log Auditoría y Cierres Cuentas son de solo exportación.
- **Rol `viewer`**: sigue sin endurecerse el acceso al shell del admin (hallazgo original de la Fase 1, no introducido por este proyecto) — un usuario `viewer` autenticado puede ver la navegación del admin aunque las APIs le devuelvan 403. No se tocó porque no era parte del alcance acordado.
- Ninguna de estas limitaciones bloquea el uso del sistema unificado — son mejoras incrementales para una futura iteración si se necesitan.

# Plan: Control financiero (estado de resultados, compras, inventario y flujo de caja)

Creado: 2026-11-05. **Aprobadas las 6 fases (2026-11-05), una por una y probando cada una antes de seguir.**

| Fase | Estado |
|---|---|
| 1 Clasificar salidas + sin doble conteo de fijos | **Hecha y aprobada 2026-11-05** (commit local, sin push). Replicada en YBMOTOCOM. |
| 2 Finanzas → Mes (Estado de resultados) | **Hecha y aprobada 2026-11-05** (commit local, sin push). Replicada en YBMOTOCOM. |
| 3 Finanzas → Año + foto de inventario | **Hecha y aprobada 2026-11-05** (commit local, sin push). Replicada en YBMOTOCOM. 00059 corrida en YJBMOTOCOM; **falta en YBMOTOCOM**. |
| 4 Inventario y rentabilidad | **Hecha y aprobada 2026-11-05** (commit local, sin push). Replicada en YBMOTOCOM. |
| 5 Flujo de caja, por cobrar / por pagar | **Hecha 2026-11-05** (commit local, sin push). Replicada en YBMOTOCOM. Falta que el usuario la pruebe. |
| 6 Exportar Excel / PDF | Pendiente |

### Fase 2 — cómo quedó (2026-11-05)
- Fórmulas: `apps/web/src/lib/finance/income-statement.ts` (`buildIncomeStatement`, `salesForTargetProfit`,
  `percentChange`, `ratio`) y `lib/finance/periods.ts` (`monthPeriod`, `shiftMonth`, `truncatePeriod`, en hora de
  Bogotá). Pruebas: `income-statement.test.ts` (9) y `finance-periods.test.ts` (4). Suite completa 175/175.
- API: `GET /api/finance/month?year&month` (solo admin; admin de solo lectura puede ver; no escribe). Devuelve el
  mes pedido, el anterior y el mismo mes del año pasado. Pagina de a 1000 filas.
- Pantalla: Finanzas → **Estado de resultados** (`/admin/finanzas`, menú solo admin). Tarjetas (ventas netas,
  utilidad bruta, utilidad neta, punto de equilibrio con barra de avance), estado de resultados con la fórmula
  de cada línea, % sobre ventas y comparación, indicadores (transacciones, ticket, markup, gastos/ventas,
  nómina/ventas, retiros), gastos y salidas del mes con "¿resta utilidad?", y "¿cuánto hay que vender?"
  (punto de equilibrio mensual y diario, ventas al ritmo actual marcadas ESTIMADO, ventas para una utilidad deseada).
- Decisiones tomadas al probar con datos reales:
  - **Utilidad neta = utilidad real de Historial Mensual** (verificado: oct-2026 $678.329 por las dos vías).
  - **Mes en curso se compara contra los mismos días** del mes anterior y del año pasado (antes daba −82,9 % al
    comparar 5 días de noviembre contra octubre completo).
  - **Un mes sin ventas ni gastos ("sin datos") no se compara**: oct-2025 salía con −$5,5 M solo por los gastos
    fijos, de antes de que el sistema existiera.
  - Los meses pasados usan los gastos fijos configurados hoy (no hay historial): la pantalla lo advierte.
  - Aviso de ventas sin costo: oct-2026 tiene 11 líneas ($1.205.000) con costo $0.
- Verificado en Chromium con datos reales (sesión creada por script): 1366 px y 390 px, sin desborde ni errores.

### Fase 5 — cómo quedó (2026-11-05)
- `lib/finance/cash-flow.ts` (`buildCashFlow`, `movementConcept`, `buildReceivables`, `buildPayables`, `withdrawable`) +
  `GET /api/finance/cash-flow?year&month` → pestaña **Flujo de caja** de Finanzas (`components/finanzas/cash-flow-view.tsx`).
  Sin migración. Pruebas: `cash-flow.test.ts` (5). Suite 194/194.
- Consultas compartidas en `lib/finance/queries.ts` (`fetchAll`, `fetchPeriodOrders`, `fetchPeriodExpenses`); la API del
  mes ya las usa (mismo resultado).
- Flujo del mes: saldo final = saldo de hoy − movimientos posteriores; saldo inicial = final − movimientos del mes
  (verificado: el inicial de noviembre es el final de octubre). Conceptos: ventas cobradas, llegadas de Addi/datáfono/
  SisteCrédito, abonos de fiado, ajustes, gastos del negocio, pagos a proveedores, retiros del dueño, inversiones (los
  gastos se clasifican por la categoría del gasto ligado al movimiento). Los traslados entre cuentas propias se muestran
  aparte y no cuentan como entrada ni salida.
- Utilidad vs. plata del mes, lado a lado, con la explicación de por qué no coinciden.
- Por cobrar (hoy): fiado (saldo de Apartados y Abonos), Cuentas → Por Cobrar y ventas por llegar de Addi, datáfono y
  SisteCrédito (con margen), con lo que ya debió llegar aparte (aviso si la tarea automática no las aplicó).
- Por pagar (hoy): facturas pendientes (monto − abonos) por vencimiento: vencidas, próximos 30 días, después, sin fecha.
- **¿Cuánto puedo retirar? (estimado)** = plata en las cuentas activas − proveedores (vencido + sin fecha + 30 días) − un
  mes de gastos fijos. Lo por llegar y el fiado no cuentan hasta que entren.

### Fase 4 — cómo quedó (2026-11-05)
- `lib/finance/inventory-insights.ts` (`buildInventoryInsights`) + `GET /api/finance/inventory?window=30|90|180|365&quiet=60|90|180`
  → pestaña **Inventario** de Finanzas (`components/finanzas/inventory-view.tsx`). Sin migración. Pruebas:
  `inventory-insights.test.ts` (7). Suite 188/188.
- Muestra: inventario a costo, **días de inventario** (inventario ÷ costo vendido de 30 días ÷ 30), **rotación**
  (marcada ESTIMADO: usa el inventario de hoy, no el promedio), **plata quieta**, rentabilidad por categoría (con el
  inventario de hoy de cada una), productos quietos, los que más rotan, baja rotación (días de cobertura) y los que más
  utilidad dejan.
- Producto quieto = con stock, sin venta en más de N días **y** sin entrada de mercancía (o creación) en ese tiempo,
  para no marcar lo recién llegado. Las ventas se miran siempre un año atrás.
- Categoría = la asignada en el producto; si no tiene, la primera palabra del nombre (igual que Inventario e Historial).
  Los ítems manuales van aparte ("ÍTEMS MANUALES").
- Las alertas de stock bajo NO se repiten: ya existen en Dashboard e Inventario.
- Hallazgos con datos reales (YJBMOTOCOM, 5-nov-2026, informados al usuario):
  - Los 3 productos de demostración de `supabase/seed.sql` (Guantes Touring Premium, Chaqueta Moto Adventure, Candado
    Alarma Premium) siguen activos en la tienda, nunca se vendieron y suman $5,3 M de inventario que no existe.
  - "ÍTEMS MANUALES" es la categoría que más vende en 90 días: esas ventas no descuentan stock ni quedan ligadas a un producto.
  - Categorías partidas por falta de categoría asignada (CASCOS vs CASCO, CHAQUETAS vs CHAQUETA).
- **Limpieza de datos hecha el 2026-11-05 a pedido del usuario** (script con service role; cada cambio en
  `audit_logs` con `actor_email` "Claude Code (script, pedido del dueño 2026-11-05)" y su valor anterior):
  - Los 3 productos de demostración eliminados como lo hace el panel (`active=false`, `deleted_at`). No tenían ventas.
  - CHAQUETA IMPERMEABLE AZUL y VERDE DOBLE FAZ: categoría Chaquetas y costo $76.000 en sus 12 tallas (igual que sus
    gemelas MORADO y NEGRA DOBLE FAZ); la única venta afectada (AZUL L, YJBM-20261015-3823) pasó de costo $0 a $76.000.
  - Resultado: 0 productos sin categoría y 0 con costo $0; inventario $54,4 M; plata quieta $4,0 M.
- Arreglo de código el mismo día: las ventas de productos **borrados** del catálogo ahora suman en su categoría
  (antes caían en una categoría inferida del nombre: "CASCO" aparte de "CASCOS").

### Fase 3 — cómo quedó (2026-11-05)
- Migración `supabase/migrations/00059_inventory_snapshots.sql`: tabla `inventory_snapshots` (una foto por mes,
  `UNIQUE(year, month)`; lectura admin / admin de solo lectura, escritura solo del servidor). **Correrla en el
  Supabase de YJBMOTOCOM y en el de YBMOTOCOM.** Sin ella la pantalla funciona, pero solo muestra el inventario de hoy.
- `lib/finance/inventory-value.ts`: valor del inventario a costo con la misma regla de /admin/inventario (sin
  productos borrados; por variante si tiene tallas; el stock negativo no resta) y `takeInventorySnapshot` (reemplaza
  la foto del mes en curso, hora de Bogotá).
- Foto automática: `GET /api/cron/inventory-snapshot`, 11 pm de Bogotá (`vercel.json`, `0 4 * * *`). La última del
  mes queda como cierre. **Necesita `CRON_SECRET` en Vercel** (pendiente 2.1 de `docs/PENDIENTES.md`). Foto manual:
  botón "Guardar foto de hoy" (solo admin) → `POST /api/finance/inventory-snapshot` (queda en auditoría).
- `lib/finance/year-summary.ts` (`buildYearSummary`) + `GET /api/finance/year?year` → pestaña **Año** de
  Finanzas → Estado de resultados (`components/finanzas/year-view.tsx`): tarjetas del año, cierre general mes a
  mes (ventas, utilidad bruta, gastos, utilidad neta, margen, compras, pagado a proveedores, lo que quedó,
  inventario con variación), total y promedio; tarjetas en celular. Pruebas: `year-summary.test.ts` (6). Suite 181/181.
- Equivalencias con el Excel: Recompras → compras a proveedores (Facturas por fecha de llegada); Ganancia real →
  "Lo que quedó" = ventas − pagado a proveedores − gastos; Inventario 30|31 → foto de fin de mes.
- Decisiones tomadas al probar con datos reales:
  - **Pagado a proveedores** = abonos por fecha de pago **+ facturas marcadas pagadas sin abonos**, por su fecha de
    pago o, si no tiene, de llegada. Las facturas de feb-jul 2026 se cargaron en julio ya pagadas y sin abonos (los
    abonos se registran desde agosto): sin esta regla esos meses salían con $0 pagado.
  - **Un mes solo cuenta si tiene ventas o gastos.** Febrero 2026 tiene facturas cargadas pero ninguna venta: se
    muestran sus compras, pero no suma (si no, salía con una pérdida de $5,5 M por los gastos fijos).
  - El inventario de meses pasados **no se reconstruye** (no hay costo histórico confiable); el mes en curso
    muestra el valor de hoy, en vivo.
- Verificado con datos reales en Chromium (1366 y 390 px, sin desborde): octubre cuadra con la pestaña Mes.

Decisiones del usuario (2026-11-05):
- Arriendo, sueldo y luz se registran como gasto en Ventas del Día **y** están en Gastos Fijos → deben contar
  **solo como gasto fijo**. Regla aplicada: si el gasto fijo de esa categoría está configurado (> 0), el pago
  registrado mueve la cuenta pero no resta otra vez de la utilidad; si está en 0, el pago registrado sí resta.
  Mapa: Arriendo → arriendo, Sueldo → sueldo, Luz y Servicios → servicios.
- **Toda** compra de mercancía va por Facturas, nunca como gasto operativo (por eso no hay categoría "mercancía").

### Fase 1 — cómo quedó (2026-11-05)
- `apps/web/src/lib/finance/expense-classes.ts`: clase por categoría (`expenseClass`), `isCoveredByFixed`,
  `countsInUtility`, `utilityExpenseCents`, `fixedMonthlyTotalCents`, `expenseCategoryNote`. Pruebas:
  `src/__tests__/lib/expense-classes.test.ts` (9). Suite 162/162.
- `lib/expense-categories.ts`: 7 categorías nuevas (Servicios, Transporte, Publicidad, Mantenimiento,
  Gastos bancarios, Inversión, Retiro del dueño). Las 7 originales no cambian de nombre.
- Utilidad real ahora usa `utilityExpenseCents` en: Historial Mensual (tarjeta del mes, detalle por día y PDF,
  que además muestra aparte "otras salidas que no restan utilidad"), Reportes (tarjeta Utilidad Real) y Ventas
  del Día (utilidad del día; la tarjeta "Gastos operativos del día" sigue mostrando toda la plata que salió).
- Aviso debajo del selector de categoría (Ventas del Día al crear y editar, Presupuesto → Gastos) cuando la
  categoría es retiro, inversión o ya está en Gastos Fijos.
- **No cambió**: lo que se descuenta de las cuentas, Presupuesto (gastado vs presupuestado por categoría),
  Exportar/Importar, Cierres ni Mi Cuadre.
- YBMOTOCOM: solo código, sin migración. Replicada el 2026-11-05 junto con la Fase 2 (el usuario pidió llevar allá todo lo de este plan).

Origen: el usuario quiere llevar en YJBMOTOCOM el control que llevaba en el Excel `KOAJ_CARRENO2026.xlsx`
(y que el proyecto `CIERRE_KOAJ` ya reemplazó con Cuentas → Gastos / Mes / Año), complementado con un
"prompt maestro" de indicadores financieros. Este documento dice qué se toma, qué no y por qué.

---

## 1. Qué hacía el Excel y cómo lo resolvió KOAJ

El Excel tiene una hoja por mes (ventas diarias por medio, **recompras**, gastos operacionales, saldo por medio,
gastos fijos con aviso "registrado / no registrado") y dos hojas de resumen:

- **CierreGeneral2026**: por mes → Ventas, Recompras, Gastos operativos, Ganancia neta (ventas − gastos),
  Ganancia real (ventas − recompras − gastos), % de ganancia, y aparte el **inventario al cierre de cada mes**
  y cuánto subió. Total y promedio del año.
- **DATOS_ANUALES_2026**: lo vendido por medio de pago, mes a mes.

Lo más valioso que aprendió KOAJ al reemplazarlo (`CIERRE_KOAJ/.../docs/PLAN_CUENTAS_DIARIAS.md`):

1. **No toda salida de plata es gasto.** En septiembre KOAJ tenía $28,1 M de "gastos" y solo ~$4,1 M eran gasto
   operativo real; el resto eran inversiones, préstamos y retiros. Clasificar cada salida es lo que hace que la
   utilidad sea creíble.
2. La "ganancia real" del Excel (ventas − recompras − gastos) mide **cuánta plata quedó**, no cuánto se ganó:
   si el inventario sube, esa plata no se perdió, está en la tienda. Por eso se guarda el inventario de fin de mes.
3. KOAJ **no conoce el costo** de lo vendido (Alegra no lo da bien) y tiene que estimarlo con inventarios.

## 2. Qué tiene YA este sistema (no se duplica)

| Dato | Dónde vive | Comentario |
|---|---|---|
| Ventas (online + mostrador) con descuento por línea | `orders` / `order_items` (`discount_cents`) | Fuente de ventas |
| **Costo de cada venta** | `order_items.cost_cents` (foto del costo al vender) | Ventaja enorme sobre KOAJ: el costo de lo vendido es real, no estimado |
| Comisión por medio de pago | `payments.commission_cents` | Regla del negocio: se traslada al cliente, **no** resta ganancia. No se toca. |
| Gastos operativos con categoría | `operating_expenses` (7 categorías cerradas en `lib/expense-categories.ts`) | Se registran en Ventas del Día y Presupuesto |
| Gastos fijos mensuales | `store_settings.fixed_monthly_expenses` (arriendo, sueldo, servicios, otros) | Se restan completos en "Utilidad real" |
| Compras de mercancía (= las "recompras") | `supplier_invoices` + abonos (Facturas) | Los abonos debitan cuentas |
| Entrada de mercancía con costo | Inventario → Cargue de pedidos | Sube stock y costo, pero no queda ligado a una factura |
| Saldo por cuenta y foto mensual | `accounts`, `account_movements`, `account_closures` | Cuentas → Resumen / Cierres |
| Por cobrar | Fiado, Cuentas → Por cobrar, Addi / SisteCrédito / datáfono pendientes | |
| Presupuesto por categoría | `monthly_budgets` | |
| Historial Mensual / Reportes | ingresos, costo, ganancia neta, utilidad real, top y rentabilidad por producto, ticket promedio, comparación vs mes anterior, PDF | Ya cubre buena parte del "dashboard" del prompt |

Lo que **falta** de verdad: clasificar las salidas (retiro del dueño, inversión, financiero), un estado de
resultados con comparación, el resumen anual tipo CierreGeneral, el inventario de fin de mes, la rotación y
productos quietos, el punto de equilibrio y un flujo de caja que separe utilidad de plata disponible.

## 3. Hallazgos de integridad en lo que existe hoy (por confirmar con el usuario)

1. **Posible doble conteo de gastos fijos.** "Utilidad real" (Historial Mensual, Reportes, Ventas del Día) resta
   los gastos fijos de Configuración **y además** todos los gastos operativos, que incluyen las categorías
   Sueldo, Arriendo y Luz. Si el arriendo se registra como gasto en Ventas del Día *y* está en Configuración,
   cuenta dos veces.
2. **Ventas con costo $0.** Los ítems manuales (fuera de catálogo) y productos sin costo cargado entran con
   `cost_cents = 0`: inflan la ganancia sin aviso. Conviene mostrar cuántas ventas del mes no tienen costo.
3. **Sin lugar para retiros del dueño ni inversiones.** Hoy, si se registran, caen en "Otro" y bajan la utilidad
   como si fueran gasto (justo el error que el prompt pide evitar).
4. **Compras de contado.** Si alguna compra de mercancía se paga y se anota como gasto en vez de factura, la
   utilidad baja dos veces (como gasto y como costo cuando se venda).

## 4. Fórmulas (centralizadas en `apps/web/src/lib/finance/`, con pruebas)

Todas en COP, por mes calendario en hora de Bogotá, con divisiones por cero → "—" y aviso de dato faltante.

```
Ventas brutas        = Σ (cantidad × precio) de órdenes pagadas del periodo
Descuentos           = Σ order_items.discount_cents            (solo informativo; ya está en el dato)
Ventas netas         = Σ orders.total_cents pagadas             (= lo que hoy llama "Ingresos")
Transacciones        = número de órdenes pagadas
Ticket promedio      = Ventas netas ÷ Transacciones
Costo de lo vendido  = Σ cantidad × cost_cents                  (costo real guardado al vender)
Utilidad bruta       = Ventas netas − Costo de lo vendido
Margen bruto %       = Utilidad bruta ÷ Ventas netas
Markup %             = Utilidad bruta ÷ Costo de lo vendido
Gastos operativos    = gastos clase "operativo" del mes (+ gastos fijos de Configuración que NO estén
                       registrados como gasto, según la decisión del punto 3.1)
Utilidad operacional = Utilidad bruta − Gastos operativos
Gastos financieros   = gastos clase "financiero" (4x1000, cuota de manejo, intereses)
Utilidad neta        = Utilidad operacional − Gastos financieros   (sin impuestos: el sistema no los maneja)
Margen neto %        = Utilidad neta ÷ Ventas netas
Gastos / ventas %    = (Gastos operativos + financieros) ÷ Ventas netas
Nómina / ventas %    = gastos categoría Sueldo ÷ Ventas netas

Punto de equilibrio  = Gastos fijos del mes ÷ Margen bruto %     (ventas necesarias para no perder)
  por día            = Punto de equilibrio ÷ días que abre la tienda en el mes
Ventas para utilidad objetivo = (Gastos fijos + Utilidad objetivo) ÷ Margen bruto %

Compras del mes      = Σ supplier_invoices.amount con fecha de llegada en el mes   (las "recompras")
Plata que quedó (estilo Excel) = Ventas netas − Compras pagadas − Gastos (todas las salidas que no son inversión/retiro)
Inventario fin de mes = Σ stock × costo (productos + variantes), foto guardada el último día
Variación inventario = Inventario fin de mes − Inventario fin del mes anterior
Días de inventario   = Inventario actual ÷ (Costo de lo vendido de los últimos 30 días ÷ 30)
Rotación (veces/año) = Costo de lo vendido 12 meses ÷ Inventario promedio
```

Clasificación de cada categoría de gasto (mapa en código, sin cambiar la tabla):

| Clase | Categorías | ¿Resta utilidad? | ¿Resta plata? |
|---|---|---|---|
| Operativo | Montado, Relleno Cascos, Sueldo, Arriendo, Luz, Servicios, Transporte/Flete, Publicidad, Mantenimiento, Devueltas de dinero, Otro | Sí | Sí |
| Financiero | Comisiones bancarias / 4x1000 / intereses (nueva) | Sí (abajo de la operacional) | Sí |
| Inversión | Equipos y mejoras del local (nueva) | No (dura años) | Sí |
| Retiro del dueño | Retiro del dueño (nueva) | **No** | Sí |
| Mercancía | No va en gastos: va en **Facturas** | Solo cuando se vende (costo) | Sí, al abonar |

## 5. Fases propuestas

| Fase | Qué | Migración |
|---|---|---|
| 1 | **Clasificar las salidas**: categorías nuevas (Servicios, Transporte/Flete, Publicidad, Mantenimiento, Financiero, Inversión, Retiro del dueño), mapa categoría → clase en `lib/finance/`, y arreglo del doble conteo de gastos fijos según lo que decida el usuario. Los gastos viejos quedan como están (todas sus categorías siguen siendo "operativo"). | No |
| 2 | **Finanzas → Mes** (página nueva `/admin/finanzas`, solo admin y admin de solo lectura): estado de resultados del mes con cada fórmula visible, comparación vs mes anterior y mismo mes del año pasado, aviso de ventas sin costo, gastos por clase y categoría, punto de equilibrio y ventas para una utilidad objetivo. | No |
| 3 | **Finanzas → Año** (el CierreGeneral): 12 meses con ventas, costo, utilidad bruta, compras, gastos, utilidad neta, plata que quedó, %, inventario de fin de mes y su variación; total y promedio. Foto del inventario de fin de mes (tabla nueva + la toma el cron diario el último día del mes, o un botón). **El inventario de meses pasados no se puede reconstruir**: arranca desde el mes en que se suba. | Sí (1 tabla) |
| 4 | **Inventario y rentabilidad**: días de inventario, rotación, productos sin venta en 60/90 días con la plata quieta en ellos, baja rotación, rentabilidad por categoría. | No |
| 5 | **Flujo de caja y por cobrar / por pagar**: saldo inicial (cierre de cuentas del mes anterior) + entradas − salidas por clase = saldo final; por cobrar (fiado, por cobrar, Addi/SisteCrédito/datáfono pendientes); por pagar (facturas pendientes y próximas a vencer); "cuánto se puede retirar" = plata disponible − por pagar en 30 días − gastos fijos del próximo mes (marcado como estimado). | No |
| 6 | Exportar a Excel (exceljs ya está) e imprimir/PDF del estado de resultados y del año, igual que Historial Mensual. | No |

Cada fase: pruebas de las fórmulas (vitest), `tsc` sin errores nuevos, revisión en celular, este documento
actualizado, commit local en `main` sin push. La migración de la Fase 3 también se debe correr en YBMOTOCOM.

## 6. Lo que NO se hace del prompt, y por qué

| Pedido del prompt | Decisión | Razón |
|---|---|---|
| Módulo de descuentos y devoluciones | **No** | Los descuentos ya se guardan por línea: se muestran como una línea informativa, sin módulo nuevo. Las devoluciones ya se manejan con Cambios y cancelación de venta. |
| Balance general, ROA, ROE, endeudamiento, razón corriente, capital de trabajo | **No** | Necesitan activos fijos, patrimonio y deudas que el sistema no tiene. Calcularlos sería inventar números (el propio prompt lo prohíbe). |
| EBITDA y margen EBITDA | **No** | Sin depreciación ni intereses separados, el EBITDA sería igual a la utilidad operacional: un número repetido con otro nombre. |
| Utilidad antes de impuestos, IVA | **No** | El sistema no registra impuestos; eso lo lleva el contador. La utilidad neta se rotula "antes de impuestos". |
| IA que responde preguntas ("CFO virtual") | **No por ahora** | Cuesta por uso, necesita clave de API y puede contestar con seguridad algo mal calculado. Las preguntas del prompt quedan respondidas por las pantallas (Fases 2-5). Se puede evaluar después, sobre estas mismas fórmulas. |
| Costos directos/indirectos, fijos/variables, margen de contribución | **Parcial** | La clase de gasto y los gastos fijos de Configuración dan lo necesario para el punto de equilibrio; no se abre una contabilidad de costos aparte. |
| Filtros por semana y trimestre | **No** | Mes y año cubren el uso real; Ventas del Día ya cubre el día. |
| Control de duplicidad de ingresos, diferencia caja vs ventas | **Ya existe** | La venta es atómica en la BD; Cierres y Mi Cuadre ya comparan caja contra ventas. |
| Bonos regalo, regla 70/30, incentivos | **No** | Son de KOAJ (ropa, empleadas con metas); YJBMOTOCOM ya tiene meta por vendedor. |

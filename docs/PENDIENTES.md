# Pendientes por recordar — YJBMOTOCOM y YBMOTOCOM

> Lista viva de cosas abiertas que no se deben olvidar. Claude la revisa al
> inicio de cada sesión y la recuerda. Cuando algo se resuelva, se marca como
> hecho (con fecha) en la sección de abajo, en vez de borrarlo.
>
> Última revisión: 2026-11-09.

## 1. Migraciones sin correr en el Supabase de YBMOTOCOM

Correr **en orden** en el SQL Editor del Supabase de YBMOTOCOM (el código ya las tiene):

| Migración | Qué pasa si no se corre |
|---|---|
| `00056_addi_pending_releases.sql` | Cualquier venta por Addi en YBMOTOCOM falla |
| `00057_addi_backfill_sept12.sql` | Allá no cambia datos; se corre para no desordenar el historial de migraciones |
| `00058_account_notes.sql` | Falla guardar notas de una cuenta |
| `00059_loan_stock.sql` | Al llevar allá el cambio de préstamos, prestar productos y cambiar estados falla. Correrla antes de desplegarlo en YBMOTOCOM |
| `00060_inventory_snapshots.sql` | Finanzas → Año solo muestra el inventario de hoy (aviso amarillo); la foto de fin de mes (botón y tarea nocturna) falla |

Detalle en `docs/EXPANSION_SEGUNDA_TIENDA.md` (recordatorio al inicio).

## 1c. Pendientes del negocio (YJBMOTOCOM)

- **Crear en el catálogo el "casco de niños"** (pedido del usuario 2026-11-05). Hoy se vende como ítem manual
  ("CASCO DE NIÑA", $100.000 el 31-oct, factura YJBM-20261031-8370, sin costo). Recordárselo hasta que lo cree.
- **Pasar el costo de 15 ventas manuales que quedaron con costo $0** (últimos 90 días al 2026-11-05). Con los costos,
  Claude los corrige como las chaquetas doble faz (script con auditoría). Desde el 2026-11-05 ya no se puede vender un
  ítem manual sin costo.

  | Fecha | Factura | Ítem | Precio |
  |---|---|---|---|
  | 14-ago | YJBM-20260814-5111 | PARRILA GIXXER 150 | $120.000 |
  | 27-sep | YJBM-20260927-8980 | BASE TCOM | $25.000 |
  | 28-sep | YJBM-20260928-1790 | CASCO X ONE ABATIBLE | $190.000 |
  | 29-sep | YJBM-20260929-4933 | CHAQUETA PROTECCION | $140.000 |
  | 30-sep | YJBM-20260930-6409 | SILICONA SIOMONIZ | $20.000 |
  | 3-oct | YJBM-20261003-7357 | CASCO SPARTAN FENIX | $380.000 |
  | 7-oct | YJBM-20261007-1149 | BASE KYV2 | $20.000 |
  | 22-oct | YJBM-20261022-6070 | pijama sin maletro | $75.000 |
  | 24-oct | YJBM-20261025-1186 | PIJAMA SIN MALETERO | $85.000 |
  | 27-oct | YJBM-20261027-9112 | Q58MAX (2 uds) | $180.000 |
  | 27-oct | YJBM-20261027-9112 | Q58MAX (1 ud) | $120.000 |
  | 28-oct | YJBM-20261028-9243 | silicona simoniz | $20.000 |
  | 30-oct | YJBM-20261030-1142 | LAVADO CASCO | $35.000 |
  | 30-oct | YJBM-20261030-1142 | VISOR SHAFT 526 TORNASOL | $70.000 |
  | 31-oct | YJBM-20261031-8370 | CASCO DE NIÑA | $100.000 |

## 1d. Después del push, revisar YBMOTOCOM

- **⚠️ YBMOTOCOM no está publicando en Vercel (detectado 2026-11-05):** GitHub tiene todo (hasta `0d8dfa6`, autor
  YBMOTOCOM correcto), pero ybmotocom-web.vercel.app no tiene ninguna ruta de Finanzas (`/api/finance/month` da 404).
  El usuario debe revisar en Vercel (cuenta YBMOTOCOM → ybmotocom-web → Deployments) el estado del último despliegue
  (Blocked / Error / no aparece) y mandar captura. Ver `docs/DESPLIEGUE_VERCEL.md` del repo de YBMOTOCOM.

- Revisar allá Finanzas → Inventario (productos de demostración de `seed.sql`, productos sin categoría, costos en $0).
  La limpieza de datos del 2026-11-05 se hizo solo en YJBMOTOCOM.
- En YBMOTOCOM el código del control financiero ya está desplegado, pero Finanzas → Año no guarda el inventario de fin
  de mes hasta correr `00060_inventory_snapshots.sql` (punto 1). La auditoría del 31-oct (`00059_loan_stock.sql`)
  todavía no se ha llevado allá.

## 2. Seguridad (las dos tiendas)

### 2.1 `CRON_SECRET` sin configurar en Vercel
- **Avance 2026-11-05:** YJBMOTOCOM ya la tiene en Vercel (Production, tipo Secret); se activa con el próximo despliegue. **Falta YBMOTOCOM** (con otra clave distinta).
- **Qué es:** una clave secreta que usan las tareas automáticas (`/api/cron/*`: avisos de restock, resumen diario, backup, pedir reseña, carrito abandonado, foto mensual del inventario **y los desembolsos de Datáfono, Addi y SisteCrédito**).
- **Estado real:** el código ya la exige (`apps/web/src/lib/cron-auth.ts`). Mientras no exista en Vercel, esas tareas **no corren** (responden error 500). Si falta, **la plata de Datáfono, Addi y SisteCrédito nunca llega a las cuentas**. La fila 1 de `scripts/auditoria-ventas/diagnostico.sql` lo confirma.
- **YJBMOTOCOM (2026-10-31):** el diagnóstico no encontró desembolsos vencidos sin liberar, señal de que sus crons sí corren. No confirma la variable en Vercel y no dice nada de YBMOTOCOM.
- **Cómo se arregla:** acción manual, sin código. Vercel → proyecto → Settings → Environment Variables → `CRON_SECRET` con un valor largo y aleatorio → volver a desplegar. Hacerlo en los dos proyectos de Vercel (YJBMOTOCOM y YBMOTOCOM).

### 2.2 `npm audit`: dependencias con avisos de seguridad
- La revisión de 2026-10-31 (`npm audit --omit=dev`) encontró 29: 3 críticas, 7 altas, 15 moderadas y 4 bajas. En 2026-08 eran 17, casi todas por un `uuid` vulnerable que traen `exceljs`, `mercadopago`, `svix` y `resend`.
- **Cómo se arregla:** actualizar esas dependencias. Lo natural es hacerlo junto con la actualización de Next.js 14 → 15. Volver a correr `npm audit` en `apps/web` para ver el estado actual antes de empezar.

### 2.3 Sin verificación en dos pasos (2FA) para el admin
- El admin entra solo con contraseña, y ese panel maneja plata real.
- **Cómo se arregla:** requiere diseño propio. Evaluar Supabase Auth MFA (código de app tipo Google Authenticator).

### 2.4 Sin límite de intentos propio en el inicio de sesión y el registro (prioridad baja)
- Hoy depende solo del límite interno de Supabase Auth. Solo vale la pena si algún día se ven intentos de adivinar contraseñas.

## 3. Auditoría de ventas e inventario (2026-10-31)

Detalle, pruebas y plan en `docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md`. Nada de esto está corregido todavía.

- **Corregir en YJBMOTOCOM las filas 8 y 9 del diagnóstico** del 2026-10-31: 16 pagos sin cuenta por $4.198.000 y 2 con cuenta distinta por $350.000. El detalle y la causa están en la sección 9 de la auditoría. Antes de tocar saldos hay que confirmar que esa plata no se haya cuadrado ya con un ajuste manual.
- **Verificar el despliegue en YJBMOTOCOM** del cambio de préstamos y de autorización de admin para cancelar, editar y cambiar método masivo (código enviado a GitHub el 2026-10-31). La migración `00059_loan_stock.sql` ya se corrió allá. Probarlo con un vendedor real en el navegador.
- **Plata:** editar una venta ya desembolsada duplica el dinero; cancelarla no lo saca; se puede cancelar dos veces; el cambio masivo de método no mueve la plata; al editar se sigue aceptando un pago "Sin cuenta".
- **Inventario:** falta blindar la doble cancelación, las ventas sin talla, los ajustes y el formulario de producto, que puede pisar el stock.

## Resueltos

- **Push del detalle de desembolsos en Cuentas (2026-11-09):** YJBMOTOCOM `a3f6109..874bc4d` y YBMOTOCOM `81b77b5..3926225`
  (sin cambios nuevos en la nube antes de subir).

- **Push de Ventas por día y Gastos (2026-11-05, tarde):** YJBMOTOCOM `6ae1c88..c8b1459` y YBMOTOCOM `32e1b77..0d8dfa6` (sin cambios nuevos en la nube antes de subir).

- **Push de las dos tiendas (2026-11-05):** YJBMOTOCOM `79cef2a..2e54c5f` (control financiero completo + merge con la
  auditoría del 31-oct hecha en el otro PC) y YBMOTOCOM `6d91296..32e1b77`. La migración de la foto del inventario pasó
  a llamarse `00060_inventory_snapshots.sql` para no chocar con `00059_loan_stock.sql`.

- **Migración de la foto del inventario en el Supabase de YJBMOTOCOM:** corrida por el usuario el 2026-11-05 cuando se llamaba `00059_inventory_snapshots.sql` (verificado: la tabla `inventory_snapshots` existe). Ese mismo día se renombró a `00060_inventory_snapshots.sql` porque el 31-oct ya existía otra 00059 (`00059_loan_stock.sql`, también corrida en YJBMOTOCOM): **no hay que volver a correrla allá**. En YBMOTOCOM siguen pendientes las dos (punto 1).

- **CORS abierto en toda la API:** corregido el 2026-08-20; se quitó el bloque de `vercel.json`. Verificado de nuevo el 2026-10-28: no queda en ningún lado de la configuración.

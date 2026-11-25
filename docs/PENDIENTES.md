# Pendientes por recordar — YJBMOTOCOM y YBMOTOCOM

> Lista viva de cosas abiertas que no se deben olvidar. Claude la revisa al
> inicio de cada sesión y la recuerda. Cuando algo se resuelva, se marca como
> hecho (con fecha) en la sección de abajo, en vez de borrarlo.
>
> Última revisión: 2026-11-25.
>
> **Regla del usuario (2026-11-09):** lo de YBMOTOCOM (Vercel sin publicar, migraciones de la sección 1,
> `CRON_SECRET`) se recuerda en cada sesión y al cerrar cada tarea **hasta que el usuario lo confirme con
> evidencia** (captura de Vercel/Supabase o verificación en vivo). Decir "ya lo hice" no basta para pasarlo
> a Resueltos.

## Resumen rápido por tienda (verificado 2026-11-21)

**Estado de YJBMOTOCOM verificado el 2026-11-21:**
- Local y GitHub al día (`main` = `origin/main` = `9b5323a`).
- Vercel publicó los tres pushes de estos días: préstamos (`affa8e8`), 4x1000 (`90ad9c9`) y categorías (`9b5323a`), con
  "Deployment has completed".
- Migraciones 00062, 00063 y 00064 corridas en su Supabase.
- **Revisado en vivo en www.yjbmotocom.com el 2026-11-21 (10:50 a. m.)**, solo mirando, sin guardar nada:
  - Facturas → Abonar muestra el campo "Fecha del abono" (hoy por defecto). Con $100.000 desde NEQUI muestra
    Subtotal $100.000 + 4x1000 $400 = Total $100.400.
  - Ventas del Día tiene en la lista "Gasto operativo" y "4X1000 impuestos (Gastos Bancarios)". El gasto manual de
    4x1000 de Nequi de hoy ya sale con el nombre nuevo, o sea que la 00064 renombró los datos.
- **Abonos de la mañana del 2026-11-21:** IMPERMABLES (QR $628.573 y NU $1.371.427), INTERCOMUNICADORES (NU
  $2.000.000 y Efectivo $344.000) y GUANTEX FOX (Nequi $1.210.000). Se hicieron de 7:54 a 8:01 a. m., antes de que se
  publicara el 4x1000 automático (9:26 a. m.), y por eso no lo tienen. A las 9:32 y 9:34 se registraron a mano dos gastos
  de 4x1000: NU $15.471 y Nequi $21.916. **No volver a cobrarlo.** Que el usuario confirme que esos dos gastos cubren
  lo que cobró el banco.
- Falta probar con una operación real después del cambio (puntos 1 y 2).

**YJBMOTOCOM** (este repo): el 2026-11-25 se subieron las etiquetas de Facturas (unificación sección 102); solo
textos, sin migración.
1. Probar con una operación real (la pantalla ya se revisó en vivo, ver arriba):
   - el próximo abono a factura desde Nequi, NU o QR: revisar en Cuentas → Movimientos que salgan el abono y una línea
     "4x1000: Abono a factura…";
   - un abono con fecha de ayer;
   - una transferencia desde una cuenta que no sea efectivo (secciones 00 y 000).
2. Probar Cobrar en Préstamos con un préstamo real (sección 0a; el despliegue ya está confirmado).
3. Pasar el costo de las 15 ventas manuales que quedaron con costo $0 (sección 1c).
4. Corregir los 16 pagos sin cuenta y los 2 con cuenta distinta (sección 3).
5. Verificar en vivo la autorización de admin para cancelar y editar ventas (sección 3).
6. Bugs de plata e inventario de la auditoría del 31-oct (sección 3).
7. **Seguridad, prioridad alta:** quitarle al rol público (`anon`) el permiso de ejecutar las 20 funciones expuestas
   (sección 2.5).
8. Seguridad: `npm audit` (19 avisos al 2026-11-21), 2FA para el admin y límite de intentos de inicio de sesión
   (sección 2).

**YBMOTOCOM** (repo `C:\Users\JJBarajas\Pictures\YOJAN`). Puesta al día del 2026-11-25:
- **Código ya igual a YJBMOTOCOM** en 10 commits locales (`0cc273e`..`f8fcbaa`, autor YBMOTOCOM), sin push. Incluye el
  4x1000 en abonos (00063), las categorías (00064), las etiquetas de Facturas y la **autorización de admin para
  cancelar/editar/cambiar método** (parte de `79cef2a` del 31-oct que nunca se había llevado). Solo quedan distintos
  `brand.ts`, contacto y FAQ. `tsc`, lint y 267/267 pruebas OK. Los hashes viejos (`85042ed`, `0bcf0a2`, `8a02aa2`,
  `11e65ea`, `9ee404e`) cambiaron al ponerles autor YBMOTOCOM.
- **Causa de "Vercel no publica":** producción está fijada a un *Instant Rollback* del 4-sep. Mientras siga así, los
  despliegues nuevos no pasan a producción solos. Hay que deshacer el rollback (o promover el último despliegue)
  **después** de las migraciones y el push.

1. Correr en su Supabase `scripts/verificar-migraciones-00056-00064.sql` (solo lectura) y mandar captura.
2. Correr, **en orden**, las que salgan "FALTA" de la 00056 a la 00064 (sección 1).
3. Push de los 10 commits.
4. Vercel: deshacer el Instant Rollback / promover el último despliegue y confirmar "Deployment has completed".
5. Configurar `CRON_SECRET` en Vercel, con una clave distinta a la de YJBMOTOCOM (sección 2.1).
6. Revisar los datos de Finanzas → Inventario: productos de demostración, productos sin categoría y costos en $0
   (sección 1d).
7. Cerrar allá también las funciones expuestas a `anon` (sección 2.5).

## 000. ⚠️ Migración `00064_rename_gmf_category.sql` (categorías de gasto) — falta YBMOTOCOM

Cambio del 2026-11-21:
- "Gastos bancarios" pasa a llamarse **"4X1000 impuestos (Gastos Bancarios)"**, también en los gastos y presupuestos
  ya guardados. El 4x1000 automático cae ahí.
- Categoría nueva **"Gasto operativo"**.

No mueve plata. Detalle en `docs/UNIFICACION_YJBMOTOCOM.md` sección 101.

Correrla y subir el código enseguida. Si el código sube primero, el 4x1000 automático sigue saliendo con el nombre
viejo hasta correrla. Si la migración va primero, la utilidad no cambia, pero la línea de gasto financiero lo muestra
como operativo hasta el push.

- [x] YJBMOTOCOM: corrida por el usuario el 2026-11-21. La captura del SQL Editor muestra el archivo completo (143
  líneas) con "Success". Supabase corre todo junto, así que si algo fallaba no habría guardado nada. Código subido el
  mismo día.
- [x] YJBMOTOCOM: Vercel publicó el código (`9b5323a`, "Deployment has completed", revisado el 2026-11-21).
- [x] YJBMOTOCOM: revisado en vivo el 2026-11-21. Las categorías salen en la lista y los gastos guardados ya tienen el
  nombre nuevo.
- [ ] YBMOTOCOM: replicar y correr después de la 00063.

## 00. ⚠️ Migración `00063_gmf_payments_transfers.sql` (4x1000 en abonos, transferencias y préstamos; fecha del abono) — falta YBMOTOCOM

Cambio del 2026-11-21: abonar una factura, transferir entre cuentas y cerrar una deuda de préstamo en plata cobran el
4x1000 si la cuenta no es efectivo (va aparte como gasto en "4X1000 impuestos (Gastos Bancarios)", nombre desde la 00064). El abono también tiene fecha editable.
Detalle en `docs/UNIFICACION_YJBMOTOCOM.md` sección 100.

**Correrla en el SQL Editor de Supabase ANTES de subir el código.** Si el código llega primero, fallan abonar,
transferir, cerrar deudas en plata y Finanzas → Gastos (columnas y parámetros nuevos). Es aditiva: lo registrado antes
queda igual, sin 4x1000.

- [x] YJBMOTOCOM: corrida por el usuario el 2026-11-21. Verificada con capturas del SQL Editor:
  - existen las 4 columnas nuevas;
  - `charge_account_gmf` existe;
  - `pay_supplier_invoice`, `transfer_between_accounts` y `close_borrowed_loan` están con sus parámetros nuevos y sin
    versiones viejas duplicadas.

  El código se subió el mismo día y Vercel lo publicó (`90ad9c9`, "Deployment has completed").
- [ ] YJBMOTOCOM: probar en vivo un abono desde Nequi o NU (debe salir el 4x1000 como gasto y en la cuenta), uno con
  fecha de ayer y una transferencia.
- [ ] YBMOTOCOM: replicar el cambio en su repo y correr la 00063 allá después de las de la sección 1.
- Prueba de la migración: escenarios en PGlite (ver sección 100 de unificación).

## 0a. ⚠️ Migración `00062_loans_no_stock.sql` (préstamos sin inventario; Cobrar = venta) — falta en las DOS tiendas

Cambio del 2026-11-18, decidido por el usuario (reemplaza la regla de la 00059):
- Prestar y devolver **no mueven inventario**.
- **Cobrar** crea la venta, y esa sí baja el inventario y mete la plata a la cuenta.
- Cancelar esa venta reabre el préstamo.
- **Debemos** tiene "Lo vendí" (venta manual que no toca nuestro inventario) y "Cerrar deuda", que cierra de una de tres formas:
  - misma unidad;
  - una igual de surtido (baja 1 si ya está ingresada);
  - en plata (pago a proveedor; el costo de la venta pasa a ser lo pagado).
- Inventario avisa qué productos están prestados.

La migración también **corrige datos**: devuelve al inventario lo que la 00059 dejó descontado en préstamos pendientes y
cobrados. En YJBMOTOCOM eso es lo siguiente (revisado el 2026-11-18):
- 4 pendientes: intercomunicador HERO a RENZO, guante JDL L, casco XONE M a YOJAN FRANCO y diadema a RAMIRO.
- 2 cobrados que también se vendieron por Registrar Venta, confirmado por el usuario: casco XTRONG R1 XL a EDEN y casco
  XTRONG R1 L a BRAYAN BETO.

Es idempotente: correrla dos veces no suma doble.

**Correrla en el SQL Editor de Supabase ANTES de subir el código.** Si el código llega primero, la pantalla de Préstamos
y la tarjeta de préstamos de Ventas del Día no cargan.

- [x] YJBMOTOCOM: corrida por el usuario el 2026-11-18. Claude la verificó en la base y en el navegador local:
  columnas y funciones nuevas creadas y `stock_deducted` en NULL. Hubo 5 correcciones de +1 (cascos XTRONG R1 XL y L,
  intercomunicador HERO, guante JDL L y casco XONE M). La diadema de RAMIRO no hizo falta, porque se marcó "Devuelto"
  ese día antes de la migración y ya había recuperado su unidad.
- [x] YJBMOTOCOM: push del código el 2026-11-18 (`0407238..c83f671`), sin cambios nuevos en la nube antes de subir.
  Vercel lo publicó: `affa8e8` con "Deployment has completed", revisado el 2026-11-21.
- [ ] YJBMOTOCOM: probar Cobrar con un préstamo real.
- [ ] YBMOTOCOM: correr `00059_loan_stock.sql` y luego `00062_loans_no_stock.sql`, en ese orden y después de las de la
  sección 1. Después hacer el push. Allá no hay préstamos descontados, así que la corrección no cambia nada. El código
  está en los commits locales `8a02aa2` y `11e65ea`, encima de `85042ed` y `0bcf0a2` (en `C:\Users\JJBarajas\Pictures\YOJAN`), y sigue
  **sin push a propósito**.
- Pruebas: `scripts/auditoria-ventas/audit.mjs` (casos B13, L* y D*) y `scripts/auditoria-ventas/transicion-00062.mjs`
  (la corrección de datos).

## 0. ⚠️ Migración `00061_expense_gmf_notes.sql` (4x1000 y observaciones en gastos) — falta YBMOTOCOM

Cambio del 2026-11-17: los gastos que salen de una cuenta que no es efectivo cobran el 4x1000 automático (subtotal +
4x1000 = total que sale de la cuenta) y tienen observaciones. **Correrla en el SQL Editor de Supabase ANTES de subir el
código (push)**, primero en YJBMOTOCOM y luego en YBMOTOCOM. Si el código llega a Vercel sin la migración, **registrar,
editar y borrar gastos falla** (la función `record_operating_expense` cambia de parámetros).

- [x] YJBMOTOCOM: corrida por el usuario el 2026-11-17 (verificado por Claude: existen `operating_expenses.gmf_cents`, `notes`,
  `parent_expense_id` y la versión nueva de `record_operating_expense`). Código subido el mismo día.
- [ ] YBMOTOCOM: correr `00061_expense_gmf_notes.sql` (después de las de la sección 1). El código está en un commit local
  (`85042ed`, y encima `0bcf0a2` de préstamos, en `C:\Users\JJBarajas\Pictures\YOJAN`) **sin push a propósito**: subirlos
  solo después de correr la migración allá.

## 1. Migraciones sin correr en el Supabase de YBMOTOCOM

Correr **en orden** en el SQL Editor del Supabase de YBMOTOCOM (el código ya las tiene):

| Migración | Qué pasa si no se corre |
|---|---|
| `00056_addi_pending_releases.sql` | Cualquier venta por Addi en YBMOTOCOM falla |
| `00057_addi_backfill_sept12.sql` | Allá no cambia datos; se corre para no desordenar el historial de migraciones |
| `00058_account_notes.sql` | Falla guardar notas de una cuenta |
| `00059_loan_stock.sql` | La 00062 la necesita (correrla justo antes de la 00062) |
| `00060_inventory_snapshots.sql` | Finanzas → Año solo muestra el inventario de hoy (aviso amarillo); la foto de fin de mes (botón y tarea nocturna) falla |
| `00061_expense_gmf_notes.sql` | Registrar, editar y borrar gastos falla en cuanto se publique el cambio del 4x1000 (ver sección 0) |
| `00062_loans_no_stock.sql` | Préstamos y la tarjeta de préstamos de Ventas del Día no cargan en cuanto se publique el cambio de préstamos (ver sección 0a) |
| `00063_gmf_payments_transfers.sql` | Abonar, transferir, cerrar deudas en plata y Finanzas → Gastos fallan en cuanto se publique el cambio del 4x1000 en abonos (ver sección 00) |
| `00064_rename_gmf_category.sql` | El 4x1000 sigue saliendo como "Gastos bancarios" (ver sección 000) |

Detalle en `docs/EXPANSION_SEGUNDA_TIENDA.md` (recordatorio al inicio).

## 1c. Pendientes del negocio (YJBMOTOCOM)

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
  de mes hasta correr `00060_inventory_snapshots.sql` (punto 1). El cambio de préstamos (00059 + 00062) todavía no se
  ha llevado allá (sección 0a).

## 2. Seguridad (las dos tiendas)

### 2.1 `CRON_SECRET` sin configurar en Vercel
- **Avance 2026-11-05:** YJBMOTOCOM ya la tiene en Vercel (Production, tipo Secret); se activa con el próximo despliegue. **Falta YBMOTOCOM** (con otra clave distinta).
- **Qué es:** una clave secreta que usan las tareas automáticas (`/api/cron/*`: avisos de restock, resumen diario, backup, pedir reseña, carrito abandonado, foto mensual del inventario **y los desembolsos de Datáfono, Addi y SisteCrédito**).
- **Estado real:** el código ya la exige (`apps/web/src/lib/cron-auth.ts`). Mientras no exista en Vercel, esas tareas **no corren** (responden error 500). Si falta, **la plata de Datáfono, Addi y SisteCrédito nunca llega a las cuentas**. La fila 1 de `scripts/auditoria-ventas/diagnostico.sql` lo confirma.
- **YJBMOTOCOM (2026-10-31):** el diagnóstico no encontró desembolsos vencidos sin liberar, señal de que sus crons sí corren. No confirma la variable en Vercel y no dice nada de YBMOTOCOM.
- **Cómo se arregla:** acción manual, sin código. Vercel → proyecto → Settings → Environment Variables → `CRON_SECRET` con un valor largo y aleatorio → volver a desplegar. Hacerlo en los dos proyectos de Vercel (YJBMOTOCOM y YBMOTOCOM).

### 2.2 `npm audit`: dependencias con avisos de seguridad
- **2026-11-21:** `npm audit --omit=dev` da 19 avisos: 2 críticos, 7 altos, 9 moderados y 1 bajo. Incluye `sharp`
  (libvips).
- La revisión de 2026-10-31 había encontrado 29: 3 críticas, 7 altas, 15 moderadas y 4 bajas. En 2026-08 eran 17, casi todas por un `uuid` vulnerable que traen `exceljs`, `mercadopago`, `svix` y `resend`.
- **Cómo se arregla:** actualizar esas dependencias. Lo natural es hacerlo junto con la actualización de Next.js 14 → 15. Volver a correr `npm audit` en `apps/web` para ver el estado actual antes de empezar.

### 2.3 Sin verificación en dos pasos (2FA) para el admin
- El admin entra solo con contraseña, y ese panel maneja plata real.
- **Cómo se arregla:** requiere diseño propio. Evaluar Supabase Auth MFA (código de app tipo Google Authenticator).

### 2.4 Sin límite de intentos propio en el inicio de sesión y el registro (prioridad baja)
- Hoy depende solo del límite interno de Supabase Auth. Solo vale la pena si algún día se ven intentos de adivinar contraseñas.

### 2.5 ⚠️ Funciones de plata ejecutables por el rol público (`anon`), prioridad alta
- **Encontrado el 2026-11-21** probando la 00064. En Postgres una función nueva queda ejecutable por PUBLIC, y Supabase
  además le da permiso a `anon` y `authenticated`. Muchas migraciones solo hicieron `GRANT ... TO service_role`, sin
  `REVOKE`.
- Son `SECURITY DEFINER`, así que alguien con la llave pública (la que va en la web) podría llamar `/rest/v1/rpc/...` y
  mover saldos. Las de la 00062 y la 00063 ya tienen `REVOKE`.
- **Lista completa (2026-11-21):** son 20 funciones, sacadas de la base de pruebas con todas las migraciones.
  - Plata e inventario: `adjust_account_balance`, `cancel_pos_sale`, `create_pos_sale` (2 versiones),
    `edit_pos_sale`, `record_operating_expense`, `delete_operating_expense`, `delete_supplier_invoice`,
    `pay_customer_credit`, `delete_customer_credit`, `release_addi_pending`, `release_card_pending` y
    `release_sistecredito_pending`.
  - Tienda y puntos: `create_order_with_items`, `award_loyalty_points`, `redeem_loyalty_points`,
    `redeem_loyalty_points_for_coupon` y `set_review_verified_purchase`.
  - Seguramente necesarias para RLS y triggers (**no quitarles el permiso sin revisar**): `get_user_role` y
    `prevent_role_self_escalation`.
  - En la base real puede haber diferencias; confirmar con la consulta del punto 2.
- **Cómo se arregla:**
  1. Una migración que haga `REVOKE ALL ... FROM PUBLIC, anon, authenticated` en todas las funciones del esquema
     público que mueven plata o inventario. Antes hay que confirmar que ninguna se llama desde el navegador; la app
     las llama desde el servidor con `service_role`.
  2. Verificar en el SQL Editor con
     `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE') and prosecdef;`
  3. Hacerlo en las dos tiendas.

## 3. Auditoría de ventas e inventario (2026-10-31)

Detalle, pruebas y plan en `docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md`. Nada de esto está corregido todavía
(re-verificado el 2026-11-21: `audit.mjs` sigue dando las mismas 17 fallas B*).

- **Corregir en YJBMOTOCOM las filas 8 y 9 del diagnóstico** del 2026-10-31: 16 pagos sin cuenta por $4.198.000 y 2 con cuenta distinta por $350.000. El detalle y la causa están en la sección 9 de la auditoría. Antes de tocar saldos hay que confirmar que esa plata no se haya cuadrado ya con un ajuste manual.
- **Verificar el despliegue en YJBMOTOCOM** de la autorización de admin para cancelar, editar y cambiar método masivo (código enviado a GitHub el 2026-10-31). Probarlo con un vendedor real en el navegador. (La regla de préstamos de esa fecha se reemplazó el 2026-11-18, ver sección 0a.)
- **Plata:** editar una venta ya desembolsada duplica el dinero; cancelarla no lo saca; se puede cancelar dos veces; el cambio masivo de método no mueve la plata; al editar se sigue aceptando un pago "Sin cuenta".
- **Inventario:** falta blindar la doble cancelación, las ventas sin talla, los ajustes y el formulario de producto, que puede pisar el stock.

## Resueltos

- **Categorías de gasto, YJBMOTOCOM (2026-11-21):** migración `00064_rename_gmf_category.sql` corrida (captura con
  "Success") y código subido. "Gastos bancarios" ahora es "4X1000 impuestos (Gastos Bancarios)" y existe "Gasto
  operativo". En YBMOTOCOM sigue pendiente (sección 000).

- **4x1000 en abonos, transferencias y préstamos; fecha del abono, YJBMOTOCOM (2026-11-21):** migración
  `00063_gmf_payments_transfers.sql` corrida y verificada (capturas del SQL Editor); código subido. Falta la prueba en
  vivo y YBMOTOCOM (sección 00).

- **Casco de niños en el catálogo (2026-11-17):** creados `CASCO NIÑO` (SKU 42) y `CASCO NIÑA` (SKU 43), categoría
  Cascos, costo $80.000, precio $120.000, 0 unidades y sin tallas (decisión del usuario). Quedan sin publicar en la
  tienda online, como los demás ingresados recientes (se venden en mostrador; se publican desde Catálogo cuando tengan
  foto). Falta cargarles inventario.

- **4x1000 y observaciones en gastos, YJBMOTOCOM (2026-11-17):** migración `00061_expense_gmf_notes.sql` corrida y
  verificada; código subido. En YBMOTOCOM sigue pendiente (sección 0).

- **Push del detalle de desembolsos en Cuentas (2026-11-09):** YJBMOTOCOM `a3f6109..874bc4d` y YBMOTOCOM `81b77b5..3926225`
  (sin cambios nuevos en la nube antes de subir).

- **Push de Ventas por día y Gastos (2026-11-05, tarde):** YJBMOTOCOM `6ae1c88..c8b1459` y YBMOTOCOM `32e1b77..0d8dfa6` (sin cambios nuevos en la nube antes de subir).

- **Push de las dos tiendas (2026-11-05):** YJBMOTOCOM `79cef2a..2e54c5f` (control financiero completo + merge con la
  auditoría del 31-oct hecha en el otro PC) y YBMOTOCOM `6d91296..32e1b77`. La migración de la foto del inventario pasó
  a llamarse `00060_inventory_snapshots.sql` para no chocar con `00059_loan_stock.sql`.

- **Migración de la foto del inventario en el Supabase de YJBMOTOCOM:** corrida por el usuario el 2026-11-05 cuando se llamaba `00059_inventory_snapshots.sql` (verificado: la tabla `inventory_snapshots` existe). Ese mismo día se renombró a `00060_inventory_snapshots.sql` porque el 31-oct ya existía otra 00059 (`00059_loan_stock.sql`, también corrida en YJBMOTOCOM): **no hay que volver a correrla allá**. En YBMOTOCOM siguen pendientes las dos (punto 1).

- **CORS abierto en toda la API:** corregido el 2026-08-20; se quitó el bloque de `vercel.json`. Verificado de nuevo el 2026-10-28: no queda en ningún lado de la configuración.

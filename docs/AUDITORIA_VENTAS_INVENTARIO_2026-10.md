# Auditoría de ventas, cuentas e inventario — 2026-10-31

**Pregunta:** cuando se hace inventario parece que faltan cosas. ¿Es falla del sistema o falla física?

**Respuesta corta:** el flujo normal funciona bien, pero el sistema **no queda descartado**. Tiene caminos reales que dejan más stock en pantalla del que hay en el local. Cuánto pesa cada uno solo se sabe corriendo el diagnóstico sobre los datos reales.

## 1. Cómo se probó

- Se levantó un Postgres local con las **58 migraciones reales** y se ejecutaron las funciones reales (`create_pos_sale`, `edit_pos_sale`, `cancel_pos_sale`, `release_*`) con el formato que manda la API. No se tocó producción.
- Se leyó el código de ventas, cancelación, edición, cambios, préstamos, ajustes, importación de Excel, tienda online, crons y cierres.
- **Resultado inicial:** 36 escenarios, 18 correctos y 18 con falla o con un hueco de control. Con los préstamos corregidos (sección 8): 45 escenarios, 28 correctos y 17 pendientes.
- Repetir: `scripts/auditoria-ventas/` (ver sección 7).

**Límites.** No hay acceso a la base de datos de producción desde este equipo, así que aquí no hay ninguna cifra real del negocio. Las pruebas son sobre las funciones de base de datos, no con clics en el navegador. Los casos B6, B11, B12 y B14 reproducen los mismos pasos que hace la ruta o la pantalla. La concurrencia real (dos ventas en el mismo instante) se revisó leyendo el código, no ejecutándola: la función bloquea la fila con `FOR UPDATE`.

## 2. Lo que funciona bien

| Prueba | Resultado |
|---|---|
| Venta con talla y sin talla | Descuenta exacto y deja su movimiento |
| Efectivo, Nequi, Daviplata, transferencia, NU, QR | Suman de inmediato a su cuenta |
| Datáfono, Addi, SisteCrédito | Quedan pendientes y se liberan una sola vez, aunque se repita el proceso |
| SisteCrédito | Suma el margen configurado al liberar (5 % en la prueba) |
| Pago combinado | Cada parte va a su cuenta |
| Cancelar el mismo día, o antes del desembolso | Stock y plata vuelven exactos |
| Editar cantidad y método (efectivo → Nequi) | Revierte y vuelve a aplicar bien |
| Venta forzada sin stock | Nunca deja stock negativo y al cancelar devuelve solo lo descontado |
| Venta sin stock y sin forzar | Se rechaza completa, sin dejar nada a medias |

## 3. Por qué el inventario puede dar "faltantes"

Todos estos casos dejan **más stock en el sistema que en el físico**, que es lo que se ve al contar.

| ID | Qué pasa | Efecto probado | Origen |
|---|---|---|---|
| B13 | **Un préstamo a otro almacén no descuenta stock.** Solo guarda una nota. | Sistema 5, físico 4 | Diseño heredado del software local |
| B10 | **Un ítem "fuera de catálogo" no descuenta nada.** Si se vende así un producto que sí existe, el stock no baja y no queda movimiento. | Sistema 9, físico 8 | Diseño, sin control |
| B12 | **El ajuste de conteo escribe la cantidad final.** Se cuentan 10, se venden 2 y luego se digita el 10: la venta se borra del stock. | Sistema 10, físico 8 | Sistema + proceso |
| B11 | **Un formulario de producto abierto pisa el stock** (productos sin talla). Guarda el número que había al abrirlo, sin dejar movimiento. | Sistema 10, físico 8 | Bug |
| B1 | **Se puede cancelar dos veces la misma venta** (dos pantallas abiertas). No hay ningún bloqueo en la base de datos. | Stock +2 de más y caja -$100.000 de más | Bug |
| B7 | **Un producto con tallas vendido sin talla:** el descuento desaparece en la siguiente sincronización. | Producto 7, reales 5 | Bug, poco probable por pantalla |
| — | **Importar un Excel viejo** reescribe el stock de las tallas con el número del archivo, sin movimiento. Solo admin. | Leído en código | Bug |
| — | **Cancelar devuelve el stock automáticamente**, sin confirmar que la mercancía volvió, y un vendedor puede hacerlo sin motivo ni aprobación. | Leído en código | Hueco de control |

**Causas que el sistema no puede ver:** talla equivocada al vender (una talla sobra y la otra falta), hurto, devoluciones dañadas que entraron como disponibles en un Cambio, y errores del conteo inicial migrado el 22/07/2026.

Pista útil: si el total de un modelo cuadra pero las tallas no, casi siempre es talla equivocada, no pérdida.

## 4. Fallas de plata

| ID | Qué pasa | Efecto probado | Gravedad |
|---|---|---|---|
| — | **Si falta `CRON_SECRET` en Vercel, el datáfono, Addi y SisteCrédito nunca llegan a las cuentas.** `PENDIENTES.md` no los listaba entre las tareas afectadas. | Esos crons usan la misma validación. Lo confirma la fila 1 del diagnóstico. | Crítica si aplica |
| B3 | **Editar una venta de datáfono o Addi ya desembolsada duplica la plata**, aunque solo se corrija el nombre del cliente. SisteCrédito usa el mismo código. | Entró $100.000 de una venta de $50.000 | Alta |
| B2 | **Cancelar datáfono, Addi o SisteCrédito después del desembolso no saca la plata.** El stock sí vuelve. | La cuenta conserva $50.000 / $52.500 | Alta |
| B5 | **Lo mismo con datáfono abonado antes de la migración 00055.** | Sin reversa | Alta |
| B4 | **Una venta cancelada se puede editar** desde una pantalla vieja y vuelve a generar desembolso. | Entró $50.000 de una venta cancelada | Media |
| B1 | **Doble cancelación:** resta la plata dos veces. | Caja -$100.000 | Media |
| B6 | **El cambio masivo de método no mueve la plata.** Efectivo → Nequi: el reporte dice Nequi y la plata sigue en caja. Efectivo → Datáfono y cancelar: la plata se queda. | Reporte y saldo no cuadran | Media |
| B9 | **Un pago "Sin cuenta" se acepta.** Al agregar un pago en Editar la cuenta arranca vacía, y cambiar el método no cambia la cuenta. | La plata no entra a ninguna cuenta | Media |

## 5. Hallazgos menores

- **B8:** vender una talla, borrarla y cancelar la venta pierde esa unidad (sistema con menos, no con más).
- **B14:** un reembolso desde Stripe o MercadoPago no devuelve el stock.
- **Pago duplicado online:** la protección es por evento. Si se confirma el pago a mano y después llega el webhook, descuenta dos veces. Leído en código.
- **Número de factura:** son 4 dígitos al azar por día, y dos ventas pueden chocar. Con 20 ventas al día, cerca de 2 % de probabilidad diaria; con 50, cerca de 12 %. No daña datos: la venta se rechaza con un error genérico y se reintenta. Salió de verdad durante las pruebas.
- **Cierres:** la pantalla trae máximo 50 ventas por día. Con más, el esperado queda corto.
- **Rastro:** cambiar stock desde el formulario de producto o crear una talla con stock inicial no deja movimiento. Las reversas no guardan quién las hizo, aunque `audit_logs` sí.
- **Permisos:** las reglas de la base de datos dejan a un vendedor modificar productos y tallas directamente, aunque la pantalla no se lo ofrezca.
- **Cambios de producto:** no son atómicos. Si falla a la mitad, queda un solo lado (fila 22 del diagnóstico).

## 6. Siguiente paso: medir con datos reales

Pegar `scripts/auditoria-ventas/diagnostico.sql` en el SQL Editor de Supabase y ejecutarlo. Es **solo lectura** y fue validado con errores sembrados a propósito. Devuelve 24 filas con casos y valor.

| Fila | Qué significa si sale mayor a 0 |
|---|---|
| 1 | El cron no corre: revisar `CRON_SECRET` hoy |
| 2, 10, 11, 13, 20 | Explican faltantes en unidades |
| 3 a 9 | Plata mal contabilizada |
| 15 | Se vendió lo que el sistema no tenía: descuadre previo o talla equivocada |
| 16, 17, 18 | Cancelaciones y ediciones por revisar (el detalle por persona está en Auditoría) |

Las filas 2, 10, 11, 13 y 20 explican hasta cierto número de unidades. Si los faltantes del conteo son mucho mayores, la causa es física o de proceso, no del sistema.

## 7. Plan de corrección propuesto (no aplicado)

No se cambió código de la aplicación ni migraciones. Las correcciones requieren migraciones en los dos Supabase y decisiones del negocio.

1. **Crítico:** configurar `CRON_SECRET` si la fila 1 lo confirma, y liberar lo vencido.
2. **Migración de blindaje:** rechazar cancelar o editar una venta ya cancelada; reversar también lo ya desembolsado al cancelar y al editar; exigir talla en productos con tallas; exigir cuenta en cada pago.
3. **Cambio masivo:** hacerlo con una función atómica que mueva la plata, o quitarlo para ventas con cuenta.
4. **Inventario:** ajustes atómicos y conteo por diferencia; el formulario de producto no debe escribir stock.
5. **Decisiones del negocio:** si los préstamos deben descontar stock; si cancelar debe pedir motivo o clave de admin; si el ítem manual debe pedir confirmación.
6. **Corrección de datos:** solo después de ver el diagnóstico y con aprobación caso por caso.

## 8. Decisiones del usuario (2026-10-31)

| Tema | Decisión | Estado |
|---|---|---|
| Préstamos | Prestar descuenta del inventario hasta que se devuelva. Si el local lo paga, no vuelve. Aviso de 6 segundos al registrar. | Implementado, sin desplegar. Requiere la migración `00059_loan_stock.sql`. |
| Cancelar y editar venta | Un vendedor necesita autorización de un admin (correo y contraseña, verificados en el servidor). Queda en Auditoría qué admin autorizó. El cambio masivo de método sigue la misma regla. | Implementado y enviado a GitHub. |
| Ítem manual | No pide confirmación: la reventa de productos de otros locales es una venta legítima. | Sin cambios. |

**Préstamos: reglas tomadas.** Los préstamos anteriores a la migración no se tocan: nunca descontaron, así que al devolverlos tampoco suman. Lo que nos prestan a nosotros y lo que está fuera de catálogo no mueven stock. Borrar un préstamo pendiente devuelve la unidad; borrar uno cobrado no. Prestar con stock 0 en el sistema se permite, no descuenta nada y el aviso lo dice.

**Orden de despliegue:** primero correr `00059` en cada Supabase y después desplegar el código. Al revés, prestar un producto de catálogo y cambiar el estado o borrar préstamos fallan.

Para repetir las pruebas:

```bash
cd scripts/auditoria-ventas
npm i --no-save --no-package-lock --prefix . @electric-sql/pglite@0.3.14
node audit.mjs
```

Después de corregir, los casos B deben pasar a OK. B9 y B10 están marcados como falla fija porque describen un hueco de control: hay que actualizarlos junto con la corrección.

## 9. Pagos sin cuenta o con cuenta distinta en YJBMOTOCOM (filas 8 y 9)

Detalle real recibido el 2026-10-31. Son 18 pagos por $4.548.000. No se ha corregido ningún saldo.

| Grupo | Pagos | Valor | Causa |
|---|---|---|---|
| Ventas del 05/08 al 10/08 sin cuenta | 14 | $3.908.000 | Muy probable: el selector "Cuenta (opcional)" podía quedar vacío. Se quitó el 2026-08-11 (commit `8ae9b3f`). |
| `HIST-000115`, datáfono sin cuenta | 1 | $260.000 | Por confirmar: llegó con la sincronización histórica del 19/08. |
| `YJBM-20260926-7964`, efectivo sin cuenta | 1 | $30.000 | Probable: pago agregado o cambiado en Editar, que acepta "Sin cuenta" (B9). |
| `YJBM-20261007-4713`, efectivo en cuenta SisteCrédito | 1 | $280.000 | Probable: se cambió el método en Editar y la cuenta quedó igual (B9). |
| `YJBM-20261021-5856`, Nequi en cuenta QR Bancolombia | 1 | $70.000 | Probable: igual que el anterior (B9). |

Por método, los 16 sin cuenta suman: efectivo $415.000, Nequi $845.000, QR $670.000, NU $438.000, Daviplata $205.000, SisteCrédito $1.120.000, datáfono $260.000 y Addi $245.000.

Sin cuenta no hubo movimiento ni desembolso pendiente, así que esa plata no aparece en ninguna cuenta del sistema. Eso no significa que falte físicamente. Antes de corregir hay que comparar contra movimientos y ajustes manuales, para no sumarla dos veces.

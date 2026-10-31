# Pendientes por recordar — YJBMOTOCOM y YBMOTOCOM

> Lista viva de cosas abiertas que no se deben olvidar. Claude la revisa al
> inicio de cada sesión y la recuerda. Cuando algo se resuelva, se marca como
> hecho (con fecha) en la sección de abajo, en vez de borrarlo.
>
> Última revisión: 2026-10-31.

## 1. Migraciones sin correr en el Supabase de YBMOTOCOM

Correr **en orden** en el SQL Editor del Supabase de YBMOTOCOM (el código ya las tiene):

| Migración | Qué pasa si no se corre |
|---|---|
| `00056_addi_pending_releases.sql` | Cualquier venta por Addi en YBMOTOCOM falla |
| `00057_addi_backfill_sept12.sql` | Allá no cambia datos; se corre para no desordenar el historial de migraciones |
| `00058_account_notes.sql` | Falla guardar notas de una cuenta |
| `00059_loan_stock.sql` | Al llevar allá el cambio de préstamos, prestar productos y cambiar estados falla. Correrla antes de desplegarlo en YBMOTOCOM |

Detalle en `docs/EXPANSION_SEGUNDA_TIENDA.md` (recordatorio al inicio).

## 2. Seguridad (las dos tiendas)

### 2.1 `CRON_SECRET` sin configurar en Vercel
- **Qué es:** una clave secreta que usan las tareas automáticas (`/api/cron/*`: avisos de restock, resumen diario, backup, pedir reseña, carrito abandonado **y los desembolsos de Datáfono, Addi y SisteCrédito**).
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

- **CORS abierto en toda la API:** corregido el 2026-08-20; se quitó el bloque de `vercel.json`. Verificado de nuevo el 2026-10-28: no queda en ningún lado de la configuración.

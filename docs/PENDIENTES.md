# Pendientes por recordar — YJBMOTOCOM y YBMOTOCOM

> Lista viva de cosas abiertas que no se deben olvidar. Claude la revisa al
> inicio de cada sesión y la recuerda. Cuando algo se resuelva, se marca como
> hecho (con fecha) en la sección de abajo, en vez de borrarlo.
>
> Última revisión: 2026-11-05.

## 1. Migraciones sin correr en el Supabase de YBMOTOCOM

Correr **en orden** en el SQL Editor del Supabase de YBMOTOCOM (el código ya las tiene):

| Migración | Qué pasa si no se corre |
|---|---|
| `00056_addi_pending_releases.sql` | Cualquier venta por Addi en YBMOTOCOM falla |
| `00057_addi_backfill_sept12.sql` | Allá no cambia datos; se corre para no desordenar el historial de migraciones |
| `00058_account_notes.sql` | Falla guardar notas de una cuenta |
| `00059_inventory_snapshots.sql` | Finanzas → Año solo muestra el inventario de hoy (aviso amarillo); la foto de fin de mes (botón y tarea nocturna) falla |

Detalle en `docs/EXPANSION_SEGUNDA_TIENDA.md` (recordatorio al inicio).

## 1c. Pendientes del negocio (YJBMOTOCOM)

- **Crear en el catálogo el "casco de niños"** (pedido del usuario 2026-11-05). Hoy se vende como ítem manual
  ("CASCO DE NIÑA", $100.000 el 31-oct, factura YJBM-20261031-8370, sin costo). Recordárselo hasta que lo cree.
- **Revisar las 15 ventas manuales con costo $0** de los últimos 90 días (lista entregada el 2026-11-05, entre ellas
  CASCO SPARTAN FENIX $380.000 y Q58MAX $300.000). Si el usuario da los costos, corregirlos como las chaquetas doble faz
  (script con auditoría). Desde el 2026-11-05 ya no se puede vender un ítem manual sin costo.

## 2. Seguridad (las dos tiendas)

### 2.1 `CRON_SECRET` sin configurar en Vercel
- **Avance 2026-11-05:** YJBMOTOCOM ya la tiene en Vercel (Production, tipo Secret); se activa con el próximo despliegue (el push pendiente). **Falta YBMOTOCOM** (con otra clave distinta).
- **Qué es:** una clave secreta que usan las tareas automáticas (`/api/cron/*`: avisos de restock, resumen diario, backup, pedir reseña, carrito abandonado).
- **Estado real:** el código ya la exige (`apps/web/src/lib/cron-auth.ts`). Mientras no exista en Vercel, esas tareas **no corren** (responden error 500).
- **Cómo se arregla:** acción manual, sin código. Vercel → proyecto → Settings → Environment Variables → `CRON_SECRET` con un valor largo y aleatorio → volver a desplegar. Hacerlo en los dos proyectos de Vercel (YJBMOTOCOM y YBMOTOCOM).

### 2.2 `npm audit`: dependencias con avisos de seguridad
- La última revisión (2026-08) encontró 1 crítica y 16 más, casi todas por un `uuid` vulnerable que traen `exceljs`, `mercadopago`, `svix` y `resend`.
- **Cómo se arregla:** actualizar esas dependencias. Lo natural es hacerlo junto con la actualización de Next.js 14 → 15. Volver a correr `npm audit` en `apps/web` para ver el estado actual antes de empezar.

### 2.3 Sin verificación en dos pasos (2FA) para el admin
- El admin entra solo con contraseña, y ese panel maneja plata real.
- **Cómo se arregla:** requiere diseño propio. Evaluar Supabase Auth MFA (código de app tipo Google Authenticator).

### 2.4 Sin límite de intentos propio en el inicio de sesión y el registro (prioridad baja)
- Hoy depende solo del límite interno de Supabase Auth. Solo vale la pena si algún día se ven intentos de adivinar contraseñas.

## Resueltos

- **Migración 00059 en el Supabase de YJBMOTOCOM:** corrida por el usuario el 2026-11-05 (verificado: la tabla `inventory_snapshots` existe). En YBMOTOCOM sigue pendiente (punto 1).

- **CORS abierto en toda la API:** corregido el 2026-08-20; se quitó el bloque de `vercel.json`. Verificado de nuevo el 2026-10-28: no queda en ningún lado de la configuración.

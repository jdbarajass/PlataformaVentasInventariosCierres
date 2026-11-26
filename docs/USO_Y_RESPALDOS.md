# Uso de los planes gratis y respaldos — YBMOTOCOM y YJBMOTOCOM

> Mismo documento en los dos repos. Límites leídos de las páginas oficiales de precios el 2026-11-26
> (supabase.com/pricing y vercel.com/docs/plans/hobby); revisarlos de vez en cuando porque cambian.

## 1. ¿Me pueden cobrar?

**No, mientras las cuentas sigan en plan gratis** (Supabase "Free", Vercel "Hobby"). Ninguno de los dos cobra solo:
para pagar hay que subir de plan a mano. Si se pasa un límite, el servicio **se frena**, no se cobra:

- **Supabase:** avisa por correo; si sigue pasado después de un periodo de gracia, puede dejar la base en solo
  lectura (no se pueden guardar ventas), pausar el proyecto o responder error 402. También **pausa el proyecto si pasa
  1 semana sin uso** (con ventas diarias no pasa; se reactiva desde el panel y no se pierden datos).
- **Vercel:** el recurso que se pasó queda bloqueado hasta que se cumplan 30 días.

Las alertas llegan al correo dueño de cada cuenta: hay que leerlos.

## 2. Dónde está cada cosa

| Tienda | Supabase (ID / nombre en el panel) | Vercel (cuenta / proyecto) | Carpeta del código |
|---|---|---|---|
| YBMOTOCOM | `ccoehayafcvfrnqnuhfa` / ybmotocom (org. ybmotocom) | equipo `ybmotocom` / `ybmotocom-web` | `C:\Users\JJBarajas\Pictures\YOJAN` |
| YJBMOTOCOM | `agwjqetdlgmqtnepaqzj` / YJB_MOTOCOM (org. INVENTARIOS_CONTROL_PAGE) | `jdbarajass-2389s-projects` / `yjbmotocom` | `C:\Users\JJBarajas\Pictures\PlataformaVentasInventariosCierres` |

## 3. Cómo ver el uso

- **Supabase:** en el proyecto → engranaje (Project Settings / Organization) → **Usage**. Muestra cada recurso del mes
  frente al límite. El tamaño exacto se ve corriendo esto en el SQL Editor:
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database())) AS base_de_datos,
         (SELECT pg_size_pretty(coalesce(sum((metadata->>'size')::bigint),0)) FROM storage.objects) AS fotos;
  ```
- **Vercel:** menú izquierdo → **Usage**. Arriba sale una tabla con lo usado; **el tope ("/ 100 GB", etc.) aparece
  bajando, en el detalle de cada recurso**, con un circulito que se va llenando.

## 4. Límites gratis y uso real (medido el 2026-11-26, últimos 30 días)

### Supabase (por proyecto)

| Recurso | Límite gratis | YBMOTOCOM | YJBMOTOCOM |
|---|---|---|---|
| Base de datos | 500 MB | 14 MB (**2,8 %**) | 19 MB (**3,8 %**) |
| Fotos (Storage) | 1 GB | 0 (0 %) | 1,7 MB (0,2 %) |
| Datos enviados (egress) | 5 GB/mes + 5 GB en caché | ver Usage | ver Usage |
| Usuarios que inician sesión | 50.000/mes | pocos | pocos |
| Proyectos activos | 2 por organización | — | — |
| Copias de seguridad | **No incluye** | ver sección 5 | ver sección 5 |

### Vercel Hobby (por cuenta, al mes)

| Recurso | Límite gratis | YBMOTOCOM | YJBMOTOCOM |
|---|---|---|---|
| Fast Data Transfer (tráfico a los visitantes) | 100 GB | 31,8 MB (0,03 %) | 374,8 MB (0,4 %) |
| Fast Origin Transfer | 10 GB | 22 MB (0,2 %) | 515,9 MB (**5,2 %**) |
| CDN Requests (visitas/solicitudes) | 1.000.000 | 2.700 (0,3 %) | 39.000 (**3,9 %**) |
| Function Invocations (llamadas al backend) | 1.000.000 | ver Usage | ver Usage |
| Active CPU | 4 horas | ver Usage | ver Usage |
| Image Transformations | 5.000 | ver Usage | ver Usage |
| Despliegues | 100 por día | — | — |

**Conclusión:** las dos tiendas usan menos del 6 % de cualquier límite. Al ritmo actual hay margen de sobra.

Planes pagos de referencia: Supabase Pro US$25/mes por organización (8 GB, respaldos diarios, nunca se pausa);
Vercel Pro US$20/mes por usuario.

**Ojo:**
- Vercel Hobby es, según sus condiciones, para uso **no comercial**. Hoy no cobra, pero en teoría a una tienda le
  corresponde Pro.
- La cuenta de Vercel de YJBMOTOCOM tiene una tarjeta registrada **solo para el dominio `yjbmotocom.com`**, que se
  compró en Vercel (confirmado por el usuario el 2026-11-26). El dominio **se renueva cada año y se cobra a esa
  tarjeta**; la tarjeta no hace que se cobre el uso (en Hobby se bloquea, no se cobra). El aviso "Action Required:
  billing address missing" pide completar la dirección de facturación: conviene hacerlo (Settings → Billing) para que
  la renovación no falle. Si falla y el dominio vence, la tienda deja de abrir en www.yjbmotocom.com. Revisar la fecha
  de renovación y que "Auto Renew" esté activo en Domains.

## 5. Respaldos

### Lo que ya existe (no sirve para restaurar)
`/api/cron/backup-export` manda cada domingo un **Excel** con 18 hojas al correo del admin. Sirve para consultar,
pero no lleva la estructura, ni los usuarios, ni todas las tablas: con él **no se puede reconstruir** la base.

### Respaldo completo (sí sirve para restaurar): `scripts/respaldo-bd.ps1`
Saca con `pg_dump` un volcado completo de las dos bases (esquemas `public` = negocio, `auth` = usuarios,
`storage` = registro de fotos) y lo deja en la carpeta de la nube que se indique, uno por tienda y por fecha,
conservando los últimos 30.

Preparación (una sola vez por equipo):
1. Instalar **PostgreSQL 17 — solo "Command Line Tools"** (instalador de postgresql.org/download/windows; desmarcar
   el servidor). Trae `pg_dump` y `pg_restore`.
2. Crear `scripts\respaldo-bd.config.local` (no se sube a GitHub porque `*.local` está en `.gitignore`):
   ```
   DESTINO=C:\Users\JJBarajas\OneDrive\Respaldos-Tiendas
   GUARDAR=30
   YBMOTOCOM=<URL "Session pooler" de Supabase YBMOTOCOM con la contraseña>
   YJBMOTOCOM=<URL "Session pooler" de Supabase YJBMOTOCOM con la contraseña>
   ```
   La URL sale de Supabase → botón **Connect** → **Session pooler** (puerto 5432), cambiando `[YOUR-PASSWORD]` por
   la contraseña de la base (si no se sabe: Project Settings → Database → Reset database password; ojo, si alguna
   otra cosa usa esa contraseña hay que actualizarla también).
3. Correr: `powershell -ExecutionPolicy Bypass -File scripts\respaldo-bd.ps1`.
4. Opcional: programarlo con el Programador de tareas de Windows (por ejemplo, cada noche).

Las fotos de productos son aparte (bucket `product-images`); hoy pesan poco (≤ 2 MB) y se pueden volver a subir.

### Restaurar
En un proyecto de Supabase **nuevo** (o el mismo, con mucho cuidado), con su URL de Session pooler:
```
pg_restore --dbname="<URL>" --no-owner --no-privileges --schema=public  <archivo>.dump
pg_restore --dbname="<URL>" --no-owner --no-privileges --data-only --schema=auth <archivo>.dump
```
Después cambiar `NEXT_PUBLIC_SUPABASE_URL`, la anon key y la service role key en Vercel si el proyecto es nuevo.
**Recomendado:** hacer una restauración de prueba una vez en un proyecto aparte, para saber que el respaldo sirve
antes de necesitarlo.

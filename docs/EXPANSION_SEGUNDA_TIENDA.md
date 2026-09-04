# Expansión a una segunda tienda (negocio independiente)

> **Este documento es el estado vivo de este proyecto.** Si retomas este trabajo en una sesión nueva, léelo completo antes de tocar código.

**Última actualización**: 2026-09-04 (entrada 4)
**Estado actual**: **Fases 0-2 completas y verificadas en producción.** YBMOTOCOM ya está desplegado y funcionando de punta a punta: repo propio (`github.com/ybmotocom/ybmotocom-web`, 1 commit inicial limpio sin el historial de YJBMOTOCOM), Supabase propio con las 52 migraciones aplicadas, Vercel propio (`ybmotocom-web.vercel.app`) conectado y con auto-deploy en cada push a `main`, usuario admin creado y login confirmado funcionando por el usuario. La sección 3.1 (bug real de datos bancarios/NIT falsos en YJBMOTOCOM) quedó resuelta y cerrada. Pendiente solo la Fase 3 (sección 5, estrategia de `cherry-pick` para compartir mejoras futuras) — documentada pero nunca probada en la práctica.

**De aquí en adelante, la configuración de YBMOTOCOM (subir inventario, llenar `/admin/configuracion` con datos reales, completar los campos `TODO` de su `brand.ts`) es trabajo operativo de Yojan, no requiere más cambios de código** — el usuario lo confirmó explícitamente ("ya es cuestión de tiempo para configurarlo"). Si se retoma este proyecto más adelante, lo más probable es que sea para: (a) probar la Fase 3 (cherry-pick) cuando haya una mejora real que llevar de un repo al otro, o (b) resolver un pendiente puntual que reporte el usuario sobre YBMOTOCOM ya en uso real.

---

## 1. Contexto y objetivo

Un segundo negocio (otro local, dueño distinto, vende un catálogo parecido — accesorios de moto) quiere usar el mismo software que YJBMOTOCOM, pero:
- Es un negocio **totalmente aparte** — arranca en ceros (sin productos, sin ventas, sin clientes).
- **No debe tocar ni compartir nada** de los datos, la base de datos, ni el dominio de YJBMOTOCOM.
- El dueño usará planes gratuitos de las mismas plataformas (Vercel, Supabase, GitHub).

## 2. Decisión de arquitectura (2026-09-04)

**Se descartó multi-tenant** (una sola app/BD sirviendo a los dos negocios con un `tenant_id`). Razones:
- El sistema no tiene ningún concepto de tenant hoy — ninguna tabla tiene `tenant_id`, las políticas RLS son globales por tabla. Construirlo encima de un sistema que ya maneja ventas reales de YJBMOTOCOM en producción es un rediseño grande y riesgoso (RLS, auth, cron jobs, webhooks de pago, todo tendría que aprender a filtrar por tenant) solo para evitar crear una segunda cuenta gratis.
- Con dos **proyectos separados** (Supabase, Vercel, GitHub distintos), cada uno tiene su propio límite de plan gratuito — nunca se suman entre sí. Si se combinaran en un solo proyecto, el uso (tamaño de BD, ancho de banda, ejecuciones) sí se sumaría y acercaría antes al plan de pago.

**Se eligió: despliegue completamente separado (fork), con estas dos decisiones del usuario:**
1. **Titularidad**: el otro dueño crea sus propias cuentas (GitHub, Vercel, Supabase) con su propio correo. Control y facturación 100% independientes — si su negocio crece y necesita plan pago, lo paga él. El usuario de este repo ayuda a configurarlo y sigue programando ahí si hace falta (se le agrega como colaborador).
2. **Mantenimiento**: modelo "franquicia" — mismo código base para ambas tiendas. Cuando se mejora algo genérico (no específico del negocio) en un repo, se puede llevar al otro con `git cherry-pick`/`merge` desde un remoto adicional. Esto exige separar bien "identidad de marca" (nombre, logo, colores, cuentas bancarias) de la lógica genérica — ver Fase 1.

## 3. Fase 1 — Centralizar la identidad de marca en código (en curso)

**Por qué hace falta**: se auditó el código (grep de "yjbmotocom"/"YJBMOTOCOM" en `apps/web/src`, 73 archivos con coincidencias) y se encontró que **ya existe una tabla `store_settings`** (vía `lib/settings.ts`, editable en `/admin/configuracion`) que cubre nombre de tienda, contacto, redes sociales, logo y colores — pero **no está conectada en todos lados**:
- `components/layout/footer.tsx` sí la usa (contacto/redes), pero el nombre de marca "MOTOCOM"/logo "YB"/tagline quedan escritos a mano en el JSX.
- `components/layout/header.tsx` **no la usa en absoluto** — tiene un `WHATSAPP_NUMBER` de YJBMOTOCOM fijo en el código (inconsistente con el footer, que si lee de `store_settings`; esto es un bug real en producción, no solo un problema de reuso).
- `app/layout.tsx` (metadata SEO), `app/sitemap.ts`, `components/seo/structured-data.tsx` tienen el nombre/dominio de YJBMOTOCOM fijo.
- Los 5 templates de email (`emails/*.tsx`) tienen el nombre de marca fijo, y `emails/payment-instructions.tsx` tiene **datos bancarios reales de YJBMOTOCOM hardcodeados** (número de cuenta Bancolombia, NIT, números de Nequi/Daviplata) — esto es lo más delicado: si no se corrige, un fork ingenuo mostraría los datos bancarios de YJBMOTOCOM a los clientes del otro negocio.

**Qué se está haciendo**: un solo archivo nuevo `apps/web/src/config/brand.ts` como fuente única de identidad de marca (nombre, logo, tagline, dominio, WhatsApp de respaldo, datos de pago manual). Los ~10 archivos reales de arriba pasan a importar de ahí en vez de tener el literal escrito. Cuando alguien haga un fork para una tienda nueva, **edita un solo archivo** en vez de perseguir el nombre por 10 archivos distintos — y los cherry-picks de mejoras genéricas futuras no chocan con las diferencias de marca en cada commit.

**Completada (2026-09-04, commit `8b2551e`)**: se creó `apps/web/src/config/brand.ts` como fuente única (nombre, dominio, contacto, redes, datos del recibo térmico, datos de pago manual) y se conectaron 23 archivos (footer, header + `(shop)/layout.tsx`, `app/layout.tsx`, `sitemap.ts`, `structured-data.tsx`, `lib/email.ts` + 6 templates de email, `payment-instructions.tsx`, `orden/[id]/confirmacion`, `lib/recibo-termico.ts`, `api/orders/[id]/invoice`, `lib/mercadopago-helpers.ts`, `lib/stripe-helpers.ts`, `lib/pdf-import/xtrong.ts` — el parser de facturas de proveedor buscaba literalmente "YJBMOTOCOM" como nombre del comprador, `admin/configuracion`, exportadores de Excel). Bug real de producción corregido de paso: `header.tsx` ignoraba `store_settings` y tenía su propio WhatsApp fijo, pudiendo mostrar un número distinto al del footer — ahora ambos reciben el mismo valor desde `ShopLayout`. Verificado: `tsc`/`next lint`/`vitest` (132/132)/`next build` limpios.

**Dejado fuera a propósito, de menor riesgo** (mismo patrón hardcodeado pero interno/bajo riesgo, no se tocó para no disparar el alcance): `admin/historial-mensual`, `admin/inventario` (reportes imprimibles), `admin/exportar-importar` (nombres de archivo de descarga), `admin/cierre-alegra/layout.tsx`.

**Límite real encontrado**: el placeholder `mostrador@yjbmotocom.com` para ventas de mostrador está incrustado en el propio SQL de 5 migraciones de Supabase (`00013`, `00021`, `00025`, `00027`, `00028`, función `create_pos_sale`), no solo en TypeScript — no se tocó (cambiar función de BD es más riesgoso y fuera de lo pedido) y `api/orders/[id]/invoice/route.ts` mantiene ese literal a propósito porque debe coincidir exactamente con lo que la función SQL escribe. **Un fork que quiera cambiar esto necesita una migración nueva, no basta con editar `brand.ts`** — anotar en la Fase 2 (checklist de despliegue del negocio nuevo).

### 3.1 Bug real de producción — confirmado y corregido parcialmente (2026-09-04, commit `0467654`)

El usuario confirmó que **sí eran datos incorrectos**, no solo apariencia de placeholder:
- Cuenta Bancolombia de ahorros: corregida en `brand.ts` a la real (ver el archivo, no se repite aquí por ser un dato de cuenta bancaria — evitar duplicarlo en más de un lugar).
- Nequi: el número que se le mostraba a los clientes era el número de **contacto/WhatsApp** del negocio (321 411 1371), no el número real de Nequi. El número correcto de Nequi es el mismo que ya se usaba para Daviplata (314 406 5520) — corregido.
- Daviplata: ya estaba correcto, sin cambios.

**Titular/NIT confirmado y corregido (2026-09-04, commit `db695e7`)**: el negocio es **persona natural** con registro de Cámara de Comercio, no está constituido como S.A.S. y **no tiene NIT**. Se quitó la línea de NIT (en el email y en la página de confirmación de orden — se encontró que el mismo dato estaba duplicado en 2 lugares, no solo en el email) y `brand.payment.bank.holderName` pasó de `'YJBMOTOCOM S.A.S.'` (razón social falsa) a `'YJBMOTOCOM'` (nombre comercial, sin inventar personería jurídica). También se eliminó el campo `legalName` de `brand.ts` (no se usaba en ningún lado, y tenía el mismo dato falso).

**`lib/recibo-termico.ts` confirmado correcto (2026-09-04)**: el usuario confirmó que `BRAND.receipt.nit = 'NIT 1032464724-2'` es su cédula real usada como identificación tributaria en el recibo físico — no se toca, no era un error.

**Bug real de identidad visual encontrado y corregido (2026-09-04, commit `5db3c26`)**: el usuario adjuntó capturas del sitio en vivo mostrando que el logo cuadrado (header y footer, y una versión recortada del mismo elemento) mostraba las iniciales **"YB"** — que resultó ser justo el nombre del negocio nuevo (YBMOTOCOM). Esto SÍ era código (`BRAND.logoInitials`, heredado tal cual del hardcode original de antes de la Fase 1 — la Fase 1 lo centralizó sin cuestionar el valor porque no era su alcance cambiar valores). El usuario eligió corregirlo a **"YJB"** (las 3 iniciales completas de la marca) en vez de "YJ" o "JB". Se ajustó también el tamaño de fuente del ícono cuadrado (36×36px) para que quepan las 3 letras sin verse apretado.

**Con esto queda cerrado del todo el tema YJBMOTOCOM↔YBMOTOCOM** (bug de datos bancarios, NIT/razón social falsa, y ahora el logo). Único punto que queda registrado pero sin tocar por decisión explícita del usuario: las 3 facturas con `proveedor='YBMOTOCOM'` en `supplier_invoices` (producción), que se dejan como están.

**Segundo hallazgo del usuario, distinto y NO relacionado con código**: un dato real en la base de datos de Supabase (`supplier_invoices`, ver `docs/UNIFICACION_YJBMOTOCOM.md` sección ~56, hallazgo C) usa `'YBMOTOCOM'` (sin la J) como proveedor por defecto en 3 facturas internas sin proveedor real — un typo de datos, no de código (no aparece en ningún archivo de `apps/web/src`, confirmado por grep). Coincide con que el nombre de la tienda nueva es justamente "YBMOTOCOM" (ver sección 6), así que hay que tener cuidado de no confundir el typo viejo de YJBMOTOCOM con el nombre real del negocio nuevo. **Decisión del usuario (2026-09-04): NO tocar esas 3 filas** — se dejan como están en producción. De aquí en adelante, cualquier dato/código nuevo que se genere debe decir siempre "YJBMOTOCOM" (con J) para este negocio; "YBMOTOCOM" (sin J) es exclusivamente el nombre del negocio nuevo de la sección 6.

Al centralizar los datos de pago manual en `brand.ts`, se notó una inconsistencia entre dos fuentes de "identidad fiscal" que hoy conviven en el código:
- `emails/payment-instructions.tsx` (instrucciones de transferencia que se le muestran al cliente tras el checkout): cuenta Bancolombia `1234567890`, NIT `900.123.456-7`. **Estos valores tienen forma de placeholder de tutorial**, no de datos reales.
- `lib/recibo-termico.ts` (recibo térmico de venta de mostrador): NIT `1032464724-2` — formato de cédula, con pinta de ser un dato real.

No se alteró ningún valor (se centralizaron tal cual estaban, como se pidió), pero **si el primero es en efecto un placeholder de cuando se armó el checkout, significa que ahora mismo, en producción, un cliente que elija pagar por transferencia/Nequi/Daviplata está viendo datos bancarios ficticios** — su transferencia no llegaría a ningún lado. Esto es independiente del proyecto de la segunda tienda; si es real, es un bug de producción a corregir ya. **Pendiente: el usuario debe confirmar cuáles son los datos bancarios/Nequi/Daviplata reales de YJBMOTOCOM** para (a) corregir `brand.ts` si hace falta y (b) saber qué valor de ejemplo dejarle al fork del negocio nuevo.

**Qué NO se está tocando a propósito** (queda para editar a mano en cada fork, no vale la pena abstraerlo):
- Las páginas legales con prosa larga (`terminos`, `privacidad`, `nosotros`, `faq`, `envios`, `devoluciones`, `contacto`) — tienen texto legal específico (NIT, políticas) que de todas formas hay que redactar por negocio.
- Los colores de Tailwind (`tailwind.config.ts`) — es la paleta de diseño global; un fork con otra identidad visual edita ese archivo directamente (normal en un template, no requiere abstracción en runtime).
- Las categorías de producto (Cascos/Guantes/Chaquetas/Accesorios) — como el negocio nuevo vende un catálogo parecido, probablemente sirven tal cual; si no, se editan a mano.

## 4. Fase 2 — Checklist y pasos de despliegue (documentada 2026-09-04, ejecución pendiente)

Verificación de seguridad hecha antes de recomendar compartir el historial completo de git: se revisó `git log --all -p` buscando claves reales (Stripe `sk_live_`, JWT de Supabase, tokens de Alegra) — **no se encontró ningún secreto real filtrado**, solo placeholders de `.env.example` (`sk_test_xxx`, `tu_service_role_key_aqui`, JWT de ejemplo truncado). El historial completo es seguro de compartir. Tampoco hay ningún `.env` real trackeado (`.gitignore` ya los excluye). `supabase/seed.sql` solo tiene categorías/productos demo genéricos, sin datos reales. `scripts/` solo tiene una utilidad genérica de conversión de imágenes.

**Ojo**: hoy en la raíz del repo hay varios `.xlsx` reales del negocio sueltos **sin trackear** (`Categorias_Tienda_YJBMOTOCOM_2026-08-21.xlsx`, `INVENTARIO-1.xlsx`, 2 de `YJBMOTOCOM_Historial_*.xlsx`) — como no están en git, un `git clone`/`git push` a un repo nuevo NO los arrastra. Pero si en algún momento se decide copiar la carpeta completa a mano (en vez de vía git) para armar el repo nuevo, hay que excluirlos a propósito.

### 4.1 Cuentas que debe crear el otro dueño (con su propio correo, no el del usuario)

**Estado (2026-09-04): correo y 3 cuentas base ya creadas.** El negocio nuevo se llama **YBMOTOCOM** (de Yojan Barajas Motocom — el dueño de YJBMOTOCOM es José Barajas; son negocios de dos hermanos/familiares con nombres muy parecidos, OJO al escribir/leer código o docs para no confundir "YJB" con "YB"). Correo dedicado: `ybmotocom.cc.megacentro@gmail.com` (la contraseña la tiene el usuario, no se guarda aquí ni en ningún archivo del repo). Con ese correo ya se creó GitHub, y con ese GitHub ya se inició sesión en Vercel y Supabase — quedan las 3 cuentas base listas, falta crear el repo y los proyectos concretos dentro de cada una (pasos 4.3).

1. ~~GitHub~~ — cuenta lista (repo nuevo aún no creado).
2. ~~Vercel~~ — cuenta lista (proyecto nuevo aún no creado).
3. ~~Supabase~~ — cuenta lista (proyecto nuevo aún no creado).
4. Opcional según lo que decida usar: Resend (email transaccional), Sentry (monitoreo de errores), Stripe y/o MercadoPago (pagos en línea), cuenta de Alegra (facturación), número de WhatsApp Business.

### 4.2 Información a recolectar del nuevo negocio (para `brand.ts` + `store_settings` + pagos)

- Nombre comercial, razón social y NIT.
- Logo (archivo de imagen) y color principal de marca.
- WhatsApp, teléfono(s) adicionales, dirección, ciudad, horario de atención.
- Redes sociales (facebook/instagram/tiktok/twitter — usuarios/handles).
- Datos de pago manual: cuenta bancaria (banco, tipo de cuenta, número, titular, NIT) + número y nombre de Nequi + número y nombre de Daviplata — **estos son justo los que hoy se descubrió que podrían estar mal en YJBMOTOCOM (sección 3.1) — hay que confirmarlos con cuidado para el negocio nuevo también, no copiar valores de ejemplo**.
  - **Ya confirmado (2026-09-04) para YBMOTOCOM**: Nequi y Daviplata comparten el mismo número, 321 411 1371. Por el momento no tiene cuenta bancaria propia para transferencias — solo esos dos métodos.
- Dominio propio si lo tiene, o usa el subdominio gratis `*.vercel.app` de entrada.
- ¿Va a usar Alegra? ¿Stripe y/o MercadoPago? — credenciales propias, nunca las de YJBMOTOCOM.
- Confirmar si reutiliza las categorías actuales (Cascos, Guantes, Chaquetas, Accesorios, Repuestos, Lubricantes) o necesita otras.

### 4.3 Pasos técnicos de despliegue

1. Crear un repo nuevo y vacío en el GitHub del otro dueño.
2. Llevar el código con git (no copiar la carpeta a mano): agregar ese repo nuevo como remoto y hacer push del contenido de `main` de este repo — así solo viaja lo que está commiteado (confirmado seguro en el punto anterior), nunca los archivos sueltos de la raíz.
3. Crear el proyecto nuevo en Supabase (del otro dueño) y correr las **52 migraciones en orden** (`supabase/migrations/00001` a `00052`) contra esa base vacía — a diferencia de la advertencia que existe para la base de YJBMOTOCOM (no repetir 00001-00007 porque ya están aplicadas ahí), en una base nueva sí se corren **todas**, en orden, una sola vez. `supabase/seed.sql` es opcional: son categorías/productos genéricos de ejemplo, no hay problema en correrlo si quiere partir con esa base en vez de crear categorías a mano.
4. Crear el usuario admin inicial: cuenta en Supabase Auth + fila en `public.users` con `role='admin'` (mismo patrón ya usado en este proyecto).
5. Editar `apps/web/src/config/brand.ts` con los datos reales del negocio nuevo (sección 4.2) — es el único archivo que hace falta tocar para la identidad de marca estática.
6. Una vez el sitio esté arriba, completar `store_settings` (fila `id=1`) desde `/admin/configuracion` con contacto/redes/logo/colores reales — eso ya es dinámico, no requiere tocar código.
7. Crear el proyecto en Vercel apuntando al repo nuevo y configurar **todas** las variables de `.env.example` con credenciales propias del negocio nuevo (Supabase URL/keys propias, `CRON_SECRET` propio y nuevo, Resend/Stripe/MercadoPago/Alegra propios si aplica, `NEXT_PUBLIC_SITE_URL` con su dominio o su `*.vercel.app`).
8. Deploy inicial. Probar: login admin, crear un producto de prueba, hacer una venta de mostrador de prueba, confirmar que el checkout público funciona.
9. (Opcional, cuando lo tenga) apuntar un dominio propio al proyecto de Vercel.

**Nota heredada de la Fase 1**: si el negocio nuevo necesita cambiar el email de respaldo de ventas de mostrador (`mostrador@...`), no basta con editar `brand.ts` — ese valor también vive en el SQL de la función `create_pos_sale` (migraciones `00013`/`00021`/`00025`/`00027`/`00028`), hace falta una migración nueva.

### 4.4 Ejecución real completada (2026-09-04)

- **Repo**: `https://github.com/ybmotocom/ybmotocom-web` — 1 commit inicial limpio (sin historial de YJBMOTOCOM), más 2 commits de ajuste de marca (`8dee181` datos reales iniciales, `3d8112e` logo/portada/legales + conteo real de productos). `jdbarajass` quedó como colaborador (necesario para poder pushear desde esta máquina).
- **Supabase**: proyecto `ybmotocom` (URL `https://ccoehayafcvfrnqnuhfa.supabase.co`), las 52 migraciones corridas de una vez con `supabase/bootstrap_all_migrations.sql`. Usuario admin creado (`ybmotocom.cc.megacentro@gmail.com`) e insertado en `public.users` con `role='admin'` — login confirmado funcionando por el usuario.
- **Vercel**: proyecto `ybmotocom-web`, Root Directory `apps/web`, dominio `ybmotocom-web.vercel.app`. Variables obligatorias completas (Supabase legacy anon/service_role, `CRON_SECRET` generado, `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`); Stripe/MercadoPago/Resend/Sentry/Alegra quedaron vacías a propósito (se agregan cuando Yojan decida usarlas). Auto-deploy en cada push a `main` ya confirmado funcionando (el push del segundo commit disparó el redeploy solo).
- **Pendiente operativo, no técnico**: completar los campos `TODO` de `apps/web/src/config/brand.ts` (dirección exacta del local — mismo Cc Megacentro que YJBMOTOCOM pero Puerta 1, otro local; redes sociales; NIT del recibo si aplica; cuenta bancaria si algún día abre una) y llenar `/admin/configuracion` (`store_settings`) con los mismos datos una vez que Yojan los tenga listos. Esto es trabajo de Yojan/el usuario, no requiere una sesión de código.

## 5. Fase 3 — Estrategia de git para compartir mejoras futuras (documentada 2026-09-04, sin probar todavía)

- El repo del negocio nuevo agrega este repo como remoto adicional: `git remote add upstream <url-de-este-repo>`. Como este repo es privado, quien vaya a hacer el `fetch` necesita acceso de lectura (agregar al otro dueño o a quien programe como colaborador en GitHub, o que sea el mismo usuario quien tenga acceso a ambos repos y haga la sincronización).
- Para traer una mejora puntual (no todo el historial): `git fetch upstream` + `git cherry-pick <hash-del-commit>` sobre el repo del negocio nuevo. Como `brand.ts` quedó como el único archivo con identidad propia (Fase 1), los cherry-picks de mejoras genéricas no deberían pisar branding.
- Riesgo conocido: si un cherry-pick toca un archivo que el negocio nuevo también editó a mano por su cuenta (ej. `tailwind.config.ts` con otra paleta, o una página legal con su propio texto), puede haber conflicto — se resuelve como cualquier conflicto de git normal, favoreciendo lo propio del negocio nuevo en esas líneas puntuales.
- Pendiente: probar este flujo en la práctica en cuanto exista el segundo repo real (no se puede validar hasta ese momento).

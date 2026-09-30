# Panel admin en celular — plan por fases

Documento vivo. Leer primero si se retoma este trabajo.

## Contexto

- Los vendedores usan el panel admin desde el celular **como respaldo** cuando el PC de la tienda no puede (se fue el internet o la luz). Esto significa: datos móviles, a veces señal débil, y una sola mano.
- Las páginas críticas en celular son **Registrar Venta** (`/admin/ventas`) y **Ventas del Día** (`/admin/ventas-dia`).
- Se **mantiene el estilo actual** (Racing Dark / shadcn). Esto NO es un rediseño: solo adaptación a pantallas pequeñas. Un rediseño visual completo queda para más adelante, si el usuario lo decide.
- Se trabaja **una fase a la vez**; cada fase se comprueba y el usuario la aprueba antes de pasar a la siguiente.

## Reglas para todas las fases

- Solo presentación (clases, CSS, estructura del layout). No se toca lógica de negocio, cálculos, consultas, endpoints, permisos ni estados funcionales.
- **Escritorio (≥ 1024 px) debe verse igual que antes**, salvo que el usuario pida lo contrario. Cada fase se compara antes/después en 1366 px.
- No se instalan dependencias nuevas: todo sale con Tailwind y los componentes que ya existen (Radix Dialog/Sheet, lucide).
- Breakpoints de referencia: 360, 390, 430 (celular), 768 (tablet), 1366 (portátil).
- Cambios que también apliquen a YBMOTOCOM se avisan aparte.

## Diagnóstico inicial (2026-09-29)

- `admin/layout.tsx`: sidebar fijo de 256 px + `pl-64` + `p-8` en **todos** los tamaños. En un celular de 390 px el contenido queda con ~70 px útiles. No hay menú móvil.
- Páginas del admin casi sin clases responsive (ej. `inventario`: 3.097 líneas, 9 tablas, 2 clases responsive).
- 38 cuadrículas de 3–6 columnas fijas (`grid-cols-3/4/5/6`) que no se apilan.
- 9 modales propios (`fixed inset-0`) sin adaptación a pantalla pequeña.
- Inputs con `text-sm` (14 px): iOS Safari hace zoom automático al enfocarlos.
- Efectos `hover:` (elevación de tarjetas, etc.) quedan "pegados" tras tocar en pantallas táctiles.

## Cómo se verifica

- Script de Playwright local (Chromium ya instalado con `@playwright/test`), fuera del repo, con emulación de celular (táctil) y capturas antes/después.
- La sesión de prueba se crea por script **sin** pasar por `/iniciar-sesion`: esa pantalla cierra las otras sesiones de la cuenta (`signOut({ scope: 'others' })`) y sacaría a un vendedor real o al PC de la tienda.
- En las pruebas no se registran ventas ni se modifica ningún dato: solo se navega y se abren/cierran paneles.
- Además: `tsc --noEmit`, `next lint` y `vitest run` sin regresiones.

## Fases

| # | Fase | Qué incluye | Estado |
|---|------|-------------|--------|
| 1 | Capa global táctil | `globals.css`: inputs a 16 px en < 640 px (evita el zoom de iOS), `touch-action: manipulation` (sin retardo de doble toque), resaltado de toque discreto, botones de ícono a 44 px en pantallas táctiles. `tailwind.config.ts`: `hoverOnlyWhenSupported` (el hover solo existe donde hay mouse). Sin cambios en escritorio. | ✅ Hecha |
| 2 | Estructura del admin | Barra superior compacta con botón de menú en < 1024 px; el sidebar actual pasa a cajón lateral que se abre/cierra (se cierra al navegar); contenido con `p-4` / `sm:p-6` / `lg:p-8`. En ≥ 1024 px todo igual, incluido el colapso guardado. | ✅ Hecha |
| 3 | Registrar Venta | `/admin/ventas`: buscador, carrito, formas de pago y botón de cobrar cómodos a una mano; cuadrículas que se apilan; acciones principales siempre alcanzables. | ✅ Hecha |
| 4 | Ventas del Día | `/admin/ventas-dia`: resumen arriba, tablas anchas → tarjetas o scroll horizontal controlado sin perder columnas; filtros y acciones táctiles. | ✅ Hecha |
| 5 | Modales y avisos + portátil 1024 | Los modales/diálogos que usan Registrar Venta y Ventas del Día → hoja inferior o pantalla completa en celular; `SessionAlerts` y toasts sin tapar acciones. **Además (pedido del usuario, 2026-09-30)**: arreglar Registrar Venta en portátil pequeño (~1024 px con el menú expandido), donde "Limpiar" y los campos de Precio se salen de la tarjeta de la factura — aquí SÍ se permite cambiar cómo se ve en escritorio. | ✅ Hecha |
| 6 | Resto de páginas del vendedor | Mi Cuadre, Calculadora, Cierres, Fiado, Préstamos, Facturas, Inventario (consulta), Notas, Productos. Dividida en 3 partes (2026-09-30): **6a** Cierres, Préstamos, Facturas, Notas · **6b** Inventario (+ Cambios, Cargue de pedidos) · **6c** Historial Mensual, Presupuesto, Reportes + revisión táctil de las que ya caben (Mi Cuadre, Calculadora, Fiado, Órdenes, Productos, Cupones, Reseñas, Cierre Alegra). | ✅ Hecha (6a · 6b · 6c) |
| 7 | Páginas solo-admin + tabla de Inventario en portátil | Cuentas, Reportes, Rendimiento, Auditoría, Usuarios, Configuración, Cierre Alegra, etc. **Además (pedido del usuario, 2026-09-30)**: la tabla Detalle de Inventario en 1024–1366 (la columna de acciones queda cortada dentro del scroll horizontal) — se permite cambiar cómo se ve en escritorio. | ✅ Hecha |
| 8 | Auditoría final | `impeccable audit` + `web-design-guidelines` (necesita red a GitHub) sobre el admin en celular; `prefers-reduced-motion`; registro final. | ✅ Hecha |

## Bitácora

### Fase 1 — Capa global táctil (2026-09-29) — aprobada

**Cambios**
- `apps/web/src/app/globals.css` (bloque "CELULAR / PANTALLAS TÁCTILES"):
  - `touch-action: manipulation` en controles (sin retardo de doble toque).
  - `-webkit-tap-highlight-color` discreto.
  - `< 640 px`: inputs/select/textarea a 16 px (iOS deja de hacer zoom al enfocar). Por especificidad, no con `!important`. Escape: atributo `data-keep-font` en select/textarea.
  - `(pointer: coarse)`: botones de solo ícono a 44×44 px mínimo. Solo los identificables como "solo ícono": con `aria-label`/`title` o tamaño `icon` de shadcn (`h-10 w-10`). Excluye `.absolute` y ocultos. Los botones de ícono sin nombre accesible se tratan página por página en fases siguientes.
- `apps/web/tailwind.config.ts`: `future.hoverOnlyWhenSupported: true` → toda utilidad `hover:` queda dentro de `@media (hover: hover) and (pointer: fine)`.
- Por ese cambio, 4 controles que **solo aparecían al pasar el mouse** ahora se ven siempre en pantallas táctiles (`[@media(hover:none)]:opacity-100`), para que no queden inalcanzables en celular:
  - `admin/ventas/page.tsx` — ✕ para cerrar una pestaña de venta.
  - `admin/productos/page.tsx` — botones editar/eliminar de cada fila.
  - `components/products/image-uploader.tsx` — ✕ para quitar una imagen.
  - `components/ui/toast.tsx` — ✕ para cerrar un aviso.
- **No tocado a propósito**: `components/products/product-card.tsx` (tienda). Sus acciones de hover (favorito, comparar, agregar) ya eran inalcanzables en celular antes (tocar la tarjeta navega al producto). Queda para la fase de la tienda.

**Verificación**
- Capturas antes/después en 360/390/430/768/1366 de `/admin`, `/admin/ventas`, `/admin/ventas-dia`, `/admin/productos`.
- Celular: inputs 14/12 px → 16 px; botones de ícono 28–40 px → 44 px.
- Tablet táctil (768): botones de ícono 44 px; inputs sin cambio (14 px, ≥ 640).
- Escritorio 1366: inputs 14/12 px y botones 32/28/40 px **sin cambio**; capturas visualmente idénticas.
- `tsc --noEmit` OK · `next lint` sin warnings · `vitest run` 132/132 · `next build` OK.
- Pendiente conocido (se resuelve en Fase 2): la página sigue midiendo más que la pantalla en celular (sidebar fijo), p. ej. Ventas del Día ~900–1.160 px de ancho. En esa tabla los botones de 44 px la ensanchan ~30 px más; se rehace en la Fase 4.
- **YBMOTOCOM** (`C:\Users\JJBarajas\Pictures\YOJAN`) comparte este código base: estos cambios de frontend también le aplican y hay que replicarlos allá (sin migraciones SQL ni variables de entorno). Decisión del usuario (2026-09-29): se replica **todo al final**, cuando todas las fases estén hechas y probadas.

### Fase 2 — Estructura del admin (2026-09-29) — aprobada

**Cambios** (solo `apps/web/src/app/admin/layout.tsx`)
- **Barra superior fija** (`h-14`, solo `< lg`): botón "Abrir menú" (44 px), nombre de la página actual ("¿dónde estoy?", sale de la misma lista `navigation`) y logo que lleva al Dashboard.
- **Sidebar → cajón** en `< lg`: fuera de pantalla (`-translate-x-full`) hasta que se toca el menú; ancho `min(18rem, 85vw)`; fondo oscuro que lo cierra al tocarlo; también se cierra con Escape, con la ✕ y **al navegar**. Con el cajón abierto el fondo no se desplaza. Cerrado es `inert` (fuera del Tab y del lector de pantalla).
- En el cajón el menú va siempre completo: el modo "solo íconos" (`collapsed`, en localStorage) es una preferencia de escritorio y solo aplica en `≥ lg` (`showCollapsed = collapsed && isDesktop`). El botón "Colapsar menú" solo existe en escritorio.
- Subenlaces del menú: `py-3` en celular (44 px de alto), `lg:py-2` en escritorio como antes.
- `<main>`: sangría del sidebar solo en `lg` (`lg:pl-64` / `lg:pl-16`), `pt-14` en celular por la barra, `min-w-0` para que una tabla ancha no estire el layout, relleno `p-4 sm:p-6 lg:p-8` (antes `p-8` fijo).
- Detalle técnico: el App Router corre React 19.2 (vendorizado por Next 15), así que `inert` va como booleano.

**Verificación**
- Prueba de interacción (Playwright, 360 y 390, táctil): cajón cerrado fuera de pantalla e inert; barra con el título correcto; contenido desde x=0; abrir → visible, fondo bloqueado; enlaces ≥ 44 px; Escape cierra; tocar el fondo cierra; tocar "Ventas del Día" navega, cierra el cajón y cambia el título. Todo OK.
- Escritorio 1366: barra móvil oculta, sidebar fijo de 256 px, `main` con `padding-left` 256 px y `p-8`, sin sombra; colapsar → 64 px; persiste al recargar; expandir → 256 px. Capturas idénticas a las de antes.
- Recorrido de las 35 rutas del admin (390 y 1366): todas cargan, sin errores de JavaScript, con el título correcto en la barra. En 390, **18/35 ya caben exactas en la pantalla** (antes de esta fase ninguna medía menos de 660 px). Siguen más anchas que el celular: Ventas del Día 855, Inventario 716, Presupuesto 637, Usuarios 617, Historial Mensual 570, Auditoría 543, Préstamos 514, Cuentas 507, Facturas 492, Cargue de pedidos 477, Categorías 473, Registrar Venta 441, Cierres 431, Exportar/Importar 426, Notas 413, Configuración 396, Reportes 394 → se tratan en las Fases 3, 4, 6 y 7.
- `tsc --noEmit` OK · `next lint` sin warnings.
- Pendiente conocido: el **contenido** de algunas páginas todavía es más ancho que el celular (Registrar Venta ~441 px en un teléfono de 390; el encabezado de Ventas del Día queda apretado). Se resuelve en las Fases 3 y 4. Mientras tanto la barra superior se extiende a ese ancho (el logo de la derecha queda fuera de la vista en esas dos páginas).

### Fase 3 — Registrar Venta (2026-09-29) — aprobada

**Problema principal encontrado**: sin filtro la búsqueda trae hasta 60 productos; en celular (2 columnas) eran ~5.000 px de grilla **antes** de llegar al carrito y al botón "Vender". Además la página medía 441 px en un teléfono de 390.

**Cambios** (`admin/ventas/page.tsx`, `tailwind.config.ts`) — solo presentación; cálculos, estados y llamadas intactos:
- `tailwind.config.ts`: variante nueva **`touch:`** = `@media (pointer: coarse)`. Da tamaño de dedo (44 px) a controles compactos sin tocar nada con mouse. Se reutiliza en las fases siguientes.
- **Barra fija del carrito** (< lg, solo con productos): cantidad de productos, pestaña, total y botón "Ver factura" que baja a la factura. Se esconde sola cuando la factura está en pantalla (IntersectionObserver) o con el modal de pago abierto — nunca duplica "Vender" ni cobra por su cuenta. Mientras está visible, `scroll-padding-bottom` en `<html>` para que lo que el navegador desplace a la vista (campo enfocado, tarjeta) no quede escondido detrás de ella.
- **Causa del desborde**: la cuadrícula `lg:grid-cols-5` en celular era una sola columna de ancho automático, que se estiraba al contenido más ancho. `grid-cols-1` (= `minmax(0,1fr)`) la limita a la pantalla. Escritorio igual.
- Buscador a todo el ancho y categorías debajo en celular (en sm+ en la misma fila, como antes); `enterKeyHint="search"` (solo cambia la tecla Enter del teclado del celular). **Descartado a propósito** `type="search"`: en escritorio agregaba una ✕ y hacía que Escape vaciara el campo (cambio de comportamiento).
- Grilla de productos y carrito sin scroll interno en < lg (un scroll dentro de otro atrapa el dedo); tarjetas más compactas en celular.
- Carrito en celular: fila 1 = −/cantidad/+ y total de la línea; fila 2 = Precio; fila 3 = Descuento. Botones −, +, eliminar con nombre accesible (→ 44 px táctil por la regla de la Fase 1); Precio/Descuento como `<label>` (tocar la palabra enfoca el campo) y 40 px de alto en táctil.
- Táctil (44 px): pestañas, "+ nueva venta", área de la ✕ de cerrar pestaña (el ícono se ve igual), fecha, Limpiar, cliente, resultados de cliente, tallas, botones del formulario "fuera de catálogo", Recibo/Cancelar en "Ventas de hoy". Nombres accesibles nuevos: cerrar tallas, quitar cliente, fecha, categorías.
- Encabezado más compacto en celular; "Ventas de hoy" apilada en celular.

**Verificación**
- Prueba automática en 360/390/430/768 (táctil) y 1024/1366, agregando 2 productos al carrito (solo estado del navegador; **nunca** se pulsó Vender/Confirmar): ancho = dispositivo; nada se sale de la tarjeta de la factura; barra visible con "2 productos · $306.000"; botones de la factura 44 px; campos 16 px en celular; "Ver factura" lleva a la factura y la barra se esconde; sin errores JS. Todo OK.
- Selector de tallas y formulario "fuera de catálogo" en 390: botones 44 px, sin desborde.
- **Escritorio píxel a píxel** contra la versión anterior (git stash) con el carrito lleno: 1366 y 1024 **idénticos**. (La única diferencia fue la animación del foco del buscador en la captura vacía.)
- `tsc` OK · `next lint` sin warnings · `vitest` 132/132.
- Nota: la red de la oficina a veces hace fallar la validación del token (401 tras ~10 s) — la prueba reintenta; no es de la app ni de estos cambios.

**Pendiente preexistente (no se tocó, para no cambiar escritorio sin permiso — el usuario aprobó arreglarlo en la Fase 5)**: a 1024 px (portátil pequeño con el menú expandido) la columna de la factura es angosta y el botón "Limpiar" y los campos de Precio se salen de la tarjeta (la página mide 1.046 px). Ya pasaba antes de estas fases.

**Queda para la Fase 5**: el modal de pago ("Pagar factura" / "Confirmar venta") todavía es el diálogo centrado de escritorio.

### Fase 4 — Ventas del Día (2026-09-30) — aprobada

**Cambios** (solo `admin/ventas-dia/page.tsx`) — presentación; cálculos, consultas y acciones intactos:
- **Encabezado**: en < lg el título arriba y debajo los controles (fecha, formato, Exportar) a 44 px en táctil; en lg+ la misma fila de antes (`lg:flex-row`, `lg:flex-nowrap`).
- **Resumen**: 2 columnas compactas en celular (antes 4 tarjetas grandes apiladas); en sm+ igual que antes.
- **Ventas como tarjetas en < md**: cada línea muestra producto (talla, ×cantidad), precio, método, factura · hora y — solo admin — costo y G. Neta; abajo las 4 acciones (editar, recibo, recibo clásico, cancelar) a 44 px, con cancelar separado a la derecha para evitar toques accidentales; casilla de selección de 20 px. Mismos datos y mismas funciones que la tabla; en md+ se ve la tabla de siempre.
- **Exportar PNG/JPG/PDF** (html2canvas captura al ancho actual): desde el PC sale igual que antes; desde el celular ahora sale la versión en tarjetas con todas las ventas completas (antes salía la tabla recortada por el scroll horizontal). En modo exportación las tarjetas ocultan casilla y acciones, igual que la tabla.
- Préstamos, cambios, gastos y notas: relleno `p-4 sm:p-6`; formulario de gastos apilado en celular con controles de 44 px; nombres accesibles en selects.
- `grid-cols-1` en las cuadrículas de 3 y 2 columnas (mismo motivo que en la Fase 3).

**Verificación**
- Prueba automática en 360/390/430/768/1024/1366 con la fecha 29/09 (12 líneas de venta): ancho = dispositivo; en celular 12 tarjetas y acciones de 44 px; en 768+ tabla; sin errores JS.
- Exportación PNG real desde 390 (716×6.432, todas las ventas legibles) y desde 1366 (mismo tamaño de archivo que antes: 995 KB).
- **Escritorio píxel a píxel** contra la versión anterior (git stash): 1366 y 1024 idénticos salvo la insignia de desarrollo de Next.js (esquina inferior izquierda, no existe en producción). La primera comparación detectó que `flex-wrap` bajaba "Exportar" a otra línea en escritorio → corregido con `lg:flex-nowrap` antes de dar la fase por buena.
- `tsc` OK · `next lint` sin warnings.
- La red de la oficina siguió rechazando peticiones de forma intermitente (401 tras ~11 s, p. ej. préstamos o gastos que aparecen vacíos); la prueba recarga hasta que todo carga. No es de la app ni de estos cambios.

**Queda para la Fase 5**: el modal "Editar factura completa" de esta página todavía es el diálogo de escritorio.

### Fase 5 — Modales y avisos + portátil (2026-09-30) — aprobada

**Cambios**
- **Hoja inferior en celular (< sm)** para los 3 modales del flujo de venta — sube desde abajo, llega al borde, scroll propio (`max-h-[92dvh]`, `overscroll-contain`), esquinas superiores redondeadas, animación corta (se omite con "reducir movimiento"). En sm+ el diálogo centrado de siempre (`sm:` restaura exactamente las clases anteriores). Todos con `role="dialog"`, `aria-modal`, título enlazado y ✕ con nombre accesible. No se agregaron comportamientos nuevos (p. ej. cerrar tocando afuera): se cierran igual que antes.
  - `admin/ventas` — **Pagar factura / Confirmar pago**: controles a 44 px en táctil (tipo de tarjeta, "especifica…", método, monto, "Cambiar método", "Agregar otro método", quitar pago); "Monto recibido" más grande (48 px, texto 18 px) y enlazado a su etiqueta; en Combinado sin scroll interno en celular (la hoja ya desplaza).
  - `admin/ventas-dia` — **Editar factura completa**: los productos pasan a tarjetas en celular (nombre/quitar arriba; Cant., Precio y — admin — Costo abajo, 44 px), con los mismos `setEditCart`; en sm+ la tabla de siempre. Pagos y botones finales a 44 px y a todo el ancho en celular.
  - `components/admin/session-alerts.tsx` — **Recordatorios** al iniciar sesión.
- **Portátil — Registrar Venta** (aprobado cambiar escritorio): la factura usa siempre el diseño apilado — encabezado en dos filas cuando no cabe (en 1366 "Factura de venta" ya no se parte en dos líneas) y en cada línea del carrito el precio en su propia fila (como el descuento). Así funciona con cualquier ancho de columna.

**Verificación**
- Versión anterior (git stash), portátil con 2 productos: la factura se salía de la tarjeta en **3 de 4** casos — 1024 (Limpiar, precios y totales; página 1.046 px), **1280** (el total $280.000 — no se había detectado antes) y 1024 con menú colapsado. Después: **4/4 OK** (1024, 1280, 1366, 1024 colapsado).
- Celular 360/390 (sin pulsar nunca Confirmar venta / Guardar cambios): cobro, cobro en Efectivo, cobro Combinado, editar factura y recordatorios → hoja pegada abajo y a todo el ancho, sin desborde, todos los controles ≥ 44 px, se cierran con la ✕, sin errores JS.
- Escritorio 1366 píxel a píxel: modal de edición **idéntico**; modal de cobro idéntico (la única diferencia es la factura de fondo, que es el arreglo del portátil).
- `tsc` OK · `next lint` sin warnings · `vitest` 132/132 · **`next build` OK** (123 páginas; los "Connect Timeout" del log son la red intermitente al leer la configuración de la tienda, no detienen el build).

### Fase 6a — Cierres, Préstamos, Facturas, Notas (2026-09-30) — aprobada

La Fase 6 se dividió en 6a / 6b / 6c (ver tabla) para seguir comprobando por partes.

**Diagnóstico antes** (390 px): Cierres 431 px de ancho (botón "Nuevo Arqueo"); Préstamos 511 px (selector de estado y botones de ícono de cada fila, 20 controles pequeños); Facturas 492 px (insignias y montos de cada factura); Notas 413 px (pestañas; 29 controles pequeños).

**Cambios** — solo presentación:
- `cierres`: encabezado título/botones apilado en < lg; historial como tarjetas en < md (fecha, estado, total, diferencia y desglose efectivo/tarjeta/transf./wallet); botones del formulario táctiles.
- `prestamos`: pestañas y filtros que se acomodan (`flex-wrap`); cada préstamo en dos filas en < sm (datos arriba; días, estado, selector y acciones abajo, con editar+eliminar agrupados a la derecha); selector y botones a 44 px con nombre accesible; formulario con relleno menor.
- `facturas`: encabezado apilado en < sm; resumen en 2 columnas compactas; cada factura con descripción arriba e insignias/montos abajo en < sm; ítems y abonos con controles de 44 px y campos a todo el ancho en celular.
- `notas`: pestañas con desplazamiento horizontal en < sm (llegan al borde); formulario y filtros táctiles; botones completar/editar/eliminar con nombre accesible (→ 44 px).

**Verificación**
- Diagnóstico después en 360/390/768: las 4 páginas con ancho = dispositivo y **0 controles < 40 px** (en Notas solo la fila de pestañas desplaza, a propósito).
- **Escritorio píxel a píxel** (1366 y 1024, página completa) contra la versión anterior: las 8 capturas **idénticas**. La primera comparación detectó 3 diferencias en 1024 causadas por `shrink-0`/`min-w-0`/`gap`/`flex-wrap` que también actuaban con columna angosta → se limitaron a celular (`max-sm:` / `sm:flex-nowrap` / `sm:gap-0`) antes de dar la parte por buena.
- `tsc` OK · `next lint` sin warnings.

### Fase 6b — Inventario, Cambios, Cargue de pedidos (2026-09-30) — aprobada

**Diagnóstico antes** (390 px): Inventario 716 px (botones del encabezado y pestañas); tabla Detalle de 1.228 px dentro de un scroll horizontal con 145 controles pequeños; Ingresar 435 px; Cargue de pedidos 477 px (selector de proveedor).

**Técnica nueva — `table-stack`** (`globals.css`): en < md cada fila de la tabla se muestra como tarjeta ("Etiqueta …… valor", etiqueta desde `data-label`) **sin duplicar el HTML**: los formularios en línea (editar producto, ajustar stock, tallas) son exactamente los mismos. Solo afecta a los hijos directos de la tabla con la clase, así la tabla de tallas anidada se apila por separado. En md+ la tabla es la de siempre. Reutilizable en las fases siguientes. Se prefirió sobre duplicar la tabla como tarjetas porque el Detalle tiene ~600 líneas interactivas y duplicarlas arriesgaba que las dos versiones se desincronizaran.

**Cambios**
- `inventario/page.tsx`: encabezado apilado con acciones que se acomodan (< lg); resumen en 2 columnas compactas (íconos decorativos ocultos en celular; "Valor en costo" a lo ancho); pestañas con desplazamiento horizontal; buscadores a todo el ancho; `table-stack` + `data-label` en Detalle, tallas, Inventario General, Movimientos y la tabla del modal "Nuevo ajuste"; controles de los formularios en línea a 44 px en táctil y botones ✓/✕ cuadrados de 44 px con nombre accesible (8); Ingresar con `grid-cols-1` (causa del desborde, igual que en la Fase 3), casillas de talla con más área de toque y botones que pasan a dos filas en celular; modal "Exportar" como hoja inferior; relleno menor en tarjetas.
- `inventario/cambios` y `inventario/cargue-pedidos`: flecha "volver" de 44 px con nombre accesible, título responsive, columnas apiladas, controles táctiles; en Cargue, selector de proveedor a todo el ancho, `table-stack` en la tabla de cascos y botones finales apilados en celular.

**Verificación**
- 360/390: las 4 pestañas de Inventario, Cambios y Cargue con ancho = dispositivo y **0 controles < 40 px**; Detalle con una fila de tallas desplegada revisado visualmente (etiquetas y valores alineados, tallas apiladas dentro de la tarjeta).
- 768 (tablet): todo cabe; las tablas Detalle y Movimientos siguen como tabla con scroll horizontal controlado (el apilado aplica en < 768).
- **Escritorio píxel a píxel** (1366 y 1024, página completa, esperando a que cada pestaña termine de cargar): las 12 capturas idénticas (única diferencia: la insignia de desarrollo de Next.js, que no existe en producción).
- `tsc` OK · `next lint` sin warnings.

**Arreglo de portátil (aprobado por el usuario, 2026-09-30)**: en 1024 Inventario medía 1.063 px (ya pasaba antes). Se creía que eran los botones del encabezado, pero el diagnóstico mostró la causa real: la tarjeta "Valor en costo" ($ 61.343.912) no cabía en la 5.ª columna del resumen. Arreglo: 5 columnas solo desde xl (1280); entre sm y xl, 4 columnas y "Valor en costo" en su propia fila a lo ancho; entre xl y 2xl (1280–1535) esa tarjeta sin ícono y con la cifra un tamaño menor (en 1280/1366 la cifra tocaba el borde y el ícono quedaba aplastado — también preexistente). El encabezado se dejó como antes (sí cabía). Verificado: 1024 (menú expandido y colapsado), 1280, 1366, 1440, 1600, 1920 → ancho = ventana y nada se sale de las tarjetas del resumen. En 1366 lo único que cambia respecto a antes es esa tarjeta.

**Pendiente preexistente (no incluido en lo aprobado)**: en 1024 y 1366 la tabla Detalle tiene más columnas de las que caben y la columna de acciones queda cortada dentro de su scroll horizontal.

### Fase 6c — Historial Mensual, Presupuesto, Reportes + revisión táctil (2026-09-30) — aprobada

**Diagnóstico antes** (390 px): Historial Mensual 570 px (filas de "Ventas por día" con anchos fijos w-20 + w-28 + w-48); Presupuesto 637 px (mes/año/"Copiar mes anterior" junto al título); Reportes 394 px (cuadrículas `lg:grid-cols-2` sin `grid-cols-1`). Ya cabían pero con controles pequeños: Calculadora (21), submenú de Cierre Alegra (5 enlaces en sus 5 páginas), Fiado (3), Mi Cuadre (1). Órdenes, Cupones y Reseñas ya estaban bien.

**Cambios** — solo presentación:
- `historial-mensual`: encabezado apilado (< lg); tarjetas de costo/comisiones/utilidad/días en 2 columnas compactas; cada día de "Ventas por día" en dos líneas en celular (fecha, barra y monto arriba; estado y utilidad a la derecha abajo) y filas de 44 px en táctil; `grid-cols-1`; relleno menor.
- `presupuesto`: encabezado apilado; resumen en 2 columnas; formularios de presupuesto y de gasto apilados con controles de 44 px; eliminar gasto con nombre accesible.
- `reportes`: encabezado apilado (< sm); rango de fechas táctil; las 10 tarjetas de estadísticas en 2 columnas con menos relleno en celular; `grid-cols-1` en las secciones de 2 columnas (causa del desborde).
- Táctil (44 px): Calculadora (botones Limpiar, modos de margen, porcentajes rápidos, resultados de búsqueda, "Buscar otro producto", campo y selector), Cierre Alegra (submenú), Fiado (filtros), Mi Cuadre (Actualizar).
- No tocado: la casilla de verificación de Productos (16 px, estándar de casilla; su etiqueta también responde al toque).

**Verificación**
- 360/390/768: las 7 páginas modificadas con ancho = dispositivo y **0 controles < 40 px**.
- **Escritorio píxel a píxel** (1366 y 1024, página completa): 13/14 idénticas; en Mi Cuadre solo cambia el texto "Actualizado HH:MM:SS" (hora distinta entre corridas).
- `tsc` OK · `next lint` sin warnings.

### Fase 7 — Páginas solo-admin + tabla de Inventario en portátil (2026-09-30) — aprobada

**Diagnóstico antes** (390 px): Usuarios 617 px (filtros por rol), Auditoría 543 px (ID y fila de insignias de cada registro), Cuentas 507 px (pestañas), Categorías 473 px (botones de cada fila, 24 controles pequeños), Exportar/Importar 426 px (cuadrícula sin `grid-cols-1` y botón de texto largo), Configuración 396 px (botón Guardar del encabezado). Controles pequeños en Dashboard (9 enlaces de 28–30 px) y Nuevo producto ("examina", 20 px). Ya estaban bien: Comisiones y Gastos Fijos, Rendimiento, Órdenes, Cupones, Reseñas.

**Cambios** — solo presentación:
- `cuentas`: encabezado responsive; pestañas con desplazamiento horizontal; selectores a 44 px en táctil.
- `usuarios`: encabezado apilado; formulario táctil; resumen en 2 columnas; filtros por rol que se acomodan; tabla de usuarios con `table-stack`; ✓/✕ de rol y contraseña con nombre accesible (→ 44 px).
- `auditoria`: resumen en 2 columnas; filtros a todo el ancho; cada registro con insignias que se acomodan, ID partido en celular y JSON del detalle con scroll propio (< md).
- `categorias`: formulario apilado; filas con nombre/slug que se acomodan; activar/editar/eliminar a 44 px con nombre accesible (se conservan los `data-testid` de E2E).
- `configuracion`: encabezado apilado; nombre accesible en el botón flotante de guardar (ya existía para móvil).
- `exportar-importar`: `grid-cols-1`; botón de plantilla con texto que baja de línea en celular; selector de archivo táctil; resultados apilados.
- `components/admin/dashboard-tabs.tsx` y `components/products/image-uploader.tsx`: enlaces de alertas, días de venta, "Ver todos" y "examina" a 44 px en táctil.
- **Tabla Detalle de Inventario en portátil (aprobado)**: medía 1.180 px mínimo contra 702 (1024), 958 (1280), 1.044 (1366), 1.118 (1440). Nuevas utilidades en `globals.css`: `table-stack-xl` (apilado como tarjetas por debajo de xl, 1280) y `table-compact-xl` (entre 1280 y 1535, relleno horizontal de celdas de 24 → 8 px). Aplicadas a la tabla Detalle y a su tabla de tallas. Resultado: cabe en 768, 1024 (menú expandido y colapsado), 1279, 1280, 1366, 1440, 1535, 1536 y 1920; en 1366 se ven las 8 columnas con acciones. El modal "Nuevo ajuste" se dejó con `table-stack` (fuera de lo aprobado).

**Verificación**
- 360/390/768: las 8 páginas con ancho = dispositivo y **0 controles < 40 px**.
- **Escritorio píxel a píxel** (página completa): las 8 páginas en 1366 y 1024 idénticas (única diferencia en Cuentas: la insignia de desarrollo de Next.js); Inventario en 1600 y 1920 (4 pestañas) idéntico — el arreglo aprobado solo actúa por debajo de 1536.
- `tsc` OK · `next lint` sin warnings · `vitest` 132/132 · **`next build` OK** (la portada de la tienda tardó por la red y Next la reintentó sola).

### Fase 8 — Auditoría final (2026-09-30) — aprobada

Hecha con red a GitHub (wifi del celular del usuario: `raw.githubusercontent.com` y `github.com` respondiendo; en la red de la oficina `github.com` está bloqueado).

**`web-design-guidelines`** (reglas descargadas en el momento de `vercel-labs/web-interface-guidelines`) sobre el flujo de venta (layout, Registrar Venta, Ventas del Día, globals.css). **Corregido** (solo afecta celular o a quien activa "reducir movimiento"):
- `prefers-reduced-motion` no se respetaba en ninguna parte → `globals.css`: animaciones y transiciones instantáneas y scroll no suave; se conservan los indicadores de carga (`.animate-spin`). Aplica a toda la app (también la tienda) solo para quien tiene activada esa opción del sistema.
- Cajón del menú sin `overscroll-behavior: contain` → agregado al `<nav>` del sidebar.
- `autoFocus` en el buscador de Registrar Venta abría el teclado solo en algunos celulares → ahora el foco inicial solo se da con mouse (`pointer: fine`), con una *callback ref* estable que reproduce exactamente a `autoFocus` (se enfoca en cada montaje del campo, nunca en re-renders). En el PC sigue enfocado al abrir para el lector de código de barras (verificado; un primer intento con un efecto de montaje falló porque el campo se vuelve a montar al cargar datos — se detectó en la prueba y se corrigió antes de dar la fase por buena).

**Preexistentes que cambian el escritorio — corregidos a pedido del usuario (2026-09-30):**
- Textos con `...` → `…` en todo el panel admin (47 textos en 21 archivos: marcadores de posición, mensajes de carga y opciones; solo cadenas visibles, nunca el operador `...`).
- `transition-all` → lista explícita de propiedades (mismo efecto visual): `<main>` del layout (`padding`), barra de progreso de Cierre Alegra (`width`), zona de arrastre de imágenes, componentes base `Button`, `Card`, `Input`, `Textarea` y las clases `btn-racing`, `btn-outline-racing`, `card-racing`, `card-glass`, `card-premium`, `input-modern`, `nav-link` de `globals.css`. (Se dejaron `accordion` y `toast` de la tienda: sus animaciones dependen de Radix.)
- Anillo de foco visible con teclado (`focus-visible:ring`) en el campo de cantidad del carrito y en el interruptor Activo de Cupones (que además recibió nombre accesible y `aria-pressed`).
- Pestañas de venta de Registrar Venta: la ✕ era un ícono con `onClick` dentro del botón de la pestaña (HTML inválido, fuera del alcance del teclado). Ahora la pestaña y la ✕ son dos botones hermanos dentro de un contenedor con el mismo aspecto; la ✕ tiene nombre accesible ("Cerrar Venta 2"), aparece también al enfocarla con teclado y ocupa 44×44 en táctil con el ícono centrado. Probado: agregar pestaña, ✕ oculta en reposo en PC, visible con mouse y con teclado, Enter/toque la cierra, sin errores.
- `color-scheme: light/dark` en `:root`/`.dark` (controles nativos en el tema correcto) y `viewport.themeColor` en el layout raíz (barra del navegador del celular del color del fondo). Aplica a toda la app.

**`impeccable detect`** sobre todo lo tocado en estas fases: 7 avisos, todos de estilo visual ("AI slop"), ninguno de celular ni accesibilidad: fuente Inter (4), texto con degradado (`text-aurora` en `globals.css`), borde lateral de color (Cierre Alegra) y subrayado grueso en la pestaña activa (Registrar Venta). No se tocaron: el estilo Racing Dark se mantiene por decisión del usuario; quedan para un eventual rediseño.

**Barrido final de regresión**: las 35 rutas del admin en 390 y 1366 → **70/70 OK**: todas cargan, sin errores de JavaScript, con el título correcto en la barra y con ancho exactamente igual a la pantalla (antes de la Fase 1 ninguna ruta cabía en 390; al terminar la Fase 2, 18/35). Verificación puntual de los arreglos de esta fase: PC con el buscador enfocado al abrir, celular sin teclado automático, menú con scroll contenido, "reducir movimiento" respetado. `tsc` OK · `next lint` sin warnings.
- `next build` OK antes del commit.

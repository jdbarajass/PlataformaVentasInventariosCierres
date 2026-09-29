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
| 2 | Estructura del admin | Barra superior compacta con botón de menú en < 1024 px; el sidebar actual pasa a cajón lateral que se abre/cierra (se cierra al navegar); contenido con `p-4` / `sm:p-6` / `lg:p-8`. En ≥ 1024 px todo igual, incluido el colapso guardado. | Pendiente |
| 3 | Registrar Venta | `/admin/ventas`: buscador, carrito, formas de pago y botón de cobrar cómodos a una mano; cuadrículas que se apilan; acciones principales siempre alcanzables. | Pendiente |
| 4 | Ventas del Día | `/admin/ventas-dia`: resumen arriba, tablas anchas → tarjetas o scroll horizontal controlado sin perder columnas; filtros y acciones táctiles. | Pendiente |
| 5 | Modales y avisos | Los modales/diálogos que usan Registrar Venta y Ventas del Día → hoja inferior o pantalla completa en celular; `SessionAlerts` y toasts sin tapar acciones. | Pendiente |
| 6 | Resto de páginas del vendedor | Mi Cuadre, Calculadora, Cierres, Fiado, Préstamos, Facturas, Inventario (consulta), Notas, Productos. | Pendiente |
| 7 | Páginas solo-admin | Cuentas, Reportes, Rendimiento, Auditoría, Usuarios, Configuración, Cierre Alegra, etc. | Pendiente |
| 8 | Auditoría final | `impeccable audit` + `web-design-guidelines` (necesita red a GitHub) sobre el admin en celular; `prefers-reduced-motion`; registro final. | Pendiente |

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
- **YBMOTOCOM** (`C:\Users\JJBarajas\Pictures\YOJAN`) comparte este código base: estos cambios de frontend también le aplican y hay que replicarlos allá (sin migraciones SQL ni variables de entorno). Decisión del usuario pendiente: replicar fase por fase o todo al final.

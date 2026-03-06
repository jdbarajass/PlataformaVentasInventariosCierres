# YJBMOTOCOM - Guia de Diseno UX

## Filosofia de Diseno

YJBMOTOCOM utiliza un diseno **futurista y minimalista** enfocado en mobile-first, con inspiracion en referencias de Mobbin y tendencias modernas de e-commerce.

## Paleta de Colores

### Colores Principales
- **Primary (Cyan)**: `#00D4D4` - CTAs, enlaces activos, acentos
- **Accent (Purple)**: `#BF00FF` - Hover states, gradientes
- **Background**: `#FFFFFF` (light) / `#0A0A0F` (dark)
- **Foreground**: `#0A0A0F` (light) / `#FAFAFA` (dark)

### Colores de Estado
- **Success**: `#22C55E` - Stock disponible, pagos exitosos
- **Warning**: `#F59E0B` - Stock bajo, alertas
- **Error**: `#EF4444` - Agotado, errores, eliminar

### Gradientes Neon
```css
/* CTA Button */
background: linear-gradient(135deg, #00D4D4 0%, #0066FF 100%);

/* Card Hover Glow */
box-shadow: 0 0 30px rgba(0, 212, 212, 0.3);
```

## Tipografia

### Fuentes
- **Sans-serif**: Inter (o Geist Sans)
- **Monospace**: Geist Mono (para precios, SKUs)

### Escala
| Nombre | Tamano | Uso |
|--------|--------|-----|
| Display | 48-64px | Hero titles |
| H1 | 30-36px | Page titles |
| H2 | 24-30px | Section titles |
| H3 | 18-20px | Card titles |
| Body | 16px | Texto principal |
| Small | 14px | Labels, captions |
| Tiny | 12px | Badges, metadata |

## Componentes UI

### Botones
- **Neon (Primary)**: Gradiente cyan-blue, sombra glow en hover
- **Outline**: Borde sutil, fondo transparente
- **Ghost**: Sin borde, hover con fondo secondary
- **Destructive**: Rojo para acciones peligrosas

### Cards
- Border radius: `1.5rem` (24px) - "2xl"
- Sombra suave que aumenta en hover
- Borde sutil en light mode
- Efecto glow en hover para cards de producto

### Inputs
- Border radius: `0.75rem` (12px) - "xl"
- Focus ring en color primary
- Transicion suave en todos los estados

## Microinteracciones

### Animaciones
```css
/* Slide Up - Para modales y elementos que aparecen */
@keyframes slide-up {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Glow Pulse - Para CTAs importantes */
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 212, 0.4); }
  50% { box-shadow: 0 0 30px rgba(0, 212, 212, 0.6); }
}

/* Scale - Para botones al hacer click */
active:scale-95 transition-transform
```

### Hover Effects
- Cards: Elevacion de sombra + borde primary
- Botones: Glow effect + ligero scale
- Links: Underline animado
- Imagenes: Zoom suave (scale 1.05-1.1)

## Layout y Espaciado

### Grid
- Container max-width: 1400px
- Gap entre cards: 24px
- Padding contenedor: 32px (desktop), 16px (mobile)

### Breakpoints
| Nombre | Ancho | Columnas Grid |
|--------|-------|---------------|
| Mobile | < 640px | 1 |
| SM | 640px | 2 |
| MD | 768px | 2 |
| LG | 1024px | 3-4 |
| XL | 1280px | 4 |

## Patrones de Navegacion

### Header (Desktop)
- Logo izquierda
- Nav links centro
- Search + Cart + User derecha
- Sticky con blur backdrop

### Header (Mobile)
- Logo izquierda
- Menu hamburguesa derecha
- Bottom nav fijo: Home, Categorias, Carrito, Perfil

### Carrito
- Drawer lateral derecho
- Overlay oscuro con blur
- Lista de items con controles de cantidad

## Flujos UX Clave

### Checkout
1. Revision de carrito
2. Informacion de contacto
3. Direccion de envio
4. Metodo de pago
5. Confirmacion

*Inspiracion Mobbin*: Checkout de Shopify, Amazon

### Producto
1. Galeria de imagenes (swipeable en mobile)
2. Titulo + precio prominente
3. Badge de stock
4. Selector de cantidad
5. CTA "Agregar al carrito"
6. Descripcion expandible
7. Productos relacionados

*Inspiracion Mobbin*: Paginas de producto de Nike, Apple Store

### Admin Dashboard
1. Stats cards en la parte superior
2. Graficos de ventas
3. Tabla de ordenes recientes
4. Alertas de stock bajo

## Accesibilidad

- Contraste minimo 4.5:1 para texto
- Focus visible en todos los elementos interactivos
- Labels para todos los inputs
- Aria labels en iconos sin texto
- Responsive font sizes

## Dark Mode

- Background: `#0A0A0F` (casi negro con tinte azul)
- Cards: `#1A1A24`
- Borders: `rgba(255,255,255,0.1)`
- Glow effects mas pronunciados

## Referencias Mobbin

- **Home/Landing**: Apple Store, Glossier
- **Product Grid**: Nike, ASOS
- **Product Detail**: Allbirds, Away
- **Checkout**: Shopify, Stripe Checkout
- **Admin Dashboard**: Linear, Vercel Dashboard

---

## Racing Dark Premium v3 — Design System Actualizado

> Implementado en `racing-dark-premium` (Feb 2026). Reemplaza la paleta cyan/purple por **rojo racing** como color primario.

### Paleta Racing Dark

| Token CSS | Valor light | Valor dark | Uso |
|-----------|-------------|------------|-----|
| `--primary` | `#E10600` | `#E10600` | Color de marca (rojo Ferrari) |
| `--background` | `#FFFFFF` | `#0D0E14` | Fondo base |
| `--card` | `#F8F9FA` | `#13141C` | Fondo de cards |
| `--glass-bg` | `rgba(255,255,255,0.7)` | `rgba(19,20,28,0.7)` | Glassmorphism |
| `--glass-border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.06)` | Borde glass |
| `--highlight` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | Línea inset superior |
| `--highlight-sm` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.05)` | Highlight suave |
| `--spotlight` | radial-gradient(primary/4) | radial-gradient(primary/6) | Spotlight de fondo |
| `--glow-primary` | `rgba(225,6,0,0.18)` | `rgba(225,6,0,0.25)` | Sombra glow roja |
| `--glow-primary-lg` | `rgba(225,6,0,0.12)` | `rgba(225,6,0,0.18)` | Sombra glow extendida |

### Fuentes (v3)

- **Sans-serif**: Inter (variable, 100–900 weight)
- No monospace en v3 — precios usan Inter weight 800–900

### Clases CSS Personalizadas

#### Cards

| Clase | Descripción |
|-------|-------------|
| `.card-glass` | Glassmorphism: `backdrop-blur(20px) saturate(180%)` + borde semitransparente + inset highlight |
| `.card-premium` | Sombra multicapa `0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 var(--highlight)` + glow en hover + `::before` línea gradiente superior |

#### Botones

| Clase | Descripción |
|-------|-------------|
| `.btn-racing` | Fondo primary, texto blanco, `::before` overlay para transición, glow en hover |
| `.btn-outline-racing` | Borde `primary/40`, fondo transparente, hover rellena con primary |

#### Fondos y Texturas

| Clase | Descripción |
|-------|-------------|
| `.aurora-bg` | Gradiente radial mesh animado (4 radiales en esquinas). Diferente para light/dark |
| `.carbon-texture` | Textura fibra de carbono: `repeating-linear-gradient` a ±45° con líneas de 1px |
| `.spotlight` | Gradiente radial centrado con color primary muy suave |

#### Texto y Loaders

| Clase | Descripción |
|-------|-------------|
| `.text-aurora` | Gradiente en texto: `background-clip: text` + `background-size: 200% auto` + animación `aurora-text` |
| `.glow-text` | Texto con `text-shadow` usando `--glow-primary` |
| `.skeleton` | Loader shimmer: `bg-secondary/40` + `::after` con gradiente animado (shimmer de izquierda a derecha) |

#### Marquee Infinito

```css
/* Estructura HTML */
<div class="marquee-wrapper overflow-hidden">
  <div class="marquee-track">
    {/* duplicar el array: [...items, ...items] */}
  </div>
</div>

/* Para dirección inversa */
<div class="marquee-track-reverse">...</div>

/* El wrapper pausa la animación en hover */
.marquee-wrapper:hover .marquee-track { animation-play-state: paused; }
```

- `marquee-track`: `width: max-content`, `animation: marquee 30s linear infinite`
- `marquee-track-reverse`: igual pero `animation: marquee-reverse 35s linear infinite`
- Clave: el contenido debe estar duplicado y la animación usa `translateX(-50%)` para el loop seamless

### Keyframes CSS (en globals.css)

| Keyframe | Uso |
|----------|-----|
| `breathe` | Escalado suave 1.0 → 1.08 → 1.0 para orbs de fondo |
| `breathe-spotlight` | Opacidad 0.3 → 0.6 → 0.3 para spotlights |
| `marquee` | `translateX(0%) → translateX(-50%)` para marquee normal |
| `marquee-reverse` | `translateX(-50%) → translateX(0%)` para marquee inverso |
| `aurora-text` | `background-position: 0% center → 200% center` para texto gradiente |
| `border-gradient` | Rotación de gradiente en bordes animados |
| `reveal-up` | Entrada desde abajo con opacidad (para elementos que aparecen) |

### Animaciones Tailwind (en tailwind.config.ts)

| Clase Tailwind | Keyframe | Duración |
|---------------|----------|----------|
| `animate-breathe` | `breathe` | 4s ease-in-out infinite |
| `animate-breathe-fast` | `breathe` | 2s ease-in-out infinite |
| `animate-marquee` | `marquee` | 30s linear infinite |
| `animate-marquee-reverse` | `marquee-reverse` | 35s linear infinite |
| `animate-marquee-slow` | `marquee` | 50s linear infinite |
| `animate-reveal-up` | `reveal-up` | 0.5s ease-out forwards |
| `animate-spin-slow` | `spin` | 8s linear infinite |

### Sombras Personalizadas (en tailwind.config.ts)

| Clase Tailwind | Valor |
|---------------|-------|
| `shadow-glow-red-sm` | `0 0 16px rgba(225,6,0,0.25)` |
| `shadow-glow-red-lg` | `0 0 40px rgba(225,6,0,0.35), 0 0 80px rgba(225,6,0,0.15)` |
| `shadow-glow-amber` | `0 0 20px rgba(245,158,11,0.3)` |
| `shadow-glow-white` | `0 0 20px rgba(255,255,255,0.15)` |
| `shadow-premium` | `0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)` |
| `shadow-premium-hover` | Versión intensificada de premium |
| `shadow-inner-top` | `inset 0 1px 0 rgba(255,255,255,0.08)` |
| `shadow-whatsapp` | Sombra verde para botón flotante de WhatsApp |
| `shadow-whatsapp-hover` | Versión hover de shadow-whatsapp |

### ThemeToggle — Componente Pill

```
┌─────────────────────────────┐
│  ☀  ◄────────────  🌙      │  ← modo claro: pill a la izquierda
└─────────────────────────────┘

┌─────────────────────────────┐
│  ☀           ────────────►  🌙  │  ← modo oscuro: pill a la derecha
└─────────────────────────────┘
```

- Track: `h-8 w-[3.75rem] rounded-full` con iconos Sun y Moon siempre visibles
- Pill: `h-7 w-7 rounded-full` que se desliza con `left-0.5` ↔ `left-[calc(100%-1.875rem)]`
- Transición: `cubic-bezier(0.34,1.56,0.64,1)` (spring) via `style={{ transitionTimingFunction }}`
- El sistema usa `localStorage` (no `next-themes`). `useEffect` para detectar SSR y evitar hydration mismatch.

### Delays de Animación

```css
/* En globals.css @layer utilities */
.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
.delay-500 { animation-delay: 500ms; }
```

### Clases Utilitarias Adicionales

```css
.gradient-border-animated  /* Borde con gradiente que rota */
.card-glow-hover           /* Glow rojo en hover en card */
```

### Notas de Implementación

- **No usar `duration-600`**: no existe en Tailwind. Usar `duration-500` o `duration-700`.
- **Cubic-bezier en Tailwind**: las clases arbitrarias con comas en `ease-[...]` pueden causar warnings. Usar `style={{ transitionTimingFunction }}` en su lugar.
- **Marquee seamless**: el array de items debe duplicarse en JSX `[...items, ...items]` y la animación hace `translateX(-50%)` para loop infinito sin gap.
- **SSR safety**: cualquier componente que acceda a `localStorage` o `window` debe tener un `mounted` state y un placeholder con mismas dimensiones para evitar layout shift.

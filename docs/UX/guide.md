# YB MOTOCOM - Guia de Diseno UX

## Filosofia de Diseno

YB MOTOCOM utiliza un diseno **futurista y minimalista** enfocado en mobile-first, con inspiracion en referencias de Mobbin y tendencias modernas de e-commerce.

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

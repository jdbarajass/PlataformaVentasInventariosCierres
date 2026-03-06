# E2E Tests - YJBMOTOCOM

Tests end-to-end (E2E) usando Playwright para verificar el funcionamiento completo de la plataforma.

## Prerequisitos

- Node.js instalado
- Dependencias instaladas (`npm install`)
- Navegador Chromium instalado por Playwright

## Ejecutar Tests

### Modo headless (sin interfaz)
```bash
npm run test:e2e
```

### Modo UI (con interfaz interactiva)
```bash
npm run test:e2e:ui
```

### Modo debug
```bash
npx playwright test --debug
```

### Ejecutar un solo archivo
```bash
npx playwright test e2e/homepage.spec.ts
```

### Ejecutar en modo watch
```bash
npx playwright test --watch
```

## Estructura de Tests

### `homepage.spec.ts`
- ✅ Carga de homepage
- ✅ Navegación principal
- ✅ Hero section
- ✅ Links del footer

### `products.spec.ts`
- ✅ Listado de productos
- ✅ Visualización de cards
- ✅ Navegación a detalles de producto
- ✅ Filtros de productos

### `cart.spec.ts`
- ✅ Agregar productos al carrito
- ✅ Abrir carrito drawer
- ✅ Actualizar cantidades
- ✅ Navegar a checkout

### `public-pages.spec.ts`
- ✅ FAQ
- ✅ Política de Privacidad
- ✅ Términos y Condiciones
- ✅ Envíos
- ✅ Devoluciones
- ✅ Contacto

## Configuración

La configuración se encuentra en `playwright.config.ts`:

- **baseURL**: `http://localhost:3000`
- **Browser**: Chromium (Desktop y Mobile)
- **Retry**: 2 veces en CI, 0 en local
- **Screenshots**: Solo en failures
- **Traces**: Solo en retry

## Reports

Los reportes HTML se generan automáticamente en `playwright-report/`:

```bash
npx playwright show-report
```

## CI/CD

Los tests se ejecutan automáticamente en CI con:
- Retry habilitado (2 intentos)
- Worker único para evitar race conditions
- Screenshots y traces en failures

## Data Test IDs

Para mejorar la estabilidad de los tests, se recomienda usar `data-testid` en los componentes:

```tsx
<button data-testid="cart-button">
  Carrito
</button>
```

Luego en los tests:
```typescript
const cartButton = page.locator('[data-testid="cart-button"]')
```

## Best Practices

1. **Esperar elementos**: Usar `waitForLoadState('networkidle')` para SPAs
2. **Selectores estables**: Preferir `data-testid` sobre clases CSS
3. **Aislamiento**: Cada test debe ser independiente
4. **Cleanup**: No dejar estado compartido entre tests
5. **Timeouts**: Usar timeouts apropiados para operaciones async

## Troubleshooting

### "Browser not found"
```bash
npx playwright install chromium
```

### "Port 3000 already in use"
Asegúrate de que no haya otro servidor corriendo o cambia el puerto en `playwright.config.ts`

### Tests lentos
- Reduce el número de workers
- Usa `page.waitForLoadState()` en lugar de `waitForTimeout()`
- Considera usar API mocking para tests más rápidos

## Recursos

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging](https://playwright.dev/docs/debug)

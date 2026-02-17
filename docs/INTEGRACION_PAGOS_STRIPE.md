# 💳 Integración de Pagos con Stripe - YB MOTOCOM

## 📚 Índice
1. [Resumen](#resumen)
2. [Arquitectura](#arquitectura)
3. [Configuración Inicial](#configuración-inicial)
4. [Flujo Completo de Pago](#flujo-completo-de-pago)
5. [Archivos Clave](#archivos-clave)
6. [Testing](#testing)
7. [Webhooks](#webhooks)
8. [Troubleshooting](#troubleshooting)
9. [Seguridad](#seguridad)
10. [Próximos Pasos](#próximos-pasos)

---

## 🎯 Resumen

Este documento describe la integración completa de pagos con Stripe en YB MOTOCOM. La integración permite:

- ✅ Pagos con tarjeta de crédito/débito
- ✅ Checkout seguro con Stripe Checkout
- ✅ Webhooks para confirmación de pagos
- ✅ Reducción automática de inventario
- ✅ Emails de confirmación
- ✅ Manejo de reembolsos
- ✅ Logs de auditoría

### Estado: ✅ COMPLETAMENTE IMPLEMENTADO

---

## 🏗️ Arquitectura

### Componentes

```
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │ 1. Inicia checkout
       ▼
┌──────────────────┐
│ /checkout (Page) │
└──────┬───────────┘
       │ 2. Envía datos
       ▼
┌──────────────────────────┐
│ POST /api/orders         │
│ - Crea orden             │
│ - Crea items             │
│ - Crea sesión de Stripe  │
└──────┬───────────────────┘
       │ 3. Redirige a Stripe Checkout
       ▼
┌──────────────────┐
│ Stripe Checkout  │ ← Cliente ingresa tarjeta
└──────┬───────────┘
       │ 4. Pago exitoso
       ▼
┌────────────────────────────┐
│ POST /api/payments/webhook │ ← Stripe envía evento
│ - Confirma pago            │
│ - Reduce stock             │
│ - Envía email              │
│ - Registra auditoría       │
└──────┬─────────────────────┘
       │ 5. Redirige
       ▼
┌─────────────────────────────┐
│ /orden/[id]/confirmacion    │
│ - Muestra confirmación      │
└─────────────────────────────┘
```

### Flujo de Datos

```
Base de Datos (Supabase)
├── orders          ← Orden principal
├── order_items     ← Productos de la orden
├── payments        ← Registro de pago
├── products        ← Actualización de stock
├── inventory_movements  ← Historial de movimientos
└── audit_logs      ← Log de acciones
```

---

## ⚙️ Configuración Inicial

### 1. Variables de Entorno

Editar `apps/web/.env.local`:

```env
# Stripe Keys (obtener de https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_51234567890abcdefg...
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefg...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51234567890abcdefg...

# App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=https://ybmotocom.com

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=pedidos@ybmotocom.com
```

### 2. Obtener Claves de Stripe

**Modo Test (Desarrollo):**
1. Ir a https://dashboard.stripe.com/test/apikeys
2. Copiar:
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

**Modo Live (Producción):**
1. Ir a https://dashboard.stripe.com/apikeys
2. Activar cuenta (requiere verificación de negocio)
3. Copiar las claves LIVE

### 3. Configurar Webhooks

#### Desarrollo (con Stripe CLI):

```bash
# 1. Instalar Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: scoop install stripe
# Linux: https://stripe.com/docs/stripe-cli

# 2. Autenticar
stripe login

# 3. Escuchar webhooks localmente
stripe listen --forward-to http://localhost:3000/api/payments/webhook

# 4. Copiar el webhook secret que aparece (empieza con whsec_)
# y ponerlo en .env.local como STRIPE_WEBHOOK_SECRET
```

#### Producción:

1. Ir a https://dashboard.stripe.com/webhooks
2. Click en **"Add endpoint"**
3. Configurar:
   - **URL**: `https://ybmotocom.com/api/payments/webhook`
   - **Descripción**: "YB MOTOCOM Payment Webhooks"
   - **Eventos a escuchar**:
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `charge.refunded`
4. Copiar el **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## 💰 Flujo Completo de Pago

### Paso 1: Usuario en Checkout

Archivo: `apps/web/src/app/(shop)/checkout/page.tsx`

```typescript
// Usuario llena formulario con:
- Email, nombre, teléfono
- Dirección de envío
- Método de pago (card, transfer, nequi, daviplata)
```

### Paso 2: Crear Orden

Archivo: `apps/web/src/app/api/orders/route.ts`

```typescript
POST /api/orders
Body:
{
  items: [{ id, title, price_cents, qty, image }],
  customer: { email, name, phone, address, city },
  payment_method: "card",
  subtotal_cents: 10000000,
  shipping_cents: 0,
  total_cents: 10000000
}

Acciones:
1. Crear registro en tabla `orders`
2. Crear registros en tabla `order_items`
3. Si payment_method === "card":
   - Crear sesión de Stripe Checkout
   - Crear registro en tabla `payments` (status: pending)
   - Retornar: { checkout_url: "https://checkout.stripe.com/..." }
4. Si payment_method === "transfer|nequi|daviplata":
   - Crear registro en tabla `payments` (status: pending, provider: manual)
   - Enviar email con instrucciones de pago
   - Retornar: { order_id: "uuid..." }
```

### Paso 3: Stripe Checkout

El usuario es redirigido a la página de Stripe Checkout donde:
- Ingresa información de tarjeta de crédito/débito
- Stripe procesa el pago de forma segura
- Usuario es redirigido de vuelta a la tienda

### Paso 4: Webhook de Confirmación

Archivo: `apps/web/src/app/api/payments/webhook/route.ts`

```typescript
POST /api/payments/webhook
Headers:
  stripe-signature: "t=xxx,v1=yyy..."
Body: (Evento de Stripe en formato JSON)

Evento: checkout.session.completed
Acciones:
1. Validar firma del webhook (seguridad)
2. Actualizar orden:
   - status: "confirmed"
   - payment_status: "paid"
3. Actualizar pago:
   - status: "succeeded"
   - provider_payment_id: "pi_xxx"
4. Reducir stock por cada producto:
   - products.stock_qty -= qty
   - Registrar en inventory_movements (type: "sale")
5. Registrar en audit_logs
6. Enviar email de confirmación al cliente

Evento: checkout.session.expired
Acciones:
1. Actualizar orden: payment_status: "failed"
2. Actualizar pago: status: "cancelled"

Evento: charge.refunded
Acciones:
1. Buscar orden por payment_intent_id
2. Actualizar orden: status: "refunded", payment_status: "refunded"
3. Actualizar pago: status: "refunded"
4. Registrar en audit_logs
```

### Paso 5: Confirmación al Usuario

Archivo: `apps/web/src/app/(shop)/orden/[id]/confirmacion/page.tsx`

```typescript
GET /orden/[order_id]/confirmacion?session_id=xxx

Muestra:
- ✅ Mensaje de confirmación
- 📦 Número de orden
- 💳 Método de pago
- 📋 Lista de productos
- 💰 Total pagado
- 📍 Dirección de envío
- 📧 Próximos pasos (tracking, etc.)
```

---

## 📁 Archivos Clave

### Backend/API

| Archivo | Descripción |
|---------|-------------|
| `src/app/api/orders/route.ts` | Crear órdenes y sesiones de Stripe |
| `src/app/api/payments/webhook/route.ts` | Procesar eventos de Stripe |
| `src/lib/stripe-helpers.ts` | ✨ **NUEVO** - Utilidades de Stripe |
| `src/lib/email.ts` | Enviar emails de confirmación |

### Frontend

| Archivo | Descripción |
|---------|-------------|
| `src/app/(shop)/checkout/page.tsx` | Página de checkout |
| `src/app/(shop)/orden/[id]/confirmacion/page.tsx` | Página de confirmación |
| `src/lib/cart-context.tsx` | Estado global del carrito |

### Emails

| Archivo | Descripción |
|---------|-------------|
| `src/emails/order-confirmation.tsx` | Template de confirmación de orden |
| `src/emails/payment-instructions.tsx` | Template de instrucciones de pago |
| `src/emails/components/email-layout.tsx` | Layout base para emails |

### Tests

| Archivo | Descripción |
|---------|-------------|
| `src/__tests__/api/stripe.test.ts` | ✨ **NUEVO** - Tests unitarios de Stripe |
| `e2e/checkout.spec.ts` | Tests E2E del flujo de checkout |

---

## 🧪 Testing

### Tests Unitarios

```bash
# Ejecutar tests
cd apps/web
npm run test

# Con cobertura
npm run test:coverage
```

### Tests E2E

```bash
# Ejecutar tests E2E
npm run test:e2e

# Con UI interactiva
npm run test:e2e:ui
```

### Probar Checkout Manualmente

#### 1. Iniciar servidor de desarrollo

```bash
cd apps/web
npm run dev
```

#### 2. Iniciar Stripe CLI (en otra terminal)

```bash
stripe listen --forward-to http://localhost:3000/api/payments/webhook
```

#### 3. Abrir en navegador

```
http://localhost:3000
```

#### 4. Agregar productos al carrito y hacer checkout

#### 5. Usar tarjetas de prueba de Stripe

**Pago exitoso:**
```
Número: 4242 4242 4242 4242
Expiración: Cualquier fecha futura (ej: 12/25)
CVC: Cualquier 3 dígitos (ej: 123)
Código postal: Cualquiera (ej: 12345)
```

**Pago fallido:**
```
Número: 4000 0000 0000 0002
(Stripe simulará un rechazo)
```

**Requiere autenticación 3D Secure:**
```
Número: 4000 0025 0000 3155
(Stripe mostrará modal de autenticación)
```

Más tarjetas de prueba: https://stripe.com/docs/testing

#### 6. Verificar en logs

```bash
# Terminal del servidor
[Webhook] Received event: checkout.session.completed
[Webhook] Processing payment for order: abc-123
[Webhook] Reducing stock for "Casco Integral": 10 -> 9
[Webhook] Order abc-123 payment completed successfully
[Webhook] Confirmation email sent for order abc-123
```

---

## 🔗 Webhooks

### Eventos Soportados

| Evento | Acción |
|--------|--------|
| `checkout.session.completed` | ✅ Confirma pago, reduce stock, envía email |
| `checkout.session.expired` | ⏱️ Marca orden como fallida |
| `charge.refunded` | 💸 Procesa reembolso |

### Testing de Webhooks

#### Con Stripe CLI

```bash
# Disparar evento de pago exitoso
stripe trigger checkout.session.completed

# Disparar evento de sesión expirada
stripe trigger checkout.session.expired

# Disparar evento de reembolso
stripe trigger charge.refunded
```

#### Manualmente desde Dashboard

1. Ir a https://dashboard.stripe.com/test/webhooks
2. Seleccionar tu webhook endpoint
3. Click en **"Send test webhook"**
4. Seleccionar evento a probar
5. Click en **"Send test webhook"**

### Logs de Webhooks

Ver en Stripe Dashboard:
https://dashboard.stripe.com/test/webhooks/[webhook_id]

Ver logs del servidor:
```bash
# Terminal donde corre Next.js
[Webhook] Received event: checkout.session.completed
[Webhook] Processing payment for order: abc-123
...
```

---

## 🔍 Troubleshooting

### ❌ Error: "Stripe is not properly configured"

**Causa:** Variables de entorno faltantes

**Solución:**
```bash
# Verificar que existan las variables
echo $STRIPE_SECRET_KEY
echo $STRIPE_WEBHOOK_SECRET
echo $NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Si alguna está vacía, agregarla a .env.local
```

### ❌ Error: "Webhook signature verification failed"

**Causa:** El webhook secret es incorrecto

**Solución:**
```bash
# Desarrollo: obtener el secret del Stripe CLI
stripe listen --forward-to http://localhost:3000/api/payments/webhook
# Copiar el webhook secret que aparece (whsec_...)

# Producción: obtener del dashboard
# https://dashboard.stripe.com/webhooks → Click en endpoint → Signing secret
```

### ❌ Webhook nunca llega

**Desarrollo:**

```bash
# Asegurarse de que Stripe CLI esté corriendo
stripe listen --forward-to http://localhost:3000/api/payments/webhook

# Verificar que el servidor de Next.js esté corriendo
npm run dev
```

**Producción:**

1. Verificar que el endpoint esté público: `https://ybmotocom.com/api/payments/webhook`
2. Verificar que responda: debería retornar 400 (Missing signature)
3. Verificar en Stripe Dashboard > Webhooks > [tu endpoint] > Attempts
4. Si hay errores 500, revisar logs del servidor

### ❌ Email de confirmación no se envía

**Causa:** Resend API key inválida o faltante

**Solución:**
```bash
# Verificar variable de entorno
echo $RESEND_API_KEY

# Obtener nueva key en https://resend.com/api-keys
```

### ❌ Stock no se reduce

**Verificar en base de datos:**
```sql
-- Ver movimientos de inventario
SELECT * FROM inventory_movements
WHERE type = 'sale'
ORDER BY created_at DESC
LIMIT 10;

-- Ver stock actual
SELECT id, title, stock_qty FROM products;
```

**Verificar logs del webhook:**
```bash
[Webhook] Reducing stock for "Casco Integral": 10 -> 9
```

Si el log no aparece, el webhook no está siendo procesado correctamente.

---

## 🔒 Seguridad

### ✅ Implementado

1. **Validación de Webhooks**
   - Firma criptográfica de Stripe verificada en cada webhook
   - Evita webhooks falsos/maliciosos

2. **Server-side Processing**
   - Toda lógica de pago en el servidor (no en cliente)
   - Usuario no puede manipular precios

3. **HTTPS Obligatorio**
   - Stripe solo envía webhooks a URLs HTTPS en producción

4. **Variables de Entorno**
   - Secret keys nunca expuestas al cliente
   - Solo publishable key es pública

5. **Row Level Security (RLS)**
   - Políticas de Supabase protegen datos sensibles

### 🔐 Mejores Prácticas

1. **Nunca commits las claves secretas**
   ```bash
   # ❌ MAL
   STRIPE_SECRET_KEY=sk_live_xxx

   # ✅ BIEN
   # Usar .env.local (ignorado por git)
   ```

2. **Rotar claves regularmente**
   - Stripe permite crear nuevas claves sin afectar las existentes

3. **Monitorear eventos sospechosos**
   - Revisar Stripe Dashboard > Radar (detección de fraude)

4. **Validar montos en servidor**
   - Nunca confiar en el monto enviado desde el cliente
   - Recalcular total_cents en el servidor

---

## 🚀 Próximos Pasos

### Implementaciones Futuras

1. **MercadoPago (Pagos Latinoamérica)**
   - Similar a Stripe pero más popular en Latam
   - Soporta PSE, Efecty, Baloto, etc.

2. **Wallets Locales (Nequi, Daviplata)**
   - Actualmente solo muestran instrucciones
   - Integrar APIs oficiales cuando estén disponibles

3. **Suscripciones**
   - Stripe Subscriptions para membresías

4. **Saved Cards**
   - Guardar métodos de pago del cliente

5. **Split Payments**
   - Pagos parciales (50% ahora, 50% al enviar)

6. **Currency Conversion**
   - Soportar USD, EUR además de COP

---

## 📊 Monitoreo

### Métricas a Revisar

1. **Stripe Dashboard**
   - Pagos exitosos vs fallidos
   - Razones de rechazo
   - Intentos de fraude (Radar)

2. **Base de Datos**
   ```sql
   -- Órdenes por estado de pago
   SELECT payment_status, COUNT(*)
   FROM orders
   GROUP BY payment_status;

   -- Webhooks fallidos (si status sigue en pending después de 1 hora)
   SELECT * FROM orders
   WHERE payment_status = 'pending'
   AND created_at < NOW() - INTERVAL '1 hour';
   ```

3. **Logs del Servidor**
   - Errores en webhooks
   - Emails no enviados

4. **Sentry**
   - Excepciones en flujo de pago

---

## 📞 Soporte

### Stripe

- **Documentación**: https://stripe.com/docs
- **API Reference**: https://stripe.com/docs/api
- **Testing**: https://stripe.com/docs/testing
- **Soporte**: https://support.stripe.com

### Resend (Emails)

- **Documentación**: https://resend.com/docs
- **Dashboard**: https://resend.com/emails

---

## ✅ Checklist de Implementación

### Desarrollo
- [x] Variables de entorno configuradas
- [x] Stripe CLI instalado y funcionando
- [x] Webhooks siendo recibidos localmente
- [x] Checkout funcionando con tarjetas de prueba
- [x] Emails de confirmación enviándose
- [x] Stock reduciéndose correctamente
- [x] Tests unitarios pasando
- [x] Tests E2E pasando

### Producción (antes de lanzar)
- [ ] Cambiar a claves LIVE de Stripe
- [ ] Configurar webhook en Stripe Dashboard (URL de producción)
- [ ] Verificar que dominio tenga HTTPS
- [ ] Probar checkout con tarjeta real (monto pequeño)
- [ ] Verificar que emails lleguen correctamente
- [ ] Configurar monitoreo (Sentry, logs)
- [ ] Preparar plan de rollback
- [ ] Documentar proceso de soporte

---

**Documentación creada**: 2026-02-16
**Última actualización**: 2026-02-16
**Autor**: Claude (Anthropic)
**Versión**: 1.0.0

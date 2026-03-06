# ⚡ Stripe - Guía Rápida de Inicio

## 🚀 Setup en 5 Minutos

### 1. Obtener Claves de Stripe (2 min)

```bash
# Ir a: https://dashboard.stripe.com/test/apikeys

# Copiar:
# - Publishable key → pk_test_...
# - Secret key → sk_test_...
```

### 2. Configurar Variables de Entorno (1 min)

Editar `apps/web/.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_TU_SECRET_KEY_AQUI
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_TU_PUBLISHABLE_KEY_AQUI
STRIPE_WEBHOOK_SECRET=whsec_SE_CONFIGURA_EN_PASO_3
```

### 3. Configurar Webhooks Local (2 min)

```bash
# Terminal 1: Iniciar servidor
cd apps/web
npm run dev

# Terminal 2: Stripe CLI
stripe login
stripe listen --forward-to http://localhost:3000/api/payments/webhook

# Copiar el webhook secret (whsec_...)
# y agregarlo a .env.local como STRIPE_WEBHOOK_SECRET

# Reiniciar servidor (Ctrl+C en Terminal 1 y volver a npm run dev)
```

## ✅ Probar Pago

### 1. Abrir tienda

```
http://localhost:3000
```

### 2. Agregar productos al carrito

### 3. Ir a checkout

```
http://localhost:3000/checkout
```

### 4. Llenar formulario

```
Email: test@test.com
Nombre: Test User
Teléfono: +57 314 406 5520
Dirección: Calle 123 # 45-67
Ciudad: Bogotá
Método de pago: Tarjeta de crédito/débito
```

### 5. Usar tarjeta de prueba

```
Número: 4242 4242 4242 4242
Fecha: 12/25 (cualquier fecha futura)
CVC: 123 (cualquier 3 dígitos)
Código postal: 12345
```

### 6. Confirmar pago

Deberías ser redirigido a página de confirmación.

## 🔍 Verificar que Funcionó

### Terminal del servidor (npm run dev)

```bash
[Webhook] Received event: checkout.session.completed
[Webhook] Processing payment for order: abc-123
[Webhook] Reducing stock for "Producto X": 10 -> 9
[Webhook] Order abc-123 payment completed successfully
[Webhook] Confirmation email sent for order abc-123
```

### Terminal de Stripe CLI

```bash
2026-02-16 10:30:45  --> checkout.session.completed [evt_xxx]
2026-02-16 10:30:45  <--  [200] POST http://localhost:3000/api/payments/webhook
```

### Base de Datos (Supabase)

```sql
-- Ver la orden creada
SELECT * FROM orders ORDER BY created_at DESC LIMIT 1;

-- Ver el pago
SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;

-- Ver reducción de stock
SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 1;
```

## 🎯 Tarjetas de Prueba Stripe

| Tarjeta | Resultado |
|---------|-----------|
| 4242 4242 4242 4242 | ✅ Pago exitoso |
| 4000 0000 0000 0002 | ❌ Pago rechazado |
| 4000 0025 0000 3155 | 🔐 Requiere 3D Secure |
| 4000 0000 0000 9995 | ⚠️ Fondos insuficientes |

Más: https://stripe.com/docs/testing

## 🐛 Problemas Comunes

### "Stripe is not properly configured"

```bash
# Verificar .env.local
cat apps/web/.env.local | grep STRIPE

# Deben existir las 3 variables
```

### Webhook no llega

```bash
# Verificar que Stripe CLI esté corriendo
stripe listen --forward-to http://localhost:3000/api/payments/webhook

# Verificar que el servidor esté corriendo
npm run dev
```

### Email no se envía

```bash
# Verificar Resend API key en .env.local
RESEND_API_KEY=re_xxxxx
```

## 📚 Documentación Completa

Ver: `docs/INTEGRACION_PAGOS_STRIPE.md`

## 🚀 Deploy a Producción

### 1. Cambiar a claves LIVE

```bash
# En Stripe Dashboard: https://dashboard.stripe.com/apikeys
# Activar cuenta (requiere verificación)
# Copiar claves LIVE
```

### 2. Configurar webhook en Stripe Dashboard

```
URL: https://yjbmotocom.com/api/payments/webhook
Eventos:
- checkout.session.completed
- checkout.session.expired
- charge.refunded
```

### 3. Agregar variables en Vercel/Netlify

```bash
# En Vercel: Settings > Environment Variables
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... (del dashboard)
```

### 4. Deploy

```bash
git push origin main
# Vercel hace deploy automático
```

### 5. Probar en producción

Usar tarjeta real con monto pequeño ($1.000 COP).

## ✅ Listo!

Tu integración de Stripe está funcionando. 🎉

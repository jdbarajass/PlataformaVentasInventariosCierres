/**
 * MercadoPago Helper Functions
 * Utilidades para trabajar con MercadoPago y pagos
 */

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import * as crypto from 'crypto'
import { BRAND } from '@/config/brand'

// Singleton MercadoPago instance
let _client: MercadoPagoConfig | null = null

/**
 * Get MercadoPago client (singleton pattern)
 */
export function getMercadoPago(): MercadoPagoConfig {
  if (!_client) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN is not defined in environment variables')
    }
    _client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5000 },
    })
  }
  return _client
}

/**
 * Validates if MercadoPago is properly configured
 */
export function isMercadoPagoConfigured(): boolean {
  return !!(
    process.env.MERCADOPAGO_ACCESS_TOKEN &&
    process.env.MERCADOPAGO_WEBHOOK_SECRET
  )
}

/**
 * Creates a MercadoPago preference (checkout session)
 * @returns init_point URL — the hosted MercadoPago checkout page
 */
export async function createPreference(params: {
  orderId: string
  items: Array<{
    title: string
    price_cents: number
    qty: number
  }>
  customerEmail: string
  total_cents: number
}): Promise<string> {
  const client = getMercadoPago()
  const { orderId, items, customerEmail } = params

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const preference = new Preference(client)

  const response = await preference.create({
    body: {
      // MercadoPago usa pesos reales (COP enteros), no centavos
      items: items.map((item) => ({
        id: `item-${orderId}`,
        title: item.title,
        quantity: item.qty,
        unit_price: item.price_cents / 100,
        currency_id: 'COP',
      })),
      payer: {
        email: customerEmail,
      },
      back_urls: {
        success: `${appUrl}/orden/${orderId}/confirmacion`,
        failure: `${appUrl}/checkout`,
        pending: `${appUrl}/orden/${orderId}/confirmacion`,
      },
      auto_return: 'approved',
      external_reference: orderId,
      notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
      statement_descriptor: BRAND.name,
    },
  })

  const initPoint = response.init_point
  if (!initPoint) {
    throw new Error('MercadoPago did not return an init_point URL')
  }

  return initPoint
}

/**
 * Retrieves a payment from MercadoPago by ID
 */
export async function getMercadoPagoPayment(paymentId: string | number) {
  const client = getMercadoPago()
  const payment = new Payment(client)
  return payment.get({ id: String(paymentId) })
}

/**
 * Validates MercadoPago webhook signature
 * Header x-signature format: "ts=TIMESTAMP,v1=HASH"
 * Manifest: "id:{dataId};request-date:{ts};"
 *
 * @returns true if valid, false if invalid or secret not configured
 */
export function validateMercadoPagoWebhook(
  xSignature: string | null,
  dataId: string
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) {
    console.error('[MP Webhook] MERCADOPAGO_WEBHOOK_SECRET is not configured')
    return false
  }

  if (!xSignature) {
    console.error('[MP Webhook] Missing x-signature header')
    return false
  }

  // Parse "ts=TIMESTAMP,v1=HASH"
  const parts = xSignature.split(',')
  const ts = parts.find((p) => p.startsWith('ts='))?.split('=')[1]
  const v1 = parts.find((p) => p.startsWith('v1='))?.split('=')[1]

  if (!ts || !v1) {
    console.error('[MP Webhook] Invalid x-signature format:', xSignature)
    return false
  }

  // Build the manifest string MP uses to sign the payload
  const manifest = `id:${dataId};request-date:${ts};`

  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(manifest)
    const computed = hmac.digest('hex')
    return computed === v1
  } catch (err) {
    console.error('[MP Webhook] Signature verification error:', err)
    return false
  }
}

/**
 * Maps MercadoPago payment status to our internal status
 */
export function mapMercadoPagoStatus(
  mpStatus: string
): 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' {
  const statusMap: Record<string, 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'> = {
    pending:         'pending',
    approved:        'succeeded',
    authorized:      'processing',
    in_process:      'processing',
    in_mediation:    'processing',
    rejected:        'failed',
    cancelled:       'cancelled',
    refunded:        'refunded',
    charged_back:    'refunded',
  }
  return statusMap[mpStatus] ?? 'pending'
}

/**
 * Stripe Helper Functions
 * Utilidades para trabajar con Stripe y pagos
 */

import Stripe from 'stripe'

// Singleton Stripe instance
let _stripe: Stripe | null = null

/**
 * Get Stripe instance (singleton pattern)
 * @returns Stripe client instance
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables')
    }
    _stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
      appInfo: {
        name: 'YJBMOTOCOM',
        version: '1.0.0',
      },
    })
  }
  return _stripe
}

/**
 * Validates if Stripe is properly configured
 * @returns true if Stripe is configured, false otherwise
 */
export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  )
}

/**
 * Validates webhook signature from Stripe
 * @param rawBody - Raw request body as string
 * @param signature - Stripe signature from headers
 * @returns Stripe event if valid, null if invalid
 */
export function validateStripeWebhook(
  rawBody: string,
  signature: string
): Stripe.Event | null {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured')
    return null
  }

  try {
    const stripe = getStripe()
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    return event
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return null
  }
}

/**
 * Formats amount from cents to Stripe format (currency-specific)
 * @param cents - Amount in cents
 * @param currency - Currency code (default: COP)
 * @returns Amount formatted for Stripe
 */
export function formatAmountForStripe(cents: number, currency: string = 'cop'): number {
  // Some currencies don't use decimal places (like COP, JPY)
  const zeroDecimalCurrencies = ['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']

  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return cents
  }

  // For decimal currencies, Stripe expects amount in the smallest currency unit
  return cents
}

/**
 * Creates a Stripe checkout session for an order
 * @param params - Checkout session parameters
 * @returns Stripe checkout session
 */
export async function createCheckoutSession(params: {
  orderId: string
  items: Array<{
    title: string
    price_cents: number
    qty: number
    image?: string
  }>
  customerEmail: string
  currency?: string
  successUrl?: string
  cancelUrl?: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  const {
    orderId,
    items,
    customerEmail,
    currency = 'cop',
    successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/orden/${orderId}/confirmacion?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL}/checkout`,
  } = params

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: items.map((item) => ({
      price_data: {
        currency,
        product_data: {
          name: item.title,
          images: item.image ? [item.image] : [],
        },
        unit_amount: formatAmountForStripe(item.price_cents, currency),
      },
      quantity: item.qty,
    })),
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
    metadata: {
      order_id: orderId,
    },
    expires_at: Math.floor(Date.now() / 1000) + 1800, // Expires in 30 minutes
    billing_address_collection: 'auto',
    shipping_address_collection: {
      allowed_countries: ['CO'], // Colombia only for now
    },
  })

  return session
}

/**
 * Retrieves a Stripe checkout session
 * @param sessionId - Checkout session ID
 * @returns Stripe checkout session
 */
export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  return session
}

/**
 * Retrieves a payment intent
 * @param paymentIntentId - Payment intent ID
 * @returns Stripe payment intent
 */
export async function getPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe()
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  return paymentIntent
}

/**
 * Creates a refund for a payment
 * @param paymentIntentId - Payment intent ID to refund
 * @param amount - Amount to refund in cents (optional, full refund if not specified)
 * @param reason - Reason for refund
 * @returns Stripe refund
 */
export async function createRefund(params: {
  paymentIntentId: string
  amount?: number
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
}): Promise<Stripe.Refund> {
  const stripe = getStripe()
  const { paymentIntentId, amount, reason = 'requested_by_customer' } = params

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason,
  })

  return refund
}

/**
 * Maps Stripe payment status to our internal status
 * @param stripeStatus - Stripe payment status
 * @returns Our internal payment status
 */
export function mapStripePaymentStatus(
  stripeStatus: string
): 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' {
  const statusMap: Record<string, 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'> = {
    'incomplete': 'pending',
    'incomplete_expired': 'failed',
    'trialing': 'pending',
    'active': 'succeeded',
    'past_due': 'failed',
    'canceled': 'cancelled',
    'unpaid': 'failed',
    'requires_payment_method': 'pending',
    'requires_confirmation': 'pending',
    'requires_action': 'processing',
    'processing': 'processing',
    'requires_capture': 'processing',
    'succeeded': 'succeeded',
  }

  return statusMap[stripeStatus] || 'pending'
}

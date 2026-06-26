import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Records that a webhook event was processed, using the unique
 * (provider, event_key) constraint in `processed_webhooks` as a lock.
 *
 * Returns true the first time a given event_key is seen (caller should
 * process it), and false if it was already processed (caller should skip
 * it). This protects against Stripe/MercadoPago retrying the same webhook
 * delivery and double-applying side effects like stock reduction.
 */
export async function markWebhookProcessed(
  supabase: SupabaseClient,
  provider: 'stripe' | 'mercadopago',
  eventKey: string
): Promise<boolean> {
  const { error } = await (supabase.from('processed_webhooks') as any).insert({
    provider,
    event_key: eventKey,
  })

  if (!error) return true

  // Postgres unique_violation: this event was already processed.
  if (error.code === '23505') return false

  throw new Error(`Failed to record webhook idempotency key: ${error.message}`)
}

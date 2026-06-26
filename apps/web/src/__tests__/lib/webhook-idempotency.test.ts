import { describe, it, expect } from 'vitest'
import { markWebhookProcessed } from '@/lib/webhook-idempotency'
import { createSupabaseMock } from '../helpers/supabase-mock'

describe('markWebhookProcessed', () => {
  it('returns true the first time an event is seen', async () => {
    const { client } = createSupabaseMock({
      processed_webhooks: { data: null, error: null },
    })

    const result = await markWebhookProcessed(client as any, 'stripe', 'evt_123')
    expect(result).toBe(true)
  })

  it('returns false when the event was already processed (unique violation)', async () => {
    const { client } = createSupabaseMock({
      processed_webhooks: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })

    const result = await markWebhookProcessed(client as any, 'stripe', 'evt_123')
    expect(result).toBe(false)
  })

  it('throws on unexpected database errors', async () => {
    const { client } = createSupabaseMock({
      processed_webhooks: { data: null, error: { code: '500', message: 'connection lost' } },
    })

    await expect(markWebhookProcessed(client as any, 'stripe', 'evt_123')).rejects.toThrow(/connection lost/)
  })
})

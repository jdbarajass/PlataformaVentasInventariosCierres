import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

/**
 * Creates a Supabase client with service role key (bypasses RLS)
 * WARNING: Use only for:
 * - Webhooks from external systems (Stripe)
 * - Anonymous user operations (order creation)
 * - System operations (audit logs insert)
 * DO NOT use for admin operations - use createAuthenticatedClient instead
 */
export const getServiceSupabase = () => {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient<Database>(supabaseUrl, supabaseServiceKey)
}

/**
 * Creates an authenticated Supabase client with user's JWT token
 * This client respects Row Level Security (RLS) policies
 * Use this for all authenticated operations to enforce proper permissions
 *
 * @param accessToken - JWT token from authenticated user
 * @returns Supabase client scoped to the authenticated user
 */
export const createAuthenticatedClient = (accessToken: string) => {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

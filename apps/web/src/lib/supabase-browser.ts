'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/database'

/**
 * Single shared Supabase client for all client components.
 *
 * Do not call createClientComponentClient() (or createClient()) again
 * anywhere else in client-side code — every extra instance creates its own
 * GoTrueClient managing the same auth token storage key. With two or more
 * alive at once (e.g. one in AuthProvider, another in WishlistProvider,
 * both mounted globally), they race on session refresh and abort each
 * other ("Multiple GoTrueClient instances", "AbortError: signal is
 * aborted without reason"), which left /admin's loading spinner stuck
 * forever on hard reload.
 *
 * createClientComponentClient() (not the plain createClient() from
 * lib/supabase.ts) is required here because it syncs the session via
 * cookies, which is what middleware.ts / createMiddlewareClient and the
 * server-side auth helpers read to protect routes.
 */
export const supabaseBrowser = createClientComponentClient<Database>()

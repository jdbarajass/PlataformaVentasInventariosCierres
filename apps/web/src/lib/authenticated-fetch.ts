import { supabase } from '@/lib/supabase'
import { apiFetch, ApiError } from '@/lib/api-client'

/**
 * Same as `apiFetch` but attaches the current Supabase session as a Bearer
 * token — for the admin API routes that call `requireAuth()`.
 *
 * Kept in its own module (separate from api-client.ts) so that public pages
 * that only need `apiFetch` (e.g. checkout) don't pull the Supabase client
 * SDK into their bundle.
 */
export async function authenticatedFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new ApiError('No estas autenticado. Por favor inicia sesion nuevamente.', 401)
  }

  return apiFetch<T>(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
}

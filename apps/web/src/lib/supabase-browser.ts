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

/**
 * Corre una operación contra supabaseBrowser con un límite de tiempo.
 *
 * `@supabase/auth-helpers-nextjs` puede colgarse indefinidamente (nunca
 * resuelve ni rechaza) al refrescar la sesión tras un rato de inactividad
 * de la pestaña — el mismo bug conocido de navigator.locks ya diagnosticado
 * en auth-context.tsx (ver docs/UNIFICACION_YJBMOTOCOM.md sección 17), pero
 * aquí afecta a cualquier página que consulte supabaseBrowser directamente
 * (Historial Mensual, Inventario, Reportes, Cierres) en vez de pasar por
 * una API con el token ya resuelto. Sin este límite, el spinner de carga
 * de esas páginas queda girando para siempre y la única forma de
 * recuperarse es recargar la página o volver a iniciar sesión.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 12000, label = 'la operación'): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Tiempo de espera agotado en ${label}. Intenta de nuevo.`)), ms)
    }),
  ])
}

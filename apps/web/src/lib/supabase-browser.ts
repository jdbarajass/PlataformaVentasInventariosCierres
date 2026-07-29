'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

/**
 * Single shared Supabase client for all client components.
 *
 * Do not call createBrowserClient() (or createClient()) again anywhere
 * else in client-side code — every extra instance creates its own
 * GoTrueClient managing the same auth token storage key. With two or more
 * alive at once (e.g. one in AuthProvider, another in WishlistProvider,
 * both mounted globally), they race on session refresh and abort each
 * other ("Multiple GoTrueClient instances", "AbortError: signal is
 * aborted without reason"), which left /admin's loading spinner stuck
 * forever on hard reload.
 *
 * createBrowserClient() (no la plain createClient() de lib/supabase.ts) es
 * necesario aquí porque sincroniza la sesión vía cookies, que es lo que
 * middleware.ts / createServerClient y los helpers de servidor leen para
 * proteger rutas. Migrado de @supabase/auth-helpers-nextjs (deprecado) a
 * @supabase/ssr, el paquete recomendado actual — mismo propósito, misma
 * sincronización por cookies (Fase 5, propuesta A.8).
 */
export const supabaseBrowser = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

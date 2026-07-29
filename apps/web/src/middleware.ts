import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Migrado de @supabase/auth-helpers-nextjs (deprecado) a @supabase/ssr —
  // el patrón oficial de cookies para middleware: cualquier cookie que el
  // cliente necesite refrescar se reescribe tanto en `req` (para que el
  // resto de este middleware la vea) como en la respuesta (para que llegue
  // al navegador), reconstruyendo `res` después de tocar `req.cookies`.
  let res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: { headers: req.headers } })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  // Refresh session if expired (keeps cookie in sync)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = req.nextUrl.pathname

  // Protect all /admin/* routes
  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/iniciar-sesion', req.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Optionally check for admin role via user metadata or a DB query
    // The DB check is done in the layout (client-side) for role verification.
    // Here we only check authentication.
  }

  // Solo /mi-cuenta exige sesión real. /favoritos, /checkout y /orden se
  // sacaron de esta lista (bug encontrado en la Fase 5, sección 52 del
  // doc): las tres soportan visitantes sin cuenta a nivel de página —
  // /favoritos usa localStorage para invitados (wishlist-context.tsx),
  // /checkout nunca exige user_id (customerSchema, checkout de invitado),
  // y /orden/[id]/confirmacion se abre justo después de pagar sin sesión
  // (ej. redirect de Stripe/MercadoPago, o pago manual) — bloquearlas
  // aquí mandaba a cualquier cliente sin cuenta a la pantalla de login en
  // vez de dejarlo pagar o ver la confirmación de su propia compra.
  const protectedUserRoutes = ['/mi-cuenta']
  const isProtectedUserRoute = protectedUserRoutes.some((route) =>
    pathname.startsWith(route)
  )

  if (isProtectedUserRoute && !session) {
    const loginUrl = new URL('/iniciar-sesion', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     * - API routes (they have their own auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

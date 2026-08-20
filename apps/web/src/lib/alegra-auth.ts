import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AuthResult =
  | { success: true; session: Session }
  | { success: false; response: NextResponse }

/**
 * The Alegra integration exposes business data (sales, cash closures,
 * inventory valuation) that only admins should see. Every route here used
 * to check `session` exists but not the user's role — meaning any logged-in
 * customer could call them. This consolidates the check that
 * `/api/alegra/inventario` already did correctly so the other routes match.
 *
 * Migrado de @supabase/auth-helpers-nextjs (deprecado) a @supabase/ssr
 * (Fase 5, propuesta A.8) — patrón oficial para Route Handlers: setAll
 * puede fallar si el Route Handler ya envió headers, se ignora a propósito
 * (la sesión ya quedó leída de todas formas; solo afecta si hacía falta
 * refrescar el token, que se completa en la próxima petición).
 */
export async function requireAlegraAdmin(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Route Handler ya envió la respuesta — no se puede modificar
            // cookies en este punto, se ignora (ver comentario arriba).
          }
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return {
      success: false,
      response: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }),
    }
  }

  const { data: rawUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  const userData = rawUser as { role: string } | null
  if (!userData || userData.role !== 'admin') {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Se requiere rol de administrador' },
        { status: 403 }
      ),
    }
  }

  return { success: true, session }
}

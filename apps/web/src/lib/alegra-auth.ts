import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
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
 */
export async function requireAlegraAdmin(): Promise<AuthResult> {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore })

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

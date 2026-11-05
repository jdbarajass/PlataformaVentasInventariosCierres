import { createClient } from '@supabase/supabase-js'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * Verifica en el servidor las credenciales de un admin que autoriza una acción
 * desde la sesión de un vendedor (ej. cancelar una venta). Usa un cliente
 * aparte y sin persistir sesión: no toca la sesión del vendedor ni deja una
 * sesión de admin abierta. Devuelve el email del admin, o null si no aplica.
 */
export async function verifyAdminAuthorization(email: string, password: string): Promise<string | null> {
  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await authClient.auth.signInWithPassword({ email, password })
  if (error || !data.user) return null

  const { data: profile } = await getServiceSupabase()
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single()

  await authClient.auth.signOut({ scope: 'local' })

  return (profile as { role: string } | null)?.role === 'admin' ? data.user.email ?? email : null
}

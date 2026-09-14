// @ts-nocheck
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'admin' | 'seller' | 'viewer' | 'admin_readonly'
}

interface AuthContextType {
  user: User | null
  session: Session | null
  userProfile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session.
    // IMPORTANT: setLoading(false) must run no matter what. getSession()
    // puede quedarse colgada indefinidamente (nunca resuelve ni rechaza) en
    // algunos navegadores/pestañas — un problema conocido de la librería
    // @supabase/auth-helpers-nextjs (deprecada) con el lock interno de
    // refresco de sesión entre pestañas — dejando el spinner de /admin
    // girando para siempre sin ninguna forma de recuperarse. Se envuelve en
    // una carrera con timeout (mismo patrón ya usado en mi-cuenta/page.tsx).
    //
    // Bug real encontrado (2026-09-14): el respaldo anterior, si getSession()
    // se agotaba, reintentaba con getUser() y armaba una `session` falsa
    // (`{ user } as any`) SIN `access_token`. Esa sesión a medias pasaba el
    // check `if (!loading && !user)` del layout de /admin (user sí existía),
    // así que el panel se veía normal, pero las ~50 páginas que usan
    // `session?.access_token` para autenticar sus fetch a la API se quedaban
    // en silencio con `if (!session?.access_token) return` — ninguna mostraba
    // dato ni error, como si la tienda estuviera vacía. Y como esa sesión
    // falsa no vuelve a cambiar sola (nada dispara un nuevo intento), el
    // usuario quedaba así hasta recargar y tener suerte en el próximo intento
    // — de ahí el patrón "a veces carga, a veces no" reportado.
    //
    // Corrección: en vez de fabricar una sesión incompleta, se reintenta
    // getSession() una vez más (los locks de este bug suelen liberarse en
    // segundos) y, si vuelve a fallar, se resuelve como "sin sesión" (null)
    // — nunca una sesión a medias. Con `session=null`, el layout de /admin
    // redirige limpiamente a /iniciar-sesion en vez de mostrar un panel
    // completo con todo vacío sin explicación.
    let cancelled = false

    const getSessionWithTimeout = async (ms: number) => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), ms)
      )
      const { data: { session }, error } = await Promise.race([supabase.auth.getSession(), timeout])
      if (error) throw error
      return session
    }

    const resolveSession = async () => {
      try {
        return await getSessionWithTimeout(8000)
      } catch (firstError) {
        console.error('getSession() colgada o falló, reintentando una vez:', firstError)
        try {
          return await getSessionWithTimeout(4000)
        } catch (secondError) {
          console.error('getSession() volvió a fallar — se trata como sesión no disponible:', secondError)
          return null
        }
      }
    }

    resolveSession()
      .then(async (session) => {
        if (cancelled) return
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          try {
            // Fetch user profile with role from database
            const { data: userData } = await supabase
              .from('users')
              .select('role, name')
              .eq('id', session.user.id)
              .single()

            if (cancelled) return
            setUserProfile({
              id: session.user.id,
              email: session.user.email || '',
              name: userData?.name || session.user.email?.split('@')[0] || 'Usuario',
              role: userData?.role || 'viewer', // Default to viewer if not found
            })
          } catch (profileError) {
            console.error('Error fetching user profile:', profileError)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event)
      setSession(session)
      setUser(session?.user ?? null)

      try {
        if (session?.user) {
          // Fetch user profile with role from database
          const { data: userData } = await supabase
            .from('users')
            .select('role, name')
            .eq('id', session.user.id)
            .single()

          setUserProfile({
            id: session.user.id,
            email: session.user.email || '',
            name: userData?.name || session.user.email?.split('@')[0] || 'Usuario',
            role: userData?.role || 'viewer', // Default to viewer if not found
          })
        } else {
          setUserProfile(null)
        }
      } catch (profileError) {
        console.error('Error fetching user profile on auth change:', profileError)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setUserProfile(null)
    window.location.href = '/iniciar-sesion'
  }

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

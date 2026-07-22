// @ts-nocheck
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: 'admin' | 'seller' | 'viewer'
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
    // una carrera con timeout (mismo patrón ya usado en mi-cuenta/page.tsx)
    // y, si se agota, se intenta getUser() como respaldo — hace una
    // llamada de red nueva e independiente que no depende del mismo lock.
    let cancelled = false

    const resolveSession = async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 8000)
      )
      try {
        const { data: { session }, error } = await Promise.race([supabase.auth.getSession(), timeout])
        if (error) {
          console.error('Error getting session:', error)
        }
        return session
      } catch (raceError) {
        console.error('getSession colgada o falló, reintentando con getUser():', raceError)
        try {
          const { data: { user: fallbackUser }, error: userError } = await supabase.auth.getUser()
          if (userError || !fallbackUser) return null
          // getUser() no devuelve el objeto Session completo, pero alcanza
          // con user para desbloquear la UI — session se completará sola
          // vía onAuthStateChange si el cliente logra recuperarse después.
          return { user: fallbackUser } as any
        } catch (fallbackError) {
          console.error('Fallback getUser() también falló:', fallbackError)
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

// @ts-nocheck
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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
  const supabase = createClientComponentClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

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
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event)
        setSession(session)
        setUser(session?.user ?? null)

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

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setUserProfile(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, session, userProfile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

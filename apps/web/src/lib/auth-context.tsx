'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        setUserProfile({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.email?.split('@')[0] || 'Usuario',
          role: 'admin',
        })
      }

      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth event:', event)
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          setUserProfile({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email?.split('@')[0] || 'Usuario',
            role: 'admin',
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

'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface WishlistContextType {
  items: string[]
  isInWishlist: (productId: string) => boolean
  toggleWishlist: (productId: string) => Promise<void>
  isLoading: boolean
  count: number
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined)

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const loadWishlist = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        // Load from localStorage for non-authenticated users
        const stored = localStorage.getItem('ybm_wishlist')
        if (stored) {
          try { setItems(JSON.parse(stored)) } catch { /* ignore */ }
        }
        return
      }

      setUserId(session.user.id)
      const { data } = await supabase
        .from('wishlists')
        .select('product_id')
        .eq('user_id', session.user.id)

      if (data) {
        setItems(data.map((w: any) => w.product_id))
      }
    }

    loadWishlist()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
        const { data } = await supabase
          .from('wishlists')
          .select('product_id')
          .eq('user_id', session.user.id)
        if (data) {
          setItems(data.map((w: any) => w.product_id))
        }
      } else {
        setUserId(null)
        const stored = localStorage.getItem('ybm_wishlist')
        if (stored) {
          try { setItems(JSON.parse(stored)) } catch { /* ignore */ }
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const isInWishlist = useCallback((productId: string) => {
    return items.includes(productId)
  }, [items])

  const toggleWishlist = useCallback(async (productId: string) => {
    setIsLoading(true)
    try {
      const isCurrentlyIn = items.includes(productId)

      if (userId) {
        // Authenticated: use Supabase
        if (isCurrentlyIn) {
          await (supabase.from('wishlists') as any)
            .delete()
            .eq('user_id', userId)
            .eq('product_id', productId)
          setItems(prev => prev.filter(id => id !== productId))
        } else {
          await (supabase.from('wishlists') as any)
            .insert({ user_id: userId, product_id: productId })
          setItems(prev => [...prev, productId])
        }
      } else {
        // Not authenticated: use localStorage
        let newItems: string[]
        if (isCurrentlyIn) {
          newItems = items.filter(id => id !== productId)
        } else {
          newItems = [...items, productId]
        }
        setItems(newItems)
        localStorage.setItem('ybm_wishlist', JSON.stringify(newItems))
      }
    } finally {
      setIsLoading(false)
    }
  }, [items, userId])

  return (
    <WishlistContext.Provider value={{ items, isInWishlist, toggleWishlist, isLoading, count: items.length }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used within WishlistProvider')
  return context
}

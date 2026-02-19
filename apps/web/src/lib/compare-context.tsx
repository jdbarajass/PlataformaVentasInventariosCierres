'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Product } from '@/types/database'

const MAX_COMPARE = 3

interface CompareContextType {
  items: Product[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  hasItem: (productId: string) => boolean
  clear: () => void
  isFull: boolean
}

const CompareContext = createContext<CompareContextType | null>(null)

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Product[]>([])

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      if (prev.length >= MAX_COMPARE) return prev
      if (prev.find((p) => p.id === product.id)) return prev
      return [...prev, product]
    })
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((p) => p.id !== productId))
  }, [])

  const hasItem = useCallback(
    (productId: string) => items.some((p) => p.id === productId),
    [items]
  )

  const clear = useCallback(() => setItems([]), [])

  return (
    <CompareContext.Provider
      value={{ items, addItem, removeItem, hasItem, clear, isFull: items.length >= MAX_COMPARE }}
    >
      {children}
    </CompareContext.Provider>
  )
}

export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used inside CompareProvider')
  return ctx
}

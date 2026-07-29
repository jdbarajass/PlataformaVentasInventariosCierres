'use client'

import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'

export interface CartItem {
  id: string
  // Identificador único de la línea del carrito: igual a `id` para
  // productos sin tallas, o `id:variant_id` para productos con tallas — así
  // dos tallas distintas del mismo producto son líneas separadas en vez de
  // sumarse entre sí.
  line_id: string
  variant_id?: string | null
  talla?: string | null
  title: string
  price_cents: number
  image: string
  qty: number
  stock_qty: number
}

interface CartState {
  items: CartItem[]
  isOpen: boolean
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QTY'; payload: { line_id: string; qty: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'TOGGLE_CART' }
  | { type: 'SET_CART_OPEN'; payload: boolean }
  | { type: 'LOAD_CART'; payload: CartItem[] }

const CartContext = createContext<{
  state: CartState
  dispatch: React.Dispatch<CartAction>
  addItem: (item: Omit<CartItem, 'qty' | 'line_id'>) => void
  removeItem: (line_id: string) => void
  updateQty: (line_id: string, qty: number) => void
  clearCart: () => void
  toggleCart: () => void
  setCartOpen: (open: boolean) => void
  totalItems: number
  totalPrice: number
} | null>(null)

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingIndex = state.items.findIndex(item => item.line_id === action.payload.line_id)
      if (existingIndex >= 0) {
        const newItems = [...state.items]
        const newQty = Math.min(
          newItems[existingIndex].qty + action.payload.qty,
          action.payload.stock_qty
        )
        newItems[existingIndex] = { ...newItems[existingIndex], qty: newQty }
        return { ...state, items: newItems }
      }
      return { ...state, items: [...state.items, action.payload] }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(item => item.line_id !== action.payload) }
    case 'UPDATE_QTY': {
      if (action.payload.qty <= 0) {
        return { ...state, items: state.items.filter(item => item.line_id !== action.payload.line_id) }
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.line_id === action.payload.line_id
            ? { ...item, qty: Math.min(action.payload.qty, item.stock_qty) }
            : item
        ),
      }
    }
    case 'CLEAR_CART':
      return { ...state, items: [] }
    case 'TOGGLE_CART':
      return { ...state, isOpen: !state.isOpen }
    case 'SET_CART_OPEN':
      return { ...state, isOpen: action.payload }
    case 'LOAD_CART':
      return { ...state, items: action.payload }
    default:
      return state
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], isOpen: false })

  useEffect(() => {
    const savedCart = localStorage.getItem('yb-motocom-cart')
    if (savedCart) {
      try {
        const items = JSON.parse(savedCart)
        dispatch({ type: 'LOAD_CART', payload: items })
      } catch {
        console.error('Error loading cart from localStorage')
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('yb-motocom-cart', JSON.stringify(state.items))
  }, [state.items])

  const addItem = (item: Omit<CartItem, 'qty' | 'line_id'>) => {
    const line_id = item.variant_id ? `${item.id}:${item.variant_id}` : item.id
    dispatch({ type: 'ADD_ITEM', payload: { ...item, line_id, qty: 1 } })
  }

  const removeItem = (line_id: string) => {
    dispatch({ type: 'REMOVE_ITEM', payload: line_id })
  }

  const updateQty = (line_id: string, qty: number) => {
    dispatch({ type: 'UPDATE_QTY', payload: { line_id, qty } })
  }

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' })
  }

  const toggleCart = () => {
    dispatch({ type: 'TOGGLE_CART' })
  }

  const setCartOpen = (open: boolean) => {
    dispatch({ type: 'SET_CART_OPEN', payload: open })
  }

  const totalItems = state.items.reduce((sum, item) => sum + item.qty, 0)
  const totalPrice = state.items.reduce((sum, item) => sum + item.price_cents * item.qty, 0)

  return (
    <CartContext.Provider
      value={{
        state,
        dispatch,
        addItem,
        removeItem,
        updateQty,
        clearCart,
        toggleCart,
        setCartOpen,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Grid3X3, ShoppingCart, User, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCart } from '@/lib/cart-context'

const navItems = [
  {
    name: 'Inicio',
    href: '/',
    icon: Home,
  },
  {
    name: 'Categorías',
    href: '/categorias',
    icon: Grid3X3,
  },
  {
    name: 'Buscar',
    href: '/buscar',
    icon: Search,
  },
  {
    name: 'Carrito',
    href: '/checkout',
    icon: ShoppingCart,
    showBadge: true,
  },
  {
    name: 'Cuenta',
    href: '/mi-cuenta',
    icon: User,
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const { totalItems } = useCart()
  const cartCount = totalItems || 0

  // Don't show on admin pages
  if (pathname?.startsWith('/admin')) {
    return null
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.showBadge && cartCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.name}</span>
              {isActive && (
                <span className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

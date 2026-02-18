'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, Menu, Search, User, X, LogIn } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCart } from '@/lib/cart-context'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { supabase } from '@/lib/supabase'

const navigation = [
  { name: 'Inicio', href: '/' },
  { name: 'Cascos', href: '/categoria/cascos' },
  { name: 'Guantes', href: '/categoria/guantes' },
  { name: 'Chaquetas', href: '/categoria/chaquetas' },
  { name: 'Accesorios', href: '/categoria/accesorios' },
]

export function Header() {
  const pathname = usePathname()
  const { totalItems, toggleCart } = useCart()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session)
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        setUserRole(data?.role || 'viewer')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session)
      if (!session) setUserRole(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const accountHref = !isLoggedIn
    ? '/iniciar-sesion'
    : userRole === 'admin' || userRole === 'seller'
      ? '/admin'
      : '/mi-cuenta'

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
            <span className="text-xl font-bold text-white">YB</span>
          </div>
          <span className="hidden font-bold sm:inline-block">MOTOCOM</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:gap-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'nav-link',
                pathname === item.href && 'text-foreground active'
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="hidden sm:block">
            {searchOpen ? (
              <div className="flex items-center gap-2 animate-fade-in">
                <Input
                  type="search"
                  placeholder="Buscar productos..."
                  className="w-64"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User / Account */}
          <Link href={accountHref}>
            <Button variant="ghost" size="icon">
              {isLoggedIn ? (
                <User className="h-5 w-5" />
              ) : (
                <LogIn className="h-5 w-5" />
              )}
            </Button>
          </Link>

          {/* Cart */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={toggleCart}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {totalItems}
              </span>
            )}
          </Button>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="border-t md:hidden animate-slide-up">
          <div className="container py-4">
            <div className="mb-4">
              <Input type="search" placeholder="Buscar productos..." />
            </div>
            <nav className="flex flex-col gap-2">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm transition-colors',
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
              {!isLoggedIn && (
                <>
                  <Link
                    href="/iniciar-sesion"
                    className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Iniciar sesión
                  </Link>
                  <Link
                    href="/registro"
                    className="rounded-lg px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Crear cuenta
                  </Link>
                </>
              )}
              {isLoggedIn && (
                <Link
                  href={accountHref}
                  className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mi cuenta
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}

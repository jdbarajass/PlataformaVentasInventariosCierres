'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  ShoppingCart, Menu, Search, User, X, LogIn,
  ChevronDown, HardHat, Hand, Shirt, Wrench,
  Tag, Zap, MessageCircle,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCart } from '@/lib/cart-context'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { supabase } from '@/lib/supabase'

const categories = [
  { name: 'Cascos',     href: '/categoria/cascos',     icon: HardHat, description: 'Protección certificada' },
  { name: 'Guantes',    href: '/categoria/guantes',    icon: Hand,    description: 'Agarre y comodidad' },
  { name: 'Chaquetas',  href: '/categoria/chaquetas',  icon: Shirt,   description: 'Estilo y protección' },
  { name: 'Accesorios', href: '/categoria/accesorios', icon: Wrench,  description: 'Todo para tu moto' },
  { name: 'Ofertas',    href: '/ofertas',              icon: Tag,     description: 'Precios increíbles' },
  { name: 'Novedades',  href: '/productos',            icon: Zap,     description: 'Lo último en llegar' },
]

const navigation = [
  { name: 'Inicio',    href: '/' },
  { name: 'Productos', href: '/productos', hasDropdown: true },
  { name: 'Ofertas',   href: '/ofertas' },
  { name: 'Nosotros',  href: '/nosotros' },
  { name: 'Contacto',  href: '/contacto' },
]

const WHATSAPP_NUMBER = '573214111371'

export function Header() {
  const pathname     = usePathname()
  const { totalItems, toggleCart } = useCart()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen,     setSearchOpen]     = useState(false)
  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const [scrolled,       setScrolled]       = useState(false)
  const [isLoggedIn,     setIsLoggedIn]     = useState(false)
  const [userRole,       setUserRole]       = useState<string | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session)
      if (session?.user) {
        const { data } = await supabase
          .from('users').select('role').eq('id', session.user.id).single()
        setUserRole(data?.role || 'viewer')
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session)
      if (!session) setUserRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const accountHref = !isLoggedIn
    ? '/iniciar-sesion'
    : userRole === 'admin' || userRole === 'seller'
      ? '/admin'
      : '/mi-cuenta'

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 w-full transition-all duration-300',
          scrolled
            ? 'border-b border-border/40 bg-background/90 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.25)]'
            : 'bg-transparent border-b border-transparent'
        )}
      >
        {/* Gradient line at bottom when scrolled */}
        {scrolled && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
        )}

        <div className="container flex h-16 items-center justify-between gap-4">

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center shrink-0 group">
            <Image
              src="/images/logo-yjbmotocom.png"
              alt="YJB MOTOCOM - Accesorios para Motos"
              width={120}
              height={48}
              className="h-12 w-auto object-contain transition-all duration-300 group-hover:scale-105"
              priority
            />
          </Link>

          {/* ── Desktop Navigation ── */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) =>
              item.hasDropdown ? (
                <div key={item.name} className="relative" ref={dropdownRef}>
                  <button
                    className={cn(
                      'nav-link flex items-center gap-1',
                      pathname.startsWith('/categoria') || pathname === '/productos'
                        ? 'text-foreground active'
                        : ''
                    )}
                    onClick={() => setDropdownOpen(v => !v)}
                    onMouseEnter={() => setDropdownOpen(true)}
                  >
                    {item.name}
                    <ChevronDown className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      dropdownOpen ? 'rotate-180' : ''
                    )} />
                  </button>

                  {/* Mega dropdown */}
                  {dropdownOpen && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-[480px] card-glass border border-border/40 shadow-deep rounded-2xl p-5 animate-scale-in"
                      onMouseLeave={() => setDropdownOpen(false)}
                    >
                      {/* Top highlight */}
                      <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-muted-foreground px-2 mb-3">
                        Categorías
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {categories.map((cat) => (
                          <Link
                            key={cat.name}
                            href={cat.href}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-primary/10 group/item"
                            onClick={() => setDropdownOpen(false)}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary group-hover/item:bg-primary/20 transition-colors">
                              <cat.icon className="h-4 w-4 text-muted-foreground group-hover/item:text-primary transition-colors" />
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-none group-hover/item:text-primary transition-colors">
                                {cat.name}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <Link
                          href="/productos"
                          className="flex items-center justify-center gap-1.5 text-sm text-primary font-medium hover:underline"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Ver todos los productos →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn('nav-link', pathname === item.href && 'text-foreground active')}
                >
                  {item.name}
                </Link>
              )
            )}
          </nav>

          {/* ── Search ── */}
          <div className="hidden sm:flex flex-1 max-w-xs">
            {searchOpen ? (
              <div className="flex items-center gap-2 w-full animate-fade-in">
                <Input
                  ref={searchRef}
                  type="search"
                  placeholder="Buscar cascos, guantes..."
                  className="h-9 bg-secondary/60 border-border/40 focus:border-primary rounded-xl text-sm"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setSearchOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 h-9 px-3 rounded-xl bg-secondary/40 border border-border/30 text-sm text-muted-foreground transition-all duration-200 hover:bg-secondary hover:border-border hover:text-foreground w-full"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="text-xs">Buscar productos...</span>
                <span className="ml-auto text-[10px] border border-border/50 rounded px-1 py-0.5 hidden lg:inline-flex">⌘K</span>
              </button>
            )}
          </div>

          {/* ── Right Actions ── */}
          <div className="flex items-center gap-1">
            <ThemeToggle />

            <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
              <Link href={accountHref} title={isLoggedIn ? 'Mi cuenta' : 'Iniciar sesión'}>
                {isLoggedIn ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-xl"
              onClick={toggleCart}
              title="Carrito"
            >
              <ShoppingCart className="h-4 w-4" />
              {totalItems > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-glow-red-sm animate-scale-in">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </Button>

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 rounded-xl"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* ── Mobile Navigation ── */}
        {mobileMenuOpen && (
          <div className="border-t border-border/40 md:hidden animate-slide-up bg-background/95 backdrop-blur-xl">
            <div className="container py-4 space-y-4">
              {/* Mobile search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar productos..."
                  className="bg-secondary/50 border-border/40 rounded-xl pl-9"
                />
              </div>

              <nav className="flex flex-col gap-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
                      pathname === item.href
                        ? 'bg-primary text-white shadow-glow-red-sm'
                        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}

                <div className="pt-2 border-t border-border/50 mt-2 space-y-1">
                  {!isLoggedIn ? (
                    <>
                      <Link
                        href="/iniciar-sesion"
                        className="rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-secondary text-muted-foreground hover:text-foreground flex"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Iniciar sesión
                      </Link>
                      <Link
                        href="/registro"
                        className="rounded-xl px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/10 flex"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Crear cuenta
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={accountHref}
                      className="rounded-xl px-4 py-2.5 text-sm transition-all hover:bg-secondary text-muted-foreground hover:text-foreground flex"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Mi cuenta
                    </Link>
                  )}
                </div>
              </nav>
            </div>
          </div>
        )}
      </header>

      {/* ── WhatsApp Floating Button (premium redesign) ── */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola!%20Quiero%20información%20sobre%20sus%20productos`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'flex items-center gap-2 rounded-full px-4 py-3',
          'bg-[#25D366] text-white font-semibold text-sm',
          'shadow-whatsapp hover:shadow-whatsapp-hover',
          'transition-all duration-300 hover:scale-105',
          'animate-float'
        )}
      >
        <MessageCircle className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">¿Necesitas ayuda?</span>
      </a>
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Calendar,
  Users,
  Settings,
  FileText,
  LogOut,
  Shield,
  Store,
  Loader2,
  Lock,
  Tag,
  MessageSquare,
  Landmark,
  Wallet,
  Receipt,
  FileStack,
  HandCoins,
  PackageOpen,
  StickyNote,
  PiggyBank,
  Trophy,
  FileSpreadsheet,
  Calculator,
  Gauge,
  CalendarClock,
  History,
  Percent,
  Menu,
  Layers,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { SessionAlerts } from '@/components/admin/session-alerts'
import { BRAND } from '@/config/brand'

// adminOnly: oculta el enlace del menú a 'seller', igual que el software
// local oculta el botón de navegación completo para estas páginas
// (main_window._ocultas_vendedor). Cada una de estas páginas ya rechaza
// o bloquea el acceso a 'seller' por su cuenta (servidor y/o cliente); esto
// solo evita que el vendedor vea el enlace en primer lugar.
interface NavLeaf {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

interface NavGroup {
  name: string
  icon: React.ComponentType<{ className?: string }>
  items: NavLeaf[]
  adminOnly?: boolean
}

type NavEntry = NavLeaf | NavGroup

const isGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry

// Agrupado en submenús desplegables (al estilo Alegra) para que el menú no
// muestre 27 enlaces sueltos de una — Dashboard y Notas quedan sueltos por
// ser de un solo vistazo/acceso frecuente, igual que "Inicio" y "Mis
// tareas" en Alegra.
const navigation: NavEntry[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  {
    name: 'Catálogo',
    icon: Package,
    items: [
      { name: 'Productos', href: '/admin/productos', icon: Package },
      { name: 'Categorías', href: '/admin/categorias', icon: Layers, adminOnly: true },
      { name: 'Cupones', href: '/admin/cupones', icon: Tag },
      { name: 'Resenas', href: '/admin/resenas', icon: MessageSquare },
    ],
  },
  {
    name: 'Ventas',
    icon: Receipt,
    items: [
      { name: 'Registrar Venta', href: '/admin/ventas', icon: Receipt },
      { name: 'Ordenes', href: '/admin/ordenes', icon: ShoppingCart },
      { name: 'Ventas del Día', href: '/admin/ventas-dia', icon: CalendarClock },
      { name: 'Historial Mensual', href: '/admin/historial-mensual', icon: History },
      { name: 'Calculadora', href: '/admin/calculadora', icon: Calculator },
      { name: 'Mi Cuadre', href: '/admin/mi-cuadre', icon: Gauge },
    ],
  },
  {
    name: 'Inventario',
    icon: BarChart3,
    items: [
      { name: 'Inventario', href: '/admin/inventario', icon: BarChart3 },
      { name: 'Préstamos', href: '/admin/prestamos', icon: PackageOpen },
    ],
  },
  {
    name: 'Finanzas',
    icon: Wallet,
    items: [
      { name: 'Cuentas', href: '/admin/cuentas', icon: Wallet, adminOnly: true },
      { name: 'Facturas', href: '/admin/facturas', icon: FileStack },
      { name: 'Fiado', href: '/admin/fiado', icon: HandCoins },
      { name: 'Presupuesto', href: '/admin/presupuesto', icon: PiggyBank },
      { name: 'Cierres', href: '/admin/cierres', icon: Calendar },
      { name: 'Cierre Alegra', href: '/admin/cierre-alegra', icon: Landmark },
      { name: 'Comisiones y Gastos Fijos', href: '/admin/configuracion-pos', icon: Percent, adminOnly: true },
    ],
  },
  {
    name: 'Reportes',
    icon: FileText,
    items: [
      { name: 'Reportes', href: '/admin/reportes', icon: FileText },
      { name: 'Rendimiento Vendedores', href: '/admin/rendimiento-vendedores', icon: Trophy, adminOnly: true },
      { name: 'Auditoria', href: '/admin/auditoria', icon: Shield, adminOnly: true },
    ],
  },
  { name: 'Notas', href: '/admin/notas', icon: StickyNote },
  {
    name: 'Administración',
    icon: Settings,
    adminOnly: true,
    items: [
      { name: 'Usuarios', href: '/admin/usuarios', icon: Users, adminOnly: true },
      { name: 'Exportar/Importar', href: '/admin/exportar-importar', icon: FileSpreadsheet, adminOnly: true },
      { name: 'Configuracion', href: '/admin/configuracion', icon: Settings, adminOnly: true },
    ],
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, userProfile, loading, signOut } = useAuth()
  const { toast } = useToast()

  // Aviso de una sola vez tras iniciar sesión: la bandera la deja
  // iniciar-sesion/page.tsx justo después de pedir el cierre de cualquier
  // otra sesión abierta de esta cuenta (scope: 'others'). Se lee y se borra
  // aquí para que no vuelva a aparecer en la siguiente navegación/recarga.
  //
  // El setTimeout (no un toast() directo) es necesario: en la carga inicial
  // de /admin, este efecto corre ANTES de que <Toaster/> (montado más abajo
  // en el layout raíz) alcance a suscribirse — llamar toast() en ese
  // instante actualiza el estado interno de use-toast.ts pero <Toaster/>
  // todavía no está escuchando, así que el aviso nunca llega a pintarse.
  // Con un pequeño retraso, ya montó y sí lo recibe.
  useEffect(() => {
    let flagFound = false
    try {
      flagFound = !!sessionStorage.getItem('yjb_other_sessions_closed')
      if (flagFound) sessionStorage.removeItem('yjb_other_sessions_closed')
    } catch {
      // sessionStorage deshabilitado — no es crítico, se omite el aviso.
    }
    if (!flagFound) return
    const timer = setTimeout(() => {
      toast({
        title: 'Sesión iniciada',
        description: 'Si esta cuenta estaba abierta en otro dispositivo, esa sesión se cerró automáticamente.',
      })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Colapsar el sidebar para dar más espacio al contenido — preferencia
  // persistida en localStorage, pedida explícitamente por el usuario.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem('admin_sidebar_collapsed') === 'true')
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('admin_sidebar_collapsed', String(next))
      return next
    })
  }

  // Celular/tablet (< lg): el sidebar es un cajón que se abre con el botón de
  // la barra superior. En escritorio (>= lg) no existe este estado: el
  // sidebar es fijo como siempre y manda `collapsed`. Ver
  // docs/MOVIL_PANEL_ADMIN.md (Fase 2).
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      setIsDesktop(mq.matches)
      if (mq.matches) setMobileOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Al navegar, el cajón se cierra solo (el vendedor tocó una opción).
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Cajón abierto: Escape lo cierra y el fondo no se desplaza detrás.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  // En el cajón móvil el menú siempre va completo (con textos): el modo
  // "solo íconos" es una preferencia de escritorio.
  const showCollapsed = collapsed && isDesktop

  const isActiveHref = (href: string) => (href === '/admin' ? pathname === href : pathname?.startsWith(href))

  // Nombre de la página actual para la barra superior móvil ("¿dónde estoy?").
  const currentPageName = (() => {
    for (const entry of navigation) {
      if (isGroup(entry)) {
        const match = entry.items.filter((it) => isActiveHref(it.href)).sort((a, b) => b.href.length - a.href.length)[0]
        if (match) return match.name
      } else if (isActiveHref(entry.href)) {
        return entry.name
      }
    }
    return 'Panel'
  })()

  // Qué submenús están abiertos. Se abre solo (sin cerrar los demás que el
  // usuario haya abierto a mano) el grupo que contiene la página actual,
  // cada vez que cambia de ruta — así entrar por un enlace directo (o
  // recargar) siempre deja visible en qué sección estás.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  useEffect(() => {
    const activeGroup = navigation.find((entry) => isGroup(entry) && entry.items.some((it) => isActiveHref(it.href)))
    if (activeGroup) {
      setExpandedGroups((prev) => (prev.has(activeGroup.name) ? prev : new Set(prev).add(activeGroup.name)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // En modo colapsado (solo iconos) un grupo no tiene dónde mostrar sus
  // hijos, así que un clic ahí simplemente vuelve a expandir el menú
  // completo con ese grupo ya abierto, en vez de un submenú flotante.
  const handleGroupClick = (name: string) => {
    if (showCollapsed) {
      setCollapsed(false)
      localStorage.setItem('admin_sidebar_collapsed', 'false')
      setExpandedGroups((prev) => new Set(prev).add(name))
    } else {
      toggleGroup(name)
    }
  }

  // Redirigir al login si no hay usuario autenticado
  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/iniciar-sesion'
    }
  }, [loading, user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  // Mostrar pantalla de acceso denegado mientras redirige
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white">Acceso Restringido</h1>
          <p className="mt-2 text-slate-400">Debes iniciar sesion para acceder</p>
          <p className="mt-4 text-sm text-slate-500">Redirigiendo al login…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Barra superior — solo celular/tablet (< lg) */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileOpen}
          aria-controls="admin-sidebar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-secondary active:bg-secondary"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-base font-semibold">{currentPageName}</p>
        <Link href="/admin" aria-label="Ir al Dashboard" className="flex h-11 w-11 shrink-0 items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
            <span className="text-sm font-bold text-white">{BRAND.logoInitials}</span>
          </div>
        </Link>
      </header>

      {/* Fondo del cajón móvil: tocar fuera lo cierra */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 animate-fade-in lg:hidden"
        />
      )}

      {/* Sidebar — fijo en escritorio, cajón deslizable en celular/tablet */}
      <aside
        id="admin-sidebar"
        aria-label="Menú del panel"
        // Cerrado en celular: fuera de pantalla y fuera del Tab/lector de
        // pantalla. (App Router corre React 19: inert es booleano.)
        inert={!isDesktop && !mobileOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] border-r bg-card shadow-2xl transition-[transform,width] duration-300 ease-out motion-reduce:transition-none',
          'lg:translate-x-0 lg:shadow-none lg:duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-16' : 'lg:w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className={cn('flex h-16 items-center border-b', showCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
            <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                <span className="text-sm font-bold text-white">{BRAND.logoInitials}</span>
              </div>
            </Link>
            {!showCollapsed && (
              <Button variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 lg:inline-flex" onClick={toggleCollapsed} title="Colapsar menú">
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {showCollapsed && (
            <button
              onClick={toggleCollapsed}
              title="Expandir menú"
              className="flex items-center justify-center border-b py-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {/* User Info */}
          {user && (
            <div className={cn('border-b p-4', showCollapsed && 'flex justify-center px-2')}>
              <div className={cn('flex items-center gap-3', showCollapsed && 'justify-center')}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                  <span className="text-sm font-bold text-white">
                    {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </span>
                </div>
                {!showCollapsed && (
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">
                      {userProfile?.name || user.email?.split('@')[0]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {userProfile?.role === 'admin_readonly' ? 'Admin (solo lectura)' : userProfile?.role || 'admin'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-4">
            {navigation.map((entry) => {
              if (entry.adminOnly && userProfile?.role !== 'admin' && userProfile?.role !== 'admin_readonly') return null

              if (!isGroup(entry)) {
                const isActive = isActiveHref(entry.href)
                return (
                  <Link
                    key={entry.name}
                    href={entry.href}
                    title={showCollapsed ? entry.name : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                      showCollapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-500'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <entry.icon className="h-5 w-5 shrink-0" />
                    {!showCollapsed && entry.name}
                  </Link>
                )
              }

              const visibleItems = entry.items.filter(
                (it) => !it.adminOnly || userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'
              )
              if (visibleItems.length === 0) return null
              const groupHasActive = visibleItems.some((it) => isActiveHref(it.href))
              const isOpen = expandedGroups.has(entry.name)

              return (
                <div key={entry.name}>
                  <button
                    type="button"
                    title={showCollapsed ? entry.name : undefined}
                    onClick={() => handleGroupClick(entry.name)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                      showCollapsed && 'justify-center px-2',
                      groupHasActive
                        ? 'text-cyan-500'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <entry.icon className="h-5 w-5 shrink-0" />
                    {!showCollapsed && (
                      <>
                        <span className="flex-1 text-left">{entry.name}</span>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                      </>
                    )}
                  </button>
                  {!showCollapsed && isOpen && (
                    <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                      {visibleItems.map((item) => {
                        const isActive = isActiveHref(item.href)
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors lg:py-2',
                              isActive
                                ? 'bg-cyan-500/10 text-cyan-500'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {item.name}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4 space-y-2">
            <Link
              href="/"
              title={showCollapsed ? 'Ver tienda' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                showCollapsed && 'justify-center px-2'
              )}
            >
              <Store className="h-5 w-5 shrink-0" />
              {!showCollapsed && 'Ver tienda'}
            </Link>
            <Button
              variant="ghost"
              onClick={signOut}
              title={showCollapsed ? 'Cerrar sesion' : undefined}
              className={cn(
                'w-full gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 hover:text-red-500',
                showCollapsed ? 'justify-center px-2' : 'justify-start'
              )}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {!showCollapsed && 'Cerrar sesion'}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      {/* pt-14 en celular = alto de la barra superior fija. min-w-0: sin él,
          una tabla ancha estira el flex item más allá de la pantalla. */}
      <main className={cn('min-w-0 flex-1 pt-14 transition-[padding] duration-200 lg:pt-0', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
      <SessionAlerts />
    </div>
  )
}

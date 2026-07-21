'use client'

import { useEffect } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Productos', href: '/admin/productos', icon: Package },
  { name: 'Ordenes', href: '/admin/ordenes', icon: ShoppingCart },
  { name: 'Registrar Venta', href: '/admin/ventas', icon: Receipt },
  { name: 'Calculadora', href: '/admin/calculadora', icon: Calculator },
  { name: 'Mi Cuadre', href: '/admin/mi-cuadre', icon: Gauge },
  { name: 'Ventas del Día', href: '/admin/ventas-dia', icon: CalendarClock },
  { name: 'Historial Mensual', href: '/admin/historial-mensual', icon: History },
  { name: 'Inventario', href: '/admin/inventario', icon: BarChart3 },
  { name: 'Cuentas', href: '/admin/cuentas', icon: Wallet },
  { name: 'Facturas', href: '/admin/facturas', icon: FileStack },
  { name: 'Fiado', href: '/admin/fiado', icon: HandCoins },
  { name: 'Préstamos', href: '/admin/prestamos', icon: PackageOpen },
  { name: 'Notas', href: '/admin/notas', icon: StickyNote },
  { name: 'Presupuesto', href: '/admin/presupuesto', icon: PiggyBank },
  { name: 'Cierres', href: '/admin/cierres', icon: Calendar },
  { name: 'Cierre Alegra', href: '/admin/cierre-alegra', icon: Landmark },
  { name: 'Reportes', href: '/admin/reportes', icon: FileText },
  { name: 'Rendimiento Vendedores', href: '/admin/rendimiento-vendedores', icon: Trophy },
  { name: 'Cupones', href: '/admin/cupones', icon: Tag },
  { name: 'Resenas', href: '/admin/resenas', icon: MessageSquare },
  { name: 'Usuarios', href: '/admin/usuarios', icon: Users },
  { name: 'Auditoria', href: '/admin/auditoria', icon: Shield },
  { name: 'Exportar/Importar', href: '/admin/exportar-importar', icon: FileSpreadsheet },
  { name: 'Configuracion', href: '/admin/configuracion', icon: Settings },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { user, userProfile, loading, signOut } = useAuth()

  // Redirigir al login si no hay usuario autenticado
  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login'
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
          <p className="mt-4 text-sm text-slate-500">Redirigiendo al login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link href="/admin" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
                <span className="text-sm font-bold text-white">YB</span>
              </div>
              <span className="font-bold">Admin</span>
            </Link>
          </div>

          {/* User Info */}
          {user && (
            <div className="border-b p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
                  <span className="text-sm font-bold text-white">
                    {userProfile?.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate text-sm font-medium">
                    {userProfile?.name || user.email?.split('@')[0]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {userProfile?.role || 'admin'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname?.startsWith(item.href))

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-500'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="border-t p-4 space-y-2">
            <Link
              href="/"
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Store className="h-5 w-5" />
              Ver tienda
            </Link>
            <Button
              variant="ghost"
              onClick={signOut}
              className="w-full justify-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 hover:text-red-500"
            >
              <LogOut className="h-5 w-5" />
              Cerrar sesion
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pl-64">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}

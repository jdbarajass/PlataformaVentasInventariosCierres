'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Landmark,
  BarChart2,
  TrendingUp,
  Package,
  LayoutGrid,
} from 'lucide-react'

const subNav = [
  { name: 'Cierre de Caja', href: '/admin/cierre-alegra/cierre', icon: Landmark },
  { name: 'Ventas del Periodo', href: '/admin/cierre-alegra/ventas-mensuales', icon: TrendingUp },
  { name: 'Analíticas', href: '/admin/cierre-alegra/analytics', icon: BarChart2 },
  { name: 'Inventario', href: '/admin/cierre-alegra/inventario', icon: Package },
  { name: 'Productos', href: '/admin/cierre-alegra/productos', icon: LayoutGrid },
]

export default function CierreAlegraLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      {/* Header de sección */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600">
            <Landmark className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Cierre Alegra</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-11">
          Gestión integrada con Alegra — YJBMOTOCOM Accesorios para Motos
        </p>
      </div>

      {/* Sub-navegación */}
      <nav className="flex flex-wrap gap-1 border-b border-border pb-4">
        {subNav.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Contenido */}
      {children}
    </div>
  )
}

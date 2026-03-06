import { Metadata } from 'next'
import { getServiceSupabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  HardHat,
  Shield,
  Zap,
  Wrench,
  Glasses,
  Backpack,
  Bike,
  FolderOpen,
  Boxes,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Categorías de Productos | YJBMOTOCOM',
  description:
    'Explora todas las categorías de accesorios para motociclistas en YJBMOTOCOM. Cascos, protecciones, guantes, chaquetas y más.',
  openGraph: {
    title: 'Categorías | YJBMOTOCOM',
    description: 'Todas las categorías de productos para motociclistas',
  },
}

// Map category names to icons (customize based on your actual categories)
const categoryIcons: Record<string, React.ReactNode> = {
  cascos: <HardHat className="h-8 w-8" />,
  protecciones: <Shield className="h-8 w-8" />,
  guantes: <Boxes className="h-8 w-8" />,
  chaquetas: <Backpack className="h-8 w-8" />,
  'accesorios eléctricos': <Zap className="h-8 w-8" />,
  'accesorios electricos': <Zap className="h-8 w-8" />,
  herramientas: <Wrench className="h-8 w-8" />,
  gafas: <Glasses className="h-8 w-8" />,
  motos: <Bike className="h-8 w-8" />,
}

// Get icon for category (fallback to FolderOpen)
function getCategoryIcon(categoryName: string): React.ReactNode {
  const normalizedName = categoryName.toLowerCase().trim()
  return categoryIcons[normalizedName] || <FolderOpen className="h-8 w-8" />
}

// Gradient colors for categories
const gradients = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-orange-500 to-red-500',
  'from-green-500 to-emerald-500',
  'from-yellow-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-purple-500',
  'from-teal-500 to-green-500',
]

export default async function CategoriasPage() {
  const supabase = getServiceSupabase()

  // Fetch categories with product count
  const { data: categoriesData, error } = await supabase.rpc(
    'get_categories_with_count'
  )

  // Fallback: if RPC doesn't exist, use regular query
  let categories: any = null
  if (error || !categoriesData) {
    const { data: categoriesRaw } = await supabase
      .from('categories')
      .select('id, name, slug, description, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (categoriesRaw) {
      // Get product counts manually
      const categoriesWithCount = await Promise.all(
        categoriesRaw.map(async (category: any) => {
          const { count } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', category.id)
            .eq('active', true)

          return {
            ...category,
            product_count: count || 0,
          }
        })
      )
      categories = categoriesWithCount
    }
  } else {
    categories = categoriesData
  }

  const totalCategories = categories?.length || 0
  const totalProducts = categories?.reduce((sum: number, cat: any) => sum + (cat.product_count || 0), 0) || 0

  return (
    <div className="container py-8 md:py-12">
      {/* Breadcrumbs */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Categorías</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Explora por Categoría
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Encuentra exactamente lo que necesitas navegando por nuestras categorías
          especializadas de accesorios para motociclistas
        </p>
      </div>

      {/* Stats */}
      {totalCategories > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto">
          <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border border-primary/20 text-center">
            <div className="text-4xl font-bold text-primary mb-1">
              {totalCategories}
            </div>
            <div className="text-sm text-muted-foreground">
              Categorías disponibles
            </div>
          </div>
          <div className="p-6 bg-gradient-to-br from-secondary/30 to-secondary/10 rounded-lg border border-secondary/40 text-center">
            <div className="text-4xl font-bold text-secondary-foreground mb-1">
              {totalProducts}
            </div>
            <div className="text-sm text-muted-foreground">
              Productos totales
            </div>
          </div>
        </div>
      )}

      {/* Categories Grid */}
      {categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {categories.map((category: any, index: number) => {
            const gradient = gradients[index % gradients.length]
            const productCount = category.product_count || 0

            return (
              <Link
                key={category.id}
                href={`/categoria/${category.slug}`}
                className="group"
              >
                <Card className="h-full transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/50 hover:-translate-y-1">
                  <CardHeader className="pb-4">
                    <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${gradient} rounded-lg mb-4 text-white group-hover:scale-110 transition-transform duration-300`}>
                      {getCategoryIcon(category.name)}
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {category.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 min-h-[40px]">
                      {category.description || `Descubre nuestra selección de ${category.name.toLowerCase()}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="font-semibold">
                        {productCount} producto{productCount !== 1 ? 's' : ''}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      >
                        Ver productos →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-20 w-20 text-muted-foreground mb-6 opacity-50" />
          <h2 className="text-2xl md:text-3xl font-semibold mb-3">
            No hay categorías disponibles
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            En este momento no hay categorías configuradas. Por favor, vuelve más tarde.
          </p>
          <Button asChild size="lg">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      )}

      {/* Call to Action */}
      {categories && categories.length > 0 && (
        <div className="mt-12 p-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg border border-primary/20 text-center">
          <h2 className="text-2xl font-bold mb-3">
            ¿Prefieres ver todos los productos?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Explora nuestro catálogo completo con filtros avanzados para encontrar
            exactamente lo que necesitas
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="neon">
              <Link href="/productos">Ver todos los productos</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/ofertas">Ver ofertas especiales</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

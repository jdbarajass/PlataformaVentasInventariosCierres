'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, X, PackageSearch } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/products/product-card'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { Product } from '@/types/database'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

function BuscarContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQ = searchParams.get('q') || ''

  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setSearched(false)
      return
    }
    setIsLoading(true)
    setSearched(true)
    setSearchedQuery(trimmed)
    const { data } = await supabase
      .from('products')
      .select('*, product_variants(id, talla, stock_qty, active)')
      .eq('active', true)
      .or(`title.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
    setResults((data as Product[]) || [])
    setIsLoading(false)
  }, [])

  // Run search on mount if there's an initial query
  useEffect(() => {
    if (initialQ) doSearch(initialQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed) {
      router.push(`/buscar?q=${encodeURIComponent(trimmed)}`, { scroll: false })
      doSearch(trimmed)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setSearched(false)
    setSearchedQuery('')
    router.push('/buscar', { scroll: false })
  }

  const handleSuggestion = (term: string) => {
    setQuery(term)
    router.push(`/buscar?q=${encodeURIComponent(term)}`, { scroll: false })
    doSearch(term)
  }

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
            <BreadcrumbPage>Buscar</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
          <Search className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-2">Buscar productos</h1>
        <p className="text-muted-foreground">
          Encuentra cascos, guantes, chaquetas y más accesorios para tu moto
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Buscar productos... (ej: casco, guantes touring)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10 h-12 rounded-xl border-border/50 focus:border-primary text-base"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" className="h-12 px-6 rounded-xl" disabled={isLoading}>
            {isLoading ? 'Buscando...' : 'Buscar'}
          </Button>
        </div>
      </form>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          <p className="mt-4 text-muted-foreground">Buscando productos...</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && searched && (
        <div>
          <p className="text-sm text-muted-foreground mb-6">
            {results.length > 0
              ? `${results.length} resultado${results.length !== 1 ? 's' : ''} para "${searchedQuery}"`
              : `Sin resultados para "${searchedQuery}"`}
          </p>

          {results.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <PackageSearch className="h-16 w-16 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No encontramos resultados</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Intenta con otros términos o explora nuestro catálogo completo
              </p>
              <Button asChild>
                <a href="/productos">Ver todos los productos</a>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Initial state — suggestions */}
      {!searched && !isLoading && (
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-medium text-muted-foreground mb-4 text-center">
            Búsquedas populares
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Cascos', 'Guantes touring', 'Chaqueta moto', 'Protecciones', 'Accesorios'].map(
              (term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handleSuggestion(term)}
                  className="rounded-full border border-border/50 bg-card px-4 py-2 text-sm hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all cursor-pointer"
                >
                  {term}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BuscarPage() {
  return (
    <Suspense
      fallback={
        <div className="container py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
        </div>
      }
    >
      <BuscarContent />
    </Suspense>
  )
}

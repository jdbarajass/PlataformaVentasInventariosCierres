'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { X, SlidersHorizontal } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface Category {
  id: string
  name: string
  slug: string
  _count?: {
    products: number
  }
}

interface ProductFiltersProps {
  categories: Category[]
  maxPrice?: number
  minPrice?: number
}

export function ProductFilters({
  categories,
  maxPrice = 1000000, // 10,000 COP por defecto
  minPrice = 0,
}: ProductFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Estado local de filtros
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState<[number, number]>([
    minPrice,
    maxPrice,
  ])
  const [inStockOnly, setInStockOnly] = useState(false)
  const [sortBy, setSortBy] = useState<string>('newest')

  // Cargar filtros desde URL al montar
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    const minPriceParam = searchParams.get('minPrice')
    const maxPriceParam = searchParams.get('maxPrice')
    const inStockParam = searchParams.get('inStock')
    const sortByParam = searchParams.get('sortBy')

    if (categoryParam) {
      setSelectedCategories(categoryParam.split(','))
    }
    if (minPriceParam || maxPriceParam) {
      setPriceRange([
        minPriceParam ? parseInt(minPriceParam) : minPrice,
        maxPriceParam ? parseInt(maxPriceParam) : maxPrice,
      ])
    }
    if (inStockParam === 'true') {
      setInStockOnly(true)
    }
    if (sortByParam) {
      setSortBy(sortByParam)
    }
  }, [searchParams, minPrice, maxPrice])

  // Aplicar filtros (actualizar URL)
  const applyFilters = () => {
    const params = new URLSearchParams()

    if (selectedCategories.length > 0) {
      params.set('category', selectedCategories.join(','))
    }
    if (priceRange[0] > minPrice) {
      params.set('minPrice', priceRange[0].toString())
    }
    if (priceRange[1] < maxPrice) {
      params.set('maxPrice', priceRange[1].toString())
    }
    if (inStockOnly) {
      params.set('inStock', 'true')
    }
    if (sortBy && sortBy !== 'newest') {
      params.set('sortBy', sortBy)
    }

    router.push(`?${params.toString()}`)
  }

  // Limpiar filtros
  const clearFilters = () => {
    setSelectedCategories([])
    setPriceRange([minPrice, maxPrice])
    setInStockOnly(false)
    setSortBy('newest')
    router.push(window.location.pathname)
  }

  // Toggle categoría
  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  // Contar filtros activos
  const activeFiltersCount =
    selectedCategories.length +
    (priceRange[0] > minPrice || priceRange[1] < maxPrice ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0)

  // Contenido de filtros (reutilizable para desktop y mobile)
  const FiltersContent = () => (
    <div className="space-y-6">
      {/* Sort By */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Ordenar por</Label>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Más recientes</SelectItem>
            <SelectItem value="price_asc">Precio: Menor a Mayor</SelectItem>
            <SelectItem value="price_desc">Precio: Mayor a Menor</SelectItem>
            <SelectItem value="name">Nombre: A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Categories */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Categorías</Label>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center space-x-2">
              <Checkbox
                id={`category-${category.id}`}
                checked={selectedCategories.includes(category.id)}
                onCheckedChange={() => toggleCategory(category.id)}
              />
              <Label
                htmlFor={`category-${category.id}`}
                className="flex-1 text-sm font-normal cursor-pointer"
              >
                {category.name}
                {category._count && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({category._count.products})
                  </span>
                )}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Price Range */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Rango de Precio</Label>
        <div className="pt-2 pb-4">
          <Slider
            min={minPrice}
            max={maxPrice}
            step={10000}
            value={priceRange}
            onValueChange={(value) => setPriceRange(value as [number, number])}
            className="w-full"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{formatPrice(priceRange[0] * 100)}</span>
          <span className="text-muted-foreground">-</span>
          <span className="font-medium">{formatPrice(priceRange[1] * 100)}</span>
        </div>
      </div>

      <Separator />

      {/* Stock Availability */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="in-stock"
          checked={inStockOnly}
          onCheckedChange={(checked) => setInStockOnly(checked as boolean)}
        />
        <Label
          htmlFor="in-stock"
          className="text-sm font-normal cursor-pointer"
        >
          Solo productos en stock
        </Label>
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="space-y-2">
        <Button onClick={applyFilters} className="w-full" variant="neon">
          Aplicar Filtros
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
        {activeFiltersCount > 0 && (
          <Button
            onClick={clearFilters}
            variant="outline"
            className="w-full"
          >
            <X className="mr-2 h-4 w-4" />
            Limpiar Filtros
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <Card className="hidden lg:block sticky top-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="default">{activeFiltersCount}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FiltersContent />
        </CardContent>
      </Card>

      {/* Mobile Sheet */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full" size="lg">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="default" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtros de Productos</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FiltersContent />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

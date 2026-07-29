'use client'

import { GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompare } from '@/lib/compare-context'
import { useToast } from '@/components/ui/use-toast'
import { Product } from '@/types/database'
import { cn } from '@/lib/utils'

interface CompareButtonProps {
  product: Product
  variant?: 'icon' | 'full'
  className?: string
}

// La página /comparar y su contexto (compare-context.tsx) ya existían y
// funcionan, pero no había ningún botón en el sitio que agregara un
// producto a comparar — quedaba huérfano (mejora de la Fase 5, propuesta A.6).
export function CompareButton({ product, variant = 'icon', className }: CompareButtonProps) {
  const { addItem, removeItem, hasItem, isFull } = useCompare()
  const { toast } = useToast()
  const inCompare = hasItem(product.id)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (inCompare) {
      removeItem(product.id)
      toast({ title: 'Quitado de comparar', description: product.title })
      return
    }

    if (isFull) {
      toast({ title: 'Ya tienes 3 productos para comparar', description: 'Quita uno antes de agregar otro.', variant: 'destructive' })
      return
    }

    addItem(product)
    toast({ title: 'Agregado a comparar', description: product.title })
  }

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        className={cn('gap-2', className)}
      >
        <GitCompareArrows className={cn('h-4 w-4', inCompare && 'text-primary')} />
        {inCompare ? 'En comparación' : 'Comparar'}
      </Button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'rounded-full bg-background/80 p-2 backdrop-blur transition-all hover:bg-background hover:scale-110',
        className
      )}
      title={inCompare ? 'Quitar de comparar' : 'Agregar a comparar'}
    >
      <GitCompareArrows className={cn('h-4 w-4', inCompare ? 'text-primary' : 'text-muted-foreground')} />
    </button>
  )
}

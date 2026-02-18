'use client'

import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWishlist } from '@/lib/wishlist-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

interface WishlistButtonProps {
  productId: string
  productTitle: string
  variant?: 'icon' | 'full'
  className?: string
}

export function WishlistButton({ productId, productTitle, variant = 'icon', className }: WishlistButtonProps) {
  const { isInWishlist, toggleWishlist, isLoading } = useWishlist()
  const { toast } = useToast()
  const isFavorite = isInWishlist(productId)

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await toggleWishlist(productId)
    toast({
      title: isFavorite ? 'Eliminado de favoritos' : 'Agregado a favoritos',
      description: productTitle,
    })
  }

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={isLoading}
        className={cn('gap-2', className)}
      >
        <Heart className={cn('h-4 w-4', isFavorite && 'fill-red-500 text-red-500')} />
        {isFavorite ? 'En favoritos' : 'Agregar a favoritos'}
      </Button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'rounded-full bg-background/80 p-2 backdrop-blur transition-all hover:bg-background hover:scale-110',
        className
      )}
      title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <Heart className={cn('h-4 w-4', isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground')} />
    </button>
  )
}

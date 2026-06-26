'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ZoomIn, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface ProductImageGalleryProps {
  images: string[]
  title: string
  discountPct?: number
}

export function ProductImageGallery({ images, title, discountPct }: ProductImageGalleryProps) {
  const safeImages = images.length > 0 ? images : ['/images/placeholder.jpg']
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState(false)
  const current = safeImages[selected] ?? safeImages[0]

  const showPrev = () => setSelected((i) => (i - 1 + safeImages.length) % safeImages.length)
  const showNext = () => setSelected((i) => (i + 1) % safeImages.length)

  return (
    <div className="space-y-4">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-white dark:bg-secondary cursor-zoom-in"
            aria-label={`Ampliar imagen de ${title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current} alt={title} className="h-full w-full object-contain p-6" />

            {discountPct ? (
              <Badge variant="destructive" className="absolute left-4 top-4">
                -{discountPct}%
              </Badge>
            ) : null}

            <span className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ZoomIn className="h-4 w-4" />
            </span>
          </button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/90 backdrop-blur-sm',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
            )}
          />
          <Dialog.Content
            className={cn(
              'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-10',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
            )}
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>

            <Dialog.Close
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>

            {safeImages.length > 1 && (
              <button
                type="button"
                onClick={showPrev}
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current} alt={title} className="max-h-full max-w-full object-contain" />

            {safeImages.length > 1 && (
              <button
                type="button"
                onClick={showNext}
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                aria-label="Siguiente imagen"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {safeImages.length > 1 && (
        <div className="grid grid-cols-4 gap-4">
          {safeImages.slice(0, 4).map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setSelected(index)}
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl bg-white ring-2 transition-colors dark:bg-secondary',
                index === selected ? 'ring-primary' : 'ring-transparent hover:ring-primary/40'
              )}
              aria-label={`Ver imagen ${index + 1} de ${title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={`${title} - imagen ${index + 1}`} className="h-full w-full object-contain p-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, Loader2, ImageIcon, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabase'

function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
}

function ImagePreview({
  url,
  index,
  onRemove,
}: {
  url: string
  index: number
  onRemove: () => void
}) {
  const [hasError, setHasError] = useState(false)
  const isBroken = !isValidUrl(url) || hasError

  return (
    <Card className="group relative aspect-square overflow-hidden">
      {isBroken ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <span className="text-xs text-muted-foreground">Imagen rota</span>
        </div>
      ) : (
        <Image
          src={url}
          alt={`Imagen ${index + 1}`}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          onError={() => setHasError(true)}
        />
      )}

      {/* Badge de imagen principal */}
      {index === 0 && (
        <div className="absolute left-2 top-2 rounded-full bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
          Principal
        </div>
      )}

      {/* Botón eliminar */}
      <button
        type="button"
        onClick={onRemove}
        className={`absolute right-2 top-2 rounded-full bg-destructive p-1.5 text-destructive-foreground transition-opacity hover:bg-destructive/90 ${
          isBroken ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <X className="h-4 w-4" />
      </button>

      {/* Overlay hover */}
      <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
    </Card>
  )
}

export function ImageUploader({ images, onChange, maxImages = 5 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    await uploadFiles(files)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await uploadFiles(files)
  }

  const uploadFiles = async (files: File[]) => {
    if (images.length >= maxImages) {
      toast({
        title: 'Límite alcanzado',
        description: `Solo puedes subir un máximo de ${maxImages} imágenes`,
        variant: 'destructive',
      })
      return
    }

    const remainingSlots = maxImages - images.length
    const filesToUpload = files.slice(0, remainingSlots)

    // Validar tipos de archivo
    const validFiles = filesToUpload.filter((file) => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Tipo de archivo inválido',
          description: `${file.name} no es una imagen válida`,
          variant: 'destructive',
        })
        return false
      }
      // Validar tamaño (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Archivo muy grande',
          description: `${file.name} supera los 5MB`,
          variant: 'destructive',
        })
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    setUploading(true)

    try {
      const uploadPromises = validFiles.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        // Obtener token de autenticación
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Error al subir imagen')
        }

        const data = await response.json()
        return data.url
      })

      const urls = await Promise.all(uploadPromises)
      onChange([...images, ...urls])

      toast({
        title: 'Imágenes subidas',
        description: `${urls.length} imagen(es) subida(s) exitosamente`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Error uploading images:', error)
      toast({
        title: 'Error al subir',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async (index: number) => {
    const imageToRemove = images[index]

    // Extraer el path de la URL de Supabase
    // Formato típico: https://xxx.supabase.co/storage/v1/object/public/product-images/products/file.jpg
    const urlParts = imageToRemove.split('/product-images/')
    if (urlParts.length > 1) {
      const path = urlParts[1]

      try {
        // Obtener token de autenticación
        const {
          data: { session },
        } = await supabase.auth.getSession()

        // Intentar eliminar del storage (opcional, puede fallar si es imagen antigua)
        await fetch(`/api/upload?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        })
      } catch (error) {
        console.error('Error deleting from storage:', error)
        // No mostramos error al usuario, ya que igualmente removemos de la lista
      }
    }

    // Remover de la lista
    const newImages = images.filter((_, i) => i !== index)
    onChange(newImages)

    toast({
      title: 'Imagen eliminada',
      variant: 'success',
    })
  }

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card
        className={`relative border-2 border-dashed p-8 text-center transition-all ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          {uploading ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Subiendo imágenes...</p>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Arrastra imágenes aquí o{' '}
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="text-primary underline"
                  >
                    examina
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPG, PNG, WebP o GIF. Máximo 5MB por imagen.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {images.length} / {maxImages} imágenes
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {images.map((url, index) => (
            <ImagePreview
              key={`${url}-${index}`}
              url={url}
              index={index}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && !uploading && (
        <div className="rounded-lg border-2 border-dashed p-6 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No hay imágenes aún. Sube la primera imagen del producto.
          </p>
        </div>
      )}
    </div>
  )
}

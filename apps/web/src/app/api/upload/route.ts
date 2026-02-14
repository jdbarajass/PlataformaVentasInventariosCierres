// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import sharp from 'sharp'

export async function POST(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      )
    }

    // Validar que sea una imagen
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!validImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'El archivo debe ser una imagen (JPG, PNG, WebP o GIF)' },
        { status: 400 }
      )
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB en bytes
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'El archivo no debe superar 5MB' },
        { status: 400 }
      )
    }

    // Convertir File a ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    let buffer = Buffer.from(arrayBuffer)

    // Convertir automáticamente a WebP si es JPG/PNG (mejor compresión)
    let contentType = file.type
    let fileExt = file.name.split('.').pop()

    const shouldConvertToWebP = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)

    if (shouldConvertToWebP) {
      try {
        buffer = await sharp(buffer)
          .webp({ quality: 85 }) // Calidad optimizada: balance entre tamaño y calidad
          .toBuffer()

        contentType = 'image/webp'
        fileExt = 'webp'
      } catch (conversionError) {
        console.error('Error convirtiendo a WebP:', conversionError)
        // Si falla la conversión, continuar con el archivo original
      }
    }

    // Generar nombre único
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `products/${fileName}`

    // Subir a Supabase Storage
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, buffer, {
        contentType: contentType,
        cacheControl: '31536000', // 1 año de cache para imágenes optimizadas
        upsert: false,
      })

    if (error) {
      console.error('Error uploading to Supabase Storage:', error)
      return NextResponse.json(
        { error: 'Error al subir el archivo: ' + error.message },
        { status: 500 }
      )
    }

    // Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath)

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path: filePath,
      fileName: fileName,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE endpoint para eliminar imágenes
export async function DELETE(request: NextRequest) {
  try {
    // Validate authentication and role
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()

    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json(
        { error: 'No se proporcionó la ruta del archivo' },
        { status: 400 }
      )
    }

    // Eliminar de Supabase Storage
    const { error } = await supabase.storage
      .from('product-images')
      .remove([path])

    if (error) {
      console.error('Error deleting from Supabase Storage:', error)
      return NextResponse.json(
        { error: 'Error al eliminar el archivo: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Archivo eliminado exitosamente',
    })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

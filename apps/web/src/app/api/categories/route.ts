import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// GET - Listar categorías activas
export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { limit: 60, windowSeconds: 60 })
  if (rateLimited) return rateLimited

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return NextResponse.json(
        { error: 'Error al obtener categorías: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      categories: data,
      total: data.length,
    })
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

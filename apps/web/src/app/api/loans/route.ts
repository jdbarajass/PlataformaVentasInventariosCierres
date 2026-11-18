import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const loanSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  product_title: z.string().min(1, 'El producto es obligatorio'),
  warehouse: z.string().min(1, 'El almacén es obligatorio'),
  observations: z.string().optional().nullable(),
  // 'lent' (por defecto) = lo prestamos nosotros a otro almacén (lo que nos
  // deben); 'borrowed' = otro almacén nos lo prestó a nosotros (lo que
  // debemos) — ver migración 00052.
  direction: z.enum(['lent', 'borrowed']).default('lent'),
  // El software local permite elegir la fecha del préstamo (la hora siempre
  // se toma real al momento de registrar, ver ui/prestamos_panel.py). Si no
  // se envía, la base de datos usa NOW() como antes.
  created_at: z.string().datetime().optional(),
})

// GET - Listar préstamos, en ambos sentidos (filtros: status, direction)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const direction = searchParams.get('direction')

    const supabase = createAuthenticatedClient(auth.token)

    // sale_order: la venta que creó "Cobrar" (Nos deben) o "Lo vendí"
    // (Debemos), para mostrar su número en Préstamos.
    let query = supabase
      .from('loans')
      .select('*, sale_order:orders!loans_sale_order_id_fkey(order_number)')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status as 'pending' | 'returned' | 'charged')
    }
    if (direction) {
      query = query.eq('direction', direction as 'lent' | 'borrowed')
    }
    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching loans:', error)
    return NextResponse.json(
      { error: 'Error al obtener los préstamos' },
      { status: 500 }
    )
  }
}

// POST - Registrar un préstamo de producto a otro almacén
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)

    const body = await request.json()
    const validatedData = loanSchema.parse(body)

    // Prestar NO mueve el inventario (migración 00062): el producto sigue
    // siendo nuestro hasta que el otro local lo pague con "Cobrar", que es
    // la venta que sí lo descuenta. Mientras tanto Inventario avisa que hay
    // unidades prestadas para tenerlas en cuenta en el conteo.
    const { data: loan, error } = await supabase
      .from('loans')
      // @ts-ignore - Supabase type inference issue
      .insert(validatedData)
      .select()
      .single()

    if (error) {
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'loan_created',
      tableName: 'loans',
      recordId: (loan as any)?.id,
      newData: validatedData,
    })

    return NextResponse.json(loan, { status: 201 })
  } catch (error) {
    console.error('Error creating loan:', error)

    if (error instanceof Error && error.message.includes('Expected')) {
      return NextResponse.json(
        { error: 'Datos de validación inválidos' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Error al crear el préstamo' },
      { status: 500 }
    )
  }
}

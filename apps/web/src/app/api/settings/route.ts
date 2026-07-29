import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth, getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'

// Validación de rango 0-100% en comisiones y de montos no-negativos en
// gastos fijos — el local también valida esto (config_controller.py
// ._validar()), aunque de forma incompleta (solo Addi/Datafono/Transferencia).
// Aquí se valida de forma consistente para todos los métodos, en vez de
// replicar el hueco del local (sección 12.2 de la auditoría de fidelidad:
// "la nube no valida ningún rango... acepta cualquier número, incluso negativo").
const commissionRatesSchema = z.record(z.string(), z.number().min(0).max(100)).optional()
const fixedExpensesSchema = z
  .object({
    arriendo_cents: z.number().int().min(0),
    sueldo_cents: z.number().int().min(0),
    servicios_cents: z.number().int().min(0),
    otros_gastos_cents: z.number().int().min(0),
    dias_mes: z.number().int().min(1).max(31),
  })
  .optional()

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error) {
      throw error
    }

    // Esta ruta es pública a propósito (el checkout de un invitado la
    // llama sin sesión para leer shipping_config/payment_methods), pero
    // pos_commission_rates y fixed_monthly_expenses son datos internos del
    // negocio (comisiones reales, arriendo, sueldo, servicios) — solo se
    // devuelven si quien pide está autenticado como admin/seller.
    const auth = await getAuthenticatedUser(request)
    const isStaff = auth.success && ['admin', 'seller'].includes(auth.user.role)

    const responseData: Record<string, any> = { ...(data as any) }
    if (!isStaff) {
      delete responseData.pos_commission_rates
      delete responseData.fixed_monthly_expenses
    }

    return NextResponse.json({ data: responseData })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Error al obtener configuración' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const body = await request.json()

    if (body.pos_commission_rates !== undefined) {
      const validation = commissionRatesSchema.safeParse(body.pos_commission_rates)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Las comisiones deben estar entre 0 y 100%', details: validation.error.errors },
          { status: 400 }
        )
      }
    }
    if (body.fixed_monthly_expenses !== undefined) {
      const validation = fixedExpensesSchema.safeParse(body.fixed_monthly_expenses)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Gastos fijos inválidos (montos no pueden ser negativos, días del mes entre 1 y 31)', details: validation.error.errors },
          { status: 400 }
        )
      }
    }

    const supabase = getServiceSupabase()

    const updateData: Record<string, any> = {
      updated_by: auth.user.id,
    }

    // Only update fields that are provided
    const allowedFields = [
      'store_name',
      'store_description',
      'contact_info',
      'shipping_config',
      'tax_config',
      'payment_methods',
      'social_links',
      'branding',
      'pos_commission_rates',
      'fixed_monthly_expenses',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data, error } = await supabase
      .from('store_settings')
      .update(updateData)
      .eq('id', 1)
      .select()
      .single()

    if (error) {
      throw error
    }

    // Audit log
    await (supabase.from('audit_logs') as any).insert({
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      action: 'settings_updated',
      table_name: 'store_settings',
      record_id: '1',
      new_data: updateData,
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Error al actualizar configuración' },
      { status: 500 }
    )
  }
}

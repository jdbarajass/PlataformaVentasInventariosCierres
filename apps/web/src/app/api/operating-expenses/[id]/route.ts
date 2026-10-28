import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { checkSufficientBalance } from '@/lib/account-balance'
import { z } from 'zod'

const updateSchema = z.object({
  description: z.string().trim().min(1, 'La descripción es obligatoria'),
  amount_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  category: z.string().min(1, 'La categoría es obligatoria'),
  account_id: z.string().uuid().optional().nullable(),
})

// PATCH - Editar un gasto operativo (solo admin; el vendedor solo registra).
// Si solo cambian descripción/categoría, es un UPDATE directo (no toca dinero).
// Si cambia el monto o la cuenta, se reusa el mismo par de funciones atómicas
// que ya existen (sin migración nueva): delete_operating_expense revierte el
// débito original y record_operating_expense registra el gasto corregido,
// conservando su fecha y quién lo creó. Así el historial de la cuenta muestra
// la reversa y el débito nuevo, igual que si se hubiera borrado y rehecho.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const validation = updateSchema.safeParse(await request.json())
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      )
    }
    const { description, amount_cents, category } = validation.data
    const account_id = validation.data.account_id || null

    const supabase = getServiceSupabase()

    const { data: current, error: fetchError } = await supabase
      .from('operating_expenses')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!current) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    }

    const moneyChanged = current.amount_cents !== amount_cents || (current.account_id || null) !== account_id

    let updated: any
    if (!moneyChanged) {
      const { data, error } = await supabase
        .from('operating_expenses')
        .update({ description, category })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      updated = data
    } else {
      // Validar saldo ANTES de revertir: si la cuenta es la misma, la reversa
      // devuelve el monto original, así que solo hace falta cubrir la diferencia.
      if (account_id) {
        const sameAccount = current.account_id === account_id
        const debit = sameAccount ? amount_cents - current.amount_cents : amount_cents
        if (debit > 0) {
          const insufficient = await checkSufficientBalance(supabase, account_id, debit)
          if (insufficient) return insufficient
        }
      }

      const { error: deleteError } = await (supabase.rpc as any)('delete_operating_expense', {
        p_expense_id: id,
      })
      if (deleteError) throw deleteError

      const { data, error } = await (supabase.rpc as any)('record_operating_expense', {
        p_date: current.date,
        p_description: description,
        p_amount_cents: amount_cents,
        p_category: category,
        p_account_id: account_id,
        p_created_by: current.created_by,
      })
      if (error) {
        console.error('Gasto revertido pero no se pudo registrar la corrección:', { id, error })
        return NextResponse.json(
          { error: 'El gasto original se revirtió, pero no se pudo registrar la corrección. Regístralo de nuevo.' },
          { status: 500 }
        )
      }
      updated = data
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'operating_expense_updated',
      tableName: 'operating_expenses',
      recordId: updated?.id ?? id,
      oldData: {
        id: current.id, description: current.description, amount_cents: current.amount_cents,
        category: current.category, account_id: current.account_id,
      },
      newData: { description, amount_cents, category, account_id },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Error updating operating expense:', error)
    return NextResponse.json(
      { error: 'Error al editar el gasto' },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar un gasto operativo, revirtiendo el débito a su cuenta (si tenía).
// Solo admin: se usa desde Ventas del Día y Presupuesto.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = getServiceSupabase()
    const { error } = await (supabase.rpc as any)('delete_operating_expense', {
      p_expense_id: id,
    })

    if (error) {
      if (error.message?.includes('no encontrado')) {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      throw error
    }

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'operating_expense_deleted',
      tableName: 'operating_expenses',
      recordId: id,
    })

    return NextResponse.json({ message: 'Gasto eliminado exitosamente', id: id })
  } catch (error) {
    console.error('Error deleting operating expense:', error)
    return NextResponse.json(
      { error: 'Error al eliminar el gasto' },
      { status: 500 }
    )
  }
}

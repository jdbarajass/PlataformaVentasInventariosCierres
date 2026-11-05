import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { logAudit } from '@/lib/audit'
import { takeInventorySnapshot } from '@/lib/finance/inventory-value'

// POST /api/finance/inventory-snapshot
// Guarda a mano la foto del inventario del mes en curso (reemplaza la del
// mes si ya había). Solo admin; el de solo lectura recibe 403 en requireAuth.
// Lo normal es que la tome sola la tarea diaria /api/cron/inventory-snapshot.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin'])
    if (!auth.success) return auth.response

    const supabase = getServiceSupabase()
    const snapshot = await takeInventorySnapshot(supabase, { source: 'manual', userId: auth.user.id })

    await logAudit(supabase, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: 'inventory_snapshot_taken',
      tableName: 'inventory_snapshots',
      recordId: (snapshot as any)?.id,
      newData: { year: (snapshot as any)?.year, month: (snapshot as any)?.month, value_cents: (snapshot as any)?.value_cents },
    })

    return NextResponse.json({ data: snapshot })
  } catch (error: any) {
    console.error('Error taking inventory snapshot:', error)
    const missing = error?.code === '42P01' || error?.code === 'PGRST205'
    return NextResponse.json(
      { error: missing ? 'Falta correr la migración 00060_inventory_snapshots.sql en Supabase' : 'Error al guardar la foto del inventario' },
      { status: 500 }
    )
  }
}

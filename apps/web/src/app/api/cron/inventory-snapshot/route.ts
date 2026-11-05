import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { verifyCronRequest } from '@/lib/cron-auth'
import { takeInventorySnapshot } from '@/lib/finance/inventory-value'

// GET - Foto diaria del valor del inventario (docs/PLAN_CONTROL_FINANCIERO.md,
// Fase 3). Corre a las 11pm hora Bogotá (vercel.json, "0 4 * * *" UTC) y
// reemplaza la foto del mes en curso: la última del mes queda como el
// inventario de cierre. Idempotente: correrla dos veces el mismo día solo
// actualiza el valor.
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request)
  if (authError) return authError

  try {
    const snapshot = await takeInventorySnapshot(getServiceSupabase(), { source: 'cron' })
    return NextResponse.json({ success: true, snapshot })
  } catch (error) {
    console.error('Error taking inventory snapshot (cron):', error)
    return NextResponse.json({ error: 'Error al guardar la foto del inventario' }, { status: 500 })
  }
}

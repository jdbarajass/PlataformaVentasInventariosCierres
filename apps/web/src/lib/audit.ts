import type { SupabaseClient } from '@supabase/supabase-js'

interface LogAuditParams {
  actorId?: string | null
  actorEmail?: string | null
  action: string
  tableName: string
  recordId?: string | null
  oldData?: unknown
  newData?: unknown
}

/**
 * Registra una entrada en audit_logs — mejora de la Fase 5 (propuesta A.4):
 * Registrar Venta, Facturas, Fiado, Préstamos, Notas, Presupuesto y Cuentas
 * no dejaban ningún rastro en Auditoría pese a que la tabla y la UI ya
 * existían. No lanza si falla (un error de auditoría nunca debe tumbar la
 * operación real que la disparó).
 */
export async function logAudit(supabase: SupabaseClient, params: LogAuditParams): Promise<void> {
  try {
    await (supabase.from('audit_logs') as any).insert({
      actor_id: params.actorId ?? null,
      actor_email: params.actorEmail ?? null,
      action: params.action,
      table_name: params.tableName,
      record_id: params.recordId ?? null,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    })
  } catch (err) {
    console.error('[audit_logs] Error registrando auditoría:', err)
  }
}

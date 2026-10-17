import { NextResponse } from 'next/server'
import type { getServiceSupabase } from '@/lib/supabase'

const formatCOP = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

// No dejar una cuenta en negativo: las funciones SQL que debitan
// (pay_supplier_invoice, record_operating_expense, adjust_account_balance)
// restan sin validar, así que cada ruta que debita llama esto antes.
// Devuelve la respuesta de error lista para retornar, o null si alcanza.
export async function checkSufficientBalance(
  supabase: ReturnType<typeof getServiceSupabase>,
  accountId: string,
  debitCents: number
): Promise<NextResponse | null> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('name, balance_cents')
    .eq('id', accountId)
    .single()

  if (error || !account) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  }

  if (account.balance_cents < debitCents) {
    return NextResponse.json(
      {
        error: `Saldo insuficiente en ${account.name}: tiene ${formatCOP(account.balance_cents)} y se intenta descontar ${formatCOP(debitCents)}`,
      },
      { status: 400 }
    )
  }

  return null
}

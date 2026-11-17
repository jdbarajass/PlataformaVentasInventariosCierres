// 4x1000 (GMF) de los gastos operativos — pedido del usuario 2026-11-17,
// igual que en KOAJ. Si el gasto sale de una cuenta que no es efectivo, el
// banco cobra además el 4x1000 sobre el valor. Efectivo o "sin cuenta" no
// pagan 4x1000.
//
// Misma fórmula que record_operating_expense
// (supabase/migrations/00061_expense_gmf_notes.sql): la BD es la que de verdad
// lo cobra; esto sirve para mostrarlo antes de guardar y para validar saldo.

/** 4x1000 de un valor en centavos, redondeado al peso. */
export function gmfOf(amountCents: number): number {
  if (!(amountCents > 0)) return 0
  return Math.round((amountCents * 4) / 1000 / 100) * 100
}

/** true si la cuenta paga 4x1000 (cualquier cuenta que no sea efectivo). */
export function accountPaysGmf(paymentMethod: string | null | undefined): boolean {
  return !!paymentMethod && paymentMethod !== 'cash'
}

/**
 * 4x1000 que cobra un gasto. `paymentMethod` es el de la cuenta de donde sale
 * (null = sin cuenta, no mueve plata); `apply` es la casilla "cobrar 4x1000".
 */
export function expenseGmfCents(amountCents: number, paymentMethod: string | null | undefined, apply: boolean): number {
  return apply && accountPaysGmf(paymentMethod) ? gmfOf(amountCents) : 0
}

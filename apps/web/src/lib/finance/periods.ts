// Límites de un mes en hora de Bogotá (docs/PLAN_CONTROL_FINANCIERO.md).
import { bogotaDateStr, bogotaToISO } from '@/lib/bogota-time'

export interface MonthPeriod {
  year: number
  month: number
  /** Inicio del mes como timestamp ISO (para orders.created_at). */
  fromISO: string
  /** Inicio del mes siguiente (exclusivo). */
  toISO: string
  /** 'YYYY-MM-01' (para columnas DATE como operating_expenses.date). */
  fromDate: string
  /** Primer día del mes siguiente (exclusivo). */
  toDate: string
  daysInMonth: number
  /** Días transcurridos a hoy (0 si es futuro, daysInMonth si ya pasó). */
  daysElapsed: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Normaliza (year, month) aunque month se salga de 1..12 (ej. 0 = diciembre del año anterior). */
export function shiftMonth(year: number, month: number, delta = 0): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function monthPeriod(year: number, month: number, now: Date = new Date()): MonthPeriod {
  const cur = shiftMonth(year, month)
  const next = shiftMonth(cur.year, cur.month, 1)
  const fromDate = `${cur.year}-${pad(cur.month)}-01`
  const toDate = `${next.year}-${pad(next.month)}-01`
  const daysInMonth = new Date(Date.UTC(cur.year, cur.month, 0)).getUTCDate()

  const today = bogotaDateStr(now)
  let daysElapsed: number
  if (today < fromDate) daysElapsed = 0
  else if (today >= toDate) daysElapsed = daysInMonth
  else daysElapsed = Number(today.slice(8, 10))

  return {
    year: cur.year,
    month: cur.month,
    fromISO: bogotaToISO(fromDate, '00:00'),
    toISO: bogotaToISO(toDate, '00:00'),
    fromDate,
    toDate,
    daysInMonth,
    daysElapsed,
  }
}

/**
 * Recorta un periodo a sus primeros `days` días (para comparar un mes en curso
 * contra los mismos días de otro mes). Si `days` cubre el mes, lo deja igual.
 */
export function truncatePeriod(p: MonthPeriod, days: number): MonthPeriod {
  if (days >= p.daysInMonth) return p
  const d = Math.max(days, 0)
  const end = new Date(Date.UTC(p.year, p.month - 1, 1 + d))
  const toDate = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`
  return { ...p, toDate, toISO: bogotaToISO(toDate, '00:00'), daysInMonth: p.daysInMonth, daysElapsed: Math.min(p.daysElapsed, d) }
}

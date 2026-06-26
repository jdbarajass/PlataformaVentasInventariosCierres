import { NextRequest, NextResponse } from 'next/server'
import { getSalesSummary } from '@/lib/alegra'
import {
  calcularCierreCompleto,
  procesarExcedentes,
  procesarDesfases,
  calcularMetodosPago,
  validarCierre,
} from '@/lib/cash-calculator-alegra'
import { requireAlegraAdmin } from '@/lib/alegra-auth'

// POST — Procesar cierre completo con validación Alegra
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAlegraAdmin()
    if (!auth.success) return auth.response
    const { session } = auth

    const payload = await request.json()
    const {
      date,
      monedas = {},
      billetes = {},
      excedentes = [],
      gastos_operativos = 0,
      gastos_operativos_nota = '',
      prestamos = 0,
      prestamos_nota = '',
      desfases = [],
      metodos_pago = {},
    } = payload

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'La fecha es requerida' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { success: false, error: 'Formato de fecha inválido (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // 1. Obtener datos de Alegra
    const datosAlegra = await getSalesSummary(date)

    // 2. Procesar excedentes
    const excedentesProcessados = procesarExcedentes(excedentes)

    // 3. Procesar desfases
    const desfasesProcessados = procesarDesfases(desfases)

    // 4. Calcular cierre de caja (Knapsack)
    const cashResult = calcularCierreCompleto({
      monedas: Object.fromEntries(
        Object.entries(monedas).map(([k, v]) => [parseInt(k), parseInt(String(v))])
      ),
      billetes: Object.fromEntries(
        Object.entries(billetes).map(([k, v]) => [parseInt(k), parseInt(String(v))])
      ),
      excedente: excedentesProcessados.excedente_efectivo,
      gastosOperativos: gastos_operativos,
      prestamos,
      desfases: desfasesProcessados.total_desfase,
    })

    // 5. Calcular métodos de pago
    const metodosPagoCalculados = calcularMetodosPago(metodos_pago, excedentesProcessados)

    // 6. Validar cierre contra Alegra
    const validacion = validarCierre({
      datosAlegra: datosAlegra as { results: Record<string, { total: number }> },
      metodosPagoCalculados: metodosPagoCalculados as Record<string, number>,
      cashResult,
      excedentesProcessados,
      gastosOperativos: gastos_operativos,
      prestamos,
      desfasesProcessados,
    })

    return NextResponse.json({
      success: true,
      request_date: date,
      username_used: session.user.email,
      alegra: datosAlegra,
      cash_count: cashResult,
      excedentes_detalle: excedentesProcessados.excedentes_detalle,
      gastos_operativos_nota,
      prestamos_nota,
      desfases_detalle: desfasesProcessados.desfases_detalle,
      metodos_pago_registrados: metodosPagoCalculados,
      validation: validacion,
    })
  } catch (error) {
    console.error('[Alegra Cierre POST]', error)
    const message = error instanceof Error ? error.message : 'Error procesando el cierre'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET — Pre-consulta: ver ventas de Alegra para una fecha
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlegraAdmin()
    if (!auth.success) return auth.response

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'La fecha es requerida' },
        { status: 400 }
      )
    }

    const datosAlegra = await getSalesSummary(date)
    return NextResponse.json({ success: true, alegra: datosAlegra })
  } catch (error) {
    console.error('[Alegra Cierre GET]', error)
    const message = error instanceof Error ? error.message : 'Error consultando Alegra'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

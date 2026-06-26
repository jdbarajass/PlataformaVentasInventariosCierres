import { NextRequest, NextResponse } from 'next/server'
import { getMonthlySalesSummary, getSalesComparisonYoY } from '@/lib/alegra'
import { requireAlegraAdmin } from '@/lib/alegra-auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlegraAdmin()
    if (!auth.success) return auth.response

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const type = searchParams.get('type') || 'monthly'

    if (type === 'yoy') {
      const date = searchParams.get('date')
      if (!date) {
        return NextResponse.json(
          { success: false, error: 'La fecha es requerida' },
          { status: 400 }
        )
      }
      const data = await getSalesComparisonYoY(date)
      return NextResponse.json({ success: true, ...data })
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Fechas requeridas (start_date, end_date)' },
        { status: 400 }
      )
    }

    const data = await getMonthlySalesSummary(startDate, endDate)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('[Alegra Ventas Mensuales]', error)
    const message = error instanceof Error ? error.message : 'Error consultando ventas'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

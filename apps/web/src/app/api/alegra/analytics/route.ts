import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsDashboard } from '@/lib/alegra-analytics'
import { requireAlegraAdmin } from '@/lib/alegra-auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlegraAdmin()
    if (!auth.success) return auth.response

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Fechas requeridas (start_date, end_date)' },
        { status: 400 }
      )
    }

    const data = await getAnalyticsDashboard(startDate, endDate)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('[Alegra Analytics]', error)
    const message = error instanceof Error ? error.message : 'Error consultando analíticas'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

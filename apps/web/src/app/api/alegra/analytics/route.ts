import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getAnalyticsDashboard } from '@/lib/alegra-analytics'
import type { Database } from '@/types/database'

async function getSession() {
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore })
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
    }

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

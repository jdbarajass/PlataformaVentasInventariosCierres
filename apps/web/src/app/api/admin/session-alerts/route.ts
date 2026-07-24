import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth-helpers'
import { bogotaDateStr } from '@/lib/bogota-time'

// GET - Recordatorios al iniciar sesión: facturas por vencer (≤7 días),
// notas con fecha límite próxima (≤3 días) y fiados con más de 30 días
// pendientes — mismo contenido que el popup del software local al arrancar
// (ui/main_window.py: _alertar_facturas_vencimiento). Se muestra una vez
// por sesión de navegador (el cliente lo controla con sessionStorage).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['admin', 'seller'])
    if (!auth.success) {
      return auth.response
    }

    const supabase = createAuthenticatedClient(auth.token)
    // Ruta server-side (corre en UTC en Vercel) — se usa el día de Bogotá
    // explícito, no `toISOString().split('T')[0]` (fecha UTC del servidor).
    const today = new Date()
    const in7Days = bogotaDateStr(new Date(today.getTime() + 7 * 86_400_000))
    const in3Days = bogotaDateStr(new Date(today.getTime() + 3 * 86_400_000))

    const { data: invoicesData } = await supabase
      .from('supplier_invoices')
      .select('description, due_date')
      .eq('status', 'pending')
      .not('due_date', 'is', null)
      .lte('due_date', in7Days)
      .order('due_date', { ascending: true })
      .limit(8)

    const { data: notesData } = await supabase
      .from('notes')
      .select('text, due_date')
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', in3Days)
      .order('due_date', { ascending: true })
      .limit(6)

    const { data: creditsData } = await supabase
      .from('customer_credits')
      .select('customer_name, created_at')
      .eq('status', 'pending')

    const invoices = ((invoicesData || []) as { description: string; due_date: string }[]).map((f) => {
      const days = Math.round((new Date(f.due_date).getTime() - today.getTime()) / 86_400_000)
      return { description: f.description, days }
    })

    const notes = ((notesData || []) as { text: string; due_date: string }[]).map((n) => ({
      text: n.text,
      dueDate: n.due_date,
    }))

    const oldCredits = ((creditsData || []) as { customer_name: string; created_at: string }[])
      .map((c) => ({
        customerName: c.customer_name,
        daysOld: Math.floor((today.getTime() - new Date(c.created_at).getTime()) / 86_400_000),
      }))
      .filter((c) => c.daysOld > 30)
      .sort((a, b) => b.daysOld - a.daysOld)
      .slice(0, 6)

    return NextResponse.json({
      data: {
        invoices: { count: invoices.length, items: invoices },
        notes: { count: notes.length, items: notes },
        credits: { count: oldCredits.length, items: oldCredits },
      },
    })
  } catch (error) {
    console.error('Error fetching session alerts:', error)
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}

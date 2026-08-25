'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Printer, TrendingUp, Package, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { supabaseBrowser as supabase, withTimeout } from '@/lib/supabase-browser'
import { bogotaDateStr, bogotaHour, bogotaToISO } from '@/lib/bogota-time'

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface OrderRow {
  id: string
  total_cents: number
  created_at: string
  order_items: { product_id: string; product_title: string; qty: number; total_cents: number; cost_cents: number }[]
  payments: { method: string; amount_cents: number; commission_cents: number }[]
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo', transfer: 'Transferencia', wallet: 'Billetera',
  nequi: 'Nequi', nu: 'NU', qr: 'QR/Bancolombia', daviplata: 'Daviplata',
  addi: 'Addi', card: 'Datáfono', sistecredito: 'SisteCrédito', other: 'Otro',
}

function firstDayISO(year: number, month: number) {
  const y = month > 12 ? year + 1 : year
  const m = ((month - 1) % 12) + 1
  return bogotaToISO(`${y}-${String(m).padStart(2, '0')}-01`, '00:00')
}

async function fetchMonthOrders(year: number, month: number) {
  // Límites explícitos en hora de Bogotá (no `new Date(year, month-1, 1)`
  // + `.toISOString()`, que depende de que el dispositivo esté configurado
  // en hora de Colombia para dar el límite correcto).
  const from = firstDayISO(year, month)
  const to = firstDayISO(year, month + 1)
  const { data } = await supabase
    .from('orders')
    .select('id, total_cents, created_at, order_items(product_id, product_title, qty, total_cents, cost_cents), payments(method, amount_cents, commission_cents)')
    .eq('payment_status', 'paid')
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: true })
  return (data as unknown as OrderRow[]) || []
}

export default function HistorialMensualPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [prevRevenue, setPrevRevenue] = useState(0)
  const [prevProfit, setPrevProfit] = useState(0)
  const [totalOperatingExpenses, setTotalOperatingExpenses] = useState(0)
  const [fixedMonthlyTotal, setFixedMonthlyTotal] = useState(0)
  // Desglose de gastos fijos (Arriendo/Sueldo/Servicios/Otros) — igual que
  // Configuración > Comisiones y Gastos Fijos, necesario para la sección
  // "Desglose de Gastos del Mes" del PDF exportado (igual que _tabla_gastos
  // del software local, ver docs/UNIFICACION_YJBMOTOCOM.md sección 27).
  const [fixedBreakdown, setFixedBreakdown] = useState({ arriendo: 0, sueldo: 0, servicios: 0, otros: 0 })
  const [diasMes, setDiasMes] = useState(30)
  const [expensesByDay, setExpensesByDay] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { userProfile } = useAuth()
  const canViewProfit = userProfile?.role === 'admin' || userProfile?.role === 'admin_readonly'

  // Todo el fetch va envuelto en un límite de tiempo único: supabaseBrowser
  // puede colgarse indefinidamente al refrescar la sesión tras un rato de
  // inactividad de la pestaña (ver comentario en lib/supabase-browser.ts).
  // Sin esto, el spinner se queda girando para siempre y solo se recupera
  // recargando la página o volviendo a iniciar sesión — reportado por el
  // usuario en producción.
  const fetchMonth = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const run = async () => {
      const data = await fetchMonthOrders(year, month)
      setOrders(data)

      // Mes anterior, para la comparativa (misma fuente, solo revenue/ganancia).
      const prevMonthDate = new Date(year, month - 2, 1)
      const prevData = await fetchMonthOrders(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1)
      const pRevenue = prevData.reduce((sum, o) => sum + o.total_cents, 0)
      const pCost = prevData.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0), 0)
      setPrevRevenue(pRevenue)
      setPrevProfit(pRevenue - pCost)

      if (canViewProfit) {
        // operating_expenses.date es DATE (sin hora/zona horaria) — se
        // construye el string directamente, sin pasar por Date/toISOString,
        // que sí dependen de la zona horaria del dispositivo.
        const nextMonthDate = new Date(year, month, 1)
        const from = `${year}-${String(month).padStart(2, '0')}-01`
        const to = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`
        const { data: expensesData } = await supabase
          .from('operating_expenses')
          .select('amount_cents, date')
          .gte('date', from)
          .lt('date', to)
        const expensesRows = (expensesData as { amount_cents: number; date: string }[]) || []
        setTotalOperatingExpenses(expensesRows.reduce((sum, e) => sum + e.amount_cents, 0))
        setExpensesByDay(
          expensesRows.reduce<Record<string, number>>((acc, e) => {
            acc[e.date] = (acc[e.date] || 0) + e.amount_cents
            return acc
          }, {})
        )

        const { data: settingsData } = await supabase
          .from('store_settings')
          .select('fixed_monthly_expenses')
          .eq('id', 1)
          .single()
        const fixed = (settingsData as any)?.fixed_monthly_expenses
        setFixedMonthlyTotal(
          fixed ? fixed.arriendo_cents + fixed.sueldo_cents + fixed.servicios_cents + fixed.otros_gastos_cents : 0
        )
        setFixedBreakdown({
          arriendo: fixed?.arriendo_cents || 0,
          sueldo: fixed?.sueldo_cents || 0,
          servicios: fixed?.servicios_cents || 0,
          otros: fixed?.otros_gastos_cents || 0,
        })
        setDiasMes(fixed?.dias_mes || 30)
      }
    }

    try {
      await withTimeout(run(), 12000, 'Historial Mensual')
    } catch (error) {
      console.error('Error loading historial mensual:', error)
      setLoadError('No se pudo cargar el historial. Puede ser un problema temporal de la sesión — intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [year, month, canViewProfit])

  useEffect(() => { fetchMonth() }, [fetchMonth])

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(cents / 100)

  const totalRevenue = orders.reduce((sum, o) => sum + o.total_cents, 0)
  const totalOrders = orders.length
  const totalUnits = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty, 0), 0)
  const totalCost = orders.reduce((sum, o) => sum + (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0), 0)
  const totalCommission = orders.reduce((sum, o) => sum + (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0), 0)
  const grossProfit = totalRevenue - totalCost

  // Desglose de comisión por método de pago — igual que el local
  // (_panel_comisiones en ui/historial_panel.py), que no se limitaba al total.
  const commissionByMethod = orders.reduce<Record<string, number>>((acc, o) => {
    (o.payments || []).forEach((p) => {
      if (p.commission_cents > 0) acc[p.method] = (acc[p.method] || 0) + p.commission_cents
    })
    return acc
  }, {})

  // Utilidad Real: igual fórmula que Reportes (sección 13.2 / 4.2.1) — el
  // gasto fijo mensual se resta completo, sin prorratear.
  const utilidadReal = grossProfit - totalOperatingExpenses - fixedMonthlyTotal

  // Comparativa vs. mes anterior.
  const revenueDeltaPct = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null
  const profitDeltaPct = prevProfit !== 0 ? ((grossProfit - prevProfit) / Math.abs(prevProfit)) * 100 : null

  // Utilidad Real POR DÍA (distinta de la del mes): el gasto fijo mensual se
  // prorratea (÷ días del mes) y se le suma el gasto operativo puntual de
  // ESE día — misma fórmula que Ventas del Día y que calcular_resumen_diario
  // del software local (ver docs/UNIFICACION_YJBMOTOCOM.md sección 13.2).
  // Los días que solo tuvieron gastos (sin ventas) también cuentan, igual
  // que el local (todas_fechas = ventas ∪ gastos_por_dia.keys()).
  const dailyFixedExpense = fixedMonthlyTotal / diasMes
  const dailyMap = orders.reduce<Record<string, { revenue: number; cost: number; commission: number; units: number }>>((acc, o) => {
    // Día de Bogotá, no el día UTC crudo de `created_at.split('T')[0]` —
    // una venta hecha entre 7pm y medianoche en Colombia ya cae en el día
    // UTC siguiente, lo que la habría atribuido al día equivocado aquí.
    const day = bogotaDateStr(new Date(o.created_at))
    if (!acc[day]) acc[day] = { revenue: 0, cost: 0, commission: 0, units: 0 }
    acc[day].revenue += o.total_cents
    acc[day].cost += (o.order_items || []).reduce((s, i) => s + i.qty * (i.cost_cents || 0), 0)
    acc[day].commission += (o.payments || []).reduce((s, p) => s + (p.commission_cents || 0), 0)
    // "Ventas" en el resumen por día son UNIDADES vendidas ese día, no
    // número de facturas — igual que cantidad_ventas del software local
    // (suma v.cantidad, y cada "venta" ahí es un renglón de producto, no
    // una transacción completa), consistente con "Unidades vendidas" del
    // total del mes.
    acc[day].units += (o.order_items || []).reduce((s, i) => s + i.qty, 0)
    return acc
  }, {})
  for (const day of Object.keys(expensesByDay)) {
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, cost: 0, commission: 0, units: 0 }
  }
  // Días sin NINGUNA actividad (ni ventas ni gastos) no quedaban en
  // `dailyMap` en absoluto — simplemente desaparecían de la lista, en vez
  // de mostrarse como "no hubo venta ese día" (que puede ser porque no se
  // abrió, o porque el día estuvo difícil y no se vendió nada). Se rellena
  // cada día del mes hasta hoy (en hora de Bogotá) — nunca días futuros,
  // que obviamente aún no han pasado.
  const todayBogota = bogotaDateStr(new Date())
  const diasEnElMes = new Date(year, month, 0).getDate()
  for (let dia = 1; dia <= diasEnElMes; dia++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (dayStr > todayBogota) break
    if (!dailyMap[dayStr]) dailyMap[dayStr] = { revenue: 0, cost: 0, commission: 0, units: 0 }
  }
  const dailyArray = Object.entries(dailyMap)
    .map(([day, d]) => {
      const gastosDia = expensesByDay[day] || 0
      // Ganancia neta del día (ingresos - costo - comisión) — distinta de
      // utilidadRealDia, que además prorratea el gasto fijo mensual y resta
      // los gastos operativos puntuales de ese día (igual que ResumenDiario
      // del software local: ganancia_neta vs. utilidad_real).
      const gananciaNeta = d.revenue - d.cost - d.commission
      const utilidadRealDia = canViewProfit ? gananciaNeta - dailyFixedExpense - gastosDia : d.revenue - d.cost
      // "Sin venta": no se vendió NADA ese día (pudo no abrirse, o el día
      // estuvo difícil) — distinto de un día con ventas que dio pérdida.
      const sinVenta = d.units === 0
      return { day, ...d, gastosDia, gananciaNeta, utilidadRealDia, sinVenta }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
  const maxDaily = Math.max(...dailyArray.map((d) => d.revenue), 1)
  // "Días trabajados"/positivos/negativos se cuentan solo sobre días con
  // ventas reales — los días sin venta van aparte, no se mezclan con
  // "negativo" (que implica que sí se vendió pero hubo pérdida).
  const diasConVenta = dailyArray.filter((d) => !d.sinVenta)
  const positiveDays = diasConVenta.filter((d) => d.utilidadRealDia >= 0).length
  const negativeDays = diasConVenta.filter((d) => d.utilidadRealDia < 0).length
  const noSalesDays = dailyArray.length - diasConVenta.length
  const diaMasRentable = diasConVenta.length > 0 ? diasConVenta.reduce((a, b) => (b.gananciaNeta > a.gananciaNeta ? b : a)) : null
  // Solo para la lista "Ventas por día" en pantalla: el día más reciente
  // primero, para no tener que hacer scroll hasta el final del mes para
  // ver hoy — el orden ascendente de `dailyArray` se deja intacto porque
  // el reporte PDF (gráficas, "últimos 7 días") depende de esa dirección.
  const dailyArrayDesc = [...dailyArray].reverse()

  const productMap = orders.reduce<Record<string, { title: string; qty: number; revenue: number; cost: number }>>((acc, o) => {
    (o.order_items || []).forEach((item) => {
      // Items sin product_id (productos historicos que ya no existen en el
      // catalogo) no se agrupan aqui: al no tener un id real, todos caerian
      // en la misma clave y se sumarian entre si bajo un titulo cualquiera.
      if (!item.product_id) return
      if (!acc[item.product_id]) acc[item.product_id] = { title: item.product_title, qty: 0, revenue: 0, cost: 0 }
      acc[item.product_id].qty += item.qty
      acc[item.product_id].revenue += item.total_cents
      acc[item.product_id].cost += item.qty * (item.cost_cents || 0)
    })
    return acc
  }, {})
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  const mostProfitableProducts = Object.values(productMap)
    .map((p) => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)

  // Categoría inferida de la primera palabra del nombre (quitando "-T:talla"
  // si viniera) — igual que _categoria del software local y que
  // inferCategoria del módulo Inventario.
  const inferCategoria = (title: string) => {
    const limpio = title.replace(/\s*-T:\S*/gi, '').trim()
    return limpio ? limpio.split(/\s+/)[0].toUpperCase() : 'OTRO'
  }

  // Método de pago dominante por transacción: si la orden tiene más de un
  // método (pago combinado) cuenta como "Combinado" en bloque — igual que
  // v.metodo_pago = "Combinado" del software local (no se reparte por
  // componente, ver models/venta.py) — a diferencia del desglose granular
  // de "Por método de pago" en Ventas del Día, que sí separa cada componente.
  const dominantMethod = (o: OrderRow) => {
    const methods = new Set((o.payments || []).map((p) => p.method))
    if (methods.size === 0) return 'Sin método'
    if (methods.size > 1) return 'Combinado'
    return methodLabels[[...methods][0]] || [...methods][0]
  }
  const revenueByMethod = orders.reduce<Record<string, number>>((acc, o) => {
    const m = dominantMethod(o)
    acc[m] = (acc[m] || 0) + o.total_cents
    return acc
  }, {})
  const unitsByMethod = orders.reduce<Record<string, number>>((acc, o) => {
    const m = dominantMethod(o)
    const qty = (o.order_items || []).reduce((s, i) => s + i.qty, 0)
    acc[m] = (acc[m] || 0) + qty
    return acc
  }, {})
  const unitsByCategory = orders.reduce<Record<string, number>>((acc, o) => {
    (o.order_items || []).forEach((item) => {
      const cat = inferCategoria(item.product_title)
      acc[cat] = (acc[cat] || 0) + item.qty
    })
    return acc
  }, {})
  const commissionCountByMethod = orders.reduce<Record<string, number>>((acc, o) => {
    (o.payments || []).forEach((p) => {
      if (p.commission_cents > 0) acc[p.method] = (acc[p.method] || 0) + 1
    })
    return acc
  }, {})
  const metodoMasUsado = Object.entries(unitsByMethod).sort((a, b) => b[1] - a[1])[0] || null
  const categoriaTop = Object.entries(unitsByCategory).sort((a, b) => b[1] - a[1])[0] || null
  const ticketPromedio = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Horas pico: franjas de 2h de 6am a 22pm, sumando unidades e ingresos de
  // cada orden en la franja de su hora de creación — igual que
  // _tabla_horas_pico del software local (allí agrupa por v.hora en vez de
  // created_at, pero el resultado es equivalente). bogotaHour() usa la hora
  // explícita de Bogotá, no `Date.getHours()` (que depende de la zona
  // horaria del dispositivo/servidor) — mismo cuidado que se tuvo con
  // Préstamos, para que la franja horaria no varíe según la configuración
  // del equipo desde el que se genera el reporte.
  const peakHourSlots: [number, number][] = [[6, 8], [8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20], [20, 22]]
  const hourlyMap = orders.reduce<Record<number, { units: number; revenue: number }>>((acc, o) => {
    const h = bogotaHour(o.created_at)
    if (!acc[h]) acc[h] = { units: 0, revenue: 0 }
    acc[h].units += (o.order_items || []).reduce((s, i) => s + i.qty, 0)
    acc[h].revenue += o.total_cents
    return acc
  }, {})
  const peakHours = peakHourSlots.map(([hIni, hFin]) => {
    let units = 0
    let revenue = 0
    for (let h = hIni; h < hFin; h++) {
      units += hourlyMap[h]?.units || 0
      revenue += hourlyMap[h]?.revenue || 0
    }
    return { label: `${String(hIni).padStart(2, '0')}:00 – ${String(hFin).padStart(2, '0')}:00`, units, revenue }
  })
  const totalPeakUnits = peakHours.reduce((s, h) => s + h.units, 0) || 1

  const handlePrint = async () => {
    // La ventana se abre de inmediato (dentro del mismo gesto de clic) para
    // que el bloqueador de pop-ups del navegador no la descarte — el
    // contenido final se escribe después, cuando termine el fetch async.
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write('<p style="font-family:Arial,sans-serif;padding:40px;color:#6B7280;">Generando reporte…</p>')

    setExporting(true)
    try {
      // Inventario General (Stock Actual): se trae solo al exportar (no en
      // cada carga de la página) — mismo query que fetchCategoryRollup del
      // módulo Inventario (products + product_variants, agrupado por
      // categoría explícita o inferida del nombre).
      let categoryGroups: { categoria: string; refs: number; uds: number; valor: number }[] = []
      if (canViewProfit) {
        const [{ data: allProducts }, { data: allVariants }] = await withTimeout(
          Promise.all([
            supabase.from('products').select('id, title, cost_cents, stock_qty, categories(name)'),
            supabase.from('product_variants').select('product_id, cost_cents, stock_qty'),
          ]),
          12000,
          'Inventario del reporte'
        )
        const variantsByProduct = new Map<string, { stock_qty: number; cost_cents: number }[]>()
        for (const v of (allVariants || []) as any[]) {
          const list = variantsByProduct.get(v.product_id) || []
          list.push(v)
          variantsByProduct.set(v.product_id, list)
        }
        const grupos = new Map<string, { refs: number; uds: number; valor: number }>()
        for (const p of (allProducts || []) as any[]) {
          const categoria = p.categories?.name?.trim() ? p.categories.name.trim().toUpperCase() : inferCategoria(p.title)
          const variants = variantsByProduct.get(p.id)
          const tieneVariantes = !!variants && variants.length > 0
          const uds = tieneVariantes ? variants!.reduce((s, v) => s + v.stock_qty, 0) : p.stock_qty
          const valor = tieneVariantes ? variants!.reduce((s, v) => s + v.stock_qty * v.cost_cents, 0) : p.stock_qty * p.cost_cents
          const g = grupos.get(categoria) || { refs: 0, uds: 0, valor: 0 }
          g.refs += tieneVariantes ? variants!.length : 1
          g.uds += uds
          g.valor += valor
          grupos.set(categoria, g)
        }
        categoryGroups = Array.from(grupos.entries()).map(([categoria, d]) => ({ categoria, ...d })).sort((a, b) => b.uds - a.uds)
      }

      const totalRefs = categoryGroups.reduce((s, g) => s + g.refs, 0)
      const totalUds = categoryGroups.reduce((s, g) => s + g.uds, 0)
      const totalValor = categoryGroups.reduce((s, g) => s + g.valor, 0)
      const totalGastosFijos = fixedBreakdown.arriendo + fixedBreakdown.sueldo + fixedBreakdown.servicios + fixedBreakdown.otros
      const totalEgresos = totalGastosFijos + totalOperatingExpenses

      const kpiHtml = `
        <table class="kpi">
          <thead><tr><th>VENTAS DEL MES</th><th>INGRESOS TOTALES</th><th>GANANCIA NETA</th>${canViewProfit ? '<th class="util-head">UTILIDAD REAL</th>' : ''}</tr></thead>
          <tbody>
            <tr class="kpi-val">
              <td class="blue">${totalUnits}</td><td>${formatPrice(totalRevenue)}</td>
              <td class="${grossProfit >= 0 ? 'green' : 'red'}">${formatPrice(grossProfit)}</td>
              ${canViewProfit ? `<td rowspan="2" class="util-cell ${utilidadReal >= 0 ? 'util-pos' : 'util-neg'}"><div class="util-label">UTILIDAD REAL</div><div class="util-amount">${formatPrice(utilidadReal)}</div><div class="util-margin">Margen: ${grossProfit ? ((utilidadReal / totalRevenue) * 100).toFixed(1) : '0.0'}%</div></td>` : ''}
            </tr>
            <tr class="kpi-sub">
              <td>Días trabajados: ${diasConVenta.length}</td>
              <td>Costos: ${formatPrice(totalCost)}</td>
              <td>Margen: ${totalRevenue ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
            </tr>
          </tbody>
        </table>`

      const gastosHtml = canViewProfit ? `
        <h3>Desglose de Gastos del Mes</h3>
        <table class="tbl">
          <thead><tr><th>CONCEPTO</th><th class="r">MONTO</th></tr></thead>
          <tbody>
            <tr><td>Arriendo</td><td class="r">${formatPrice(fixedBreakdown.arriendo)}</td></tr>
            <tr><td>Sueldo</td><td class="r">${formatPrice(fixedBreakdown.sueldo)}</td></tr>
            <tr><td>Servicios públicos</td><td class="r">${formatPrice(fixedBreakdown.servicios)}</td></tr>
            <tr><td>Otros gastos fijos</td><td class="r">${formatPrice(fixedBreakdown.otros)}</td></tr>
            <tr class="strong"><td>Total gastos fijos</td><td class="r red">${formatPrice(totalGastosFijos)}</td></tr>
            <tr><td><i>Gastos operativos del mes</i></td><td class="r amber">${formatPrice(totalOperatingExpenses)}</td></tr>
            <tr class="total-row"><td>TOTAL EGRESOS DEL MES</td><td class="r">${formatPrice(totalEgresos)}</td></tr>
          </tbody>
        </table>` : ''

      const estadisticasHtml = canViewProfit ? `
        <h3>Estadísticas del Mes</h3>
        <table class="kpi kpi-purple">
          <thead><tr><th>MÉTODO MÁS USADO</th><th>TICKET PROMEDIO</th><th>CATEGORÍA TOP</th><th>DÍA MÁS RENTABLE</th></tr></thead>
          <tbody>
            <tr class="kpi-val purple">
              <td>${metodoMasUsado ? metodoMasUsado[0] : '—'}</td>
              <td>${formatPrice(ticketPromedio)}</td>
              <td>${categoriaTop ? categoriaTop[0] : '—'}</td>
              <td>${diaMasRentable ? diaMasRentable.day.split('-').reverse().slice(0, 2).join('/') : '—'}</td>
            </tr>
            <tr class="kpi-sub">
              <td>${metodoMasUsado ? metodoMasUsado[1] : 0} uds.</td>
              <td>Por transacción</td>
              <td>${categoriaTop ? categoriaTop[1] : 0} uds.</td>
              <td>${diaMasRentable ? `G.Neta: ${formatPrice(diaMasRentable.gananciaNeta)}` : '—'}</td>
            </tr>
          </tbody>
        </table>` : ''

      const topProductosHtml = `
        <h3>Top 10 Productos del Mes</h3>
        ${topProducts.length === 0 ? '<p class="muted center">Sin ventas registradas en este período</p>' : `
        <table class="tbl">
          <thead><tr><th>#</th><th>PRODUCTO</th><th class="c">CANT.</th><th class="r">INGRESOS</th><th class="r">% PART.</th></tr></thead>
          <tbody>
            ${topProducts.map((p, i) => `<tr><td class="c">${i + 1}</td><td>${p.title}</td><td class="c">${p.qty}</td><td class="r green">${formatPrice(p.revenue)}</td><td class="r blue">${totalRevenue ? ((p.revenue / totalRevenue) * 100).toFixed(2) : '0.00'}%</td></tr>`).join('')}
          </tbody>
        </table>`}`

      const comisionesHtml = canViewProfit ? `
        <h3>Comisiones por Método de Pago</h3>
        ${Object.keys(commissionByMethod).length === 0 ? '<p class="muted center">Sin comisiones registradas en este período</p>' : `
        <table class="tbl">
          <thead><tr><th>MÉTODO</th><th class="c">VENTAS CON COMISIÓN</th><th class="r">TOTAL COMISIÓN</th></tr></thead>
          <tbody>
            ${Object.entries(commissionByMethod).sort((a, b) => b[1] - a[1]).map(([m, cents]) => `<tr><td>${methodLabels[m] || m}</td><td class="c">${commissionCountByMethod[m] || 0}</td><td class="r red">${formatPrice(cents)}</td></tr>`).join('')}
            <tr class="strong"><td>TOTAL</td><td class="c">${Object.values(commissionCountByMethod).reduce((s, n) => s + n, 0)}</td><td class="r red">${formatPrice(totalCommission)}</td></tr>
          </tbody>
        </table>`}` : ''

      const horasPicoHtml = `
        <h3>Horas Pico de Ventas</h3>
        <table class="tbl">
          <thead><tr><th>FRANJA HORARIA</th><th class="c">UNIDADES VENDIDAS</th><th class="r">INGRESOS</th><th class="r">% DEL MES</th></tr></thead>
          <tbody>
            ${peakHours.map((h) => `<tr><td>${h.label}</td><td class="c">${h.units || '—'}</td><td class="r">${h.units ? formatPrice(h.revenue) : '—'}</td><td class="r">${h.units ? ((h.units / totalPeakUnits) * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('')}
          </tbody>
        </table>`

      const resumenDiaHtml = `
        <h3>Resumen por Día</h3>
        <table class="tbl">
          <thead><tr><th>FECHA</th><th class="c">VENTAS</th><th class="r">INGRESOS</th>${canViewProfit ? '<th class="r">G. NETA</th><th class="r">GASTOS OP.</th><th class="r">UTILIDAD</th><th class="c">ESTADO</th>' : ''}</tr></thead>
          <tbody>
            ${dailyArray.map((d) => `<tr>
              <td>${d.day.split('-').reverse().join('/')}</td>
              <td class="c">${d.units}</td>
              <td class="r">${formatPrice(d.revenue)}</td>
              ${canViewProfit ? `
              <td class="r">${formatPrice(d.gananciaNeta)}</td>
              <td class="r">${d.gastosDia > 0 ? formatPrice(d.gastosDia) : '—'}</td>
              <td class="r ${d.utilidadRealDia >= 0 ? 'green' : 'red'}">${formatPrice(d.utilidadRealDia)}</td>
              <td class="c ${d.sinVenta ? 'red' : (d.utilidadRealDia >= 0 ? 'green' : 'red')}">${d.sinVenta ? 'Sin venta' : (d.utilidadRealDia >= 0 ? 'Positivo' : 'Negativo')}</td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>`

      const barraDias = dailyArray.map((d) => `
        <div class="bar-col">
          <div class="bar" style="height:${maxDaily ? (d.revenue / maxDaily) * 140 : 0}px"></div>
          <span class="bar-label">${d.day.slice(8, 10)}</span>
        </div>`).join('')

      const ultimos7 = dailyArray.slice(-7)
      const maxAbs7 = Math.max(...ultimos7.map((d) => Math.abs(d.gananciaNeta)), 1)
      const barraTendencia = ultimos7.map((d) => `
        <div class="bar-col">
          <div class="bar ${d.gananciaNeta >= 0 ? 'bar-green' : 'bar-red'}" style="height:${Math.max((Math.abs(d.gananciaNeta) / maxAbs7) * 100, 3)}px"></div>
          <span class="bar-label">${d.day.slice(8, 10)}/${d.day.slice(5, 7)}</span>
        </div>`).join('')

      const maxMetodo = Math.max(...Object.values(revenueByMethod), 1)
      const barraMetodos = Object.entries(revenueByMethod).sort((a, b) => b[1] - a[1]).map(([m, cents]) => `
        <div class="hbar-row">
          <span class="hbar-label">${m}</span>
          <div class="hbar-track"><div class="hbar-fill" style="width:${(cents / maxMetodo) * 100}%"></div></div>
          <span class="hbar-value">${formatPrice(cents)}</span>
        </div>`).join('')

      const inventarioHtml = canViewProfit && categoryGroups.length > 0 ? `
        <h3>Inventario General (Stock Actual)</h3>
        <table class="tbl">
          <thead><tr><th>CATEGORÍA</th><th class="c">REFERENCIAS</th><th class="c">UNIDADES EN STOCK</th><th class="r">VALOR EN STOCK</th></tr></thead>
          <tbody>
            ${categoryGroups.map((g) => `<tr><td>${g.categoria}</td><td class="c">${g.refs}</td><td class="c green">${g.uds}</td><td class="r blue">${formatPrice(g.valor)}</td></tr>`).join('')}
            <tr class="strong"><td>TOTAL</td><td class="c">${totalRefs}</td><td class="c">${totalUds}</td><td class="r">${formatPrice(totalValor)}</td></tr>
          </tbody>
        </table>` : ''

      win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <title>Reporte ${monthNames[month - 1]} ${year} - YJBMOTOCOM</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #1a1a1a; }
          h1 { color: #1E293B; margin-bottom: 2px; }
          .subtitulo { color: #2563EB; font-size: 15px; margin-top: 0; margin-bottom: 12px; }
          hr.hdr { border: none; border-top: 3px solid #2563EB; margin-bottom: 18px; }
          h3 { color: #1E293B; font-size: 13px; margin: 22px 0 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          table.tbl th, table.tbl td { padding: 6px 8px; border: 1px solid #E2E8F0; text-align: left; }
          table.tbl thead th { background: #1E293B; color: #fff; font-size: 10.5px; }
          table.tbl tbody tr:nth-child(even) { background: #F8FAFC; }
          .c { text-align: center; } .r { text-align: right; }
          .green { color: #16A34A; } .red { color: #DC2626; } .blue { color: #2563EB; } .amber { color: #D97706; }
          .muted { color: #6B7280; } .center { text-align: center; }
          .strong td { font-weight: bold; background: #F1F5F9; }
          .total-row td { font-weight: bold; background: #FEE2E2; color: #DC2626; font-size: 13px; }
          table.kpi { table-layout: fixed; margin-bottom: 4px; }
          table.kpi thead th { background: #1E293B; color: #fff; font-size: 10px; padding: 6px; text-align: center; }
          table.kpi.kpi-purple thead th { background: #7C3AED; }
          .kpi-val td { font-size: 20px; font-weight: bold; text-align: center; padding: 8px; border: 1px solid #E2E8F0; }
          .kpi-val.purple td { font-size: 15px; color: #7C3AED; background: #EDE9FE; }
          .kpi-sub td { font-size: 10px; color: #6B7280; text-align: center; padding: 4px; border: 1px solid #E2E8F0; }
          .util-head { background: #1E293B !important; }
          .util-cell { text-align: center; vertical-align: middle; }
          .util-pos { background: #DCFCE7; } .util-neg { background: #FEE2E2; }
          .util-label { font-size: 9px; font-weight: bold; color: #6B7280; }
          .util-amount { font-size: 18px; font-weight: bold; margin: 4px 0; }
          .util-pos .util-amount { color: #16A34A; } .util-neg .util-amount { color: #DC2626; }
          .util-margin { font-size: 9px; color: #6B7280; }
          .bars-row { display: flex; align-items: flex-end; gap: 4px; height: 170px; border-bottom: 1px solid #E2E8F0; padding: 8px 4px 0; overflow-x: auto; }
          .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-width: 18px; flex: 1; height: 100%; }
          .bar { width: 70%; background: #2563EB; border-radius: 2px 2px 0 0; align-self: center; }
          .bar-green { background: #16A34A; } .bar-red { background: #DC2626; align-self: flex-start; }
          .bar-label { font-size: 8px; color: #6B7280; margin-top: 4px; }
          .hbar-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
          .hbar-label { width: 140px; font-size: 10.5px; text-align: right; color: #374151; flex-shrink: 0; }
          .hbar-track { flex: 1; background: #F1F5F9; border-radius: 3px; height: 16px; }
          .hbar-fill { height: 100%; background: #2563EB; border-radius: 3px; }
          .hbar-value { width: 90px; font-size: 10px; color: #2563EB; flex-shrink: 0; }
          .print-btn { margin-bottom: 20px; padding: 10px 24px; background: #2563EB; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
          .footer { margin-top: 28px; border-top: 1px solid #E2E8F0; padding-top: 8px; text-align: center; font-size: 9px; color: #9CA3AF; }
          @media print { .print-btn { display: none; } }
        </style></head><body>
        <button class="print-btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
        <h1>YJBMOTOCOM</h1>
        <p class="subtitulo">Reporte Mensual — ${monthNames[month - 1]} ${year}</p>
        <hr class="hdr" />
        ${kpiHtml}
        ${gastosHtml}
        ${estadisticasHtml}
        ${topProductosHtml}
        ${comisionesHtml}
        ${horasPicoHtml}
        ${resumenDiaHtml}
        ${dailyArray.length > 0 ? `<h3>Ingresos Diarios</h3><div class="bars-row">${barraDias}</div>` : ''}
        ${ultimos7.length > 0 ? `<h3>Tendencia de Ganancia Neta (Últimos 7 días)</h3><div class="bars-row">${barraTendencia}</div>` : ''}
        ${Object.keys(revenueByMethod).length > 0 ? `<h3>Ingresos por Método de Pago</h3>${barraMetodos}` : ''}
        ${inventarioHtml}
        <div class="footer">Generado el ${new Date().toLocaleDateString('es-CO')} • YJBMOTOCOM — Sistema de Control de Rentabilidad</div>
        </body></html>`)
      win.document.close()
    } catch (error) {
      console.error('Error generando el reporte mensual:', error)
      win.document.write('<p style="font-family:Arial,sans-serif;padding:40px;color:#DC2626;">No se pudo generar el reporte. Cierra esta pestaña e intenta de nuevo.</p>')
      win.document.close()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Historial Mensual</h1>
          <p className="text-muted-foreground">Ventas del mes, con comisiones acumuladas</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="rounded-lg border bg-background px-3 py-2 text-sm">
            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-24 rounded-lg border bg-background px-3 py-2 text-sm">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canViewProfit && (
            <Button variant="outline" className="rounded-lg" onClick={handlePrint} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Exportar / Imprimir
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" className="rounded-lg" onClick={fetchMonth}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{formatPrice(totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Ingresos del mes</p>
                  {revenueDeltaPct !== null && (
                    <p className={`flex items-center text-xs ${revenueDeltaPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {revenueDeltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(revenueDeltaPct).toFixed(1)}% vs. mes anterior
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div><p className="text-2xl font-bold">{totalOrders}</p><p className="text-sm text-muted-foreground">Órdenes ({totalUnits} unidades)</p></div>
              </div>
            </div>
            {canViewProfit && (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-green-500">{formatPrice(grossProfit)}</p>
                    <p className="text-sm text-muted-foreground">Ganancia neta</p>
                    {profitDeltaPct !== null && (
                      <p className={`flex items-center text-xs ${profitDeltaPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {profitDeltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(profitDeltaPct).toFixed(1)}% vs. mes anterior
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {canViewProfit && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Costo total</p>
                <p className="text-xl font-bold">{formatPrice(totalCost)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Comisiones acumuladas</p>
                <p className="text-xl font-bold">{formatPrice(totalCommission)}</p>
                {Object.keys(commissionByMethod).length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {Object.entries(commissionByMethod)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, cents]) => (
                        <div key={method} className="flex justify-between text-xs text-muted-foreground">
                          <span>{methodLabels[method] || method}</span>
                          <span>{formatPrice(cents)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Utilidad real del mes</p>
                </div>
                <p className={`text-xl font-bold ${utilidadReal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(utilidadReal)}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Días positivos / negativos</p>
                <p className="text-xl font-bold">{positiveDays} / {negativeDays}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Días sin venta</p>
                <p className={`text-xl font-bold ${noSalesDays > 0 ? 'text-red-500' : ''}`}>{noSalesDays}</p>
                <p className="text-xs text-muted-foreground">No se vendió nada ese día</p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Ventas por día</h2>
                <p className="text-xs text-muted-foreground">Haz clic en un día para ver el detalle</p>
              </div>
              {dailyArrayDesc.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
              ) : (
                <div className="space-y-2">
                  {dailyArrayDesc.map((d) => (
                    <Link
                      key={d.day}
                      href={`/admin/ventas-dia?date=${d.day}`}
                      className="flex items-center gap-4 rounded-lg p-1 -m-1 hover:bg-muted"
                    >
                      <span className="w-20 text-sm text-muted-foreground">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                      <div className="flex-1"><div className="h-5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" style={{ width: `${(d.revenue / maxDaily) * 100}%` }} /></div>
                      <span className="w-28 text-right text-sm font-medium">{formatPrice(d.revenue)}</span>
                      {canViewProfit && (
                        <div className="flex w-48 shrink-0 flex-col items-end justify-center gap-0.5">
                          <Badge
                            variant="outline"
                            className={
                              d.sinVenta
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : d.utilidadRealDia >= 0
                                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                            }
                          >
                            {d.sinVenta ? 'Sin venta' : d.utilidadRealDia >= 0 ? 'Positivo' : 'Negativo'}
                          </Badge>
                          {!d.sinVenta && (
                            <span className={`whitespace-nowrap text-xs font-medium ${d.utilidadRealDia >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {/* utilidadRealDia prorratea un gasto fijo mensual entre los días del
                                  mes (ver línea ~224), así que casi nunca cae en centavos exactos —
                                  se redondea al peso (no al centavo) antes de formatear, si no
                                  formatPrice muestra decimales aunque el resto de la página no. */}
                              {d.utilidadRealDia >= 0
                                ? `+${formatPrice(Math.round(d.utilidadRealDia / 100) * 100)}`
                                : `Faltan ${formatPrice(Math.round(Math.abs(d.utilidadRealDia) / 100) * 100)}`}
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Top 10 Productos del mes</h2>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm">{i + 1}</span>
                      <div className="flex-1"><p className="line-clamp-1 font-medium">{p.title}</p><p className="text-sm text-muted-foreground">{p.qty} unidades</p></div>
                      <span className="font-semibold">{formatPrice(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canViewProfit && (
              <div className="rounded-xl border bg-card p-6 lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold">Rentabilidad por producto (top 10 por ganancia neta)</h2>
                {mostProfitableProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay ventas este mes.</p>
                ) : (
                  <div className="space-y-3">
                    {mostProfitableProducts.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm">{i + 1}</span>
                        <div className="flex-1">
                          <p className="line-clamp-1 font-medium">{p.title}</p>
                          <p className="text-sm text-muted-foreground">{p.qty} unidades · margen {p.margin.toFixed(1)}%</p>
                        </div>
                        <span className={`font-semibold ${p.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatPrice(p.profit)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

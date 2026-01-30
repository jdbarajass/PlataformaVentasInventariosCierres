'use client'

import { useState, useEffect } from 'react'
import { Calendar, Plus, Download, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatPrice, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { DailyClosure, Inserts } from '@/types/database'

export default function DailyClosuresPage() {
  const [closures, setClosures] = useState<DailyClosure[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    cash_amount: '',
    card_amount: '',
    transfer_amount: '',
    wallet_amount: '',
    other_amount: '',
    notes: '',
  })

  useEffect(() => {
    fetchClosures()
  }, [])

  const fetchClosures = async () => {
    const { data } = await supabase
      .from('daily_closures')
      .select('*')
      .order('date', { ascending: false })
      .limit(30)

    setClosures(data || [])
    setIsLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const cash = parseInt(formData.cash_amount || '0') * 100
    const card = parseInt(formData.card_amount || '0') * 100
    const transfer = parseInt(formData.transfer_amount || '0') * 100
    const wallet = parseInt(formData.wallet_amount || '0') * 100
    const other = parseInt(formData.other_amount || '0') * 100
    const total = cash + card + transfer + wallet + other

    const insertData: Inserts<'daily_closures'> = {
      date: formData.date,
      cash_amount_cents: cash,
      card_amount_cents: card,
      transfer_amount_cents: transfer,
      wallet_amount_cents: wallet,
      other_amount_cents: other,
      total_amount_cents: total,
      notes: formData.notes,
    }
    const { error } = await (supabase.from('daily_closures') as any).insert(insertData)

    if (!error) {
      setShowForm(false)
      setFormData({
        date: new Date().toISOString().split('T')[0],
        cash_amount: '',
        card_amount: '',
        transfer_amount: '',
        wallet_amount: '',
        other_amount: '',
        notes: '',
      })
      fetchClosures()
    }
  }

  const exportCSV = () => {
    const headers = ['Fecha', 'Efectivo', 'Tarjeta', 'Transferencia', 'Wallet', 'Otros', 'Total', 'Verificado', 'Notas']
    const rows = closures.map((c) => [
      c.date,
      c.cash_amount_cents / 100,
      c.card_amount_cents / 100,
      c.transfer_amount_cents / 100,
      c.wallet_amount_cents / 100,
      c.other_amount_cents / 100,
      c.total_amount_cents / 100,
      c.verified ? 'Si' : 'No',
      c.notes || '',
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cierres-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cierres Diarios</h1>
          <p className="text-muted-foreground">
            Registro de cierres de caja y conciliacion
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cierre
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar Cierre del Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">Fecha</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Efectivo (COP)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.cash_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, cash_amount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Tarjeta (COP)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.card_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, card_amount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Transferencia (COP)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.transfer_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, transfer_amount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Nequi/Daviplata (COP)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.wallet_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, wallet_amount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Otros (COP)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.other_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, other_amount: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Notas</label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  placeholder="Observaciones del dia..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Guardar Cierre</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Closures Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Historial de Cierres
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : closures.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-4 font-medium">Fecha</th>
                    <th className="pb-4 font-medium">Efectivo</th>
                    <th className="pb-4 font-medium">Tarjeta</th>
                    <th className="pb-4 font-medium">Transferencia</th>
                    <th className="pb-4 font-medium">Wallet</th>
                    <th className="pb-4 font-medium">Total</th>
                    <th className="pb-4 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {closures.map((closure) => (
                    <tr key={closure.id}>
                      <td className="py-4 font-medium">
                        {formatDate(closure.date)}
                      </td>
                      <td className="py-4">
                        {formatPrice(closure.cash_amount_cents)}
                      </td>
                      <td className="py-4">
                        {formatPrice(closure.card_amount_cents)}
                      </td>
                      <td className="py-4">
                        {formatPrice(closure.transfer_amount_cents)}
                      </td>
                      <td className="py-4">
                        {formatPrice(closure.wallet_amount_cents)}
                      </td>
                      <td className="py-4 font-semibold">
                        {formatPrice(closure.total_amount_cents)}
                      </td>
                      <td className="py-4">
                        <Badge variant={closure.verified ? 'success' : 'warning'}>
                          {closure.verified ? (
                            <>
                              <Check className="mr-1 h-3 w-3" /> Verificado
                            </>
                          ) : (
                            'Pendiente'
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No hay cierres registrados
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

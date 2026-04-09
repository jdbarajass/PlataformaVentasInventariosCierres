'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package, RefreshCw } from 'lucide-react'

type Tab = 'resumen' | 'abc' | 'sin-stock' | 'bajo-stock' | 'top-valor'

interface ItemRow {
  id: unknown
  name: string
  quantity: number
  price_formatted: string
  value_formatted: string
  category: string
  abc_class?: string
}

function ItemTable({ rows }: { rows?: ItemRow[] }) {
  if (!rows?.length)
    return <p className="text-muted-foreground text-sm py-4">Sin datos para mostrar</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium">Producto</th>
            <th className="pb-3 font-medium text-right">Cantidad</th>
            <th className="pb-3 font-medium text-right">Precio</th>
            <th className="pb-3 font-medium text-right">Valor Total</th>
            <th className="pb-3 font-medium">Categoría</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((item, i) => (
            <tr key={String(item.id ?? i)} className="hover:bg-secondary/50">
              <td className="py-3 font-medium">{item.name}</td>
              <td className="py-3 text-right">{item.quantity}</td>
              <td className="py-3 text-right">{item.price_formatted}</td>
              <td className="py-3 text-right font-semibold">{item.value_formatted}</td>
              <td className="py-3 text-muted-foreground">{item.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function InventarioPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/alegra/inventario')
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Error consultando inventario')
      } else {
        setData(json)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const summary = data?.summary as Record<string, unknown> | undefined
  const items = data?.items as ItemRow[] | undefined
  const outOfStock = data?.out_of_stock as ItemRow[] | undefined
  const lowStock = data?.low_stock as ItemRow[] | undefined
  const topByValue = data?.top_by_value as ItemRow[] | undefined
  const abcAnalysis = data?.abc_analysis as Record<string, ItemRow[]> | undefined

  const TABS: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Todos' },
    { id: 'abc', label: 'Análisis ABC' },
    { id: 'sin-stock', label: `Sin Stock (${outOfStock?.length ?? 0})` },
    { id: 'bajo-stock', label: `Bajo Stock (${lowStock?.length ?? 0})` },
    { id: 'top-valor', label: 'Top Valor' },
  ]

  return (
    <div className="space-y-6">
      {/* Acción */}
      <div className="flex justify-end">
        <Button
          onClick={fetchData}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Cargar Inventario
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Inventario desde Alegra</p>
            <p className="text-sm mt-1">
              Presiona &quot;Cargar Inventario&quot; para consultar los datos actualizados
            </p>
          </CardContent>
        </Card>
      )}

      {summary && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase">
                  TOTAL ITEMS
                </p>
                <p className="text-2xl font-bold mt-2">{String(summary.total_items || '-')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase">
                  VALOR TOTAL
                </p>
                <p className="text-2xl font-bold mt-2">
                  {String(summary.total_value_formatted || '-')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-500/30">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-red-500 font-semibold uppercase">SIN STOCK</p>
                <p className="text-2xl font-bold text-red-500 mt-2">
                  {String(summary.out_of_stock_count ?? '-')}
                </p>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/30">
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-yellow-500 font-semibold uppercase">BAJO STOCK</p>
                <p className="text-2xl font-bold text-yellow-500 mt-2">
                  {String(summary.low_stock_count ?? '-')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-500'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'resumen' && (
            <Card>
              <CardHeader>
                <CardTitle>Todos los Productos</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemTable rows={items} />
              </CardContent>
            </Card>
          )}

          {activeTab === 'abc' && abcAnalysis && (
            <div className="space-y-4">
              {(['A', 'B', 'C'] as const).map((cls) => (
                <Card key={cls}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Badge
                        className={
                          cls === 'A'
                            ? 'bg-green-500'
                            : cls === 'B'
                              ? 'bg-yellow-500'
                              : 'bg-secondary text-foreground'
                        }
                      >
                        Clase {cls}
                      </Badge>
                      <span className="text-sm font-normal text-muted-foreground">
                        {cls === 'A' && '— Vitales (80% del valor)'}
                        {cls === 'B' && '— Importantes (15% del valor)'}
                        {cls === 'C' && '— Triviales (5% del valor)'}
                        {' '}· {abcAnalysis[cls]?.length ?? 0} items
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ItemTable rows={abcAnalysis[cls]} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'sin-stock' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-500">Productos Sin Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemTable rows={outOfStock} />
              </CardContent>
            </Card>
          )}

          {activeTab === 'bajo-stock' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-yellow-500">
                  Productos con Bajo Stock (&le;5 unidades)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ItemTable rows={lowStock} />
              </CardContent>
            </Card>
          )}

          {activeTab === 'top-valor' && (
            <Card>
              <CardHeader>
                <CardTitle>Top 20 por Valor Total</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemTable rows={topByValue} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

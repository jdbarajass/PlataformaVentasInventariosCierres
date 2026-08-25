'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'
import {
  Package,
  Search,
  Plus,
  Minus,
  RefreshCw,
  AlertTriangle,
  Download,
  Upload,
  RefreshCcw,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  Tags,
  LayoutGrid,
  List,
  PackagePlus,
  Pencil,
  ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { supabaseBrowser as supabase, withTimeout } from '@/lib/supabase-browser'
import { BOGOTA_TZ, bogotaDateStr, formatBogotaTime } from '@/lib/bogota-time'
import {
  TALLAS_DISPONIBLES,
  detectarCategoria,
  generarCodigoBarrasAuto,
  generarSiguienteSerial,
  derivarCodigoBarrasHermano,
  tallaADigito,
} from '@/lib/inventario-barcode'

// Tallas estándar preseleccionadas al crear un producto nuevo con tallas
// desde "Ingresar" — cubre el caso más común (ropa/cascos/guantes); el
// usuario puede desmarcar las que no aplican para ese producto puntual.
const TALLAS_ESTANDAR = ['S', 'M', 'L', 'XL', '2XL']

interface ProductStock {
  id: string
  sku: string | null
  barcode: string | null
  // Códigos de barras de cada talla/variante — el buscador de Detalle debe
  // poder encontrar un producto por el código de barras de cualquiera de
  // sus tallas, no solo por el del producto base (que suele ser null
  // cuando el producto tiene variantes, ya que ahí el código vive por talla).
  variantBarcodes: string[]
  // Cuántas tallas/variantes tiene (cuenta TODAS, tengan o no código de
  // barras — variantBarcodes solo trae las que sí tienen). Se usa para
  // bloquear el ajuste rápido de stock a nivel de producto cuando en
  // realidad hay que elegir una talla primero (ver handleAdjust).
  variantCount: number
  title: string
  stock_qty: number
  low_stock_threshold: number
  price_cents: number
  cost_cents: number
  category: { name: string } | null
}

interface ProductVariant {
  id: string
  product_id: string
  talla: string | null
  sku: string | null
  barcode: string | null
  stock_qty: number
  low_stock_threshold: number
  cost_cents: number
  active: boolean
}

interface InventoryMovement {
  id: string
  qty: number
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'return' | 'exchange' | 'deleted'
  note: string | null
  created_at: string
  product: { id: string; title: string; sku: string | null } | null
}

const typeLabels: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
  sale: 'Venta',
  return: 'Devolución',
  exchange: 'Cambio',
  deleted: 'Eliminado',
}

export default function InventarioPage() {
  const [activeTab, setActiveTab] = useState<'detalle' | 'general' | 'movimientos' | 'ingresar'>('detalle')
  const [products, setProducts] = useState<ProductStock[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)

  // Adjustment modal state
  const [adjustingProduct, setAdjustingProduct] = useState<string | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<'in' | 'out' | 'adjustment'>('in')
  const [adjustmentQty, setAdjustmentQty] = useState('')
  const [adjustmentNote, setAdjustmentNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Editar producto (nombre, costo, cantidad, mínimo, código de barras) —
  // igual que el panel "Editar Producto" de Detalle en el local, que hoy
  // no tenía equivalente en la nube (solo se podía ajustar cantidad).
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editProductForm, setEditProductForm] = useState({
    title: '',
    costo: '',
    precio: '',
    stock: '',
    umbral: '',
    barcode: '',
  })
  const [savingProductEdit, setSavingProductEdit] = useState(false)

  const [editingVariant, setEditingVariant] = useState<string | null>(null)
  const [editVariantForm, setEditVariantForm] = useState({
    talla: '',
    costo: '',
    stock: '',
    umbral: '',
    barcode: '',
  })
  const [savingVariantEdit, setSavingVariantEdit] = useState(false)

  // Variantes por talla / código de barras
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariant[]>>({})
  const [loadingVariants, setLoadingVariants] = useState(false)
  const [newVariant, setNewVariant] = useState({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
  // Último código sugerido automáticamente para "Agregar talla" — permite
  // recalcular la sugerencia en cada tecla de "Talla" (ver bug de la talla
  // XS quedando con dígito de "N/A": antes solo se sugería con la PRIMERA
  // tecla y ya no se volvía a tocar) sin pisar un código que el usuario
  // haya escrito/editado a mano.
  const newVariantBarcodeAutoRef = useRef('')
  const [savingVariant, setSavingVariant] = useState(false)
  const [adjustingVariant, setAdjustingVariant] = useState<string | null>(null)
  const [variantAdjType, setVariantAdjType] = useState<'in' | 'out' | 'adjustment'>('in')
  const [variantAdjQty, setVariantAdjQty] = useState('')

  const { session, userProfile } = useAuth()
  const { toast } = useToast()
  const isAdmin = userProfile?.role === 'admin'
  const isReadOnlyAdmin = userProfile?.role === 'admin_readonly'
  // El rol 'seller' no ve el costo real de las variantes, igual que en
  // el software local (solo Admin ve costos/ganancia). El admin de solo
  // lectura sí los ve (ve absolutamente todo), solo no puede editar nada.
  const canViewCost = isAdmin || isReadOnlyAdmin
  // Editar inventario (ajustar stock, agregar/desactivar variantes) es
  // solo de Admin — el software local exige la clave maestra de Admin
  // para esto incluso con sesión de vendedor; aquí se restringe directo.
  const canEdit = isAdmin

  const fetchProducts = useCallback(async () => {
    if (!session?.access_token) return

    try {
      // Límite alto a propósito: esta pestaña necesita el catálogo COMPLETO
      // para poder filtrar/contar en el cliente (tabla, tarjetas de
      // resumen, "Ingresar"). Un límite bajo aquí deja productos completos
      // fuera del listado en silencio en cuanto el catálogo lo supera —
      // pasó exactamente eso al llegar a 214 productos con un límite de 200
      // (sección 81.14 de docs/UNIFICACION_YJBMOTOCOM.md).
      const res = await fetch('/api/products?limit=2000&include_inactive=true', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) throw new Error('Error fetching products')

      const result = await res.json()
      const data = result.data || result.products || []

      // Si el producto tiene tallas/variantes, el stock real vive en
      // product_variants (products.stock_qty se queda en 0 sin uso) —
      // mismo cuidado que fetchInventoryValue/fetchCategoryRollup, que ya
      // suman por variante. Antes esta tabla mostraba directamente
      // products.stock_qty, por lo que un producto con variantes con stock
      // real aparecía como "0" aunque alguna talla sí tuviera unidades.
      const { data: allVariants } = await supabase.from('product_variants').select('product_id, stock_qty, barcode')
      const stockPorProducto = new Map<string, number>()
      const barcodesPorProducto = new Map<string, string[]>()
      const conteoVariantesPorProducto = new Map<string, number>()
      for (const v of (allVariants || []) as { product_id: string; stock_qty: number; barcode: string | null }[]) {
        stockPorProducto.set(v.product_id, (stockPorProducto.get(v.product_id) || 0) + v.stock_qty)
        conteoVariantesPorProducto.set(v.product_id, (conteoVariantesPorProducto.get(v.product_id) || 0) + 1)
        if (v.barcode) {
          const list = barcodesPorProducto.get(v.product_id) || []
          list.push(v.barcode)
          barcodesPorProducto.set(v.product_id, list)
        }
      }

      setProducts(
        data.map((p: any) => ({
          id: p.id,
          sku: p.sku,
          barcode: p.barcode ?? null,
          variantBarcodes: barcodesPorProducto.get(p.id) || [],
          variantCount: conteoVariantesPorProducto.get(p.id) || 0,
          title: p.title,
          stock_qty: stockPorProducto.has(p.id) ? stockPorProducto.get(p.id)! : p.stock_qty,
          low_stock_threshold: p.low_stock_threshold,
          price_cents: p.price_cents,
          cost_cents: p.cost_cents || 0,
          category: p.category || p.categories || null,
        }))
      )
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }, [session?.access_token])

  // Valor total del inventario (costo × stock) — visible solo a admin, igual
  // que _lbl_valor_inventario en ui/inventario_panel.py. Se calcula aparte
  // (no desde `products`, que no trae costo por variante) para no contar
  // dos veces el stock de un producto que además tiene variantes de talla:
  // si tiene variantes, el stock/costo real vive en product_variants.
  const [inventoryValue, setInventoryValue] = useState<number | null>(null)

  const fetchInventoryValue = useCallback(async () => {
    if (!isAdmin) return
    // .is('deleted_at', null): un producto borrado no cascadea el borrado a
    // sus variantes (a diferencia de un borrado real) — sin este filtro el
    // valor de inventario seguía sumando el costo/stock de productos que el
    // admin ya había eliminado (ver docs/UNIFICACION_YJBMOTOCOM.md sección
    // 81.14).
    const { data: allProducts } = await supabase.from('products').select('id, cost_cents, stock_qty').is('deleted_at', null)
    const productIds = (allProducts || []).map((p: any) => p.id)
    const { data: allVariants } = productIds.length
      ? await supabase.from('product_variants').select('product_id, cost_cents, stock_qty').in('product_id', productIds)
      : { data: [] }
    const productsWithVariants = new Set((allVariants || []).map((v: any) => v.product_id))
    const fromProducts = (allProducts || [])
      .filter((p: any) => !productsWithVariants.has(p.id))
      .reduce((sum: number, p: any) => sum + p.cost_cents * p.stock_qty, 0)
    const fromVariants = (allVariants || []).reduce((sum: number, v: any) => sum + v.cost_cents * v.stock_qty, 0)
    setInventoryValue(fromProducts + fromVariants)
  }, [isAdmin])

  // "Inventario General": agrupa por categoría igual que
  // _categoria_producto/_poblar_tabla_general del software local — usa la
  // categoría explícita si el producto tiene category_id, si no infiere de
  // la primera palabra del nombre (quitando el sufijo "-T:talla"). "refs"
  // cuenta filas al nivel de variante/talla cuando existen (igual que el
  // local, donde cada talla es su propia fila de inventario), no productos
  // base.
  const [categoryGroups, setCategoryGroups] = useState<
    { categoria: string; refs: number; uds: number; valor: number }[]
  >([])
  const [loadingGeneral, setLoadingGeneral] = useState(false)

  const inferCategoria = (title: string) => {
    const limpio = title.replace(/\s*-T:\S*/gi, '').trim()
    return limpio ? limpio.split(/\s+/)[0].toUpperCase() : 'OTRO'
  }

  // "Inventario General" (unidades por categoría) sí lo necesita ver un
  // vendedor, para cuadrar un conteo físico contra el sistema — antes esta
  // función completa se saltaba para cualquier rol que no fuera admin, así
  // que la pestaña le salía vacía ("No se encontraron categorías") en vez
  // de simplemente no mostrarle el costo/valor (que sí sigue oculto más
  // abajo, en el render, igual que en el resto de esta página).
  const fetchCategoryRollup = useCallback(async () => {
    setLoadingGeneral(true)
    try {
      // .is('deleted_at', null): mismo motivo que fetchInventoryValue — un
      // producto borrado no arrastra el borrado de sus variantes.
      const { data: allProducts } = await supabase
        .from('products')
        .select('id, title, cost_cents, stock_qty, categories(name)')
        .is('deleted_at', null)
      const productIds = (allProducts || []).map((p: any) => p.id)
      const { data: allVariants } = productIds.length
        ? await supabase.from('product_variants').select('product_id, cost_cents, stock_qty').in('product_id', productIds)
        : { data: [] }
      const variantsByProduct = new Map<string, { stock_qty: number; cost_cents: number }[]>()
      for (const v of (allVariants || []) as any[]) {
        const list = variantsByProduct.get(v.product_id) || []
        list.push(v)
        variantsByProduct.set(v.product_id, list)
      }
      const grupos = new Map<string, { refs: number; uds: number; valor: number }>()
      for (const p of (allProducts || []) as any[]) {
        const categoria = p.categories?.name?.trim()
          ? p.categories.name.trim().toUpperCase()
          : inferCategoria(p.title)
        const variants = variantsByProduct.get(p.id)
        const tieneVariantes = !!variants && variants.length > 0
        const uds = tieneVariantes ? variants!.reduce((s, v) => s + v.stock_qty, 0) : p.stock_qty
        const valor = tieneVariantes
          ? variants!.reduce((s, v) => s + v.stock_qty * v.cost_cents, 0)
          : p.stock_qty * p.cost_cents
        const g = grupos.get(categoria) || { refs: 0, uds: 0, valor: 0 }
        g.refs += tieneVariantes ? variants!.length : 1
        g.uds += uds
        g.valor += valor
        grupos.set(categoria, g)
      }
      const arr = Array.from(grupos.entries())
        .map(([categoria, d]) => ({ categoria, ...d }))
        .sort((a, b) => b.uds - a.uds)
      setCategoryGroups(arr)
    } finally {
      setLoadingGeneral(false)
    }
  }, [])

  const [generalSearch, setGeneralSearch] = useState('')
  const filteredCategoryGroups = categoryGroups.filter((g) =>
    g.categoria.toLowerCase().includes(generalSearch.toLowerCase().trim())
  )

  const fetchMovements = useCallback(async () => {
    if (!session?.access_token) return

    try {
      const res = await fetch('/api/inventory/adjust?limit=10', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!res.ok) throw new Error('Error fetching movements')

      const { data } = await res.json()
      setMovements(data || [])
    } catch (error) {
      console.error('Error fetching movements:', error)
    }
  }, [session?.access_token])

  // Pestaña "Movimientos": historial completo (últimos 300, igual que
  // obtener_movimientos_recientes(300) del software local), con carga
  // perezosa al entrar al tab — no se pide en la carga inicial de la
  // página para no traer 300 filas si el usuario nunca abre este tab.
  const [movimientosFull, setMovimientosFull] = useState<InventoryMovement[]>([])
  const [movimientosLoaded, setMovimientosLoaded] = useState(false)
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)
  const [movimientosSearch, setMovimientosSearch] = useState('')
  const [movimientosTipo, setMovimientosTipo] = useState<string>('')

  const fetchFullMovements = useCallback(async () => {
    if (!session?.access_token) return
    setLoadingMovimientos(true)
    try {
      const res = await fetch('/api/inventory/adjust?limit=300', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Error fetching movements')
      const { data } = await res.json()
      setMovimientosFull(data || [])
      setMovimientosLoaded(true)
    } catch (error) {
      console.error('Error fetching full movements:', error)
    } finally {
      setLoadingMovimientos(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (activeTab === 'movimientos' && !movimientosLoaded) {
      fetchFullMovements()
    }
  }, [activeTab, movimientosLoaded, fetchFullMovements])

  const filteredMovimientos = movimientosFull.filter((m) => {
    const matchesSearch = movimientosSearch.trim()
      ? (m.product?.title || '').toLowerCase().includes(movimientosSearch.toLowerCase().trim())
      : true
    const matchesTipo = movimientosTipo ? m.type === movimientosTipo : true
    return matchesSearch && matchesTipo
  })

  // Pestaña "Ingresar": alta rápida de producto/talla nueva, con
  // autocompletado, generación automática de serial y código de barras
  // (services/inventario_gen.py del local) y panel de "productos similares"
  // de la misma categoría detectada, para evitar duplicados.
  interface ItemInventario {
    productId: string
    variantId: string | null
    title: string
    talla: string | null
    stockQty: number
    costCents: number
    barcode: string | null
    sku: string | null
    categoria: string
    lowStockThreshold: number
  }
  const [itemsInventario, setItemsInventario] = useState<ItemInventario[]>([])
  const [ingresarLoaded, setIngresarLoaded] = useState(false)
  const [loadingIngresar, setLoadingIngresar] = useState(false)

  const fetchIngresarData = useCallback(async () => {
    setLoadingIngresar(true)
    try {
      const [{ data: allProducts }, { data: allVariants }] = await Promise.all([
        supabase
          .from('products')
          .select('id, title, sku, barcode, cost_cents, stock_qty, low_stock_threshold, categories(name)'),
        supabase
          .from('product_variants')
          .select('id, product_id, talla, sku, barcode, cost_cents, stock_qty, low_stock_threshold'),
      ])
      const variantsByProduct = new Map<string, any[]>()
      for (const v of (allVariants || []) as any[]) {
        const list = variantsByProduct.get(v.product_id) || []
        list.push(v)
        variantsByProduct.set(v.product_id, list)
      }
      const items: ItemInventario[] = []
      for (const p of (allProducts || []) as any[]) {
        const categoria = p.categories?.name?.trim() ? p.categories.name.trim().toUpperCase() : inferCategoria(p.title)
        const variants = variantsByProduct.get(p.id)
        if (variants && variants.length > 0) {
          for (const v of variants) {
            items.push({
              productId: p.id,
              variantId: v.id,
              title: p.title,
              talla: v.talla,
              stockQty: v.stock_qty,
              costCents: v.cost_cents,
              barcode: v.barcode,
              sku: v.sku,
              categoria,
              lowStockThreshold: v.low_stock_threshold,
            })
          }
        } else {
          items.push({
            productId: p.id,
            variantId: null,
            title: p.title,
            talla: null,
            stockQty: p.stock_qty,
            costCents: p.cost_cents,
            barcode: p.barcode,
            sku: p.sku,
            categoria,
            lowStockThreshold: p.low_stock_threshold,
          })
        }
      }
      setItemsInventario(items)
      setIngresarLoaded(true)
    } finally {
      setLoadingIngresar(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'ingresar' && !ingresarLoaded) {
      fetchIngresarData()
    }
  }, [activeTab, ingresarLoaded, fetchIngresarData])

  // Modal "Nuevo ajuste de inventario" — pedido explícito del usuario tras
  // ver esa pantalla en Alegra: en vez de ajustar producto por producto
  // (los botones rápidos Entrada/Salida/Ajuste de la tabla de Detalle,
  // uno a la vez), aquí se arma una tabla con varias filas y se guardan
  // todas de un solo golpe — pensado para un conteo físico periódico.
  // Reutiliza itemsInventario (ya aplanado producto+talla, ver
  // fetchIngresarData) como buscador y el mismo /api/inventory/adjust de
  // siempre (una llamada por fila, tipo 'adjustment' con la cantidad final
  // ya calculada) — sin endpoint nuevo, mismas validaciones/auditoría que
  // el resto de ajustes de esta página.
  interface AjusteRow {
    key: string
    item: ItemInventario | null
    query: string
    tipo: 'incremento' | 'disminucion'
    cantidad: string
  }
  const emptyAjusteRow = (): AjusteRow => ({
    key: crypto.randomUUID(),
    item: null,
    query: '',
    tipo: 'incremento',
    cantidad: '',
  })
  const [showAjusteModal, setShowAjusteModal] = useState(false)
  const [ajusteRows, setAjusteRows] = useState<AjusteRow[]>([emptyAjusteRow()])
  const [ajusteFocusedRow, setAjusteFocusedRow] = useState<string | null>(null)
  const [savingAjuste, setSavingAjuste] = useState(false)

  const openAjusteModal = () => {
    if (!ingresarLoaded) fetchIngresarData()
    setAjusteRows([emptyAjusteRow()])
    setShowAjusteModal(true)
  }

  const updateAjusteRow = (key: string, patch: Partial<AjusteRow>) => {
    setAjusteRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const addAjusteRow = () => setAjusteRows((rows) => [...rows, emptyAjusteRow()])
  const removeAjusteRow = (key: string) =>
    setAjusteRows((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows))

  const selectAjusteItem = (key: string, item: ItemInventario) => {
    updateAjusteRow(key, { item, query: item.title + (item.talla ? ` — ${item.talla}` : '') })
    setAjusteFocusedRow(null)
  }

  const ajusteResultsFor = (query: string) => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return itemsInventario
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q) ||
          (i.barcode || '').includes(q)
      )
      .slice(0, 8)
  }

  const ajusteDelta = (row: AjusteRow) => parseInt(row.cantidad) || 0
  const ajusteCantidadFinal = (row: AjusteRow) => {
    if (!row.item) return 0
    return row.tipo === 'incremento' ? row.item.stockQty + ajusteDelta(row) : row.item.stockQty - ajusteDelta(row)
  }
  const ajusteTotalRow = (row: AjusteRow) => (row.item ? ajusteDelta(row) * row.item.costCents : 0)
  const ajusteTotalGeneral = ajusteRows.reduce((sum, r) => sum + ajusteTotalRow(r), 0)

  const ajusteEsValido = (row: AjusteRow): string | null => {
    if (!row.item) return 'Selecciona un producto en cada fila'
    if (ajusteDelta(row) <= 0) return `"${row.item.title}": la cantidad debe ser mayor a 0`
    if (ajusteCantidadFinal(row) < 0) return `"${row.item.title}": la cantidad final no puede quedar negativa`
    return null
  }

  const handleGuardarAjustes = async () => {
    if (!session?.access_token) return
    const primerError = ajusteRows.map(ajusteEsValido).find((e) => e !== null)
    if (primerError) {
      toast({ title: 'Revisa el formulario', description: primerError, variant: 'destructive' })
      return
    }

    setSavingAjuste(true)
    const loteId = `Lote-${Date.now()}`
    let ok = 0
    let errorMsg: string | null = null
    for (const row of ajusteRows) {
      if (!row.item) continue
      try {
        const res = await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            product_id: row.item.productId,
            // El endpoint valida variant_id con z.string().uuid().optional()
            // — acepta que falte la llave, pero no un `null` explícito (no
            // es .nullable()) — así que se omite del todo para productos
            // sin talla, en vez de mandar variant_id: null.
            ...(row.item.variantId ? { variant_id: row.item.variantId } : {}),
            qty: ajusteCantidadFinal(row),
            type: 'adjustment',
            note: `Ajuste de inventario (${loteId}) — ${row.tipo === 'incremento' ? 'Incremento' : 'Disminución'} de ${ajusteDelta(row)}`,
            created_by: userProfile?.id,
          }),
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Error al ajustar')
        }
        ok++
      } catch (err: any) {
        errorMsg = `${row.item.title}${row.item.talla ? ' (' + row.item.talla + ')' : ''}: ${err.message}`
        break
      }
    }

    await Promise.all([fetchProducts(), fetchMovements(), fetchInventoryValue(), fetchCategoryRollup(), fetchIngresarData()])
    setSavingAjuste(false)

    if (errorMsg) {
      // Se detiene en la primera fila que falla — las anteriores ya se
      // guardaron (por eso el refetch de arriba corre siempre), así que se
      // deja el modal abierto para que el usuario revise qué falta.
      toast({ title: `Se guardaron ${ok} de ${ajusteRows.length}`, description: errorMsg, variant: 'destructive' })
    } else {
      toast({ title: 'Ajuste de inventario guardado', description: `${ok} producto(s) actualizados` })
      setShowAjusteModal(false)
    }
  }

  const [ingresarNombre, setIngresarNombre] = useState('')
  const [ingresarTalla, setIngresarTalla] = useState('N/A')
  // Crear varias tallas del mismo producto de una vez (ver docs/
  // UNIFICACION_YJBMOTOCOM.md sección 58) — preseleccionadas las 5
  // estándar, el usuario desmarca las que no apliquen a este producto.
  const [ingresarTieneTallas, setIngresarTieneTallas] = useState(false)
  const [ingresarTallasSeleccionadas, setIngresarTallasSeleccionadas] = useState<string[]>(TALLAS_ESTANDAR)
  const [ingresarCosto, setIngresarCosto] = useState('')
  const [ingresarCantidad, setIngresarCantidad] = useState('1')
  const [ingresarManual, setIngresarManual] = useState(false)
  const [ingresarSerialManual, setIngresarSerialManual] = useState('')
  const [ingresarBarcodeManual, setIngresarBarcodeManual] = useState('')
  const [savingIngresar, setSavingIngresar] = useState(false)

  // itemsInventario solo trae, por producto, las filas de sus VARIANTES
  // (talla/sku/barcode de cada una) — el sku/barcode del producto BASE se
  // pierde ahí cuando tiene tallas (ver fetchIngresarData). Se completa acá
  // con `products` (que sí siempre trae el sku/barcode del producto base,
  // tenga o no variantes) para que la sugerencia de serial/código no repita
  // uno ya usado por un producto que ya tiene tallas.
  const codigosExistentes = [...products.map((p) => p.barcode), ...itemsInventario.map((i) => i.barcode)]
  const skusExistentes = [...products.map((p) => p.sku), ...itemsInventario.map((i) => i.sku)]
  const serialSugerido = String(generarSiguienteSerial(skusExistentes))
  const barcodeSugerido = ingresarNombre.trim()
    ? generarCodigoBarrasAuto(ingresarNombre, ingresarTalla, codigosExistentes)
    : ''

  const categoriaDetectada = ingresarNombre.trim() ? detectarCategoria(ingresarNombre) : null
  const productosSimilares = categoriaDetectada
    ? itemsInventario.filter((i) => detectarCategoria(i.title) === categoriaDetectada)
    : []

  const nombresSugeridos = Array.from(new Set(itemsInventario.map((i) => i.title))).filter((t) =>
    ingresarNombre.trim() ? t.toLowerCase().includes(ingresarNombre.toLowerCase().trim()) : false
  )

  const limpiarFormularioIngresar = () => {
    setIngresarNombre('')
    setIngresarTalla('N/A')
    setIngresarTieneTallas(false)
    setIngresarTallasSeleccionadas(TALLAS_ESTANDAR)
    setIngresarCosto('')
    setIngresarCantidad('1')
    setIngresarManual(false)
    setIngresarSerialManual('')
    setIngresarBarcodeManual('')
  }

  const handleIngresar = async () => {
    if (!session?.access_token) return
    const nombre = ingresarNombre.trim()
    const cantidad = parseInt(ingresarCantidad) || 0
    if (!nombre) {
      toast({ title: 'Error', description: 'Ingresa el nombre del producto', variant: 'destructive' })
      return
    }
    if (ingresarTieneTallas && ingresarTallasSeleccionadas.length === 0) {
      toast({ title: 'Error', description: 'Selecciona al menos una talla', variant: 'destructive' })
      return
    }
    if (!ingresarTieneTallas && cantidad <= 0) {
      toast({ title: 'Error', description: 'La cantidad debe ser mayor a 0', variant: 'destructive' })
      return
    }
    const costCents = Math.round((parseFloat(ingresarCosto) || 0) * 100)
    const serial = ingresarManual ? ingresarSerialManual.trim() : serialSugerido

    // --- Modo multi-talla: crea el producto (si no existe) y todas las
    // tallas seleccionadas de una sola vez, todas con el mismo código de
    // barras "de familia" (solo cambia el dígito de talla) — ver docs/
    // UNIFICACION_YJBMOTOCOM.md sección 58.
    if (ingresarTieneTallas) {
      try {
        setSavingIngresar(true)
        const productoBase = itemsInventario.find((i) => i.title.trim().toLowerCase() === nombre.toLowerCase())
        let productId = productoBase?.productId

        if (!productId) {
          const slug =
            nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') +
            '-' + Math.random().toString(36).slice(2, 7)
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              title: nombre, slug, price_cents: Math.round(costCents * 1.3) || 0, cost_cents: costCents,
              stock_qty: 0, active: false, images: [], sku: serial, barcode: null,
            }),
          })
          if (!res.ok) {
            const error = await res.json()
            throw new Error(error.error || 'Error al crear el producto')
          }
          const created = await res.json()
          productId = created.id
        }

        // Código base de familia (9 primeros dígitos): se toma de una talla
        // que ya exista para este producto si hay alguna, o se genera una
        // vez con la primera talla nueva del envío — el resto de tallas de
        // esta misma tanda reutilizan ese mismo código base.
        let codigoBase9: string | null =
          itemsInventario.find((i) => i.productId === productId && i.barcode && /^\d{10}$/.test(i.barcode))
            ?.barcode?.slice(0, 9) || null

        let creadas = 0
        let saltadas = 0
        for (const talla of ingresarTallasSeleccionadas) {
          const yaExiste = itemsInventario.some((i) => i.productId === productId && i.talla === talla)
          if (yaExiste) { saltadas++; continue }

          let barcodeTalla: string
          if (codigoBase9) {
            barcodeTalla = `${codigoBase9}${tallaADigito(talla)}`
          } else {
            barcodeTalla = generarCodigoBarrasAuto(nombre, talla, codigosExistentes)
            codigoBase9 = barcodeTalla.slice(0, 9)
          }

          const res = await fetch(`/api/products/${productId}/variants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ talla, barcode: barcodeTalla, stock_qty: cantidad, cost_cents: costCents }),
          })
          if (!res.ok) {
            const error = await res.json()
            throw new Error(error.error || `Error al crear la talla ${talla}`)
          }
          creadas++
        }

        toast({
          title: 'Producto ingresado',
          description: `"${nombre}": ${creadas} talla(s) creada(s)${saltadas ? `, ${saltadas} ya existían y se omitieron` : ''}`,
        })
        limpiarFormularioIngresar()
        await Promise.all([fetchProducts(), fetchInventoryValue(), fetchCategoryRollup(), fetchIngresarData()])
      } catch (error: any) {
        toast({ title: 'Error', description: error.message || 'No se pudo ingresar el producto', variant: 'destructive' })
      } finally {
        setSavingIngresar(false)
      }
      return
    }

    const talla = ingresarTalla === 'N/A' ? null : ingresarTalla
    const barcode = (ingresarManual ? ingresarBarcodeManual.trim() : barcodeSugerido) || null

    try {
      setSavingIngresar(true)
      const existente = itemsInventario.find(
        (i) => i.title.trim().toLowerCase() === nombre.toLowerCase() && i.talla === talla
      )

      if (existente) {
        // Ya existe el mismo producto+talla: sumar cantidad en vez de duplicar.
        const res = await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            product_id: existente.productId,
            variant_id: existente.variantId || undefined,
            qty: cantidad,
            type: 'in',
            note: 'Ingresado desde "Ingresar" — se sumó a un producto/talla existente',
            created_by: userProfile?.id,
          }),
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Error al ingresar stock')
        }
      } else {
        // Ver si el nombre ya existe como producto base (otra talla nueva) o es 100% nuevo.
        const productoBase = itemsInventario.find(
          (i) => i.title.trim().toLowerCase() === nombre.toLowerCase()
        )
        let productId = productoBase?.productId

        if (!productId) {
          const slug =
            nombre
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '') +
            '-' +
            Math.random().toString(36).slice(2, 7)
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              title: nombre,
              slug,
              price_cents: Math.round(costCents * 1.3) || 0,
              cost_cents: costCents,
              stock_qty: talla ? 0 : cantidad,
              active: false,
              images: [],
              sku: serial,
              barcode: talla ? null : barcode,
            }),
          })
          if (!res.ok) {
            const error = await res.json()
            throw new Error(error.error || 'Error al crear el producto')
          }
          const created = await res.json()
          productId = created.id
        } else if (!talla) {
          // Producto ya existe sin variantes y se está reingresando sin talla: sumar stock.
          const res = await fetch('/api/inventory/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              product_id: productId,
              qty: cantidad,
              type: 'in',
              note: 'Ingresado desde "Ingresar"',
              created_by: userProfile?.id,
            }),
          })
          if (!res.ok) {
            const error = await res.json()
            throw new Error(error.error || 'Error al ingresar stock')
          }
        }

        if (talla && productId) {
          const res = await fetch(`/api/products/${productId}/variants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({
              talla,
              barcode,
              stock_qty: cantidad,
              cost_cents: costCents,
            }),
          })
          if (!res.ok) {
            const error = await res.json()
            throw new Error(error.error || 'Error al crear la variante')
          }
        }
      }

      toast({ title: 'Producto ingresado', description: `Se agregaron ${cantidad} unidades de "${nombre}"` })
      limpiarFormularioIngresar()
      await Promise.all([fetchProducts(), fetchInventoryValue(), fetchCategoryRollup(), fetchIngresarData()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo ingresar el producto', variant: 'destructive' })
    } finally {
      setSavingIngresar(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        // Límite de tiempo único para toda la carga inicial: supabaseBrowser
        // puede colgarse indefinidamente al refrescar la sesión tras un
        // rato de inactividad de la pestaña (ver lib/supabase-browser.ts).
        await withTimeout(
          Promise.all([fetchProducts(), fetchMovements(), fetchInventoryValue(), fetchCategoryRollup()]),
          15000,
          'Inventario'
        )
      } catch (error) {
        console.error('Error loading inventario:', error)
        setLoadError('No se pudo cargar el inventario. Puede ser un problema temporal de la sesión — intenta de nuevo.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [fetchProducts, fetchMovements, fetchInventoryValue, fetchCategoryRollup])

  // Un producto con tallas no tiene stock propio: vive por variante
  // (ver comentario de fetchProducts). Ajustar aquí a nivel de producto
  // no sube ninguna talla real y deja products.stock_qty desincronizado
  // de la suma de variantes — así que se bloquea con un aviso en vez de
  // dejar que el ajuste "desaparezca" silenciosamente.
  const requireTallaSelection = (product: ProductStock): boolean => {
    if (product.variantCount === 0) return false
    toast({
      title: 'Selecciona la talla primero',
      description: `"${product.title}" tiene tallas — abre "Tallas" abajo y ajusta el stock de la talla exacta, no del producto general.`,
      variant: 'destructive',
    })
    setExpandedProduct(product.id)
    if (!variantsByProduct[product.id]) {
      fetchVariants(product.id)
    }
    return true
  }

  const handleAdjust = async () => {
    if (!session?.access_token || !adjustingProduct || !adjustmentQty) return
    const productoActual = products.find((p) => p.id === adjustingProduct)
    if (productoActual && requireTallaSelection(productoActual)) {
      setAdjustingProduct(null)
      return
    }

    const qty = parseInt(adjustmentQty)
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: 'Error',
        description: 'La cantidad debe ser un número positivo',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          product_id: adjustingProduct,
          qty,
          type: adjustmentType,
          note: adjustmentNote || `Ajuste manual - ${typeLabels[adjustmentType]}`,
          created_by: userProfile?.id,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al ajustar inventario')
      }

      toast({
        title: 'Inventario ajustado',
        description: `Se registró ${adjustmentType === 'in' ? 'entrada' : adjustmentType === 'out' ? 'salida' : 'ajuste'} de ${qty} unidades`,
      })

      setAdjustingProduct(null)
      setAdjustmentQty('')
      setAdjustmentNote('')
      await Promise.all([fetchProducts(), fetchMovements(), fetchInventoryValue()])
    } catch (error: any) {
      console.error('Error adjusting inventory:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ajustar el inventario',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const fetchVariants = useCallback(
    async (productId: string) => {
      if (!session?.access_token) return
      setLoadingVariants(true)
      try {
        const res = await fetch(`/api/products/${productId}/variants`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) throw new Error('Error fetching variants')
        const { data } = await res.json()
        setVariantsByProduct((prev) => ({ ...prev, [productId]: data || [] }))
      } catch (error) {
        console.error('Error fetching product variants:', error)
      } finally {
        setLoadingVariants(false)
      }
    },
    [session?.access_token]
  )

  // Si el admin cambia a otra pestaña (ej. a Registrar Venta a hacer una
  // venta) o a otra ventana y vuelve aquí, lo que se ve en pantalla puede
  // haber quedado desactualizado por lo que se hizo en otro lado — se
  // refresca solo al recuperar el foco, salvo que haya un ajuste/edición
  // sin guardar en curso (para no perder lo que el admin esté escribiendo
  // a mitad de un cambio). Con debounce de 3s para no duplicar la llamada
  // cuando visibilitychange y focus disparan casi al mismo tiempo.
  const lastFocusRefreshRef = useRef(0)
  useEffect(() => {
    const isEditingSomething = () =>
      Boolean(editingProduct || editingVariant || adjustingProduct || adjustingVariant)

    const refreshIfIdle = () => {
      if (document.visibilityState !== 'visible') return
      if (isEditingSomething()) return
      const now = Date.now()
      if (now - lastFocusRefreshRef.current < 3000) return
      lastFocusRefreshRef.current = now
      fetchProducts()
      fetchMovements()
      fetchInventoryValue()
      fetchCategoryRollup()
      if (expandedProduct) fetchVariants(expandedProduct)
    }

    document.addEventListener('visibilitychange', refreshIfIdle)
    window.addEventListener('focus', refreshIfIdle)
    return () => {
      document.removeEventListener('visibilitychange', refreshIfIdle)
      window.removeEventListener('focus', refreshIfIdle)
    }
  }, [
    editingProduct,
    editingVariant,
    adjustingProduct,
    adjustingVariant,
    expandedProduct,
    fetchProducts,
    fetchMovements,
    fetchInventoryValue,
    fetchCategoryRollup,
    fetchVariants,
  ])

  const toggleVariants = (productId: string) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
      return
    }
    setExpandedProduct(productId)
    setNewVariant({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
    newVariantBarcodeAutoRef.current = ''
    if (!variantsByProduct[productId]) {
      fetchVariants(productId)
    }
  }

  const handleAddVariant = async (productId: string) => {
    if (!session?.access_token) return
    if (!newVariant.talla.trim() && !newVariant.barcode.trim()) {
      toast({
        title: 'Error',
        description: 'Ingresa al menos la talla o el código de barras',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingVariant(true)
      const res = await fetch(`/api/products/${productId}/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          talla: newVariant.talla.trim() || null,
          barcode: newVariant.barcode.trim() || null,
          stock_qty: parseInt(newVariant.stock_qty) || 0,
          cost_cents: Math.round((parseFloat(newVariant.cost_cents) || 0) * 100),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear la variante')
      }

      toast({ title: 'Variante creada', description: 'Se agregó la talla al producto' })
      setNewVariant({ talla: '', barcode: '', stock_qty: '', cost_cents: '' })
      newVariantBarcodeAutoRef.current = ''
      // products.stock_qty se recalcula solo (trigger de sincronización),
      // pero el estado `products` de esta pantalla no se actualiza solo —
      // sin refrescarlo aquí, la columna "Stock" y las tarjetas de arriba
      // quedan mostrando el valor viejo hasta recargar la página.
      await Promise.all([fetchVariants(productId), fetchProducts(), fetchInventoryValue(), fetchCategoryRollup()])
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la variante',
        variant: 'destructive',
      })
    } finally {
      setSavingVariant(false)
    }
  }

  const handleDeleteVariant = async (productId: string, variantId: string, talla: string | null) => {
    if (!session?.access_token) return
    if (!confirm(`¿Eliminar la talla "${talla || 'sin nombre'}"? Esta acción no se puede deshacer.`)) {
      return
    }
    try {
      const res = await fetch(`/api/product-variants/${variantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Error al eliminar la talla')
      toast({ title: 'Talla eliminada' })
      await Promise.all([fetchVariants(productId), fetchProducts(), fetchInventoryValue(), fetchCategoryRollup()])
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la talla',
        variant: 'destructive',
      })
    }
  }

  const handleAdjustVariant = async (productId: string, variantId: string) => {
    if (!session?.access_token || !variantAdjQty) return
    const qty = parseInt(variantAdjQty)
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: 'Error',
        description: 'La cantidad debe ser un número positivo',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          product_id: productId,
          variant_id: variantId,
          qty,
          type: variantAdjType,
          note: `Ajuste manual variante - ${typeLabels[variantAdjType]}`,
          created_by: userProfile?.id,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al ajustar la variante')
      }

      toast({ title: 'Variante ajustada' })
      setAdjustingVariant(null)
      setVariantAdjQty('')
      // Mismo motivo que en handleAddVariant: sin refrescar `products` y
      // `movements` aquí, la fila del producto y la pestaña Movimientos
      // quedan desincronizadas del valor real hasta recargar la página —
      // riesgo real de doble-ajustar por error si se sigue trabajando en la
      // misma sesión sin recargar.
      await Promise.all([fetchVariants(productId), fetchProducts(), fetchMovements(), fetchInventoryValue()])
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo ajustar la variante',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const startEditProduct = (product: ProductStock) => {
    setEditingProduct(product.id)
    setEditProductForm({
      title: product.title,
      costo: (product.cost_cents / 100).toString(),
      precio: (product.price_cents / 100).toString(),
      stock: product.stock_qty.toString(),
      umbral: product.low_stock_threshold.toString(),
      barcode: product.barcode || '',
    })
  }

  const handleSaveProductEdit = async (productId: string) => {
    if (!session?.access_token) return
    const title = editProductForm.title.trim()
    if (!title) {
      toast({ title: 'Error', description: 'El nombre no puede estar vacío', variant: 'destructive' })
      return
    }
    const nuevoStock = parseInt(editProductForm.stock) || 0
    try {
      setSavingProductEdit(true)
      // 1. Traer el producto completo — PUT exige el esquema entero, así
      // que se fusiona con los campos editados para no pisar price/images/etc.
      const getRes = await fetch(`/api/products/${productId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!getRes.ok) throw new Error('No se pudo cargar el producto')
      const current = await getRes.json()
      const stockAnterior = current.stock_qty as number

      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title,
          sku: current.sku,
          description: current.description,
          price_cents: Math.round((parseFloat(editProductForm.precio) || 0) * 100),
          cost_cents: Math.round((parseFloat(editProductForm.costo) || 0) * 100),
          compare_at_price_cents: current.compare_at_price_cents,
          category_id: current.category_id,
          images: current.images || [],
          stock_qty: stockAnterior,
          low_stock_threshold: parseInt(editProductForm.umbral) || 0,
          tags: current.tags || [],
          active: current.active,
          featured: current.featured,
          slug: current.slug,
          barcode: editProductForm.barcode.trim() || null,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al actualizar el producto')
      }

      // 2. Si la cantidad cambió, registrarlo como "Ajuste" (igual que
      // actualizar_producto del local, que deja rastro en Movimientos).
      // Si el producto tiene tallas, este campo NUNCA debe escribir sobre
      // products.stock_qty directo — se pierde en el siguiente movimiento
      // de cualquier talla (el trigger de sincronización lo recalcula y lo
      // pisa sin avisar). Mismo criterio que ya usa requireTallaSelection
      // para los botones rápidos de Entrada/Salida/Ajuste.
      const productoEditado = products.find((p) => p.id === productId)
      if (nuevoStock !== stockAnterior && productoEditado?.variantCount) {
        toast({
          title: 'Cantidad no actualizada',
          description: 'Este producto tiene tallas — ajusta el stock desde la sección de Tallas, no desde aquí.',
          variant: 'destructive',
        })
      } else if (nuevoStock !== stockAnterior) {
        await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            product_id: productId,
            qty: nuevoStock,
            type: 'adjustment',
            note: 'Ajuste manual desde edición de producto',
            created_by: userProfile?.id,
          }),
        })
      }

      toast({ title: 'Producto actualizado' })
      setEditingProduct(null)
      await Promise.all([fetchProducts(), fetchMovements(), fetchInventoryValue(), fetchCategoryRollup()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo actualizar el producto', variant: 'destructive' })
    } finally {
      setSavingProductEdit(false)
    }
  }

  const startEditVariant = (variant: ProductVariant) => {
    setEditingVariant(variant.id)
    setEditVariantForm({
      talla: variant.talla || '',
      costo: (variant.cost_cents / 100).toString(),
      stock: variant.stock_qty.toString(),
      umbral: variant.low_stock_threshold.toString(),
      barcode: variant.barcode || '',
    })
  }

  const handleSaveVariantEdit = async (productId: string, variantId: string, stockAnterior: number) => {
    if (!session?.access_token) return
    const nuevoStock = parseInt(editVariantForm.stock) || 0
    try {
      setSavingVariantEdit(true)
      const res = await fetch(`/api/product-variants/${variantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          talla: editVariantForm.talla.trim() || null,
          barcode: editVariantForm.barcode.trim() || null,
          cost_cents: Math.round((parseFloat(editVariantForm.costo) || 0) * 100),
          low_stock_threshold: parseInt(editVariantForm.umbral) || 0,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al actualizar la variante')
      }

      if (nuevoStock !== stockAnterior) {
        await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            product_id: productId,
            variant_id: variantId,
            qty: nuevoStock,
            type: 'adjustment',
            note: 'Ajuste manual desde edición de variante',
            created_by: userProfile?.id,
          }),
        })
      }

      toast({ title: 'Variante actualizada' })
      setEditingVariant(null)
      // Mismo motivo que en handleAddVariant/handleAdjustVariant: sin
      // refrescar `products`/`movements`, la fila del producto ("Stock"
      // y las tarjetas de arriba) se queda con el valor viejo hasta
      // recargar la página, aunque el ajuste ya haya quedado bien en la BD.
      await Promise.all([fetchVariants(productId), fetchProducts(), fetchMovements(), fetchInventoryValue()])
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo actualizar la variante', variant: 'destructive' })
    } finally {
      setSavingVariantEdit(false)
    }
  }

  const filteredProducts = products.filter((product) => {
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch =
      product.title.toLowerCase().includes(q) ||
      (product.sku?.toLowerCase().includes(q) ?? false) ||
      (product.barcode?.toLowerCase().includes(q) ?? false) ||
      product.variantBarcodes.some((b) => b.toLowerCase().includes(q))
    const matchesLowStock = !showLowStock || product.stock_qty <= product.low_stock_threshold
    return matchesSearch && matchesLowStock
  })

  const lowStockCount = products.filter(
    (p) => p.stock_qty <= p.low_stock_threshold
  ).length

  // Todos los códigos de barras ya usados en el catálogo (producto base +
  // variantes) — para que "Generar automático" nunca repita uno existente,
  // igual que ya hace la pestaña Ingresar con generarCodigoBarrasAuto.
  const codigosExistentesGlobal = products.flatMap((p) => [p.barcode, ...p.variantBarcodes]).filter((c): c is string => !!c)

  // Sugiere el código de barras de una talla nueva: si el producto ya tiene
  // alguna variante con código válido, deriva de esa (misma familia,
  // solo cambia el dígito de talla — ver derivarCodigoBarrasHermano); si no
  // tiene ninguna todavía, genera uno nuevo desde cero. Evita que agregar
  // una talla desde "Agregar talla" quede sin código o con uno de otra
  // familia por escribirlo a mano (ver docs/UNIFICACION_YJBMOTOCOM.md 58).
  const sugerirBarcodeVariante = (nombreProducto: string, talla: string, variantesExistentes: { barcode: string | null }[]): string => {
    if (!talla.trim()) return ''
    const hermano = variantesExistentes.find((v) => v.barcode && /^\d{10}$/.test(v.barcode))
    const derivado = hermano?.barcode ? derivarCodigoBarrasHermano(hermano.barcode, talla) : null
    return derivado || generarCodigoBarrasAuto(nombreProducto, talla, codigosExistentesGlobal)
  }

  const handleGenerarBarcodeProducto = async (product: ProductStock) => {
    if (!session?.access_token) return
    const nuevoCodigo = generarCodigoBarrasAuto(product.title, 'N/A', codigosExistentesGlobal)
    try {
      const getRes = await fetch(`/api/products/${product.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!getRes.ok) throw new Error('No se pudo cargar el producto')
      const current = await getRes.json()
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...current, barcode: nuevoCodigo }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al generar el código de barras')
      }
      toast({ title: 'Código de barras generado', description: nuevoCodigo })
      await fetchProducts()
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'No se pudo generar el código de barras', variant: 'destructive' })
    }
  }

  const outOfStockCount = products.filter((p) => p.stock_qty === 0).length

  const totalStock = products.reduce((sum, p) => sum + p.stock_qty, 0)

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStockStatus = (qty: number, threshold: number) => {
    if (qty === 0) {
      return { label: 'Sin stock', color: 'bg-red-500/10 text-red-500 border-red-500/20' }
    }
    if (qty <= threshold) {
      return { label: 'Stock bajo', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' }
    }
    return { label: 'En stock', color: 'bg-green-500/10 text-green-500 border-green-500/20' }
  }

  // Diálogo "Exportar inventario" — puerto de _ExportarInventarioDialog +
  // generar_pdf_inventario del software local (mismas opciones: qué
  // incluir, categoría, talla, orden, resumen por categoría), más la
  // opción de formato Excel/PDF que no existía en el local (allá el botón
  // PDF y el de Excel eran cosas separadas).
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('pdf')
  const [exportAlcance, setExportAlcance] = useState<'todos' | 'con_stock' | 'bajo_minimo'>('todos')
  const [exportCategoria, setExportCategoria] = useState('')
  const [exportTalla, setExportTalla] = useState('')
  const [exportOrden, setExportOrden] = useState<'nombre' | 'categoria' | 'stock_desc' | 'stock_asc'>('nombre')
  const [exportIncluirResumen, setExportIncluirResumen] = useState(true)

  const openExportDialog = () => {
    setShowExportDialog(true)
    if (!ingresarLoaded) fetchIngresarData()
  }

  const categoriasDisponibles = Array.from(new Set(itemsInventario.map((i) => i.categoria))).sort()
  const tallasDisponiblesExport = Array.from(
    new Set(itemsInventario.filter((i) => i.talla).map((i) => i.talla as string))
  ).sort()

  const esBajoStock = (i: ItemInventario) =>
    (i.lowStockThreshold > 0 && i.stockQty < i.lowStockThreshold) ||
    (i.lowStockThreshold === 0 && i.stockQty > 0 && i.stockQty <= 2)

  const itemsParaExportar = () => {
    let items = [...itemsInventario]
    if (exportAlcance === 'con_stock') items = items.filter((i) => i.stockQty > 0)
    else if (exportAlcance === 'bajo_minimo') items = items.filter(esBajoStock)
    if (exportCategoria) items = items.filter((i) => i.categoria === exportCategoria)
    if (exportTalla === '__sin_talla__') items = items.filter((i) => !i.talla)
    else if (exportTalla) items = items.filter((i) => i.talla === exportTalla)

    const ordenadores: Record<string, (a: ItemInventario, b: ItemInventario) => number> = {
      nombre: (a, b) => a.title.localeCompare(b.title),
      categoria: (a, b) => a.categoria.localeCompare(b.categoria) || a.title.localeCompare(b.title),
      stock_desc: (a, b) => b.stockQty - a.stockQty || a.title.localeCompare(b.title),
      stock_asc: (a, b) => a.stockQty - b.stockQty || a.title.localeCompare(b.title),
    }
    return items.sort(ordenadores[exportOrden])
  }

  const resumenPorCategoria = (items: ItemInventario[]) => {
    const grupos = new Map<string, { refs: number; uds: number; valor: number }>()
    for (const i of items) {
      const g = grupos.get(i.categoria) || { refs: 0, uds: 0, valor: 0 }
      g.refs += 1
      g.uds += i.stockQty
      g.valor += i.stockQty * i.costCents
      grupos.set(i.categoria, g)
    }
    return Array.from(grupos.entries())
      .map(([categoria, d]) => ({ categoria, ...d }))
      .sort((a, b) => b.uds - a.uds)
  }

  const handleGenerarExportacion = () => {
    const items = itemsParaExportar()

    if (exportFormat === 'excel') {
      const headers = ['Serial', 'Producto', 'Talla', 'Categoría', 'Costo Unitario', 'Cantidad', 'Código de Barras']
      const rows = items.map((i) => [
        i.sku || '',
        i.title,
        i.talla || 'N/A',
        i.categoria,
        (i.costCents / 100).toString(),
        i.stockQty.toString(),
        i.barcode || '',
      ])
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventario-${bogotaDateStr(new Date())}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setShowExportDialog(false)
      return
    }

    // PDF: se genera como HTML y se imprime desde el navegador (mismo
    // patrón que /api/orders/[id]/invoice), en vez de un renderizador de
    // PDF en servidor.
    const totalRefs = items.length
    const totalUds = items.reduce((s, i) => s + i.stockQty, 0)
    const totalValor = items.reduce((s, i) => s + i.stockQty * i.costCents, 0)
    const ahora = new Date().toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const alcanceTxt = { todos: 'Todos los productos', con_stock: 'Solo con stock', bajo_minimo: 'Solo bajo el mínimo' }[
      exportAlcance
    ]
    const partesFiltro = [alcanceTxt]
    if (exportCategoria) partesFiltro.push(`Categoría: ${exportCategoria}`)
    if (exportTalla) partesFiltro.push(`Talla: ${exportTalla === '__sin_talla__' ? 'Sin talla' : exportTalla}`)

    const filasTabla = items
      .map((i, idx) => {
        const bajo = esBajoStock(i)
        const nombreTxt = i.title + (bajo ? ' (!)' : '')
        return `<tr style="${bajo ? 'font-weight:bold;color:#DC2626;' : ''}">
          <td style="text-align:center">${idx + 1}</td>
          <td>${nombreTxt}</td>
          <td style="text-align:center">${i.sku || '—'}</td>
          <td style="text-align:center">${i.stockQty}</td>
          <td style="text-align:right">${formatPrice(i.costCents)}</td>
          <td style="text-align:right">${formatPrice(i.stockQty * i.costCents)}</td>
        </tr>`
      })
      .join('')

    const resumenCatHtml = exportIncluirResumen
      ? `<h3 style="color:#1E293B;font-size:13px;margin:18px 0 6px;">Resumen por Categoría</h3>
         <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
           <thead><tr style="background:#1E293B;color:white;">
             <th style="padding:6px;text-align:left;">Categoría</th>
             <th style="padding:6px;">Referencias</th>
             <th style="padding:6px;">Unidades en Stock</th>
             <th style="padding:6px;text-align:right;">Valor en Stock</th>
           </tr></thead>
           <tbody>
             ${resumenPorCategoria(items)
               .map(
                 (g) => `<tr style="border-bottom:1px solid #E5E7EB;">
                   <td style="padding:6px;font-weight:bold;">${g.categoria}</td>
                   <td style="padding:6px;text-align:center;">${g.refs}</td>
                   <td style="padding:6px;text-align:center;">${g.uds}</td>
                   <td style="padding:6px;text-align:right;color:#1D4ED8;">${formatPrice(g.valor)}</td>
                 </tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventario — YJBMOTOCOM</title>
      <style>
        body { font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #111827; }
        h1 { font-size: 20px; color: #1E293B; margin: 0 0 2px; }
        h2 { font-size: 14px; color: #2563EB; font-weight: normal; margin: 0 0 6px; }
        .meta { font-size: 11px; color: #6B7280; margin-bottom: 10px; }
        hr { border: none; border-top: 1px solid #1E293B; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #E5E7EB; padding: 6px 8px; }
        thead tr { background: #1E293B; color: white; }
        .resumen td { text-align: center; font-weight: bold; font-size: 13px; }
        .footer { margin-top: 20px; border-top: 1px solid #E5E7EB; padding-top: 8px; font-size: 9px; color: #9CA3AF; text-align: center; }
        @media print { .no-print { display: none; } }
      </style></head>
      <body>
        <button class="no-print" onclick="window.print()" style="padding:10px 24px;background:#e11d48;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-bottom:16px;">Imprimir / Guardar como PDF</button>
        <h1>YJBMOTOCOM</h1>
        <h2>Listado de Inventario</h2>
        <p class="meta">Generado: ${ahora} &nbsp;•&nbsp; ${partesFiltro.join(' &nbsp;•&nbsp; ')}</p>
        <hr />
        <table class="resumen" style="margin-bottom:14px;">
          <thead><tr><th>Referencias</th><th>Unidades en Stock</th><th>Valor en Costo</th></tr></thead>
          <tbody><tr><td>${totalRefs}</td><td style="color:#15803D;">${totalUds}</td><td style="color:#1D4ED8;">${formatPrice(totalValor)}</td></tr></tbody>
        </table>
        ${resumenCatHtml}
        <table>
          <thead><tr><th>#</th><th>Producto</th><th>Serial</th><th>Stock</th><th>Costo Unit.</th><th>Valor Total</th></tr></thead>
          <tbody>${filasTabla || '<tr><td colspan="6" style="text-align:center;color:#9CA3AF;">No hay productos para mostrar.</td></tr>'}</tbody>
        </table>
        <p class="footer">YJBMOTOCOM &nbsp;•&nbsp; Inventario generado el ${ahora}</p>
      </body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
    setShowExportDialog(false)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventario</h1>
          <p className="text-muted-foreground">
            Gestiona el stock de tus productos
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Link href="/admin/inventario/cargue-pedidos">
              <Button variant="outline" className="rounded-xl">
                <Upload className="mr-2 h-4 w-4" />
                Cargue de Pedidos
              </Button>
            </Link>
          )}
          {canEdit && (
            <Button variant="outline" className="rounded-xl" onClick={openAjusteModal}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Nuevo ajuste de inventario
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={openExportDialog}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {showAjusteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          {/* Sin overflow-y-auto ni max-h en la tabla: si el desplegable de
              resultados de cada fila viviera dentro de un contenedor con su
              propio scroll, quedaría recortado (invisible) aunque exista en
              el DOM — el overlay de arriba (del tamaño del viewport) es el
              único que hace scroll, así el buscador nunca se corta. */}
          <div className="mx-auto w-full max-w-4xl rounded-xl border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Nuevo ajuste de inventario</h2>
                <p className="text-sm text-muted-foreground">
                  Ajusta las cantidades de varios productos a la vez, registrando incrementos o disminuciones —
                  pensado para un conteo físico.
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setShowAjusteModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {loadingIngresar ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-secondary/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Producto</th>
                        <th className="p-2 text-right">Cant. actual</th>
                        <th className="p-2 text-left">Tipo de ajuste</th>
                        <th className="p-2 text-right">Cantidad</th>
                        <th className="p-2 text-right">Costo promedio</th>
                        <th className="p-2 text-right">Cant. final</th>
                        <th className="p-2 text-right">Total ajustado</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ajusteRows.map((row) => {
                        const results = ajusteFocusedRow === row.key && !row.item ? ajusteResultsFor(row.query) : []
                        const cantidadFinal = ajusteCantidadFinal(row)
                        return (
                          <tr key={row.key} className="border-t">
                            <td className="relative p-2">
                              <Input
                                placeholder="Buscar producto..."
                                value={row.query}
                                onFocus={() => setAjusteFocusedRow(row.key)}
                                onChange={(e) => updateAjusteRow(row.key, { item: null, query: e.target.value })}
                                className="h-9 min-w-[220px] rounded-lg text-sm"
                              />
                              {results.length > 0 && (
                                <div className="absolute left-2 right-2 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-card shadow-lg">
                                  {results.map((item) => (
                                    <button
                                      key={item.variantId || item.productId}
                                      type="button"
                                      onClick={() => selectAjusteItem(row.key, item)}
                                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary"
                                    >
                                      <span>
                                        {item.title}
                                        {item.talla && <span className="text-muted-foreground"> — {item.talla}</span>}
                                      </span>
                                      <span className="text-xs text-muted-foreground">Stock: {item.stockQty}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-right text-muted-foreground">{row.item ? row.item.stockQty : '—'}</td>
                            <td className="p-2">
                              <select
                                value={row.tipo}
                                onChange={(e) => updateAjusteRow(row.key, { tipo: e.target.value as 'incremento' | 'disminucion' })}
                                className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                              >
                                <option value="incremento">Incremento</option>
                                <option value="disminucion">Disminución</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                value={row.cantidad}
                                onChange={(e) => updateAjusteRow(row.key, { cantidad: e.target.value })}
                                className="h-9 w-24 rounded-lg text-right text-sm"
                              />
                            </td>
                            <td className="p-2 text-right text-muted-foreground">
                              {row.item ? formatPrice(row.item.costCents) : '—'}
                            </td>
                            <td
                              className={cn(
                                'p-2 text-right font-medium',
                                row.item && cantidadFinal < 0 && 'text-red-500'
                              )}
                            >
                              {row.item ? cantidadFinal : '—'}
                            </td>
                            <td className="p-2 text-right font-medium">
                              {row.item ? formatPrice(ajusteTotalRow(row)) : '—'}
                            </td>
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAjusteRow(row.key)}>
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={addAjusteRow}>
                  <Plus className="mr-1 h-3 w-3" /> Agregar producto
                </Button>

                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Total ajustado: </span>
                    <span className="font-semibold">{formatPrice(ajusteTotalGeneral)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl" onClick={() => setShowAjusteModal(false)}>
                      Cancelar
                    </Button>
                    <Button className="rounded-xl" onClick={handleGuardarAjustes} disabled={savingAjuste}>
                      {savingAjuste && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Guardar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Exportar inventario</h2>

            {loadingIngresar ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Formato</label>
                  <div className="flex gap-2">
                    <Button
                      variant={exportFormat === 'pdf' ? 'default' : 'outline'}
                      className="flex-1 rounded-xl"
                      onClick={() => setExportFormat('pdf')}
                    >
                      PDF
                    </Button>
                    <Button
                      variant={exportFormat === 'excel' ? 'default' : 'outline'}
                      className="flex-1 rounded-xl"
                      onClick={() => setExportFormat('excel')}
                    >
                      Excel
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">¿Qué incluir?</label>
                  <select
                    value={exportAlcance}
                    onChange={(e) => setExportAlcance(e.target.value as typeof exportAlcance)}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="todos">Todos los productos</option>
                    <option value="con_stock">Solo con stock (cantidad &gt; 0)</option>
                    <option value="bajo_minimo">Solo bajo el mínimo configurado</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Categoría</label>
                  <select
                    value={exportCategoria}
                    onChange={(e) => setExportCategoria(e.target.value)}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Todas las categorías</option>
                    {categoriasDisponibles.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Talla</label>
                  <select
                    value={exportTalla}
                    onChange={(e) => setExportTalla(e.target.value)}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Todas las tallas</option>
                    <option value="__sin_talla__">Sin talla</option>
                    {tallasDisponiblesExport.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Ordenar por</label>
                  <select
                    value={exportOrden}
                    onChange={(e) => setExportOrden(e.target.value as typeof exportOrden)}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="nombre">Nombre (A-Z)</option>
                    <option value="categoria">Categoría</option>
                    <option value="stock_desc">Stock (mayor a menor)</option>
                    <option value="stock_asc">Stock (menor a mayor)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exportIncluirResumen}
                    onChange={(e) => setExportIncluirResumen(e.target.checked)}
                  />
                  Incluir resumen agrupado por categoría
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" className="rounded-xl" onClick={() => setShowExportDialog(false)}>
                    Cancelar
                  </Button>
                  <Button className="rounded-xl" onClick={handleGenerarExportacion}>
                    Generar {exportFormat === 'pdf' ? 'PDF' : 'Excel'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={`grid gap-4 sm:grid-cols-4 ${canViewCost ? 'lg:grid-cols-5' : ''}`}>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-sm text-muted-foreground">Productos</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <Package className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalStock}</p>
              <p className="text-sm text-muted-foreground">Unidades en stock</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{lowStockCount}</p>
              <p className="text-sm text-muted-foreground">Stock bajo</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <Package className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{outOfStockCount}</p>
              <p className="text-sm text-muted-foreground">Sin stock</p>
            </div>
          </div>
        </div>
        {canViewCost && (
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                <Package className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inventoryValue === null ? '—' : formatPrice(inventoryValue)}</p>
                <p className="text-sm text-muted-foreground">Valor en costo (todo el inventario)</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('detalle')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'detalle'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <List className="h-4 w-4" />
          Detalle
        </button>
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'general'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          Inventario General
        </button>
        {/* Historial completo de movimientos (quién ajustó qué y cuándo,
            con notas) — es un registro de auditoría, no algo que un
            vendedor necesite para su operación diaria (a diferencia de
            "Inventario General", que sí necesita ver para poder cuadrar
            el conteo físico contra el sistema). El admin de solo lectura
            SÍ lo ve (ve absolutamente todo, igual que Auditoría). */}
        {(canEdit || isReadOnlyAdmin) && (
          <button
            onClick={() => setActiveTab('movimientos')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'movimientos'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Movimientos
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setActiveTab('ingresar')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'ingresar'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <PackagePlus className="h-4 w-4" />
            Ingresar
          </button>
        )}
        {/* Cambios (cambio físico de producto, ej. misma talla en otro
            color) es una operación normal de mostrador — igual que
            Registrar Venta, la puede hacer cualquier vendedor, no es
            administrativa. */}
        <Link
          href="/admin/inventario/cambios"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCcw className="h-4 w-4" />
          Cambios
        </Link>
      </div>

      {activeTab === 'ingresar' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Formulario */}
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <div>
              <label className="mb-1 block text-sm font-medium">Nombre del producto</label>
              <Input
                list="ingresar-nombres"
                value={ingresarNombre}
                onChange={(e) => setIngresarNombre(e.target.value)}
                placeholder="Ej: CASCO XTRONG M70 NEGRO MATE"
                className="rounded-xl"
              />
              <datalist id="ingresar-nombres">
                {nombresSugeridos.slice(0, 20).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={ingresarTieneTallas}
                onChange={(e) => setIngresarTieneTallas(e.target.checked)}
              />
              Este producto tiene tallas
            </label>

            {ingresarTieneTallas ? (
              <div>
                <label className="mb-1 block text-sm font-medium">Tallas a crear</label>
                <div className="flex flex-wrap gap-3 rounded-xl border p-3">
                  {TALLAS_ESTANDAR.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={ingresarTallasSeleccionadas.includes(t)}
                        onChange={(e) =>
                          setIngresarTallasSeleccionadas((prev) =>
                            e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                          )
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se crea una variante por cada talla marcada, con código de barras automático (misma familia, solo cambia el dígito de talla). Desmarca las que no apliquen.
                </p>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">Talla</label>
                <select
                  value={ingresarTalla}
                  onChange={(e) => setIngresarTalla(e.target.value)}
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  {TALLAS_DISPONIBLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                {ingresarTieneTallas ? 'Cantidad por talla' : 'Cantidad a ingresar'}
              </label>
              <Input
                type="number"
                min={ingresarTieneTallas ? '0' : '1'}
                value={ingresarCantidad}
                onChange={(e) => setIngresarCantidad(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Costo unitario</label>
              <MoneyInput
                value={ingresarCosto}
                onChange={setIngresarCosto}
                placeholder="0"
                className="rounded-xl"
              />
            </div>

            {ingresarTieneTallas ? null : (
            <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ingresarManual}
                onChange={(e) => setIngresarManual(e.target.checked)}
              />
              Editar serial / código manualmente
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Serial (auto)</label>
                <Input
                  value={ingresarManual ? ingresarSerialManual : serialSugerido}
                  onChange={(e) => setIngresarSerialManual(e.target.value)}
                  disabled={!ingresarManual}
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">
                  Código de barras (auto)
                </label>
                <Input
                  value={ingresarManual ? ingresarBarcodeManual : barcodeSugerido}
                  onChange={(e) => setIngresarBarcodeManual(e.target.value)}
                  disabled={!ingresarManual}
                  className="rounded-xl"
                />
              </div>
            </div>
            </>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="rounded-xl" onClick={limpiarFormularioIngresar}>
                <X className="mr-2 h-4 w-4" />
                Limpiar campos
              </Button>
              <Button className="flex-1 rounded-xl" onClick={handleIngresar} disabled={savingIngresar}>
                {savingIngresar ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Ingresar al inventario
              </Button>
            </div>
          </div>

          {/* Productos similares */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="mb-1 text-lg font-semibold">Productos similares</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {categoriaDetectada
                ? 'Productos de la misma categoría detectada — revisa antes de crear uno duplicado.'
                : 'Escribe un nombre para ver productos parecidos.'}
            </p>
            {loadingIngresar ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-2">Serial</th>
                      <th className="py-2 pr-2">Producto</th>
                      <th className="py-2 pr-2">Talla</th>
                      <th className="py-2 text-right">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosSimilares.slice(0, 100).map((i) => (
                      <tr key={i.variantId || i.productId} className="border-b last:border-0">
                        <td className="py-2 pr-2 text-muted-foreground">{i.sku || '-'}</td>
                        <td className="py-2 pr-2">{i.title}</td>
                        <td className="py-2 pr-2">{i.talla || 'N/A'}</td>
                        <td className="py-2 text-right">{i.stockQty}</td>
                      </tr>
                    ))}
                    {categoriaDetectada && productosSimilares.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No hay productos en esta categoría todavía
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'movimientos' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por producto..."
                value={movimientosSearch}
                onChange={(e) => setMovimientosSearch(e.target.value)}
                className="rounded-xl pl-10"
              />
            </div>
            <select
              value={movimientosTipo}
              onChange={(e) => setMovimientosTipo(e.target.value)}
              className="rounded-xl border bg-background px-3 py-2 text-sm"
            >
              <option value="">Todos los tipos</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button variant="outline" className="rounded-xl" onClick={fetchFullMovements}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </div>

          <div className="rounded-xl border bg-card">
            {loadingMovimientos ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Cargando movimientos...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Fecha</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Hora</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Producto</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Tipo</th>
                      <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">Cambio</th>
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovimientos.map((m) => {
                      const d = new Date(m.created_at)
                      const esPositivo = m.qty > 0
                      return (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-6 py-4 text-sm">
                            {d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: BOGOTA_TZ })}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {formatBogotaTime(m.created_at)}
                          </td>
                          <td className="px-6 py-4 font-medium">{m.product?.title || 'Producto eliminado'}</td>
                          <td className="px-6 py-4 text-sm">{typeLabels[m.type] || m.type}</td>
                          <td
                            className={`px-6 py-4 text-center font-bold ${
                              esPositivo ? 'text-green-600' : m.qty < 0 ? 'text-red-600' : 'text-muted-foreground'
                            }`}
                          >
                            {esPositivo ? '+' : ''}
                            {m.qty}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">{m.note || '-'}</td>
                        </tr>
                      )
                    })}
                    {filteredMovimientos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          No se encontraron movimientos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Mostrando los últimos {movimientosFull.length} movimientos.
          </p>
        </div>
      ) : activeTab === 'general' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar categoría..."
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                className="rounded-xl pl-10"
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            {loadingGeneral ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Cargando inventario general...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                        Categoría
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                        Referencias
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                        Unidades en Stock
                      </th>
                      {canViewCost && (
                        <th className="px-6 py-4 text-right text-sm font-medium text-muted-foreground">
                          Valor en Stock
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategoryGroups.map((g) => (
                      <tr key={g.categoria} className="border-b last:border-0">
                        <td className="px-6 py-4 font-semibold">{g.categoria}</td>
                        <td className="px-6 py-4 text-center text-muted-foreground">{g.refs}</td>
                        <td
                          className={`px-6 py-4 text-center text-lg font-bold ${
                            g.uds > 5 ? 'text-green-600' : g.uds > 0 ? 'text-orange-500' : 'text-red-600'
                          }`}
                        >
                          {g.uds}
                        </td>
                        {canViewCost && (
                          <td className="px-6 py-4 text-right font-medium text-blue-600">
                            {formatPrice(g.valor)}
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredCategoryGroups.length === 0 && (
                      <tr>
                        <td colSpan={canViewCost ? 4 : 3} className="px-6 py-12 text-center text-muted-foreground">
                          No se encontraron categorías
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              {filteredCategoryGroups.length} categoría{filteredCategoryGroups.length !== 1 ? 's' : ''}
            </span>
            <span>{filteredCategoryGroups.reduce((s, g) => s + g.uds, 0)} unidades en stock</span>
            {canViewCost && (
              <span>Valor: {formatPrice(filteredCategoryGroups.reduce((s, g) => s + g.valor, 0))}</span>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU o código de barras..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-10"
          />
        </div>
        <Button
          variant={showLowStock ? 'default' : 'outline'}
          onClick={() => setShowLowStock(!showLowStock)}
          className="rounded-xl"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          Stock bajo ({lowStockCount})
        </Button>
      </div>

      {/* Products Table */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Cargando inventario...</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Producto
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      SKU
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Categoría
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Stock
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Estado
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-muted-foreground">
                      Precio
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Tallas
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(
                      product.stock_qty,
                      product.low_stock_threshold
                    )
                    const isAdjusting = adjustingProduct === product.id
                    const isEditingProduct = editingProduct === product.id
                    const isExpanded = expandedProduct === product.id
                    const variants = variantsByProduct[product.id] || []
                    return (
                      <Fragment key={product.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-6 py-4">
                          <p className="font-medium">{product.title}</p>
                        </td>
                        <td className="px-6 py-4">
                          <code className="rounded bg-muted px-2 py-1 text-sm">
                            {product.sku || '-'}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {product.category?.name || 'Sin categoría'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xl font-bold">{product.stock_qty}</span>
                          <span className="text-sm text-muted-foreground">
                            {' '}/ mín {product.low_stock_threshold}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={status.color}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatPrice(product.price_cents)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg"
                            onClick={() => toggleVariants(product.id)}
                          >
                            <Tags className="mr-1 h-4 w-4" />
                            {variantsByProduct[product.id]?.length ?? '·'}
                            {isExpanded ? (
                              <ChevronDown className="ml-1 h-3 w-3" />
                            ) : (
                              <ChevronRight className="ml-1 h-3 w-3" />
                            )}
                          </Button>
                        </td>
                        <td className="px-6 py-4">
                          {!canEdit ? (
                            <p className="text-center text-xs text-muted-foreground">Solo lectura</p>
                          ) : isEditingProduct ? (
                            <div className="flex w-64 flex-col gap-1.5">
                              <Input
                                placeholder="Nombre"
                                value={editProductForm.title}
                                onChange={(e) => setEditProductForm({ ...editProductForm, title: e.target.value })}
                                className="h-7 rounded-lg text-xs"
                              />
                              <div className="flex gap-1">
                                <MoneyInput
                                  placeholder="Precio de venta"
                                  value={editProductForm.precio}
                                  onChange={(v) => setEditProductForm({ ...editProductForm, precio: v })}
                                  className="h-7 rounded-lg text-xs"
                                />
                                <MoneyInput
                                  placeholder="Costo"
                                  value={editProductForm.costo}
                                  onChange={(v) => setEditProductForm({ ...editProductForm, costo: v })}
                                  className="h-7 rounded-lg text-xs"
                                />
                              </div>
                              <div className="flex gap-1">
                                <Input
                                  type="number"
                                  placeholder="Cant."
                                  value={editProductForm.stock}
                                  onChange={(e) => setEditProductForm({ ...editProductForm, stock: e.target.value })}
                                  className="h-7 w-16 rounded-lg text-xs"
                                  disabled={product.variantCount > 0}
                                  title={product.variantCount > 0 ? 'Este producto tiene tallas — ajusta desde Tallas' : undefined}
                                />
                                <Input
                                  type="number"
                                  placeholder="Mín."
                                  value={editProductForm.umbral}
                                  onChange={(e) => setEditProductForm({ ...editProductForm, umbral: e.target.value })}
                                  className="h-7 w-16 rounded-lg text-xs"
                                />
                              </div>
                              <div className="flex gap-1">
                                <Input
                                  placeholder="Código de barras"
                                  value={editProductForm.barcode}
                                  onChange={(e) => setEditProductForm({ ...editProductForm, barcode: e.target.value })}
                                  className="h-7 rounded-lg text-xs"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 rounded-lg"
                                  title="Generar código de barras automático"
                                  onClick={() =>
                                    setEditProductForm({
                                      ...editProductForm,
                                      barcode: generarCodigoBarrasAuto(editProductForm.title || product.title, 'N/A', codigosExistentesGlobal),
                                    })
                                  }
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => handleSaveProductEdit(product.id)}
                                  disabled={savingProductEdit}
                                >
                                  {savingProductEdit ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => setEditingProduct(null)}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ) : isAdjusting ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-1">
                                <select
                                  value={adjustmentType}
                                  onChange={(e) => setAdjustmentType(e.target.value as 'in' | 'out' | 'adjustment')}
                                  className="rounded-lg border bg-background px-2 py-1 text-xs"
                                >
                                  <option value="in">Entrada</option>
                                  <option value="out">Salida</option>
                                  <option value="adjustment">Ajuste</option>
                                </select>
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Cant."
                                  value={adjustmentQty}
                                  onChange={(e) => setAdjustmentQty(e.target.value)}
                                  className="h-7 w-16 rounded-lg text-xs"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <Input
                                  placeholder="Nota..."
                                  value={adjustmentNote}
                                  onChange={(e) => setAdjustmentNote(e.target.value)}
                                  className="h-7 rounded-lg text-xs"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={handleAdjust}
                                  disabled={saving}
                                >
                                  {saving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => {
                                    setAdjustingProduct(null)
                                    setAdjustmentQty('')
                                    setAdjustmentNote('')
                                  }}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Entrada de stock"
                                onClick={() => {
                                  if (requireTallaSelection(product)) return
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('in')
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Salida de stock"
                                onClick={() => {
                                  if (requireTallaSelection(product)) return
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('out')
                                }}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Ajuste de stock"
                                onClick={() => {
                                  if (requireTallaSelection(product)) return
                                  setAdjustingProduct(product.id)
                                  setAdjustmentType('adjustment')
                                }}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                title="Editar producto"
                                onClick={() => startEditProduct(product)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b bg-muted/30 last:border-0">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">
                                Tallas / variantes de &quot;{product.title}&quot;
                              </p>
                              {loadingVariants && variants.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Cargando variantes...</p>
                              ) : variants.length === 0 ? (
                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">
                                    Este producto no tiene tallas/variantes registradas — sigue usando el stock general de arriba.
                                  </p>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Código de barras:</span>
                                    {product.barcode ? (
                                      <code className="rounded bg-muted px-2 py-1 text-xs">{product.barcode}</code>
                                    ) : (
                                      <>
                                        <span className="text-muted-foreground">Sin código de barras</span>
                                        {canEdit && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 rounded-lg text-xs"
                                            onClick={() => handleGenerarBarcodeProducto(product)}
                                          >
                                            <RefreshCw className="mr-1 h-3 w-3" />
                                            Generar código de barras
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border bg-card">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Talla</th>
                                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Código de barras</th>
                                        <th className="px-4 py-2 text-center font-medium text-muted-foreground">Stock</th>
                                        {canViewCost && (
                                          <th className="px-4 py-2 text-left font-medium text-muted-foreground">Costo</th>
                                        )}
                                        {canEdit && (
                                          <th className="px-4 py-2 text-center font-medium text-muted-foreground">Acciones</th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {variants.map((variant) => {
                                        const variantAdjusting = adjustingVariant === variant.id
                                        const isEditingVariant = editingVariant === variant.id
                                        return (
                                          <tr key={variant.id} className="border-b last:border-0">
                                            <td className="px-4 py-2">{variant.talla || '-'}</td>
                                            <td className="px-4 py-2">
                                              <code className="rounded bg-muted px-2 py-1 text-xs">
                                                {variant.barcode || '-'}
                                              </code>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span className="font-bold">{variant.stock_qty}</span>
                                              {variant.stock_qty <= variant.low_stock_threshold && (
                                                <Badge variant="outline" className="ml-2 bg-orange-500/10 text-orange-500 border-orange-500/20">
                                                  Bajo
                                                </Badge>
                                              )}
                                            </td>
                                            {canViewCost && (
                                              <td className="px-4 py-2">{formatPrice(variant.cost_cents)}</td>
                                            )}
                                            {canEdit && (
                                            <td className="px-4 py-2">
                                              {isEditingVariant ? (
                                                <div className="flex w-56 flex-col gap-1.5">
                                                  <div className="flex gap-1">
                                                    <Input
                                                      placeholder="Talla"
                                                      value={editVariantForm.talla}
                                                      onChange={(e) => setEditVariantForm({ ...editVariantForm, talla: e.target.value })}
                                                      className="h-7 w-16 rounded-lg text-xs"
                                                    />
                                                    <MoneyInput
                                                      placeholder="Costo"
                                                      value={editVariantForm.costo}
                                                      onChange={(v) => setEditVariantForm({ ...editVariantForm, costo: v })}
                                                      className="h-7 rounded-lg text-xs"
                                                    />
                                                  </div>
                                                  <div className="flex gap-1">
                                                    <Input
                                                      type="number"
                                                      placeholder="Cant."
                                                      value={editVariantForm.stock}
                                                      onChange={(e) => setEditVariantForm({ ...editVariantForm, stock: e.target.value })}
                                                      className="h-7 w-16 rounded-lg text-xs"
                                                    />
                                                    <Input
                                                      type="number"
                                                      placeholder="Mín."
                                                      value={editVariantForm.umbral}
                                                      onChange={(e) => setEditVariantForm({ ...editVariantForm, umbral: e.target.value })}
                                                      className="h-7 w-16 rounded-lg text-xs"
                                                    />
                                                  </div>
                                                  <Input
                                                    placeholder="Código de barras"
                                                    value={editVariantForm.barcode}
                                                    onChange={(e) => setEditVariantForm({ ...editVariantForm, barcode: e.target.value })}
                                                    className="h-7 rounded-lg text-xs"
                                                  />
                                                  <div className="flex justify-end gap-1">
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-7 w-7 shrink-0"
                                                      onClick={() => handleSaveVariantEdit(product.id, variant.id, variant.stock_qty)}
                                                      disabled={savingVariantEdit}
                                                    >
                                                      {savingVariantEdit ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                      ) : (
                                                        <Check className="h-3 w-3 text-green-500" />
                                                      )}
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-7 w-7 shrink-0"
                                                      onClick={() => setEditingVariant(null)}
                                                    >
                                                      <X className="h-3 w-3 text-red-500" />
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : variantAdjusting ? (
                                                <div className="flex items-center justify-center gap-1">
                                                  <select
                                                    value={variantAdjType}
                                                    onChange={(e) => setVariantAdjType(e.target.value as 'in' | 'out' | 'adjustment')}
                                                    className="rounded-lg border bg-background px-2 py-1 text-xs"
                                                  >
                                                    <option value="in">Entrada</option>
                                                    <option value="out">Salida</option>
                                                    <option value="adjustment">Ajuste</option>
                                                  </select>
                                                  <Input
                                                    type="number"
                                                    min="1"
                                                    placeholder="Cant."
                                                    value={variantAdjQty}
                                                    onChange={(e) => setVariantAdjQty(e.target.value)}
                                                    className="h-7 w-16 rounded-lg text-xs"
                                                  />
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    onClick={() => handleAdjustVariant(product.id, variant.id)}
                                                    disabled={saving}
                                                  >
                                                    <Check className="h-3 w-3 text-green-500" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 shrink-0"
                                                    onClick={() => {
                                                      setAdjustingVariant(null)
                                                      setVariantAdjQty('')
                                                    }}
                                                  >
                                                    <X className="h-3 w-3 text-red-500" />
                                                  </Button>
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center gap-1">
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-lg"
                                                    title="Ajustar stock de la variante"
                                                    onClick={() => {
                                                      setAdjustingVariant(variant.id)
                                                      setVariantAdjType('in')
                                                    }}
                                                  >
                                                    <RefreshCw className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-lg"
                                                    title="Editar variante"
                                                    onClick={() => startEditVariant(variant)}
                                                  >
                                                    <Pencil className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-lg"
                                                    title="Eliminar talla"
                                                    onClick={() => handleDeleteVariant(product.id, variant.id, variant.talla)}
                                                  >
                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                  </Button>
                                                </div>
                                              )}
                                            </td>
                                            )}
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {canEdit && (
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  placeholder="Talla (ej. M, L, 42)"
                                  value={newVariant.talla}
                                  onChange={(e) => {
                                    const talla = e.target.value
                                    // Se recalcula en CADA tecla (no solo en la primera) — antes,
                                    // como el código dejaba de tocarse en cuanto el campo tenía
                                    // algo, tallas de más de una letra (ej. "XS") quedaban con el
                                    // dígito calculado a partir de la primera letra sola ("X", que
                                    // no es ninguna talla válida y cae al dígito de "N/A"). Solo se
                                    // respeta el código si el usuario lo editó a mano (su valor ya
                                    // no coincide con la última sugerencia automática).
                                    const sugerido = sugerirBarcodeVariante(product.title, talla, variants)
                                    setNewVariant((prev) => {
                                      const tocoAMano = prev.barcode !== '' && prev.barcode !== newVariantBarcodeAutoRef.current
                                      return {
                                        ...prev,
                                        talla,
                                        barcode: tocoAMano ? prev.barcode : sugerido,
                                      }
                                    })
                                    newVariantBarcodeAutoRef.current = sugerido
                                  }}
                                  className="h-8 w-32 rounded-lg text-xs"
                                />
                                <Input
                                  placeholder="Código de barras (auto)"
                                  value={newVariant.barcode}
                                  onChange={(e) => setNewVariant({ ...newVariant, barcode: e.target.value })}
                                  className="h-8 w-40 rounded-lg text-xs"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Stock inicial"
                                  value={newVariant.stock_qty}
                                  onChange={(e) => setNewVariant({ ...newVariant, stock_qty: e.target.value })}
                                  className="h-8 w-28 rounded-lg text-xs"
                                />
                                {canViewCost && (
                                  <MoneyInput
                                    placeholder="Costo unitario"
                                    value={newVariant.cost_cents}
                                    onChange={(v) => setNewVariant({ ...newVariant, cost_cents: v })}
                                    className="h-8 w-28 rounded-lg text-xs"
                                  />
                                )}
                                <Button
                                  size="sm"
                                  className="h-8 rounded-lg"
                                  onClick={() => handleAddVariant(product.id)}
                                  disabled={savingVariant}
                                >
                                  {savingVariant ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <Plus className="mr-1 h-3 w-3" />
                                  )}
                                  Agregar talla
                                </Button>
                              </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredProducts.length === 0 && (
              <div className="p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  No se encontraron productos
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recent Movements */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Movimientos recientes</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay movimientos registrados</p>
        ) : (
          <div className="space-y-3">
            {movements.map((movement) => (
              <div
                key={movement.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      movement.type === 'in' || movement.type === 'return'
                        ? 'bg-green-500/10 text-green-500'
                        : movement.type === 'out' || movement.type === 'sale'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-blue-500/10 text-blue-500'
                    }`}
                  >
                    {movement.type === 'in' || movement.type === 'return' ? (
                      <Plus className="h-4 w-4" />
                    ) : movement.type === 'out' || movement.type === 'sale' ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {movement.product?.title || 'Producto eliminado'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {movement.note || typeLabels[movement.type] || movement.type}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-bold ${
                      movement.type === 'in' || movement.type === 'return'
                        ? 'text-green-500'
                        : movement.type === 'out' || movement.type === 'sale'
                          ? 'text-red-500'
                          : 'text-blue-500'
                    }`}
                  >
                    {movement.type === 'in' || movement.type === 'return' ? '+' :
                     movement.type === 'out' || movement.type === 'sale' ? '-' : ''}
                    {Math.abs(movement.qty)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(movement.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}

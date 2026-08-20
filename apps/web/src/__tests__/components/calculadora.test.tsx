import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalculadoraPage from '@/app/admin/calculadora/page'

// Rol 'seller' (no admin): oculta el buscador de inventario, que trae su
// propio fetch a /api/pos/search — así el DOM queda estable y no hay que
// mockear esa segunda ruta para estos tests, que solo verifican fórmulas.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ userProfile: { role: 'seller' }, session: null }),
}))

// Ubica el input de dinero asociado a una etiqueta de texto plano (el
// componente no usa <label htmlFor>, solo texto adyacente) — "Costo" y
// "Precio de venta" del primer panel comparten estado con sus contrapartes
// del segundo panel, así que escribir en cualquiera de las coincidencias
// actualiza ambas.
function inputNearText(text: string, index = 0) {
  const label = screen.getAllByText(text)[index]
  const input = label.parentElement?.querySelector('input')
  if (!input) throw new Error(`No se encontró un input junto al texto "${text}"`)
  return input
}

describe('Calculadora — Costo + Precio → Margen y comisión', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { pos_commission_rates: { cash: 3 } } }),
    }) as any
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('calcula ganancia, margen real y margen sobre costo desde costo + precio', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(inputNearText('Costo'), '100000')
    await user.type(inputNearText('Precio de venta'), '150000')

    // Ganancia = 150.000 - 100.000 = 50.000
    expect(screen.getByText('$ 50.000')).toBeInTheDocument()
    // % Margen real = 50.000 / 150.000 = 33.3%
    expect(screen.getByText('33.3%')).toBeInTheDocument()
    // % Sobre costo = 50.000 / 100.000 = 50.0%
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('traslada la comisión del método de pago al cliente sin reducir la ganancia registrada', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(inputNearText('Costo'), '100000')
    await user.type(inputNearText('Precio de venta'), '150000')

    // Método por defecto es "cash", con comisión mockeada al 3%.
    // Comisión = 150.000 * 3% = 4.500 · Total cliente = 154.500
    expect(await screen.findByText('$ 4.500')).toBeInTheDocument()
    expect(screen.getByText('$ 154.500')).toBeInTheDocument()
    // La ganancia mostrada no cambia por la comisión (se traslada, no se resta)
    expect(screen.getByText('$ 50.000')).toBeInTheDocument()
  })
})

describe('Calculadora — Costo + Margen deseado → Precio sugerido', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as any
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('modo "margen real": Precio = Costo / (1 - %margen/100)', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(inputNearText('Costo', 0), '100000')
    await user.click(screen.getByRole('button', { name: '50%' }))

    // 100.000 / (1 - 0.5) = 200.000
    expect(screen.getByText('$ 200.000')).toBeInTheDocument()
  })

  it('modo "sobre costo" da un precio distinto para el mismo costo y el mismo %, por diseño', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(inputNearText('Costo', 0), '100000')
    await user.click(screen.getByRole('button', { name: '% Sobre costo' }))
    await user.click(screen.getByRole('button', { name: '50%' }))

    // 100.000 * (1 + 0.5) = 150.000 (no 200.000, que es lo que daría "margen real")
    expect(screen.getByText('$ 150.000')).toBeInTheDocument()
    expect(screen.queryByText('$ 200.000')).not.toBeInTheDocument()
  })
})

describe('Calculadora — Calculadora Rápida', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as any
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('muestra la ganancia instantánea cuando el precio supera el costo', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(screen.getByPlaceholderText('Costo'), '80000')
    await user.type(screen.getByPlaceholderText('Precio venta'), '100000')

    expect(screen.getByText(/Ganancia: \$ 20\.000/)).toBeInTheDocument()
  })

  it('alerta pérdida cuando el precio de venta es menor al costo', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    await user.type(screen.getByPlaceholderText('Costo'), '100000')
    await user.type(screen.getByPlaceholderText('Precio venta'), '80000')

    expect(screen.getByText(/Pérdida: \$ 20\.000/)).toBeInTheDocument()
    expect(screen.getByText(/vendiendo por debajo del costo/)).toBeInTheDocument()
  })
})

describe('Calculadora — Calculadora de Cascos (factura proveedor)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as any
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('calcula el costo real quitando IVA y aplicando el descuento del proveedor', async () => {
    const user = userEvent.setup()
    render(<CalculadoraPage />)

    // Precio de factura con IVA, descuento proveedor por defecto (5%, ya viene seleccionado)
    await user.type(screen.getByPlaceholderText('ej. 302.500'), '302500')

    // (302.500 / 1.19) * (1 - 0.05) = 241.491,6 -> redondeado 241.492
    // (coincide con la fila de 50% de margen real de la tabla, donde ganancia
    // = costo exactamente — por eso se busca junto a su propio rótulo)
    const costoRealLabel = await screen.findByText('Costo real por casco')
    expect(costoRealLabel.nextElementSibling).toHaveTextContent('$ 241.492')
    // Tabla de precios sugeridos: fila de 35% de margen real -> $ 371.526
    expect(screen.getByText('$ 371.526')).toBeInTheDocument()
  })
})

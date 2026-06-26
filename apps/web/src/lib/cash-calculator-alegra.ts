// ============================================================
// Calculador de Cierre de Caja — Algoritmo Knapsack
// YJBMOTOCOM × PlataformaVentasInventariosCierres
// ============================================================

const BASE_OBJETIVO = parseInt(process.env.BASE_OBJETIVO || '450000')
const UMBRAL_MENUDO = parseInt(process.env.UMBRAL_MENUDO || '10000')

const DENOMINACIONES_MONEDAS = [50, 100, 200, 500, 1000]
const DENOMINACIONES_BILLETES = [2000, 5000, 10000, 20000, 50000, 100000]

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// ----------- Algoritmo Knapsack DP -----------

function construirBaseExacta(
  todasDenoms: Record<number, number>,
  baseObjetivo: number,
  // eslint-disable-next-line no-unused-vars
  _umbralMenudo: number
): {
  conteoBase: Record<number, number>
  conteoConsignar: Record<number, number>
  restante: number
  exacto: boolean
} {
  // Construir lista de items disponibles (un item por unidad)
  const items: number[] = []
  for (const [denom, cantidad] of Object.entries(todasDenoms)) {
    const d = parseInt(denom)
    for (let i = 0; i < cantidad; i++) {
      items.push(d)
    }
  }

  // Dynamic Programming 0/1 Knapsack
  const dp: boolean[] = new Array(baseObjetivo + 1).fill(false)
  dp[0] = true
  const chosen: number[][] = Array.from({ length: baseObjetivo + 1 }, () => [])

  for (const item of items) {
    for (let w = baseObjetivo; w >= item; w--) {
      if (dp[w - item] && !dp[w]) {
        dp[w] = true
        chosen[w] = [...chosen[w - item], item]
      }
    }
  }

  // Encontrar la cantidad más cercana (menor o igual) al objetivo
  let bestAmount = 0
  for (let w = baseObjetivo; w >= 0; w--) {
    if (dp[w]) {
      bestAmount = w
      break
    }
  }

  const exacto = bestAmount === baseObjetivo
  const usedItems = chosen[bestAmount]

  // Contar items que van a la base
  const conteoBase: Record<number, number> = {}
  for (const item of usedItems) {
    conteoBase[item] = (conteoBase[item] || 0) + 1
  }

  // Calcular lo que se consigna (lo que sobra después de la base)
  const conteoConsignar: Record<number, number> = {}
  for (const [denom, cantidad] of Object.entries(todasDenoms)) {
    const d = parseInt(denom)
    const usedInBase = conteoBase[d] || 0
    const restante = cantidad - usedInBase
    if (restante > 0) {
      conteoConsignar[d] = restante
    }
  }

  return {
    conteoBase,
    conteoConsignar,
    restante: baseObjetivo - bestAmount,
    exacto,
  }
}

// ----------- Cash Calculator -----------

export function calcularCierreCompleto(params: {
  monedas: Record<number, number>
  billetes: Record<number, number>
  excedente: number
  gastosOperativos: number
  prestamos: number
  desfases: number
}) {
  const { monedas, billetes, excedente, gastosOperativos, prestamos } = params

  const totalMonedas = Object.entries(monedas).reduce(
    (sum, [d, c]) => sum + parseInt(d) * c,
    0
  )
  const totalBilletes = Object.entries(billetes).reduce(
    (sum, [d, c]) => sum + parseInt(d) * c,
    0
  )
  const totalGeneral = totalMonedas + totalBilletes

  // Combinar denominaciones para el knapsack
  const todasDenoms: Record<number, number> = {}
  for (const [d, c] of Object.entries(monedas)) {
    if (c > 0) todasDenoms[parseInt(d)] = c
  }
  for (const [d, c] of Object.entries(billetes)) {
    if (c > 0) todasDenoms[parseInt(d)] = (todasDenoms[parseInt(d)] || 0) + c
  }

  const { conteoBase, conteoConsignar, restante, exacto } = construirBaseExacta(
    todasDenoms,
    BASE_OBJETIVO,
    UMBRAL_MENUDO
  )

  // Separar base en monedas y billetes
  const baseMonedas: Record<number, number> = {}
  const baseBilletes: Record<number, number> = {}
  for (const d of DENOMINACIONES_MONEDAS) {
    baseMonedas[d] = conteoBase[d] || 0
  }
  for (const d of DENOMINACIONES_BILLETES) {
    baseBilletes[d] = conteoBase[d] || 0
  }

  const totalBaseMonedas = DENOMINACIONES_MONEDAS.reduce(
    (s, d) => s + d * (baseMonedas[d] || 0),
    0
  )
  const totalBaseBilletes = DENOMINACIONES_BILLETES.reduce(
    (s, d) => s + d * (baseBilletes[d] || 0),
    0
  )
  const totalBase = totalBaseMonedas + totalBaseBilletes

  // Separar consignar en monedas y billetes
  const consignarMonedas: Record<number, number> = {}
  const consignarBilletes: Record<number, number> = {}
  for (const d of DENOMINACIONES_MONEDAS) {
    consignarMonedas[d] = conteoConsignar[d] || 0
  }
  for (const d of DENOMINACIONES_BILLETES) {
    consignarBilletes[d] = conteoConsignar[d] || 0
  }

  const totalConsignarSinAjustes = Object.entries(conteoConsignar).reduce(
    (s, [d, c]) => s + parseInt(d) * c,
    0
  )

  // Estado de la base
  let baseStatus: 'exacta' | 'faltante' | 'sobrante'
  let diferenciaBase: number
  let mensajeBase: string

  if (totalGeneral === BASE_OBJETIVO) {
    baseStatus = 'exacta'
    diferenciaBase = 0
    mensajeBase = `La base es exacta: ${formatCOP(BASE_OBJETIVO)}`
  } else if (totalGeneral < BASE_OBJETIVO) {
    baseStatus = 'faltante'
    diferenciaBase = -(BASE_OBJETIVO - totalGeneral)
    mensajeBase = `Falta ${formatCOP(BASE_OBJETIVO - totalGeneral)} para completar la base de ${formatCOP(BASE_OBJETIVO)}`
  } else {
    baseStatus = 'sobrante'
    diferenciaBase = totalGeneral - BASE_OBJETIVO
    mensajeBase = `Sobra ${formatCOP(totalGeneral - BASE_OBJETIVO)} por encima de la base de ${formatCOP(BASE_OBJETIVO)}`
  }

  // Venta efectivo para Alegra
  const ventaEfectivoAlegra =
    totalGeneral - excedente - totalBase + gastosOperativos + prestamos

  return {
    input_coins: monedas,
    input_bills: billetes,
    totals: {
      total_monedas: totalMonedas,
      total_billetes: totalBilletes,
      total_general: totalGeneral,
      total_general_formatted: formatCOP(totalGeneral),
    },
    base: {
      base_monedas: baseMonedas,
      base_billetes: baseBilletes,
      total_base_monedas: totalBaseMonedas,
      total_base_billetes: totalBaseBilletes,
      total_base: totalBase,
      total_base_formatted: formatCOP(totalBase),
      base_status: baseStatus,
      diferencia_base: diferenciaBase,
      diferencia_base_formatted: formatCOP(Math.abs(diferenciaBase)),
      mensaje_base: mensajeBase,
      exact_base_obtained: exacto,
      restante_para_base: restante,
    },
    consignar: {
      consignar_monedas: consignarMonedas,
      consignar_billetes: consignarBilletes,
      total_consignar_sin_ajustes: totalConsignarSinAjustes,
      total_consignar_sin_ajustes_formatted: formatCOP(totalConsignarSinAjustes),
      efectivo_para_consignar_final: totalConsignarSinAjustes,
      efectivo_para_consignar_final_formatted: formatCOP(totalConsignarSinAjustes),
    },
    adjustments: {
      excedente,
      excedente_formatted: formatCOP(excedente),
      gastos_operativos: gastosOperativos,
      gastos_operativos_formatted: formatCOP(gastosOperativos),
      prestamos,
      prestamos_formatted: formatCOP(prestamos),
      venta_efectivo_diaria_alegra: ventaEfectivoAlegra,
      venta_efectivo_diaria_alegra_formatted: formatCOP(ventaEfectivoAlegra),
    },
  }
}

export function procesarExcedentes(
  excedentes: Array<{
    tipo: string
    subtipo?: string
    valor: number
  }>
) {
  const totales = {
    total_excedente: 0,
    excedente_efectivo: 0,
    excedente_datafono: 0,
    excedente_nequi: 0,
    excedente_daviplata: 0,
    excedente_qr: 0,
    excedentes_detalle: [] as Array<{ tipo: string; subtipo?: string; valor: number }>,
  }

  for (const exc of excedentes) {
    const valor = Math.round(exc.valor || 0)
    if (valor <= 0) continue

    totales.total_excedente += valor

    if (exc.tipo === 'efectivo') {
      totales.excedente_efectivo += valor
      totales.excedentes_detalle.push({ tipo: 'Efectivo', valor })
    } else if (exc.tipo === 'datafono') {
      totales.excedente_datafono += valor
      totales.excedentes_detalle.push({ tipo: 'Datafono', valor })
    } else if (exc.tipo === 'qr_transferencias') {
      if (exc.subtipo === 'nequi') {
        totales.excedente_nequi += valor
        totales.excedentes_detalle.push({ tipo: 'Transferencia', subtipo: 'Nequi', valor })
      } else if (exc.subtipo === 'daviplata') {
        totales.excedente_daviplata += valor
        totales.excedentes_detalle.push({ tipo: 'Transferencia', subtipo: 'Daviplata', valor })
      } else if (exc.subtipo === 'qr') {
        totales.excedente_qr += valor
        totales.excedentes_detalle.push({ tipo: 'Transferencia', subtipo: 'QR', valor })
      }
    }
  }

  return totales
}

export function procesarDesfases(
  desfases: Array<{
    tipo: string
    valor: number
    nota: string
  }>
) {
  const totales = {
    total_desfase: 0,
    faltante_caja: 0,
    sobrante_caja: 0,
    desfases_detalle: [] as Array<{ tipo: string; valor: number; nota: string }>,
  }

  for (const desfase of desfases) {
    const valor = Math.round(desfase.valor || 0)
    if (valor <= 0) continue

    if (desfase.tipo === 'faltante_caja') {
      totales.faltante_caja += valor
      totales.total_desfase -= valor
      totales.desfases_detalle.push({ tipo: 'Faltante en caja', valor, nota: desfase.nota })
    } else if (desfase.tipo === 'sobrante_caja') {
      totales.sobrante_caja += valor
      totales.total_desfase += valor
      totales.desfases_detalle.push({ tipo: 'Sobrante en caja', valor, nota: desfase.nota })
    }
  }

  return totales
}

export function calcularMetodosPago(
  metodosPago: {
    addi_datafono: number
    nequi: number
    daviplata: number
    qr: number
    tarjeta_debito: number
    tarjeta_credito: number
  },
  excedentes?: ReturnType<typeof procesarExcedentes>
) {
  const addi = Math.round(metodosPago.addi_datafono || 0)
  const nequi = Math.round(metodosPago.nequi || 0)
  const daviplata = Math.round(metodosPago.daviplata || 0)
  const qr = Math.round(metodosPago.qr || 0)
  const tarjetaDebito = Math.round(metodosPago.tarjeta_debito || 0)
  const tarjetaCredito = Math.round(metodosPago.tarjeta_credito || 0)

  const totalTransferenciasRegistradas = nequi + daviplata + qr + addi
  const totalSoloTarjetas = tarjetaDebito + tarjetaCredito
  const totalDatafonoReal = tarjetaDebito + tarjetaCredito + addi

  const resultado: Record<string, unknown> = {
    ...metodosPago,
    total_transferencias_registradas: totalTransferenciasRegistradas,
    total_transferencias_registradas_formatted: formatCOP(totalTransferenciasRegistradas),
    total_solo_tarjetas: totalSoloTarjetas,
    total_solo_tarjetas_formatted: formatCOP(totalSoloTarjetas),
    total_datafono_real: totalDatafonoReal,
    total_datafono_real_formatted: formatCOP(totalDatafonoReal),
  }

  if (excedentes) {
    const excDatafono = excedentes.excedente_datafono || 0
    const excNequi = excedentes.excedente_nequi || 0
    const excDaviplata = excedentes.excedente_daviplata || 0
    const excQr = excedentes.excedente_qr || 0

    resultado.total_datafono_con_excedente = totalDatafonoReal + excDatafono
    resultado.total_datafono_con_excedente_formatted = formatCOP(
      totalDatafonoReal + excDatafono
    )
    resultado.total_transferencias_con_excedente =
      totalTransferenciasRegistradas + excNequi + excDaviplata + excQr
    resultado.total_transferencias_con_excedente_formatted = formatCOP(
      totalTransferenciasRegistradas + excNequi + excDaviplata + excQr
    )
  }

  return resultado
}

export function validarCierre(params: {
  datosAlegra: { results: Record<string, { total: number }> }
  metodosPagoCalculados: Record<string, number>
  cashResult: ReturnType<typeof calcularCierreCompleto>
  excedentesProcessados: ReturnType<typeof procesarExcedentes>
  gastosOperativos: number
  prestamos: number
  desfasesProcessados: ReturnType<typeof procesarDesfases>
}) {
  const {
    datosAlegra,
    metodosPagoCalculados,
    cashResult,
    excedentesProcessados,
    gastosOperativos,
    prestamos,
    desfasesProcessados,
  } = params

  const efectivoAlegra = datosAlegra.results?.['cash']?.total ?? 0
  const transferenciaAlegra = datosAlegra.results?.['transfer']?.total ?? 0
  const datafonoAlegra =
    (datosAlegra.results?.['debit-card']?.total ?? 0) +
    (datosAlegra.results?.['credit-card']?.total ?? 0)

  const transferenciasRegistradas =
    (metodosPagoCalculados.total_transferencias_registradas as number) || 0
  const soloTarjetas = (metodosPagoCalculados.total_solo_tarjetas as number) || 0
  const datafonoReal = (metodosPagoCalculados.total_datafono_real as number) || 0

  const excedente_efectivo = excedentesProcessados.excedente_efectivo || 0
  const efectivo_para_consignar = cashResult.consignar.efectivo_para_consignar_final
  const totalDesfase = desfasesProcessados.total_desfase || 0

  const sumaEfectivoAjustada =
    efectivoAlegra + excedente_efectivo - gastosOperativos - prestamos + totalDesfase
  const diffEfectivoRaw = sumaEfectivoAjustada - efectivo_para_consignar
  const diffEfectivo = Math.abs(diffEfectivoRaw)
  const efectivoValidado = diffEfectivo < 100

  const diffTransferencia = Math.abs(transferenciaAlegra - transferenciasRegistradas)
  const diffDatafono = Math.abs(datafonoAlegra - soloTarjetas)

  const cierreValidado =
    efectivoValidado && diffTransferencia < 100 && diffDatafono < 100

  let validationStatus: 'success' | 'warning' | 'error'
  if (!efectivoValidado) validationStatus = 'error'
  else if (diffTransferencia >= 100 || diffDatafono >= 100) validationStatus = 'warning'
  else validationStatus = 'success'

  let desfaseSugerido = {
    detectado: false,
    tipo: undefined as string | undefined,
    valor: undefined as number | undefined,
    valor_formatted: undefined as string | undefined,
    mensaje: '',
  }

  if (
    !efectivoValidado &&
    diffEfectivo >= 100 &&
    desfasesProcessados.total_desfase === 0
  ) {
    const tipo = diffEfectivoRaw < 0 ? 'faltante_caja' : 'sobrante_caja'
    const valor = Math.abs(diffEfectivoRaw)
    desfaseSugerido = {
      detectado: true,
      tipo,
      valor: Math.round(valor),
      valor_formatted: formatCOP(valor),
      mensaje:
        tipo === 'faltante_caja'
          ? `DESFASE: Falta ${formatCOP(valor)} en caja. Registra este faltante con una nota explicativa.`
          : `DESFASE: Sobra ${formatCOP(valor)} en caja. Registra este sobrante con una nota explicativa.`,
    }
  }

  const mensajes: string[] = []
  if (!efectivoValidado) {
    mensajes.push(`EFECTIVO NO COINCIDE: Diferencia de ${formatCOP(diffEfectivo)}`)
  }
  if (diffTransferencia >= 100) {
    mensajes.push(`TRANSFERENCIAS NO COINCIDEN: Diferencia de ${formatCOP(diffTransferencia)}`)
  }
  if (diffDatafono >= 100) {
    mensajes.push(`DATAFONO NO COINCIDE: Diferencia de ${formatCOP(diffDatafono)}`)
  }

  return {
    cierre_validado: cierreValidado,
    validation_status: validationStatus,
    diferencias: {
      efectivo: {
        efectivo_alegra: efectivoAlegra,
        efectivo_alegra_formatted: formatCOP(efectivoAlegra),
        excedente_efectivo,
        excedente_efectivo_formatted: formatCOP(excedente_efectivo),
        gastos_operativos: gastosOperativos,
        gastos_operativos_formatted: formatCOP(gastosOperativos),
        prestamos,
        prestamos_formatted: formatCOP(prestamos),
        total_desfase: totalDesfase,
        total_desfase_formatted: formatCOP(totalDesfase),
        suma_efectivo_ajustada: sumaEfectivoAjustada,
        suma_efectivo_ajustada_formatted: formatCOP(sumaEfectivoAjustada),
        efectivo_para_consignar,
        efectivo_para_consignar_formatted: formatCOP(efectivo_para_consignar),
        diferencia: Math.round(diffEfectivo),
        diferencia_formatted: formatCOP(diffEfectivo),
        es_valido: efectivoValidado,
      },
      transferencias: {
        alegra: transferenciaAlegra,
        registrado: transferenciasRegistradas,
        diferencia: Math.round(diffTransferencia),
        diferencia_formatted: formatCOP(diffTransferencia),
        es_significativa: diffTransferencia >= 100,
      },
      datafono: {
        alegra: datafonoAlegra,
        registrado: soloTarjetas,
        diferencia: Math.round(diffDatafono),
        diferencia_formatted: formatCOP(diffDatafono),
        es_significativa: diffDatafono >= 100,
      },
      datafono_real: {
        total: datafonoReal,
        total_formatted: formatCOP(datafonoReal),
      },
    },
    mensaje_validacion:
      mensajes.length > 0
        ? `Diferencias encontradas en: ${mensajes.join(' | ')}`
        : 'Cierre validado correctamente',
    mensajes_detallados: mensajes,
    desfase_sugerido: desfaseSugerido,
  }
}

// Ítem extraído de una factura/pedido de proveedor de cascos, antes de
// resolver contra el catálogo (ver resolveImportItems en route.ts). Replica
// los campos de ItemPedido del software local
// (VENTAS_YJBMOTOCOM/services/pdf_pedido_parser.py).
export interface ParsedHelmetItem {
  nombreSugerido: string
  talla: string
  costoSinIva: number
  cantidad: number
  codigoBarrasSugerido: string
}

export type ProviderKey = 'xtrong' | 'distrifabrica'

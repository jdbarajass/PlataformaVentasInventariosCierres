-- =====================================================
-- YJBMOTOCOM — Migración 022: tipo de movimiento "Cambio" (swap de producto)
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.3 / 13.3 ítem 4.3.2): el software local tiene una pestaña
-- "Cambios" dedicada (ui/inventario_panel.py, tab "🔄 Cambios") — el cliente
-- devuelve un producto y se lleva otro; se descuenta 1 unidad del que sale
-- y se suma 1 al que entra, ambos con tipo de movimiento "Cambio" y notas
-- cruzadas. Se amplía el CHECK existente (nunca se restringe) para admitir
-- el nuevo tipo 'exchange'.
-- =====================================================

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
    CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return', 'exchange'));

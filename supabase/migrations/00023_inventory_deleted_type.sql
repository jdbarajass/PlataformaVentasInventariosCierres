-- =====================================================
-- YJBMOTOCOM — Migración 023: tipo de movimiento "Eliminado"
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.3 / 13.3 ítem 4.3.3): el software local registra un movimiento
-- "Eliminado" cuando se borra un producto con stock > 0
-- (database/inventario_repo.py: eliminar_producto). La nube hacía soft-delete
-- de la variante (active=false) sin dejar rastro en inventory_movements. Se
-- amplía el CHECK existente (nunca se restringe) para admitir 'deleted'.
-- =====================================================

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
    CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return', 'exchange', 'deleted'));

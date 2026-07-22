-- =====================================================
-- YJBMOTOCOM — Migración 024: colores por defecto de las cuentas semilla
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.4 / 13.4 ítem 4.4.9): la migración 00009 creó las 6 cuentas
-- semilla sin `color`, así que la UI caía al gris genérico. El software
-- local sí asigna un color propio por cuenta (database/schema.py). Solo se
-- actualiza si `color` sigue en NULL, para no pisar un color que el usuario
-- ya haya elegido manualmente en `/admin/cuentas`.
-- =====================================================

UPDATE public.accounts SET color = '#22C55E' WHERE name = 'Efectivo'         AND color IS NULL;
UPDATE public.accounts SET color = '#8B5CF6' WHERE name = 'Nequi'            AND color IS NULL;
UPDATE public.accounts SET color = '#F59E0B' WHERE name = 'QR/Bancolombia'   AND color IS NULL;
UPDATE public.accounts SET color = '#EF4444' WHERE name = 'NU'               AND color IS NULL;
UPDATE public.accounts SET color = '#F97316' WHERE name = 'Daviplata'        AND color IS NULL;
UPDATE public.accounts SET color = '#06B6D4' WHERE name = 'Addi'             AND color IS NULL;

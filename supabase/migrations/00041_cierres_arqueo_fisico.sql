-- Fase 4 del plan de mejoras integrales (docs/UNIFICACION_YJBMOTOCOM.md
-- sección 80.7): Cierres deja de ser un segundo lugar para volver a
-- escribir a mano los mismos totales que Mi Cuadre ya calcula solo, y pasa
-- a ser un arqueo físico de caja de verdad — se cuenta el efectivo real
-- de la caja y se compara contra lo que el sistema esperaba ese día.
--
-- cash_amount_cents ya existía y sigue existiendo: solo cambia su
-- significado (de "total de efectivo escrito a mano" a "efectivo contado
-- físicamente"), sin tocar la columna ni la suma de total_amount_cents.
--
-- Las dos columnas nuevas son una FOTO del momento en que se registra el
-- cierre, no un valor que se recalcula después — si se recalculara en vivo,
-- un cierre de hace un mes mostraría una diferencia distinta a la que
-- realmente hubo ese día si algo cambió en las órdenes después (mismo
-- criterio que product_snapshot en order_items). Nullable: los cierres ya
-- existentes, hechos antes de este cambio, se quedan sin diferencia
-- calculada — no hay forma honesta de reconstruirla retroactivamente.
ALTER TABLE public.daily_closures
  ADD COLUMN IF NOT EXISTS cash_expected_cents INT,
  ADD COLUMN IF NOT EXISTS cash_difference_cents INT;

COMMENT ON COLUMN public.daily_closures.cash_amount_cents IS
  'Efectivo contado físicamente en caja al hacer el arqueo (antes: total de efectivo escrito a mano)';
COMMENT ON COLUMN public.daily_closures.cash_expected_cents IS
  'Efectivo esperado según Ventas de mostrador de esa fecha, foto tomada al registrar el cierre (no se recalcula después)';
COMMENT ON COLUMN public.daily_closures.cash_difference_cents IS
  'cash_amount_cents - cash_expected_cents. Positivo = sobrante, negativo = faltante, null = cierre anterior a este cambio';

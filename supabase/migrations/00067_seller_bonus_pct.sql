-- =====================================================
-- Migración 067: bono del equipo como % de lo vendido (opcional)
-- =====================================================
-- Pedido del usuario (2026-11-25) para YBMOTOCOM: meta de equipo de
-- $60.000.000 y bono del 1% de TODO lo vendido en el mes (se gana aunque no
-- se llegue a la meta). Hasta ahora el bono solo podía ser un valor fijo que
-- se gana al llegar a la meta (seller_goal_bonus_cents), como en YJBMOTOCOM.
--
-- Columna nueva, opcional: si tiene un valor > 0, el bono = ese % del total
-- vendido por el equipo en el mes (Dashboard → Meta de ventas del equipo) y
-- se ignora el bono fijo. Si queda NULL (YJBMOTOCOM), todo sigue igual.
--
-- No toca datos. Idempotente.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS seller_bonus_pct NUMERIC(5,2)
    CHECK (seller_bonus_pct IS NULL OR (seller_bonus_pct >= 0 AND seller_bonus_pct <= 100));

COMMENT ON COLUMN public.store_settings.seller_bonus_pct IS
    'Bono del equipo como % de lo vendido en el mes. NULL o 0 = se usa el bono fijo seller_goal_bonus_cents al llegar a la meta.';

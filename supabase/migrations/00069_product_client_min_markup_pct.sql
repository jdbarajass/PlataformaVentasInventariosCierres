-- =====================================================
-- Migración 069: % del precio mínimo de venta al cliente, por producto
-- =====================================================
-- Pedido del usuario (2026-11-25) para YBMOTOCOM: a los locales vecinos se
-- les vende al "precio producto montado" (costo + 30%), pero al cliente
-- final el precio mínimo debe ser mayor y depende de cada producto
-- (10%, 15%, 30%, 40%, 50%…). Ese % se aplica sobre el COSTO:
--   precio mínimo cliente = costo × (1 + pct/100)
--
-- Lo define solo el admin desde Catálogo → Productos. El vendedor ve el
-- precio resultante (calculado en el servidor, /api/products/pricing), pero
-- nunca el % ni el costo.
--
-- NULL = todavía sin definir para ese producto. No toca datos. Idempotente.
-- =====================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS client_min_markup_pct NUMERIC(6,2)
    CHECK (client_min_markup_pct IS NULL OR (client_min_markup_pct >= 0 AND client_min_markup_pct <= 1000));

COMMENT ON COLUMN public.products.client_min_markup_pct IS
    'Porcentaje sobre el costo para el precio mínimo de venta al cliente final (costo × (1 + pct/100)). NULL = sin definir.';

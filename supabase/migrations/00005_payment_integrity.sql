-- =====================================================
-- YJBMOTOCOM — Migración 005: Integridad de pagos
-- =====================================================
-- 1) Idempotencia de webhooks (Stripe / MercadoPago): evita procesar
--    el mismo evento dos veces si el proveedor reintenta la entrega.
-- 2) Decremento atómico de stock: elimina la condición de carrera
--    entre leer stock_qty y actualizarlo (lost update) en pagos
--    concurrentes del mismo producto.
-- =====================================================

-- =====================================================
-- TABLA: processed_webhooks
-- =====================================================
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
    provider    TEXT        NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
    event_key   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_created_at
    ON public.processed_webhooks(created_at);

ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Sin políticas: nadie con anon/authenticated puede leer ni escribir.
-- Solo el cliente con service_role (usado en los webhooks) bypasea RLS.

-- =====================================================
-- FUNCION: decrement_stock
-- =====================================================
-- Decrementa stock_qty de un producto en una sola sentencia UPDATE,
-- lo que hace que Postgres bloquee la fila durante la operación y
-- evita que dos webhooks concurrentes lean el mismo stock_qty inicial.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_qty INT)
RETURNS TABLE (id UUID, title TEXT, stock_qty INT) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.products
    SET stock_qty = GREATEST(public.products.stock_qty - p_qty, 0)
    WHERE public.products.id = p_product_id
    RETURNING public.products.id, public.products.title, public.products.stock_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo el rol de servicio (usado por los webhooks server-side) puede
-- ejecutar esta función. Se revoca de anon/authenticated para que un
-- cliente no pueda invocarla directamente vía supabase.rpc().
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INT) TO service_role;

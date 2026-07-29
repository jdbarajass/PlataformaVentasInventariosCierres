-- =====================================================
-- YJBMOTOCOM — Migración 037: recuperación de carrito abandonado
-- =====================================================
-- Mejora de la Fase 5 (propuesta C.12): el carrito solo vive en
-- localStorage del navegador — no hay ningún registro server-side de que
-- alguien empezó un checkout sin terminarlo. Esta tabla captura el email +
-- contenido del carrito en el momento en que el cliente lo escribe en el
-- checkout (antes de pagar), para poder mandarle un recordatorio si nunca
-- completa la compra.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email        TEXT        NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
    items        JSONB       NOT NULL,
    subtotal_cents INT       NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reminded_at  TIMESTAMPTZ,
    recovered_at TIMESTAMPTZ,
    UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_pending
    ON public.abandoned_carts(created_at)
    WHERE reminded_at IS NULL AND recovered_at IS NULL;

CREATE TRIGGER update_abandoned_carts_updated_at
    BEFORE UPDATE ON public.abandoned_carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
-- Sin políticas para anon/authenticated: se escribe/lee solo con
-- service_role (api/cart/track, api/orders al crear una orden, y el cron
-- de recordatorio) — el email y contenido del carrito de un cliente no
-- tiene por qué ser legible por nadie más vía la API pública de Supabase.

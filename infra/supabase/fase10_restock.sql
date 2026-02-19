-- =====================================================
-- FASE 10: Notificaciones de Restock
-- =====================================================
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.restock_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
    notified    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, email)
);

CREATE INDEX IF NOT EXISTS idx_restock_product   ON restock_subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_restock_email     ON restock_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_restock_notified  ON restock_subscriptions(notified);

-- RLS
ALTER TABLE restock_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cualquier persona puede suscribirse (anon + auth)
CREATE POLICY "Anyone can subscribe to restock"
ON restock_subscriptions FOR INSERT
WITH CHECK (true);

-- El admin puede ver y gestionar todas las suscripciones
CREATE POLICY "Admin can view restock subscriptions"
ON restock_subscriptions FOR SELECT
USING (public.get_user_role() IN ('admin', 'seller'));

CREATE POLICY "Admin can delete restock subscriptions"
ON restock_subscriptions FOR DELETE
USING (public.get_user_role() IN ('admin', 'seller'));

CREATE POLICY "Admin can update restock subscriptions"
ON restock_subscriptions FOR UPDATE
USING (public.get_user_role() IN ('admin', 'seller'));

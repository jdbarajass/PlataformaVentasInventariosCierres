-- =====================================================
-- YJBMOTOCOM — Migración 033: "avísame cuando vuelva" por talla
-- =====================================================
-- Mejora pedida por el usuario tras la Fase 2: restock_subscriptions era
-- solo a nivel de producto completo — si una talla se agotaba pero otras
-- seguían disponibles, el cliente no podía pedir aviso de esa talla
-- puntual (el botón "Notificarme" ni siquiera aparecía, porque
-- products.stock_qty ya reflejaba el total sumado de todas las tallas
-- desde la migración 00030, así que el producto se veía "en stock").
-- =====================================================

ALTER TABLE public.restock_subscriptions
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_restock_variant ON public.restock_subscriptions(variant_id);

-- El UNIQUE(product_id, email) original solo tenía sentido para productos
-- sin tallas. Se reemplaza por dos índices únicos parciales: uno para
-- "todo el producto" (variant_id NULL, el caso sin tallas) y otro por
-- talla puntual — así un mismo email puede suscribirse a varias tallas
-- distintas del mismo producto, sin duplicarse dentro de la misma talla.
ALTER TABLE public.restock_subscriptions DROP CONSTRAINT IF EXISTS restock_subscriptions_product_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS restock_subscriptions_product_email_no_variant_key
    ON public.restock_subscriptions(product_id, email) WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restock_subscriptions_product_variant_email_key
    ON public.restock_subscriptions(product_id, variant_id, email) WHERE variant_id IS NOT NULL;

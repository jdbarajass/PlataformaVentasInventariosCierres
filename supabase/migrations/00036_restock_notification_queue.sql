-- =====================================================
-- YJBMOTOCOM — Migración 036: cola central de notificaciones de reabasto
-- =====================================================
-- Mejora pedida por el usuario (Fase 5, propuesta A.2): `sendRestockNotifications`
-- solo se disparaba desde /api/inventory/adjust ("Ingresar" en Inventario) —
-- cargue de pedidos por PDF, importación de Excel y "Cambios" también suben
-- stock pero nunca avisaban a nadie suscrito.
--
-- En vez de repetir la llamada en cada ruta de escritura (frágil: cualquier
-- nueva forma de subir stock que se agregue después se olvidaría del aviso),
-- se detecta la transición 0 → positivo con triggers a nivel de base de
-- datos — cubre TODA escritura de stock presente y futura, sin importar por
-- dónde entre. La cola queda pendiente de procesar por un cron
-- (api/cron/restock-notifications), que es quien de verdad envía el email
-- (Postgres no puede llamar a Resend directamente).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.restock_notification_queue (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id   UUID        REFERENCES public.product_variants(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_restock_queue_pending ON public.restock_notification_queue(processed_at) WHERE processed_at IS NULL;

ALTER TABLE public.restock_notification_queue ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el cron (service_role) lee/escribe esta cola.

-- =====================================================
-- Variantes: transición 0 → positivo en una talla puntual
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_variant_restock_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stock_qty = 0 AND NEW.stock_qty > 0 THEN
        INSERT INTO public.restock_notification_queue (product_id, variant_id)
        VALUES (NEW.product_id, NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_variant_restock_notification ON public.product_variants;
CREATE TRIGGER trg_queue_variant_restock_notification
    AFTER UPDATE OF stock_qty ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.queue_variant_restock_notification();

-- =====================================================
-- Productos sin tallas: transición 0 → positivo del producto completo.
-- Se excluyen los productos CON variantes porque su products.stock_qty
-- cambia como efecto secundario del trigger de sincronización de la
-- migración 00030 (sumar variantes) — ya quedan cubiertos arriba, y
-- encolarlos también aquí duplicaría el aviso.
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_product_restock_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stock_qty = 0 AND NEW.stock_qty > 0
       AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = NEW.id) THEN
        INSERT INTO public.restock_notification_queue (product_id, variant_id)
        VALUES (NEW.id, NULL);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_product_restock_notification ON public.products;
CREATE TRIGGER trg_queue_product_restock_notification
    AFTER UPDATE OF stock_qty ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.queue_product_restock_notification();

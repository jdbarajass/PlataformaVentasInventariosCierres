-- =====================================================
-- YJBMOTOCOM — Migración 039: libera SKU/slug/código al "eliminar" un
-- producto, borra tallas de verdad, y corrige el stock sincronizado para
-- no contar variantes inactivas
-- =====================================================
-- Bug reportado por el usuario (2026-08-09): creó por error la talla "S" de
-- un casco (debía ser "XS"), le dio "Eliminar" en Inventario → Tallas, el
-- sistema le confirmó la desactivación pero la fila SIGUIÓ apareciendo en la
-- tabla de tallas, y al intentar crear la talla/código correcto obtuvo
-- "ya existe una variante con esa talla o ese código de barras".
--
-- Causa raíz (dos bugs relacionados):
--
-- 1) `DELETE /api/product-variants/[id]` hace *soft delete*
--    (`active = false`) pero la fila sigue ocupando su lugar en las
--    restricciones UNIQUE de `talla` (por producto) y `barcode` — Postgres
--    no distingue `active` en un UNIQUE normal. Mismo problema, mismo
--    patrón, en `DELETE /api/products/[id]` (soft delete de producto): el
--    `sku`/`slug`/`barcode` del producto "eliminado" bloquea para siempre
--    crear un producto nuevo con ese mismo código.
--
-- 2) El trigger de sincronización de stock (migración 030) suma
--    `stock_qty` de TODAS las variantes de un producto sin filtrar por
--    `active` — si alguna vez una variante queda inactiva sin ser borrada
--    (posible hoy vía `PUT` con `active:false`, aunque la UI actual no lo
--    expone), su stock se sigue contando en `products.stock_qty`.
--
-- Fix:
-- A) `product_variants`: el código de la aplicación pasa a hacer *hard
--    delete* real (ver `api/product-variants/[id]/route.ts`), así que la
--    talla/código quedan libres de inmediato. Es seguro: toda tabla que
--    referencia `product_variants.id` usa `ON DELETE SET NULL` (con datos
--    ya "congelados" aparte: `order_items.product_talla`/`cost_cents`,
--    `inventory_movements.note`) o `ON DELETE CASCADE` sobre tablas
--    puramente operativas sin valor histórico (`restock_subscriptions`,
--    `restock_notification_queue`). El trigger de la migración 030 ya
--    reacciona a `DELETE` en `product_variants`, así que
--    `products.stock_qty` se recalcula solo.
-- B) `products`: NO se cambia a hard delete (el `ON DELETE CASCADE` de
--    `inventory_movements.product_id` sí borraría historial real de
--    movimientos). En su lugar, las restricciones UNIQUE globales de
--    `sku`/`slug`/`barcode` se reemplazan por índices únicos PARCIALES que
--    solo aplican `WHERE active = true` — un producto desactivado deja de
--    bloquear la reutilización de su código, sin perder su fila ni su
--    historial.
-- C) El trigger de sincronización de stock ahora filtra `active = true` en
--    la suma, por seguridad ante cualquier futura variante desactivada sin
--    borrar.
-- =====================================================

-- =====================================================
-- A) products: UNIQUE global -> índice único parcial (solo activos)
-- =====================================================
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class rel  ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = 'products'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = rel.oid
                AND a.attnum = c.conkey[1]
                AND a.attname IN ('sku', 'slug', 'barcode')
          )
    LOOP
        EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_active_key
    ON public.products (sku) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_active_key
    ON public.products (slug) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_active_key
    ON public.products (barcode) WHERE active = true;

-- =====================================================
-- C) Trigger de stock: solo suma variantes activas
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id AND active = true), 0
        )
        WHERE id = OLD.product_id;
        RETURN OLD;
    END IF;

    UPDATE public.products
    SET stock_qty = COALESCE(
        (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = NEW.product_id AND active = true), 0
    )
    WHERE id = NEW.product_id;

    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id AND active = true), 0
        )
        WHERE id = OLD.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_stock_from_variants
    AFTER INSERT OR UPDATE OF stock_qty, product_id, active OR DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- Backfill: corrige de una vez cualquier producto que hoy tenga stock
-- contaminado por una variante inactiva. Se agrupa por TODAS las variantes
-- (activas o no) para no perderse el caso límite de un producto cuyas
-- variantes quedaron todas inactivas (debe terminar en stock 0), y se suma
-- solo el stock de las activas con FILTER.
UPDATE public.products p
SET stock_qty = sub.total_stock
FROM (
    SELECT pv.product_id, COALESCE(SUM(pv.stock_qty) FILTER (WHERE pv.active = true), 0) AS total_stock
    FROM public.product_variants pv
    GROUP BY pv.product_id
) sub
WHERE p.id = sub.product_id
  AND p.stock_qty IS DISTINCT FROM sub.total_stock;

-- =====================================================
-- Migración 066: bucket de fotos de productos y nombres de índices
-- =====================================================
-- Encontrado el 2026-11-25 comparando la estructura de las dos tiendas
-- (scripts/huella-estructura-bd.sql y scripts/diferencias-estructura-bd.sql):
--
-- 1. El bucket `product-images` (fotos de productos) se creaba A MANO en el
--    dashboard (ver el comentario de 00004_rls_policies.sql), así que en
--    YBMOTOCOM nunca existió y subir fotos desde Catálogo fallaba. Sus 3
--    políticas de storage sí existían. Aquí se crea igual que en YJBMOTOCOM:
--    público, sin límite de tamaño ni de tipos. En YJBMOTOCOM no hace nada.
--
-- 2. Los índices de inventory_movements se llaman distinto según cómo se creó
--    la base: con las migraciones (00001) quedan idx_inventory_movements_*,
--    con schema.sql quedaban idx_inventory_* (YBMOTOCOM). Son los mismos
--    índices (mismas columnas); solo se renombran para que las dos tiendas
--    queden idénticas. Si ya tienen el nombre de la migración, no hace nada.
--
-- Idempotente. No toca datos de negocio.
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.idx_inventory_product') IS NOT NULL
       AND to_regclass('public.idx_inventory_movements_product') IS NULL THEN
        ALTER INDEX public.idx_inventory_product RENAME TO idx_inventory_movements_product;
    END IF;

    IF to_regclass('public.idx_inventory_created_at') IS NOT NULL
       AND to_regclass('public.idx_inventory_movements_created_at') IS NULL THEN
        ALTER INDEX public.idx_inventory_created_at RENAME TO idx_inventory_movements_created_at;
    END IF;
END $$;

-- Verificación: debe mostrar el bucket y los dos índices con el nombre nuevo.
SELECT 'bucket' AS que, id || ' publico=' || public AS detalle FROM storage.buckets WHERE id = 'product-images'
UNION ALL
SELECT 'indice', indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN ('idx_inventory_movements_product', 'idx_inventory_movements_created_at')
ORDER BY 1, 2;

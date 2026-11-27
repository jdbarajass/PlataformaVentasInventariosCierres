-- =====================================================
-- Migración 071: stock mínimo por defecto = 2 (antes 5)
-- =====================================================
-- Pedido del usuario (2026-11-26) para YBMOTOCOM y YJBMOTOCOM (2026-11-27 en YJB): el "stock mínimo" de
-- cada producto/talla queda en 2 por defecto (se puede cambiar, y 0 = no
-- avisar nunca). Un producto sale en "stock bajo" (rojo) cuando le quedan
-- el mínimo o menos — regla en apps/web/src/lib/utils.ts (enStockMinimo).
--
-- 1) Cambia el valor por defecto de las columnas a 2.
-- 2) Pasa a 2 los productos y tallas que tenían el viejo valor por defecto
--    (5). Un mínimo que alguien ya había cambiado a mano (otro número) no
--    se toca.
--
-- El número 00070 se salta en YBMOTOCOM: en YJBMOTOCOM la 00070 es otra
-- migración propia de esa tienda.
--
-- Idempotente: se puede correr más de una vez.
-- =====================================================

ALTER TABLE public.products
    ALTER COLUMN low_stock_threshold SET DEFAULT 2;

ALTER TABLE public.product_variants
    ALTER COLUMN low_stock_threshold SET DEFAULT 2;

UPDATE public.products
    SET low_stock_threshold = 2
    WHERE low_stock_threshold = 5 OR low_stock_threshold IS NULL;

UPDATE public.product_variants
    SET low_stock_threshold = 2
    WHERE low_stock_threshold = 5;

-- Verificación (debe dar 0 en ambas):
-- SELECT count(*) FROM public.products WHERE low_stock_threshold = 5;
-- SELECT count(*) FROM public.product_variants WHERE low_stock_threshold = 5;

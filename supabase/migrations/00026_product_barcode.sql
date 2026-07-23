-- =====================================================
-- YJBMOTOCOM — Migración 026: Código de barras en productos sin variantes
-- =====================================================
-- El software local guarda "Serial" y "Código de barras" en TODAS las filas
-- de inventario, tengan talla o no. En la nube, product_variants.barcode ya
-- existe (migración 008) pero products no tenía columna equivalente para
-- los productos sin variantes (la mayoría de accesorios) — necesaria para
-- portar la pestaña "Ingresar" (alta rápida con generación automática de
-- código de barras/serial, ver docs/UNIFICACION_YJBMOTOCOM.md sección 20).
-- =====================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);

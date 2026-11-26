-- =====================================================
-- Migración 070: precio mínimo al cliente en 35% para todos (YJBMOTOCOM)
-- =====================================================
-- Pedido del usuario (2026-11-26): por ahora, en YJBMOTOCOM el "Precio mínimo
-- a la venta cliente" es costo + 35% para TODOS los productos.
--   - Los productos que ya existen y no tienen % quedan en 35.
--   - Los productos nuevos (Catálogo, Inventario → Ingresar, scripts) nacen
--     con 35 por el DEFAULT de la columna.
-- El admin puede seguir cambiando el % de un producto puntual desde
-- Catálogo → Productos.
--
-- Requiere la 00069 (crea la columna). Correr la 00069 y luego esta.
-- No toca precios de venta ni costos. Idempotente.
-- =====================================================

ALTER TABLE public.products
    ALTER COLUMN client_min_markup_pct SET DEFAULT 35;

UPDATE public.products
SET client_min_markup_pct = 35
WHERE client_min_markup_pct IS NULL;

COMMENT ON COLUMN public.products.client_min_markup_pct IS
    'Porcentaje sobre el costo para el precio mínimo de venta al cliente final (costo × (1 + pct/100)). Por defecto 35 en YJBMOTOCOM (migración 00070).';

-- Verificación: debe dar sin_pct = 0
SELECT count(*) AS productos,
       count(*) FILTER (WHERE client_min_markup_pct IS NULL) AS sin_pct,
       count(*) FILTER (WHERE client_min_markup_pct = 35) AS en_35
FROM public.products;

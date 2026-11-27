-- =====================================================
-- Migración 072: talla XS en 0 a los productos con tallas
-- =====================================================
-- Pedido del usuario (2026-11-26) para YBMOTOCOM y YJBMOTOCOM (2026-11-27 en YJB): faltaba la talla XS.
-- A cada producto NO borrado que ya maneja tallas de letra (S, M, L, XL,
-- 2XL/XXL, 3XL) y no tiene XS, se le crea la XS con:
--   * 0 unidades (no cambia el stock del producto ni el valor del inventario)
--   * stock mínimo 0 = no avisar. Con el 2 por defecto, una XS en 0 pondría
--     a TODOS esos productos en "stock bajo" (rojo) y en el correo de
--     alerta (regla en apps/web/src/lib/utils.ts). Si se quiere aviso para
--     la XS de un producto, se le cambia el mínimo en Inventario → Tallas.
--   * el costo de una talla hermana (el de la de mayor costo).
--   * código de barras de la familia: los 9 primeros dígitos de una talla
--     hermana con código válido + '1' (dígito de XS), igual que la app
--     (derivarCodigoBarrasHermano). Si el producto no tiene un código válido
--     o ese código ya está usado por otro, la XS queda sin código (se
--     genera después desde Inventario → Tallas).
--
-- No toca productos sin tallas (accesorios, aceites...), ni los que solo
-- tienen "N/A" o tallas de número. En la app, Inventario → Ingresar ya trae
-- la XS marcada en 0 para los productos nuevos.
--
-- Idempotente: se puede correr más de una vez (no duplica la XS).
-- =====================================================

WITH productos AS (
    SELECT p.id AS product_id
    FROM public.products p
    WHERE p.deleted_at IS NULL
      AND EXISTS (
          SELECT 1 FROM public.product_variants v
          WHERE v.product_id = p.id
            AND v.active = true
            AND upper(trim(v.talla)) IN ('S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.product_variants v
          WHERE v.product_id = p.id
            AND upper(trim(v.talla)) = 'XS'
      )
),
hermana AS (
    -- Una talla de referencia por producto: primero la que tenga código de
    -- 10 dígitos, y entre esas la de mayor costo.
    SELECT DISTINCT ON (v.product_id)
        v.product_id,
        v.cost_cents,
        CASE WHEN v.barcode ~ '^[0-9]{10}$' THEN left(v.barcode, 9) || '1' END AS barcode_xs
    FROM public.product_variants v
    JOIN productos pr ON pr.product_id = v.product_id
    WHERE v.active = true
    ORDER BY v.product_id, (v.barcode ~ '^[0-9]{10}$') DESC NULLS LAST, v.cost_cents DESC
)
INSERT INTO public.product_variants (product_id, talla, barcode, stock_qty, low_stock_threshold, cost_cents, active)
SELECT
    h.product_id,
    'XS',
    CASE
        WHEN h.barcode_xs IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.product_variants x WHERE x.barcode = h.barcode_xs)
         AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.barcode = h.barcode_xs AND x.active = true)
        THEN h.barcode_xs
    END,
    0,
    0,
    h.cost_cents,
    true
FROM hermana h
ON CONFLICT DO NOTHING;

-- Verificación: cuántos productos con tallas de letra quedaron sin XS (debe dar 0)
-- SELECT count(*) FROM public.products p
-- WHERE p.deleted_at IS NULL
--   AND EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.active
--               AND upper(trim(v.talla)) IN ('S','M','L','XL','2XL','XXL','3XL','XXXL'))
--   AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND upper(trim(v.talla)) = 'XS');
--
-- Ver las XS creadas:
-- SELECT p.title, v.talla, v.barcode, v.stock_qty, v.low_stock_threshold, v.cost_cents / 100 AS costo
-- FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
-- WHERE v.talla = 'XS' ORDER BY p.title;

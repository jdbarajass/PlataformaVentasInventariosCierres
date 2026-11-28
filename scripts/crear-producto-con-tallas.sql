-- Crea un producto con tallas igual que Inventario → Ingresar (modo multi-talla):
--   * serial (sku) = el número más alto + 1 (cuenta también los productos borrados, como la app)
--   * código de barras de familia: CC de la categoría + subtipo más frecuente + siguiente modelo + variante 01
--     + dígito de talla (XS=1, S=2, M=3, L=4, XL=5, 2XL=6, 3XL=7)
--   * sin publicar (active = false), 0 unidades, costo en cada talla
--   * stock mínimo 2 en cada talla y 0 en la XS (00071/00072); 2 en el producto
--   * % del precio mínimo al cliente (00069; 35 en YJBMOTOCOM por la 00070, NULL = "Sin definir" en YBMOTOCOM)
-- Cambiar solo los valores de la sección "DATOS" (y el nombre en la consulta final).
-- Si ya existe un producto vivo con ese nombre, no hace nada. Al final muestra cómo quedó.
--
-- Historial: GUANTE ALPINESTARS GP PRO CAÑA LARGA (2026-11-25), GUANTE MAD MOTOR IMPERMEABLE (2026-11-28).

DO $$
DECLARE
    -- ===== DATOS =====
    v_nombre    TEXT    := 'GUANTE MAD MOTOR IMPERMEABLE';
    v_costo     INT     := 45000 * 100;    -- en centavos
    v_precio    INT     := 85000 * 100;    -- precio a la venta, en centavos (lo eligió el usuario)
    v_pct       NUMERIC := 35;             -- % del precio mínimo al cliente (NULL = sin definir)
    v_cat_slug  TEXT    := 'guantes';      -- slug de public.categories
    v_cc        TEXT    := '15';           -- prefijo del código de barras de esa categoría (15 = guante)
    v_tallas    TEXT[]  := ARRAY['XS', 'S', 'M', 'L', 'XL', '2XL'];
    -- =================
    v_serial  TEXT;
    v_mm      TEXT;
    v_nnn     INT;
    v_vv      INT;
    v_base9   TEXT;
    v_id      UUID;
    v_cat_id  UUID;
    v_talla   TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM public.products
               WHERE lower(trim(title)) = lower(trim(v_nombre)) AND deleted_at IS NULL) THEN
        RAISE NOTICE 'Ya existe "%": no se creó nada', v_nombre;
        RETURN;
    END IF;

    SELECT id INTO v_cat_id FROM public.categories WHERE slug = v_cat_slug LIMIT 1;
    IF v_cat_id IS NULL THEN
        RAISE EXCEPTION 'No existe la categoría "%": no se creó nada', v_cat_slug;
    END IF;

    -- Serial: máximo de los sku numéricos (productos y tallas) + 1
    SELECT (coalesce(max(s::int), 0) + 1)::text INTO v_serial
    FROM (SELECT sku AS s FROM public.products UNION ALL SELECT sku FROM public.product_variants) x
    WHERE s ~ '^[0-9]+$' AND s::int::text = s;

    -- Códigos válidos (10 dígitos) de esa categoría, de productos y tallas
    CREATE TEMP TABLE _cods ON COMMIT DROP AS
    SELECT c FROM (SELECT barcode AS c FROM public.products UNION ALL SELECT barcode FROM public.product_variants) x
    WHERE c ~ '^[0-9]{10}$' AND left(c, 2) = v_cc;

    SELECT substr(c, 3, 2) INTO v_mm FROM _cods GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
    v_mm := coalesce(v_mm, '01');
    SELECT coalesce(max(substr(c, 5, 3)::int), 0) + 1 INTO v_nnn FROM _cods WHERE substr(c, 3, 2) = v_mm;

    <<buscar>>
    LOOP
        FOR v_vv IN 1..99 LOOP
            v_base9 := v_cc || v_mm || lpad(v_nnn::text, 3, '0') || lpad(v_vv::text, 2, '0');
            EXIT buscar WHEN NOT EXISTS (SELECT 1 FROM _cods WHERE left(c, 9) = v_base9);
        END LOOP;
        v_nnn := v_nnn + 1;
    END LOOP;

    INSERT INTO public.products (title, slug, sku, barcode, price_cents, cost_cents, client_min_markup_pct,
                                 stock_qty, low_stock_threshold, active, images, category_id)
    VALUES (
        v_nombre,
        trim(both '-' from regexp_replace(lower(v_nombre), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 5),
        v_serial, NULL, v_precio, v_costo, v_pct, 0, 2, false, '{}', v_cat_id
    )
    RETURNING id INTO v_id;

    FOREACH v_talla IN ARRAY v_tallas LOOP
        INSERT INTO public.product_variants (product_id, talla, barcode, stock_qty, low_stock_threshold, cost_cents)
        VALUES (
            v_id, v_talla,
            v_base9 || CASE upper(v_talla) WHEN 'XS' THEN '1' WHEN 'S' THEN '2' WHEN 'M' THEN '3' WHEN 'L' THEN '4'
                                           WHEN 'XL' THEN '5' WHEN '2XL' THEN '6' WHEN '3XL' THEN '7' ELSE '0' END,
            0,
            CASE WHEN upper(v_talla) = 'XS' THEN 0 ELSE 2 END,
            v_costo
        );
    END LOOP;
END $$;

-- Cómo quedó
SELECT p.sku AS serial, p.title AS producto, c.name AS categoria, p.price_cents / 100 AS precio,
       p.cost_cents / 100 AS costo, p.client_min_markup_pct AS pct_cliente, p.active AS publicado,
       v.talla, v.barcode AS codigo, v.stock_qty AS cantidad, v.low_stock_threshold AS minimo
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.product_variants v ON v.product_id = p.id
WHERE p.title = 'GUANTE MAD MOTOR IMPERMEABLE' AND p.deleted_at IS NULL
ORDER BY v.barcode;

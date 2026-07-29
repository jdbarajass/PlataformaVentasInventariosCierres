-- =====================================================
-- YJBMOTOCOM — Migración 031: uso real de cupones + reseñas verificadas
-- =====================================================
-- Dos bugs encontrados en la auditoría por fases (Fase 2, 2026-07-29):
--
-- 1) coupons.used_count nunca se incrementaba en ningún lugar del código
--    (ni al validar, ni al crear la orden, sin trigger) — el límite
--    "Máx usos" de un cupón no se aplicaba nunca en la práctica, y el
--    panel admin mostraba el contador de usos siempre en 0.
--
-- 2) product_reviews.verified_purchase se mostraba como insignia "Compra
--    verificada" pero nunca se calculaba (default false, sin trigger) —
--    ninguna reseña se veía verificada jamás, ni siquiera las de clientes
--    reales.
-- =====================================================

-- =====================================================
-- 1) Cupones: registrar qué orden usó qué cupón + incrementar used_count
--    de forma atómica (con bloqueo de fila) dentro de la misma transacción
--    que crea la orden — cierra la ventana de carrera entre validar y usar.
-- =====================================================
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_order JSONB,
    p_items JSONB,
    p_coupon_id UUID DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_max_uses INT;
    v_used_count INT;
BEGIN
    -- Si se aplicó un cupón, se revalida y se marca como usado con la fila
    -- bloqueada (FOR UPDATE): si dos checkouts concurrentes usan el mismo
    -- cupón de un solo uso, el segundo ve el used_count ya incrementado
    -- por el primero y falla aquí, en vez de que ambos pasen la validación
    -- de la API (que corrió antes, sin bloqueo) y se cuente doble.
    IF p_coupon_id IS NOT NULL THEN
        SELECT max_uses, used_count INTO v_max_uses, v_used_count
        FROM public.coupons WHERE id = p_coupon_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cupón no encontrado';
        END IF;
        IF v_max_uses IS NOT NULL AND v_used_count >= v_max_uses THEN
            RAISE EXCEPTION 'Este cupón ha alcanzado su límite de uso';
        END IF;

        UPDATE public.coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
    END IF;

    INSERT INTO public.orders (
        customer_email, customer_name, customer_phone, shipping_address,
        subtotal_cents, discount_cents, shipping_cents, total_cents,
        notes, status, payment_status, coupon_id
    )
    VALUES (
        p_order->>'customer_email',
        p_order->>'customer_name',
        p_order->>'customer_phone',
        p_order->'shipping_address',
        (p_order->>'subtotal_cents')::INT,
        COALESCE((p_order->>'discount_cents')::INT, 0),
        (p_order->>'shipping_cents')::INT,
        (p_order->>'total_cents')::INT,
        p_order->>'notes',
        COALESCE(p_order->>'status', 'pending'),
        COALESCE(p_order->>'payment_status', 'pending'),
        p_coupon_id
    )
    RETURNING * INTO v_order;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'create_order_with_items: p_items no puede estar vacio';
    END IF;

    INSERT INTO public.order_items (
        order_id, product_id, product_title, product_image,
        variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
    )
    SELECT
        v_order.id,
        (item->>'product_id')::UUID,
        item->>'product_title',
        item->>'product_image',
        NULLIF(item->>'variant_id', '')::UUID,
        NULLIF(item->>'product_talla', ''),
        (item->>'qty')::INT,
        (item->>'price_cents')::INT,
        COALESCE((item->>'cost_cents')::INT, 0),
        COALESCE((item->>'discount_cents')::INT, 0),
        (item->>'total_cents')::INT
    FROM jsonb_array_elements(p_items) AS item;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2) Reseñas: calcular verified_purchase en el servidor, no confiar en lo
--    que mande el cliente. BEFORE INSERT sobrescribe NEW.verified_purchase
--    sin importar qué llegue en el insert.
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_review_verified_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    SELECT email INTO v_user_email FROM public.users WHERE id = NEW.user_id;

    NEW.verified_purchase := EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = NEW.product_id
          AND o.payment_status = 'paid'
          AND (o.user_id = NEW.user_id OR (v_user_email IS NOT NULL AND o.customer_email = v_user_email))
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_review_verified_purchase ON public.product_reviews;
CREATE TRIGGER trg_set_review_verified_purchase
    BEFORE INSERT ON public.product_reviews
    FOR EACH ROW EXECUTE FUNCTION public.set_review_verified_purchase();

-- Backfill: recalcula verified_purchase para las reseñas ya existentes.
UPDATE public.product_reviews r
SET verified_purchase = EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.users u ON u.id = r.user_id
    WHERE oi.product_id = r.product_id
      AND o.payment_status = 'paid'
      AND (o.user_id = r.user_id OR o.customer_email = u.email)
);

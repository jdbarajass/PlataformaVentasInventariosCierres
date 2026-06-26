-- =====================================================
-- YJBMOTOCOM — Migración 006: Atomicidad en creación de orden
-- =====================================================
-- El endpoint POST /api/orders insertaba `orders` y `order_items` en dos
-- llamadas separadas al cliente de Supabase (que no soporta transacciones
-- multi-statement desde el SDK JS). Si la segunda inserción fallaba, la
-- orden quedaba huérfana (sin items). Esta función ejecuta ambas
-- inserciones dentro de una sola transacción de Postgres: si cualquier
-- parte falla, toda la llamada se revierte (incluida la orden).
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_order JSONB,
    p_items JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
BEGIN
    INSERT INTO public.orders (
        customer_email, customer_name, customer_phone, shipping_address,
        subtotal_cents, discount_cents, shipping_cents, total_cents,
        notes, status, payment_status
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
        COALESCE(p_order->>'payment_status', 'pending')
    )
    RETURNING * INTO v_order;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'create_order_with_items: p_items no puede estar vacio';
    END IF;

    INSERT INTO public.order_items (
        order_id, product_id, product_title, product_image, qty, price_cents, total_cents
    )
    SELECT
        v_order.id,
        (item->>'product_id')::UUID,
        item->>'product_title',
        item->>'product_image',
        (item->>'qty')::INT,
        (item->>'price_cents')::INT,
        (item->>'total_cents')::INT
    FROM jsonb_array_elements(p_items) AS item;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo el rol de servicio (usado por POST /api/orders server-side) puede
-- ejecutar esta función — un cliente anon/authenticated no debe poder
-- crear órdenes arbitrarias saltándose la revalidación de precios/stock
-- que hace la API antes de llamarla.
REVOKE ALL ON FUNCTION public.create_order_with_items(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_with_items(JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(JSONB, JSONB) TO service_role;

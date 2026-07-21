-- =====================================================
-- YJBMOTOCOM — Migración 013: Funciones atómicas de venta POS (mostrador)
-- =====================================================
-- Mismo patrón de 00005/00006/00011: funciones SECURITY DEFINER,
-- search_path fijo, solo ejecutables por service_role. Una venta de
-- mostrador toca 4 cosas a la vez (orden+items, stock, pagos y saldo de
-- cuentas) — deben quedar en una sola transacción para que nunca se
-- descuente stock sin registrar el pago, o se acredite una cuenta sin
-- dejar la orden creada.
-- =====================================================

-- =====================================================
-- FUNCIÓN: create_pos_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID
    )
    RETURNING * INTO v_order;

    -- Items: valida y descuenta stock (con bloqueo de fila), inserta el
    -- item y su movimiento de inventario.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = stock_qty - v_qty WHERE id = v_variant_id;
        ELSE
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = stock_qty - v_qty WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
        ) VALUES (
            v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
            v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
        );
    END LOOP;

    -- Pagos: inserta cada método usado y acredita la cuenta enlazada.
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB) TO service_role;

-- =====================================================
-- FUNCIÓN: cancel_pos_sale
-- =====================================================
-- Revierte una venta de mostrador: restaura el stock de cada item, revierte
-- el crédito de cada cuenta y marca la orden como cancelada/reembolsada.
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND channel = 'pos') THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
        VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_pos_sale(UUID) TO service_role;

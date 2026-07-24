-- =====================================================
-- YJBMOTOCOM — Migración 027: fecha editable al registrar una venta de mostrador
-- =====================================================
-- El software local permite elegir la fecha al registrar una venta (para
-- registrar ventas de días anteriores, ej. si se fue la luz y no se pudo
-- registrar a tiempo — ui/venta_form.py, campo_fecha), capturando la hora
-- real al momento del clic en "Vender" (controllers/venta_controller.py).
-- create_pos_sale nunca aceptó una fecha: el INSERT de orders no incluía
-- created_at en la lista de columnas, así que siempre quedaba en el
-- DEFAULT NOW() de la tabla — sin forma de corregir el día de una venta al
-- registrarla en la nube. Se agrega p_created_at (mismo patrón de
-- CREATE OR REPLACE con parámetro nuevo al final con DEFAULT, ya usado en
-- 00021/00025 para p_force).
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE,
    p_created_at TIMESTAMPTZ DEFAULT NULL
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
        status, payment_status, notes, metadata, channel, seller_id, created_at
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
        NULLIF(p_order->>'seller_id', '')::UUID,
        COALESCE(p_created_at, NOW())
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;
        -- v_product_id y v_variant_id ambos NULL: ítem manual fuera de
        -- catálogo (igual que el software local) — no hay stock que validar.

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

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

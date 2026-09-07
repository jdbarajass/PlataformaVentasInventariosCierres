-- =====================================================
-- YJBMOTOCOM — Migración 054: corrección del corte real de SisteCrédito (2 meses, no 1)
-- =====================================================
-- La migración 00053 calculó la fecha de liberación como "primer día del
-- mes SIGUIENTE al de la venta" (ej. venta de julio -> libera 1 de
-- agosto). El usuario aclaró la regla real, con ejemplos concretos: el
-- corte es a fin del mes calendario de la venta, y SisteCrédito paga TODO
-- ese corte el día 1 del mes que sigue al mes SIGUIENTE (ej. venta de
-- julio -> corte 31 de julio -> paga 1 de septiembre; venta de agosto ->
-- paga 1 de octubre; venta de septiembre -> paga 1 de noviembre). Es un
-- mes más de lo que 00053 calculaba.
--
-- Este archivo:
--   1. Corrige `create_pos_sale`/`edit_pos_sale` para usar +2 meses (no +1)
--      al calcular `release_date` de aquí en adelante.
--   2. Corrige los datos que la migración 00053 ya había liberado de más:
--      de las 6 ventas de julio/agosto migradas, según la regla correcta
--      SOLO la de julio (corte 31/07 -> paga 01/09, ya pasado) debía estar
--      liberada hoy -- las 5 de agosto (pagan 01/10) se revierten del saldo
--      real y vuelven a quedar pendientes, con su fecha de liberación
--      corregida.
--   3. Corrige la fecha de liberación guardada (sin tocar el saldo, ya
--      liberada correctamente) de la venta de julio y de la venta del 3 de
--      septiembre (esta última pasa de "01/10" a "01/11").
--   4. Revierte un ajuste manual que el usuario hizo el 2026-09-07 (sumó a
--      mano $510.000 de la venta del 3 de septiembre, sin saber que esa
--      venta ya estaba correctamente guardada como pendiente) -- de aquí
--      en adelante el saldo pendiente se ve solo, en /admin/cuentas, sin
--      necesidad de ajustarlo a mano.
--
-- No aplica en un fork nuevo sin estos datos históricos (todos los bloques
-- son no-ops si no hay filas que coincidan).
-- =====================================================

-- =====================================================
-- FUNCIÓN: create_pos_sale (release_date = +2 meses, no +1)
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
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_margin_pct NUMERIC;
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
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            v_actual_deduct := LEAST(v_qty, v_current_stock);
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

            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador ' || v_order.order_number,
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

        IF v_account_id IS NOT NULL AND v_payment->>'method' = 'sistecredito' THEN
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents, COALESCE(v_margin_pct, 0),
                (v_order.created_at AT TIME ZONE 'America/Bogota')::date,
                (date_trunc('month', (v_order.created_at AT TIME ZONE 'America/Bogota')::date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL THEN
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

-- =====================================================
-- FUNCIÓN: edit_pos_sale (release_date = +2 meses, no +1)
-- =====================================================
CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_margin_pct NUMERIC;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL AND v_payment.method = 'sistecredito' THEN
            DELETE FROM public.sistecredito_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_new_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL AND v_new_payment->>'method' = 'sistecredito' THEN
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, p_order_id, v_amount_cents, COALESCE(v_margin_pct, 0),
                (v_order.created_at AT TIME ZONE 'America/Bogota')::date,
                (date_trunc('month', (v_order.created_at AT TIME ZONE 'America/Bogota')::date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- CORRECCIÓN DE DATOS — deshacer lo liberado de más por 00053 y el ajuste
-- manual del usuario (no aplica si no existen estas filas, ej. un fork
-- nuevo que nunca corrió 00053 con datos reales).
-- =====================================================
DO $$
DECLARE
    v_account_id UUID;
    v_row RECORD;
    v_final_cents BIGINT;
    v_reverse_total BIGINT := 0;
BEGIN
    SELECT id INTO v_account_id FROM public.accounts WHERE payment_method = 'sistecredito' LIMIT 1;
    IF v_account_id IS NULL THEN
        RETURN;
    END IF;

    -- 1) Revertir el ajuste manual del usuario (2026-09-07): sumó a mano
    -- $510.000 de la venta del 3 de septiembre sin saber que ya estaba
    -- correctamente guardada como pendiente.
    IF EXISTS (
        SELECT 1 FROM public.account_movements
        WHERE account_id = v_account_id AND type = 'manual_adjustment' AND amount_cents = 51000000
          AND description = 'Se suma este valor porque el 3 de septiembre se vendio eso en sistecredito'
    ) THEN
        UPDATE public.accounts SET balance_cents = balance_cents - 51000000 WHERE id = v_account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description)
        VALUES (
            v_account_id, 'manual_adjustment', -51000000,
            'Corrección: revierte el ajuste manual del 2026-09-07 — la venta del 3 de septiembre ya vive en sistecredito_pending_releases, no debe sumarse también a mano.'
        );
    END IF;

    -- 2) Las 5 ventas de agosto que 00053 liberó de más (pagan el 1 de
    -- octubre según la regla correcta, no el 1 de septiembre) -- se
    -- revierten del saldo real y vuelven a quedar pendientes.
    FOR v_row IN
        SELECT * FROM public.sistecredito_pending_releases
        WHERE account_id = v_account_id
          AND released_at IS NOT NULL
          AND sale_date >= '2026-08-01' AND sale_date <= '2026-08-31'
    LOOP
        v_final_cents := ROUND(v_row.base_amount_cents * (1 + v_row.margin_pct / 100));
        v_reverse_total := v_reverse_total + v_final_cents;

        UPDATE public.sistecredito_pending_releases
        SET released_at = NULL,
            release_date = (date_trunc('month', v_row.sale_date) + interval '2 months')::date
        WHERE id = v_row.id;
    END LOOP;

    IF v_reverse_total > 0 THEN
        UPDATE public.accounts SET balance_cents = balance_cents - v_reverse_total WHERE id = v_account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description)
        VALUES (
            v_account_id, 'manual_adjustment', -v_reverse_total,
            'Corrección: la migración 00053 liberó de más 5 ventas de agosto de SisteCrédito (pagan el 1 de octubre, no el 1 de septiembre) — vuelven a quedar pendientes.'
        );
    END IF;

    -- 3) Corregir la fecha de liberación guardada (sin tocar el saldo) de
    -- la venta de julio, ya liberada correctamente, y de la de septiembre,
    -- todavía pendiente.
    UPDATE public.sistecredito_pending_releases
    SET release_date = (date_trunc('month', sale_date) + interval '2 months')::date
    WHERE account_id = v_account_id
      AND (sale_date < '2026-08-01' OR sale_date >= '2026-09-01');
END $$;

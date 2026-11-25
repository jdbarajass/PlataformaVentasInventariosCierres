-- =====================================================
-- Migración 068: blindaje de la plata en ventas de mostrador
-- =====================================================
-- Corrige las fallas de plata de la auditoría del 31-oct
-- (docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md, casos B1-B6 y B9 de
-- scripts/auditoria-ventas/audit.mjs).
--
-- Causa de fondo: cancelar y editar decidían cuánta plata sacar mirando la
-- ETIQUETA del método de pago (efectivo, datáfono…), no lo que de verdad
-- entró a cada cuenta. Fallaba cuando el datáfono/Addi/SisteCrédito ya se
-- había desembolsado (B2, B3), cuando el método se cambió en bloque (B6) o
-- con ventas de datáfono anteriores a la 00055 (B5).
--
-- Regla nueva: al cancelar o editar se devuelve EXACTAMENTE lo que esa venta
-- metió a cada cuenta según su historial de movimientos (venta, reversas,
-- ajustes y desembolsos), y se borra lo que todavía estaba por llegar.
--
-- Además:
--   * B1: cancelar una venta ya cancelada se rechaza.
--   * B4: editar una venta cancelada se rechaza.
--   * B9: todo pago de mostrador debe tener cuenta.
--   * B6: el cambio de método en bloque pasa por change_pos_payment_method,
--     que mueve la plata a la cuenta nueva (antes solo cambiaba la etiqueta).
--   * Editar una venta ya desembolsada sin cambiar ese pago (mismo método,
--     cuenta y valor) no toca la plata: el desembolso se conserva.
--
-- Funciones nuevas sin permiso para anon/authenticated (regla de la 00065).
-- No toca datos existentes.
-- =====================================================

-- -----------------------------------------------------
-- Helper: devolver lo que una venta metió a las cuentas
-- -----------------------------------------------------
-- p_keep: {"<account_id>": cents} que NO se devuelven (desembolsos que se
-- conservan al editar sin cambiar ese pago).
CREATE OR REPLACE FUNCTION public._pos_reverse_order_money(
    p_order_id UUID,
    p_note TEXT,
    p_keep JSONB DEFAULT '{}'::jsonb
)
RETURNS void AS $$
DECLARE
    v_row RECORD;
    v_net BIGINT;
BEGIN
    FOR v_row IN
        SELECT account_id, SUM(amount_cents)::BIGINT AS net
        FROM public.account_movements
        WHERE reference_id = p_order_id
          AND reference_type IN ('order', 'card_release', 'addi_release', 'sistecredito_release')
          AND account_id IS NOT NULL
        GROUP BY account_id
    LOOP
        v_net := v_row.net - COALESCE((p_keep->>(v_row.account_id::text))::BIGINT, 0);
        IF v_net <> 0 THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_net WHERE id = v_row.account_id;
            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_row.account_id, 'sale_reversal', -v_net, p_note, p_order_id, 'order');
        END IF;
    END LOOP;

    -- Lo que todavía no había llegado: se borra (ya no va a llegar).
    DELETE FROM public.card_pending_releases WHERE order_id = p_order_id AND released_at IS NULL;
    DELETE FROM public.addi_pending_releases WHERE order_id = p_order_id AND released_at IS NULL;
    DELETE FROM public.sistecredito_pending_releases WHERE order_id = p_order_id AND released_at IS NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- -----------------------------------------------------
-- Helper: aplicar un pago a su cuenta (o dejarlo pendiente)
-- -----------------------------------------------------
-- Datáfono, Addi y SisteCrédito quedan pendientes hasta su fecha. Con
-- p_release_if_due (al editar o cambiar el método de una venta vieja), si la
-- fecha ya pasó se acredita de una vez, como habría hecho el cron.
CREATE OR REPLACE FUNCTION public._pos_apply_payment(
    p_order_id UUID,
    p_order_number TEXT,
    p_sale_date DATE,
    p_method TEXT,
    p_account_id UUID,
    p_amount_cents BIGINT,
    p_created_by UUID,
    p_description TEXT,
    p_release_if_due BOOLEAN DEFAULT FALSE
)
RETURNS void AS $$
DECLARE
    v_margin_pct NUMERIC;
    v_release_date DATE;
    v_pending_id UUID;
    v_final BIGINT;
BEGIN
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'Cada pago debe tener una cuenta (método %)', p_method;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
        RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
    END IF;

    IF p_method = 'sistecredito' THEN
        SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;
        v_margin_pct := COALESCE(v_margin_pct, 0);
        v_release_date := (date_trunc('month', p_sale_date) + interval '2 months')::date;
        INSERT INTO public.sistecredito_pending_releases (account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date)
        VALUES (p_account_id, p_order_id, p_amount_cents, v_margin_pct, p_sale_date, v_release_date)
        RETURNING id INTO v_pending_id;
        IF p_release_if_due AND v_release_date <= CURRENT_DATE THEN
            v_final := ROUND(p_amount_cents * (1 + v_margin_pct / 100));
            UPDATE public.accounts SET balance_cents = balance_cents + v_final WHERE id = p_account_id;
            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (p_account_id, 'sistecredito_release', v_final,
                    'Desembolso SisteCrédito — venta del ' || to_char(p_sale_date, 'DD/MM/YYYY') || ' (' || v_margin_pct || '% margen aplicado)',
                    p_order_id, 'sistecredito_release');
            UPDATE public.sistecredito_pending_releases SET released_at = NOW() WHERE id = v_pending_id;
        END IF;

    ELSIF p_method = 'card' THEN
        v_release_date := public.next_business_day_co(p_sale_date);
        INSERT INTO public.card_pending_releases (account_id, order_id, amount_cents, sale_date, release_date)
        VALUES (p_account_id, p_order_id, p_amount_cents, p_sale_date, v_release_date)
        RETURNING id INTO v_pending_id;
        IF p_release_if_due AND v_release_date <= CURRENT_DATE THEN
            UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_account_id;
            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (p_account_id, 'card_release', p_amount_cents,
                    'Desembolso datáfono — venta del ' || to_char(p_sale_date, 'DD/MM/YYYY'), p_order_id, 'card_release');
            UPDATE public.card_pending_releases SET released_at = NOW() WHERE id = v_pending_id;
        END IF;

    ELSIF p_method = 'addi' THEN
        v_release_date := public.next_addi_release_date(p_sale_date);
        INSERT INTO public.addi_pending_releases (account_id, order_id, amount_cents, sale_date, release_date)
        VALUES (p_account_id, p_order_id, p_amount_cents, p_sale_date, v_release_date)
        RETURNING id INTO v_pending_id;
        IF p_release_if_due AND v_release_date <= CURRENT_DATE THEN
            UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_account_id;
            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (p_account_id, 'addi_release', p_amount_cents,
                    'Desembolso Addi — venta del ' || to_char(p_sale_date, 'DD/MM/YYYY'), p_order_id, 'addi_release');
            UPDATE public.addi_pending_releases SET released_at = NOW() WHERE id = v_pending_id;
        END IF;

    ELSE
        UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_account_id;
        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (p_account_id, 'sale', p_amount_cents, p_description, p_order_id, 'order', p_created_by);
    END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- -----------------------------------------------------
-- create_pos_sale: igual que en la 00056, pero cada pago exige cuenta (B9)
-- y la plata se aplica con _pos_apply_payment.
-- -----------------------------------------------------
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
    v_sale_date DATE;
BEGIN
    -- Validar las cuentas antes de tocar inventario (B9).
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        IF NULLIF(v_payment->>'account_id', '') IS NULL THEN
            RAISE EXCEPTION 'Cada pago debe tener una cuenta (método %)', v_payment->>'method';
        END IF;
    END LOOP;

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

    v_sale_date := (v_order.created_at AT TIME ZONE 'America/Bogota')::date;

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

        PERFORM public._pos_apply_payment(
            v_order.id, v_order.order_number, v_sale_date, v_payment->>'method', v_account_id, v_amount_cents,
            NULLIF(p_order->>'seller_id', '')::UUID, 'Venta de mostrador ' || v_order.order_number, FALSE
        );
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- edit_pos_sale: rechaza ventas canceladas (B4), exige cuenta (B9) y
-- devuelve la plata según lo que de verdad entró (B3).
-- -----------------------------------------------------
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
    v_new_item JSONB;
    v_new_payment JSONB;
    v_idx BIGINT;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_method TEXT;
    v_sale_date DATE;
    v_keep JSONB := '{}'::jsonb;
    v_kept_rows UUID[] := '{}';
    v_matched BIGINT[] := '{}';
    v_row_id UUID;
    v_credited BIGINT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;
    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta % ya está cancelada: no se puede editar', v_order.order_number;
    END IF;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        IF NULLIF(v_new_payment->>'account_id', '') IS NULL THEN
            RAISE EXCEPTION 'Cada pago debe tener una cuenta (método %)', v_new_payment->>'method';
        END IF;
    END LOOP;

    -- Inventario: devolver lo de la versión anterior (igual que antes).
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

    -- Desembolsos que se conservan: pago nuevo idéntico (método, cuenta y
    -- valor) a uno ya desembolsado. Así corregir el cliente no mueve plata.
    FOR v_new_payment, v_idx IN SELECT value, ordinality FROM jsonb_array_elements(p_payments) WITH ORDINALITY
    LOOP
        v_method := v_new_payment->>'method';
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;
        v_row_id := NULL;

        IF v_method = 'card' THEN
            SELECT id, amount_cents INTO v_row_id, v_credited FROM public.card_pending_releases
            WHERE order_id = p_order_id AND account_id = v_account_id AND amount_cents = v_amount_cents
              AND released_at IS NOT NULL AND NOT (id = ANY(v_kept_rows)) LIMIT 1;
        ELSIF v_method = 'addi' THEN
            SELECT id, amount_cents INTO v_row_id, v_credited FROM public.addi_pending_releases
            WHERE order_id = p_order_id AND account_id = v_account_id AND amount_cents = v_amount_cents
              AND released_at IS NOT NULL AND NOT (id = ANY(v_kept_rows)) LIMIT 1;
        ELSIF v_method = 'sistecredito' THEN
            SELECT id, ROUND(base_amount_cents * (1 + margin_pct / 100))::BIGINT INTO v_row_id, v_credited
            FROM public.sistecredito_pending_releases
            WHERE order_id = p_order_id AND account_id = v_account_id AND base_amount_cents = v_amount_cents
              AND released_at IS NOT NULL AND NOT (id = ANY(v_kept_rows)) LIMIT 1;
        END IF;

        IF v_row_id IS NOT NULL THEN
            v_kept_rows := v_kept_rows || v_row_id;
            v_matched := v_matched || v_idx;
            v_keep := jsonb_set(v_keep, ARRAY[v_account_id::text],
                to_jsonb(COALESCE((v_keep->>(v_account_id::text))::BIGINT, 0) + v_credited));
        END IF;
    END LOOP;

    PERFORM public._pos_reverse_order_money(p_order_id, 'Reversa por edicion de venta de mostrador', v_keep);

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

    v_sale_date := (v_order.created_at AT TIME ZONE 'America/Bogota')::date;

    FOR v_new_payment, v_idx IN SELECT value, ordinality FROM jsonb_array_elements(p_payments) WITH ORDINALITY
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

        IF NOT (v_idx = ANY(v_matched)) THEN
            PERFORM public._pos_apply_payment(
                p_order_id, v_order.order_number, v_sale_date, v_new_payment->>'method', v_account_id, v_amount_cents,
                NULL, 'Venta de mostrador editada ' || v_order.order_number, TRUE
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- cancel_pos_sale: rechaza la doble cancelación (B1) y devuelve la plata
-- según lo que de verdad entró (B2, B5, B6).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;
    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta % ya está cancelada', v_order.order_number;
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
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    PERFORM public._pos_reverse_order_money(p_order_id, 'Reversa de venta de mostrador cancelada');

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- change_pos_payment_method: cambio de método que SÍ mueve la plata (B6)
-- -----------------------------------------------------
-- Solo ventas de mostrador activas con un único pago (igual que el cambio
-- masivo de Ventas del Día). Devuelve lo que entró, cambia método y cuenta,
-- y aplica el pago otra vez (si la fecha de desembolso ya pasó, acredita de
-- una vez).
CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
    p_order_id UUID,
    p_method TEXT,
    p_account_id UUID,
    p_method_detail TEXT DEFAULT NULL,
    p_commission_cents INT DEFAULT 0
)
RETURNS void AS $$
DECLARE
    v_order public.orders;
    v_payment public.payments;
    v_count INT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;
    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta % ya está cancelada', v_order.order_number;
    END IF;
    IF p_account_id IS NULL THEN
        RAISE EXCEPTION 'Cada pago debe tener una cuenta (método %)', p_method;
    END IF;

    SELECT count(*) INTO v_count FROM public.payments WHERE order_id = p_order_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'La venta % tiene % pagos: el cambio de método es solo para ventas con un pago', v_order.order_number, v_count;
    END IF;
    SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id;

    PERFORM public._pos_reverse_order_money(p_order_id, 'Reversa por cambio de método de pago');

    UPDATE public.payments
    SET method = p_method, account_id = p_account_id, method_detail = NULLIF(p_method_detail, ''),
        commission_cents = COALESCE(p_commission_cents, 0)
    WHERE id = v_payment.id;

    PERFORM public._pos_apply_payment(
        p_order_id, v_order.order_number, (v_order.created_at AT TIME ZONE 'America/Bogota')::date,
        p_method, p_account_id, v_payment.amount_cents, NULL,
        'Venta de mostrador ' || v_order.order_number || ' (cambio de método)', TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- Permisos (regla de la 00065): solo el servidor (service_role).
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public._pos_reverse_order_money(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pos_apply_payment(UUID, TEXT, DATE, TEXT, UUID, BIGINT, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_pos_payment_method(UUID, TEXT, UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pos_sale(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._pos_reverse_order_money(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public._pos_apply_payment(UUID, TEXT, DATE, TEXT, UUID, BIGINT, UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_pos_payment_method(UUID, TEXT, UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pos_sale(UUID) TO service_role;

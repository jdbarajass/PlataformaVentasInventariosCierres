-- =====================================================
-- Migración 073: blindaje del inventario (auditoría B7, B8, B11, B12, B14)
-- =====================================================
-- Igual en YJBMOTOCOM y YBMOTOCOM (2026-11-27). Detalle en
-- docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md, sección 11.
--
-- B7  Vender un producto CON tallas sin elegir talla: el descuento iba a
--     products.stock_qty y el trigger de sincronización lo borraba. Ahora
--     create_pos_sale lo rechaza. edit_pos_sale solo lo acepta para ítems que
--     ya venían así en la venta original (ventas viejas, de antes de que el
--     producto tuviera tallas), y en ese caso no mueve stock ni a la ida ni
--     a la vuelta (antes se sumaba y restaba en el total, que se pierde).
-- B8  Vender una talla, borrarla y cancelar la venta perdía la unidad.
--     Al cancelar (mostrador u online) la unidad vuelve a la talla con el
--     mismo nombre (order_items.product_talla); si ya no existe, se vuelve a
--     crear con esa unidad. Antes de borrar una talla se guarda su nombre en
--     los ítems que la usaban (red de seguridad: las ventas ya lo guardan).
-- B11/B12  Ajustes de inventario atómicos (adjust_inventory). Con
--     p_expected (el stock que la persona vio al contar o abrir el
--     formulario) se aplica la DIFERENCIA sobre el stock actual, así una
--     venta que entra en medio no se borra. Un producto con tallas no se
--     ajusta en el total (iría a un número que el trigger pisa).
-- B14 Reembolso/cancelación de una orden online pagada: refund_online_order
--     cambia el estado y devuelve el stock en una sola transacción, una sola
--     vez (también si el webhook llega repetido o el admin ya la canceló).
--
-- No modifica datos existentes: solo funciones y un trigger.
-- =====================================================

-- -----------------------------------------------------
-- Helpers
-- -----------------------------------------------------

-- ¿El producto tiene tallas activas? (misma regla del trigger de sincronización)
CREATE OR REPLACE FUNCTION public._inv_has_tallas(p_product_id UUID)
RETURNS BOOLEAN AS $$
    SELECT p_product_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.product_variants WHERE product_id = p_product_id AND active = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Devuelve al inventario la unidad de un ítem vendido (cancelación de
-- mostrador u online). Siempre deja su movimiento 'return' cuando mueve stock.
CREATE OR REPLACE FUNCTION public._inv_return_item_stock(
    p_product_id UUID,
    p_variant_id UUID,
    p_talla TEXT,
    p_qty INT,
    p_cost_cents INT,
    p_note TEXT,
    p_reference_id UUID,
    p_reference_type TEXT
)
RETURNS VOID AS $$
DECLARE
    v_target UUID;
    v_note TEXT := p_note;
BEGIN
    IF p_product_id IS NULL AND p_variant_id IS NULL THEN
        RETURN; -- ítem manual fuera de catálogo
    END IF;

    IF p_variant_id IS NOT NULL THEN
        UPDATE public.product_variants SET stock_qty = stock_qty + p_qty WHERE id = p_variant_id;
        v_target := p_variant_id;
    ELSIF public._inv_has_tallas(p_product_id) THEN
        -- La talla de la venta ya no existe con ese id (se borró) o la venta
        -- es de antes de que el producto tuviera tallas.
        IF COALESCE(p_qty, 0) <= 0 THEN
            RETURN; -- no se había descontado nada: no hay unidad que devolver
        END IF;
        IF NULLIF(trim(p_talla), '') IS NULL THEN
            -- Sin nombre de talla no hay a dónde devolverla: sumarla al total
            -- sería una unidad fantasma que el trigger borra. Queda registrado
            -- para ajustarla a mano en la talla correcta.
            INSERT INTO public.audit_logs (action, table_name, record_id, new_data)
            VALUES ('stock_return_sin_talla', 'orders', p_reference_id,
                    jsonb_build_object('product_id', p_product_id, 'qty', p_qty,
                        'nota', 'Venta sin talla de un producto con tallas: ajustar la unidad a mano en la talla correcta'));
            RETURN;
        END IF;

        SELECT id INTO v_target FROM public.product_variants
        WHERE product_id = p_product_id AND upper(trim(talla)) = upper(trim(p_talla))
        ORDER BY active DESC LIMIT 1;

        IF v_target IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + p_qty, active = true WHERE id = v_target;
        ELSE
            INSERT INTO public.product_variants (product_id, talla, stock_qty, cost_cents, active)
            VALUES (p_product_id, trim(p_talla), p_qty, COALESCE(p_cost_cents, 0), true)
            RETURNING id INTO v_target;
            v_note := p_note || ' (talla ' || trim(p_talla) || ' vuelta a crear)';
        END IF;
    ELSE
        UPDATE public.products SET stock_qty = stock_qty + p_qty WHERE id = p_product_id;
    END IF;

    INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
    VALUES (p_product_id, v_target, p_qty, 'return', v_note, p_reference_id, p_reference_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- B8: antes de borrar una talla, guardar su nombre en los ítems que la usan
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.keep_talla_name_on_variant_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.order_items SET product_talla = OLD.talla
    WHERE variant_id = OLD.id AND product_talla IS NULL AND OLD.talla IS NOT NULL;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_keep_talla_name_on_variant_delete ON public.product_variants;
CREATE TRIGGER trg_keep_talla_name_on_variant_delete
    BEFORE DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.keep_talla_name_on_variant_delete();

-- -----------------------------------------------------
-- create_pos_sale: igual que en la 00068, más B7 (talla obligatoria) y el
-- nombre de la talla tomado de la base si no vino.
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
    v_talla TEXT;
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
        v_talla := NULLIF(v_item->>'product_talla', '');

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty, COALESCE(v_talla, talla) INTO v_current_stock, v_talla
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
            IF public._inv_has_tallas(v_product_id) THEN
                RAISE EXCEPTION 'El producto "%" tiene tallas: elige la talla al venderlo', v_item->>'product_title';
            END IF;

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
            NULLIF(v_item->>'product_image', ''), v_variant_id, v_talla,
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
-- edit_pos_sale: igual que en la 00068, más B7.
-- Un ítem sin talla de un producto que hoy tiene tallas solo se acepta si ya
-- venía así en la venta (hasta esa misma cantidad), y no mueve stock: ni se
-- devuelve al quitar la versión anterior ni se descuenta al guardar. Conserva
-- lo que se había descontado, para que una cancelación posterior sepa
-- cuánto devolver.
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
    v_talla TEXT;
    -- Ítems sin talla de productos con tallas que traía la venta original:
    -- { product_id: { "qty": n, "ded": n, "talla": "..." } }
    v_sin_talla JSONB := '{}'::jsonb;
    v_key TEXT;
    v_left_qty INT;
    v_left_ded INT;
    v_skip_stock BOOLEAN;
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

    -- Inventario: devolver lo de la versión anterior.
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NULL AND public._inv_has_tallas(v_item.product_id) THEN
            v_key := v_item.product_id::text;
            v_sin_talla := jsonb_set(v_sin_talla, ARRAY[v_key], jsonb_build_object(
                'qty', COALESCE((v_sin_talla->v_key->>'qty')::INT, 0) + v_item.qty,
                'ded', COALESCE((v_sin_talla->v_key->>'ded')::INT, 0) + COALESCE(v_item.stock_deducted, v_item.qty),
                'talla', COALESCE(v_sin_talla->v_key->>'talla', v_item.product_talla)
            ));
            CONTINUE;
        END IF;

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
        v_talla := NULLIF(v_new_item->>'product_talla', '');
        v_skip_stock := FALSE;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty, COALESCE(v_talla, talla) INTO v_current_stock, v_talla
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL AND public._inv_has_tallas(v_product_id) THEN
            v_key := v_product_id::text;
            v_left_qty := COALESCE((v_sin_talla->v_key->>'qty')::INT, 0);
            IF v_qty > v_left_qty THEN
                RAISE EXCEPTION 'El producto "%" tiene tallas: elige la talla al venderlo', v_new_item->>'product_title';
            END IF;
            v_left_ded := COALESCE((v_sin_talla->v_key->>'ded')::INT, 0);
            v_actual_deduct := LEAST(v_qty, v_left_ded);
            v_talla := COALESCE(v_talla, v_sin_talla->v_key->>'talla');
            v_sin_talla := jsonb_set(v_sin_talla, ARRAY[v_key], jsonb_build_object(
                'qty', v_left_qty - v_qty, 'ded', v_left_ded - v_actual_deduct, 'talla', v_sin_talla->v_key->>'talla'));
            v_skip_stock := TRUE;
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
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, v_talla,
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF (v_product_id IS NOT NULL OR v_variant_id IS NOT NULL) AND NOT v_skip_stock THEN
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
-- cancel_pos_sale: igual que en la 00068; la unidad vuelve con
-- _inv_return_item_stock (B8).
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
        PERFORM public._inv_return_item_stock(
            v_item.product_id, v_item.variant_id, v_item.product_talla,
            COALESCE(v_item.stock_deducted, v_item.qty), v_item.cost_cents,
            'Reversa de venta de mostrador cancelada', p_order_id, 'order'
        );
    END LOOP;

    PERFORM public._pos_reverse_order_money(p_order_id, 'Reversa de venta de mostrador cancelada');

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- B14: cancelar o reembolsar una orden ONLINE
-- -----------------------------------------------------
-- p_status: 'cancelled' (admin) o 'refunded' (webhook de Stripe/MercadoPago).
-- Si la orden estaba pagada y activa, devuelve el stock de sus ítems; si ya
-- estaba cancelada/reembolsada o nunca se pagó, solo cambia el estado.
-- Devuelve TRUE si devolvió stock.
CREATE OR REPLACE FUNCTION public.refund_online_order(p_order_id UUID, p_status TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_was_paid BOOLEAN;
BEGIN
    IF p_status NOT IN ('cancelled', 'refunded') THEN
        RAISE EXCEPTION 'Estado no válido para cancelar/reembolsar: %', p_status;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Orden % no encontrada', p_order_id;
    END IF;
    IF v_order.channel = 'pos' THEN
        RAISE EXCEPTION 'La orden % es de mostrador: se cancela desde Ventas del Día', v_order.order_number;
    END IF;

    v_was_paid := v_order.payment_status = 'paid' AND v_order.status NOT IN ('cancelled', 'refunded');

    UPDATE public.orders
    SET status = p_status,
        payment_status = CASE WHEN p_status = 'refunded' OR v_was_paid THEN 'refunded' ELSE payment_status END,
        updated_at = NOW()
    WHERE id = p_order_id;

    IF v_was_paid THEN
        FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
        LOOP
            PERFORM public._inv_return_item_stock(
                v_item.product_id, v_item.variant_id, v_item.product_talla,
                COALESCE(v_item.stock_deducted, v_item.qty), v_item.cost_cents,
                CASE WHEN p_status = 'refunded' THEN 'Reversa de orden online reembolsada' ELSE 'Reversa de orden online cancelada' END,
                p_order_id, 'order'
            );
        END LOOP;
    END IF;

    RETURN v_was_paid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- B11/B12: ajuste de inventario atómico
-- -----------------------------------------------------
-- p_type: 'in' / 'return' suman |p_qty|; 'out' resta |p_qty|; 'adjustment'
-- deja la cantidad final p_qty. Con p_expected (el stock que se vio) el
-- ajuste aplica la diferencia p_qty - p_expected sobre el stock ACTUAL.
-- El movimiento y la auditoría quedan igual que los dejaba la API
-- (inventory_movements.qty: la diferencia en 'adjustment', p_qty en el resto;
-- audit_logs 'inventory_adjustment' con el stock anterior y el nuevo).
CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_product_id UUID,
    p_variant_id UUID,
    p_type TEXT,
    p_qty INT,
    p_expected INT DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (previous_stock INT, new_stock INT, movement_id UUID, sold_meanwhile INT) AS $$
DECLARE
    v_current INT;
    v_new INT;
    v_mov UUID;
BEGIN
    IF p_type NOT IN ('in', 'out', 'adjustment', 'return') THEN
        RAISE EXCEPTION 'Tipo de ajuste no válido: %', p_type;
    END IF;

    IF p_variant_id IS NOT NULL THEN
        SELECT stock_qty INTO v_current FROM public.product_variants
        WHERE id = p_variant_id AND product_id = p_product_id FOR UPDATE;
        IF v_current IS NULL THEN
            RAISE EXCEPTION 'Variante no encontrada para este producto';
        END IF;
    ELSE
        SELECT stock_qty INTO v_current FROM public.products WHERE id = p_product_id FOR UPDATE;
        IF v_current IS NULL THEN
            RAISE EXCEPTION 'Producto no encontrado';
        END IF;
        IF public._inv_has_tallas(p_product_id) THEN
            RAISE EXCEPTION 'Este producto tiene tallas: ajusta la talla, no el total';
        END IF;
    END IF;

    IF p_type IN ('in', 'return') THEN
        v_new := v_current + abs(p_qty);
    ELSIF p_type = 'out' THEN
        v_new := v_current - abs(p_qty);
    ELSIF p_expected IS NOT NULL THEN
        v_new := v_current + (p_qty - p_expected);
    ELSE
        v_new := p_qty;
    END IF;

    IF v_new < 0 THEN
        IF p_expected IS NOT NULL AND v_current <> p_expected THEN
            RAISE EXCEPTION 'El stock no puede quedar negativo: hay % (cambió desde que se abrió, de % a %). Revisa y vuelve a intentar', v_current, p_expected, v_current;
        END IF;
        RAISE EXCEPTION 'El stock no puede ser negativo';
    END IF;

    INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, created_by)
    VALUES (p_product_id, p_variant_id,
            CASE WHEN p_type = 'adjustment' THEN v_new - v_current ELSE p_qty END,
            p_type, p_note, p_created_by)
    RETURNING id INTO v_mov;

    IF p_variant_id IS NOT NULL THEN
        UPDATE public.product_variants SET stock_qty = v_new WHERE id = p_variant_id;
    ELSE
        UPDATE public.products SET stock_qty = v_new WHERE id = p_product_id;
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
    VALUES (p_created_by, 'inventory_adjustment',
            CASE WHEN p_variant_id IS NOT NULL THEN 'product_variants' ELSE 'products' END,
            COALESCE(p_variant_id, p_product_id),
            jsonb_build_object('stock_qty', v_current), jsonb_build_object('stock_qty', v_new));

    RETURN QUERY SELECT v_current, v_new, v_mov,
        CASE WHEN p_expected IS NOT NULL THEN p_expected - v_current ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- Permisos: solo el servidor (service_role), igual que la 00065/00068
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public._inv_has_tallas(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_return_item_stock(UUID, UUID, TEXT, INT, INT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keep_talla_name_on_variant_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_online_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_inventory(UUID, UUID, TEXT, INT, INT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pos_sale(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._inv_has_tallas(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public._inv_return_item_stock(UUID, UUID, TEXT, INT, INT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_online_order(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(UUID, UUID, TEXT, INT, INT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB, BOOLEAN, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pos_sale(UUID) TO service_role;

-- Verificación (debe dar 5 filas):
-- SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('_inv_has_tallas', '_inv_return_item_stock', 'refund_online_order', 'adjust_inventory', 'keep_talla_name_on_variant_delete');

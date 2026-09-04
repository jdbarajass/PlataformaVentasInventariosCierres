-- =====================================================
-- YJBMOTOCOM — Migración 053: liberación mensual real de SisteCrédito
-- =====================================================
-- SisteCrédito no paga la venta el mismo día: agrupa por CORTE DE MES
-- calendario y paga todo ese mes junto el día 1 del mes siguiente (una
-- venta del 1 o del 30 de un mes, ambas se pagan el día 1 del mes
-- siguiente), y descuenta su comisión — la tienda ya le traslada ese
-- costo al cliente con un recargo mayor, así que lo que en verdad llega
-- es base + `sistecredito_margin_pct` (migración 00050).
--
-- Hasta ahora `create_pos_sale` acreditaba el valor base a `accounts`
-- de inmediato, como cualquier otro método de pago — plata que en
-- realidad no está disponible todavía. Este archivo:
--   1. Crea `sistecredito_pending_releases`: cada venta por SisteCrédito
--      queda aquí (no en el saldo real) hasta su fecha de liberación.
--   2. Cambia `create_pos_sale`/`edit_pos_sale`/`cancel_pos_sale` para que
--      un pago 'sistecredito' NUNCA toque `accounts.balance_cents`
--      directamente — solo inserta/borra la fila pendiente.
--   3. Agrega `release_sistecredito_pending()`, que un cron corre a
--      diario (idempotente: solo actúa sobre filas con
--      `release_date <= CURRENT_DATE` y `released_at IS NULL`) y ahí sí
--      acredita la cuenta, ya con el margen aplicado.
--   4. Migra los datos reales que ya existían de forma manual: 6 ventas
--      de julio/agosto ya vencidas se liberan de una vez (con margen), la
--      del 3 de septiembre queda pendiente hasta el 1 de octubre, y se
--      borran las 6 filas manuales de `account_receivables` que las
--      representaban (quedan reemplazadas por este mecanismo automático).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sistecredito_pending_releases (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id        UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    order_id          UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
    base_amount_cents BIGINT      NOT NULL CHECK (base_amount_cents > 0),
    margin_pct        NUMERIC     NOT NULL DEFAULT 0,
    sale_date         DATE        NOT NULL,
    release_date      DATE        NOT NULL,
    released_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistecredito_pending_account ON public.sistecredito_pending_releases(account_id);
CREATE INDEX IF NOT EXISTS idx_sistecredito_pending_release_date ON public.sistecredito_pending_releases(release_date) WHERE released_at IS NULL;

ALTER TABLE public.sistecredito_pending_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sistecredito pending releases"
ON public.sistecredito_pending_releases FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "admin_readonly_can_view_sistecredito_pending"
ON public.sistecredito_pending_releases FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');

-- Nuevo tipo de movimiento para distinguir en el historial una liberación
-- automática de SisteCrédito de una venta o un ajuste manual cualquiera.
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_type_check;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_type_check
    CHECK (type IN (
        'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
        'operating_expense', 'expense_reversal', 'invoice_payment',
        'credit_payment', 'credit_payment_reversal', 'sale_reversal',
        'sistecredito_release'
    ));

-- =====================================================
-- FUNCIÓN: create_pos_sale (con manejo especial de 'sistecredito')
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
        -- v_product_id y v_variant_id ambos NULL: ítem manual fuera de
        -- catálogo (igual que el software local) — no hay stock que validar.

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
            -- No se acredita el saldo real todavía -- SisteCrédito paga con
            -- corte de mes calendario, un mes después (ver comentario arriba).
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents, COALESCE(v_margin_pct, 0),
                (v_order.created_at AT TIME ZONE 'America/Bogota')::date,
                (date_trunc('month', (v_order.created_at AT TIME ZONE 'America/Bogota')::date) + interval '1 month')::date
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
-- FUNCIÓN: edit_pos_sale (con manejo especial de 'sistecredito')
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
            -- Nunca llegó a tocar el saldo real -- solo borrar la fila
            -- pendiente que se creó para este pago.
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
                (date_trunc('month', (v_order.created_at AT TIME ZONE 'America/Bogota')::date) + interval '1 month')::date
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
-- FUNCIÓN: cancel_pos_sale (con manejo especial de 'sistecredito')
-- =====================================================
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
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL AND v_payment.method = 'sistecredito' THEN
            DELETE FROM public.sistecredito_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: release_sistecredito_pending
-- =====================================================
-- Idempotente: solo toca filas vencidas (release_date <= hoy) y sin
-- liberar todavía. Pensada para correr a diario desde un cron -- si un
-- día falla o no corre, el día siguiente recoge lo pendiente igual.
CREATE OR REPLACE FUNCTION public.release_sistecredito_pending()
RETURNS JSONB AS $$
DECLARE
    v_row RECORD;
    v_final_cents BIGINT;
    v_released_count INT := 0;
    v_released_total BIGINT := 0;
BEGIN
    FOR v_row IN
        SELECT * FROM public.sistecredito_pending_releases
        WHERE released_at IS NULL AND release_date <= CURRENT_DATE
        ORDER BY sale_date
        FOR UPDATE
    LOOP
        v_final_cents := ROUND(v_row.base_amount_cents * (1 + v_row.margin_pct / 100));

        UPDATE public.accounts SET balance_cents = balance_cents + v_final_cents WHERE id = v_row.account_id;

        INSERT INTO public.account_movements (
            account_id, type, amount_cents, description, reference_id, reference_type
        ) VALUES (
            v_row.account_id, 'sistecredito_release', v_final_cents,
            'Liberación SisteCrédito — venta del ' || to_char(v_row.sale_date, 'DD/MM/YYYY') ||
            ' (' || v_row.margin_pct || '% margen aplicado)',
            v_row.order_id, 'sistecredito_release'
        );

        UPDATE public.sistecredito_pending_releases SET released_at = NOW() WHERE id = v_row.id;

        v_released_count := v_released_count + 1;
        v_released_total := v_released_total + v_final_cents;
    END LOOP;

    RETURN jsonb_build_object('released_count', v_released_count, 'released_total_cents', v_released_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- BACKFILL — datos reales de YJBMOTOCOM (no aplica en un fork nuevo:
-- si no existe una cuenta 'sistecredito' o no hay filas viejas que
-- migrar, todo este bloque simplemente no hace nada).
-- =====================================================
DO $$
DECLARE
    v_account_id UUID;
    v_margin_pct NUMERIC;
    v_old_receivable RECORD;
    v_final_cents BIGINT;
    v_released_total BIGINT := 0;
    v_pending_order_id UUID;
    v_pending_amount_cents BIGINT;
BEGIN
    SELECT id INTO v_account_id FROM public.accounts WHERE payment_method = 'sistecredito' LIMIT 1;
    IF v_account_id IS NULL THEN
        RETURN;
    END IF;

    SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;
    v_margin_pct := COALESCE(v_margin_pct, 0);

    -- 1) Las cuentas por cobrar manuales viejas (registradas a mano antes de
    -- que existiera este mecanismo automático) que ya vencieron (su mes de
    -- liberación ya pasó) se migran a la tabla nueva, YA liberadas, y se
    -- borran de account_receivables (quedan reemplazadas, no duplicadas).
    FOR v_old_receivable IN
        SELECT * FROM public.account_receivables
        WHERE account_id = v_account_id
          AND (date_trunc('month', debt_date) + interval '1 month')::date <= CURRENT_DATE
    LOOP
        v_final_cents := ROUND(v_old_receivable.amount_cents * (1 + v_margin_pct / 100));

        INSERT INTO public.sistecredito_pending_releases (
            account_id, base_amount_cents, margin_pct, sale_date, release_date, released_at
        ) VALUES (
            v_account_id, v_old_receivable.amount_cents, v_margin_pct, v_old_receivable.debt_date,
            (date_trunc('month', v_old_receivable.debt_date) + interval '1 month')::date, NOW()
        );

        v_released_total := v_released_total + v_final_cents;

        DELETE FROM public.account_receivables WHERE id = v_old_receivable.id;
    END LOOP;

    IF v_released_total > 0 THEN
        UPDATE public.accounts SET balance_cents = balance_cents + v_released_total WHERE id = v_account_id;

        INSERT INTO public.account_movements (
            account_id, type, amount_cents, description, reference_type
        ) VALUES (
            v_account_id, 'sistecredito_release', v_released_total,
            'Migración inicial: liberación de ventas SisteCrédito de meses ya vencidos (' || v_margin_pct || '% margen aplicado)',
            'sistecredito_release'
        );
    END IF;

    -- 2) La venta real más reciente del 2026-09-03 ($500.000) ya se había
    -- acreditado de inmediato al saldo real (comportamiento viejo, antes de
    -- esta migración) -- se revierte esa acreditación prematura y se
    -- registra como pendiente de liberar el 1 de octubre, con su order_id
    -- real para que quede trazable.
    SELECT o.id, p.amount_cents INTO v_pending_order_id, v_pending_amount_cents
    FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.account_id = v_account_id
      AND p.method = 'sistecredito'
      AND p.amount_cents = 50000000
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date = '2026-09-03'
      AND o.status != 'cancelled'
    LIMIT 1;

    IF v_pending_order_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.sistecredito_pending_releases WHERE order_id = v_pending_order_id) THEN
        UPDATE public.accounts SET balance_cents = balance_cents - v_pending_amount_cents WHERE id = v_account_id;

        INSERT INTO public.account_movements (
            account_id, type, amount_cents, description, reference_id, reference_type
        ) VALUES (
            v_account_id, 'manual_adjustment', -v_pending_amount_cents,
            'Migración inicial: corrección de venta SisteCrédito acreditada antes de tiempo (queda pendiente de liberar el 1 de octubre)',
            v_pending_order_id, 'order'
        );

        INSERT INTO public.sistecredito_pending_releases (
            account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
        ) VALUES (
            v_account_id, v_pending_order_id, v_pending_amount_cents, v_margin_pct, '2026-09-03',
            (date_trunc('month', DATE '2026-09-03') + interval '1 month')::date
        );
    END IF;
END $$;

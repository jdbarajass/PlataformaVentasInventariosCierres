-- =====================================================
-- YJBMOTOCOM — Migración 056: desembolso real de Addi (plan de 7 días)
-- =====================================================
-- Addi no consigna la venta el mismo día: YJBMOTOCOM tiene configurado el
-- plan de desembolso de 7 días (Addi también ofrece 30/60, es una
-- elección por comercio). Analizando 9 pagos reales del portal de
-- comercios de Addi (2026-06 a 2026-09), la regla observada es:
--   - Venta entre semana (lunes a viernes) -> paga EXACTAMENTE 7 días de
--     calendario después, el mismo día de la semana siguiente.
--   - Venta sábado o domingo -> paga 9 días de calendario después
--     (sábado -> cae lunes; domingo -> cae martes).
-- Los festivos colombianos NO corren la fecha de pago (se confirmó con un
-- caso real donde un festivo cae dentro de la ventana y el pago de todas
-- formas llegó en la fecha "normal" de +7/+9 días) — a diferencia de
-- Datáfono (00055), que sí depende del calendario de festivos. 8 de los 9
-- pagos reales coinciden exacto con esta regla; el único que no (un día
-- de más) no tiene ningún festivo que lo explique, así que se asume un
-- retraso puntual del banco, no una regla adicional.
--
-- Mismo patrón que 00053/00054 (SisteCrédito) y 00055 (Datáfono):
--   1. Crea `addi_pending_releases`: cada venta por Addi queda aquí (no
--      en el saldo real) hasta su fecha de liberación.
--   2. Cambia `create_pos_sale`/`edit_pos_sale`/`cancel_pos_sale` para que
--      un pago 'addi' NUNCA toque `accounts.balance_cents` directamente.
--   3. Agrega `release_addi_pending()`, que un cron corre a diario a las
--      4pm hora Bogotá (idempotente).
--
-- Solo aplica a ventas nuevas de aquí en adelante — sin backfill de datos
-- ya existentes, igual que 00055.
-- =====================================================

-- =====================================================
-- FUNCIÓN: next_addi_release_date — fecha de pago real de Addi
-- =====================================================
-- +7 días calendario entre semana, +9 si la venta fue sábado/domingo. No
-- usa `colombian_holidays` (a diferencia de next_business_day_co) porque
-- los festivos no afectan esta fecha, según los datos reales.
CREATE OR REPLACE FUNCTION public.next_addi_release_date(p_sale_date DATE)
RETURNS DATE AS $$
BEGIN
    RETURN p_sale_date + (
        CASE WHEN EXTRACT(ISODOW FROM p_sale_date) IN (6, 7) THEN 9 ELSE 7 END
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- TABLA: addi_pending_releases
-- =====================================================
CREATE TABLE IF NOT EXISTS public.addi_pending_releases (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    order_id      UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    sale_date     DATE        NOT NULL,
    release_date  DATE        NOT NULL,
    released_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addi_pending_account ON public.addi_pending_releases(account_id);
CREATE INDEX IF NOT EXISTS idx_addi_pending_release_date ON public.addi_pending_releases(release_date) WHERE released_at IS NULL;

ALTER TABLE public.addi_pending_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage addi pending releases"
ON public.addi_pending_releases FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "admin_readonly_can_view_addi_pending"
ON public.addi_pending_releases FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');

-- Nuevo tipo de movimiento para distinguir en el historial una liberación
-- automática de Addi de una venta o un ajuste manual cualquiera.
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_type_check;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_type_check
    CHECK (type IN (
        'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
        'operating_expense', 'expense_reversal', 'invoice_payment',
        'credit_payment', 'credit_payment_reversal', 'sale_reversal',
        'sistecredito_release', 'card_release', 'addi_release'
    ));

-- =====================================================
-- FUNCIÓN: create_pos_sale (agrega manejo de 'addi' junto a 'sistecredito'/'card')
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
    v_sale_date DATE;
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

        IF v_account_id IS NOT NULL AND v_payment->>'method' = 'sistecredito' THEN
            -- No se acredita el saldo real todavía -- SisteCrédito paga con
            -- corte de mes calendario, dos meses después (ver 00054).
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents, COALESCE(v_margin_pct, 0),
                v_sale_date,
                (date_trunc('month', v_sale_date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL AND v_payment->>'method' = 'card' THEN
            -- No se acredita el saldo real todavía -- el datáfono consigna
            -- el valor completo el siguiente día hábil (ver 00055).
            INSERT INTO public.card_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents,
                v_sale_date, public.next_business_day_co(v_sale_date)
            );
        ELSIF v_account_id IS NOT NULL AND v_payment->>'method' = 'addi' THEN
            -- No se acredita el saldo real todavía -- Addi paga con el
            -- plan de 7 días configurado (ver 00056).
            INSERT INTO public.addi_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents,
                v_sale_date, public.next_addi_release_date(v_sale_date)
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
-- FUNCIÓN: edit_pos_sale (agrega manejo de 'addi' junto a 'sistecredito'/'card')
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
    v_sale_date DATE;
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
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'card' THEN
            DELETE FROM public.card_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'addi' THEN
            DELETE FROM public.addi_pending_releases
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

    v_sale_date := (v_order.created_at AT TIME ZONE 'America/Bogota')::date;

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
                v_sale_date,
                (date_trunc('month', v_sale_date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL AND v_new_payment->>'method' = 'card' THEN
            INSERT INTO public.card_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, p_order_id, v_amount_cents,
                v_sale_date, public.next_business_day_co(v_sale_date)
            );
        ELSIF v_account_id IS NOT NULL AND v_new_payment->>'method' = 'addi' THEN
            INSERT INTO public.addi_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, p_order_id, v_amount_cents,
                v_sale_date, public.next_addi_release_date(v_sale_date)
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
-- FUNCIÓN: cancel_pos_sale (agrega manejo de 'addi' junto a 'sistecredito'/'card')
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
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'card' THEN
            DELETE FROM public.card_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'addi' THEN
            DELETE FROM public.addi_pending_releases
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
-- FUNCIÓN: release_addi_pending
-- =====================================================
-- Idempotente: solo toca filas vencidas (release_date <= hoy) y sin
-- liberar todavía. Corre desde un cron diario a las 4pm hora Bogotá (ver
-- vercel.json). Sin margen: se acredita el valor exacto de la venta.
CREATE OR REPLACE FUNCTION public.release_addi_pending()
RETURNS JSONB AS $$
DECLARE
    v_row RECORD;
    v_released_count INT := 0;
    v_released_total BIGINT := 0;
BEGIN
    FOR v_row IN
        SELECT * FROM public.addi_pending_releases
        WHERE released_at IS NULL AND release_date <= CURRENT_DATE
        ORDER BY sale_date
        FOR UPDATE
    LOOP
        UPDATE public.accounts SET balance_cents = balance_cents + v_row.amount_cents WHERE id = v_row.account_id;

        INSERT INTO public.account_movements (
            account_id, type, amount_cents, description, reference_id, reference_type
        ) VALUES (
            v_row.account_id, 'addi_release', v_row.amount_cents,
            'Desembolso Addi — venta del ' || to_char(v_row.sale_date, 'DD/MM/YYYY'),
            v_row.order_id, 'addi_release'
        );

        UPDATE public.addi_pending_releases SET released_at = NOW() WHERE id = v_row.id;

        v_released_count := v_released_count + 1;
        v_released_total := v_released_total + v_row.amount_cents;
    END LOOP;

    RETURN jsonb_build_object('released_count', v_released_count, 'released_total_cents', v_released_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

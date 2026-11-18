-- =====================================================
-- YJBMOTOCOM — Migración 062: los préstamos ya no mueven inventario;
-- cobrar un préstamo crea la venta
-- =====================================================
-- Decisión del usuario (2026-11-18), que reemplaza la de la 00059:
--
--   * Prestar NO toca el inventario: el producto sigue siendo nuestro hasta
--     que el otro local lo pague. Devolverlo tampoco lo toca.
--   * "Cobrar" un préstamo (Nos deben) crea una venta de mostrador real
--     (create_pos_sale): ahí sí baja el inventario y entra la plata a la
--     cuenta. Antes "Cobrado" era solo un estado y la venta se hacía aparte
--     en Registrar Venta, así que con la 00059 el inventario bajaba dos veces.
--   * Si esa venta se cancela, el préstamo vuelve a "Pendiente".
--   * Debemos (lo que nos prestan) tiene dos pasos:
--       1. "Lo vendí" (opcional): venta de mostrador como ítem manual, sin
--          tocar nuestro inventario (la unidad era del otro local).
--       2. Cerrar la deuda de una de tres formas:
--          - same_unit:    le devolvimos su misma unidad (solo si no se vendió).
--          - restock_unit: le devolvimos una igual que nos llegó de surtido;
--                          si ya está ingresada al inventario, baja 1.
--          - money:        le pagamos en plata. Sale de la cuenta como "Pago a
--                          proveedores" (invoice_payment, no es gasto) y, si
--                          se vendió, el costo de esa venta pasa a ser lo pagado.
--
-- Corrección de datos (genérica, idempotente): los préstamos que la 00059
-- descontó y siguen fuera (pendientes o cobrados) recuperan su unidad. Los
-- cobrados también se habían vendido por Registrar Venta (confirmado por el
-- usuario para los 2 casos de YJBMOTOCOM), así que se descontaron dos veces.
-- Luego stock_deducted queda en NULL en todos: la columna ya no se usa.
--
-- Orden: requiere la 00059 (en YBMOTOCOM correr 00059 y luego esta).
-- =====================================================

-- -----------------------------------------------------
-- 1. Columnas nuevas
-- -----------------------------------------------------
ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS sale_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS close_method TEXT CHECK (close_method IN ('same_unit', 'restock_unit', 'money')),
    ADD COLUMN IF NOT EXISTS paid_cents BIGINT CHECK (paid_cents IS NULL OR paid_cents > 0),
    ADD COLUMN IF NOT EXISTS paid_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_loans_sale_order ON public.loans(sale_order_id);
CREATE INDEX IF NOT EXISTS idx_loans_product ON public.loans(product_id);

-- -----------------------------------------------------
-- 2. Devolver al inventario lo que la 00059 dejó descontado
-- -----------------------------------------------------
DO $$
DECLARE
    v_loan RECORD;
BEGIN
    FOR v_loan IN
        SELECT * FROM public.loans
        WHERE stock_deducted > 0 AND status IN ('pending', 'charged')
        ORDER BY created_at
    LOOP
        IF v_loan.variant_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_loan.variant_id) THEN
            UPDATE public.product_variants
            SET stock_qty = stock_qty + v_loan.stock_deducted
            WHERE id = v_loan.variant_id;
        ELSIF v_loan.variant_id IS NULL AND v_loan.product_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.products WHERE id = v_loan.product_id) THEN
            UPDATE public.products
            SET stock_qty = stock_qty + v_loan.stock_deducted
            WHERE id = v_loan.product_id;
        ELSE
            CONTINUE; -- el producto ya no existe: nada que devolver
        END IF;

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type
        ) VALUES (
            v_loan.product_id, v_loan.variant_id, v_loan.stock_deducted, 'return',
            'Corrección: los préstamos ya no descuentan inventario (préstamo a ' || v_loan.warehouse || ')',
            v_loan.id, 'loan'
        );
    END LOOP;

    UPDATE public.loans SET stock_deducted = NULL WHERE stock_deducted IS NOT NULL;
END $$;

DROP FUNCTION IF EXISTS public.apply_loan_stock(public.loans, INT, TEXT, UUID);

-- -----------------------------------------------------
-- 3. Funciones de la 00059, ahora sin tocar inventario
-- -----------------------------------------------------
-- create_lent_loan se deja (sin stock) para que el código anterior siga
-- funcionando durante los minutos entre correr esta migración y desplegar.
CREATE OR REPLACE FUNCTION public.create_lent_loan(p_loan JSONB, p_actor UUID DEFAULT NULL)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
BEGIN
    INSERT INTO public.loans (
        product_id, variant_id, product_title, warehouse, observations, direction, created_at
    ) VALUES (
        NULLIF(p_loan->>'product_id', '')::UUID, NULLIF(p_loan->>'variant_id', '')::UUID,
        p_loan->>'product_title', p_loan->>'warehouse',
        NULLIF(p_loan->>'observations', ''), 'lent',
        COALESCE(NULLIF(p_loan->>'created_at', '')::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_loan;
    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Cambio manual de estado: solo Pendiente <-> Devuelto. "Cobrado"/"Pagado"
-- se alcanzan únicamente con charge_lent_loan / close_borrowed_loan, que
-- dejan la venta o el pago registrados.
CREATE OR REPLACE FUNCTION public.set_loan_status(
    p_loan_id UUID,
    p_status TEXT,
    p_actor UUID DEFAULT NULL
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;

    IF p_status NOT IN ('pending', 'returned') THEN
        RAISE EXCEPTION 'Para cobrar o pagar usa el botón Cobrar / Cerrar deuda';
    END IF;

    IF v_loan.status = p_status THEN
        RETURN v_loan;
    END IF;

    IF v_loan.sale_order_id IS NOT NULL AND v_loan.direction = 'lent' THEN
        RAISE EXCEPTION 'Este préstamo ya tiene una venta: para reabrirlo cancela la venta en Ventas del Día';
    END IF;

    IF v_loan.close_method IN ('money', 'restock_unit') THEN
        RAISE EXCEPTION 'Esta deuda ya se cerró con un pago o con mercancía: no se puede reabrir';
    END IF;

    IF p_status = 'returned' AND v_loan.direction = 'borrowed' AND v_loan.sale_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Ese producto ya se vendió: cierra la deuda pagando o devolviendo una unidad igual';
    END IF;

    UPDATE public.loans
    SET status = p_status,
        close_method = CASE WHEN p_status = 'returned' AND direction = 'borrowed' THEN 'same_unit' ELSE NULL END,
        closed_at = CASE WHEN p_status = 'returned' THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_loan_id
    RETURNING * INTO v_loan;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Borrar es solo quitar el registro. No se borra uno que ya dejó una venta,
-- un pago o una salida de inventario (perdería el rastro de esa plata).
CREATE OR REPLACE FUNCTION public.delete_loan(p_loan_id UUID, p_actor UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_loan public.loans;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_loan.sale_order_id IS NOT NULL OR v_loan.close_method IN ('money', 'restock_unit') THEN
        RAISE EXCEPTION 'Este préstamo tiene una venta o un pago registrado: no se puede eliminar';
    END IF;

    DELETE FROM public.loans WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- 4. charge_lent_loan: cobrar un préstamo = venta de mostrador
-- -----------------------------------------------------
-- p_order / p_items / p_payments llegan ya resueltos por la API
-- (resolveSale: costo real del producto, comisiones, suma exacta de pagos).
-- p_force = true: la unidad ya salió físicamente; si el sistema la tiene en
-- 0, la venta entra igual y el stock nunca queda negativo.
CREATE OR REPLACE FUNCTION public.charge_lent_loan(
    p_loan_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_order public.orders;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;
    IF v_loan.direction <> 'lent' THEN
        RAISE EXCEPTION 'Solo se cobran los préstamos que hicimos (Nos deben)';
    END IF;
    IF v_loan.status <> 'pending' THEN
        RAISE EXCEPTION 'Este préstamo ya no está pendiente';
    END IF;

    v_order := public.create_pos_sale(p_order, p_items, p_payments, TRUE, p_created_at);

    UPDATE public.loans
    SET status = 'charged', sale_order_id = v_order.id, closed_at = v_order.created_at, updated_at = NOW()
    WHERE id = p_loan_id
    RETURNING * INTO v_loan;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- 5. sell_borrowed_loan: vendimos lo que nos prestaron
-- -----------------------------------------------------
-- Solo ítems manuales: la unidad es del otro local y no debe tocar nuestro
-- inventario aunque tengamos ese mismo producto en el catálogo.
CREATE OR REPLACE FUNCTION public.sell_borrowed_loan(
    p_loan_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_order public.orders;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;
    IF v_loan.direction <> 'borrowed' THEN
        RAISE EXCEPTION 'Solo se venden así los productos que nos prestaron (Debemos)';
    END IF;
    IF v_loan.status <> 'pending' THEN
        RAISE EXCEPTION 'Esta deuda ya está cerrada';
    END IF;
    IF v_loan.sale_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Este producto ya se vendió';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) i
        WHERE NULLIF(i->>'product_id', '') IS NOT NULL OR NULLIF(i->>'variant_id', '') IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'La venta de un producto prestado no debe tocar nuestro inventario';
    END IF;

    v_order := public.create_pos_sale(p_order, p_items, p_payments, FALSE, p_created_at);

    UPDATE public.loans
    SET sale_order_id = v_order.id, updated_at = NOW()
    WHERE id = p_loan_id
    RETURNING * INTO v_loan;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- 6. close_borrowed_loan: cerrar lo que debemos
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_borrowed_loan(
    p_loan_id UUID,
    p_method TEXT,
    p_product_id UUID DEFAULT NULL,
    p_variant_id UUID DEFAULT NULL,
    p_amount_cents BIGINT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_actor UUID DEFAULT NULL
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_when TIMESTAMPTZ := COALESCE(p_date, NOW());
    v_current INT;
    v_applied INT;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;
    IF v_loan.direction <> 'borrowed' THEN
        RAISE EXCEPTION 'Solo se cierran así las deudas (Debemos)';
    END IF;
    IF v_loan.status <> 'pending' THEN
        RAISE EXCEPTION 'Esta deuda ya está cerrada';
    END IF;

    IF p_method = 'same_unit' THEN
        IF v_loan.sale_order_id IS NOT NULL THEN
            RAISE EXCEPTION 'Ese producto ya se vendió: no se puede devolver la misma unidad';
        END IF;

        UPDATE public.loans
        SET status = 'returned', close_method = 'same_unit', closed_at = v_when, updated_at = NOW()
        WHERE id = p_loan_id
        RETURNING * INTO v_loan;

    ELSIF p_method = 'restock_unit' THEN
        IF p_variant_id IS NOT NULL THEN
            SELECT product_id INTO p_product_id FROM public.product_variants WHERE id = p_variant_id;
            IF p_product_id IS NULL THEN
                RAISE EXCEPTION 'Talla no encontrada';
            END IF;
        END IF;

        IF p_product_id IS NOT NULL THEN
            -- Mismo cuidado que en las ventas: si el producto tiene tallas, el
            -- descuento va a la talla (si no, el trigger de sincronización lo
            -- borraría).
            IF p_variant_id IS NULL AND EXISTS (
                SELECT 1 FROM public.product_variants WHERE product_id = p_product_id AND active = true
            ) THEN
                RAISE EXCEPTION 'Elige la talla del producto que devolviste';
            END IF;

            IF p_variant_id IS NOT NULL THEN
                SELECT stock_qty INTO v_current FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
            ELSE
                SELECT stock_qty INTO v_current FROM public.products WHERE id = p_product_id FOR UPDATE;
            END IF;
            IF v_current IS NULL THEN
                RAISE EXCEPTION 'Producto no encontrado';
            END IF;

            v_applied := LEAST(1, v_current); -- nunca deja stock negativo

            IF v_applied > 0 THEN
                IF p_variant_id IS NOT NULL THEN
                    UPDATE public.product_variants SET stock_qty = stock_qty - v_applied WHERE id = p_variant_id;
                ELSE
                    UPDATE public.products SET stock_qty = stock_qty - v_applied WHERE id = p_product_id;
                END IF;

                INSERT INTO public.inventory_movements (
                    product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
                ) VALUES (
                    p_product_id, p_variant_id, -v_applied, 'out',
                    'Devuelto a ' || v_loan.warehouse || ' (pago de un préstamo que nos hicieron)',
                    v_loan.id, 'loan', p_actor
                );
            END IF;
        END IF;

        UPDATE public.loans
        SET status = 'returned', close_method = 'restock_unit', closed_at = v_when, updated_at = NOW()
        WHERE id = p_loan_id
        RETURNING * INTO v_loan;

    ELSIF p_method = 'money' THEN
        IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
            RAISE EXCEPTION 'Escribe cuánto le pagaste al otro local';
        END IF;

        IF p_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by, created_at
            ) VALUES (
                p_account_id, 'invoice_payment', -p_amount_cents,
                'Pago a ' || v_loan.warehouse || ' por préstamo: ' || v_loan.product_title,
                v_loan.id, 'loan', p_actor, v_when
            );
        END IF;

        -- El costo real de lo vendido es lo que le pagamos al otro local.
        IF v_loan.sale_order_id IS NOT NULL THEN
            UPDATE public.order_items
            SET cost_cents = ROUND(p_amount_cents::NUMERIC / GREATEST(qty, 1))::INT
            WHERE order_id = v_loan.sale_order_id AND product_id IS NULL;
        END IF;

        UPDATE public.loans
        SET status = 'charged', close_method = 'money', paid_cents = p_amount_cents,
            paid_account_id = p_account_id, closed_at = v_when, updated_at = NOW()
        WHERE id = p_loan_id
        RETURNING * INTO v_loan;

    ELSE
        RAISE EXCEPTION 'Forma de cierre no válida';
    END IF;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------
-- 7. Cancelar la venta deshace el cobro
-- -----------------------------------------------------
-- Nos deben: el préstamo vuelve a Pendiente. Debemos: solo se quita el
-- enlace a la venta (la deuda sigue como esté).
CREATE OR REPLACE FUNCTION public.reopen_loans_on_sale_cancel()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.loans
    SET status = 'pending', sale_order_id = NULL, closed_at = NULL, updated_at = NOW()
    WHERE sale_order_id = NEW.id AND direction = 'lent';

    UPDATE public.loans
    SET sale_order_id = NULL, updated_at = NOW()
    WHERE sale_order_id = NEW.id AND direction = 'borrowed';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_reopen_loans_on_sale_cancel ON public.orders;
CREATE TRIGGER trg_reopen_loans_on_sale_cancel
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
    EXECUTE FUNCTION public.reopen_loans_on_sale_cancel();

-- -----------------------------------------------------
-- 8. Permisos (solo el servidor, como las de la 00059)
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public.charge_lent_loan(UUID, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sell_borrowed_loan(UUID, JSONB, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_borrowed_loan(UUID, TEXT, UUID, UUID, BIGINT, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_loans_on_sale_cancel() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_lent_loan(UUID, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.sell_borrowed_loan(UUID, JSONB, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_borrowed_loan(UUID, TEXT, UUID, UUID, BIGINT, UUID, TIMESTAMPTZ, UUID) TO service_role;

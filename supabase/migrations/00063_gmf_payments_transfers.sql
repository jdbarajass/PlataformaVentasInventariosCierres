-- =====================================================
-- YJBMOTOCOM — Migración 063: 4x1000 en abonos a facturas, transferencias
-- y pagos de préstamos; fecha del abono
-- =====================================================
-- Pedido del usuario (2026-11-21). La 00061 cobra el 4x1000 solo en los
-- gastos operativos, pero también sale plata de las cuentas por:
--   * abonos a facturas de proveedor (Facturas → Abonar),
--   * transferencias entre cuentas (Cuentas → Transferir),
--   * "Cerrar deuda" en plata (Préstamos → Debemos).
-- Si la cuenta no es efectivo, ahora las tres cobran el 4x1000 igual que los
-- gastos: el valor se descuenta como siempre y el 4x1000 sale aparte, como
-- gasto en "Gastos bancarios". Así Utilidad, Flujo de caja, Presupuesto y
-- Año lo cuentan como gasto financiero sin cambiar esas pantallas.
--
--   * operating_expenses.gmf_source / gmf_source_id: de dónde viene un 4x1000
--     automático ('supplier_payment' = abono, 'transfer' = transferencia,
--     'loan' = préstamo) y el id de ese registro. Esos gastos no se editan a
--     mano. Si se borran, la plata vuelve a la cuenta.
--   * supplier_invoice_payments.gmf_cents y loans.paid_gmf_cents: el 4x1000
--     cobrado (informativo, el cobro real es el gasto).
--   * Fecha del abono (p_paid_at): antes la ponía la base con CURRENT_DATE,
--     que va en UTC (después de las 7 p.m. quedaba con la fecha de mañana).
--     Ahora llega desde la pantalla (hoy en Colombia, editable) y no puede ser
--     futura. Si no es hoy, el movimiento de la cuenta queda con esa fecha (a
--     mediodía), para que el flujo de caja lo ubique en su mes.
--
-- Los abonos, transferencias y pagos anteriores quedan igual (sin 4x1000,
-- decisión del usuario). Las funciones cambian de firma (parámetros nuevos
-- con valor por defecto), por eso se borra la versión anterior antes.
--
-- ⚠️ Correrla en el SQL Editor ANTES de subir el código: sin ella, abonar,
-- transferir, cerrar deudas en plata y ver Finanzas → Gastos fallan.
-- =====================================================

-- -----------------------------------------------------
-- 1. Columnas nuevas
-- -----------------------------------------------------
ALTER TABLE public.operating_expenses
    ADD COLUMN IF NOT EXISTS gmf_source TEXT CHECK (gmf_source IN ('supplier_payment', 'transfer', 'loan')),
    ADD COLUMN IF NOT EXISTS gmf_source_id UUID;

CREATE INDEX IF NOT EXISTS idx_operating_expenses_gmf_source ON public.operating_expenses(gmf_source, gmf_source_id);

ALTER TABLE public.supplier_invoice_payments
    ADD COLUMN IF NOT EXISTS gmf_cents BIGINT NOT NULL DEFAULT 0 CHECK (gmf_cents >= 0);

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS paid_gmf_cents BIGINT NOT NULL DEFAULT 0 CHECK (paid_gmf_cents >= 0);

-- -----------------------------------------------------
-- 2. charge_account_gmf: cobra el 4x1000 de una salida de plata
-- -----------------------------------------------------
-- Uso interno de las funciones de abajo (no se llama desde la API).
-- Si la cuenta no es efectivo, registra el 4x1000 como gasto en
-- "Gastos bancarios", lo descuenta de la cuenta y deja su movimiento.
-- Devuelve lo cobrado (0 si no aplica). Misma fórmula que la 00061 y que
-- lib/finance/gmf.ts: 4 por mil, redondeado al peso.
CREATE OR REPLACE FUNCTION public.charge_account_gmf(
    p_account_id UUID,
    p_base_cents BIGINT,
    p_date DATE,
    p_when TIMESTAMPTZ,
    p_description TEXT,
    p_source TEXT,
    p_source_id UUID,
    p_created_by UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    v_method TEXT;
    v_gmf BIGINT;
    v_expense public.operating_expenses;
BEGIN
    IF p_account_id IS NULL OR p_base_cents IS NULL OR p_base_cents <= 0 THEN
        RETURN 0;
    END IF;

    SELECT payment_method INTO v_method FROM public.accounts WHERE id = p_account_id;
    IF v_method IS NULL OR v_method = 'cash' THEN
        RETURN 0;
    END IF;

    v_gmf := ROUND(p_base_cents * 4 / 1000.0 / 100) * 100;
    IF v_gmf <= 0 THEN
        RETURN 0;
    END IF;

    INSERT INTO public.operating_expenses (date, description, amount_cents, category, account_id, created_by, gmf_source, gmf_source_id)
    VALUES (p_date, p_description, v_gmf, 'Gastos bancarios', p_account_id, p_created_by, p_source, p_source_id)
    RETURNING * INTO v_expense;

    UPDATE public.accounts SET balance_cents = balance_cents - v_gmf WHERE id = p_account_id;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by, created_at)
    VALUES (p_account_id, 'operating_expense', -v_gmf, p_description, v_expense.id, 'operating_expense', p_created_by, COALESCE(p_when, NOW()));

    RETURN v_gmf;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.charge_account_gmf(UUID, BIGINT, DATE, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------
-- 3. pay_supplier_invoice: fecha del abono y 4x1000
-- -----------------------------------------------------
DROP FUNCTION IF EXISTS public.pay_supplier_invoice(UUID, BIGINT, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.pay_supplier_invoice(
    p_invoice_id UUID,
    p_amount_cents BIGINT,
    p_account_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_paid_at DATE DEFAULT NULL,
    p_apply_gmf BOOLEAN DEFAULT false
)
RETURNS public.supplier_invoices AS $$
DECLARE
    v_invoice public.supplier_invoices;
    v_payment public.supplier_invoice_payments;
    v_paid_so_far BIGINT;
    v_today DATE := (NOW() AT TIME ZONE 'America/Bogota')::DATE;
    v_date DATE := COALESCE(p_paid_at, (NOW() AT TIME ZONE 'America/Bogota')::DATE);
    v_when TIMESTAMPTZ;
    v_gmf BIGINT := 0;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del abono debe ser mayor a 0';
    END IF;

    IF v_date > v_today THEN
        RAISE EXCEPTION 'La fecha del abono no puede ser futura';
    END IF;

    -- Hoy: la hora real. Otro día: ese día a mediodía (hora Colombia).
    v_when := CASE WHEN v_date = v_today THEN NOW() ELSE (v_date + TIME '12:00') AT TIME ZONE 'America/Bogota' END;

    SELECT * INTO v_invoice FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF v_invoice IS NULL THEN
        RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
    END IF;

    INSERT INTO public.supplier_invoice_payments (invoice_id, amount_cents, account_id, notes, paid_at)
    VALUES (p_invoice_id, p_amount_cents, p_account_id, p_notes, v_date)
    RETURNING * INTO v_payment;

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by, created_at)
        VALUES (
            p_account_id, 'invoice_payment', -p_amount_cents,
            COALESCE(p_notes, 'Abono a factura: ' || v_invoice.description),
            p_invoice_id, 'supplier_invoice', p_created_by, v_when
        );

        IF p_apply_gmf THEN
            v_gmf := public.charge_account_gmf(
                p_account_id, p_amount_cents, v_date, v_when,
                '4x1000: Abono a factura: ' || v_invoice.description,
                'supplier_payment', v_payment.id, p_created_by
            );
            IF v_gmf > 0 THEN
                UPDATE public.supplier_invoice_payments SET gmf_cents = v_gmf WHERE id = v_payment.id;
            END IF;
        END IF;
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid_so_far
    FROM public.supplier_invoice_payments
    WHERE invoice_id = p_invoice_id;

    UPDATE public.supplier_invoices
    SET status = CASE WHEN v_paid_so_far >= v_invoice.amount_cents THEN 'paid' ELSE 'pending' END,
        paid_at = CASE WHEN v_paid_so_far >= v_invoice.amount_cents THEN v_date ELSE paid_at END,
        account_id = COALESCE(p_account_id, account_id),
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_invoice;

    RETURN v_invoice;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.pay_supplier_invoice(UUID, BIGINT, UUID, TEXT, UUID, DATE, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_supplier_invoice(UUID, BIGINT, UUID, TEXT, UUID, DATE, BOOLEAN) TO service_role;

-- -----------------------------------------------------
-- 4. delete_supplier_invoice: también devuelve el 4x1000 de sus abonos
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_supplier_invoice(p_invoice_id UUID)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
    v_gmf public.operating_expenses;
    v_description TEXT;
BEGIN
    SELECT description INTO v_description FROM public.supplier_invoices WHERE id = p_invoice_id;
    IF v_description IS NULL THEN
        RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
    END IF;

    FOR v_payment IN SELECT * FROM public.supplier_invoice_payments WHERE invoice_id = p_invoice_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (
                v_payment.account_id, 'expense_reversal', v_payment.amount_cents,
                'Reversa por eliminación de factura: ' || v_description,
                p_invoice_id, 'supplier_invoice'
            );
        END IF;

        -- El 4x1000 de ese abono (si se cobró): devolverlo y borrar el gasto.
        FOR v_gmf IN SELECT * FROM public.operating_expenses WHERE gmf_source = 'supplier_payment' AND gmf_source_id = v_payment.id
        LOOP
            IF v_gmf.account_id IS NOT NULL THEN
                UPDATE public.accounts SET balance_cents = balance_cents + v_gmf.amount_cents WHERE id = v_gmf.account_id;

                INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
                VALUES (
                    v_gmf.account_id, 'expense_reversal', v_gmf.amount_cents,
                    'Reversa por eliminación de factura: ' || v_gmf.description,
                    v_gmf.id, 'operating_expense'
                );
            END IF;
            DELETE FROM public.operating_expenses WHERE id = v_gmf.id;
        END LOOP;
    END LOOP;

    -- ON DELETE CASCADE en supplier_invoice_items/payments limpia el resto.
    DELETE FROM public.supplier_invoices WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_supplier_invoice(UUID) TO service_role;

-- -----------------------------------------------------
-- 5. delete_operating_expense: si se borra un 4x1000 automático, su abono o
--    préstamo deja de tenerlo (el resto igual que en la 00061)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_operating_expense(p_expense_id UUID)
RETURNS void AS $$
DECLARE
    v_expense public.operating_expenses;
    v_child public.operating_expenses;
BEGIN
    SELECT * INTO v_expense FROM public.operating_expenses WHERE id = p_expense_id;
    IF v_expense IS NULL THEN
        RAISE EXCEPTION 'Gasto % no encontrado', p_expense_id;
    END IF;

    -- Primero el 4x1000 hijo (si tiene): devolver su plata y borrarlo.
    FOR v_child IN SELECT * FROM public.operating_expenses WHERE parent_expense_id = p_expense_id LOOP
        IF v_child.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_child.amount_cents WHERE id = v_child.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_child.account_id, 'expense_reversal', v_child.amount_cents, 'Reversa por eliminación de gasto: ' || v_child.description, v_child.id, 'operating_expense');
        END IF;
        DELETE FROM public.operating_expenses WHERE id = v_child.id;
    END LOOP;

    IF v_expense.account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents + v_expense.amount_cents WHERE id = v_expense.account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
        VALUES (v_expense.account_id, 'expense_reversal', v_expense.amount_cents, 'Reversa por eliminación de gasto: ' || v_expense.description, p_expense_id, 'operating_expense');
    END IF;

    -- Si se borra directamente un 4x1000 hijo, el gasto original deja de tenerlo.
    IF v_expense.parent_expense_id IS NOT NULL THEN
        UPDATE public.operating_expenses SET gmf_cents = 0 WHERE id = v_expense.parent_expense_id;
    END IF;

    -- Lo mismo con el 4x1000 de un abono o de un préstamo.
    IF v_expense.gmf_source = 'supplier_payment' THEN
        UPDATE public.supplier_invoice_payments SET gmf_cents = 0 WHERE id = v_expense.gmf_source_id;
    ELSIF v_expense.gmf_source = 'loan' THEN
        UPDATE public.loans SET paid_gmf_cents = 0 WHERE id = v_expense.gmf_source_id;
    END IF;

    DELETE FROM public.operating_expenses WHERE id = p_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_operating_expense(UUID) TO service_role;

-- -----------------------------------------------------
-- 6. transfer_between_accounts: 4x1000 en la cuenta de origen
-- -----------------------------------------------------
-- La cuenta destino recibe el valor completo. A la de origen se le descuenta
-- el valor + el 4x1000, y el saldo tiene que alcanzar para los dos.
DROP FUNCTION IF EXISTS public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_cents BIGINT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL,
    p_apply_gmf BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_reference_id UUID := gen_random_uuid();
    v_from_balance BIGINT;
    v_from_method TEXT;
    v_to_name TEXT;
    v_gmf BIGINT := 0;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y la cuenta destino no pueden ser la misma';
    END IF;

    SELECT balance_cents, payment_method INTO v_from_balance, v_from_method
    FROM public.accounts
    WHERE id = p_from_account_id
    FOR UPDATE;

    IF v_from_balance IS NULL THEN
        RAISE EXCEPTION 'Cuenta origen % no encontrada', p_from_account_id;
    END IF;

    SELECT name INTO v_to_name FROM public.accounts WHERE id = p_to_account_id;
    IF v_to_name IS NULL THEN
        RAISE EXCEPTION 'Cuenta destino % no encontrada', p_to_account_id;
    END IF;

    IF p_apply_gmf AND v_from_method IS NOT NULL AND v_from_method <> 'cash' THEN
        v_gmf := ROUND(p_amount_cents * 4 / 1000.0 / 100) * 100;
    END IF;

    IF v_from_balance < p_amount_cents + v_gmf THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta origen';
    END IF;

    UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_from_account_id;
    UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_to_account_id;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_from_account_id, 'transfer_out', -p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_to_account_id, 'transfer_in', p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    IF v_gmf > 0 THEN
        PERFORM public.charge_account_gmf(
            p_from_account_id, p_amount_cents, (NOW() AT TIME ZONE 'America/Bogota')::DATE, NOW(),
            '4x1000: Transferencia a ' || v_to_name,
            'transfer', v_reference_id, p_created_by
        );
    END IF;

    RETURN v_reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID, BOOLEAN) TO service_role;

-- -----------------------------------------------------
-- 7. close_borrowed_loan: 4x1000 al pagar la deuda en plata
-- -----------------------------------------------------
-- Igual que en la 00062. Lo único nuevo es p_apply_gmf y el bloque del
-- 4x1000 en la forma 'money'. El costo de la venta sigue siendo lo pagado al
-- otro local: el 4x1000 es gasto financiero, no costo de mercancía.
DROP FUNCTION IF EXISTS public.close_borrowed_loan(UUID, TEXT, UUID, UUID, BIGINT, UUID, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION public.close_borrowed_loan(
    p_loan_id UUID,
    p_method TEXT,
    p_product_id UUID DEFAULT NULL,
    p_variant_id UUID DEFAULT NULL,
    p_amount_cents BIGINT DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_actor UUID DEFAULT NULL,
    p_apply_gmf BOOLEAN DEFAULT false
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_when TIMESTAMPTZ := COALESCE(p_date, NOW());
    v_current INT;
    v_applied INT;
    v_gmf BIGINT := 0;
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

            IF p_apply_gmf THEN
                v_gmf := public.charge_account_gmf(
                    p_account_id, p_amount_cents, (v_when AT TIME ZONE 'America/Bogota')::DATE, v_when,
                    '4x1000: Pago a ' || v_loan.warehouse || ' por préstamo: ' || v_loan.product_title,
                    'loan', v_loan.id, p_actor
                );
            END IF;
        END IF;

        -- El costo real de lo vendido es lo que le pagamos al otro local.
        IF v_loan.sale_order_id IS NOT NULL THEN
            UPDATE public.order_items
            SET cost_cents = ROUND(p_amount_cents::NUMERIC / GREATEST(qty, 1))::INT
            WHERE order_id = v_loan.sale_order_id AND product_id IS NULL;
        END IF;

        UPDATE public.loans
        SET status = 'charged', close_method = 'money', paid_cents = p_amount_cents,
            paid_account_id = p_account_id, paid_gmf_cents = v_gmf, closed_at = v_when, updated_at = NOW()
        WHERE id = p_loan_id
        RETURNING * INTO v_loan;

    ELSE
        RAISE EXCEPTION 'Forma de cierre no válida';
    END IF;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


REVOKE ALL ON FUNCTION public.close_borrowed_loan(UUID, TEXT, UUID, UUID, BIGINT, UUID, TIMESTAMPTZ, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_borrowed_loan(UUID, TEXT, UUID, UUID, BIGINT, UUID, TIMESTAMPTZ, UUID, BOOLEAN) TO service_role;

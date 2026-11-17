-- =====================================================
-- YJBMOTOCOM — Migración 061: 4x1000 y observaciones en gastos operativos
-- =====================================================
-- Pedido del usuario (2026-11-17), igual que en KOAJ: cuando un gasto sale
-- de una cuenta que NO es efectivo (QR, Nequi, NU, Daviplata, datáfono,
-- bancos...), el banco cobra además el 4x1000. Hasta ahora el gasto solo
-- descontaba el valor digitado y el 4x1000 nunca salía de la cuenta.
--
-- Cómo queda:
--   * El gasto guarda el valor digitado (subtotal) en amount_cents, como
--     siempre, y el 4x1000 cobrado en gmf_cents (solo informativo).
--   * El 4x1000 se registra como un gasto aparte, hijo del original
--     (parent_expense_id), en la categoría "Gastos bancarios". Así todas las
--     pantallas de finanzas lo cuentan como gasto financiero sin tocarlas
--     (utilidad, flujo de caja, presupuesto, año) y la cuenta muestra los dos
--     movimientos por separado.
--   * La cuenta se descuenta por el total: subtotal + 4x1000.
--   * Efectivo o "sin cuenta": no hay 4x1000.
--   * notes: observaciones libres del gasto.
--
-- Aditiva: los gastos anteriores quedan igual (gmf_cents = 0, sin hijo).
-- record_operating_expense cambia de firma (2 parámetros nuevos con valor
-- por defecto), por eso se borra la versión anterior antes de crearla.
-- =====================================================

ALTER TABLE public.operating_expenses
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS gmf_cents BIGINT NOT NULL DEFAULT 0 CHECK (gmf_cents >= 0),
    ADD COLUMN IF NOT EXISTS parent_expense_id UUID REFERENCES public.operating_expenses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_operating_expenses_parent ON public.operating_expenses(parent_expense_id);

-- =====================================================
-- FUNCIÓN: record_operating_expense (con 4x1000 y observaciones)
-- =====================================================
DROP FUNCTION IF EXISTS public.record_operating_expense(DATE, TEXT, BIGINT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.record_operating_expense(
    p_date DATE,
    p_description TEXT,
    p_amount_cents BIGINT,
    p_category TEXT,
    p_account_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_apply_gmf BOOLEAN DEFAULT false
)
RETURNS public.operating_expenses AS $$
DECLARE
    v_expense public.operating_expenses;
    v_child public.operating_expenses;
    v_method TEXT;
    v_gmf BIGINT := 0;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del gasto debe ser mayor a 0';
    END IF;

    INSERT INTO public.operating_expenses (date, description, amount_cents, category, account_id, created_by, notes)
    VALUES (COALESCE(p_date, CURRENT_DATE), p_description, p_amount_cents, p_category, p_account_id, p_created_by, NULLIF(BTRIM(p_notes), ''))
    RETURNING * INTO v_expense;

    IF p_account_id IS NOT NULL THEN
        SELECT payment_method INTO v_method FROM public.accounts WHERE id = p_account_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (p_account_id, 'operating_expense', -p_amount_cents, p_description, v_expense.id, 'operating_expense', p_created_by);

        -- 4x1000 sobre lo que no es efectivo, redondeado al peso
        -- (misma fórmula que lib/finance/gmf.ts).
        IF p_apply_gmf AND v_method <> 'cash' THEN
            v_gmf := ROUND(p_amount_cents * 4 / 1000.0 / 100) * 100;
        END IF;

        IF v_gmf > 0 THEN
            INSERT INTO public.operating_expenses (date, description, amount_cents, category, account_id, created_by, parent_expense_id)
            VALUES (v_expense.date, '4x1000: ' || p_description, v_gmf, 'Gastos bancarios', p_account_id, p_created_by, v_expense.id)
            RETURNING * INTO v_child;

            UPDATE public.accounts SET balance_cents = balance_cents - v_gmf WHERE id = p_account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
            VALUES (p_account_id, 'operating_expense', -v_gmf, v_child.description, v_child.id, 'operating_expense', p_created_by);

            UPDATE public.operating_expenses SET gmf_cents = v_gmf WHERE id = v_expense.id
            RETURNING * INTO v_expense;
        END IF;
    END IF;

    RETURN v_expense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_operating_expense(DATE, TEXT, BIGINT, TEXT, UUID, UUID, TEXT, BOOLEAN) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_operating_expense (también revierte su 4x1000)
-- =====================================================
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

    DELETE FROM public.operating_expenses WHERE id = p_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_operating_expense(UUID) TO service_role;

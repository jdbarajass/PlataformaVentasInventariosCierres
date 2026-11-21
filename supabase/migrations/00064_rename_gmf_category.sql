-- =====================================================
-- YJBMOTOCOM — Migración 064: la categoría "Gastos bancarios" pasa a llamarse
-- "4X1000 impuestos (Gastos Bancarios)"
-- =====================================================
-- Pedido del usuario (2026-11-21): que la categoría del 4x1000 se vea como
-- impuesto. No es una categoría nueva: es la misma, renombrada. Sigue siendo
-- gasto financiero (lib/finance/expense-classes.ts).
--
--   * Cambia el nombre en los gastos y presupuestos ya guardados.
--   * record_operating_expense (00061) y charge_account_gmf (00063) guardan
--     el 4x1000 automático con el nombre nuevo. Sus cuerpos son los mismos,
--     solo cambia el texto de la categoría (misma firma, conserva permisos).
--
-- No mueve plata ni saldos: solo la etiqueta. Idempotente.
-- Correrla en el SQL Editor y subir el código enseguida.
-- =====================================================

-- 1. Gastos ya guardados
UPDATE public.operating_expenses
SET category = '4X1000 impuestos (Gastos Bancarios)'
WHERE category = 'Gastos bancarios';

-- 2. Presupuestos (UNIQUE year, month, category): si ya existe uno con el
--    nombre nuevo en ese mes, se suman y se borra el viejo; si no, se renombra.
UPDATE public.monthly_budgets n
SET budgeted_amount_cents = n.budgeted_amount_cents + o.budgeted_amount_cents
FROM public.monthly_budgets o
WHERE n.category = '4X1000 impuestos (Gastos Bancarios)' AND o.category = 'Gastos bancarios'
  AND n.year = o.year AND n.month = o.month;

DELETE FROM public.monthly_budgets o
WHERE o.category = 'Gastos bancarios'
  AND EXISTS (SELECT 1 FROM public.monthly_budgets n WHERE n.category = '4X1000 impuestos (Gastos Bancarios)' AND n.year = o.year AND n.month = o.month);

UPDATE public.monthly_budgets
SET category = '4X1000 impuestos (Gastos Bancarios)'
WHERE category = 'Gastos bancarios';

-- 3. El 4x1000 de los gastos (igual que en la 00061, con el nombre nuevo)
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
            VALUES (v_expense.date, '4x1000: ' || p_description, v_gmf, '4X1000 impuestos (Gastos Bancarios)', p_account_id, p_created_by, v_expense.id)
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

-- 4. El 4x1000 de abonos, transferencias y préstamos (igual que en la 00063, con el nombre nuevo)
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
    VALUES (p_date, p_description, v_gmf, '4X1000 impuestos (Gastos Bancarios)', p_account_id, p_created_by, p_source, p_source_id)
    RETURNING * INTO v_expense;

    UPDATE public.accounts SET balance_cents = balance_cents - v_gmf WHERE id = p_account_id;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by, created_at)
    VALUES (p_account_id, 'operating_expense', -v_gmf, p_description, v_expense.id, 'operating_expense', p_created_by, COALESCE(p_when, NOW()));

    RETURN v_gmf;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

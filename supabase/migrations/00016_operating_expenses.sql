-- =====================================================
-- YJBMOTOCOM — Migración 016: Gastos operativos
-- =====================================================
-- Tabla faltante detectada al construir Presupuesto Mensual: el
-- comparativo "presupuesto vs. gasto real por categoría" del software
-- local necesita un registro de gastos con categoría propia — el
-- software local lo llama "gastos_dia". La migración 00009 no la incluyó
-- (fue un vacío en el plan original de la sub-fase 3.1). Se agrega aquí,
-- de forma aditiva, sin tocar nada de lo ya aplicado.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.operating_expenses (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    description   TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    category      TEXT        NOT NULL,
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_date     ON public.operating_expenses(date);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_category ON public.operating_expenses(category);

CREATE TRIGGER update_operating_expenses_updated_at
    BEFORE UPDATE ON public.operating_expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage operating expenses" ON public.operating_expenses;
CREATE POLICY "Admins and sellers can manage operating expenses"
ON public.operating_expenses FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- FUNCIÓN: record_operating_expense
-- =====================================================
-- Inserta el gasto y, si se indica una cuenta, la debita (mismo patrón
-- SECURITY DEFINER que el resto de funciones de dinero).
CREATE OR REPLACE FUNCTION public.record_operating_expense(
    p_date DATE,
    p_description TEXT,
    p_amount_cents BIGINT,
    p_category TEXT,
    p_account_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.operating_expenses AS $$
DECLARE
    v_expense public.operating_expenses;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del gasto debe ser mayor a 0';
    END IF;

    INSERT INTO public.operating_expenses (date, description, amount_cents, category, account_id, created_by)
    VALUES (COALESCE(p_date, CURRENT_DATE), p_description, p_amount_cents, p_category, p_account_id, p_created_by)
    RETURNING * INTO v_expense;

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (p_account_id, 'operating_expense', -p_amount_cents, p_description, v_expense.id, 'operating_expense', p_created_by);
    END IF;

    RETURN v_expense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_operating_expense(DATE, TEXT, BIGINT, TEXT, UUID, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_operating_expense
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_operating_expense(p_expense_id UUID)
RETURNS void AS $$
DECLARE
    v_expense public.operating_expenses;
BEGIN
    SELECT * INTO v_expense FROM public.operating_expenses WHERE id = p_expense_id;
    IF v_expense IS NULL THEN
        RAISE EXCEPTION 'Gasto % no encontrado', p_expense_id;
    END IF;

    IF v_expense.account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents + v_expense.amount_cents WHERE id = v_expense.account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
        VALUES (v_expense.account_id, 'expense_reversal', v_expense.amount_cents, 'Reversa por eliminación de gasto: ' || v_expense.description, p_expense_id, 'operating_expense');
    END IF;

    DELETE FROM public.operating_expenses WHERE id = p_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_operating_expense(UUID) TO service_role;

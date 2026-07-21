-- =====================================================
-- YJBMOTOCOM — Migración 015: Funciones atómicas de Fiado (clientes deudores)
-- =====================================================
-- Mismo patrón que 00005/00006/00011/00013/00014: SECURITY DEFINER,
-- search_path fijo, solo ejecutables por service_role.
-- =====================================================

-- La migración 00009 no incluyó 'credit_payment' como type válido de
-- account_movements (solo su reversa 'credit_payment_reversal') — se
-- amplía aquí, nunca se restringe, así que no afecta filas existentes.
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_type_check;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_type_check
    CHECK (type IN (
        'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
        'operating_expense', 'expense_reversal', 'invoice_payment',
        'credit_payment', 'credit_payment_reversal', 'sale_reversal'
    ));

-- =====================================================
-- FUNCIÓN: pay_customer_credit
-- =====================================================
-- Registra un abono de un cliente a su fiado/apartado: inserta el abono,
-- acredita la cuenta indicada (el dinero entra al negocio, a diferencia
-- del abono a una factura de proveedor que sale), y marca el fiado como
-- 'paid' automáticamente cuando la suma de abonos cubre el monto total.
CREATE OR REPLACE FUNCTION public.pay_customer_credit(
    p_credit_id UUID,
    p_amount_cents BIGINT,
    p_account_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.customer_credits AS $$
DECLARE
    v_credit public.customer_credits;
    v_paid_so_far BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del abono debe ser mayor a 0';
    END IF;

    SELECT * INTO v_credit FROM public.customer_credits WHERE id = p_credit_id FOR UPDATE;
    IF v_credit IS NULL THEN
        RAISE EXCEPTION 'Fiado % no encontrado', p_credit_id;
    END IF;

    INSERT INTO public.customer_credit_payments (credit_id, amount_cents, notes)
    VALUES (p_credit_id, p_amount_cents, p_notes);

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (
            p_account_id, 'credit_payment', p_amount_cents,
            COALESCE(p_notes, 'Abono de fiado: ' || v_credit.customer_name),
            p_credit_id, 'customer_credit', p_created_by
        );
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid_so_far
    FROM public.customer_credit_payments
    WHERE credit_id = p_credit_id;

    UPDATE public.customer_credits
    SET status = CASE WHEN v_paid_so_far >= v_credit.total_amount_cents THEN 'paid' ELSE 'pending' END,
        updated_at = NOW()
    WHERE id = p_credit_id
    RETURNING * INTO v_credit;

    RETURN v_credit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.pay_customer_credit(UUID, BIGINT, UUID, TEXT, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_customer_credit
-- =====================================================
-- Elimina un fiado revirtiendo primero (debitando de vuelta) cualquier
-- abono que hubiera acreditado una cuenta.
CREATE OR REPLACE FUNCTION public.delete_customer_credit(p_credit_id UUID)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
    v_customer_name TEXT;
BEGIN
    SELECT customer_name INTO v_customer_name FROM public.customer_credits WHERE id = p_credit_id;
    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Fiado % no encontrado', p_credit_id;
    END IF;

    -- customer_credit_payments no tiene account_id propio: se reconstruye
    -- a partir de account_movements ligados a este fiado (reference_type).
    FOR v_payment IN
        SELECT account_id, amount_cents FROM public.account_movements
        WHERE reference_id = p_credit_id AND reference_type = 'customer_credit' AND type = 'credit_payment'
    LOOP
        UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
        VALUES (
            v_payment.account_id, 'credit_payment_reversal', -v_payment.amount_cents,
            'Reversa por eliminación de fiado: ' || v_customer_name,
            p_credit_id, 'customer_credit'
        );
    END LOOP;

    DELETE FROM public.customer_credits WHERE id = p_credit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_customer_credit(UUID) TO service_role;

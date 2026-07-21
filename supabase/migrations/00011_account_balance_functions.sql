-- =====================================================
-- YJBMOTOCOM — Migración 011: Funciones atómicas de saldo de Cuentas
-- =====================================================
-- Mismo patrón que decrement_stock/create_order_with_items (00005/00006):
-- funciones SECURITY DEFINER, search_path fijo, solo ejecutables por
-- service_role, que actualizan el saldo y registran el movimiento en una
-- sola transacción de Postgres (evita que un fallo a mitad de camino deje
-- el saldo de una cuenta desincronizado de su historial de movimientos).
-- =====================================================

-- =====================================================
-- FUNCIÓN: adjust_account_balance
-- =====================================================
-- Ajuste manual de saldo de una sola cuenta (ej. "Ajuste manual de saldo"
-- del software local). amount_cents con signo: positivo suma, negativo resta.
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
    p_account_id UUID,
    p_amount_cents BIGINT,
    p_type TEXT,
    p_description TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.account_movements AS $$
DECLARE
    v_movement public.account_movements;
BEGIN
    UPDATE public.accounts
    SET balance_cents = balance_cents + p_amount_cents
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
    END IF;

    INSERT INTO public.account_movements (
        account_id, type, amount_cents, description, reference_id, reference_type, created_by
    ) VALUES (
        p_account_id, p_type, p_amount_cents, p_description, p_reference_id, p_reference_type, p_created_by
    )
    RETURNING * INTO v_movement;

    RETURN v_movement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.adjust_account_balance(UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: transfer_between_accounts
-- =====================================================
-- Transferencia entre dos cuentas: valida saldo suficiente en el origen,
-- descuenta/acredita ambos saldos y registra los dos movimientos
-- (transfer_out/transfer_in) enlazados por un mismo reference_id, todo en
-- una sola transacción.
CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_cents BIGINT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_reference_id UUID := uuid_generate_v4();
    v_from_balance BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y la cuenta destino no pueden ser la misma';
    END IF;

    SELECT balance_cents INTO v_from_balance
    FROM public.accounts
    WHERE id = p_from_account_id
    FOR UPDATE;

    IF v_from_balance IS NULL THEN
        RAISE EXCEPTION 'Cuenta origen % no encontrada', p_from_account_id;
    END IF;

    IF v_from_balance < p_amount_cents THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta origen';
    END IF;

    UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_from_account_id;

    UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_to_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta destino % no encontrada', p_to_account_id;
    END IF;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_from_account_id, 'transfer_out', -p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_to_account_id, 'transfer_in', p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    RETURN v_reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID) TO service_role;

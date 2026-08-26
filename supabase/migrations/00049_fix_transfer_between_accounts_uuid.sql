-- =====================================================
-- YJBMOTOCOM — Migración 049: corregir "Transferir entre cuentas" (bug real preexistente)
-- =====================================================
-- Encontrado auditando el módulo Cuentas tras la ronda de cambios de
-- "Por Cobrar"/corrección de saldos (2026-08-26): el botón "Transferir"
-- llevaba dando 500 en TODOS los casos desde que existe (migración 00011,
-- Fase 4.4) — nunca se detectó porque las verificaciones anteriores solo
-- comprobaron que el botón/formulario existiera, no que una transferencia
-- real completara.
--
-- Causa: `transfer_between_accounts` tiene `SET search_path = public`
-- (necesario, es SECURITY DEFINER) y llama `uuid_generate_v4()` dentro del
-- cuerpo de la función — esa función vive en la extensión `uuid-ossp`, que
-- en este proyecto NO está en el esquema `public` (por eso el resto de
-- tablas que usan `uuid_generate_v4()` como DEFAULT de columna sí
-- funcionan: ahí se resuelve con el search_path normal de la conexión, no
-- con el restringido de esta función). Fix: usar `gen_random_uuid()`,
-- nativo de Postgres desde la versión 13 (vive en pg_catalog, siempre
-- resoluble sin importar el search_path), en vez de depender de la
-- extensión.
-- =====================================================

CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_cents BIGINT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_reference_id UUID := gen_random_uuid();
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

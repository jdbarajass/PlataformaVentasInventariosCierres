-- =====================================================
-- YJBMOTOCOM — Migración 014: Funciones atómicas de Facturas a proveedores
-- =====================================================
-- Mismo patrón que 00005/00006/00011/00013: SECURITY DEFINER, search_path
-- fijo, solo ejecutables por service_role.
-- =====================================================

-- =====================================================
-- FUNCIÓN: pay_supplier_invoice
-- =====================================================
-- Registra un abono (parcial o el saldo restante) a una factura de
-- proveedor: inserta el abono, debita la cuenta si se indica una, y marca
-- la factura como 'paid' automáticamente cuando la suma de abonos alcanza
-- el monto total (igual que el software local).
CREATE OR REPLACE FUNCTION public.pay_supplier_invoice(
    p_invoice_id UUID,
    p_amount_cents BIGINT,
    p_account_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.supplier_invoices AS $$
DECLARE
    v_invoice public.supplier_invoices;
    v_paid_so_far BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del abono debe ser mayor a 0';
    END IF;

    SELECT * INTO v_invoice FROM public.supplier_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF v_invoice IS NULL THEN
        RAISE EXCEPTION 'Factura % no encontrada', p_invoice_id;
    END IF;

    INSERT INTO public.supplier_invoice_payments (invoice_id, amount_cents, account_id, notes)
    VALUES (p_invoice_id, p_amount_cents, p_account_id, p_notes);

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (
            p_account_id, 'invoice_payment', -p_amount_cents,
            COALESCE(p_notes, 'Abono a factura: ' || v_invoice.description),
            p_invoice_id, 'supplier_invoice', p_created_by
        );
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid_so_far
    FROM public.supplier_invoice_payments
    WHERE invoice_id = p_invoice_id;

    UPDATE public.supplier_invoices
    SET status = CASE WHEN v_paid_so_far >= v_invoice.amount_cents THEN 'paid' ELSE 'pending' END,
        paid_at = CASE WHEN v_paid_so_far >= v_invoice.amount_cents THEN CURRENT_DATE ELSE paid_at END,
        account_id = COALESCE(p_account_id, account_id),
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_invoice;

    RETURN v_invoice;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.pay_supplier_invoice(UUID, BIGINT, UUID, TEXT, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_supplier_invoice
-- =====================================================
-- Elimina una factura revirtiendo primero (acreditando de vuelta) todos
-- los abonos que hubieran debitado alguna cuenta — igual que el software
-- local al eliminar una factura.
CREATE OR REPLACE FUNCTION public.delete_supplier_invoice(p_invoice_id UUID)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
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
    END LOOP;

    -- ON DELETE CASCADE en supplier_invoice_items/payments limpia el resto.
    DELETE FROM public.supplier_invoices WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_supplier_invoice(UUID) TO service_role;

-- =====================================================
-- YJBMOTOCOM — Migración 057: corrección puntual de una venta Addi anterior a la 00056
-- =====================================================
-- La venta YJBM-20260913-7237 (12 de septiembre de 2026, pago combinado
-- Addi + Nequi, ver Ventas del Día) se registró antes de que existiera
-- el desembolso diferido de Addi (migración 00056) -- el pago por Addi
-- ($280.000) se acreditó de inmediato al saldo real de la cuenta, igual
-- que cualquier otro método, aunque Addi confirma en su propio portal de
-- comercios que esa venta sigue "Pendiente de pago" (paga el 21 de
-- septiembre de 2026).
--
-- Corrección puntual, a pedido explícito del usuario tras confirmar la
-- factura exacta con una captura de Ventas del Día: se revierte esa
-- acreditación prematura y se registra como pendiente, con su fecha real
-- de pago (calculada con la misma función que usa el sistema en vivo,
-- next_addi_release_date(), para que quede idéntica a como habría salido
-- si esta venta se hubiera hecho después de la 00056).
--
-- No aplica en ningún otro entorno (un fork nuevo, o YBMOTOCOM, donde
-- esta venta específica no existe) -- es un no-op si no encuentra la
-- factura, e idempotente si ya se corrió antes (no duplica si la fila
-- pendiente ya existe).
-- =====================================================

DO $$
DECLARE
    v_order_id UUID;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_sale_date DATE;
    v_release_date DATE;
BEGIN
    SELECT o.id, p.account_id, p.amount_cents, (o.created_at AT TIME ZONE 'America/Bogota')::date
    INTO v_order_id, v_account_id, v_amount_cents, v_sale_date
    FROM public.orders o
    JOIN public.payments p ON p.order_id = o.id
    WHERE o.order_number = 'YJBM-20260913-7237'
      AND p.method = 'addi'
      AND o.status != 'cancelled'
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RETURN; -- esta venta no existe en este entorno, no-op
    END IF;

    IF EXISTS (SELECT 1 FROM public.addi_pending_releases WHERE order_id = v_order_id) THEN
        RETURN; -- ya corregida antes, no duplicar
    END IF;

    v_release_date := public.next_addi_release_date(v_sale_date);

    UPDATE public.accounts SET balance_cents = balance_cents - v_amount_cents WHERE id = v_account_id;

    INSERT INTO public.account_movements (
        account_id, type, amount_cents, description, reference_id, reference_type
    ) VALUES (
        v_account_id, 'manual_adjustment', -v_amount_cents,
        'Corrección: venta Addi del 12/09/2026 (factura YJBM-20260913-7237) se había acreditado de inmediato, antes de que existiera el desembolso diferido de Addi -- queda pendiente hasta su fecha real de pago',
        v_order_id, 'order'
    );

    INSERT INTO public.addi_pending_releases (
        account_id, order_id, amount_cents, sale_date, release_date
    ) VALUES (
        v_account_id, v_order_id, v_amount_cents, v_sale_date, v_release_date
    );
END $$;

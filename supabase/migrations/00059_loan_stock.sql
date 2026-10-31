-- =====================================================
-- YJBMOTOCOM — Migración 059: los préstamos descuentan inventario
-- =====================================================
-- Hallazgo de docs/AUDITORIA_VENTAS_INVENTARIO_2026-10.md: un préstamo a otro
-- almacén solo guardaba una nota, así que la mercancía que salía del local
-- seguía contándose en stock y aparecía como faltante en el conteo físico.
--
-- Decisión del usuario (2026-10-31): de ahora en adelante, prestar descuenta
-- del inventario hasta que se devuelva. Si el otro local lo paga, ya es una
-- venta entre locales y la unidad no vuelve.
--
-- Reglas:
--   - Solo aplica a 'lent' con producto de catálogo. Lo que nos prestan a
--     nosotros ('borrowed') y lo que está fuera de catálogo no tocan stock.
--   - `stock_deducted` guarda lo descontado de verdad (nunca deja stock
--     negativo, mismo patrón que order_items desde la migración 00028).
--   - `stock_deducted` NULL = préstamo anterior a esta migración: nunca
--     descontó, así que tampoco debe sumar al devolverse.
--   - La unidad está fuera mientras el estado sea 'pending' o 'charged'.
-- =====================================================

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS stock_deducted INT;

-- Suma `p_delta` al stock real (talla si la hay, si no el producto), sin
-- bajar de 0, y deja el movimiento. Devuelve cuánto cambió de verdad.
CREATE OR REPLACE FUNCTION public.apply_loan_stock(
    p_loan public.loans,
    p_delta INT,
    p_note TEXT,
    p_actor UUID
)
RETURNS INT AS $$
DECLARE
    v_current INT;
    v_applied INT;
BEGIN
    IF p_loan.variant_id IS NOT NULL THEN
        SELECT stock_qty INTO v_current FROM public.product_variants WHERE id = p_loan.variant_id FOR UPDATE;
    ELSE
        SELECT stock_qty INTO v_current FROM public.products WHERE id = p_loan.product_id FOR UPDATE;
    END IF;

    IF v_current IS NULL THEN
        RAISE EXCEPTION 'Producto del préstamo no encontrado';
    END IF;

    v_applied := GREATEST(p_delta, -v_current);

    IF v_applied = 0 THEN
        RETURN 0;
    END IF;

    IF p_loan.variant_id IS NOT NULL THEN
        UPDATE public.product_variants SET stock_qty = stock_qty + v_applied WHERE id = p_loan.variant_id;
    ELSE
        UPDATE public.products SET stock_qty = stock_qty + v_applied WHERE id = p_loan.product_id;
    END IF;

    INSERT INTO public.inventory_movements (
        product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
    ) VALUES (
        p_loan.product_id, p_loan.variant_id, v_applied,
        CASE WHEN v_applied < 0 THEN 'out' ELSE 'return' END,
        p_note, p_loan.id, 'loan', p_actor
    );

    RETURN v_applied;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: create_lent_loan
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_lent_loan(p_loan JSONB, p_actor UUID DEFAULT NULL)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_product_id UUID := NULLIF(p_loan->>'product_id', '')::UUID;
    v_variant_id UUID := NULLIF(p_loan->>'variant_id', '')::UUID;
    v_applied INT;
BEGIN
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'El préstamo con descuento de inventario requiere un producto';
    END IF;

    -- Sin esto el descuento caería en products.stock_qty y el trigger de
    -- sincronización lo borraría en el siguiente movimiento de cualquier talla.
    IF v_variant_id IS NULL AND EXISTS (
        SELECT 1 FROM public.product_variants WHERE product_id = v_product_id AND active = true
    ) THEN
        RAISE EXCEPTION 'Elige la talla del producto prestado';
    END IF;

    INSERT INTO public.loans (
        product_id, variant_id, product_title, warehouse, observations, direction, created_at
    ) VALUES (
        v_product_id, v_variant_id, p_loan->>'product_title', p_loan->>'warehouse',
        NULLIF(p_loan->>'observations', ''), 'lent',
        COALESCE(NULLIF(p_loan->>'created_at', '')::TIMESTAMPTZ, NOW())
    )
    RETURNING * INTO v_loan;

    v_applied := public.apply_loan_stock(
        v_loan, -1, 'Préstamo a ' || v_loan.warehouse, p_actor
    );

    UPDATE public.loans SET stock_deducted = -v_applied WHERE id = v_loan.id
    RETURNING * INTO v_loan;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: set_loan_status
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_loan_status(
    p_loan_id UUID,
    p_status TEXT,
    p_actor UUID DEFAULT NULL
)
RETURNS public.loans AS $$
DECLARE
    v_loan public.loans;
    v_was_out BOOLEAN;
    v_now_out BOOLEAN;
    v_applied INT;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Préstamo no encontrado';
    END IF;

    v_was_out := v_loan.status <> 'returned';
    v_now_out := p_status <> 'returned';

    IF v_loan.stock_deducted IS NOT NULL AND v_was_out AND NOT v_now_out THEN
        PERFORM public.apply_loan_stock(
            v_loan, v_loan.stock_deducted, 'Devolución de préstamo de ' || v_loan.warehouse, p_actor
        );
    ELSIF v_loan.stock_deducted IS NOT NULL AND NOT v_was_out AND v_now_out THEN
        v_applied := public.apply_loan_stock(
            v_loan, -1, 'Préstamo reabierto a ' || v_loan.warehouse, p_actor
        );
        v_loan.stock_deducted := -v_applied;
    END IF;

    UPDATE public.loans
    SET status = p_status, stock_deducted = v_loan.stock_deducted, updated_at = NOW()
    WHERE id = p_loan_id
    RETURNING * INTO v_loan;

    RETURN v_loan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: delete_loan
-- =====================================================
-- Borrar un préstamo pendiente es corregir un error: la unidad nunca salió de
-- verdad y vuelve al stock. Uno cobrado sí salió, así que no se devuelve.
CREATE OR REPLACE FUNCTION public.delete_loan(p_loan_id UUID, p_actor UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_loan public.loans;
BEGIN
    SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_loan.stock_deducted IS NOT NULL AND v_loan.status = 'pending' THEN
        PERFORM public.apply_loan_stock(
            v_loan, v_loan.stock_deducted, 'Préstamo eliminado (a ' || v_loan.warehouse || ')', p_actor
        );
    END IF;

    DELETE FROM public.loans WHERE id = p_loan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.apply_loan_stock(public.loans, INT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_lent_loan(JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_loan_status(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_loan(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loan_stock(public.loans, INT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_lent_loan(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_loan_status(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_loan(UUID, UUID) TO service_role;

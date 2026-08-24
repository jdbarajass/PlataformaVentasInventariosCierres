-- =====================================================
-- YJBMOTOCOM — Migración 046: reversión de stock al cancelar una orden ONLINE
-- =====================================================
-- Bug encontrado y confirmado con pruebas reales contra la base de datos:
-- cancelar una orden online (Stripe/MercadoPago/pago manual) ya pagada solo
-- cambiaba `orders.status` a 'cancelled' (api/orders/[id]/route.ts) sin tocar
-- stock — a diferencia de una venta de mostrador, que ya revertía el stock
-- exacto vía `cancel_pos_sale` (migración 00028). El stock quedaba
-- descontado para siempre en cualquier orden online pagada que después se
-- cancelara. De paso, esas órdenes seguían contando como ingreso real en
-- Reportes/Historial Mensual (filtran por `payment_status = 'paid'`, no por
-- `status != 'cancelled'`).
--
-- Esta migración:
-- 1) Extiende `decrement_stock`/`decrement_variant_stock` (migraciones
--    00005/00030) para devolver también `actual_deducted` — el descuento
--    REAL aplicado (nunca negativo, igual al patrón `stock_deducted` que ya
--    usa `create_pos_sale` desde la migración 00028), así el código que
--    confirma un pago puede guardarlo en `order_items.stock_deducted`.
-- 2) Agrega `restore_stock_for_cancelled_order`, que revierte
--    COALESCE(stock_deducted, qty) por cada item de la orden — mismo patrón
--    que `cancel_pos_sale`, pero sin tocar `accounts`/`payments` (las
--    órdenes online no usan cuentas internas, se pagan por pasarela).
-- =====================================================

DROP FUNCTION IF EXISTS public.decrement_stock(UUID, INT);
CREATE FUNCTION public.decrement_stock(p_product_id UUID, p_qty INT)
RETURNS TABLE (id UUID, title TEXT, stock_qty INT, actual_deducted INT) AS $$
DECLARE
    v_old INT;
BEGIN
    SELECT p.stock_qty INTO v_old FROM public.products p WHERE p.id = p_product_id FOR UPDATE;
    IF v_old IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.products
    SET stock_qty = GREATEST(v_old - p_qty, 0)
    WHERE public.products.id = p_product_id
    RETURNING public.products.id, public.products.title, public.products.stock_qty, LEAST(p_qty, v_old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INT) TO service_role;

DROP FUNCTION IF EXISTS public.decrement_variant_stock(UUID, INT);
CREATE FUNCTION public.decrement_variant_stock(p_variant_id UUID, p_qty INT)
RETURNS TABLE (id UUID, talla TEXT, stock_qty INT, actual_deducted INT) AS $$
DECLARE
    v_old INT;
BEGIN
    SELECT v.stock_qty INTO v_old FROM public.product_variants v WHERE v.id = p_variant_id FOR UPDATE;
    IF v_old IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    UPDATE public.product_variants
    SET stock_qty = GREATEST(v_old - p_qty, 0)
    WHERE public.product_variants.id = p_variant_id
    RETURNING public.product_variants.id, public.product_variants.talla, public.product_variants.stock_qty, LEAST(p_qty, v_old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.decrement_variant_stock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_variant_stock(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_variant_stock(UUID, INT) TO service_role;

-- =====================================================
-- FUNCIÓN: restore_stock_for_cancelled_order
-- =====================================================
CREATE OR REPLACE FUNCTION public.restore_stock_for_cancelled_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa de orden online cancelada', p_order_id, 'order');
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.restore_stock_for_cancelled_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_stock_for_cancelled_order(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_stock_for_cancelled_order(UUID) TO service_role;

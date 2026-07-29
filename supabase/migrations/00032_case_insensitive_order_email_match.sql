-- =====================================================
-- YJBMOTOCOM — Migración 032: match de email insensible a mayúsculas en pedidos
-- =====================================================
-- Bug encontrado en la auditoría por fases (Fase 2, 2026-07-29): "Mis
-- Pedidos" (y las políticas RLS de orders/order_items/payments) comparaban
-- el email del cliente con `=` (sensible a mayúsculas). Ni el registro
-- (`(shop)/registro/page.tsx`) ni el checkout (`(shop)/checkout/page.tsx`)
-- normalizan el email a minúsculas — si un cliente se registró como
-- "Juan@Gmail.com" pero algún pedido (propio o como invitado) quedó con
-- "juan@gmail.com", ese pedido no aparecía en su historial: no es que se
-- haya perdido, es que la comparación exacta no encontraba la fila.
--
-- Se corrige comparando en minúsculas (lower()) en vez de normalizar los
-- datos existentes — así funciona sin importar cómo haya quedado guardado
-- el email de pedidos ya creados, sin necesitar una migración de datos.
-- =====================================================

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
ON public.orders FOR SELECT
USING (
    user_id = auth.uid()
    OR lower(customer_email) = lower((SELECT email FROM public.users WHERE id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
CREATE POLICY "Users can view own order items"
ON public.order_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
        AND (
            o.user_id = auth.uid()
            OR lower(o.customer_email) = lower((SELECT email FROM public.users WHERE id = auth.uid()))
            OR public.get_user_role(auth.uid()) IN ('admin', 'seller')
        )
    )
);

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments"
ON public.payments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
        AND (
            o.user_id = auth.uid()
            OR lower(o.customer_email) = lower((SELECT email FROM public.users WHERE id = auth.uid()))
        )
    )
);

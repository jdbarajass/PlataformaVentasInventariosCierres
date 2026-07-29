-- =====================================================
-- YJBMOTOCOM — Migración 035: quitar políticas RLS públicas sin uso real
-- =====================================================
-- Hallazgo de la auditoría de seguridad transversal (Fase 3, 2026-07-29):
-- la política "Anyone can view active coupons" (migración 00004) permite
-- a cualquier visitante, autenticado o no, listar TODOS los cupones
-- activos (código, descuento, compra mínima, etc.) con una consulta
-- directa a la API REST de Supabase — sin necesitar conocer ningún
-- código de antemano. Eso rompe el modelo de negocio de un cupón
-- (distribución selectiva: un código para un influencer puntual, un
-- código de bienvenida enviado por email, etc.).
--
-- Se confirmó que ningún flujo real de la app depende de esta política:
-- la validación de cupón en el checkout (api/coupons/validate) y la
-- gestión desde el panel (api/coupons) usan siempre el cliente de
-- servicio (service_role, que bypasea RLS) — nunca el cliente del
-- navegador. La política es innecesaria y solo agrega exposición.
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;

-- =====================================================
-- Mismo patrón, mismo hallazgo: INSERT anónimo sin uso real
-- =====================================================
-- "Anyone can create orders"/"Anyone can create order items" (WITH CHECK
-- true, sin relación de dueño) quedaron huérfanas desde la migración 00006
-- — toda creación de orden pasa por create_order_with_items/create_pos_sale
-- (RPC con service_role, que bypasea RLS), nunca por un INSERT directo del
-- cliente (confirmado: no hay ningún `.from('orders').insert(...)` ni
-- `.from('order_items').insert(...)` en el código de la app). Mientras
-- existían, cualquiera podía crear órdenes basura directo por API, o peor,
-- insertar un order_item referenciando el order_id de la orden de OTRO
-- cliente (sin ninguna verificación de dueño), contaminando su factura.
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create order items" ON public.order_items;

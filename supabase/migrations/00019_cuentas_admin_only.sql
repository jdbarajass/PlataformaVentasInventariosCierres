-- =====================================================
-- YJBMOTOCOM — Migración 019: Cuentas (saldos/movimientos) pasa a ser admin-only
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.4 / 13.1 ítem 4.1.2): en el software local, "Cuentas" es un
-- módulo 100% de Admin (el vendedor no ve ni el botón de navegación). La
-- migración 00010 había dejado a 'seller' ver saldos/movimientos y crear
-- movimientos (ajustes manuales, transferencias), quedando solo el cierre
-- mensual como admin-only. Esta migración corrige ese exceso de permiso
-- para igualar al software local.
--
-- La tabla `accounts` en sí (SELECT de id/nombre/método de pago/color, SIN
-- el saldo — el API filtra `balance_cents` para 'seller' en la capa de
-- aplicación) se mantiene visible a 'seller' porque Registrar Venta, Ventas
-- del Día, Presupuesto, Fiado y Facturas necesitan la lista de cuentas para
-- elegir a cuál se acredita/debita un pago. Lo que se bloquea aquí es el
-- historial de movimientos y la creación de movimientos (ajustes manuales,
-- transferencias) — eso sí es exclusivo del módulo Cuentas.
-- =====================================================

-- =====================================================
-- TABLA: account_movements
-- =====================================================
DROP POLICY IF EXISTS "Admins and sellers can view account movements" ON public.account_movements;
CREATE POLICY "Admins can view account movements"
ON public.account_movements FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admins and sellers can insert account movements" ON public.account_movements;
CREATE POLICY "Admins can insert account movements"
ON public.account_movements FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Las políticas de UPDATE/DELETE ya eran admin-only desde la migración 00010.

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('accounts', 'account_movements')
ORDER BY tablename, policyname;

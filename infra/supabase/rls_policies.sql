-- =====================================================
-- YB MOTOCOM - Row Level Security (RLS) Completo
-- =====================================================
-- INSTRUCCIONES:
--   1. Abrir Supabase Dashboard → SQL Editor
--   2. Pegar este script completo y ejecutar
--   3. Verificar que no haya errores en la consola
--
-- NOTAS IMPORTANTES:
--   - El service_role_key (usado en webhooks) SIEMPRE bypasea RLS
--   - El anon_key respeta RLS (clientes públicos)
--   - Los usuarios autenticados respetan RLS
-- =====================================================


-- =====================================================
-- PASO 1: FUNCIÓN AUXILIAR ANTI-RECURSIÓN
-- =====================================================
-- Problema: Las políticas de la tabla 'users' no pueden
-- consultar 'public.users' directamente (causa recursión infinita).
-- Solución: función con SECURITY DEFINER que ejecuta sin RLS.

CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Dar permiso de ejecución a todos los roles
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO anon, authenticated, service_role;


-- =====================================================
-- PASO 2: HABILITAR RLS EN TODAS LAS TABLAS
-- =====================================================

ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings     ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- PASO 3: ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
-- =====================================================
-- Usamos un bloque dinámico para borrar absolutamente
-- todas las políticas en el schema public, sin importar
-- el nombre que tengan (limpieza total antes de recrear).

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;


-- =====================================================
-- PASO 4: POLÍTICAS — TABLA users
-- =====================================================
-- Usa get_user_role() para evitar recursión infinita

-- Cualquier usuario autenticado puede ver su propio perfil
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- Admin y seller pueden ver todos los usuarios
-- (usa la función auxiliar para evitar recursión)
CREATE POLICY "Admins can view all users"
ON public.users FOR SELECT
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

-- Cada usuario puede actualizar su propio perfil
CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Solo admin puede actualizar roles de otros usuarios
CREATE POLICY "Admins can manage all users"
ON public.users FOR ALL
USING (
  public.get_user_role(auth.uid()) = 'admin'
);


-- =====================================================
-- PASO 5: POLÍTICAS — TABLA categories
-- =====================================================

-- Lectura pública: cualquiera puede ver categorías activas
CREATE POLICY "Anyone can view active categories"
ON public.categories FOR SELECT
USING (active = true);

-- Admin y seller pueden gestionar categorías (ver todas, crear, editar, borrar)
CREATE POLICY "Admins can manage categories"
ON public.categories FOR ALL
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- PASO 6: POLÍTICAS — TABLA products
-- =====================================================

-- Lectura pública: cualquiera puede ver productos activos
CREATE POLICY "Anyone can view active products"
ON public.products FOR SELECT
USING (active = true);

-- Admin y seller pueden gestionar todos los productos
-- (incluyendo inactivos — necesario para el panel admin)
CREATE POLICY "Admins and sellers can manage products"
ON public.products FOR ALL
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- PASO 7: POLÍTICAS — TABLA orders
-- =====================================================

-- Cualquiera (incluso sin login) puede crear una orden
-- Necesario para checkout de clientes no registrados
CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

-- Usuario autenticado puede ver sus propias órdenes
CREATE POLICY "Users can view own orders"
ON public.orders FOR SELECT
USING (
  user_id = auth.uid()
  OR customer_email = (
    SELECT email FROM public.users WHERE id = auth.uid()
  )
);

-- Admin y seller pueden ver todas las órdenes
CREATE POLICY "Admins can view all orders"
ON public.orders FOR SELECT
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

-- Admin y seller pueden actualizar órdenes
-- (cambiar estado, fulfillment, etc.)
CREATE POLICY "Admins can update orders"
ON public.orders FOR UPDATE
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- PASO 8: POLÍTICAS — TABLA order_items
-- =====================================================

-- Cualquiera puede insertar items de orden
-- (junto con la creación de la orden pública)
CREATE POLICY "Anyone can create order items"
ON public.order_items FOR INSERT
WITH CHECK (true);

-- Ver items: si puedes ver la orden, puedes ver sus items
CREATE POLICY "Users can view own order items"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
    AND (
      o.user_id = auth.uid()
      OR o.customer_email = (SELECT email FROM public.users WHERE id = auth.uid())
      OR public.get_user_role(auth.uid()) IN ('admin', 'seller')
    )
  )
);


-- =====================================================
-- PASO 9: POLÍTICAS — TABLA payments
-- =====================================================

-- Usuario puede ver sus propios pagos
CREATE POLICY "Users can view own payments"
ON public.payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
    AND (
      o.user_id = auth.uid()
      OR o.customer_email = (SELECT email FROM public.users WHERE id = auth.uid())
    )
  )
);

-- Admin y seller pueden gestionar todos los pagos
CREATE POLICY "Admins can manage payments"
ON public.payments FOR ALL
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- PASO 10: POLÍTICAS — TABLA inventory_movements
-- =====================================================
-- Nota: el webhook usa service_role (bypasea RLS automáticamente)
-- Esta política cubre las operaciones del panel admin

CREATE POLICY "Admins and sellers can view inventory"
ON public.inventory_movements FOR SELECT
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

CREATE POLICY "Admins and sellers can insert inventory"
ON public.inventory_movements FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

CREATE POLICY "Admins can update inventory"
ON public.inventory_movements FOR UPDATE
USING (
  public.get_user_role(auth.uid()) = 'admin'
);


-- =====================================================
-- PASO 11: POLÍTICAS — TABLA daily_closures
-- =====================================================

CREATE POLICY "Admins can manage daily closures"
ON public.daily_closures FOR ALL
USING (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
)
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- PASO 12: POLÍTICAS — TABLA audit_logs
-- =====================================================
-- Los logs son append-only: se pueden insertar y leer pero no modificar

-- Solo admin puede ver los logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- Admin y seller pueden insertar logs
-- (los webhooks usan service_role y no necesitan esta política)
CREATE POLICY "Admins and sellers can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

-- Nadie puede modificar ni borrar logs (inmutabilidad)
-- UPDATE y DELETE no tienen políticas → siempre denegado


-- =====================================================
-- PASO 13: POLÍTICAS — TABLA coupons
-- =====================================================

-- Lectura pública: cualquiera puede ver cupones activos
CREATE POLICY "Anyone can view active coupons"
ON public.coupons FOR SELECT
USING (active = true);

-- Solo admin puede gestionar cupones
CREATE POLICY "Admins can manage coupons"
ON public.coupons FOR ALL
USING (
  public.get_user_role(auth.uid()) = 'admin'
)
WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);


-- =====================================================
-- PASO 14: POLÍTICAS — TABLA store_settings
-- =====================================================
-- La configuración de la tienda es pública (checkout, footer, etc.)

-- Lectura pública: cualquiera puede leer la configuración
-- Necesario para que checkout, footer y contacto lean de BD
CREATE POLICY "Anyone can read store settings"
ON public.store_settings FOR SELECT
USING (true);

-- Solo admin puede actualizar la configuración
CREATE POLICY "Admins can update store settings"
ON public.store_settings FOR UPDATE
USING (
  public.get_user_role(auth.uid()) = 'admin'
)
WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);


-- =====================================================
-- PASO 15: POLÍTICAS — STORAGE (product-images)
-- =====================================================

-- Eliminar TODAS las políticas de storage existentes (limpieza total)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      pol.policyname
    );
  END LOOP;
END $$;

-- Lectura pública del bucket de imágenes de productos
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Solo admin y seller pueden subir imágenes
CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
  AND public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

-- Solo admin y seller pueden eliminar imágenes
CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND public.get_user_role(auth.uid()) IN ('admin', 'seller')
);


-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================
-- Ejecuta esto para confirmar que todas las políticas están activas:

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

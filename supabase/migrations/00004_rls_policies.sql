-- =====================================================
-- YJBMOTOCOM — Migración 004: Row Level Security (RLS)
-- =====================================================
-- Habilita RLS y define todas las políticas de acceso
-- NOTA: service_role_key siempre bypasea RLS (webhooks)
-- =====================================================

-- =====================================================
-- PASO 1: Habilitar RLS en todas las tablas
-- =====================================================
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_subscriptions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PASO 2: Limpiar políticas existentes (idempotente)
-- =====================================================
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Storage: limpiar políticas previas
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- =====================================================
-- TABLA: users
-- =====================================================
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
ON public.users FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all users"
ON public.users FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: categories
-- =====================================================
CREATE POLICY "Anyone can view active categories"
ON public.categories FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage categories"
ON public.categories FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: products
-- =====================================================
CREATE POLICY "Anyone can view active products"
ON public.products FOR SELECT
USING (active = true);

CREATE POLICY "Admins and sellers can manage products"
ON public.products FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: orders
-- =====================================================
CREATE POLICY "Anyone can create orders"
ON public.orders FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view own orders"
ON public.orders FOR SELECT
USING (
    user_id = auth.uid()
    OR customer_email = (SELECT email FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Admins can view all orders"
ON public.orders FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Admins can update orders"
ON public.orders FOR UPDATE
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: order_items
-- =====================================================
CREATE POLICY "Anyone can create order items"
ON public.order_items FOR INSERT
WITH CHECK (true);

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
-- TABLA: payments
-- =====================================================
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

CREATE POLICY "Admins can manage payments"
ON public.payments FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: inventory_movements
-- =====================================================
CREATE POLICY "Admins and sellers can view inventory"
ON public.inventory_movements FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Admins and sellers can insert inventory"
ON public.inventory_movements FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Admins can update inventory"
ON public.inventory_movements FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: daily_closures
-- =====================================================
CREATE POLICY "Admins can manage daily closures"
ON public.daily_closures FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: audit_logs
-- =====================================================
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins and sellers can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: coupons
-- =====================================================
CREATE POLICY "Anyone can view active coupons"
ON public.coupons FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage coupons"
ON public.coupons FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: store_settings
-- =====================================================
CREATE POLICY "Anyone can read store settings"
ON public.store_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can update store settings"
ON public.store_settings FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: wishlists
-- =====================================================
CREATE POLICY "Users can view own wishlist"
ON public.wishlists FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own wishlist"
ON public.wishlists FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from own wishlist"
ON public.wishlists FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all wishlists"
ON public.wishlists FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: product_reviews
-- =====================================================
CREATE POLICY "Anyone can read approved reviews"
ON public.product_reviews FOR SELECT
USING (approved = true);

CREATE POLICY "Users can read own reviews"
ON public.product_reviews FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create reviews"
ON public.product_reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
ON public.product_reviews FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admin can manage all reviews"
ON public.product_reviews FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: restock_subscriptions
-- =====================================================
CREATE POLICY "Anyone can subscribe to restock"
ON public.restock_subscriptions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admin can view restock subscriptions"
ON public.restock_subscriptions FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Admin can delete restock subscriptions"
ON public.restock_subscriptions FOR DELETE
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

CREATE POLICY "Admin can update restock subscriptions"
ON public.restock_subscriptions FOR UPDATE
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- STORAGE: bucket product-images
-- =====================================================
-- Ejecutar PRIMERO en Dashboard > Storage: crear bucket "product-images" público
-- Luego ejecutar estas políticas:

CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
    AND public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product-images'
    AND public.get_user_role(auth.uid()) IN ('admin', 'seller')
);

-- =====================================================
-- VERIFICACIÓN: listar todas las políticas activas
-- =====================================================
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

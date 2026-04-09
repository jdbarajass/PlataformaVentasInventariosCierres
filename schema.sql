-- =====================================================
-- YJBMOTOCOM — Schema completo consolidado
-- =====================================================
-- Un solo archivo para restaurar toda la BD desde cero.
-- Orden de ejecución en Supabase SQL Editor:
--   1. Ejecutar este archivo completo
--   2. Ejecutar supabase/seed.sql  (datos iniciales)
--   3. Crear bucket "product-images" en Storage (público)
--   4. Crear usuario admin via /api/seed-admin o Dashboard
-- =====================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- FUNCIONES AUXILIARES
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TABLA: users
-- =====================================================
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL,
    name        TEXT,
    phone       TEXT,
    role        TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'seller', 'viewer')),
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función anti-recursión para RLS
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
    SELECT role FROM public.users WHERE id = user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO anon, authenticated, service_role;

-- =====================================================
-- TABLA: categories
-- =====================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,
    description TEXT,
    image_url   TEXT,
    parent_id   UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
    sort_order  INT         DEFAULT 0,
    active      BOOLEAN     DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: products
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku                     TEXT        UNIQUE,
    title                   TEXT        NOT NULL,
    slug                    TEXT        NOT NULL UNIQUE,
    description             TEXT,
    price_cents             INT         NOT NULL CHECK (price_cents >= 0),
    cost_cents              INT         DEFAULT 0 CHECK (cost_cents >= 0),
    compare_at_price_cents  INT         CHECK (compare_at_price_cents >= 0),
    category_id             UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
    images                  TEXT[]      DEFAULT '{}',
    stock_qty               INT         NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    low_stock_threshold     INT         DEFAULT 5,
    weight_grams            INT,
    dimensions              JSONB,
    tags                    TEXT[]      DEFAULT '{}',
    active                  BOOLEAN     DEFAULT true,
    featured                BOOLEAN     DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON public.products(active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured);
CREATE INDEX IF NOT EXISTS idx_products_slug     ON public.products(slug);
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: inventory_movements
-- =====================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    qty             INT         NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN ('in','out','adjustment','sale','return')),
    note            TEXT,
    reference_id    UUID,
    reference_type  TEXT,
    created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_product    ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON public.inventory_movements(created_at);

-- =====================================================
-- TABLA: orders
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number     TEXT        UNIQUE NOT NULL DEFAULT '',
    user_id          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    customer_email   TEXT        NOT NULL,
    customer_name    TEXT,
    customer_phone   TEXT,
    shipping_address JSONB,
    billing_address  JSONB,
    subtotal_cents   INT         NOT NULL DEFAULT 0,
    discount_cents   INT         NOT NULL DEFAULT 0,
    shipping_cents   INT         NOT NULL DEFAULT 0,
    tax_cents        INT         NOT NULL DEFAULT 0,
    total_cents      INT         NOT NULL DEFAULT 0,
    currency         TEXT        NOT NULL DEFAULT 'COP',
    status           TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
    payment_status   TEXT        NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending','paid','failed','refunded','partial_refund')),
    notes            TEXT,
    metadata         JSONB       DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user           ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_number   ON public.orders(order_number);
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'YJBM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                       LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER set_order_number
    BEFORE INSERT ON public.orders FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION generate_order_number();

-- =====================================================
-- TABLA: order_items
-- =====================================================
CREATE TABLE IF NOT EXISTS public.order_items (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id       UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id     UUID        REFERENCES public.products(id) ON DELETE SET NULL,
    product_title  TEXT        NOT NULL,
    product_sku    TEXT,
    product_image  TEXT,
    qty            INT         NOT NULL CHECK (qty > 0),
    price_cents    INT         NOT NULL CHECK (price_cents >= 0),
    total_cents    INT         NOT NULL CHECK (total_cents >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- =====================================================
-- TABLA: payments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL CHECK (provider IN ('stripe','mercadopago','manual','cash','transfer')),
    provider_payment_id TEXT,
    provider_session_id TEXT,
    amount_cents        INT         NOT NULL CHECK (amount_cents >= 0),
    currency            TEXT        NOT NULL DEFAULT 'COP',
    method              TEXT        CHECK (method IN ('card','transfer','wallet','cash','nequi','daviplata','other')),
    status              TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','succeeded','failed','cancelled','refunded')),
    metadata            JSONB       DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order    ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status);
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: daily_closures
-- =====================================================
CREATE TABLE IF NOT EXISTS public.daily_closures (
    id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    date                  DATE        NOT NULL UNIQUE,
    cash_amount_cents     INT         NOT NULL DEFAULT 0,
    card_amount_cents     INT         NOT NULL DEFAULT 0,
    transfer_amount_cents INT         NOT NULL DEFAULT 0,
    wallet_amount_cents   INT         NOT NULL DEFAULT 0,
    other_amount_cents    INT         NOT NULL DEFAULT 0,
    total_amount_cents    INT         NOT NULL DEFAULT 0,
    orders_count          INT         NOT NULL DEFAULT 0,
    notes                 TEXT,
    created_by            UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    verified              BOOLEAN     DEFAULT false,
    verified_by           UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_closures_date ON public.daily_closures(date);
CREATE TRIGGER update_daily_closures_updated_at
    BEFORE UPDATE ON public.daily_closures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: audit_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    action      TEXT        NOT NULL,
    table_name  TEXT        NOT NULL,
    record_id   UUID,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor      ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table      ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record     ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =====================================================
-- TABLA: coupons
-- =====================================================
CREATE TABLE IF NOT EXISTS public.coupons (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                TEXT        NOT NULL UNIQUE,
    description         TEXT,
    discount_type       TEXT        NOT NULL CHECK (discount_type IN ('percentage','fixed')),
    discount_value      INT         NOT NULL CHECK (discount_value > 0),
    min_purchase_cents  INT         DEFAULT 0,
    max_uses            INT,
    used_count          INT         DEFAULT 0,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    active              BOOLEAN     DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER update_coupons_updated_at
    BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: store_settings (fila única)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.store_settings (
    id                INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    store_name        TEXT        NOT NULL DEFAULT 'YJBMOTOCOM',
    store_description TEXT        DEFAULT 'Tu tienda de confianza para accesorios y equipamiento de motos.',
    contact_info      JSONB       NOT NULL DEFAULT '{"phone_primary":"+57 321 411 1371","phone_secondary":"+57 314 406 5520","email":"yjbmotocom@gmail.com","address":"Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1","city":"Bogotá, Colombia"}'::jsonb,
    shipping_config   JSONB       NOT NULL DEFAULT '{"free_shipping_threshold_cents":20000000,"default_shipping_cost_cents":1500000,"enabled":true}'::jsonb,
    tax_config        JSONB       NOT NULL DEFAULT '{"enabled":false,"percentage":19}'::jsonb,
    payment_methods   JSONB       NOT NULL DEFAULT '[{"id":"card","name":"Tarjeta de crédito/débito","enabled":true},{"id":"transfer","name":"Transferencia bancaria","enabled":true},{"id":"nequi","name":"Nequi","enabled":true},{"id":"daviplata","name":"Daviplata","enabled":true},{"id":"cash","name":"Efectivo (retiro en tienda)","enabled":true}]'::jsonb,
    social_links      JSONB       NOT NULL DEFAULT '{"facebook":"","instagram":"","whatsapp":"","tiktok":"","twitter":""}'::jsonb,
    branding          JSONB       NOT NULL DEFAULT '{"logo_url":"","primary_color":"#06b6d4","secondary_color":"#2563eb"}'::jsonb,
    updated_by        UUID        REFERENCES auth.users(id),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TRIGGER update_store_settings_updated_at
    BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: wishlists
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wishlists (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlists_user    ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON public.wishlists(product_id);

-- =====================================================
-- TABLA: product_reviews
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id        UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating            INT         NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title             TEXT,
    comment           TEXT,
    verified_purchase BOOLEAN     DEFAULT false,
    approved          BOOLEAN     DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product  ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON public.product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON public.product_reviews(approved);
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: restock_subscriptions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.restock_subscriptions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    email       TEXT        NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
    notified    BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, email)
);
CREATE INDEX IF NOT EXISTS idx_restock_product  ON public.restock_subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_restock_email    ON public.restock_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_restock_notified ON public.restock_subscriptions(notified);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
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

-- users
CREATE POLICY "Users can view own profile"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all users"    ON public.users FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can manage all users"  ON public.users FOR ALL   USING (public.get_user_role(auth.uid()) = 'admin');

-- categories
CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage categories"      ON public.categories FOR ALL    USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- products
CREATE POLICY "Anyone can view active products"          ON public.products FOR SELECT USING (active = true);
CREATE POLICY "Admins and sellers can manage products"   ON public.products FOR ALL    USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- orders
CREATE POLICY "Anyone can create orders"    ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own orders"   ON public.orders FOR SELECT USING (user_id = auth.uid() OR customer_email = (SELECT email FROM public.users WHERE id = auth.uid()));
CREATE POLICY "Admins can view all orders"  ON public.orders FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Admins can update orders"    ON public.orders FOR UPDATE USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- order_items
CREATE POLICY "Anyone can create order items"   ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own order items"  ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR o.customer_email = (SELECT email FROM public.users WHERE id = auth.uid()) OR public.get_user_role(auth.uid()) IN ('admin','seller'))));

-- payments
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR o.customer_email = (SELECT email FROM public.users WHERE id = auth.uid()))));
CREATE POLICY "Admins can manage payments"  ON public.payments FOR ALL    USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- inventory_movements
CREATE POLICY "Admins and sellers can view inventory"   ON public.inventory_movements FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Admins and sellers can insert inventory" ON public.inventory_movements FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Admins can update inventory"             ON public.inventory_movements FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin');

-- daily_closures
CREATE POLICY "Admins can manage daily closures" ON public.daily_closures FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin','seller')) WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- audit_logs
CREATE POLICY "Admins can view audit logs"              ON public.audit_logs FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');
CREATE POLICY "Admins and sellers can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- coupons
CREATE POLICY "Anyone can view active coupons" ON public.coupons FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage coupons"      ON public.coupons FOR ALL    USING (public.get_user_role(auth.uid()) = 'admin') WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- store_settings
CREATE POLICY "Anyone can read store settings"   ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update store settings" ON public.store_settings FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin') WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- wishlists
CREATE POLICY "Users can view own wishlist"       ON public.wishlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to own wishlist"     ON public.wishlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove from own wishlist" ON public.wishlists FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all wishlists"      ON public.wishlists FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- product_reviews
CREATE POLICY "Anyone can read approved reviews"        ON public.product_reviews FOR SELECT USING (approved = true);
CREATE POLICY "Users can read own reviews"              ON public.product_reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can create reviews"  ON public.product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews"            ON public.product_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage all reviews"            ON public.product_reviews FOR ALL    USING (public.get_user_role(auth.uid()) = 'admin');

-- restock_subscriptions
CREATE POLICY "Anyone can subscribe to restock"       ON public.restock_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can view restock subscriptions"  ON public.restock_subscriptions FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Admin can delete restock subscriptions" ON public.restock_subscriptions FOR DELETE USING (public.get_user_role(auth.uid()) IN ('admin','seller'));
CREATE POLICY "Admin can update restock subscriptions" ON public.restock_subscriptions FOR UPDATE USING (public.get_user_role(auth.uid()) IN ('admin','seller'));

-- =====================================================
-- STORAGE: políticas para bucket product-images
-- (Crear el bucket PRIMERO en Dashboard > Storage)
-- =====================================================
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated' AND public.get_user_role(auth.uid()) IN ('admin','seller'));

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND public.get_user_role(auth.uid()) IN ('admin','seller'));

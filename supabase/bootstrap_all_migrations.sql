-- ============================================================
-- BOOTSTRAP: las 52 migraciones de este proyecto, concatenadas
-- en orden, para pegar de una sola vez en el SQL Editor de un
-- proyecto de Supabase NUEVO Y VACIO (nunca en uno que ya tenga
-- datos o migraciones aplicadas -- se duplicaria todo).
--
-- Generado el 2026-09-04 concatenando supabase/migrations/*.sql
-- en orden. Si se agregan migraciones nuevas al proyecto despues
-- de esta fecha, hay que regenerar este archivo (no se mantiene
-- solo).
-- ============================================================


-- ============================================================
-- 00001_initial_schema.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 001: Schema Inicial
-- =====================================================
-- Tablas: users, categories, products, inventory_movements,
--         orders, order_items, payments, daily_closures,
--         audit_logs, coupons
-- =====================================================

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- FUNCIÓN AUXILIAR: updated_at automático
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TABLA: users (extiende auth.users de Supabase)
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
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIÓN AUXILIAR: obtener rol del usuario (anti-recursión RLS)
-- =====================================================
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
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

CREATE INDEX IF NOT EXISTS idx_products_category  ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active    ON public.products(active);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON public.products(featured);
CREATE INDEX IF NOT EXISTS idx_products_slug      ON public.products(slug);

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: inventory_movements
-- =====================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    qty             INT         NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return')),
    note            TEXT,
    reference_id    UUID,
    reference_type  TEXT,
    created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product    ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);

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
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generar número de orden
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'YJBM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                       LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
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
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: daily_closures (cierres de caja diarios)
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
    BEFORE UPDATE ON public.daily_closures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
    discount_type       TEXT        NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
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
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 00002_store_settings.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 002: Store Settings
-- =====================================================
-- Tabla de configuración de la tienda (fila única)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.store_settings (
    id               INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    store_name       TEXT        NOT NULL DEFAULT 'YJBMOTOCOM',
    store_description TEXT       DEFAULT 'Tu tienda de confianza para accesorios y equipamiento de motos. Calidad y seguridad para cada viaje.',
    contact_info     JSONB       NOT NULL DEFAULT '{
        "phone_primary": "+57 321 411 1371",
        "phone_secondary": "+57 314 406 5520",
        "email": "yjbmotocom@gmail.com",
        "address": "Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1",
        "city": "Bogotá, Colombia",
        "business_hours": {
            "weekdays": "Lunes a Viernes: 8:00 AM - 6:00 PM",
            "saturday": "Sábado: 9:00 AM - 2:00 PM",
            "sunday": "Domingo: Cerrado"
        }
    }'::jsonb,
    shipping_config  JSONB       NOT NULL DEFAULT '{
        "free_shipping_threshold_cents": 20000000,
        "default_shipping_cost_cents": 1500000,
        "enabled": true
    }'::jsonb,
    tax_config       JSONB       NOT NULL DEFAULT '{
        "enabled": false,
        "percentage": 19
    }'::jsonb,
    payment_methods  JSONB       NOT NULL DEFAULT '[
        {"id": "card",       "name": "Tarjeta de crédito/débito",         "enabled": true},
        {"id": "transfer",   "name": "Transferencia bancaria",            "enabled": true},
        {"id": "nequi",      "name": "Nequi",                             "enabled": true},
        {"id": "daviplata",  "name": "Daviplata",                         "enabled": true},
        {"id": "cash",       "name": "Efectivo (retiro en tienda)",       "enabled": true}
    ]'::jsonb,
    social_links     JSONB       NOT NULL DEFAULT '{
        "facebook":  "",
        "instagram": "",
        "whatsapp":  "",
        "tiktok":    "",
        "twitter":   ""
    }'::jsonb,
    branding         JSONB       NOT NULL DEFAULT '{
        "logo_url":        "",
        "primary_color":   "#06b6d4",
        "secondary_color": "#2563eb"
    }'::jsonb,
    updated_by       UUID        REFERENCES auth.users(id),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar fila única con todos los defaults
INSERT INTO public.store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER update_store_settings_updated_at
    BEFORE UPDATE ON public.store_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 00003_extras.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 003: Extras
-- =====================================================
-- Tablas: wishlists, product_reviews, restock_subscriptions
-- =====================================================

-- =====================================================
-- TABLA: wishlists (favoritos del usuario)
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
-- TABLA: product_reviews (reseñas de productos)
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
    BEFORE UPDATE ON public.product_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: restock_subscriptions (alertas de reposición)
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


-- ============================================================
-- 00004_rls_policies.sql
-- ============================================================
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


-- ============================================================
-- 00005_payment_integrity.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 005: Integridad de pagos
-- =====================================================
-- 1) Idempotencia de webhooks (Stripe / MercadoPago): evita procesar
--    el mismo evento dos veces si el proveedor reintenta la entrega.
-- 2) Decremento atómico de stock: elimina la condición de carrera
--    entre leer stock_qty y actualizarlo (lost update) en pagos
--    concurrentes del mismo producto.
-- =====================================================

-- =====================================================
-- TABLA: processed_webhooks
-- =====================================================
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
    provider    TEXT        NOT NULL CHECK (provider IN ('stripe', 'mercadopago')),
    event_key   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_created_at
    ON public.processed_webhooks(created_at);

ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Sin políticas: nadie con anon/authenticated puede leer ni escribir.
-- Solo el cliente con service_role (usado en los webhooks) bypasea RLS.

-- =====================================================
-- FUNCION: decrement_stock
-- =====================================================
-- Decrementa stock_qty de un producto en una sola sentencia UPDATE,
-- lo que hace que Postgres bloquee la fila durante la operación y
-- evita que dos webhooks concurrentes lean el mismo stock_qty inicial.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_qty INT)
RETURNS TABLE (id UUID, title TEXT, stock_qty INT) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.products
    SET stock_qty = GREATEST(public.products.stock_qty - p_qty, 0)
    WHERE public.products.id = p_product_id
    RETURNING public.products.id, public.products.title, public.products.stock_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo el rol de servicio (usado por los webhooks server-side) puede
-- ejecutar esta función. Se revoca de anon/authenticated para que un
-- cliente no pueda invocarla directamente vía supabase.rpc().
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INT) TO service_role;


-- ============================================================
-- 00006_order_atomicity.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 006: Atomicidad en creación de orden
-- =====================================================
-- El endpoint POST /api/orders insertaba `orders` y `order_items` en dos
-- llamadas separadas al cliente de Supabase (que no soporta transacciones
-- multi-statement desde el SDK JS). Si la segunda inserción fallaba, la
-- orden quedaba huérfana (sin items). Esta función ejecuta ambas
-- inserciones dentro de una sola transacción de Postgres: si cualquier
-- parte falla, toda la llamada se revierte (incluida la orden).
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_order JSONB,
    p_items JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
BEGIN
    INSERT INTO public.orders (
        customer_email, customer_name, customer_phone, shipping_address,
        subtotal_cents, discount_cents, shipping_cents, total_cents,
        notes, status, payment_status
    )
    VALUES (
        p_order->>'customer_email',
        p_order->>'customer_name',
        p_order->>'customer_phone',
        p_order->'shipping_address',
        (p_order->>'subtotal_cents')::INT,
        COALESCE((p_order->>'discount_cents')::INT, 0),
        (p_order->>'shipping_cents')::INT,
        (p_order->>'total_cents')::INT,
        p_order->>'notes',
        COALESCE(p_order->>'status', 'pending'),
        COALESCE(p_order->>'payment_status', 'pending')
    )
    RETURNING * INTO v_order;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'create_order_with_items: p_items no puede estar vacio';
    END IF;

    INSERT INTO public.order_items (
        order_id, product_id, product_title, product_image, qty, price_cents, total_cents
    )
    SELECT
        v_order.id,
        (item->>'product_id')::UUID,
        item->>'product_title',
        item->>'product_image',
        (item->>'qty')::INT,
        (item->>'price_cents')::INT,
        (item->>'total_cents')::INT
    FROM jsonb_array_elements(p_items) AS item;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo el rol de servicio (usado por POST /api/orders server-side) puede
-- ejecutar esta función — un cliente anon/authenticated no debe poder
-- crear órdenes arbitrarias saltándose la revalidación de precios/stock
-- que hace la API antes de llamarla.
REVOKE ALL ON FUNCTION public.create_order_with_items(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_with_items(JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(JSONB, JSONB) TO service_role;


-- ============================================================
-- 00007_fix_search_path.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 007: Fijar search_path en funciones SECURITY DEFINER
-- =====================================================
-- El Security Advisor de Supabase marca "Function Search Path Mutable"
-- para decrement_stock y create_order_with_items (00005/00006). Son
-- SECURITY DEFINER sin search_path fijo: en teoría, alguien con permisos
-- para crear objetos en algún esquema podría hacer que la función
-- resuelva una tabla distinta a la real. Ya usan public.products /
-- public.orders con esquema explícito en el cuerpo, pero fijar
-- search_path cierra la vía de ataque por completo.
-- =====================================================

ALTER FUNCTION public.decrement_stock(UUID, INT) SET search_path = public;
ALTER FUNCTION public.create_order_with_items(JSONB, JSONB) SET search_path = public;


-- ============================================================
-- 00008_product_variants_and_pos_order_fields.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 008: Variantes de producto y campos POS en órdenes
-- =====================================================
-- Parte de la unificación con el software local de ventas (VENTAS_YJBMOTOCOM).
-- 100% ADITIVA: no modifica ni elimina ninguna columna/tabla existente que
-- use hoy el catálogo, el carrito o el checkout online. Un producto que no
-- tenga filas en product_variants sigue funcionando exactamente igual que
-- hoy (stock_qty/cost_cents de products siguen siendo la fuente de verdad).
--
-- Ver docs/UNIFICACION_YJBMOTOCOM.md para el contexto completo del proyecto.
-- =====================================================

-- =====================================================
-- TABLA: product_variants (variantes por talla / código de barras)
-- =====================================================
-- Equivale a una fila de la tabla "inventario" del software local: cada
-- variante tiene su propio stock, costo y código de barras. Un producto
-- sin necesidad de tallas (ej. la mayoría de accesorios) simplemente no
-- tiene variantes y sigue usando products.stock_qty como hoy.
CREATE TABLE IF NOT EXISTS public.product_variants (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id           UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    talla                TEXT,
    sku                  TEXT        UNIQUE,
    barcode              TEXT        UNIQUE,
    stock_qty            INT         NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    low_stock_threshold  INT         NOT NULL DEFAULT 5,
    cost_cents           INT         NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    active               BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, talla)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON public.product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_product_variants_active  ON public.product_variants(active);

CREATE TRIGGER update_product_variants_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- inventory_movements: referencia opcional a la variante exacta
-- =====================================================
ALTER TABLE public.inventory_movements
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON public.inventory_movements(variant_id);

-- =====================================================
-- orders: canal de venta (online vs. mostrador) y vendedor
-- =====================================================
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS channel   TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'pos')),
    ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_channel   ON public.orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);

-- =====================================================
-- order_items: variante vendida, talla, costo y descuento por línea
-- =====================================================
-- cost_cents y product_talla son snapshots al momento de la venta (mismo
-- patrón ya usado por product_title/product_sku): preservan el historial
-- aunque el producto/variante cambie o se borre después.
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS variant_id      UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS product_talla   TEXT,
    ADD COLUMN IF NOT EXISTS cost_cents      INT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS discount_cents  INT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items(variant_id);


-- ============================================================
-- 00009_pos_operational_tables.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 009: Tablas operativas del módulo YJBMOTOCOM (POS)
-- =====================================================
-- Replica en Postgres las tablas del software local que hoy no tienen
-- ningún equivalente en el admin: Cuentas, Facturas a proveedores, Fiado,
-- Préstamos, Notas y Presupuesto mensual. Tablas 100% nuevas — no tocan
-- ninguna tabla existente de la tienda online.
--
-- Arranca con datos vacíos salvo el seed de las 6 cuentas por defecto
-- (mismo seed que usa el software local), tal como acordamos: no se migra
-- historial del sistema local.
-- =====================================================

-- =====================================================
-- TABLA: accounts (Cuentas — saldo por medio de pago)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.accounts (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT        NOT NULL UNIQUE,
    payment_method TEXT        NOT NULL,
    balance_cents  BIGINT      NOT NULL DEFAULT 0,
    color          TEXT,
    active         BOOLEAN     NOT NULL DEFAULT true,
    sort_order     INT         NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.accounts (name, payment_method, sort_order)
VALUES
    ('Efectivo',          'cash',      1),
    ('Nequi',             'nequi',     2),
    ('QR/Bancolombia',    'qr',        3),
    ('NU',                'nu',        4),
    ('Daviplata',         'daviplata', 5),
    ('Addi',              'addi',      6)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABLA: account_movements (Mov. Cuentas)
-- =====================================================
-- amount_cents con signo: positivo = entra dinero a la cuenta, negativo = sale.
CREATE TABLE IF NOT EXISTS public.account_movements (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    type          TEXT        NOT NULL CHECK (type IN (
                      'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
                      'operating_expense', 'expense_reversal', 'invoice_payment',
                      'credit_payment_reversal', 'sale_reversal'
                  )),
    amount_cents  BIGINT      NOT NULL,
    description   TEXT,
    reference_id  UUID,
    reference_type TEXT,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_movements_account    ON public.account_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_account_movements_reference   ON public.account_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_account_movements_created_at  ON public.account_movements(created_at);

-- =====================================================
-- TABLA: account_closures (Cierres Cuentas — snapshot mensual)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.account_closures (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    year        INT         NOT NULL,
    month       INT         NOT NULL CHECK (month BETWEEN 1 AND 12),
    snapshot    JSONB       NOT NULL DEFAULT '{}',
    notes       TEXT,
    created_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, month)
);

-- =====================================================
-- TABLA: supplier_invoices (Facturas a proveedores)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    description   TEXT        NOT NULL,
    supplier      TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents >= 0),
    arrival_date  DATE,
    due_date      DATE,
    status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    notes         TEXT,
    paid_at       DATE,
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status   ON public.supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date ON public.supplier_invoices(due_date);

CREATE TRIGGER update_supplier_invoices_updated_at
    BEFORE UPDATE ON public.supplier_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: supplier_invoice_items (Facturas Items)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id        UUID        NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
    description       TEXT        NOT NULL,
    qty               INT         NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_price_cents  BIGINT      NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
    subtotal_cents    BIGINT      NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON public.supplier_invoice_items(invoice_id);

-- =====================================================
-- TABLA: supplier_invoice_payments (Abonos a facturas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoice_payments (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id    UUID        NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    notes         TEXT,
    paid_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_payments_invoice ON public.supplier_invoice_payments(invoice_id);

-- =====================================================
-- TABLA: customer_credits (Fiado — clientes deudores/apartados)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_credits (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name       TEXT        NOT NULL,
    customer_id_number  TEXT,
    customer_phone      TEXT,
    description         TEXT,
    total_amount_cents  BIGINT      NOT NULL CHECK (total_amount_cents >= 0),
    status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_status ON public.customer_credits(status);

CREATE TRIGGER update_customer_credits_updated_at
    BEFORE UPDATE ON public.customer_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: customer_credit_payments (Abonos Fiado)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_credit_payments (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id     UUID        NOT NULL REFERENCES public.customer_credits(id) ON DELETE CASCADE,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    notes         TEXT,
    paid_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_payments_credit ON public.customer_credit_payments(credit_id);

-- =====================================================
-- TABLA: loans (Préstamos a otros almacenes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.loans (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id     UUID        REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id     UUID        REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_title  TEXT        NOT NULL,
    warehouse      TEXT        NOT NULL,
    observations   TEXT,
    status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'returned', 'charged')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);

CREATE TRIGGER update_loans_updated_at
    BEFORE UPDATE ON public.loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: notes (Notas y Pendientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notes (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        TEXT        NOT NULL CHECK (type IN ('task', 'restock')),
    text        TEXT        NOT NULL,
    completed   BOOLEAN     NOT NULL DEFAULT false,
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_completed ON public.notes(completed);
CREATE INDEX IF NOT EXISTS idx_notes_due_date  ON public.notes(due_date);

CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: monthly_budgets (Presupuesto Mensual)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.monthly_budgets (
    id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    year                   INT         NOT NULL,
    month                  INT         NOT NULL CHECK (month BETWEEN 1 AND 12),
    category               TEXT        NOT NULL,
    budgeted_amount_cents  BIGINT      NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, month, category)
);

CREATE TRIGGER update_monthly_budgets_updated_at
    BEFORE UPDATE ON public.monthly_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- payments: comisión, subtipo de método y cuenta acreditada
-- =====================================================
-- Se agrega aquí (no en la migración 008) porque depende de que exista
-- la tabla accounts. Se amplían los CHECK existentes (nunca se restringen)
-- para no invalidar filas ya existentes: se agregan 'pos' como provider
-- (ventas de mostrador) y 'addi' como method.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS method_detail   TEXT,
    ADD COLUMN IF NOT EXISTS commission_cents INT NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
    ADD COLUMN IF NOT EXISTS account_id      UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_account ON public.payments(account_id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_provider_check
    CHECK (provider IN ('stripe', 'mercadopago', 'manual', 'cash', 'transfer', 'pos'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi'));


-- ============================================================
-- 00010_rls_pos_tables.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 010: RLS para las tablas nuevas del módulo YJBMOTOCOM
-- =====================================================
-- Solo toca las tablas creadas en 00008/00009. No modifica ninguna política
-- existente de products/orders/order_items/payments/etc — a diferencia de
-- 00004_rls_policies.sql, aquí NO se hace DROP masivo de políticas, para no
-- arriesgar las políticas ya vivas en producción.
-- =====================================================

-- =====================================================
-- TABLA: product_variants
-- =====================================================
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view variants of active products" ON public.product_variants;
CREATE POLICY "Anyone can view variants of active products"
ON public.product_variants FOR SELECT
USING (
    active = true
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.active = true)
);

DROP POLICY IF EXISTS "Admins and sellers can manage variants" ON public.product_variants;
CREATE POLICY "Admins and sellers can manage variants"
ON public.product_variants FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: accounts
-- =====================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can view accounts" ON public.accounts;
CREATE POLICY "Admins and sellers can view accounts"
ON public.accounts FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins can manage accounts" ON public.accounts;
CREATE POLICY "Admins can manage accounts"
ON public.accounts FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: account_movements
-- =====================================================
ALTER TABLE public.account_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can view account movements" ON public.account_movements;
CREATE POLICY "Admins and sellers can view account movements"
ON public.account_movements FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins and sellers can insert account movements" ON public.account_movements;
CREATE POLICY "Admins and sellers can insert account movements"
ON public.account_movements FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins can update account movements" ON public.account_movements;
CREATE POLICY "Admins can update account movements"
ON public.account_movements FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admins can delete account movements" ON public.account_movements;
CREATE POLICY "Admins can delete account movements"
ON public.account_movements FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: account_closures
-- =====================================================
ALTER TABLE public.account_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage account closures" ON public.account_closures;
CREATE POLICY "Admins can manage account closures"
ON public.account_closures FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: supplier_invoices
-- =====================================================
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoices" ON public.supplier_invoices;
CREATE POLICY "Admins and sellers can manage supplier invoices"
ON public.supplier_invoices FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: supplier_invoice_items
-- =====================================================
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoice items" ON public.supplier_invoice_items;
CREATE POLICY "Admins and sellers can manage supplier invoice items"
ON public.supplier_invoice_items FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: supplier_invoice_payments
-- =====================================================
ALTER TABLE public.supplier_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoice payments" ON public.supplier_invoice_payments;
CREATE POLICY "Admins and sellers can manage supplier invoice payments"
ON public.supplier_invoice_payments FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: customer_credits (Fiado)
-- =====================================================
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage customer credits" ON public.customer_credits;
CREATE POLICY "Admins and sellers can manage customer credits"
ON public.customer_credits FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: customer_credit_payments
-- =====================================================
ALTER TABLE public.customer_credit_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage customer credit payments" ON public.customer_credit_payments;
CREATE POLICY "Admins and sellers can manage customer credit payments"
ON public.customer_credit_payments FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: loans (Préstamos)
-- =====================================================
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage loans" ON public.loans;
CREATE POLICY "Admins and sellers can manage loans"
ON public.loans FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: notes
-- =====================================================
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage notes" ON public.notes;
CREATE POLICY "Admins and sellers can manage notes"
ON public.notes FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: monthly_budgets
-- =====================================================
ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage monthly budgets" ON public.monthly_budgets;
CREATE POLICY "Admins and sellers can manage monthly budgets"
ON public.monthly_budgets FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- VERIFICACIÓN: listar políticas de las tablas nuevas
-- =====================================================
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'product_variants', 'accounts', 'account_movements', 'account_closures',
      'supplier_invoices', 'supplier_invoice_items', 'supplier_invoice_payments',
      'customer_credits', 'customer_credit_payments', 'loans', 'notes', 'monthly_budgets'
  )
ORDER BY tablename, policyname;


-- ============================================================
-- 00011_account_balance_functions.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 011: Funciones atómicas de saldo de Cuentas
-- =====================================================
-- Mismo patrón que decrement_stock/create_order_with_items (00005/00006):
-- funciones SECURITY DEFINER, search_path fijo, solo ejecutables por
-- service_role, que actualizan el saldo y registran el movimiento en una
-- sola transacción de Postgres (evita que un fallo a mitad de camino deje
-- el saldo de una cuenta desincronizado de su historial de movimientos).
-- =====================================================

-- =====================================================
-- FUNCIÓN: adjust_account_balance
-- =====================================================
-- Ajuste manual de saldo de una sola cuenta (ej. "Ajuste manual de saldo"
-- del software local). amount_cents con signo: positivo suma, negativo resta.
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
    p_account_id UUID,
    p_amount_cents BIGINT,
    p_type TEXT,
    p_description TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.account_movements AS $$
DECLARE
    v_movement public.account_movements;
BEGIN
    UPDATE public.accounts
    SET balance_cents = balance_cents + p_amount_cents
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
    END IF;

    INSERT INTO public.account_movements (
        account_id, type, amount_cents, description, reference_id, reference_type, created_by
    ) VALUES (
        p_account_id, p_type, p_amount_cents, p_description, p_reference_id, p_reference_type, p_created_by
    )
    RETURNING * INTO v_movement;

    RETURN v_movement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.adjust_account_balance(UUID, BIGINT, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: transfer_between_accounts
-- =====================================================
-- Transferencia entre dos cuentas: valida saldo suficiente en el origen,
-- descuenta/acredita ambos saldos y registra los dos movimientos
-- (transfer_out/transfer_in) enlazados por un mismo reference_id, todo en
-- una sola transacción.
CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_cents BIGINT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_reference_id UUID := uuid_generate_v4();
    v_from_balance BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y la cuenta destino no pueden ser la misma';
    END IF;

    SELECT balance_cents INTO v_from_balance
    FROM public.accounts
    WHERE id = p_from_account_id
    FOR UPDATE;

    IF v_from_balance IS NULL THEN
        RAISE EXCEPTION 'Cuenta origen % no encontrada', p_from_account_id;
    END IF;

    IF v_from_balance < p_amount_cents THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta origen';
    END IF;

    UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_from_account_id;

    UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_to_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta destino % no encontrada', p_to_account_id;
    END IF;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_from_account_id, 'transfer_out', -p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_to_account_id, 'transfer_in', p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    RETURN v_reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID) TO service_role;


-- ============================================================
-- 00012_pos_commission_rates.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 012: Tasas de comisión por método de pago (POS)
-- =====================================================
-- Aditivo: nueva columna en store_settings con valores por defecto en 0.
-- El admin podrá editar estos porcentajes desde Configuración más adelante
-- (sub-fase 3.8). Se usan para calcular payments.commission_cents en cada
-- venta de mostrador — la comisión se traslada al cliente como sobreprecio
-- y no afecta el cálculo de ganancia (ganancia = precio - costo), igual
-- que en el software local.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS pos_commission_rates JSONB NOT NULL DEFAULT '{
        "cash": 0,
        "transfer": 0,
        "wallet": 0,
        "nequi": 0,
        "daviplata": 0,
        "addi": 0,
        "card": 0,
        "other": 0
    }'::jsonb;


-- ============================================================
-- 00013_pos_sale_functions.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 013: Funciones atómicas de venta POS (mostrador)
-- =====================================================
-- Mismo patrón de 00005/00006/00011: funciones SECURITY DEFINER,
-- search_path fijo, solo ejecutables por service_role. Una venta de
-- mostrador toca 4 cosas a la vez (orden+items, stock, pagos y saldo de
-- cuentas) — deben quedar en una sola transacción para que nunca se
-- descuente stock sin registrar el pago, o se acredite una cuenta sin
-- dejar la orden creada.
-- =====================================================

-- =====================================================
-- FUNCIÓN: create_pos_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID
    )
    RETURNING * INTO v_order;

    -- Items: valida y descuenta stock (con bloqueo de fila), inserta el
    -- item y su movimiento de inventario.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = stock_qty - v_qty WHERE id = v_variant_id;
        ELSE
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = stock_qty - v_qty WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
        ) VALUES (
            v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
            v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
        );
    END LOOP;

    -- Pagos: inserta cada método usado y acredita la cuenta enlazada.
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB) TO service_role;

-- =====================================================
-- FUNCIÓN: cancel_pos_sale
-- =====================================================
-- Revierte una venta de mostrador: restaura el stock de cada item, revierte
-- el crédito de cada cuenta y marca la orden como cancelada/reembolsada.
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND channel = 'pos') THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
        VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.cancel_pos_sale(UUID) TO service_role;


-- ============================================================
-- 00014_supplier_invoice_functions.sql
-- ============================================================
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


-- ============================================================
-- 00015_customer_credit_functions.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 015: Funciones atómicas de Fiado (clientes deudores)
-- =====================================================
-- Mismo patrón que 00005/00006/00011/00013/00014: SECURITY DEFINER,
-- search_path fijo, solo ejecutables por service_role.
-- =====================================================

-- La migración 00009 no incluyó 'credit_payment' como type válido de
-- account_movements (solo su reversa 'credit_payment_reversal') — se
-- amplía aquí, nunca se restringe, así que no afecta filas existentes.
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_type_check;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_type_check
    CHECK (type IN (
        'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
        'operating_expense', 'expense_reversal', 'invoice_payment',
        'credit_payment', 'credit_payment_reversal', 'sale_reversal'
    ));

-- =====================================================
-- FUNCIÓN: pay_customer_credit
-- =====================================================
-- Registra un abono de un cliente a su fiado/apartado: inserta el abono,
-- acredita la cuenta indicada (el dinero entra al negocio, a diferencia
-- del abono a una factura de proveedor que sale), y marca el fiado como
-- 'paid' automáticamente cuando la suma de abonos cubre el monto total.
CREATE OR REPLACE FUNCTION public.pay_customer_credit(
    p_credit_id UUID,
    p_amount_cents BIGINT,
    p_account_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.customer_credits AS $$
DECLARE
    v_credit public.customer_credits;
    v_paid_so_far BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del abono debe ser mayor a 0';
    END IF;

    SELECT * INTO v_credit FROM public.customer_credits WHERE id = p_credit_id FOR UPDATE;
    IF v_credit IS NULL THEN
        RAISE EXCEPTION 'Fiado % no encontrado', p_credit_id;
    END IF;

    INSERT INTO public.customer_credit_payments (credit_id, amount_cents, notes)
    VALUES (p_credit_id, p_amount_cents, p_notes);

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (
            p_account_id, 'credit_payment', p_amount_cents,
            COALESCE(p_notes, 'Abono de fiado: ' || v_credit.customer_name),
            p_credit_id, 'customer_credit', p_created_by
        );
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid_so_far
    FROM public.customer_credit_payments
    WHERE credit_id = p_credit_id;

    UPDATE public.customer_credits
    SET status = CASE WHEN v_paid_so_far >= v_credit.total_amount_cents THEN 'paid' ELSE 'pending' END,
        updated_at = NOW()
    WHERE id = p_credit_id
    RETURNING * INTO v_credit;

    RETURN v_credit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.pay_customer_credit(UUID, BIGINT, UUID, TEXT, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_customer_credit
-- =====================================================
-- Elimina un fiado revirtiendo primero (debitando de vuelta) cualquier
-- abono que hubiera acreditado una cuenta.
CREATE OR REPLACE FUNCTION public.delete_customer_credit(p_credit_id UUID)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
    v_customer_name TEXT;
BEGIN
    SELECT customer_name INTO v_customer_name FROM public.customer_credits WHERE id = p_credit_id;
    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Fiado % no encontrado', p_credit_id;
    END IF;

    -- customer_credit_payments no tiene account_id propio: se reconstruye
    -- a partir de account_movements ligados a este fiado (reference_type).
    FOR v_payment IN
        SELECT account_id, amount_cents FROM public.account_movements
        WHERE reference_id = p_credit_id AND reference_type = 'customer_credit' AND type = 'credit_payment'
    LOOP
        UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
        VALUES (
            v_payment.account_id, 'credit_payment_reversal', -v_payment.amount_cents,
            'Reversa por eliminación de fiado: ' || v_customer_name,
            p_credit_id, 'customer_credit'
        );
    END LOOP;

    DELETE FROM public.customer_credits WHERE id = p_credit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_customer_credit(UUID) TO service_role;


-- ============================================================
-- 00016_operating_expenses.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 016: Gastos operativos
-- =====================================================
-- Tabla faltante detectada al construir Presupuesto Mensual: el
-- comparativo "presupuesto vs. gasto real por categoría" del software
-- local necesita un registro de gastos con categoría propia — el
-- software local lo llama "gastos_dia". La migración 00009 no la incluyó
-- (fue un vacío en el plan original de la sub-fase 3.1). Se agrega aquí,
-- de forma aditiva, sin tocar nada de lo ya aplicado.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.operating_expenses (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    description   TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    category      TEXT        NOT NULL,
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_date     ON public.operating_expenses(date);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_category ON public.operating_expenses(category);

CREATE TRIGGER update_operating_expenses_updated_at
    BEFORE UPDATE ON public.operating_expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage operating expenses" ON public.operating_expenses;
CREATE POLICY "Admins and sellers can manage operating expenses"
ON public.operating_expenses FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- FUNCIÓN: record_operating_expense
-- =====================================================
-- Inserta el gasto y, si se indica una cuenta, la debita (mismo patrón
-- SECURITY DEFINER que el resto de funciones de dinero).
CREATE OR REPLACE FUNCTION public.record_operating_expense(
    p_date DATE,
    p_description TEXT,
    p_amount_cents BIGINT,
    p_category TEXT,
    p_account_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS public.operating_expenses AS $$
DECLARE
    v_expense public.operating_expenses;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto del gasto debe ser mayor a 0';
    END IF;

    INSERT INTO public.operating_expenses (date, description, amount_cents, category, account_id, created_by)
    VALUES (COALESCE(p_date, CURRENT_DATE), p_description, p_amount_cents, p_category, p_account_id, p_created_by)
    RETURNING * INTO v_expense;

    IF p_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cuenta % no encontrada', p_account_id;
        END IF;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
        VALUES (p_account_id, 'operating_expense', -p_amount_cents, p_description, v_expense.id, 'operating_expense', p_created_by);
    END IF;

    RETURN v_expense;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_operating_expense(DATE, TEXT, BIGINT, TEXT, UUID, UUID) TO service_role;

-- =====================================================
-- FUNCIÓN: delete_operating_expense
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_operating_expense(p_expense_id UUID)
RETURNS void AS $$
DECLARE
    v_expense public.operating_expenses;
BEGIN
    SELECT * INTO v_expense FROM public.operating_expenses WHERE id = p_expense_id;
    IF v_expense IS NULL THEN
        RAISE EXCEPTION 'Gasto % no encontrado', p_expense_id;
    END IF;

    IF v_expense.account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance_cents = balance_cents + v_expense.amount_cents WHERE id = v_expense.account_id;

        INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
        VALUES (v_expense.account_id, 'expense_reversal', v_expense.amount_cents, 'Reversa por eliminación de gasto: ' || v_expense.description, p_expense_id, 'operating_expense');
    END IF;

    DELETE FROM public.operating_expenses WHERE id = p_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_operating_expense(UUID) TO service_role;


-- ============================================================
-- 00017_edit_pos_sale.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 017: Editar una venta de mostrador ya registrada
-- =====================================================
-- Mismo patron SECURITY DEFINER que create_pos_sale/cancel_pos_sale
-- (00013). Editar = revertir por completo los efectos de la venta actual
-- (stock + saldo de cuentas, igual que cancel_pos_sale) y volver a
-- aplicarlos con los datos nuevos (igual que create_pos_sale), pero
-- conservando el mismo id/order_number en vez de crear una orden nueva —
-- exactamente como el software local "revierte y re-aplica el credito de
-- cuenta anterior" al editar una venta.
-- =====================================================

CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    -- 1. Revertir items actuales (restaurar stock) y borrarlos.
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
        VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    -- 2. Revertir pagos actuales (revertir credito de cuenta) y borrarlos.
    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    -- 3. Actualizar los campos editables de la orden (conserva id/order_number/seller_id/created_at).
    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- 4. Re-aplicar items nuevos (mismo bloque que create_pos_sale).
    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_new_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            UPDATE public.product_variants SET stock_qty = stock_qty - v_qty WHERE id = v_variant_id;
        ELSE
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            UPDATE public.products SET stock_qty = stock_qty - v_qty WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT
        );

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type
        ) VALUES (
            v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
            p_order_id, 'order'
        );
    END LOOP;

    -- 5. Re-aplicar pagos nuevos (mismo bloque que create_pos_sale).
    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB) TO service_role;


-- ============================================================
-- 00018_fixed_monthly_expenses.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 018: Gastos fijos mensuales (Configuración)
-- =====================================================
-- Aditivo: nueva columna en store_settings con los gastos fijos que el
-- software local guarda en su Configuración (Arriendo, Sueldo, Servicios,
-- Otros gastos, Días mes) — se usan para prorratear un "gasto diario fijo"
-- en la formula de Utilidad Real de /admin/reportes (gasto_diario =
-- total_gastos_fijos / dias_mes), igual que el local.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS fixed_monthly_expenses JSONB NOT NULL DEFAULT '{
        "arriendo_cents": 0,
        "sueldo_cents": 0,
        "servicios_cents": 0,
        "otros_gastos_cents": 0,
        "dias_mes": 30
    }'::jsonb;


-- ============================================================
-- 00019_cuentas_admin_only.sql
-- ============================================================
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


-- ============================================================
-- 00020_nu_qr_payment_methods.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 020: métodos de pago NU y QR/Bancolombia
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.2 / 13.2 ítem 4.2.2): el software local distingue 4 sub-tipos
-- de transferencia con comisión propia — NEQUI, NU, QR/Bancolombia,
-- DAVIPLATA — pero la nube solo tenía un genérico 'transfer' además de
-- 'nequi'/'daviplata'. Faltaban 'nu' y 'qr' como valores válidos de
-- payments.method (las 6 cuentas semilla de la migración 00009 ya usan
-- 'nu' y 'qr' como payment_method de cuenta, pero payments.method nunca
-- los aceptó). Se amplía el CHECK existente (nunca se restringe) para no
-- invalidar filas ya existentes.
-- =====================================================

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi', 'nu', 'qr'));


-- ============================================================
-- 00021_pos_sale_force_stock.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 021: permitir forzar una venta con stock insuficiente
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.2 / 13.2 ítem 4.2.4): el software local advierte "Stock
-- insuficiente, ¿continuar de todas formas?" pero permite seguir — el
-- stock nunca queda negativo porque decrementar_cantidad hace
-- `MAX(0, cantidad - qty)` (ver database/inventario_repo.py). La nube
-- bloqueaba con una excepción SQL sin ninguna opción de continuar.
--
-- Se agrega un parámetro `p_force` (default FALSE, no rompe llamadas
-- existentes) a create_pos_sale y edit_pos_sale: con p_force=FALSE el
-- comportamiento es idéntico al de antes (bloquea); con p_force=TRUE, en
-- vez de lanzar la excepción de stock insuficiente, decrementa hasta 0
-- (GREATEST(0, stock - qty)) — igual que el software local.
-- =====================================================

DROP FUNCTION IF EXISTS public.create_pos_sale(JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSE
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
        ) VALUES (
            v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
            v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
        );
    END LOOP;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_pos_sale(JSONB, JSONB, JSONB, BOOLEAN) TO service_role;

-- =====================================================
-- FUNCIÓN: edit_pos_sale — mismo tratamiento de p_force
-- =====================================================
DROP FUNCTION IF EXISTS public.edit_pos_sale(UUID, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
        VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_new_item->>'product_id')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSE
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT
        );

        INSERT INTO public.inventory_movements (
            product_id, variant_id, qty, type, note, reference_id, reference_type
        ) VALUES (
            v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
            p_order_id, 'order'
        );
    END LOOP;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.edit_pos_sale(UUID, JSONB, JSONB, JSONB, BOOLEAN) TO service_role;


-- ============================================================
-- 00022_inventory_exchange_type.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 022: tipo de movimiento "Cambio" (swap de producto)
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.3 / 13.3 ítem 4.3.2): el software local tiene una pestaña
-- "Cambios" dedicada (ui/inventario_panel.py, tab "🔄 Cambios") — el cliente
-- devuelve un producto y se lleva otro; se descuenta 1 unidad del que sale
-- y se suma 1 al que entra, ambos con tipo de movimiento "Cambio" y notas
-- cruzadas. Se amplía el CHECK existente (nunca se restringe) para admitir
-- el nuevo tipo 'exchange'.
-- =====================================================

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
    CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return', 'exchange'));


-- ============================================================
-- 00023_inventory_deleted_type.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 023: tipo de movimiento "Eliminado"
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.3 / 13.3 ítem 4.3.3): el software local registra un movimiento
-- "Eliminado" cuando se borra un producto con stock > 0
-- (database/inventario_repo.py: eliminar_producto). La nube hacía soft-delete
-- de la variante (active=false) sin dejar rastro en inventory_movements. Se
-- amplía el CHECK existente (nunca se restringe) para admitir 'deleted'.
-- =====================================================

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_type_check
    CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return', 'exchange', 'deleted'));


-- ============================================================
-- 00024_account_colors.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 024: colores por defecto de las cuentas semilla
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.4 / 13.4 ítem 4.4.9): la migración 00009 creó las 6 cuentas
-- semilla sin `color`, así que la UI caía al gris genérico. El software
-- local sí asigna un color propio por cuenta (database/schema.py). Solo se
-- actualiza si `color` sigue en NULL, para no pisar un color que el usuario
-- ya haya elegido manualmente en `/admin/cuentas`.
-- =====================================================

UPDATE public.accounts SET color = '#22C55E' WHERE name = 'Efectivo'         AND color IS NULL;
UPDATE public.accounts SET color = '#8B5CF6' WHERE name = 'Nequi'            AND color IS NULL;
UPDATE public.accounts SET color = '#F59E0B' WHERE name = 'QR/Bancolombia'   AND color IS NULL;
UPDATE public.accounts SET color = '#EF4444' WHERE name = 'NU'               AND color IS NULL;
UPDATE public.accounts SET color = '#F97316' WHERE name = 'Daviplata'        AND color IS NULL;
UPDATE public.accounts SET color = '#06B6D4' WHERE name = 'Addi'             AND color IS NULL;


-- ============================================================
-- 00025_manual_pos_sale_items.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 025: ítems manuales (fuera de catálogo) en Registrar Venta
-- =====================================================
-- Hallazgo crítico de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.9): el software local permite vender un producto que no está en
-- inventario, con nombre/costo/precio escritos a mano (ui/venta_form.py,
-- _LineaProducto._cargar_variantes, rama "No está en inventario" — deja el
-- campo libre en vez de bloquear). La nube exigía product_id (UUID) siempre
-- en Registrar Venta, sin ninguna forma de registrar un ítem fuera de catálogo.
--
-- order_items.product_id ya era NULLABLE (ON DELETE SET NULL) desde el
-- esquema inicial — el bloqueo estaba solo en la capa de aplicación
-- (zod + UI) y en estas funciones, que asumían product_id siempre presente
-- y lanzaban "Producto % no encontrado" si no lo era. Se corrige para que,
-- cuando el ítem no trae product_id ni variant_id (ítem manual), se salte
-- la validación/descuento de stock y no se inserte movimiento de inventario
-- (inventory_movements.product_id es NOT NULL — no aplica a un ítem sin
-- producto real).
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;
        -- v_product_id y v_variant_id ambos NULL: ítem manual fuera de
        -- catálogo (igual que el software local) — no hay stock que validar.

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: edit_pos_sale — mismo tratamiento de ítems manuales
-- =====================================================
CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_new_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type
            ) VALUES (
                v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: cancel_pos_sale — mismo tratamiento de ítems manuales
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND channel = 'pos') THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + v_item.qty WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, v_item.qty, 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 00026_product_barcode.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 026: Código de barras en productos sin variantes
-- =====================================================
-- El software local guarda "Serial" y "Código de barras" en TODAS las filas
-- de inventario, tengan talla o no. En la nube, product_variants.barcode ya
-- existe (migración 008) pero products no tenía columna equivalente para
-- los productos sin variantes (la mayoría de accesorios) — necesaria para
-- portar la pestaña "Ingresar" (alta rápida con generación automática de
-- código de barras/serial, ver docs/UNIFICACION_YJBMOTOCOM.md sección 20).
-- =====================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);


-- ============================================================
-- 00027_pos_sale_created_at.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 027: fecha editable al registrar una venta de mostrador
-- =====================================================
-- El software local permite elegir la fecha al registrar una venta (para
-- registrar ventas de días anteriores, ej. si se fue la luz y no se pudo
-- registrar a tiempo — ui/venta_form.py, campo_fecha), capturando la hora
-- real al momento del clic en "Vender" (controllers/venta_controller.py).
-- create_pos_sale nunca aceptó una fecha: el INSERT de orders no incluía
-- created_at en la lista de columnas, así que siempre quedaba en el
-- DEFAULT NOW() de la tabla — sin forma de corregir el día de una venta al
-- registrarla en la nube. Se agrega p_created_at (mismo patrón de
-- CREATE OR REPLACE con parámetro nuevo al final con DEFAULT, ya usado en
-- 00021/00025 para p_force).
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id, created_at
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID,
        COALESCE(p_created_at, NOW())
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;
        -- v_product_id y v_variant_id ambos NULL: ítem manual fuera de
        -- catálogo (igual que el software local) — no hay stock que validar.

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_qty, 'sale', 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 00028_pos_sale_stock_reversal_fix.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 028: reversión exacta de stock al cancelar/editar una venta forzada
-- =====================================================
-- Bug encontrado al auditar el recorrido completo de una venta (crear →
-- pagos combinados → descuento de stock → cancelar/editar → restaurar
-- stock): cuando una venta se registra con `p_force = true` sobre un
-- producto con stock insuficiente, el descuento real queda en
-- `GREATEST(0, stock_qty - qty)` — es decir, decrementa como máximo hasta
-- 0, nunca negativo (mismo comportamiento que el software local,
-- `MAX(0, cantidad - qty)` en database/inventario_repo.py). Pero tanto
-- `inventory_movements.qty` como la reversión al cancelar/editar
-- (`cancel_pos_sale`/`edit_pos_sale`) usaban el `qty` NOMINAL pedido en la
-- venta, no el descuento REAL aplicado.
--
-- Ejemplo concreto: stock = 2, se fuerza una venta de 5 unidades →
-- el stock real baja a 0 (se descontaron 2, no 5), pero
-- `inventory_movements` registraba "-5" (el registro de auditoría ya
-- quedaba mal), y si luego se cancela esa venta, el stock queda en
-- 0 + 5 = 5 — 3 unidades más de las que había originalmente. El inventario
-- queda inflado permanentemente por cada venta forzada que se cancele o
-- edite.
--
-- Se agrega `order_items.stock_deducted`: cuánto se descontó REALMENTE del
-- inventario al crear/editar la línea (NULL para ítems fuera de catálogo,
-- que nunca tocan stock; NULL también en filas históricas ya existentes,
-- donde se sigue usando `qty` como antes — es lo mejor que se puede hacer
-- sin esa información). Al cancelar/editar, se restaura
-- `COALESCE(stock_deducted, qty)` en vez de `qty` a secas.
-- =====================================================

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS stock_deducted INT;

-- =====================================================
-- FUNCIÓN: create_pos_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id, created_at
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID,
        COALESCE(p_created_at, NOW())
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;
        -- v_product_id y v_variant_id ambos NULL: ítem manual fuera de
        -- catálogo (igual que el software local) — no hay stock que validar.

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: edit_pos_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_new_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: cancel_pos_sale
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND channel = 'pos') THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 00029_admin_only_notes.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 029: notas "Pendientes Generales Admin" (solo admin)
-- =====================================================
-- Nueva pestaña en Notas y Pendientes, pedida explícitamente por el
-- usuario: además de "Por Pedir / Resurtido" y "Tareas Operativas" (ambas
-- visibles para admin y vendedor), un tercer tipo de nota administrativa
-- que NUNCA debe llegar a un vendedor — ni en la interfaz ni por la API.
--
-- Se amplía el CHECK de notes.type (nunca se restringe, mismo patrón que
-- 00020_nu_qr_payment_methods.sql) y se reescribe la política RLS: antes
-- una sola política "FOR ALL" dejaba a cualquier admin/vendedor
-- gestionar cualquier nota sin distinción. Ahora el vendedor sigue
-- teniendo acceso total a 'task'/'restock', pero el nuevo tipo
-- 'admin_task' queda excluido explícitamente de su política — así que ni
-- siquiera pidiendo la API directamente vería esas filas (RLS bloquea a
-- nivel de base de datos, no solo se oculta la pestaña en la interfaz).
-- =====================================================

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_type_check;
ALTER TABLE public.notes ADD CONSTRAINT notes_type_check
    CHECK (type IN ('task', 'restock', 'admin_task'));

DROP POLICY IF EXISTS "Admins and sellers can manage notes" ON public.notes;

CREATE POLICY "Admins can manage all notes"
ON public.notes FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Sellers can manage non-admin notes"
ON public.notes FOR ALL
USING (public.get_user_role(auth.uid()) = 'seller' AND type != 'admin_task')
WITH CHECK (public.get_user_role(auth.uid()) = 'seller' AND type != 'admin_task');


-- ============================================================
-- 00030_online_variant_stock_sync.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 030: variantes de producto en la tienda online
-- =====================================================
-- Bug encontrado en la auditoría por fases (Fase 1, 2026-07-29): la tienda
-- pública, el panel "Gestión de Productos" y el widget "Stock bajo" del
-- Dashboard leen `products.stock_qty` directo. Ese campo queda en 0 para
-- cualquier producto con tallas (el stock real vive en
-- `product_variants.stock_qty`, ver migración 00008) — así que todo
-- producto con tallas se mostraba "Agotado" en el sitio público, con el
-- botón de compra deshabilitado, y quedaba excluido del filtro "En stock".
--
-- Esta migración corrige la causa raíz en la base de datos en vez de
-- tocar cada consulta que lee `products.stock_qty` (tienda pública,
-- Dashboard, Gestión de Productos, etc.): un trigger mantiene
-- `products.stock_qty` sincronizado como la suma de sus variantes,
-- así que todas esas consultas quedan correctas automáticamente.
--
-- Además, extiende `create_order_with_items` y agrega
-- `decrement_variant_stock` para que una compra online de un producto con
-- tallas pueda registrar y descontar la talla exacta comprada (mismo
-- patrón ya usado por `create_pos_sale`/`decrement_stock` para el
-- mostrador).
-- =====================================================

-- =====================================================
-- 1) Sincronizar products.stock_qty con la suma de sus variantes
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id), 0
        )
        WHERE id = OLD.product_id;
        RETURN OLD;
    END IF;

    UPDATE public.products
    SET stock_qty = COALESCE(
        (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = NEW.product_id), 0
    )
    WHERE id = NEW.product_id;

    -- UPDATE que mueve una variante a otro producto (caso raro): también
    -- recalcula el producto de origen, que se quedó con una variante menos.
    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id), 0
        )
        WHERE id = OLD.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_stock_from_variants
    AFTER INSERT OR UPDATE OF stock_qty, product_id OR DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- Backfill: corrige de una vez los productos con tallas que ya existen
-- (migrados en la sección 19 del historial), que hoy están en 0.
UPDATE public.products p
SET stock_qty = sub.total_stock
FROM (
    SELECT product_id, COALESCE(SUM(stock_qty), 0) AS total_stock
    FROM public.product_variants
    GROUP BY product_id
) sub
WHERE p.id = sub.product_id
  AND p.stock_qty IS DISTINCT FROM sub.total_stock;

-- =====================================================
-- 2) order_items: registrar variante/talla también en órdenes online
-- =====================================================
-- 100% aditivo sobre la función existente: los items sin variant_id
-- (productos sin tallas) siguen insertándose exactamente igual que antes.
CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_order JSONB,
    p_items JSONB
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
BEGIN
    INSERT INTO public.orders (
        customer_email, customer_name, customer_phone, shipping_address,
        subtotal_cents, discount_cents, shipping_cents, total_cents,
        notes, status, payment_status
    )
    VALUES (
        p_order->>'customer_email',
        p_order->>'customer_name',
        p_order->>'customer_phone',
        p_order->'shipping_address',
        (p_order->>'subtotal_cents')::INT,
        COALESCE((p_order->>'discount_cents')::INT, 0),
        (p_order->>'shipping_cents')::INT,
        (p_order->>'total_cents')::INT,
        p_order->>'notes',
        COALESCE(p_order->>'status', 'pending'),
        COALESCE(p_order->>'payment_status', 'pending')
    )
    RETURNING * INTO v_order;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'create_order_with_items: p_items no puede estar vacio';
    END IF;

    INSERT INTO public.order_items (
        order_id, product_id, product_title, product_image,
        variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
    )
    SELECT
        v_order.id,
        (item->>'product_id')::UUID,
        item->>'product_title',
        item->>'product_image',
        NULLIF(item->>'variant_id', '')::UUID,
        NULLIF(item->>'product_talla', ''),
        (item->>'qty')::INT,
        (item->>'price_cents')::INT,
        COALESCE((item->>'cost_cents')::INT, 0),
        COALESCE((item->>'discount_cents')::INT, 0),
        (item->>'total_cents')::INT
    FROM jsonb_array_elements(p_items) AS item;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3) decrement_variant_stock: descuento atómico al confirmarse el pago
-- =====================================================
-- Mismo patrón que decrement_stock (migración 00005) pero sobre
-- product_variants — usado por los webhooks de Stripe/MercadoPago cuando
-- el item vendido tiene variant_id. El UPDATE dispara el trigger de arriba,
-- que deja products.stock_qty también al día automáticamente.
CREATE OR REPLACE FUNCTION public.decrement_variant_stock(p_variant_id UUID, p_qty INT)
RETURNS TABLE (id UUID, talla TEXT, stock_qty INT) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.product_variants
    SET stock_qty = GREATEST(public.product_variants.stock_qty - p_qty, 0)
    WHERE public.product_variants.id = p_variant_id
    RETURNING public.product_variants.id, public.product_variants.talla, public.product_variants.stock_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.decrement_variant_stock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_variant_stock(UUID, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_variant_stock(UUID, INT) TO service_role;


-- ============================================================
-- 00031_coupon_usage_and_verified_reviews.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 031: uso real de cupones + reseñas verificadas
-- =====================================================
-- Dos bugs encontrados en la auditoría por fases (Fase 2, 2026-07-29):
--
-- 1) coupons.used_count nunca se incrementaba en ningún lugar del código
--    (ni al validar, ni al crear la orden, sin trigger) — el límite
--    "Máx usos" de un cupón no se aplicaba nunca en la práctica, y el
--    panel admin mostraba el contador de usos siempre en 0.
--
-- 2) product_reviews.verified_purchase se mostraba como insignia "Compra
--    verificada" pero nunca se calculaba (default false, sin trigger) —
--    ninguna reseña se veía verificada jamás, ni siquiera las de clientes
--    reales.
-- =====================================================

-- =====================================================
-- 1) Cupones: registrar qué orden usó qué cupón + incrementar used_count
--    de forma atómica (con bloqueo de fila) dentro de la misma transacción
--    que crea la orden — cierra la ventana de carrera entre validar y usar.
-- =====================================================
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
    p_order JSONB,
    p_items JSONB,
    p_coupon_id UUID DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_max_uses INT;
    v_used_count INT;
BEGIN
    -- Si se aplicó un cupón, se revalida y se marca como usado con la fila
    -- bloqueada (FOR UPDATE): si dos checkouts concurrentes usan el mismo
    -- cupón de un solo uso, el segundo ve el used_count ya incrementado
    -- por el primero y falla aquí, en vez de que ambos pasen la validación
    -- de la API (que corrió antes, sin bloqueo) y se cuente doble.
    IF p_coupon_id IS NOT NULL THEN
        SELECT max_uses, used_count INTO v_max_uses, v_used_count
        FROM public.coupons WHERE id = p_coupon_id FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cupón no encontrado';
        END IF;
        IF v_max_uses IS NOT NULL AND v_used_count >= v_max_uses THEN
            RAISE EXCEPTION 'Este cupón ha alcanzado su límite de uso';
        END IF;

        UPDATE public.coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
    END IF;

    INSERT INTO public.orders (
        customer_email, customer_name, customer_phone, shipping_address,
        subtotal_cents, discount_cents, shipping_cents, total_cents,
        notes, status, payment_status, coupon_id
    )
    VALUES (
        p_order->>'customer_email',
        p_order->>'customer_name',
        p_order->>'customer_phone',
        p_order->'shipping_address',
        (p_order->>'subtotal_cents')::INT,
        COALESCE((p_order->>'discount_cents')::INT, 0),
        (p_order->>'shipping_cents')::INT,
        (p_order->>'total_cents')::INT,
        p_order->>'notes',
        COALESCE(p_order->>'status', 'pending'),
        COALESCE(p_order->>'payment_status', 'pending'),
        p_coupon_id
    )
    RETURNING * INTO v_order;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'create_order_with_items: p_items no puede estar vacio';
    END IF;

    INSERT INTO public.order_items (
        order_id, product_id, product_title, product_image,
        variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents
    )
    SELECT
        v_order.id,
        (item->>'product_id')::UUID,
        item->>'product_title',
        item->>'product_image',
        NULLIF(item->>'variant_id', '')::UUID,
        NULLIF(item->>'product_talla', ''),
        (item->>'qty')::INT,
        (item->>'price_cents')::INT,
        COALESCE((item->>'cost_cents')::INT, 0),
        COALESCE((item->>'discount_cents')::INT, 0),
        (item->>'total_cents')::INT
    FROM jsonb_array_elements(p_items) AS item;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2) Reseñas: calcular verified_purchase en el servidor, no confiar en lo
--    que mande el cliente. BEFORE INSERT sobrescribe NEW.verified_purchase
--    sin importar qué llegue en el insert.
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_review_verified_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    SELECT email INTO v_user_email FROM public.users WHERE id = NEW.user_id;

    NEW.verified_purchase := EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = NEW.product_id
          AND o.payment_status = 'paid'
          AND (o.user_id = NEW.user_id OR (v_user_email IS NOT NULL AND o.customer_email = v_user_email))
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_review_verified_purchase ON public.product_reviews;
CREATE TRIGGER trg_set_review_verified_purchase
    BEFORE INSERT ON public.product_reviews
    FOR EACH ROW EXECUTE FUNCTION public.set_review_verified_purchase();

-- Backfill: recalcula verified_purchase para las reseñas ya existentes.
UPDATE public.product_reviews r
SET verified_purchase = EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.users u ON u.id = r.user_id
    WHERE oi.product_id = r.product_id
      AND o.payment_status = 'paid'
      AND (o.user_id = r.user_id OR o.customer_email = u.email)
);


-- ============================================================
-- 00032_case_insensitive_order_email_match.sql
-- ============================================================
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


-- ============================================================
-- 00033_restock_subscriptions_per_variant.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 033: "avísame cuando vuelva" por talla
-- =====================================================
-- Mejora pedida por el usuario tras la Fase 2: restock_subscriptions era
-- solo a nivel de producto completo — si una talla se agotaba pero otras
-- seguían disponibles, el cliente no podía pedir aviso de esa talla
-- puntual (el botón "Notificarme" ni siquiera aparecía, porque
-- products.stock_qty ya reflejaba el total sumado de todas las tallas
-- desde la migración 00030, así que el producto se veía "en stock").
-- =====================================================

ALTER TABLE public.restock_subscriptions
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_restock_variant ON public.restock_subscriptions(variant_id);

-- El UNIQUE(product_id, email) original solo tenía sentido para productos
-- sin tallas. Se reemplaza por dos índices únicos parciales: uno para
-- "todo el producto" (variant_id NULL, el caso sin tallas) y otro por
-- talla puntual — así un mismo email puede suscribirse a varias tallas
-- distintas del mismo producto, sin duplicarse dentro de la misma talla.
ALTER TABLE public.restock_subscriptions DROP CONSTRAINT IF EXISTS restock_subscriptions_product_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS restock_subscriptions_product_email_no_variant_key
    ON public.restock_subscriptions(product_id, email) WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restock_subscriptions_product_variant_email_key
    ON public.restock_subscriptions(product_id, variant_id, email) WHERE variant_id IS NOT NULL;


-- ============================================================
-- 00034_prevent_role_self_escalation.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 034: bloquear escalación de privilegios
-- =====================================================
-- CRÍTICO, encontrado en la auditoría por fases (Fase 3, 2026-07-29):
-- la política RLS "Users can update own profile" (migración 00004) solo
-- valida que el usuario edite su propia fila (auth.uid() = id), pero no
-- restringe qué columnas puede cambiar. Como get_user_role() —usado en
-- TODAS las políticas RLS y en requireAuth() de cada ruta de API— lee
-- el rol directo de public.users.role, cualquier cliente autenticado
-- (rol 'viewer' por defecto) podía convertirse en admin con una sola
-- llamada autenticada directa a la API REST de Supabase:
--   PATCH /rest/v1/users?id=eq.<su-propio-id>  { "role": "admin" }
-- sin pasar por esta aplicación en absoluto, y sin ningún exploit
-- sofisticado. Con eso, cada requireAuth(['admin']) y cada política RLS
-- basada en get_user_role() lo habría tratado como administrador real.
--
-- Corrección: trigger BEFORE UPDATE que revierte NEW.role al valor
-- anterior si quien ejecuta el UPDATE no es ya administrador — sin
-- importar qué venga en el payload del cliente. No afecta el flujo
-- legítimo (mi-cuenta solo actualiza name/phone) ni la edición de rol
-- por un admin real desde /admin/usuarios (que sí puede cambiarlo).
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- auth.uid() es NULL cuando la conexión usa la service_role key (código
    -- de servidor de /admin/usuarios, ya protegido por requireAuth(['admin'])
    -- antes de llegar aquí) — RLS ya impide que cualquier otra conexión sin
    -- auth.uid() real llegue a este UPDATE (USING auth.uid() = id nunca es
    -- cierto si auth.uid() es NULL), así que tratarlo como confiable aquí no
    -- abre ninguna puerta nueva.
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF auth.uid() IS NOT NULL AND public.get_user_role(auth.uid()) IS DISTINCT FROM 'admin' THEN
            NEW.role := OLD.role;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON public.users;
CREATE TRIGGER trg_prevent_role_self_escalation
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

-- =====================================================
-- Hallazgo relacionado en la misma revisión: "Users can update own
-- reviews" (product_reviews) tampoco restringe columnas — un cliente
-- podía, tras crear su reseña, editarla directo por API para poner
-- `approved = true` (auto-aprobarse, saltando la moderación de admin) o
-- `verified_purchase = true` (sin haber comprado nada), incluso con el
-- trigger de verified_purchase de la migración 00031, que solo corría
-- en el INSERT — nunca en el UPDATE.
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_review_verified_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
BEGIN
    -- Un admin editando una reseña ajena (aprobar/rechazar desde el panel,
    -- vía api/reviews con getServiceSupabase() — auth.uid() es NULL ahí,
    -- ver comentario equivalente en prevent_role_self_escalation) no debe
    -- recalcularse ni bloquearse — solo se protege la edición que hace el
    -- propio autor de la reseña con su propia sesión.
    IF TG_OP = 'UPDATE' AND (auth.uid() IS NULL OR public.get_user_role(auth.uid()) = 'admin') THEN
        RETURN NEW;
    END IF;

    SELECT email INTO v_user_email FROM public.users WHERE id = NEW.user_id;

    NEW.verified_purchase := EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.product_id = NEW.product_id
          AND o.payment_status = 'paid'
          AND (o.user_id = NEW.user_id OR (v_user_email IS NOT NULL AND o.customer_email = v_user_email))
    );

    -- El autor de la reseña nunca puede auto-aprobarla ni revertirla de
    -- aprobada a pendiente por su cuenta — solo un admin (rama de arriba).
    IF TG_OP = 'UPDATE' THEN
        NEW.approved := OLD.approved;
    ELSE
        NEW.approved := false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_review_verified_purchase ON public.product_reviews;
CREATE TRIGGER trg_set_review_verified_purchase
    BEFORE INSERT OR UPDATE ON public.product_reviews
    FOR EACH ROW EXECUTE FUNCTION public.set_review_verified_purchase();


-- ============================================================
-- 00035_remove_unused_public_rls_policies.sql
-- ============================================================
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


-- ============================================================
-- 00036_restock_notification_queue.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 036: cola central de notificaciones de reabasto
-- =====================================================
-- Mejora pedida por el usuario (Fase 5, propuesta A.2): `sendRestockNotifications`
-- solo se disparaba desde /api/inventory/adjust ("Ingresar" en Inventario) —
-- cargue de pedidos por PDF, importación de Excel y "Cambios" también suben
-- stock pero nunca avisaban a nadie suscrito.
--
-- En vez de repetir la llamada en cada ruta de escritura (frágil: cualquier
-- nueva forma de subir stock que se agregue después se olvidaría del aviso),
-- se detecta la transición 0 → positivo con triggers a nivel de base de
-- datos — cubre TODA escritura de stock presente y futura, sin importar por
-- dónde entre. La cola queda pendiente de procesar por un cron
-- (api/cron/restock-notifications), que es quien de verdad envía el email
-- (Postgres no puede llamar a Resend directamente).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.restock_notification_queue (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id   UUID        REFERENCES public.product_variants(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_restock_queue_pending ON public.restock_notification_queue(processed_at) WHERE processed_at IS NULL;

ALTER TABLE public.restock_notification_queue ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo el cron (service_role) lee/escribe esta cola.

-- =====================================================
-- Variantes: transición 0 → positivo en una talla puntual
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_variant_restock_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stock_qty = 0 AND NEW.stock_qty > 0 THEN
        INSERT INTO public.restock_notification_queue (product_id, variant_id)
        VALUES (NEW.product_id, NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_variant_restock_notification ON public.product_variants;
CREATE TRIGGER trg_queue_variant_restock_notification
    AFTER UPDATE OF stock_qty ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.queue_variant_restock_notification();

-- =====================================================
-- Productos sin tallas: transición 0 → positivo del producto completo.
-- Se excluyen los productos CON variantes porque su products.stock_qty
-- cambia como efecto secundario del trigger de sincronización de la
-- migración 00030 (sumar variantes) — ya quedan cubiertos arriba, y
-- encolarlos también aquí duplicaría el aviso.
-- =====================================================
CREATE OR REPLACE FUNCTION public.queue_product_restock_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.stock_qty = 0 AND NEW.stock_qty > 0
       AND NOT EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = NEW.id) THEN
        INSERT INTO public.restock_notification_queue (product_id, variant_id)
        VALUES (NEW.id, NULL);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_product_restock_notification ON public.products;
CREATE TRIGGER trg_queue_product_restock_notification
    AFTER UPDATE OF stock_qty ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.queue_product_restock_notification();


-- ============================================================
-- 00037_abandoned_carts.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 037: recuperación de carrito abandonado
-- =====================================================
-- Mejora de la Fase 5 (propuesta C.12): el carrito solo vive en
-- localStorage del navegador — no hay ningún registro server-side de que
-- alguien empezó un checkout sin terminarlo. Esta tabla captura el email +
-- contenido del carrito en el momento en que el cliente lo escribe en el
-- checkout (antes de pagar), para poder mandarle un recordatorio si nunca
-- completa la compra.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email        TEXT        NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
    items        JSONB       NOT NULL,
    subtotal_cents INT       NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reminded_at  TIMESTAMPTZ,
    recovered_at TIMESTAMPTZ,
    UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_pending
    ON public.abandoned_carts(created_at)
    WHERE reminded_at IS NULL AND recovered_at IS NULL;

CREATE TRIGGER update_abandoned_carts_updated_at
    BEFORE UPDATE ON public.abandoned_carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
-- Sin políticas para anon/authenticated: se escribe/lee solo con
-- service_role (api/cart/track, api/orders al crear una orden, y el cron
-- de recordatorio) — el email y contenido del carrito de un cliente no
-- tiene por qué ser legible por nadie más vía la API pública de Supabase.


-- ============================================================
-- 00038_sistecredito_payment_method.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 038: método de pago "SisteCrédito"
-- =====================================================
-- Nuevo método de pago del negocio. Mismo patrón que 00020 (NU/QR):
-- se amplía el CHECK de payments.method, y se agrega la cuenta
-- correspondiente en accounts (payment_method es TEXT libre ahí,
-- no tiene CHECK, ver 00009).
-- =====================================================

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi', 'nu', 'qr', 'sistecredito'));

INSERT INTO public.accounts (name, payment_method, sort_order)
VALUES ('SisteCrédito', 'sistecredito', 7)
ON CONFLICT (name) DO NOTHING;

UPDATE public.accounts SET color = '#3B82F6' WHERE name = 'SisteCrédito' AND color IS NULL;


-- ============================================================
-- 00039_fix_soft_delete_reuse_and_variant_stock.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 039: libera SKU/slug/código al "eliminar" un
-- producto, borra tallas de verdad, y corrige el stock sincronizado para
-- no contar variantes inactivas
-- =====================================================
-- Bug reportado por el usuario (2026-08-09): creó por error la talla "S" de
-- un casco (debía ser "XS"), le dio "Eliminar" en Inventario → Tallas, el
-- sistema le confirmó la desactivación pero la fila SIGUIÓ apareciendo en la
-- tabla de tallas, y al intentar crear la talla/código correcto obtuvo
-- "ya existe una variante con esa talla o ese código de barras".
--
-- Causa raíz (dos bugs relacionados):
--
-- 1) `DELETE /api/product-variants/[id]` hace *soft delete*
--    (`active = false`) pero la fila sigue ocupando su lugar en las
--    restricciones UNIQUE de `talla` (por producto) y `barcode` — Postgres
--    no distingue `active` en un UNIQUE normal. Mismo problema, mismo
--    patrón, en `DELETE /api/products/[id]` (soft delete de producto): el
--    `sku`/`slug`/`barcode` del producto "eliminado" bloquea para siempre
--    crear un producto nuevo con ese mismo código.
--
-- 2) El trigger de sincronización de stock (migración 030) suma
--    `stock_qty` de TODAS las variantes de un producto sin filtrar por
--    `active` — si alguna vez una variante queda inactiva sin ser borrada
--    (posible hoy vía `PUT` con `active:false`, aunque la UI actual no lo
--    expone), su stock se sigue contando en `products.stock_qty`.
--
-- Fix:
-- A) `product_variants`: el código de la aplicación pasa a hacer *hard
--    delete* real (ver `api/product-variants/[id]/route.ts`), así que la
--    talla/código quedan libres de inmediato. Es seguro: toda tabla que
--    referencia `product_variants.id` usa `ON DELETE SET NULL` (con datos
--    ya "congelados" aparte: `order_items.product_talla`/`cost_cents`,
--    `inventory_movements.note`) o `ON DELETE CASCADE` sobre tablas
--    puramente operativas sin valor histórico (`restock_subscriptions`,
--    `restock_notification_queue`). El trigger de la migración 030 ya
--    reacciona a `DELETE` en `product_variants`, así que
--    `products.stock_qty` se recalcula solo.
-- B) `products`: NO se cambia a hard delete (el `ON DELETE CASCADE` de
--    `inventory_movements.product_id` sí borraría historial real de
--    movimientos). En su lugar, las restricciones UNIQUE globales de
--    `sku`/`slug`/`barcode` se reemplazan por índices únicos PARCIALES que
--    solo aplican `WHERE active = true` — un producto desactivado deja de
--    bloquear la reutilización de su código, sin perder su fila ni su
--    historial.
-- C) El trigger de sincronización de stock ahora filtra `active = true` en
--    la suma, por seguridad ante cualquier futura variante desactivada sin
--    borrar.
-- =====================================================

-- =====================================================
-- A) products: UNIQUE global -> índice único parcial (solo activos)
-- =====================================================
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class rel  ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = 'public'
          AND rel.relname = 'products'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = rel.oid
                AND a.attnum = c.conkey[1]
                AND a.attname IN ('sku', 'slug', 'barcode')
          )
    LOOP
        EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_active_key
    ON public.products (sku) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_active_key
    ON public.products (slug) WHERE active = true;
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_active_key
    ON public.products (barcode) WHERE active = true;

-- =====================================================
-- C) Trigger de stock: solo suma variantes activas
-- =====================================================
CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id AND active = true), 0
        )
        WHERE id = OLD.product_id;
        RETURN OLD;
    END IF;

    UPDATE public.products
    SET stock_qty = COALESCE(
        (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = NEW.product_id AND active = true), 0
    )
    WHERE id = NEW.product_id;

    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
        UPDATE public.products
        SET stock_qty = COALESCE(
            (SELECT SUM(stock_qty) FROM public.product_variants WHERE product_id = OLD.product_id AND active = true), 0
        )
        WHERE id = OLD.product_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_stock_from_variants
    AFTER INSERT OR UPDATE OF stock_qty, product_id, active OR DELETE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- Backfill: corrige de una vez cualquier producto que hoy tenga stock
-- contaminado por una variante inactiva. Se agrupa por TODAS las variantes
-- (activas o no) para no perderse el caso límite de un producto cuyas
-- variantes quedaron todas inactivas (debe terminar en stock 0), y se suma
-- solo el stock de las activas con FILTER.
UPDATE public.products p
SET stock_qty = sub.total_stock
FROM (
    SELECT pv.product_id, COALESCE(SUM(pv.stock_qty) FILTER (WHERE pv.active = true), 0) AS total_stock
    FROM public.product_variants pv
    GROUP BY pv.product_id
) sub
WHERE p.id = sub.product_id
  AND p.stock_qty IS DISTINCT FROM sub.total_stock;


-- ============================================================
-- 00040_products_deleted_at.sql
-- ============================================================
-- Distingue "producto eliminado" de "producto todavía sin publicar" —
-- hasta ahora ambos casos usaban el mismo campo products.active=false:
--   1) "Ingresar" (Inventario) crea productos nuevos con active=false a
--      propósito, para poder meter stock rápido sin foto/descripción y
--      publicarlos después (mismo patrón que los 191 productos migrados
--      del inventario físico).
--   2) "Eliminar" (Productos) también deja active=false, para conservar
--      el historial de ventas/movimientos del producto.
-- Sin forma de distinguirlos, Registrar Venta/Cambios no podían dejar de
-- mostrar los eliminados sin también esconder los recién ingresados que
-- sí se necesita poder vender el mismo día. deleted_at solo lo pone
-- "Eliminar"; "Ingresar" nunca lo toca.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);


-- ============================================================
-- 00041_cierres_arqueo_fisico.sql
-- ============================================================
-- Fase 4 del plan de mejoras integrales (docs/UNIFICACION_YJBMOTOCOM.md
-- sección 80.7): Cierres deja de ser un segundo lugar para volver a
-- escribir a mano los mismos totales que Mi Cuadre ya calcula solo, y pasa
-- a ser un arqueo físico de caja de verdad — se cuenta el efectivo real
-- de la caja y se compara contra lo que el sistema esperaba ese día.
--
-- cash_amount_cents ya existía y sigue existiendo: solo cambia su
-- significado (de "total de efectivo escrito a mano" a "efectivo contado
-- físicamente"), sin tocar la columna ni la suma de total_amount_cents.
--
-- Las dos columnas nuevas son una FOTO del momento en que se registra el
-- cierre, no un valor que se recalcula después — si se recalculara en vivo,
-- un cierre de hace un mes mostraría una diferencia distinta a la que
-- realmente hubo ese día si algo cambió en las órdenes después (mismo
-- criterio que product_snapshot en order_items). Nullable: los cierres ya
-- existentes, hechos antes de este cambio, se quedan sin diferencia
-- calculada — no hay forma honesta de reconstruirla retroactivamente.
ALTER TABLE public.daily_closures
  ADD COLUMN IF NOT EXISTS cash_expected_cents INT,
  ADD COLUMN IF NOT EXISTS cash_difference_cents INT;

COMMENT ON COLUMN public.daily_closures.cash_amount_cents IS
  'Efectivo contado físicamente en caja al hacer el arqueo (antes: total de efectivo escrito a mano)';
COMMENT ON COLUMN public.daily_closures.cash_expected_cents IS
  'Efectivo esperado según Ventas de mostrador de esa fecha, foto tomada al registrar el cierre (no se recalcula después)';
COMMENT ON COLUMN public.daily_closures.cash_difference_cents IS
  'cash_amount_cents - cash_expected_cents. Positivo = sobrante, negativo = faltante, null = cierre anterior a este cambio';


-- ============================================================
-- 00042_welcome_coupon.sql
-- ============================================================
-- Fase 5 del plan de mejoras integrales (docs/UNIFICACION_YJBMOTOCOM.md
-- sección 80.9): cupón de bienvenida automático al registrarse.
--
-- Hasta ahora coupons era solo para códigos compartidos (ej. "PROMO10"
-- usado por muchos clientes distintos, con max_uses global). El cupón de
-- bienvenida necesita quedar atado a UN cliente puntual — se logra con
-- user_id + max_uses=1, sin cambiar el comportamiento de los cupones
-- compartidos existentes (user_id queda NULL en esos, como siempre).
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_coupons_user_id ON public.coupons(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.coupons.user_id IS
  'Si no es null, este cupón es personal de un cliente (ej. bienvenida) — los cupones compartidos/promocionales lo dejan en null';


-- ============================================================
-- 00043_users_self_insert_policy.sql
-- ============================================================
-- Bug real encontrado al implementar la Fase 5 (cupón de bienvenida, docs/
-- UNIFICACION_YJBMOTOCOM.md sección 80.9): public.users tiene RLS activado
-- desde 00004_rls_policies.sql con políticas de SELECT propio, UPDATE
-- propio y ALL para admin — pero NUNCA una política de INSERT para que un
-- cliente recién registrado pueda crear su propia fila. El resultado real
-- (confirmado con dos registros de prueba reales): la cuenta de Supabase
-- Auth se crea bien, pero registro/page.tsx nunca logra insertar la fila
-- en public.users (RLS la bloquea en silencio, el código no revisaba el
-- error) — el cliente queda sin nombre/teléfono/rol guardados.
--
-- WITH CHECK exige role='viewer': un cliente nuevo solo puede crear SU
-- PROPIA fila (auth.uid() = id) y únicamente con el rol más bajo — cierra
-- de una vez el mismo hueco que 00034_prevent_role_self_escalation.sql
-- cerró para UPDATE (esa migración no cubre INSERT, que hasta ahora
-- tampoco existía como política).
CREATE POLICY "Users can insert own profile as viewer"
ON public.users FOR INSERT
WITH CHECK (auth.uid() = id AND role = 'viewer');


-- ============================================================
-- 00044_loyalty_points.sql
-- ============================================================
-- Fase 6 del plan de mejoras integrales (docs/UNIFICACION_YJBMOTOCOM.md
-- sección 80.10): programa de puntos de fidelización. 1 punto por cada
-- $1.000 COP gastado (online + mostrador), canjeables por cupón de
-- descuento (100 puntos = $1.000 COP), sin vencimiento.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS loyalty_points_balance INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    points      INT         NOT NULL, -- positivo = ganados, negativo = canjeados/ajuste
    type        TEXT        NOT NULL CHECK (type IN ('earn', 'redeem', 'adjustment')),
    order_id    UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
    coupon_id   UUID        REFERENCES public.coupons(id) ON DELETE SET NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_id ON public.loyalty_points_ledger(user_id);
-- Único: como máximo una entrada 'earn' por orden — es la guarda de
-- idempotencia real (además del chequeo explícito en la función) contra
-- reintentos de webhook que podrían intentar otorgar puntos dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_ledger_order_earn
  ON public.loyalty_points_ledger(order_id)
  WHERE type = 'earn' AND order_id IS NOT NULL;

ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own loyalty ledger"
ON public.loyalty_points_ledger FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all loyalty ledger"
ON public.loyalty_points_ledger FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- FUNCIÓN: award_loyalty_points
-- =====================================================
-- Otorga puntos por una compra. Idempotente por order_id (si ya se
-- otorgaron puntos por esa orden — ej. un webhook reintentado — no
-- duplica). SECURITY DEFINER: la llama el service role desde el servidor,
-- nunca directo desde el navegador.
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
    p_user_id UUID,
    p_points INT,
    p_order_id UUID,
    p_description TEXT
)
RETURNS void AS $$
BEGIN
    IF p_points <= 0 THEN
        RETURN;
    END IF;

    IF p_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.loyalty_points_ledger
        WHERE order_id = p_order_id AND type = 'earn'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.loyalty_points_ledger (user_id, points, type, order_id, description)
    VALUES (p_user_id, p_points, 'earn', p_order_id, p_description);

    UPDATE public.users SET loyalty_points_balance = loyalty_points_balance + p_points WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: redeem_loyalty_points
-- =====================================================
-- Canjea puntos (nunca deja el saldo negativo — bloqueo de fila con
-- FOR UPDATE para que dos canjes simultáneos del mismo cliente no puedan
-- ambos pasar la validación de saldo antes de que el otro descuente).
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
    p_user_id UUID,
    p_points INT,
    p_description TEXT,
    p_coupon_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_balance INT;
BEGIN
    IF p_points <= 0 THEN
        RAISE EXCEPTION 'La cantidad de puntos a canjear debe ser mayor a cero';
    END IF;

    SELECT loyalty_points_balance INTO v_balance FROM public.users WHERE id = p_user_id FOR UPDATE;

    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;

    IF v_balance < p_points THEN
        RAISE EXCEPTION 'Puntos insuficientes';
    END IF;

    INSERT INTO public.loyalty_points_ledger (user_id, points, type, coupon_id, description)
    VALUES (p_user_id, -p_points, 'redeem', p_coupon_id, p_description);

    UPDATE public.users SET loyalty_points_balance = loyalty_points_balance - p_points WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: redeem_loyalty_points_for_coupon
-- =====================================================
-- Crea el cupón Y canjea los puntos en una sola transacción: si
-- redeem_loyalty_points (llamada adentro) lanza excepción por saldo
-- insuficiente, Postgres revierte también el INSERT del cupón — nunca
-- queda un cupón huérfano sin sus puntos realmente descontados.
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points_for_coupon(
    p_user_id UUID,
    p_points INT,
    p_code TEXT,
    p_discount_cents INT,
    p_valid_until TIMESTAMPTZ
)
RETURNS public.coupons AS $$
DECLARE
    v_coupon public.coupons;
BEGIN
    INSERT INTO public.coupons (
        code, description, discount_type, discount_value,
        min_purchase_cents, max_uses, valid_from, valid_until, active, user_id
    ) VALUES (
        p_code, 'Cupón canjeado por puntos de fidelización', 'fixed', p_discount_cents,
        0, 1, NOW(), p_valid_until, true, p_user_id
    )
    RETURNING * INTO v_coupon;

    PERFORM public.redeem_loyalty_points(
        p_user_id, p_points, 'Canje de ' || p_points || ' puntos por cupón ' || p_code, v_coupon.id
    );

    RETURN v_coupon;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 00045_seller_monthly_goal.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 045: Meta mensual de ventas por vendedor
-- =====================================================
-- El usuario planea ofrecer un bono fijo si un vendedor llega a cierto
-- monto de ventas de mostrador en el mes (ej. $20.000.000 → $200.000 de
-- bono). Se guarda como configuración editable (no hardcodeado) para que
-- el admin pueda ajustar el monto de la meta y del bono sin tocar código,
-- igual que ya se hace con pos_commission_rates/fixed_monthly_expenses.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS seller_monthly_goal_cents BIGINT NOT NULL DEFAULT 2000000000,
    ADD COLUMN IF NOT EXISTS seller_goal_bonus_cents   BIGINT NOT NULL DEFAULT 20000000;


-- ============================================================
-- 00046_online_order_stock_reversal.sql
-- ============================================================
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


-- ============================================================
-- 00047_admin_readonly_role.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 047: rol "admin de solo lectura"
-- =====================================================
-- Nuevo rol `admin_readonly`: ve absolutamente todo el panel admin (igual
-- que `admin`), pero no puede crear/editar/eliminar nada en ningún lado.
--
-- La barrera real contra escrituras vive en el backend (requireAuth,
-- apps/web/src/lib/auth-helpers.ts) — se bloquea cualquier método que no
-- sea GET/HEAD antes de llegar a cada ruta, sin importar si esa ruta usa
-- el cliente de servicio (que bypasea RLS) o el cliente autenticado. Esta
-- migración solo agrega:
-- 1) El valor de rol en el CHECK de `public.users`.
-- 2) Una política RLS de SELECT universal (todas las tablas de `public`)
--    para que las páginas que leen Supabase directo desde el navegador
--    (admin/inventario, admin/productos, admin/cierres, admin/reportes,
--    admin/historial-mensual) también funcionen para este rol. Es
--    puramente aditiva — las políticas RLS son permisivas (OR entre sí),
--    así que no afloja ninguna política de escritura existente de
--    'admin'/'seller' en ninguna tabla.
--
-- El trigger anti-escalación de rol (migración 00034) ya protege este rol
-- nuevo sin cambios: `prevent_role_self_escalation()` solo exceptúa a
-- quien ya es 'admin' real, así que 'admin_readonly' nunca puede
-- auto-asignarse ningún rol, ni siquiera por un PATCH directo a la API
-- REST de Supabase que se salte esta aplicación por completo.
-- =====================================================

-- Se busca el nombre real del CHECK en vez de asumir el nombre por defecto
-- de Postgres (users_role_check) — más seguro si alguna migración anterior
-- lo hubiera recreado con otro nombre.
DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT con.conname INTO v_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%role%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', v_constraint_name);
    END IF;

    ALTER TABLE public.users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'seller', 'viewer', 'admin_readonly'));
END $$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "admin_readonly_can_view" ON public.%I',
            r.tablename
        );
        EXECUTE format(
            'CREATE POLICY "admin_readonly_can_view" ON public.%I FOR SELECT USING (public.get_user_role(auth.uid()) = ''admin_readonly'')',
            r.tablename
        );
    END LOOP;
END $$;


-- ============================================================
-- 00048_account_receivables.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 048: cuentas por cobrar por medio de pago
-- =====================================================
-- El usuario hizo arqueo físico de las 7 cuentas y pidió una forma de
-- anotar "dinero que nos deben" ligado a un medio de pago específico
-- (ej. fiados prometidos en Nequi, lo que debe SisteCrédito) — separado
-- del saldo real de la cuenta. Es puramente informativo: eliminar una
-- fila (cuando ya pagan) NUNCA toca `accounts.balance_cents` — ese dinero
-- entra por el camino normal (una venta, un ajuste manual), y en ese
-- momento se borra la fila porque ya dejó de estar "pendiente".
-- =====================================================

CREATE TABLE IF NOT EXISTS public.account_receivables (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    debtor_name   TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    debt_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
    notes         TEXT,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_receivables_account ON public.account_receivables(account_id);

-- Reutiliza la función genérica ya definida en 00001_initial_schema.sql,
-- usada por el resto de tablas del proyecto (accounts, supplier_invoices, etc.).
DROP TRIGGER IF EXISTS trg_update_account_receivables_updated_at ON public.account_receivables;
CREATE TRIGGER trg_update_account_receivables_updated_at
    BEFORE UPDATE ON public.account_receivables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.account_receivables ENABLE ROW LEVEL SECURITY;

-- Mismo patrón admin-only que accounts/account_movements (00019).
CREATE POLICY "Admins can manage account receivables"
ON public.account_receivables FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- La migración 00047 (rol de solo lectura) agregó su política de SELECT a
-- todas las tablas que existían en ese momento con un bucle que corrió una
-- sola vez — una tabla nueva como esta necesita la suya propia explícita.
CREATE POLICY "admin_readonly_can_view"
ON public.account_receivables FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');


-- ============================================================
-- 00049_fix_transfer_between_accounts_uuid.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 049: corregir "Transferir entre cuentas" (bug real preexistente)
-- =====================================================
-- Encontrado auditando el módulo Cuentas tras la ronda de cambios de
-- "Por Cobrar"/corrección de saldos (2026-08-26): el botón "Transferir"
-- llevaba dando 500 en TODOS los casos desde que existe (migración 00011,
-- Fase 4.4) — nunca se detectó porque las verificaciones anteriores solo
-- comprobaron que el botón/formulario existiera, no que una transferencia
-- real completara.
--
-- Causa: `transfer_between_accounts` tiene `SET search_path = public`
-- (necesario, es SECURITY DEFINER) y llama `uuid_generate_v4()` dentro del
-- cuerpo de la función — esa función vive en la extensión `uuid-ossp`, que
-- en este proyecto NO está en el esquema `public` (por eso el resto de
-- tablas que usan `uuid_generate_v4()` como DEFAULT de columna sí
-- funcionan: ahí se resuelve con el search_path normal de la conexión, no
-- con el restringido de esta función). Fix: usar `gen_random_uuid()`,
-- nativo de Postgres desde la versión 13 (vive en pg_catalog, siempre
-- resoluble sin importar el search_path), en vez de depender de la
-- extensión.
-- =====================================================

CREATE OR REPLACE FUNCTION public.transfer_between_accounts(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount_cents BIGINT,
    p_description TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_reference_id UUID := gen_random_uuid();
    v_from_balance BIGINT;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'El monto de la transferencia debe ser mayor a 0';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'La cuenta origen y la cuenta destino no pueden ser la misma';
    END IF;

    SELECT balance_cents INTO v_from_balance
    FROM public.accounts
    WHERE id = p_from_account_id
    FOR UPDATE;

    IF v_from_balance IS NULL THEN
        RAISE EXCEPTION 'Cuenta origen % no encontrada', p_from_account_id;
    END IF;

    IF v_from_balance < p_amount_cents THEN
        RAISE EXCEPTION 'Saldo insuficiente en la cuenta origen';
    END IF;

    UPDATE public.accounts SET balance_cents = balance_cents - p_amount_cents WHERE id = p_from_account_id;

    UPDATE public.accounts SET balance_cents = balance_cents + p_amount_cents WHERE id = p_to_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cuenta destino % no encontrada', p_to_account_id;
    END IF;

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_from_account_id, 'transfer_out', -p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type, created_by)
    VALUES (p_to_account_id, 'transfer_in', p_amount_cents, p_description, v_reference_id, 'transfer', p_created_by);

    RETURN v_reference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.transfer_between_accounts(UUID, UUID, BIGINT, TEXT, UUID) TO service_role;


-- ============================================================
-- 00050_sistecredito_margin.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 050: margen real de SisteCrédito en Cuentas
-- =====================================================
-- SisteCrédito retiene el dinero de una venta casi 2 meses y cobra a la
-- tienda una comisión real del 4%, pero la tienda le traslada al cliente
-- un recargo del 6% (el cliente no lo sabe, así se maneja siempre) — la
-- diferencia (2%) es ganancia real de la tienda que hoy no se refleja en
-- ningún lado: la venta se registra por el valor base (ej. $250.000), pero
-- lo que en verdad va a llegar de SisteCrédito, una vez ellos descuentan
-- su 4%, es base + 2%. Configurable (no fijo en código) por si el acuerdo
-- comercial con SisteCrédito cambia en el futuro.
-- =====================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sistecredito_margin_pct NUMERIC NOT NULL DEFAULT 2;


-- ============================================================
-- 00051_daily_notes.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 051: notas del día en Ventas del Día
-- =====================================================
-- El usuario pidió un espacio junto a "Gastos operativos del día" para
-- anotar algo que haya pasado ese día y quedar registrado (no es un gasto
-- ni un pendiente con fecha de vencimiento como la tabla `notes` — es un
-- registro libre ligado al día del cuadre, mismo patrón de `date` que ya
-- usa `operating_expenses`).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.daily_notes (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    text          TEXT        NOT NULL,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON public.daily_notes(date);

ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que operating_expenses: Registrar Venta/Ventas del Día
-- las usa tanto admin como vendedor.
DROP POLICY IF EXISTS "Admins and sellers can manage daily notes" ON public.daily_notes;
CREATE POLICY "Admins and sellers can manage daily notes"
ON public.daily_notes FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- Tabla nueva creada después de la migración 00047 (rol de solo lectura) —
-- necesita su propia política de SELECT explícita, igual que
-- account_receivables en la migración 00048.
CREATE POLICY "admin_readonly_can_view"
ON public.daily_notes FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');


-- ============================================================
-- 00052_loans_direction.sql
-- ============================================================
-- =====================================================
-- YJBMOTOCOM — Migración 052: dirección del préstamo (lo que nos deben / lo que debemos)
-- =====================================================
-- Hasta ahora `loans` solo registraba productos QUE PRESTAMOS a otro
-- almacén (lo que nos deben a nosotros). El usuario pidió también llevar
-- el caso inverso: productos que OTRO almacén nos prestó a nosotros (lo
-- que nosotros debemos), para poder verificar con datos propios si un
-- reclamo de otro local es real o se equivocaron de destinatario.
--
-- En vez de una tabla nueva (duplicaría columnas, RLS, API, UI y reportes
-- por una diferencia que es solo de sentido), se agrega una columna
-- `direction` a la misma tabla `loans` — incluso el ciclo de vida
-- (pendiente → devuelto/cobrado) es idéntico en ambos sentidos, la única
-- diferencia real es quién tiene el producto físico ahora mismo.
--
--   'lent'     = lo prestamos nosotros (comportamiento ya existente, valor
--                por defecto para no romper las filas ya guardadas)
--   'borrowed' = nos lo prestaron a nosotros (caso nuevo)
-- =====================================================

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'lent'
        CHECK (direction IN ('lent', 'borrowed'));

CREATE INDEX IF NOT EXISTS idx_loans_direction ON public.loans(direction);


-- =====================================================
-- YB MOTOCOM - Migraciones de Base de Datos (FIX)
-- =====================================================
-- Script que elimina objetos existentes antes de crearlos

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ELIMINAR TRIGGERS EXISTENTES
-- =====================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_categories_updated_at ON public.categories;
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
DROP TRIGGER IF EXISTS update_daily_closures_updated_at ON public.daily_closures;
DROP TRIGGER IF EXISTS update_coupons_updated_at ON public.coupons;
DROP TRIGGER IF EXISTS set_order_number ON public.orders;

-- =====================================================
-- TABLA: users (extiende auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'seller', 'viewer')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: categories
-- =====================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    sort_order INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: products
-- =====================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku TEXT UNIQUE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    cost_cents INT DEFAULT 0 CHECK (cost_cents >= 0),
    compare_at_price_cents INT CHECK (compare_at_price_cents >= 0),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    images TEXT[] DEFAULT '{}',
    stock_qty INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    low_stock_threshold INT DEFAULT 5,
    weight_grams INT,
    dimensions JSONB,
    tags TEXT[] DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(featured);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: inventory_movements
-- =====================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    qty INT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'sale', 'return')),
    note TEXT,
    reference_id UUID,
    reference_type TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);

-- =====================================================
-- TABLA: orders
-- =====================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE NOT NULL DEFAULT '',
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    shipping_address JSONB,
    billing_address JSONB,
    subtotal_cents INT NOT NULL DEFAULT 0,
    discount_cents INT NOT NULL DEFAULT 0,
    shipping_cents INT NOT NULL DEFAULT 0,
    tax_cents INT NOT NULL DEFAULT 0,
    total_cents INT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'COP',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'partial_refund')),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Función para generar número de orden
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'YBM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_title TEXT NOT NULL,
    product_sku TEXT,
    product_image TEXT,
    qty INT NOT NULL CHECK (qty > 0),
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    total_cents INT NOT NULL CHECK (total_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- =====================================================
-- TABLA: payments
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('stripe', 'mercadopago', 'manual', 'cash', 'transfer')),
    provider_payment_id TEXT,
    provider_session_id TEXT,
    amount_cents INT NOT NULL CHECK (amount_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'COP',
    method TEXT CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: daily_closures
-- =====================================================
CREATE TABLE IF NOT EXISTS public.daily_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    cash_amount_cents INT NOT NULL DEFAULT 0,
    card_amount_cents INT NOT NULL DEFAULT 0,
    transfer_amount_cents INT NOT NULL DEFAULT 0,
    wallet_amount_cents INT NOT NULL DEFAULT 0,
    other_amount_cents INT NOT NULL DEFAULT 0,
    total_amount_cents INT NOT NULL DEFAULT 0,
    orders_count INT NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_closures_date ON public.daily_closures(date);

CREATE TRIGGER update_daily_closures_updated_at
    BEFORE UPDATE ON public.daily_closures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: audit_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =====================================================
-- TABLA: coupons
-- =====================================================
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value INT NOT NULL CHECK (discount_value > 0),
    min_purchase_cents INT DEFAULT 0,
    max_uses INT,
    used_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins and sellers can manage products" ON public.products;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins and sellers can manage inventory" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins can manage daily closures" ON public.daily_closures;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;

-- Políticas para users
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Políticas para categories (lectura pública)
CREATE POLICY "Anyone can view active categories" ON public.categories
    FOR SELECT USING (active = true);

CREATE POLICY "Admins can manage categories" ON public.categories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para products (lectura pública)
CREATE POLICY "Anyone can view active products" ON public.products
    FOR SELECT USING (active = true);

CREATE POLICY "Admins and sellers can manage products" ON public.products
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para orders
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT USING (user_id = auth.uid() OR customer_email = (SELECT email FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Admins can view all orders" ON public.orders
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

CREATE POLICY "Anyone can create orders" ON public.orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update orders" ON public.orders
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para order_items
CREATE POLICY "Users can view own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND (user_id = auth.uid() OR
            EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))))
    );

CREATE POLICY "Anyone can create order items" ON public.order_items
    FOR INSERT WITH CHECK (true);

-- Políticas para inventory_movements
CREATE POLICY "Admins and sellers can manage inventory" ON public.inventory_movements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para daily_closures
CREATE POLICY "Admins can manage daily closures" ON public.daily_closures
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para audit_logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- Políticas para payments
CREATE POLICY "Users can view own payments" ON public.payments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND user_id = auth.uid())
    );

CREATE POLICY "Admins can manage payments" ON public.payments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'seller'))
    );

-- Políticas para coupons
CREATE POLICY "Anyone can view active coupons" ON public.coupons
    FOR SELECT USING (active = true);

CREATE POLICY "Admins can manage coupons" ON public.coupons
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- =====================================================
-- DATOS INICIALES (SEED)
-- =====================================================

-- Insertar categorías de ejemplo
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
    ('Cascos', 'cascos', 'Cascos de seguridad para motociclistas', 1),
    ('Guantes', 'guantes', 'Guantes de proteccion para conducir', 2),
    ('Chaquetas', 'chaquetas', 'Chaquetas y protecciones para el cuerpo', 3),
    ('Accesorios', 'accesorios', 'Accesorios varios para motos', 4),
    ('Repuestos', 'repuestos', 'Repuestos y partes para motos', 5),
    ('Lubricantes', 'lubricantes', 'Aceites y lubricantes', 6)
ON CONFLICT (slug) DO NOTHING;

-- Insertar productos de ejemplo
INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, featured, images)
SELECT
    'CASCO-001',
    'Casco Integral Pro Racing',
    'casco-integral-pro-racing',
    'Casco integral de alta seguridad con ventilacion avanzada. Certificacion DOT y ECE. Visor antirrayaduras incluido.',
    45000000,
    30000000,
    id,
    15,
    true,
    ARRAY['/images/products/casco-1.jpg']
FROM public.categories WHERE slug = 'cascos'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, featured, images)
SELECT
    'GUANTE-001',
    'Guantes Touring Premium',
    'guantes-touring-premium',
    'Guantes de cuero genuino con protecciones en nudillos. Impermeables y con pantalla tactil compatible.',
    12000000,
    8000000,
    id,
    25,
    true,
    ARRAY['/images/products/guantes-1.jpg']
FROM public.categories WHERE slug = 'guantes'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, images)
SELECT
    'CHAQ-001',
    'Chaqueta Moto Adventure',
    'chaqueta-moto-adventure',
    'Chaqueta textil con protecciones CE en codos y espalda. Forro termico removible.',
    28000000,
    18000000,
    id,
    10,
    ARRAY['/images/products/chaqueta-1.jpg']
FROM public.categories WHERE slug = 'chaquetas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, images)
SELECT
    'ACC-001',
    'Candado Alarma Premium',
    'candado-alarma-premium',
    'Candado de disco con alarma de 110dB. Resistente al agua y con bateria recargable.',
    8500000,
    5000000,
    id,
    30,
    ARRAY['/images/products/candado-1.jpg']
FROM public.categories WHERE slug = 'accesorios'
ON CONFLICT (slug) DO NOTHING;

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

-- =====================================================
-- FASE 8: Mejoras Opcionales - Wishlist, Reseñas, Cupones
-- =====================================================
-- Ejecutar este script en Supabase SQL Editor

-- =====================================================
-- TABLA: wishlists (Favoritos del usuario)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id);

-- RLS para wishlists
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wishlist"
ON wishlists FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own wishlist"
ON wishlists FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from own wishlist"
ON wishlists FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all wishlists"
ON wishlists FOR SELECT
USING (public.get_user_role() IN ('admin', 'seller'));

-- =====================================================
-- TABLA: product_reviews (Reseñas de productos)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT,
    verified_purchase BOOLEAN DEFAULT false,
    approved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON product_reviews(approved);

CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON public.product_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS para product_reviews
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved reviews"
ON product_reviews FOR SELECT
USING (approved = true);

CREATE POLICY "Users can read own reviews"
ON product_reviews FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create reviews"
ON product_reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
ON product_reviews FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admin can manage all reviews"
ON product_reviews FOR ALL
USING (public.get_user_role() IN ('admin'));

-- =====================================================
-- NOTA: La tabla coupons ya existe en la BD
-- Solo necesitamos agregar RLS si no tiene
-- =====================================================
-- Las políticas de coupons ya deberían existir en rls_policies.sql
-- Si no, ejecutar:
-- ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public read active coupons" ON coupons FOR SELECT USING (active = true);
-- CREATE POLICY "Admin manage coupons" ON coupons FOR ALL USING (public.get_user_role() IN ('admin'));

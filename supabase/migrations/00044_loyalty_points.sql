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

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

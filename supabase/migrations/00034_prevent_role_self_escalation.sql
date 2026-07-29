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

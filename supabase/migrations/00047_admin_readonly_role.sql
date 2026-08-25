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

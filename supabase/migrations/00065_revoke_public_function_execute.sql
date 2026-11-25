-- =====================================================
-- Migración 065: cerrar las funciones SECURITY DEFINER al rol público
-- =====================================================
-- Problema (docs/PENDIENTES.md sección 2.5, encontrado el 2026-11-21):
-- en Postgres toda función nueva queda ejecutable por PUBLIC, y Supabase
-- además le da permiso a `anon` y `authenticated`. Muchas migraciones solo
-- hicieron GRANT ... TO service_role, sin REVOKE. Como estas funciones son
-- SECURITY DEFINER (corren como su dueño, saltándose RLS), cualquiera con la
-- llave pública de la web podía llamar /rest/v1/rpc/<función> y, por
-- ejemplo, ajustar saldos o cancelar ventas sin iniciar sesión.
--
-- Qué hace: a TODA función SECURITY DEFINER del esquema public le quita el
-- permiso de ejecutar a PUBLIC, anon y authenticated, y deja solo
-- service_role (la llave del servidor, que es con la que la app las llama:
-- revisado el 2026-11-25, ninguna llamada .rpc sale del navegador ni usa la
-- sesión del usuario).
--
-- Excepciones (se dejan como están):
--   * get_user_role: la usan las políticas RLS (102 referencias), y RLS
--     corre con el rol del usuario, así que necesita poder ejecutarla.
--   * funciones de trigger y de event trigger: no se llaman por RPC (PostgREST
--     no las expone) y el permiso EXECUTE no aplica al dispararse.
--
-- Es idempotente (se puede correr dos veces) y no toca datos.
-- Si en el futuro se crea una función SECURITY DEFINER nueva, hay que hacerle
-- su propio REVOKE (o volver a correr este bloque).
-- =====================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND p.prosecdef
          AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
          AND p.proname <> 'get_user_role'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.firma);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.firma);
    END LOOP;
END $$;

-- Verificación: debe devolver SOLO get_user_role.
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sigue_abierta_para_anon
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;

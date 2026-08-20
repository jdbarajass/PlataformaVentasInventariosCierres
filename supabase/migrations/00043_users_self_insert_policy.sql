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

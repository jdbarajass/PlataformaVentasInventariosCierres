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

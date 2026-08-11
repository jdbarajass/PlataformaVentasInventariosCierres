-- Distingue "producto eliminado" de "producto todavía sin publicar" —
-- hasta ahora ambos casos usaban el mismo campo products.active=false:
--   1) "Ingresar" (Inventario) crea productos nuevos con active=false a
--      propósito, para poder meter stock rápido sin foto/descripción y
--      publicarlos después (mismo patrón que los 191 productos migrados
--      del inventario físico).
--   2) "Eliminar" (Productos) también deja active=false, para conservar
--      el historial de ventas/movimientos del producto.
-- Sin forma de distinguirlos, Registrar Venta/Cambios no podían dejar de
-- mostrar los eliminados sin también esconder los recién ingresados que
-- sí se necesita poder vender el mismo día. deleted_at solo lo pone
-- "Eliminar"; "Ingresar" nunca lo toca.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);

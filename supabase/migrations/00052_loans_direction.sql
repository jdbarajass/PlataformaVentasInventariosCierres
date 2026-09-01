-- =====================================================
-- YJBMOTOCOM — Migración 052: dirección del préstamo (lo que nos deben / lo que debemos)
-- =====================================================
-- Hasta ahora `loans` solo registraba productos QUE PRESTAMOS a otro
-- almacén (lo que nos deben a nosotros). El usuario pidió también llevar
-- el caso inverso: productos que OTRO almacén nos prestó a nosotros (lo
-- que nosotros debemos), para poder verificar con datos propios si un
-- reclamo de otro local es real o se equivocaron de destinatario.
--
-- En vez de una tabla nueva (duplicaría columnas, RLS, API, UI y reportes
-- por una diferencia que es solo de sentido), se agrega una columna
-- `direction` a la misma tabla `loans` — incluso el ciclo de vida
-- (pendiente → devuelto/cobrado) es idéntico en ambos sentidos, la única
-- diferencia real es quién tiene el producto físico ahora mismo.
--
--   'lent'     = lo prestamos nosotros (comportamiento ya existente, valor
--                por defecto para no romper las filas ya guardadas)
--   'borrowed' = nos lo prestaron a nosotros (caso nuevo)
-- =====================================================

ALTER TABLE public.loans
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'lent'
        CHECK (direction IN ('lent', 'borrowed'));

CREATE INDEX IF NOT EXISTS idx_loans_direction ON public.loans(direction);

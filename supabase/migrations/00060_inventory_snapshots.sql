-- =====================================================
-- YJBMOTOCOM — Migración 060: foto mensual del valor del inventario
-- =====================================================
-- docs/PLAN_CONTROL_FINANCIERO.md, Fase 3 (Finanzas → Año).
--
-- El valor del inventario (stock × costo) solo existe "hoy": el sistema no
-- guarda cuánto valía al cierre de cada mes. Esta tabla guarda una foto por
-- mes; la tarea diaria /api/cron/inventory-snapshot la va reemplazando, así
-- que la última del mes queda como el inventario de fin de mes. También se
-- puede tomar a mano desde Finanzas → Año.
--
-- Aditiva: tabla nueva, no toca nada existente. Las escrituras las hace solo
-- el servidor (service role); admin y admin de solo lectura pueden leer.
-- Debe correrse también en el Supabase de YBMOTOCOM.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    year         INT         NOT NULL,
    month        INT         NOT NULL CHECK (month BETWEEN 1 AND 12),
    -- Día (hora de Bogotá) en que se tomó la foto.
    as_of        DATE        NOT NULL,
    value_cents  BIGINT      NOT NULL CHECK (value_cents >= 0),
    units        INT         NOT NULL DEFAULT 0,
    refs         INT         NOT NULL DEFAULT 0,
    source       TEXT        NOT NULL DEFAULT 'cron' CHECK (source IN ('cron', 'manual')),
    created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    taken_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, month)
);

ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view inventory snapshots" ON public.inventory_snapshots;
CREATE POLICY "Admins can view inventory snapshots"
ON public.inventory_snapshots FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'admin_readonly'));

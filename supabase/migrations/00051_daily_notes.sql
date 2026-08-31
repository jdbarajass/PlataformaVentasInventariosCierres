-- =====================================================
-- YJBMOTOCOM — Migración 051: notas del día en Ventas del Día
-- =====================================================
-- El usuario pidió un espacio junto a "Gastos operativos del día" para
-- anotar algo que haya pasado ese día y quedar registrado (no es un gasto
-- ni un pendiente con fecha de vencimiento como la tabla `notes` — es un
-- registro libre ligado al día del cuadre, mismo patrón de `date` que ya
-- usa `operating_expenses`).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.daily_notes (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    date          DATE        NOT NULL DEFAULT CURRENT_DATE,
    text          TEXT        NOT NULL,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_date ON public.daily_notes(date);

ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que operating_expenses: Registrar Venta/Ventas del Día
-- las usa tanto admin como vendedor.
DROP POLICY IF EXISTS "Admins and sellers can manage daily notes" ON public.daily_notes;
CREATE POLICY "Admins and sellers can manage daily notes"
ON public.daily_notes FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- Tabla nueva creada después de la migración 00047 (rol de solo lectura) —
-- necesita su propia política de SELECT explícita, igual que
-- account_receivables en la migración 00048.
CREATE POLICY "admin_readonly_can_view"
ON public.daily_notes FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');

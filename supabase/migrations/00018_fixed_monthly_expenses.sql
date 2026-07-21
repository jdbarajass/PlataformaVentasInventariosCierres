-- =====================================================
-- YJBMOTOCOM — Migración 018: Gastos fijos mensuales (Configuración)
-- =====================================================
-- Aditivo: nueva columna en store_settings con los gastos fijos que el
-- software local guarda en su Configuración (Arriendo, Sueldo, Servicios,
-- Otros gastos, Días mes) — se usan para prorratear un "gasto diario fijo"
-- en la formula de Utilidad Real de /admin/reportes (gasto_diario =
-- total_gastos_fijos / dias_mes), igual que el local.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS fixed_monthly_expenses JSONB NOT NULL DEFAULT '{
        "arriendo_cents": 0,
        "sueldo_cents": 0,
        "servicios_cents": 0,
        "otros_gastos_cents": 0,
        "dias_mes": 30
    }'::jsonb;

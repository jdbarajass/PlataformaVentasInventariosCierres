-- =====================================================
-- YJBMOTOCOM — Migración 045: Meta mensual de ventas por vendedor
-- =====================================================
-- El usuario planea ofrecer un bono fijo si un vendedor llega a cierto
-- monto de ventas de mostrador en el mes (ej. $20.000.000 → $200.000 de
-- bono). Se guarda como configuración editable (no hardcodeado) para que
-- el admin pueda ajustar el monto de la meta y del bono sin tocar código,
-- igual que ya se hace con pos_commission_rates/fixed_monthly_expenses.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS seller_monthly_goal_cents BIGINT NOT NULL DEFAULT 2000000000,
    ADD COLUMN IF NOT EXISTS seller_goal_bonus_cents   BIGINT NOT NULL DEFAULT 20000000;

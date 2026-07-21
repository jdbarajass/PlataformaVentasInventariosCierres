-- =====================================================
-- YJBMOTOCOM — Migración 012: Tasas de comisión por método de pago (POS)
-- =====================================================
-- Aditivo: nueva columna en store_settings con valores por defecto en 0.
-- El admin podrá editar estos porcentajes desde Configuración más adelante
-- (sub-fase 3.8). Se usan para calcular payments.commission_cents en cada
-- venta de mostrador — la comisión se traslada al cliente como sobreprecio
-- y no afecta el cálculo de ganancia (ganancia = precio - costo), igual
-- que en el software local.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS pos_commission_rates JSONB NOT NULL DEFAULT '{
        "cash": 0,
        "transfer": 0,
        "wallet": 0,
        "nequi": 0,
        "daviplata": 0,
        "addi": 0,
        "card": 0,
        "other": 0
    }'::jsonb;

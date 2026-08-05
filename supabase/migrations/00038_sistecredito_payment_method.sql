-- =====================================================
-- YJBMOTOCOM — Migración 038: método de pago "SisteCrédito"
-- =====================================================
-- Nuevo método de pago del negocio. Mismo patrón que 00020 (NU/QR):
-- se amplía el CHECK de payments.method, y se agrega la cuenta
-- correspondiente en accounts (payment_method es TEXT libre ahí,
-- no tiene CHECK, ver 00009).
-- =====================================================

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi', 'nu', 'qr', 'sistecredito'));

INSERT INTO public.accounts (name, payment_method, sort_order)
VALUES ('SisteCrédito', 'sistecredito', 7)
ON CONFLICT (name) DO NOTHING;

UPDATE public.accounts SET color = '#3B82F6' WHERE name = 'SisteCrédito' AND color IS NULL;

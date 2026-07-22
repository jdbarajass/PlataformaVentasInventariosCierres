-- =====================================================
-- YJBMOTOCOM — Migración 020: métodos de pago NU y QR/Bancolombia
-- =====================================================
-- Hallazgo de la auditoría de fidelidad (docs/UNIFICACION_YJBMOTOCOM.md,
-- sección 12.2 / 13.2 ítem 4.2.2): el software local distingue 4 sub-tipos
-- de transferencia con comisión propia — NEQUI, NU, QR/Bancolombia,
-- DAVIPLATA — pero la nube solo tenía un genérico 'transfer' además de
-- 'nequi'/'daviplata'. Faltaban 'nu' y 'qr' como valores válidos de
-- payments.method (las 6 cuentas semilla de la migración 00009 ya usan
-- 'nu' y 'qr' como payment_method de cuenta, pero payments.method nunca
-- los aceptó). Se amplía el CHECK existente (nunca se restringe) para no
-- invalidar filas ya existentes.
-- =====================================================

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi', 'nu', 'qr'));

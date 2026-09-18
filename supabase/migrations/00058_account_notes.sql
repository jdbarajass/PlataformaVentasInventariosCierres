-- =====================================================
-- YJBMOTOCOM — Migración 058: notas/observaciones por cuenta
-- =====================================================
-- El saldo de cada cuenta (accounts.balance_cents) se mantiene fiel a lo
-- que en verdad ingresó por ese medio de pago (para que cuadre con el
-- Excel de control aparte), pero en la práctica el dinero a veces se
-- redistribuye entre cuentas fuera del sistema (ej. un pago a proveedor
-- que exige QR/Bancolombia se cubre en parte con plata que físicamente
-- está en Nu o Nequi). `notes` es un campo 100% informativo, editable
-- desde /admin/cuentas, para dejar constancia de esa distribución real
-- sin tocar `balance_cents` ni los movimientos.
-- =====================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS notes TEXT;

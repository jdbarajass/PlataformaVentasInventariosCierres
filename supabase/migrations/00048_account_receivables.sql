-- =====================================================
-- YJBMOTOCOM — Migración 048: cuentas por cobrar por medio de pago
-- =====================================================
-- El usuario hizo arqueo físico de las 7 cuentas y pidió una forma de
-- anotar "dinero que nos deben" ligado a un medio de pago específico
-- (ej. fiados prometidos en Nequi, lo que debe SisteCrédito) — separado
-- del saldo real de la cuenta. Es puramente informativo: eliminar una
-- fila (cuando ya pagan) NUNCA toca `accounts.balance_cents` — ese dinero
-- entra por el camino normal (una venta, un ajuste manual), y en ese
-- momento se borra la fila porque ya dejó de estar "pendiente".
-- =====================================================

CREATE TABLE IF NOT EXISTS public.account_receivables (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    debtor_name   TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    debt_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
    notes         TEXT,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_receivables_account ON public.account_receivables(account_id);

-- Reutiliza la función genérica ya definida en 00001_initial_schema.sql,
-- usada por el resto de tablas del proyecto (accounts, supplier_invoices, etc.).
DROP TRIGGER IF EXISTS trg_update_account_receivables_updated_at ON public.account_receivables;
CREATE TRIGGER trg_update_account_receivables_updated_at
    BEFORE UPDATE ON public.account_receivables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.account_receivables ENABLE ROW LEVEL SECURITY;

-- Mismo patrón admin-only que accounts/account_movements (00019).
CREATE POLICY "Admins can manage account receivables"
ON public.account_receivables FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- La migración 00047 (rol de solo lectura) agregó su política de SELECT a
-- todas las tablas que existían en ese momento con un bucle que corrió una
-- sola vez — una tabla nueva como esta necesita la suya propia explícita.
CREATE POLICY "admin_readonly_can_view"
ON public.account_receivables FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');

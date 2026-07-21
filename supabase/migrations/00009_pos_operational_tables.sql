-- =====================================================
-- YJBMOTOCOM — Migración 009: Tablas operativas del módulo YJBMOTOCOM (POS)
-- =====================================================
-- Replica en Postgres las tablas del software local que hoy no tienen
-- ningún equivalente en el admin: Cuentas, Facturas a proveedores, Fiado,
-- Préstamos, Notas y Presupuesto mensual. Tablas 100% nuevas — no tocan
-- ninguna tabla existente de la tienda online.
--
-- Arranca con datos vacíos salvo el seed de las 6 cuentas por defecto
-- (mismo seed que usa el software local), tal como acordamos: no se migra
-- historial del sistema local.
-- =====================================================

-- =====================================================
-- TABLA: accounts (Cuentas — saldo por medio de pago)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.accounts (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           TEXT        NOT NULL UNIQUE,
    payment_method TEXT        NOT NULL,
    balance_cents  BIGINT      NOT NULL DEFAULT 0,
    color          TEXT,
    active         BOOLEAN     NOT NULL DEFAULT true,
    sort_order     INT         NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.accounts (name, payment_method, sort_order)
VALUES
    ('Efectivo',          'cash',      1),
    ('Nequi',             'nequi',     2),
    ('QR/Bancolombia',    'qr',        3),
    ('NU',                'nu',        4),
    ('Daviplata',         'daviplata', 5),
    ('Addi',              'addi',      6)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TABLA: account_movements (Mov. Cuentas)
-- =====================================================
-- amount_cents con signo: positivo = entra dinero a la cuenta, negativo = sale.
CREATE TABLE IF NOT EXISTS public.account_movements (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    type          TEXT        NOT NULL CHECK (type IN (
                      'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
                      'operating_expense', 'expense_reversal', 'invoice_payment',
                      'credit_payment_reversal', 'sale_reversal'
                  )),
    amount_cents  BIGINT      NOT NULL,
    description   TEXT,
    reference_id  UUID,
    reference_type TEXT,
    created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_movements_account    ON public.account_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_account_movements_reference   ON public.account_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_account_movements_created_at  ON public.account_movements(created_at);

-- =====================================================
-- TABLA: account_closures (Cierres Cuentas — snapshot mensual)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.account_closures (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    year        INT         NOT NULL,
    month       INT         NOT NULL CHECK (month BETWEEN 1 AND 12),
    snapshot    JSONB       NOT NULL DEFAULT '{}',
    notes       TEXT,
    created_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, month)
);

-- =====================================================
-- TABLA: supplier_invoices (Facturas a proveedores)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    description   TEXT        NOT NULL,
    supplier      TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents >= 0),
    arrival_date  DATE,
    due_date      DATE,
    status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    notes         TEXT,
    paid_at       DATE,
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status   ON public.supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date ON public.supplier_invoices(due_date);

CREATE TRIGGER update_supplier_invoices_updated_at
    BEFORE UPDATE ON public.supplier_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: supplier_invoice_items (Facturas Items)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id        UUID        NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
    description       TEXT        NOT NULL,
    qty               INT         NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_price_cents  BIGINT      NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
    subtotal_cents    BIGINT      NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON public.supplier_invoice_items(invoice_id);

-- =====================================================
-- TABLA: supplier_invoice_payments (Abonos a facturas)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.supplier_invoice_payments (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id    UUID        NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    account_id    UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
    notes         TEXT,
    paid_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_payments_invoice ON public.supplier_invoice_payments(invoice_id);

-- =====================================================
-- TABLA: customer_credits (Fiado — clientes deudores/apartados)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_credits (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name       TEXT        NOT NULL,
    customer_id_number  TEXT,
    customer_phone      TEXT,
    description         TEXT,
    total_amount_cents  BIGINT      NOT NULL CHECK (total_amount_cents >= 0),
    status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_status ON public.customer_credits(status);

CREATE TRIGGER update_customer_credits_updated_at
    BEFORE UPDATE ON public.customer_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: customer_credit_payments (Abonos Fiado)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.customer_credit_payments (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id     UUID        NOT NULL REFERENCES public.customer_credits(id) ON DELETE CASCADE,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    notes         TEXT,
    paid_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_payments_credit ON public.customer_credit_payments(credit_id);

-- =====================================================
-- TABLA: loans (Préstamos a otros almacenes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.loans (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id     UUID        REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id     UUID        REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_title  TEXT        NOT NULL,
    warehouse      TEXT        NOT NULL,
    observations   TEXT,
    status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'returned', 'charged')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);

CREATE TRIGGER update_loans_updated_at
    BEFORE UPDATE ON public.loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: notes (Notas y Pendientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.notes (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        TEXT        NOT NULL CHECK (type IN ('task', 'restock')),
    text        TEXT        NOT NULL,
    completed   BOOLEAN     NOT NULL DEFAULT false,
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_completed ON public.notes(completed);
CREATE INDEX IF NOT EXISTS idx_notes_due_date  ON public.notes(due_date);

CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON public.notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLA: monthly_budgets (Presupuesto Mensual)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.monthly_budgets (
    id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    year                   INT         NOT NULL,
    month                  INT         NOT NULL CHECK (month BETWEEN 1 AND 12),
    category               TEXT        NOT NULL,
    budgeted_amount_cents  BIGINT      NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (year, month, category)
);

CREATE TRIGGER update_monthly_budgets_updated_at
    BEFORE UPDATE ON public.monthly_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- payments: comisión, subtipo de método y cuenta acreditada
-- =====================================================
-- Se agrega aquí (no en la migración 008) porque depende de que exista
-- la tabla accounts. Se amplían los CHECK existentes (nunca se restringen)
-- para no invalidar filas ya existentes: se agregan 'pos' como provider
-- (ventas de mostrador) y 'addi' como method.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS method_detail   TEXT,
    ADD COLUMN IF NOT EXISTS commission_cents INT NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
    ADD COLUMN IF NOT EXISTS account_id      UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_account ON public.payments(account_id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_provider_check
    CHECK (provider IN ('stripe', 'mercadopago', 'manual', 'cash', 'transfer', 'pos'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
    CHECK (method IN ('card', 'transfer', 'wallet', 'cash', 'nequi', 'daviplata', 'other', 'addi'));

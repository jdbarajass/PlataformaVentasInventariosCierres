-- =====================================================
-- YJBMOTOCOM — Migración 010: RLS para las tablas nuevas del módulo YJBMOTOCOM
-- =====================================================
-- Solo toca las tablas creadas en 00008/00009. No modifica ninguna política
-- existente de products/orders/order_items/payments/etc — a diferencia de
-- 00004_rls_policies.sql, aquí NO se hace DROP masivo de políticas, para no
-- arriesgar las políticas ya vivas en producción.
-- =====================================================

-- =====================================================
-- TABLA: product_variants
-- =====================================================
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view variants of active products" ON public.product_variants;
CREATE POLICY "Anyone can view variants of active products"
ON public.product_variants FOR SELECT
USING (
    active = true
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.active = true)
);

DROP POLICY IF EXISTS "Admins and sellers can manage variants" ON public.product_variants;
CREATE POLICY "Admins and sellers can manage variants"
ON public.product_variants FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: accounts
-- =====================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can view accounts" ON public.accounts;
CREATE POLICY "Admins and sellers can view accounts"
ON public.accounts FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins can manage accounts" ON public.accounts;
CREATE POLICY "Admins can manage accounts"
ON public.accounts FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: account_movements
-- =====================================================
ALTER TABLE public.account_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can view account movements" ON public.account_movements;
CREATE POLICY "Admins and sellers can view account movements"
ON public.account_movements FOR SELECT
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins and sellers can insert account movements" ON public.account_movements;
CREATE POLICY "Admins and sellers can insert account movements"
ON public.account_movements FOR INSERT
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

DROP POLICY IF EXISTS "Admins can update account movements" ON public.account_movements;
CREATE POLICY "Admins can update account movements"
ON public.account_movements FOR UPDATE
USING (public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admins can delete account movements" ON public.account_movements;
CREATE POLICY "Admins can delete account movements"
ON public.account_movements FOR DELETE
USING (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: account_closures
-- =====================================================
ALTER TABLE public.account_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage account closures" ON public.account_closures;
CREATE POLICY "Admins can manage account closures"
ON public.account_closures FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- TABLA: supplier_invoices
-- =====================================================
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoices" ON public.supplier_invoices;
CREATE POLICY "Admins and sellers can manage supplier invoices"
ON public.supplier_invoices FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: supplier_invoice_items
-- =====================================================
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoice items" ON public.supplier_invoice_items;
CREATE POLICY "Admins and sellers can manage supplier invoice items"
ON public.supplier_invoice_items FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: supplier_invoice_payments
-- =====================================================
ALTER TABLE public.supplier_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage supplier invoice payments" ON public.supplier_invoice_payments;
CREATE POLICY "Admins and sellers can manage supplier invoice payments"
ON public.supplier_invoice_payments FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: customer_credits (Fiado)
-- =====================================================
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage customer credits" ON public.customer_credits;
CREATE POLICY "Admins and sellers can manage customer credits"
ON public.customer_credits FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: customer_credit_payments
-- =====================================================
ALTER TABLE public.customer_credit_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage customer credit payments" ON public.customer_credit_payments;
CREATE POLICY "Admins and sellers can manage customer credit payments"
ON public.customer_credit_payments FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: loans (Préstamos)
-- =====================================================
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage loans" ON public.loans;
CREATE POLICY "Admins and sellers can manage loans"
ON public.loans FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: notes
-- =====================================================
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage notes" ON public.notes;
CREATE POLICY "Admins and sellers can manage notes"
ON public.notes FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- TABLA: monthly_budgets
-- =====================================================
ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and sellers can manage monthly budgets" ON public.monthly_budgets;
CREATE POLICY "Admins and sellers can manage monthly budgets"
ON public.monthly_budgets FOR ALL
USING (public.get_user_role(auth.uid()) IN ('admin', 'seller'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'seller'));

-- =====================================================
-- VERIFICACIÓN: listar políticas de las tablas nuevas
-- =====================================================
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'product_variants', 'accounts', 'account_movements', 'account_closures',
      'supplier_invoices', 'supplier_invoice_items', 'supplier_invoice_payments',
      'customer_credits', 'customer_credit_payments', 'loans', 'notes', 'monthly_budgets'
  )
ORDER BY tablename, policyname;

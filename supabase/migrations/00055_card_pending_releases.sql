-- =====================================================
-- YJBMOTOCOM — Migración 055: desembolso real de Datáfono (día hábil siguiente)
-- =====================================================
-- El datáfono (pagos con tarjeta débito/crédito, método 'card') no
-- deposita la venta el mismo día: el banco/adquirente consigna el valor
-- completo (sin cambios ni margen, a diferencia de SisteCrédito) el
-- SIGUIENTE DÍA HÁBIL, saltando fines de semana y festivos colombianos —
-- si el día hábil que tocaría es festivo ("puente"), se corre al
-- siguiente día hábil real.
--
-- Hasta ahora `create_pos_sale` acreditaba el valor a `accounts` de
-- inmediato para 'card', igual que efectivo — plata que en la práctica no
-- está disponible todavía. Este archivo, mismo patrón que 00053/00054
-- (SisteCrédito) pero con la regla de "día hábil siguiente" en vez de
-- "corte de mes":
--   1. Crea `colombian_holidays` (calendario de festivos 2024-2040, Ley
--      Emiliani + Pascua) y `next_business_day_co(date)`, la función que
--      calcula el próximo día hábil real saltando fines de semana Y
--      festivos.
--   2. Crea `card_pending_releases`: cada venta por datáfono queda aquí
--      (no en el saldo real) hasta su día hábil de liberación.
--   3. Cambia `create_pos_sale`/`edit_pos_sale`/`cancel_pos_sale` para que
--      un pago 'card' NUNCA toque `accounts.balance_cents` directamente —
--      solo inserta/borra la fila pendiente.
--   4. Agrega `release_card_pending()`, que un cron corre a diario a las
--      3pm hora Bogotá (idempotente: solo actúa sobre filas con
--      `release_date <= CURRENT_DATE` y `released_at IS NULL`) y ahí sí
--      acredita la cuenta, por el valor exacto (sin margen).
--
-- IMPORTANTE (decisión explícita del usuario, 2026-09-14): esto SOLO
-- aplica a ventas nuevas de aquí en adelante — a propósito, a diferencia
-- de 00053, este archivo NO incluye ningún bloque de backfill/migración
-- de ventas por datáfono ya existentes. Todo lo que ya está en
-- `accounts.balance_cents` por ventas de datáfono pasadas se queda
-- exactamente como está.
-- =====================================================

-- =====================================================
-- TABLA: colombian_holidays (calendario de festivos 2024-2040)
-- =====================================================
-- Calculado programáticamente (Ley Emiliani + algoritmo de Pascua de
-- Gauss/Meeus), verificado contra el calendario oficial 2024/2025/2026
-- publicado por el gobierno colombiano. Cubre 17 años -- si en el futuro
-- se necesita más rango, se agrega con una migración nueva que solo
-- inserte los años que falten (este archivo no necesita volver a correr).
CREATE TABLE IF NOT EXISTS public.colombian_holidays (
    holiday_date DATE PRIMARY KEY,
    name         TEXT NOT NULL
);

INSERT INTO public.colombian_holidays (holiday_date, name) VALUES
    ('2024-01-01', 'Año Nuevo'),
    ('2024-01-08', 'Reyes Magos'),
    ('2024-03-25', 'San José'),
    ('2024-03-28', 'Jueves Santo'),
    ('2024-03-29', 'Viernes Santo'),
    ('2024-05-01', 'Día del Trabajo'),
    ('2024-05-13', 'Ascensión del Señor'),
    ('2024-06-03', 'Corpus Christi'),
    ('2024-06-10', 'Sagrado Corazón'),
    ('2024-07-01', 'San Pedro y San Pablo'),
    ('2024-07-20', 'Independencia'),
    ('2024-08-07', 'Batalla de Boyacá'),
    ('2024-08-19', 'Asunción de la Virgen'),
    ('2024-10-14', 'Día de la Raza'),
    ('2024-11-04', 'Todos los Santos'),
    ('2024-11-11', 'Independencia de Cartagena'),
    ('2024-12-08', 'Inmaculada Concepción'),
    ('2024-12-25', 'Navidad'),
    ('2025-01-01', 'Año Nuevo'),
    ('2025-01-06', 'Reyes Magos'),
    ('2025-03-24', 'San José'),
    ('2025-04-17', 'Jueves Santo'),
    ('2025-04-18', 'Viernes Santo'),
    ('2025-05-01', 'Día del Trabajo'),
    ('2025-06-02', 'Ascensión del Señor'),
    ('2025-06-23', 'Corpus Christi'),
    ('2025-06-30', 'Sagrado Corazón'),
    ('2025-06-30', 'San Pedro y San Pablo'),
    ('2025-07-20', 'Independencia'),
    ('2025-08-07', 'Batalla de Boyacá'),
    ('2025-08-18', 'Asunción de la Virgen'),
    ('2025-10-13', 'Día de la Raza'),
    ('2025-11-03', 'Todos los Santos'),
    ('2025-11-17', 'Independencia de Cartagena'),
    ('2025-12-08', 'Inmaculada Concepción'),
    ('2025-12-25', 'Navidad'),
    ('2026-01-01', 'Año Nuevo'),
    ('2026-01-12', 'Reyes Magos'),
    ('2026-03-23', 'San José'),
    ('2026-04-02', 'Jueves Santo'),
    ('2026-04-03', 'Viernes Santo'),
    ('2026-05-01', 'Día del Trabajo'),
    ('2026-05-18', 'Ascensión del Señor'),
    ('2026-06-08', 'Corpus Christi'),
    ('2026-06-15', 'Sagrado Corazón'),
    ('2026-06-29', 'San Pedro y San Pablo'),
    ('2026-07-20', 'Independencia'),
    ('2026-08-07', 'Batalla de Boyacá'),
    ('2026-08-17', 'Asunción de la Virgen'),
    ('2026-10-12', 'Día de la Raza'),
    ('2026-11-02', 'Todos los Santos'),
    ('2026-11-16', 'Independencia de Cartagena'),
    ('2026-12-08', 'Inmaculada Concepción'),
    ('2026-12-25', 'Navidad'),
    ('2027-01-01', 'Año Nuevo'),
    ('2027-01-11', 'Reyes Magos'),
    ('2027-03-22', 'San José'),
    ('2027-03-25', 'Jueves Santo'),
    ('2027-03-26', 'Viernes Santo'),
    ('2027-05-01', 'Día del Trabajo'),
    ('2027-05-10', 'Ascensión del Señor'),
    ('2027-05-31', 'Corpus Christi'),
    ('2027-06-07', 'Sagrado Corazón'),
    ('2027-07-05', 'San Pedro y San Pablo'),
    ('2027-07-20', 'Independencia'),
    ('2027-08-07', 'Batalla de Boyacá'),
    ('2027-08-16', 'Asunción de la Virgen'),
    ('2027-10-18', 'Día de la Raza'),
    ('2027-11-01', 'Todos los Santos'),
    ('2027-11-15', 'Independencia de Cartagena'),
    ('2027-12-08', 'Inmaculada Concepción'),
    ('2027-12-25', 'Navidad'),
    ('2028-01-01', 'Año Nuevo'),
    ('2028-01-10', 'Reyes Magos'),
    ('2028-03-20', 'San José'),
    ('2028-04-13', 'Jueves Santo'),
    ('2028-04-14', 'Viernes Santo'),
    ('2028-05-01', 'Día del Trabajo'),
    ('2028-05-29', 'Ascensión del Señor'),
    ('2028-06-19', 'Corpus Christi'),
    ('2028-06-26', 'Sagrado Corazón'),
    ('2028-07-03', 'San Pedro y San Pablo'),
    ('2028-07-20', 'Independencia'),
    ('2028-08-07', 'Batalla de Boyacá'),
    ('2028-08-21', 'Asunción de la Virgen'),
    ('2028-10-16', 'Día de la Raza'),
    ('2028-11-06', 'Todos los Santos'),
    ('2028-11-13', 'Independencia de Cartagena'),
    ('2028-12-08', 'Inmaculada Concepción'),
    ('2028-12-25', 'Navidad'),
    ('2029-01-01', 'Año Nuevo'),
    ('2029-01-08', 'Reyes Magos'),
    ('2029-03-19', 'San José'),
    ('2029-03-29', 'Jueves Santo'),
    ('2029-03-30', 'Viernes Santo'),
    ('2029-05-01', 'Día del Trabajo'),
    ('2029-05-14', 'Ascensión del Señor'),
    ('2029-06-04', 'Corpus Christi'),
    ('2029-06-11', 'Sagrado Corazón'),
    ('2029-07-02', 'San Pedro y San Pablo'),
    ('2029-07-20', 'Independencia'),
    ('2029-08-07', 'Batalla de Boyacá'),
    ('2029-08-20', 'Asunción de la Virgen'),
    ('2029-10-15', 'Día de la Raza'),
    ('2029-11-05', 'Todos los Santos'),
    ('2029-11-12', 'Independencia de Cartagena'),
    ('2029-12-08', 'Inmaculada Concepción'),
    ('2029-12-25', 'Navidad'),
    ('2030-01-01', 'Año Nuevo'),
    ('2030-01-07', 'Reyes Magos'),
    ('2030-03-25', 'San José'),
    ('2030-04-18', 'Jueves Santo'),
    ('2030-04-19', 'Viernes Santo'),
    ('2030-05-01', 'Día del Trabajo'),
    ('2030-06-03', 'Ascensión del Señor'),
    ('2030-06-24', 'Corpus Christi'),
    ('2030-07-01', 'Sagrado Corazón'),
    ('2030-07-01', 'San Pedro y San Pablo'),
    ('2030-07-20', 'Independencia'),
    ('2030-08-07', 'Batalla de Boyacá'),
    ('2030-08-19', 'Asunción de la Virgen'),
    ('2030-10-14', 'Día de la Raza'),
    ('2030-11-04', 'Todos los Santos'),
    ('2030-11-11', 'Independencia de Cartagena'),
    ('2030-12-08', 'Inmaculada Concepción'),
    ('2030-12-25', 'Navidad'),
    ('2031-01-01', 'Año Nuevo'),
    ('2031-01-06', 'Reyes Magos'),
    ('2031-03-24', 'San José'),
    ('2031-04-10', 'Jueves Santo'),
    ('2031-04-11', 'Viernes Santo'),
    ('2031-05-01', 'Día del Trabajo'),
    ('2031-05-26', 'Ascensión del Señor'),
    ('2031-06-16', 'Corpus Christi'),
    ('2031-06-23', 'Sagrado Corazón'),
    ('2031-06-30', 'San Pedro y San Pablo'),
    ('2031-07-20', 'Independencia'),
    ('2031-08-07', 'Batalla de Boyacá'),
    ('2031-08-18', 'Asunción de la Virgen'),
    ('2031-10-13', 'Día de la Raza'),
    ('2031-11-03', 'Todos los Santos'),
    ('2031-11-17', 'Independencia de Cartagena'),
    ('2031-12-08', 'Inmaculada Concepción'),
    ('2031-12-25', 'Navidad'),
    ('2032-01-01', 'Año Nuevo'),
    ('2032-01-12', 'Reyes Magos'),
    ('2032-03-22', 'San José'),
    ('2032-03-25', 'Jueves Santo'),
    ('2032-03-26', 'Viernes Santo'),
    ('2032-05-01', 'Día del Trabajo'),
    ('2032-05-10', 'Ascensión del Señor'),
    ('2032-05-31', 'Corpus Christi'),
    ('2032-06-07', 'Sagrado Corazón'),
    ('2032-07-05', 'San Pedro y San Pablo'),
    ('2032-07-20', 'Independencia'),
    ('2032-08-07', 'Batalla de Boyacá'),
    ('2032-08-16', 'Asunción de la Virgen'),
    ('2032-10-18', 'Día de la Raza'),
    ('2032-11-01', 'Todos los Santos'),
    ('2032-11-15', 'Independencia de Cartagena'),
    ('2032-12-08', 'Inmaculada Concepción'),
    ('2032-12-25', 'Navidad'),
    ('2033-01-01', 'Año Nuevo'),
    ('2033-01-10', 'Reyes Magos'),
    ('2033-03-21', 'San José'),
    ('2033-04-14', 'Jueves Santo'),
    ('2033-04-15', 'Viernes Santo'),
    ('2033-05-01', 'Día del Trabajo'),
    ('2033-05-30', 'Ascensión del Señor'),
    ('2033-06-20', 'Corpus Christi'),
    ('2033-06-27', 'Sagrado Corazón'),
    ('2033-07-04', 'San Pedro y San Pablo'),
    ('2033-07-20', 'Independencia'),
    ('2033-08-07', 'Batalla de Boyacá'),
    ('2033-08-15', 'Asunción de la Virgen'),
    ('2033-10-17', 'Día de la Raza'),
    ('2033-11-07', 'Todos los Santos'),
    ('2033-11-14', 'Independencia de Cartagena'),
    ('2033-12-08', 'Inmaculada Concepción'),
    ('2033-12-25', 'Navidad'),
    ('2034-01-01', 'Año Nuevo'),
    ('2034-01-09', 'Reyes Magos'),
    ('2034-03-20', 'San José'),
    ('2034-04-06', 'Jueves Santo'),
    ('2034-04-07', 'Viernes Santo'),
    ('2034-05-01', 'Día del Trabajo'),
    ('2034-05-22', 'Ascensión del Señor'),
    ('2034-06-12', 'Corpus Christi'),
    ('2034-06-19', 'Sagrado Corazón'),
    ('2034-07-03', 'San Pedro y San Pablo'),
    ('2034-07-20', 'Independencia'),
    ('2034-08-07', 'Batalla de Boyacá'),
    ('2034-08-21', 'Asunción de la Virgen'),
    ('2034-10-16', 'Día de la Raza'),
    ('2034-11-06', 'Todos los Santos'),
    ('2034-11-13', 'Independencia de Cartagena'),
    ('2034-12-08', 'Inmaculada Concepción'),
    ('2034-12-25', 'Navidad'),
    ('2035-01-01', 'Año Nuevo'),
    ('2035-01-08', 'Reyes Magos'),
    ('2035-03-19', 'San José'),
    ('2035-03-22', 'Jueves Santo'),
    ('2035-03-23', 'Viernes Santo'),
    ('2035-05-01', 'Día del Trabajo'),
    ('2035-05-07', 'Ascensión del Señor'),
    ('2035-05-28', 'Corpus Christi'),
    ('2035-06-04', 'Sagrado Corazón'),
    ('2035-07-02', 'San Pedro y San Pablo'),
    ('2035-07-20', 'Independencia'),
    ('2035-08-07', 'Batalla de Boyacá'),
    ('2035-08-20', 'Asunción de la Virgen'),
    ('2035-10-15', 'Día de la Raza'),
    ('2035-11-05', 'Todos los Santos'),
    ('2035-11-12', 'Independencia de Cartagena'),
    ('2035-12-08', 'Inmaculada Concepción'),
    ('2035-12-25', 'Navidad'),
    ('2036-01-01', 'Año Nuevo'),
    ('2036-01-07', 'Reyes Magos'),
    ('2036-03-24', 'San José'),
    ('2036-04-10', 'Jueves Santo'),
    ('2036-04-11', 'Viernes Santo'),
    ('2036-05-01', 'Día del Trabajo'),
    ('2036-05-26', 'Ascensión del Señor'),
    ('2036-06-16', 'Corpus Christi'),
    ('2036-06-23', 'Sagrado Corazón'),
    ('2036-06-30', 'San Pedro y San Pablo'),
    ('2036-07-20', 'Independencia'),
    ('2036-08-07', 'Batalla de Boyacá'),
    ('2036-08-18', 'Asunción de la Virgen'),
    ('2036-10-13', 'Día de la Raza'),
    ('2036-11-03', 'Todos los Santos'),
    ('2036-11-17', 'Independencia de Cartagena'),
    ('2036-12-08', 'Inmaculada Concepción'),
    ('2036-12-25', 'Navidad'),
    ('2037-01-01', 'Año Nuevo'),
    ('2037-01-12', 'Reyes Magos'),
    ('2037-03-23', 'San José'),
    ('2037-04-02', 'Jueves Santo'),
    ('2037-04-03', 'Viernes Santo'),
    ('2037-05-01', 'Día del Trabajo'),
    ('2037-05-18', 'Ascensión del Señor'),
    ('2037-06-08', 'Corpus Christi'),
    ('2037-06-15', 'Sagrado Corazón'),
    ('2037-06-29', 'San Pedro y San Pablo'),
    ('2037-07-20', 'Independencia'),
    ('2037-08-07', 'Batalla de Boyacá'),
    ('2037-08-17', 'Asunción de la Virgen'),
    ('2037-10-12', 'Día de la Raza'),
    ('2037-11-02', 'Todos los Santos'),
    ('2037-11-16', 'Independencia de Cartagena'),
    ('2037-12-08', 'Inmaculada Concepción'),
    ('2037-12-25', 'Navidad'),
    ('2038-01-01', 'Año Nuevo'),
    ('2038-01-11', 'Reyes Magos'),
    ('2038-03-22', 'San José'),
    ('2038-04-22', 'Jueves Santo'),
    ('2038-04-23', 'Viernes Santo'),
    ('2038-05-01', 'Día del Trabajo'),
    ('2038-06-07', 'Ascensión del Señor'),
    ('2038-06-28', 'Corpus Christi'),
    ('2038-07-05', 'Sagrado Corazón'),
    ('2038-07-05', 'San Pedro y San Pablo'),
    ('2038-07-20', 'Independencia'),
    ('2038-08-07', 'Batalla de Boyacá'),
    ('2038-08-16', 'Asunción de la Virgen'),
    ('2038-10-18', 'Día de la Raza'),
    ('2038-11-01', 'Todos los Santos'),
    ('2038-11-15', 'Independencia de Cartagena'),
    ('2038-12-08', 'Inmaculada Concepción'),
    ('2038-12-25', 'Navidad'),
    ('2039-01-01', 'Año Nuevo'),
    ('2039-01-10', 'Reyes Magos'),
    ('2039-03-21', 'San José'),
    ('2039-04-07', 'Jueves Santo'),
    ('2039-04-08', 'Viernes Santo'),
    ('2039-05-01', 'Día del Trabajo'),
    ('2039-05-23', 'Ascensión del Señor'),
    ('2039-06-13', 'Corpus Christi'),
    ('2039-06-20', 'Sagrado Corazón'),
    ('2039-07-04', 'San Pedro y San Pablo'),
    ('2039-07-20', 'Independencia'),
    ('2039-08-07', 'Batalla de Boyacá'),
    ('2039-08-15', 'Asunción de la Virgen'),
    ('2039-10-17', 'Día de la Raza'),
    ('2039-11-07', 'Todos los Santos'),
    ('2039-11-14', 'Independencia de Cartagena'),
    ('2039-12-08', 'Inmaculada Concepción'),
    ('2039-12-25', 'Navidad'),
    ('2040-01-01', 'Año Nuevo'),
    ('2040-01-09', 'Reyes Magos'),
    ('2040-03-19', 'San José'),
    ('2040-03-29', 'Jueves Santo'),
    ('2040-03-30', 'Viernes Santo'),
    ('2040-05-01', 'Día del Trabajo'),
    ('2040-05-14', 'Ascensión del Señor'),
    ('2040-06-04', 'Corpus Christi'),
    ('2040-06-11', 'Sagrado Corazón'),
    ('2040-07-02', 'San Pedro y San Pablo'),
    ('2040-07-20', 'Independencia'),
    ('2040-08-07', 'Batalla de Boyacá'),
    ('2040-08-20', 'Asunción de la Virgen'),
    ('2040-10-15', 'Día de la Raza'),
    ('2040-11-05', 'Todos los Santos'),
    ('2040-11-12', 'Independencia de Cartagena'),
    ('2040-12-08', 'Inmaculada Concepción'),
    ('2040-12-25', 'Navidad')
-- 2025-06-30 (Sagrado Corazón / San Pedro y San Pablo) y 2030-07-01
-- (idem) coinciden en la misma fecha ese año -- basta con que el día
-- quede marcado como festivo una vez, no importa con qué nombre.
ON CONFLICT (holiday_date) DO NOTHING;

-- =====================================================
-- FUNCIÓN: next_business_day_co — próximo día hábil colombiano
-- =====================================================
-- Salta sábados, domingos y festivos de `colombian_holidays`. STABLE (no
-- IMMUTABLE) porque lee una tabla -- el resultado es estable dentro de una
-- misma consulta/transacción, que es todo lo que necesitan sus llamadores.
CREATE OR REPLACE FUNCTION public.next_business_day_co(p_date DATE)
RETURNS DATE AS $$
DECLARE
    v_next DATE := p_date + 1;
BEGIN
    LOOP
        IF EXTRACT(ISODOW FROM v_next) NOT IN (6, 7)
           AND NOT EXISTS (SELECT 1 FROM public.colombian_holidays WHERE holiday_date = v_next) THEN
            RETURN v_next;
        END IF;
        v_next := v_next + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- TABLA: card_pending_releases
-- =====================================================
CREATE TABLE IF NOT EXISTS public.card_pending_releases (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    order_id      UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    sale_date     DATE        NOT NULL,
    release_date  DATE        NOT NULL,
    released_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_pending_account ON public.card_pending_releases(account_id);
CREATE INDEX IF NOT EXISTS idx_card_pending_release_date ON public.card_pending_releases(release_date) WHERE released_at IS NULL;

ALTER TABLE public.card_pending_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage card pending releases"
ON public.card_pending_releases FOR ALL
USING (public.get_user_role(auth.uid()) = 'admin')
WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "admin_readonly_can_view_card_pending"
ON public.card_pending_releases FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin_readonly');

-- Nuevo tipo de movimiento para distinguir en el historial una liberación
-- automática de Datáfono de una venta o un ajuste manual cualquiera.
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_type_check;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_type_check
    CHECK (type IN (
        'sale', 'manual_adjustment', 'transfer_out', 'transfer_in',
        'operating_expense', 'expense_reversal', 'invoice_payment',
        'credit_payment', 'credit_payment_reversal', 'sale_reversal',
        'sistecredito_release', 'card_release'
    ));

-- =====================================================
-- FUNCIÓN: create_pos_sale (agrega manejo de 'card' junto al de 'sistecredito')
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_pos_sale(
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE,
    p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item JSONB;
    v_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_margin_pct NUMERIC;
    v_sale_date DATE;
BEGIN
    INSERT INTO public.orders (
        user_id, customer_email, customer_name, customer_phone,
        subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
        status, payment_status, notes, metadata, channel, seller_id, created_at
    )
    VALUES (
        NULLIF(p_order->>'user_id', '')::UUID,
        COALESCE(NULLIF(p_order->>'customer_email', ''), 'mostrador@yjbmotocom.com'),
        NULLIF(p_order->>'customer_name', ''),
        NULLIF(p_order->>'customer_phone', ''),
        COALESCE((p_order->>'subtotal_cents')::INT, 0),
        COALESCE((p_order->>'discount_cents')::INT, 0),
        0,
        0,
        COALESCE((p_order->>'total_cents')::INT, 0),
        'delivered',
        'paid',
        NULLIF(p_order->>'notes', ''),
        COALESCE(p_order->'metadata', '{}'::jsonb),
        'pos',
        NULLIF(p_order->>'seller_id', '')::UUID,
        COALESCE(p_created_at, NOW())
    )
    RETURNING * INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_qty := (v_item->>'qty')::INT;
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;

            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock
            FROM public.products WHERE id = v_product_id FOR UPDATE;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;

            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            v_order.id, v_product_id, v_item->>'product_title', NULLIF(v_item->>'product_sku', ''),
            NULLIF(v_item->>'product_image', ''), v_variant_id, NULLIF(v_item->>'product_talla', ''),
            v_qty, (v_item->>'price_cents')::INT, COALESCE((v_item->>'cost_cents')::INT, 0),
            COALESCE((v_item->>'discount_cents')::INT, 0), (v_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type, created_by
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    v_sale_date := (v_order.created_at AT TIME ZONE 'America/Bogota')::date;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            v_order.id, 'pos', v_amount_cents, v_payment->>'method',
            NULLIF(v_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL AND v_payment->>'method' = 'sistecredito' THEN
            -- No se acredita el saldo real todavía -- SisteCrédito paga con
            -- corte de mes calendario, dos meses después (ver 00054).
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents, COALESCE(v_margin_pct, 0),
                v_sale_date,
                (date_trunc('month', v_sale_date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL AND v_payment->>'method' = 'card' THEN
            -- No se acredita el saldo real todavía -- el datáfono consigna
            -- el valor completo el siguiente día hábil (ver 00055).
            INSERT INTO public.card_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, v_order.id, v_amount_cents,
                v_sale_date, public.next_business_day_co(v_sale_date)
            );
        ELSIF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type, created_by
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador ' || v_order.order_number,
                v_order.id, 'order', NULLIF(p_order->>'seller_id', '')::UUID
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: edit_pos_sale (agrega manejo de 'card' junto al de 'sistecredito')
-- =====================================================
CREATE OR REPLACE FUNCTION public.edit_pos_sale(
    p_order_id UUID,
    p_order JSONB,
    p_items JSONB,
    p_payments JSONB,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.orders AS $$
DECLARE
    v_order public.orders;
    v_item RECORD;
    v_payment RECORD;
    v_new_item JSONB;
    v_new_payment JSONB;
    v_product_id UUID;
    v_variant_id UUID;
    v_qty INT;
    v_current_stock INT;
    v_actual_deduct INT;
    v_account_id UUID;
    v_amount_cents BIGINT;
    v_margin_pct NUMERIC;
    v_sale_date DATE;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND channel = 'pos' FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL AND v_payment.method = 'sistecredito' THEN
            -- Nunca llegó a tocar el saldo real -- solo borrar la fila
            -- pendiente que se creó para este pago.
            DELETE FROM public.sistecredito_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'card' THEN
            DELETE FROM public.card_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa por edicion de venta de mostrador', p_order_id, 'order');
        END IF;
    END LOOP;

    DELETE FROM public.payments WHERE order_id = p_order_id;

    UPDATE public.orders
    SET customer_name = NULLIF(p_order->>'customer_name', ''),
        customer_phone = NULLIF(p_order->>'customer_phone', ''),
        notes = NULLIF(p_order->>'notes', ''),
        subtotal_cents = COALESCE((p_order->>'subtotal_cents')::INT, 0),
        discount_cents = COALESCE((p_order->>'discount_cents')::INT, 0),
        total_cents = COALESCE((p_order->>'total_cents')::INT, 0),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := NULLIF(v_new_item->>'product_id', '')::UUID;
        v_variant_id := NULLIF(v_new_item->>'variant_id', '')::UUID;
        v_qty := (v_new_item->>'qty')::INT;
        v_actual_deduct := NULL;

        IF v_variant_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Variante % no encontrada', v_variant_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para la variante %', v_variant_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.product_variants SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_variant_id;
        ELSIF v_product_id IS NOT NULL THEN
            SELECT stock_qty INTO v_current_stock FROM public.products WHERE id = v_product_id FOR UPDATE;
            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado', v_product_id;
            END IF;
            IF v_current_stock < v_qty AND NOT p_force THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
            END IF;
            v_actual_deduct := LEAST(v_qty, v_current_stock);
            UPDATE public.products SET stock_qty = GREATEST(0, stock_qty - v_qty) WHERE id = v_product_id;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_title, product_sku, product_image,
            variant_id, product_talla, qty, price_cents, cost_cents, discount_cents, total_cents,
            stock_deducted
        ) VALUES (
            p_order_id, v_product_id, v_new_item->>'product_title', NULLIF(v_new_item->>'product_sku', ''),
            NULLIF(v_new_item->>'product_image', ''), v_variant_id, NULLIF(v_new_item->>'product_talla', ''),
            v_qty, (v_new_item->>'price_cents')::INT, COALESCE((v_new_item->>'cost_cents')::INT, 0),
            COALESCE((v_new_item->>'discount_cents')::INT, 0), (v_new_item->>'total_cents')::INT,
            v_actual_deduct
        );

        IF v_product_id IS NOT NULL OR v_variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (
                product_id, variant_id, qty, type, note, reference_id, reference_type
            ) VALUES (
                v_product_id, v_variant_id, -v_actual_deduct, 'sale', 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    v_sale_date := (v_order.created_at AT TIME ZONE 'America/Bogota')::date;

    FOR v_new_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        v_account_id := NULLIF(v_new_payment->>'account_id', '')::UUID;
        v_amount_cents := (v_new_payment->>'amount_cents')::BIGINT;

        INSERT INTO public.payments (
            order_id, provider, amount_cents, method, method_detail, status, commission_cents, account_id
        ) VALUES (
            p_order_id, 'pos', v_amount_cents, v_new_payment->>'method',
            NULLIF(v_new_payment->>'method_detail', ''), 'succeeded',
            COALESCE((v_new_payment->>'commission_cents')::INT, 0), v_account_id
        );

        IF v_account_id IS NOT NULL AND v_new_payment->>'method' = 'sistecredito' THEN
            SELECT sistecredito_margin_pct INTO v_margin_pct FROM public.store_settings WHERE id = 1;

            INSERT INTO public.sistecredito_pending_releases (
                account_id, order_id, base_amount_cents, margin_pct, sale_date, release_date
            ) VALUES (
                v_account_id, p_order_id, v_amount_cents, COALESCE(v_margin_pct, 0),
                v_sale_date,
                (date_trunc('month', v_sale_date) + interval '2 months')::date
            );
        ELSIF v_account_id IS NOT NULL AND v_new_payment->>'method' = 'card' THEN
            INSERT INTO public.card_pending_releases (
                account_id, order_id, amount_cents, sale_date, release_date
            ) VALUES (
                v_account_id, p_order_id, v_amount_cents,
                v_sale_date, public.next_business_day_co(v_sale_date)
            );
        ELSIF v_account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents + v_amount_cents WHERE id = v_account_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cuenta % no encontrada', v_account_id;
            END IF;

            INSERT INTO public.account_movements (
                account_id, type, amount_cents, description, reference_id, reference_type
            ) VALUES (
                v_account_id, 'sale', v_amount_cents, 'Venta de mostrador editada ' || v_order.order_number,
                p_order_id, 'order'
            );
        END IF;
    END LOOP;

    RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: cancel_pos_sale (agrega manejo de 'card' junto al de 'sistecredito')
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_pos_sale(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND channel = 'pos') THEN
        RAISE EXCEPTION 'Venta de mostrador % no encontrada', p_order_id;
    END IF;

    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        IF v_item.variant_id IS NOT NULL THEN
            UPDATE public.product_variants SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.variant_id;
        ELSIF v_item.product_id IS NOT NULL THEN
            UPDATE public.products SET stock_qty = stock_qty + COALESCE(v_item.stock_deducted, v_item.qty) WHERE id = v_item.product_id;
        END IF;

        IF v_item.product_id IS NOT NULL OR v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movements (product_id, variant_id, qty, type, note, reference_id, reference_type)
            VALUES (v_item.product_id, v_item.variant_id, COALESCE(v_item.stock_deducted, v_item.qty), 'return', 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    FOR v_payment IN SELECT * FROM public.payments WHERE order_id = p_order_id
    LOOP
        IF v_payment.account_id IS NOT NULL AND v_payment.method = 'sistecredito' THEN
            DELETE FROM public.sistecredito_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL AND v_payment.method = 'card' THEN
            DELETE FROM public.card_pending_releases
            WHERE order_id = p_order_id AND account_id = v_payment.account_id AND released_at IS NULL;
        ELSIF v_payment.account_id IS NOT NULL THEN
            UPDATE public.accounts SET balance_cents = balance_cents - v_payment.amount_cents WHERE id = v_payment.account_id;

            INSERT INTO public.account_movements (account_id, type, amount_cents, description, reference_id, reference_type)
            VALUES (v_payment.account_id, 'sale_reversal', -v_payment.amount_cents, 'Reversa de venta de mostrador cancelada', p_order_id, 'order');
        END IF;
    END LOOP;

    UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- FUNCIÓN: release_card_pending
-- =====================================================
-- Idempotente: solo toca filas vencidas (release_date <= hoy) y sin
-- liberar todavía. Corre desde un cron diario a las 3pm hora Bogotá
-- (ver vercel.json) -- si un día falla o no corre, el día siguiente
-- recoge lo pendiente igual. Sin margen: se acredita el valor exacto de
-- la venta, a diferencia de release_sistecredito_pending().
CREATE OR REPLACE FUNCTION public.release_card_pending()
RETURNS JSONB AS $$
DECLARE
    v_row RECORD;
    v_released_count INT := 0;
    v_released_total BIGINT := 0;
BEGIN
    FOR v_row IN
        SELECT * FROM public.card_pending_releases
        WHERE released_at IS NULL AND release_date <= CURRENT_DATE
        ORDER BY sale_date
        FOR UPDATE
    LOOP
        UPDATE public.accounts SET balance_cents = balance_cents + v_row.amount_cents WHERE id = v_row.account_id;

        INSERT INTO public.account_movements (
            account_id, type, amount_cents, description, reference_id, reference_type
        ) VALUES (
            v_row.account_id, 'card_release', v_row.amount_cents,
            'Desembolso Datáfono — venta del ' || to_char(v_row.sale_date, 'DD/MM/YYYY'),
            v_row.order_id, 'card_release'
        );

        UPDATE public.card_pending_releases SET released_at = NOW() WHERE id = v_row.id;

        v_released_count := v_released_count + 1;
        v_released_total := v_released_total + v_row.amount_cents;
    END LOOP;

    RETURN jsonb_build_object('released_count', v_released_count, 'released_total_cents', v_released_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

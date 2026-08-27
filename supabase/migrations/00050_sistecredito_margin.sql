-- =====================================================
-- YJBMOTOCOM — Migración 050: margen real de SisteCrédito en Cuentas
-- =====================================================
-- SisteCrédito retiene el dinero de una venta casi 2 meses y cobra a la
-- tienda una comisión real del 4%, pero la tienda le traslada al cliente
-- un recargo del 6% (el cliente no lo sabe, así se maneja siempre) — la
-- diferencia (2%) es ganancia real de la tienda que hoy no se refleja en
-- ningún lado: la venta se registra por el valor base (ej. $250.000), pero
-- lo que en verdad va a llegar de SisteCrédito, una vez ellos descuentan
-- su 4%, es base + 2%. Configurable (no fijo en código) por si el acuerdo
-- comercial con SisteCrédito cambia en el futuro.
-- =====================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sistecredito_margin_pct NUMERIC NOT NULL DEFAULT 2;

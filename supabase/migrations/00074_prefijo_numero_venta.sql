-- =====================================================
-- Migración 074: prefijo del número de venta por tienda
-- =====================================================
-- Igual en YJBMOTOCOM y YBMOTOCOM (2026-11-27). La función que numera los
-- pedidos (migración 00001) tenía 'YJBM-' fijo, así que las ventas de
-- YBMOTOCOM salían como YJBM-AAAAMMDD-NNNN. Ahora el prefijo se guarda en
-- store_settings.order_prefix:
--   * YJBMOTOCOM sigue con 'YJBM' (valor por defecto, nada cambia).
--   * YBMOTOCOM pasa a 'YBM' (se reconoce por store_settings.store_name).
--
-- Solo afecta a los pedidos NUEVOS. Los que ya existen conservan su número
-- (los recibos ya entregados lo tienen impreso). No toca ventas, inventario
-- ni plata.
--
-- Idempotente: se puede correr más de una vez.
-- =====================================================

ALTER TABLE public.store_settings
    ADD COLUMN IF NOT EXISTS order_prefix TEXT NOT NULL DEFAULT 'YJBM';

ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_order_prefix_check;
ALTER TABLE public.store_settings
    ADD CONSTRAINT store_settings_order_prefix_check CHECK (order_prefix ~ '^[A-Z0-9]{2,8}$');

UPDATE public.store_settings
    SET order_prefix = 'YBM'
    WHERE store_name = 'YBMOTOCOM' AND order_prefix = 'YJBM';

-- SECURITY DEFINER: el trigger lee store_settings sin depender de los
-- permisos de quien crea el pedido.
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    SELECT order_prefix INTO v_prefix FROM public.store_settings WHERE id = 1;
    NEW.order_number = COALESCE(NULLIF(v_prefix, ''), 'YJBM') || '-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                       LPAD(CAST(FLOOR(RANDOM() * 10000) AS TEXT), 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: YJBMOTOCOM debe decir YJBM y YBMOTOCOM, YBM.
-- SELECT store_name, order_prefix FROM public.store_settings;

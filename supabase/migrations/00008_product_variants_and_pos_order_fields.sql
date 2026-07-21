-- =====================================================
-- YJBMOTOCOM — Migración 008: Variantes de producto y campos POS en órdenes
-- =====================================================
-- Parte de la unificación con el software local de ventas (VENTAS_YJBMOTOCOM).
-- 100% ADITIVA: no modifica ni elimina ninguna columna/tabla existente que
-- use hoy el catálogo, el carrito o el checkout online. Un producto que no
-- tenga filas en product_variants sigue funcionando exactamente igual que
-- hoy (stock_qty/cost_cents de products siguen siendo la fuente de verdad).
--
-- Ver docs/UNIFICACION_YJBMOTOCOM.md para el contexto completo del proyecto.
-- =====================================================

-- =====================================================
-- TABLA: product_variants (variantes por talla / código de barras)
-- =====================================================
-- Equivale a una fila de la tabla "inventario" del software local: cada
-- variante tiene su propio stock, costo y código de barras. Un producto
-- sin necesidad de tallas (ej. la mayoría de accesorios) simplemente no
-- tiene variantes y sigue usando products.stock_qty como hoy.
CREATE TABLE IF NOT EXISTS public.product_variants (
    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id           UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    talla                TEXT,
    sku                  TEXT        UNIQUE,
    barcode              TEXT        UNIQUE,
    stock_qty            INT         NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    low_stock_threshold  INT         NOT NULL DEFAULT 5,
    cost_cents           INT         NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    active               BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, talla)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON public.product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_product_variants_active  ON public.product_variants(active);

CREATE TRIGGER update_product_variants_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- inventory_movements: referencia opcional a la variante exacta
-- =====================================================
ALTER TABLE public.inventory_movements
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON public.inventory_movements(variant_id);

-- =====================================================
-- orders: canal de venta (online vs. mostrador) y vendedor
-- =====================================================
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS channel   TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online', 'pos')),
    ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_channel   ON public.orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);

-- =====================================================
-- order_items: variante vendida, talla, costo y descuento por línea
-- =====================================================
-- cost_cents y product_talla son snapshots al momento de la venta (mismo
-- patrón ya usado por product_title/product_sku): preservan el historial
-- aunque el producto/variante cambie o se borre después.
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS variant_id      UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS product_talla   TEXT,
    ADD COLUMN IF NOT EXISTS cost_cents      INT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS discount_cents  INT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items(variant_id);

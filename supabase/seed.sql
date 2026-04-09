-- =====================================================
-- YJBMOTOCOM — Seed de datos iniciales
-- =====================================================
-- Solo estructura básica: categorías y productos demo
-- NO contiene usuarios ni datos sensibles
-- =====================================================

-- Categorías base del negocio
INSERT INTO public.categories (name, slug, description, sort_order) VALUES
    ('Cascos',      'cascos',      'Cascos de seguridad para motociclistas',           1),
    ('Guantes',     'guantes',     'Guantes de protección para conducir',              2),
    ('Chaquetas',   'chaquetas',   'Chaquetas y protecciones para el cuerpo',          3),
    ('Accesorios',  'accesorios',  'Accesorios varios para motos',                     4),
    ('Repuestos',   'repuestos',   'Repuestos y partes para motos',                    5),
    ('Lubricantes', 'lubricantes', 'Aceites y lubricantes para el mantenimiento',      6)
ON CONFLICT (slug) DO NOTHING;

-- Productos demo (precios en centavos COP)
INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, featured, images)
SELECT
    'CASCO-001',
    'Casco Integral Pro Racing',
    'casco-integral-pro-racing',
    'Casco integral de alta seguridad con ventilación avanzada. Certificación DOT y ECE. Visor antirrayaduras incluido.',
    45000000, 30000000, id, 15, true,
    ARRAY['/images/products/casco-1.jpg']
FROM public.categories WHERE slug = 'cascos'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, featured, images)
SELECT
    'GUANTE-001',
    'Guantes Touring Premium',
    'guantes-touring-premium',
    'Guantes de cuero genuino con protecciones en nudillos. Impermeables y compatibles con pantalla táctil.',
    12000000, 8000000, id, 25, true,
    ARRAY['/images/products/guantes-1.jpg']
FROM public.categories WHERE slug = 'guantes'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, images)
SELECT
    'CHAQ-001',
    'Chaqueta Moto Adventure',
    'chaqueta-moto-adventure',
    'Chaqueta textil con protecciones CE en codos y espalda. Forro térmico removible.',
    28000000, 18000000, id, 10,
    ARRAY['/images/products/chaqueta-1.jpg']
FROM public.categories WHERE slug = 'chaquetas'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products (sku, title, slug, description, price_cents, cost_cents, category_id, stock_qty, images)
SELECT
    'ACC-001',
    'Candado Alarma Premium',
    'candado-alarma-premium',
    'Candado de disco con alarma de 110dB. Resistente al agua con batería recargable.',
    8500000, 5000000, id, 30,
    ARRAY['/images/products/candado-1.jpg']
FROM public.categories WHERE slug = 'accesorios'
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- NOTA: para crear el usuario admin ejecutar:
--   GET /api/seed-admin  (solo en desarrollo local)
--   o usar el Supabase Dashboard > Authentication > Users
-- =====================================================

-- =====================================================
-- SCRIPT: Actualizar imágenes de productos con URLs demo
-- =====================================================
-- Ejecutar en Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor
--
-- Estas imágenes son de picsum.photos (servicio gratuito de imágenes demo).
-- Para producción, sube imágenes reales desde el panel admin:
-- /admin/productos → Editar producto → Imágenes → subir archivo
-- =====================================================

-- Casco: imagen demo seed "casco"
UPDATE public.products
SET images = ARRAY['https://picsum.photos/seed/casco-ybmoto/600/600']
WHERE title ILIKE '%casco%';

-- Guantes: imagen demo seed "guantes"
UPDATE public.products
SET images = ARRAY['https://picsum.photos/seed/guantes-ybmoto/600/600']
WHERE title ILIKE '%guante%';

-- Chaqueta: imagen demo seed "chaqueta"
UPDATE public.products
SET images = ARRAY['https://picsum.photos/seed/chaqueta-ybmoto/600/600']
WHERE title ILIKE '%chaqueta%';

-- Candado / accesorios: imagen demo seed "accesorio"
UPDATE public.products
SET images = ARRAY['https://picsum.photos/seed/accesorio-ybmoto/600/600']
WHERE title ILIKE '%candado%' OR title ILIKE '%accesorio%';

-- Cualquier otro producto que aún tenga placeholder o array vacío
UPDATE public.products
SET images = ARRAY['https://picsum.photos/seed/producto-ybmoto/600/600']
WHERE images @> ARRAY['/images/placeholder.jpg']
   OR images = '{}'
   OR array_length(images, 1) IS NULL;

-- =====================================================
-- VERIFICACIÓN (ejecutar después del update)
-- =====================================================
SELECT id, title, slug, images
FROM public.products
WHERE active = true
ORDER BY created_at DESC
LIMIT 20;

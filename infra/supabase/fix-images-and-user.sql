-- =====================================================
-- SCRIPT DE CORRECCIÓN: Imágenes y Usuario Admin
-- =====================================================
-- Ejecutar este script en Supabase SQL Editor

-- =====================================================
-- 1. ACTUALIZAR IMÁGENES DE CATEGORÍAS
-- =====================================================
UPDATE public.categories
SET image_url = '/images/categories/cascos.jfif'
WHERE slug = 'cascos';

UPDATE public.categories
SET image_url = '/images/categories/guantes.jfif'
WHERE slug = 'guantes';

UPDATE public.categories
SET image_url = '/images/categories/chaquetas.jfif'
WHERE slug = 'chaquetas';

UPDATE public.categories
SET image_url = '/images/categories/accesorios.png'
WHERE slug = 'accesorios';

-- =====================================================
-- 2. ACTUALIZAR IMÁGENES DE PRODUCTOS (usar placeholder)
-- =====================================================
UPDATE public.products
SET images = ARRAY['/images/placeholder.jpg']
WHERE images = ARRAY['/images/products/casco-1.jpg']
   OR images = ARRAY['/images/products/guantes-1.jpg']
   OR images = ARRAY['/images/products/chaqueta-1.jpg']
   OR images = ARRAY['/images/products/candado-1.jpg'];

-- Alternativamente, actualizar todos los productos sin imágenes válidas
UPDATE public.products
SET images = ARRAY['/images/placeholder.jpg']
WHERE array_length(images, 1) IS NULL
   OR images = '{}'
   OR NOT EXISTS (
      SELECT 1
      FROM unnest(images) AS img
      WHERE img LIKE '/images/categories/%'
   );

-- =====================================================
-- 3. CREAR USUARIO ADMIN
-- =====================================================
-- IMPORTANTE: Primero debes crear el usuario en Supabase Dashboard:
-- 1. Ve a: https://myskhpuwufbjgxnaltwl.supabase.co/project/myskhpuwufbjgxnaltwl/auth/users
-- 2. Click en "Add User" → "Create new user"
-- 3. Email: admin@ybmotocom.com
-- 4. Password: asdf4991jesuSS
-- 5. Click "Create user"

-- Luego, ejecuta este UPDATE para asignar el rol de admin:
-- REEMPLAZA 'UUID_DEL_USUARIO' con el UUID que obtienes después de crear el usuario

-- Ejemplo (reemplazar el UUID):
-- UPDATE public.users
-- SET role = 'admin',
--     name = 'Administrador',
--     email = 'admin@ybmotocom.com'
-- WHERE id = 'UUID_DEL_USUARIO';

-- =====================================================
-- 4. VERIFICACIÓN
-- =====================================================
-- Verificar categorías con imágenes
SELECT slug, name, image_url
FROM public.categories
WHERE active = true
ORDER BY sort_order;

-- Verificar productos con imágenes
SELECT title, images
FROM public.products
WHERE active = true
LIMIT 10;

-- Verificar usuario admin (después de crearlo)
-- SELECT id, email, role, name
-- FROM public.users
-- WHERE email = 'admin@ybmotocom.com';

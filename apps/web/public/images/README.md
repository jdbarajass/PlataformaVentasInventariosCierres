# 📸 Imágenes del Proyecto

## Estructura de Carpetas

```
public/images/
├── placeholder.jpg          # Imagen por defecto para productos sin foto
└── categories/             # Imágenes de categorías
    ├── cascos.jpg
    ├── guantes.jpg
    ├── chaquetas.jpg
    └── accesorios.jpg
```

## Cómo Reemplazar las Imágenes Placeholder

### 1️⃣ Imágenes de Categorías
Reemplaza los archivos SVG actuales con fotografías reales:

- **Tamaño recomendado**: 800x600px (4:3)
- **Formato**: JPG o WebP
- **Peso**: Máximo 200KB por imagen
- **Nombres**: Deben coincidir exactamente:
  - `cascos.jpg`
  - `guantes.jpg`
  - `chaquetas.jpg`
  - `accesorios.jpg`

### 2️⃣ Imágenes de Productos
Las imágenes de productos se almacenan en **Supabase Storage**, no en la carpeta public.

#### Configurar Supabase Storage:

1. Ve a tu proyecto en Supabase
2. Navega a **Storage** > **Create Bucket**
3. Crea un bucket llamado: `product-images`
4. Configura como **público**
5. Sube las imágenes de productos

#### URLs de Productos:
Las URLs se almacenan en el campo `images` (array) de la tabla `products`:

```sql
-- Ejemplo de actualización
UPDATE products
SET images = ARRAY[
  'https://tu-proyecto.supabase.co/storage/v1/object/public/product-images/casco-integral-negro.jpg',
  'https://tu-proyecto.supabase.co/storage/v1/object/public/product-images/casco-integral-negro-2.jpg'
]
WHERE slug = 'casco-integral-negro';
```

### 3️⃣ Placeholder General
El archivo `placeholder.jpg` se usa cuando un producto no tiene imágenes.

- **Tamaño**: 600x600px (1:1)
- **Puedes personalizarlo** con el logo de YJBMOTOCOM

## Optimización de Imágenes

Para mejor rendimiento, optimiza tus imágenes antes de subirlas:

```bash
# Instalar herramienta de optimización (opcional)
npm install -g sharp-cli

# Optimizar imagen
npx sharp -i imagen-original.jpg -o imagen-optimizada.jpg --webp
```

## Next.js Image Optimization

Next.js optimiza automáticamente las imágenes del folder `public` cuando usas el componente `<Image>`. No necesitas hacer nada adicional.

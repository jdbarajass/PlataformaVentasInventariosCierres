# 🔧 Solución: Imágenes y Login

## 📋 Problemas Identificados

### ❌ Problema 1: Imágenes no se muestran
**Causa**: Las categorías y productos en la base de datos tienen URLs de imágenes que no existen.

### ❌ Problema 2: No puedes hacer login
**Causa**: El usuario `admin@ybmotocom.com` no existe en Supabase Auth.

---

## ✅ Solución Paso a Paso

### 🎯 PASO 1: Crear Usuario Admin en Supabase

1. **Ir a Supabase Dashboard**:
   - Abre: https://myskhpuwufbjgxnaltwl.supabase.co/project/myskhpuwufbjgxnaltwl/auth/users
   - O ve a: https://supabase.com → Tu proyecto → Authentication → Users

2. **Crear nuevo usuario**:
   - Click en botón **"Add User"** (esquina superior derecha)
   - Selecciona **"Create new user"**

3. **Llenar el formulario**:
   ```
   Email: admin@ybmotocom.com
   Password: asdf4991jesuSS
   ```
   - ✅ Marca: **"Auto Confirm User"** (para que no necesite verificar email)

4. **Crear el usuario**:
   - Click en **"Create user"**
   - **IMPORTANTE**: Copia el **UUID** del usuario que se muestra (lo necesitarás en el paso 2)

---

### 🖼️ PASO 2: Actualizar Imágenes en Base de Datos

1. **Ir al SQL Editor de Supabase**:
   - Abre: https://myskhpuwufbjgxnaltwl.supabase.co/project/myskhpuwufbjgxnaltwl/sql
   - O ve a: Tu proyecto → SQL Editor

2. **Ejecutar el script de corrección**:
   - Abre el archivo: `infra/supabase/fix-images-and-user.sql`
   - Copia **TODO** el contenido del archivo
   - Pégalo en el SQL Editor de Supabase
   - Click en **"Run"** (o presiona `Ctrl + Enter`)

3. **Asignar rol de admin al usuario**:
   - En el mismo SQL Editor, ejecuta este comando (reemplaza `UUID_DEL_USUARIO`):

   ```sql
   -- REEMPLAZA 'UUID_DEL_USUARIO' con el UUID que copiaste en el Paso 1
   INSERT INTO public.users (id, email, name, role)
   VALUES (
     'UUID_DEL_USUARIO',  -- ← REEMPLAZAR AQUÍ
     'admin@ybmotocom.com',
     'Administrador',
     'admin'
   )
   ON CONFLICT (id) DO UPDATE
   SET role = 'admin',
       name = 'Administrador',
       email = 'admin@ybmotocom.com';
   ```

4. **Verificar que funcionó**:
   - Ejecuta en el SQL Editor:

   ```sql
   -- Verificar categorías con imágenes
   SELECT slug, name, image_url
   FROM public.categories
   WHERE active = true
   ORDER BY sort_order;

   -- Verificar usuario admin
   SELECT id, email, role, name
   FROM public.users
   WHERE email = 'admin@ybmotocom.com';
   ```

   Deberías ver:
   - ✅ Categorías con `image_url` correctas
   - ✅ Usuario con `role = 'admin'`

---

### 🚀 PASO 3: Probar el Login

1. **Ir a la página de login**:
   - Abre: http://localhost:3000/login

2. **Ingresar credenciales**:
   ```
   Email: admin@ybmotocom.com
   Password: asdf4991jesuSS
   ```

3. **Click en "Ingresar"**:
   - Deberías ser redirigido a: http://localhost:3000/admin
   - Deberías ver el panel de administración

---

### 🖼️ PASO 4: Verificar Imágenes

1. **Ir al listado de productos**:
   - Abre: http://localhost:3000/admin/productos

2. **Verificar que se ven las imágenes placeholder**:
   - Los productos deberían mostrar la imagen `placeholder.jpg`

3. **Ir a la página principal**:
   - Abre: http://localhost:3000
   - Las categorías deberían mostrar sus imágenes:
     - Cascos → `cascos.jfif`
     - Guantes → `guantes.jfif`
     - Chaquetas → `chaquetas.jfif`
     - Accesorios → `accesorios.png`

---

## 📝 Ejemplo Completo de SQL para el Usuario Admin

Aquí está el comando completo (solo reemplaza el UUID):

```sql
-- 1. Primero, verifica el UUID del usuario que creaste
SELECT id, email
FROM auth.users
WHERE email = 'admin@ybmotocom.com';

-- 2. Copia el UUID que aparece y pégalo aquí abajo
INSERT INTO public.users (id, email, name, role)
VALUES (
  'PEGAR_UUID_AQUI',  -- ← Ejemplo: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  'admin@ybmotocom.com',
  'Administrador',
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    name = 'Administrador',
    email = 'admin@ybmotocom.com';
```

---

## 🔍 Troubleshooting

### Si el login sigue sin funcionar:

1. **Verificar que el usuario existe**:
   ```sql
   SELECT * FROM auth.users WHERE email = 'admin@ybmotocom.com';
   ```

2. **Verificar que el rol está asignado**:
   ```sql
   SELECT * FROM public.users WHERE email = 'admin@ybmotocom.com';
   ```

3. **Verificar las variables de entorno**:
   - Abre: `apps/web/.env.local`
   - Verifica que `NEXT_PUBLIC_SUPABASE_URL` sea: `https://myskhpuwufbjgxnaltwl.supabase.co`

4. **Reiniciar el servidor**:
   ```bash
   # Si está corriendo, presiona Ctrl + C para detenerlo
   cd apps/web
   npm run dev
   ```

### Si las imágenes no se ven:

1. **Verificar que los archivos existen**:
   ```bash
   ls -la apps/web/public/images/
   ls -la apps/web/public/images/categories/
   ```

2. **Verificar las URLs en la BD**:
   ```sql
   SELECT title, images FROM public.products LIMIT 5;
   SELECT slug, image_url FROM public.categories;
   ```

3. **Limpiar caché del navegador**:
   - Presiona `Ctrl + Shift + R` para forzar recarga

---

## ✅ Checklist Final

Después de completar todos los pasos, deberías tener:

- [ ] Usuario admin creado en Supabase Auth
- [ ] Usuario admin con rol 'admin' en tabla public.users
- [ ] Categorías con image_url correctas
- [ ] Productos con imágenes placeholder
- [ ] Login funcionando con admin@ybmotocom.com
- [ ] Imágenes de categorías visibles en la homepage
- [ ] Imágenes placeholder visibles en productos

---

## 🆘 Si Necesitas Ayuda

Si después de seguir estos pasos aún tienes problemas:

1. Verifica los logs del servidor en la terminal
2. Abre la consola del navegador (F12) y busca errores
3. Verifica que ejecutaste TODOS los comandos SQL
4. Asegúrate de haber reemplazado el UUID correctamente

**Proyecto Supabase**: https://myskhpuwufbjgxnaltwl.supabase.co

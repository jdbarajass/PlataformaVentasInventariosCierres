-- Huella de la estructura de la base (solo lectura, no cambia nada).
-- Correrla en el SQL Editor de YJBMOTOCOM y de YBMOTOCOM: si las dos tiendas tienen
-- la misma estructura, cada fila sale con el mismo "cuantos" y la misma "huella".
-- Solo mira nombres (tablas, columnas, funciones...), nunca los datos.

SELECT 'tablas' AS que, count(*) AS cuantos,
       left(md5(string_agg(table_name, ',' ORDER BY table_name)), 10) AS huella
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'columnas', count(*),
       left(md5(string_agg(table_name || '.' || column_name || ':' || data_type, ',' ORDER BY table_name, column_name)), 10)
FROM information_schema.columns
WHERE table_schema = 'public'
UNION ALL
SELECT 'funciones', count(*),
       left(md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ','
            ORDER BY p.proname, pg_get_function_identity_arguments(p.oid))), 10)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
UNION ALL
SELECT 'triggers', count(*),
       left(md5(string_agg(c.relname || '.' || t.tgname, ',' ORDER BY c.relname, t.tgname)), 10)
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
UNION ALL
SELECT 'politicas', count(*),
       left(md5(string_agg(tablename || '.' || policyname, ',' ORDER BY tablename, policyname)), 10)
FROM pg_policies
WHERE schemaname = 'public'
UNION ALL
SELECT 'indices', count(*),
       left(md5(string_agg(indexname, ',' ORDER BY indexname)), 10)
FROM pg_indexes
WHERE schemaname = 'public'
UNION ALL
SELECT 'buckets (fotos)', count(*),
       left(md5(string_agg(id, ',' ORDER BY id)), 10)
FROM storage.buckets;

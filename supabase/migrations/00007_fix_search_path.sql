-- =====================================================
-- YJBMOTOCOM — Migración 007: Fijar search_path en funciones SECURITY DEFINER
-- =====================================================
-- El Security Advisor de Supabase marca "Function Search Path Mutable"
-- para decrement_stock y create_order_with_items (00005/00006). Son
-- SECURITY DEFINER sin search_path fijo: en teoría, alguien con permisos
-- para crear objetos en algún esquema podría hacer que la función
-- resuelva una tabla distinta a la real. Ya usan public.products /
-- public.orders con esquema explícito en el cuerpo, pero fijar
-- search_path cierra la vía de ataque por completo.
-- =====================================================

ALTER FUNCTION public.decrement_stock(UUID, INT) SET search_path = public;
ALTER FUNCTION public.create_order_with_items(JSONB, JSONB) SET search_path = public;

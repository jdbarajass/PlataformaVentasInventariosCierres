-- ============================================
-- MIGRACIÓN: Tabla store_settings
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================

-- Crear tabla store_settings (una sola fila)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name TEXT NOT NULL DEFAULT 'YJBMOTOCOM',
  store_description TEXT DEFAULT 'Tu tienda de confianza para accesorios y equipamiento de motos. Calidad y seguridad para cada viaje.',
  contact_info JSONB NOT NULL DEFAULT '{
    "phone_primary": "+57 321 411 1371",
    "phone_secondary": "+57 314 406 5520",
    "email": "yjbmotocom@gmail.com",
    "address": "Av Caracas No. 17-47 Local 111 Isla S, Cc Megacentro Puerta 1",
    "city": "Bogotá, Colombia",
    "business_hours": {
      "weekdays": "Lunes a Viernes: 8:00 AM - 6:00 PM",
      "saturday": "Sábado: 9:00 AM - 2:00 PM",
      "sunday": "Domingo: Cerrado"
    }
  }'::jsonb,
  shipping_config JSONB NOT NULL DEFAULT '{
    "free_shipping_threshold_cents": 20000000,
    "default_shipping_cost_cents": 1500000,
    "enabled": true
  }'::jsonb,
  tax_config JSONB NOT NULL DEFAULT '{
    "enabled": false,
    "percentage": 19
  }'::jsonb,
  payment_methods JSONB NOT NULL DEFAULT '[
    {"id": "card", "name": "Tarjeta de crédito/débito", "enabled": true},
    {"id": "transfer", "name": "Transferencia bancaria", "enabled": true},
    {"id": "nequi", "name": "Nequi", "enabled": true},
    {"id": "daviplata", "name": "Daviplata", "enabled": true},
    {"id": "cash", "name": "Efectivo (retiro en tienda)", "enabled": true}
  ]'::jsonb,
  social_links JSONB NOT NULL DEFAULT '{
    "facebook": "",
    "instagram": "",
    "whatsapp": "",
    "tiktok": "",
    "twitter": ""
  }'::jsonb,
  branding JSONB NOT NULL DEFAULT '{
    "logo_url": "",
    "primary_color": "#06b6d4",
    "secondary_color": "#2563eb"
  }'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar fila con defaults
INSERT INTO public.store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Trigger para updated_at
CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Índice (no es necesario pero por consistencia)
CREATE INDEX IF NOT EXISTS idx_store_settings_id ON public.store_settings(id);

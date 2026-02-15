import { getServiceSupabase } from './supabase'

export interface ContactInfo {
  phone_primary: string
  phone_secondary: string
  email: string
  address: string
  city: string
  business_hours: {
    weekdays: string
    saturday: string
    sunday: string
  }
}

export interface ShippingConfig {
  free_shipping_threshold_cents: number
  default_shipping_cost_cents: number
  enabled: boolean
}

export interface TaxConfig {
  enabled: boolean
  percentage: number
}

export interface PaymentMethod {
  id: string
  name: string
  enabled: boolean
}

export interface SocialLinks {
  facebook: string
  instagram: string
  whatsapp: string
  tiktok: string
  twitter: string
}

export interface Branding {
  logo_url: string
  primary_color: string
  secondary_color: string
}

export interface StoreSettingsData {
  id: number
  store_name: string
  store_description: string | null
  contact_info: ContactInfo
  shipping_config: ShippingConfig
  tax_config: TaxConfig
  payment_methods: PaymentMethod[]
  social_links: SocialLinks
  branding: Branding
  updated_at: string
}

/**
 * Fetches store settings from Supabase (server-side)
 * For use in Server Components and API routes
 */
export async function getStoreSettings(): Promise<StoreSettingsData | null> {
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single()

    if (error || !data) {
      console.error('Error fetching store settings:', error)
      return null
    }

    return data as unknown as StoreSettingsData
  } catch (error) {
    console.error('Error in getStoreSettings:', error)
    return null
  }
}

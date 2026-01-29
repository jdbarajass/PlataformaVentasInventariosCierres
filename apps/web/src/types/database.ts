export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          phone: string | null
          role: 'admin' | 'seller' | 'viewer'
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          phone?: string | null
          role?: 'admin' | 'seller' | 'viewer'
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          phone?: string | null
          role?: 'admin' | 'seller' | 'viewer'
          avatar_url?: string | null
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          image_url: string | null
          parent_id: string | null
          sort_order: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          image_url?: string | null
          parent_id?: string | null
          sort_order?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          image_url?: string | null
          parent_id?: string | null
          sort_order?: number
          active?: boolean
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          sku: string | null
          title: string
          slug: string
          description: string | null
          price_cents: number
          cost_cents: number
          compare_at_price_cents: number | null
          category_id: string | null
          images: string[]
          stock_qty: number
          low_stock_threshold: number
          weight_grams: number | null
          dimensions: Json | null
          tags: string[]
          active: boolean
          featured: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku?: string | null
          title: string
          slug: string
          description?: string | null
          price_cents: number
          cost_cents?: number
          compare_at_price_cents?: number | null
          category_id?: string | null
          images?: string[]
          stock_qty?: number
          low_stock_threshold?: number
          weight_grams?: number | null
          dimensions?: Json | null
          tags?: string[]
          active?: boolean
          featured?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          sku?: string | null
          title?: string
          slug?: string
          description?: string | null
          price_cents?: number
          cost_cents?: number
          compare_at_price_cents?: number | null
          category_id?: string | null
          images?: string[]
          stock_qty?: number
          low_stock_threshold?: number
          weight_grams?: number | null
          dimensions?: Json | null
          tags?: string[]
          active?: boolean
          featured?: boolean
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          order_number: string
          user_id: string | null
          customer_email: string
          customer_name: string | null
          customer_phone: string | null
          shipping_address: Json | null
          billing_address: Json | null
          subtotal_cents: number
          discount_cents: number
          shipping_cents: number
          tax_cents: number
          total_cents: number
          currency: string
          status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          payment_status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partial_refund'
          notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number?: string
          user_id?: string | null
          customer_email: string
          customer_name?: string | null
          customer_phone?: string | null
          shipping_address?: Json | null
          billing_address?: Json | null
          subtotal_cents?: number
          discount_cents?: number
          shipping_cents?: number
          tax_cents?: number
          total_cents?: number
          currency?: string
          status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'partial_refund'
          notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          order_number?: string
          user_id?: string | null
          customer_email?: string
          customer_name?: string | null
          customer_phone?: string | null
          shipping_address?: Json | null
          billing_address?: Json | null
          subtotal_cents?: number
          discount_cents?: number
          shipping_cents?: number
          tax_cents?: number
          total_cents?: number
          currency?: string
          status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'partial_refund'
          notes?: string | null
          metadata?: Json
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_title: string
          product_sku: string | null
          product_image: string | null
          qty: number
          price_cents: number
          total_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_title: string
          product_sku?: string | null
          product_image?: string | null
          qty: number
          price_cents: number
          total_cents: number
          created_at?: string
        }
        Update: {
          order_id?: string
          product_id?: string | null
          product_title?: string
          product_sku?: string | null
          product_image?: string | null
          qty?: number
          price_cents?: number
          total_cents?: number
        }
      }
      payments: {
        Row: {
          id: string
          order_id: string
          provider: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer'
          provider_payment_id: string | null
          provider_session_id: string | null
          amount_cents: number
          currency: string
          method: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | null
          status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          provider: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer'
          provider_payment_id?: string | null
          provider_session_id?: string | null
          amount_cents: number
          currency?: string
          method?: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | null
          status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          order_id?: string
          provider?: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer'
          provider_payment_id?: string | null
          provider_session_id?: string | null
          amount_cents?: number
          currency?: string
          method?: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | null
          status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata?: Json
          updated_at?: string
        }
      }
      inventory_movements: {
        Row: {
          id: string
          product_id: string
          qty: number
          type: 'in' | 'out' | 'adjustment' | 'sale' | 'return'
          note: string | null
          reference_id: string | null
          reference_type: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          qty: number
          type: 'in' | 'out' | 'adjustment' | 'sale' | 'return'
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          product_id?: string
          qty?: number
          type?: 'in' | 'out' | 'adjustment' | 'sale' | 'return'
          note?: string | null
          reference_id?: string | null
          reference_type?: string | null
          created_by?: string | null
        }
      }
      daily_closures: {
        Row: {
          id: string
          date: string
          cash_amount_cents: number
          card_amount_cents: number
          transfer_amount_cents: number
          wallet_amount_cents: number
          other_amount_cents: number
          total_amount_cents: number
          orders_count: number
          notes: string | null
          created_by: string | null
          verified: boolean
          verified_by: string | null
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          cash_amount_cents?: number
          card_amount_cents?: number
          transfer_amount_cents?: number
          wallet_amount_cents?: number
          other_amount_cents?: number
          total_amount_cents?: number
          orders_count?: number
          notes?: string | null
          created_by?: string | null
          verified?: boolean
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          date?: string
          cash_amount_cents?: number
          card_amount_cents?: number
          transfer_amount_cents?: number
          wallet_amount_cents?: number
          other_amount_cents?: number
          total_amount_cents?: number
          orders_count?: number
          notes?: string | null
          created_by?: string | null
          verified?: boolean
          verified_by?: string | null
          verified_at?: string | null
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_email: string | null
          action: string
          table_name: string
          record_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_email?: string | null
          action: string
          table_name: string
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_email?: string | null
          action?: string
          table_name?: string
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
        }
      }
      coupons: {
        Row: {
          id: string
          code: string
          description: string | null
          discount_type: 'percentage' | 'fixed'
          discount_value: number
          min_purchase_cents: number
          max_uses: number | null
          used_count: number
          valid_from: string | null
          valid_until: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          description?: string | null
          discount_type: 'percentage' | 'fixed'
          discount_value: number
          min_purchase_cents?: number
          max_uses?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          code?: string
          description?: string | null
          discount_type?: 'percentage' | 'fixed'
          discount_value?: number
          min_purchase_cents?: number
          max_uses?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
          active?: boolean
          updated_at?: string
        }
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export type Product = Tables<'products'>
export type Category = Tables<'categories'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type Payment = Tables<'payments'>
export type User = Tables<'users'>
export type InventoryMovement = Tables<'inventory_movements'>
export type DailyClosure = Tables<'daily_closures'>
export type AuditLog = Tables<'audit_logs'>
export type Coupon = Tables<'coupons'>

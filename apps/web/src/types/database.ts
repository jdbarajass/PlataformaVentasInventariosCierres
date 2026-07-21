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
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey",
            columns: ["parent_id"],
            isOneToOne: false,
            referencedRelation: "categories",
            referencedColumns: ["id"],
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey",
            columns: ["category_id"],
            isOneToOne: false,
            referencedRelation: "categories",
            referencedColumns: ["id"],
          }
        ]
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
          channel: 'online' | 'pos'
          seller_id: string | null
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
          channel?: 'online' | 'pos'
          seller_id?: string | null
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
          channel?: 'online' | 'pos'
          seller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey",
            columns: ["user_id"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "orders_seller_id_fkey",
            columns: ["seller_id"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
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
          variant_id: string | null
          product_talla: string | null
          cost_cents: number
          discount_cents: number
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
          variant_id?: string | null
          product_talla?: string | null
          cost_cents?: number
          discount_cents?: number
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
          variant_id?: string | null
          product_talla?: string | null
          cost_cents?: number
          discount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey",
            columns: ["order_id"],
            isOneToOne: false,
            referencedRelation: "orders",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "order_items_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "order_items_variant_id_fkey",
            columns: ["variant_id"],
            isOneToOne: false,
            referencedRelation: "product_variants",
            referencedColumns: ["id"],
          }
        ]
      }
      payments: {
        Row: {
          id: string
          order_id: string
          provider: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer' | 'pos'
          provider_payment_id: string | null
          provider_session_id: string | null
          amount_cents: number
          currency: string
          method: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | 'addi' | null
          status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata: Json
          method_detail: string | null
          commission_cents: number
          account_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          provider: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer' | 'pos'
          provider_payment_id?: string | null
          provider_session_id?: string | null
          amount_cents: number
          currency?: string
          method?: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | 'addi' | null
          status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata?: Json
          method_detail?: string | null
          commission_cents?: number
          account_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          order_id?: string
          provider?: 'stripe' | 'mercadopago' | 'manual' | 'cash' | 'transfer' | 'pos'
          provider_payment_id?: string | null
          provider_session_id?: string | null
          amount_cents?: number
          currency?: string
          method?: 'card' | 'transfer' | 'wallet' | 'cash' | 'nequi' | 'daviplata' | 'other' | 'addi' | null
          status?: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          metadata?: Json
          method_detail?: string | null
          commission_cents?: number
          account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey",
            columns: ["order_id"],
            isOneToOne: false,
            referencedRelation: "orders",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "payments_account_id_fkey",
            columns: ["account_id"],
            isOneToOne: false,
            referencedRelation: "accounts",
            referencedColumns: ["id"],
          }
        ]
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
          variant_id: string | null
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
          variant_id?: string | null
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
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey",
            columns: ["created_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey",
            columns: ["variant_id"],
            isOneToOne: false,
            referencedRelation: "product_variants",
            referencedColumns: ["id"],
          }
        ]
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          talla: string | null
          sku: string | null
          barcode: string | null
          stock_qty: number
          low_stock_threshold: number
          cost_cents: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          talla?: string | null
          sku?: string | null
          barcode?: string | null
          stock_qty?: number
          low_stock_threshold?: number
          cost_cents?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          product_id?: string
          talla?: string | null
          sku?: string | null
          barcode?: string | null
          stock_qty?: number
          low_stock_threshold?: number
          cost_cents?: number
          active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          }
        ]
      }
      accounts: {
        Row: {
          id: string
          name: string
          payment_method: string
          balance_cents: number
          color: string | null
          active: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          payment_method: string
          balance_cents?: number
          color?: string | null
          active?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          payment_method?: string
          balance_cents?: number
          color?: string | null
          active?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      account_movements: {
        Row: {
          id: string
          account_id: string
          type: 'sale' | 'manual_adjustment' | 'transfer_out' | 'transfer_in' | 'operating_expense' | 'expense_reversal' | 'invoice_payment' | 'credit_payment_reversal' | 'sale_reversal'
          amount_cents: number
          description: string | null
          reference_id: string | null
          reference_type: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          type: 'sale' | 'manual_adjustment' | 'transfer_out' | 'transfer_in' | 'operating_expense' | 'expense_reversal' | 'invoice_payment' | 'credit_payment_reversal' | 'sale_reversal'
          amount_cents: number
          description?: string | null
          reference_id?: string | null
          reference_type?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          account_id?: string
          type?: 'sale' | 'manual_adjustment' | 'transfer_out' | 'transfer_in' | 'operating_expense' | 'expense_reversal' | 'invoice_payment' | 'credit_payment_reversal' | 'sale_reversal'
          amount_cents?: number
          description?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_movements_account_id_fkey",
            columns: ["account_id"],
            isOneToOne: false,
            referencedRelation: "accounts",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "account_movements_created_by_fkey",
            columns: ["created_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
      }
      account_closures: {
        Row: {
          id: string
          year: number
          month: number
          snapshot: Json
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          year: number
          month: number
          snapshot?: Json
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          snapshot?: Json
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_closures_created_by_fkey",
            columns: ["created_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
      }
      supplier_invoices: {
        Row: {
          id: string
          description: string
          supplier: string
          amount_cents: number
          arrival_date: string | null
          due_date: string | null
          status: 'pending' | 'paid'
          notes: string | null
          paid_at: string | null
          account_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          description: string
          supplier: string
          amount_cents: number
          arrival_date?: string | null
          due_date?: string | null
          status?: 'pending' | 'paid'
          notes?: string | null
          paid_at?: string | null
          account_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          description?: string
          supplier?: string
          amount_cents?: number
          arrival_date?: string | null
          due_date?: string | null
          status?: 'pending' | 'paid'
          notes?: string | null
          paid_at?: string | null
          account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_account_id_fkey",
            columns: ["account_id"],
            isOneToOne: false,
            referencedRelation: "accounts",
            referencedColumns: ["id"],
          }
        ]
      }
      supplier_invoice_items: {
        Row: {
          id: string
          invoice_id: string
          description: string
          qty: number
          unit_price_cents: number
          subtotal_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          description: string
          qty?: number
          unit_price_cents?: number
          subtotal_cents?: number
          created_at?: string
        }
        Update: {
          description?: string
          qty?: number
          unit_price_cents?: number
          subtotal_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey",
            columns: ["invoice_id"],
            isOneToOne: false,
            referencedRelation: "supplier_invoices",
            referencedColumns: ["id"],
          }
        ]
      }
      supplier_invoice_payments: {
        Row: {
          id: string
          invoice_id: string
          amount_cents: number
          account_id: string | null
          notes: string | null
          paid_at: string
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          amount_cents: number
          account_id?: string | null
          notes?: string | null
          paid_at?: string
          created_at?: string
        }
        Update: {
          amount_cents?: number
          account_id?: string | null
          notes?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_payments_invoice_id_fkey",
            columns: ["invoice_id"],
            isOneToOne: false,
            referencedRelation: "supplier_invoices",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "supplier_invoice_payments_account_id_fkey",
            columns: ["account_id"],
            isOneToOne: false,
            referencedRelation: "accounts",
            referencedColumns: ["id"],
          }
        ]
      }
      customer_credits: {
        Row: {
          id: string
          customer_name: string
          customer_id_number: string | null
          customer_phone: string | null
          description: string | null
          total_amount_cents: number
          status: 'pending' | 'paid'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_name: string
          customer_id_number?: string | null
          customer_phone?: string | null
          description?: string | null
          total_amount_cents: number
          status?: 'pending' | 'paid'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          customer_name?: string
          customer_id_number?: string | null
          customer_phone?: string | null
          description?: string | null
          total_amount_cents?: number
          status?: 'pending' | 'paid'
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_credit_payments: {
        Row: {
          id: string
          credit_id: string
          amount_cents: number
          notes: string | null
          paid_at: string
          created_at: string
        }
        Insert: {
          id?: string
          credit_id: string
          amount_cents: number
          notes?: string | null
          paid_at?: string
          created_at?: string
        }
        Update: {
          amount_cents?: number
          notes?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_payments_credit_id_fkey",
            columns: ["credit_id"],
            isOneToOne: false,
            referencedRelation: "customer_credits",
            referencedColumns: ["id"],
          }
        ]
      }
      loans: {
        Row: {
          id: string
          product_id: string | null
          variant_id: string | null
          product_title: string
          warehouse: string
          observations: string | null
          status: 'pending' | 'returned' | 'charged'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          variant_id?: string | null
          product_title: string
          warehouse: string
          observations?: string | null
          status?: 'pending' | 'returned' | 'charged'
          created_at?: string
          updated_at?: string
        }
        Update: {
          product_id?: string | null
          variant_id?: string | null
          product_title?: string
          warehouse?: string
          observations?: string | null
          status?: 'pending' | 'returned' | 'charged'
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "loans_variant_id_fkey",
            columns: ["variant_id"],
            isOneToOne: false,
            referencedRelation: "product_variants",
            referencedColumns: ["id"],
          }
        ]
      }
      notes: {
        Row: {
          id: string
          type: 'task' | 'restock'
          text: string
          completed: boolean
          due_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: 'task' | 'restock'
          text: string
          completed?: boolean
          due_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          type?: 'task' | 'restock'
          text?: string
          completed?: boolean
          due_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          id: string
          date: string
          description: string
          amount_cents: number
          category: string
          account_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date?: string
          description: string
          amount_cents: number
          category: string
          account_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          date?: string
          description?: string
          amount_cents?: number
          category?: string
          account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_expenses_account_id_fkey",
            columns: ["account_id"],
            isOneToOne: false,
            referencedRelation: "accounts",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "operating_expenses_created_by_fkey",
            columns: ["created_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
      }
      monthly_budgets: {
        Row: {
          id: string
          year: number
          month: number
          category: string
          budgeted_amount_cents: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          year: number
          month: number
          category: string
          budgeted_amount_cents?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          budgeted_amount_cents?: number
          updated_at?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "daily_closures_created_by_fkey",
            columns: ["created_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "daily_closures_verified_by_fkey",
            columns: ["verified_by"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
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
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey",
            columns: ["actor_id"],
            isOneToOne: false,
            referencedRelation: "users",
            referencedColumns: ["id"],
          }
        ]
      }
      processed_webhooks: {
        Row: {
          provider: string
          event_key: string
          created_at: string
        }
        Insert: {
          provider: string
          event_key: string
          created_at?: string
        }
        Update: {
          provider?: string
          event_key?: string
          created_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          id: number
          store_name: string
          store_description: string | null
          contact_info: Json
          shipping_config: Json
          tax_config: Json
          payment_methods: Json
          social_links: Json
          branding: Json
          pos_commission_rates: Json
          updated_by: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: number
          store_name?: string
          store_description?: string | null
          contact_info?: Json
          shipping_config?: Json
          tax_config?: Json
          payment_methods?: Json
          social_links?: Json
          branding?: Json
          pos_commission_rates?: Json
          updated_by?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          store_name?: string
          store_description?: string | null
          contact_info?: Json
          shipping_config?: Json
          tax_config?: Json
          payment_methods?: Json
          social_links?: Json
          branding?: Json
          pos_commission_rates?: Json
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          id: string
          user_id: string
          product_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          }
        ]
      }
      product_reviews: {
        Row: {
          id: string
          product_id: string
          user_id: string
          rating: number
          title: string | null
          comment: string | null
          verified_purchase: boolean
          approved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          user_id: string
          rating: number
          title?: string | null
          comment?: string | null
          verified_purchase?: boolean
          approved?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          rating?: number
          title?: string | null
          comment?: string | null
          verified_purchase?: boolean
          approved?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey",
            columns: ["product_id"],
            isOneToOne: false,
            referencedRelation: "products",
            referencedColumns: ["id"],
          }
        ]
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
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
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
export type Wishlist = Tables<'wishlists'>
export type ProductReview = Tables<'product_reviews'>
export type StoreSettings = Tables<'store_settings'>
export type ProductVariant = Tables<'product_variants'>
export type Account = Tables<'accounts'>
export type AccountMovement = Tables<'account_movements'>
export type AccountClosure = Tables<'account_closures'>
export type SupplierInvoice = Tables<'supplier_invoices'>
export type SupplierInvoiceItem = Tables<'supplier_invoice_items'>
export type SupplierInvoicePayment = Tables<'supplier_invoice_payments'>
export type CustomerCredit = Tables<'customer_credits'>
export type CustomerCreditPayment = Tables<'customer_credit_payments'>
export type Loan = Tables<'loans'>
export type Note = Tables<'notes'>
export type MonthlyBudget = Tables<'monthly_budgets'>
export type OperatingExpense = Tables<'operating_expenses'>

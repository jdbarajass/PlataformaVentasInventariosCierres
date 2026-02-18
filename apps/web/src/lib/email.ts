import { Resend } from 'resend'
import { render } from '@react-email/render'
import OrderConfirmationEmail from '@/emails/order-confirmation'
import PaymentInstructionsEmail from '@/emails/payment-instructions'
import OrderShippedEmail from '@/emails/order-shipped'
import NewOrderAdminEmail from '@/emails/new-order-admin'
import LowStockAlertEmail from '@/emails/low-stock-alert'
import { getServiceSupabase } from './supabase'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
const fromEmail = process.env.RESEND_FROM_EMAIL || 'YB MOTOCOM <pedidos@ybmotocom.com>'
const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'ybmotocom@gmail.com'

interface OrderWithItems {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  shipping_address: any
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  payment_method: string
  payment_status: string
  created_at: string
  order_items: Array<{
    id: string
    product_title: string
    product_image: string | null
    qty: number
    price_cents: number
    total_cents: number
  }>
}

/**
 * Sends order confirmation email to customer
 * This is sent after successful payment confirmation
 */
export async function sendOrderConfirmation(orderId: string): Promise<boolean> {
  try {
    // Fetch order with items from database
    const supabase = getServiceSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Error fetching order for confirmation email:', error)
      return false
    }

    const typedOrder = order as unknown as OrderWithItems

    // Render email template
    const emailHtml = await render(OrderConfirmationEmail({ order: typedOrder }))

    // Send email via Resend
    const { data, error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: typedOrder.customer_email,
      subject: `Pedido confirmado #${typedOrder.order_number}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending confirmation email:', sendError)
      return false
    }

    console.log('Confirmation email sent successfully:', data)
    return true
  } catch (error) {
    console.error('Error in sendOrderConfirmation:', error)
    return false
  }
}

/**
 * Sends payment instructions email to customer
 * This is sent when customer selects manual payment methods (transfer, nequi, daviplata)
 */
export async function sendPaymentInstructions(
  orderId: string,
  paymentMethod: string
): Promise<boolean> {
  try {
    // Fetch order from database
    const supabase = getServiceSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Error fetching order for payment instructions email:', error)
      return false
    }

    const typedOrder = order as unknown as OrderWithItems

    // Render email template
    const emailHtml = await render(
      PaymentInstructionsEmail({ order: typedOrder, paymentMethod })
    )

    // Send email via Resend
    const { data, error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: typedOrder.customer_email,
      subject: `Instrucciones de pago - Orden #${typedOrder.order_number}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending payment instructions email:', sendError)
      return false
    }

    console.log('Payment instructions email sent successfully:', data)
    return true
  } catch (error) {
    console.error('Error in sendPaymentInstructions:', error)
    return false
  }
}

/**
 * Sends order shipped notification to customer
 */
export async function sendOrderShipped(
  orderId: string,
  trackingNumber?: string,
  trackingUrl?: string
): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Error fetching order for shipped email:', error)
      return false
    }

    const emailHtml = await render(
      OrderShippedEmail({
        order: order as any,
        trackingNumber,
        trackingUrl,
      })
    )

    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: order.customer_email,
      subject: `Tu pedido #${order.order_number} ha sido enviado`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending shipped email:', sendError)
      return false
    }

    console.log('Shipped email sent successfully for order:', order.order_number)
    return true
  } catch (error) {
    console.error('Error in sendOrderShipped:', error)
    return false
  }
}

/**
 * Sends new order notification to admin
 */
export async function sendNewOrderAdmin(orderId: string): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items(*)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Error fetching order for admin notification:', error)
      return false
    }

    const typedOrder = order as unknown as OrderWithItems

    const emailHtml = await render(NewOrderAdminEmail({ order: typedOrder }))

    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `Nueva orden #${typedOrder.order_number} - ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(typedOrder.total_cents / 100)}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending admin notification:', sendError)
      return false
    }

    console.log('Admin notification sent for order:', typedOrder.order_number)
    return true
  } catch (error) {
    console.error('Error in sendNewOrderAdmin:', error)
    return false
  }
}

/**
 * Sends low stock alert to admin
 * Call this after a sale reduces stock below threshold
 */
export async function sendLowStockAlert(): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    const { data: products, error } = await supabase
      .from('products')
      .select('title, sku, stock_qty, low_stock_threshold')
      .eq('active', true)

    if (error) {
      console.error('Error fetching low stock products:', error)
      return false
    }

    // Filter products where stock_qty <= low_stock_threshold
    const lowStockProducts = (products || []).filter(
      (p: any) => p.stock_qty <= (p.low_stock_threshold || 5)
    )

    if (lowStockProducts.length === 0) {
      return true // No low stock, nothing to send
    }

    const emailHtml = await render(
      LowStockAlertEmail({ products: lowStockProducts as any })
    )

    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `Alerta: ${lowStockProducts.length} producto(s) con stock bajo`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending low stock alert:', sendError)
      return false
    }

    console.log('Low stock alert sent for', lowStockProducts.length, 'products')
    return true
  } catch (error) {
    console.error('Error in sendLowStockAlert:', error)
    return false
  }
}

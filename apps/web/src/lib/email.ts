import { Resend } from 'resend'
import { render } from '@react-email/render'
import OrderConfirmationEmail from '@/emails/order-confirmation'
import PaymentInstructionsEmail from '@/emails/payment-instructions'
import { getServiceSupabase } from './supabase'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
const fromEmail = process.env.RESEND_FROM_EMAIL || 'YB MOTOCOM <pedidos@ybmotocom.com>'

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

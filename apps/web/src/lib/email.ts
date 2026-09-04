import { Resend } from 'resend'
import { render } from '@react-email/render'
import OrderConfirmationEmail from '@/emails/order-confirmation'
import PaymentInstructionsEmail from '@/emails/payment-instructions'
import OrderShippedEmail from '@/emails/order-shipped'
import NewOrderAdminEmail from '@/emails/new-order-admin'
import LowStockAlertEmail from '@/emails/low-stock-alert'
import RestockNotificationEmail from '@/emails/restock-notification'
import DailyDigestEmail from '@/emails/daily-digest'
import ReviewRequestEmail from '@/emails/review-request'
import AbandonedCartEmail from '@/emails/abandoned-cart'
import WelcomeCouponEmail from '@/emails/welcome-coupon'
import { getServiceSupabase } from './supabase'
import { bogotaDateStr, BOGOTA_TZ } from './bogota-time'
import { BRAND } from '@/config/brand'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
const fromEmail = process.env.RESEND_FROM_EMAIL || BRAND.ordersFromAddress
const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || BRAND.supportEmail

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
    product_talla?: string | null
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
    const { data: orderData, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    // orders tiene dos relaciones hacia users (user_id, seller_id) — el
    // parser de tipos de postgrest-js no resuelve bien '*' en una tabla con
    // relaciones ambiguas hacia el mismo destino (ver docs/UNIFICACION_YJBMOTOCOM.md).
    const order = orderData as any

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
      .select('title, sku, stock_qty, low_stock_threshold, product_variants(stock_qty)')
      .eq('active', true)

    if (error) {
      console.error('Error fetching low stock products:', error)
      return false
    }

    // Un producto con tallas guarda su stock real en product_variants
    // (products.stock_qty se queda en 0 sin uso, igual que en
    // /admin/inventario y el Dashboard) — sin esto, CUALQUIER producto con
    // tallas activaba esta alerta después de cada venta, porque 0 siempre
    // es <= al umbral. Se compara el total consolidado de sus variantes
    // contra el umbral del producto, no products.stock_qty directo.
    const lowStockProducts = (products || [])
      .map((p: any) => {
        const hasVariants = p.product_variants && p.product_variants.length > 0
        const stock_qty = hasVariants
          ? p.product_variants.reduce((sum: number, v: any) => sum + v.stock_qty, 0)
          : p.stock_qty
        return { title: p.title, sku: p.sku, stock_qty, low_stock_threshold: p.low_stock_threshold }
      })
      .filter((p) => p.stock_qty <= (p.low_stock_threshold || 5))

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

/**
 * Sends restock notification emails to all subscribers of a product (o de
 * una talla puntual, si `variantId` viene informado — ver migración 00033)
 * and marks them as notified. Called from inventory adjust API.
 */
export async function sendRestockNotifications(productId: string, variantId?: string | null): Promise<number> {
  try {
    const supabase = getServiceSupabase()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || BRAND.domain

    // Get product info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, title, slug, price_cents, images')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      console.error('Product not found for restock notification:', productId)
      return 0
    }

    let talla: string | null = null
    if (variantId) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('talla')
        .eq('id', variantId)
        .single()
      talla = (variant as any)?.talla ?? null
    }

    // Get pending subscribers — de esta talla puntual, o del producto
    // completo si no tiene tallas (variant_id NULL en ambos casos).
    let subQuery = (supabase.from('restock_subscriptions') as any)
      .select('id, email')
      .eq('product_id', productId)
      .eq('notified', false)
    subQuery = variantId ? subQuery.eq('variant_id', variantId) : subQuery.is('variant_id', null)
    const { data: subscribers, error: subError } = await subQuery

    if (subError || !subscribers || subscribers.length === 0) return 0

    const productImage = Array.isArray(product.images) ? product.images[0] : null
    const displayTitle = talla ? `${product.title} (talla ${talla})` : product.title

    let sent = 0
    for (const sub of subscribers) {
      try {
        const emailHtml = await render(
          RestockNotificationEmail({
            productTitle: displayTitle,
            productSlug: product.slug,
            productImage,
            productPrice: product.price_cents,
            siteUrl,
          })
        )

        const { error: sendError } = await getResend().emails.send({
          from: fromEmail,
          to: sub.email,
          subject: `¡${displayTitle} ya está disponible! — ${BRAND.name}`,
          html: emailHtml,
        })

        if (!sendError) {
          // Mark as notified
          await (supabase.from('restock_subscriptions') as any)
            .update({ notified: true })
            .eq('id', sub.id)
          sent++
        }
      } catch (err) {
        console.error('Error sending restock email to', sub.email, err)
      }
    }

    console.log(`[Restock] Sent ${sent}/${subscribers.length} notifications for "${product.title}"`)
    return sent
  } catch (error) {
    console.error('Error in sendRestockNotifications:', error)
    return 0
  }
}

/**
 * Envía al admin el resumen diario de vencimientos (facturas por vencer,
 * notas con fecha límite próxima, fiados con más de 30 días pendientes) —
 * mismo contenido que las alertas de sesión (api/admin/session-alerts),
 * pero por email cada mañana, para que un vencimiento no pase inadvertido
 * un día que nadie entra al panel (mejora de la Fase 5, propuesta B.10).
 * Llamado desde api/cron/daily-digest.
 */
export async function sendDailyDigest(): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    const today = new Date()
    const todayStr = bogotaDateStr(today)
    const in7Days = bogotaDateStr(new Date(today.getTime() + 7 * 86_400_000))
    const in3Days = bogotaDateStr(new Date(today.getTime() + 3 * 86_400_000))

    const { data: invoicesData } = await supabase
      .from('supplier_invoices')
      .select('description, due_date')
      .eq('status', 'pending')
      .not('due_date', 'is', null)
      .lte('due_date', in7Days)
      .order('due_date', { ascending: true })
      .limit(8)

    const { data: notesData } = await supabase
      .from('notes')
      .select('text, due_date')
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lte('due_date', in3Days)
      .order('due_date', { ascending: true })
      .limit(6)

    const { data: creditsData } = await supabase
      .from('customer_credits')
      .select('customer_name, created_at')
      .eq('status', 'pending')

    const invoices = ((invoicesData || []) as { description: string; due_date: string }[]).map((f) => ({
      description: f.description,
      days: Math.round((new Date(f.due_date).getTime() - today.getTime()) / 86_400_000),
    }))

    const notes = ((notesData || []) as { text: string; due_date: string }[]).map((n) => ({
      text: n.text,
      dueDate: n.due_date,
    }))

    const oldCredits = ((creditsData || []) as { customer_name: string; created_at: string }[])
      .map((c) => ({
        customerName: c.customer_name,
        daysOld: Math.floor((today.getTime() - new Date(c.created_at).getTime()) / 86_400_000),
      }))
      .filter((c) => c.daysOld > 30)
      .sort((a, b) => b.daysOld - a.daysOld)
      .slice(0, 6)

    const total = invoices.length + notes.length + oldCredits.length
    if (total === 0) {
      console.log('[Daily Digest] Nada pendiente hoy, no se envía email')
      return true
    }

    const emailHtml = await render(DailyDigestEmail({ invoices, notes, oldCredits }))

    const { error } = await getResend().emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `Resumen del día ${todayStr} — ${total} pendiente${total !== 1 ? 's' : ''}`,
      html: emailHtml,
    })

    if (error) {
      console.error('Error sending daily digest:', error)
      return false
    }

    console.log(`[Daily Digest] Enviado — ${total} pendientes`)
    return true
  } catch (error) {
    console.error('Error in sendDailyDigest:', error)
    return false
  }
}

/**
 * Envía un email pidiendo reseña unos días después de que una orden queda
 * 'delivered' — aprovecha que verified_purchase ahora sí funciona de
 * verdad (migración 00034) para que la insignia "Compra verificada" tenga
 * sentido (mejora de la Fase 5, propuesta C.14). Llamado desde
 * api/cron/review-requests.
 */
export async function sendReviewRequestEmail(orderId: string): Promise<boolean> {
  try {
    const supabase = getServiceSupabase()
    const { data: order, error } = await supabase
      .from('orders')
      .select('customer_name, customer_email, order_items(product_title, products(slug))')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      console.error('Order not found for review request:', orderId)
      return false
    }

    const o = order as any
    const items = ((o.order_items || []) as any[])
      .filter((item) => item.products?.slug)
      .map((item) => ({ title: item.product_title, slug: item.products.slug }))

    if (items.length === 0) {
      // Ningún item de la orden tiene producto vinculado al catálogo
      // (ej. venta manual fuera de inventario) — no hay a dónde enlazar.
      return false
    }

    const emailHtml = await render(
      ReviewRequestEmail({ customerName: o.customer_name || 'Cliente', items })
    )

    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: o.customer_email,
      subject: `¿Qué te pareció tu compra? — ${BRAND.name}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending review request:', sendError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in sendReviewRequestEmail:', error)
    return false
  }
}

/**
 * Envía el cupón de bienvenida (10%, un solo uso) a un cliente recién
 * registrado — Fase 5 del plan de mejoras integrales (docs/
 * UNIFICACION_YJBMOTOCOM.md sección 80.9). Llamado desde
 * api/coupons/welcome/route.ts justo después de crear el cupón; no
 * bloquea la respuesta al cliente si falla (el código ya se muestra en
 * pantalla, este email es un respaldo).
 */
export async function sendWelcomeCouponEmail(params: {
  to: string
  name: string
  code: string
  validUntil: string
}): Promise<boolean> {
  try {
    const validUntilFormatted = new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: BOGOTA_TZ,
    }).format(new Date(params.validUntil))

    const emailHtml = await render(
      WelcomeCouponEmail({
        name: params.name,
        code: params.code,
        discountPct: 10,
        validUntilFormatted,
      })
    )

    const { error: sendError } = await getResend().emails.send({
      from: fromEmail,
      to: params.to,
      subject: `Tu código de bienvenida: ${params.code} — ${BRAND.name}`,
      html: emailHtml,
    })

    if (sendError) {
      console.error('Error sending welcome coupon email:', sendError)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in sendWelcomeCouponEmail:', error)
    return false
  }
}

/**
 * Envía el recordatorio de carrito abandonado (mejora de la Fase 5,
 * propuesta C.12). Llamado desde api/cron/abandoned-carts.
 */
export async function sendAbandonedCartReminder(
  email: string,
  items: { title: string; qty: number; price_cents: number }[],
  subtotalCents: number
): Promise<boolean> {
  try {
    const emailHtml = await render(AbandonedCartEmail({ items, subtotalCents }))

    const { error } = await getResend().emails.send({
      from: fromEmail,
      to: email,
      subject: `Dejaste algo en tu carrito — ${BRAND.name}`,
      html: emailHtml,
    })

    if (error) {
      console.error('Error sending abandoned cart reminder:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error in sendAbandonedCartReminder:', error)
    return false
  }
}

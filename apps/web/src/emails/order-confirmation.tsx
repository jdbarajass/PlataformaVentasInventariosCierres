// @ts-nocheck
import {
  Section,
  Text,
  Row,
  Column,
  Img,
  Button,
} from '@react-email/components'
import EmailLayout from './components/email-layout'

interface OrderItem {
  id: string
  product_title: string
  product_image: string | null
  product_talla?: string | null
  qty: number
  price_cents: number
  total_cents: number
}

interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  payment_status: string
  created_at: string
  order_items: OrderItem[]
}

interface OrderConfirmationEmailProps {
  order: Order
}

export default function OrderConfirmationEmail({
  order,
}: OrderConfirmationEmailProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <EmailLayout preview={`¡Gracias por tu compra! Orden #${order.order_number}`}>
      {/* Success Message */}
      <Section style={successSection}>
        <Text style={checkmark}>✅</Text>
        <Text style={successTitle}>¡Gracias por tu compra!</Text>
        <Text style={successText}>
          Tu orden ha sido confirmada y estamos procesando tu pago.
        </Text>
      </Section>

      {/* Order Number & Date */}
      <Section style={infoSection}>
        <Text style={orderNumber}>Orden #{order.order_number}</Text>
        <Text style={orderDate}>{formatDate(order.created_at)}</Text>
      </Section>

      {/* Order Items */}
      <Section style={itemsSection}>
        <Text style={sectionTitle}>Productos</Text>
        {order.order_items.map((item) => (
          <Row key={item.id} style={itemRow}>
            <Column style={itemImageCol}>
              {item.product_image && (
                <Img
                  src={item.product_image}
                  alt={item.product_title}
                  style={itemImage}
                />
              )}
            </Column>
            <Column style={itemDetailsCol}>
              <Text style={itemTitle}>{item.product_title}</Text>
              {item.product_talla && <Text style={itemQty}>Talla: {item.product_talla}</Text>}
              <Text style={itemQty}>Cantidad: {item.qty}</Text>
            </Column>
            <Column style={itemPriceCol}>
              <Text style={itemPrice}>{formatCurrency(item.total_cents)}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      {/* Order Totals */}
      <Section style={totalsSection}>
        <Row>
          <Column>
            <Text style={totalLabel}>Subtotal:</Text>
          </Column>
          <Column>
            <Text style={totalValue}>{formatCurrency(order.subtotal_cents)}</Text>
          </Column>
        </Row>
        <Row>
          <Column>
            <Text style={totalLabel}>Envío:</Text>
          </Column>
          <Column>
            <Text style={totalValue}>{formatCurrency(order.shipping_cents)}</Text>
          </Column>
        </Row>
        <Row style={grandTotalRow}>
          <Column>
            <Text style={grandTotalLabel}>Total:</Text>
          </Column>
          <Column>
            <Text style={grandTotalValue}>{formatCurrency(order.total_cents)}</Text>
          </Column>
        </Row>
      </Section>

      {/* Payment Status */}
      <Section style={statusSection}>
        <Text style={statusLabel}>Estado de pago:</Text>
        <Text style={statusValue}>
          {order.payment_status === 'paid' ? '✓ Pagado' : 'Pendiente'}
        </Text>
      </Section>

      {/* Next Steps */}
      <Section style={nextStepsSection}>
        <Text style={sectionTitle}>Próximos pasos</Text>
        <Text style={nextStepsText}>
          1. Recibirás un email cuando tu orden sea enviada
          <br />
          2. Podrás rastrear tu envío con el número de seguimiento
          <br />
          3. Tiempo estimado de entrega: 3-5 días hábiles
        </Text>
      </Section>

      {/* CTA Button */}
      <Section style={buttonSection}>
        <Button
          href={`${process.env.NEXT_PUBLIC_APP_URL}/orden/${order.id}/confirmacion`}
          style={button}
        >
          Ver detalles de la orden
        </Button>
      </Section>
    </EmailLayout>
  )
}

// Styles
const successSection = {
  textAlign: 'center' as const,
  padding: '32px 0',
}

const checkmark = {
  fontSize: '48px',
  margin: '0 0 16px',
}

const successTitle = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#333333',
  margin: '0 0 8px',
}

const successText = {
  fontSize: '16px',
  color: '#666666',
  margin: 0,
}

const infoSection = {
  textAlign: 'center' as const,
  padding: '0 0 24px',
}

const orderNumber = {
  fontSize: '20px',
  fontWeight: 'bold',
  color: '#333333',
  margin: '0 0 4px',
}

const orderDate = {
  fontSize: '14px',
  color: '#666666',
  margin: 0,
}

const itemsSection = {
  padding: '24px 0',
}

const sectionTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#333333',
  marginBottom: '16px',
}

const itemRow = {
  borderBottom: '1px solid #e6e6e6',
  padding: '16px 0',
}

const itemImageCol = {
  width: '80px',
  paddingRight: '16px',
}

const itemImage = {
  width: '64px',
  height: '64px',
  objectFit: 'cover' as const,
  borderRadius: '8px',
}

const itemDetailsCol = {
  verticalAlign: 'top' as const,
}

const itemTitle = {
  fontSize: '16px',
  fontWeight: '500',
  color: '#333333',
  margin: '0 0 4px',
}

const itemQty = {
  fontSize: '14px',
  color: '#666666',
  margin: 0,
}

const itemPriceCol = {
  textAlign: 'right' as const,
  verticalAlign: 'top' as const,
}

const itemPrice = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#333333',
  margin: 0,
}

const totalsSection = {
  padding: '24px 0',
  borderTop: '2px solid #e6e6e6',
}

const totalLabel = {
  fontSize: '14px',
  color: '#666666',
  margin: '8px 0',
}

const totalValue = {
  fontSize: '14px',
  color: '#333333',
  textAlign: 'right' as const,
  margin: '8px 0',
}

const grandTotalRow = {
  paddingTop: '8px',
  borderTop: '1px solid #e6e6e6',
}

const grandTotalLabel = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#333333',
  margin: '8px 0',
}

const grandTotalValue = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#06b6d4',
  textAlign: 'right' as const,
  margin: '8px 0',
}

const statusSection = {
  textAlign: 'center' as const,
  padding: '24px 0',
}

const statusLabel = {
  fontSize: '14px',
  color: '#666666',
  margin: '0 0 8px',
}

const statusValue = {
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#22c55e',
  margin: 0,
}

const nextStepsSection = {
  padding: '24px 0',
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '24px',
}

const nextStepsText = {
  fontSize: '14px',
  color: '#666666',
  lineHeight: '24px',
  margin: 0,
}

const buttonSection = {
  textAlign: 'center' as const,
  padding: '32px 0',
}

const button = {
  backgroundColor: '#06b6d4',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
}

import { Text, Section, Link } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface OrderShippedProps {
  order: {
    order_number: string
    customer_name: string
    shipping_address: { address?: string; city?: string } | null
    total_cents: number
  }
  trackingNumber?: string
  trackingUrl?: string
}

export default function OrderShippedEmail({ order, trackingNumber, trackingUrl }: OrderShippedProps) {
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  return (
    <EmailLayout preview={`Tu pedido #${order.order_number} ha sido enviado`}>
      <Text style={heading}>Tu pedido ha sido enviado</Text>

      <Text style={paragraph}>
        Hola {order.customer_name || 'Cliente'},
      </Text>

      <Text style={paragraph}>
        Tu pedido <strong>#{order.order_number}</strong> ha sido enviado y está en camino.
      </Text>

      {trackingNumber && (
        <Section style={trackingBox}>
          <Text style={trackingLabel}>Número de seguimiento</Text>
          <Text style={trackingValue}>{trackingNumber}</Text>
          {trackingUrl && (
            <Link href={trackingUrl} style={trackingLink}>
              Rastrear mi pedido
            </Link>
          )}
        </Section>
      )}

      {order.shipping_address && (
        <Section style={infoSection}>
          <Text style={infoLabel}>Dirección de entrega</Text>
          <Text style={infoValue}>
            {order.shipping_address.address}
            {order.shipping_address.city ? `, ${order.shipping_address.city}` : ''}
          </Text>
        </Section>
      )}

      <Section style={infoSection}>
        <Text style={infoLabel}>Total del pedido</Text>
        <Text style={infoValue}>{formatPrice(order.total_cents)}</Text>
      </Section>

      <Text style={paragraph}>
        Te notificaremos cuando tu pedido sea entregado. Si tienes alguna pregunta, no dudes en contactarnos.
      </Text>
    </EmailLayout>
  )
}

const heading = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  marginBottom: '16px',
}

const paragraph = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#4a4a4a',
}

const trackingBox = {
  backgroundColor: '#f0fdfa',
  border: '1px solid #06b6d4',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
}

const trackingLabel = {
  fontSize: '12px',
  color: '#666666',
  marginBottom: '4px',
  textTransform: 'uppercase' as const,
}

const trackingValue = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#0e7490',
  margin: '8px 0',
}

const trackingLink = {
  color: '#06b6d4',
  fontSize: '14px',
  textDecoration: 'underline',
}

const infoSection = {
  margin: '16px 0',
  padding: '12px 0',
  borderBottom: '1px solid #eee',
}

const infoLabel = {
  fontSize: '12px',
  color: '#666666',
  marginBottom: '4px',
}

const infoValue = {
  fontSize: '14px',
  color: '#1a1a1a',
  fontWeight: '500' as const,
}

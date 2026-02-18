import { Text, Section } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface NewOrderAdminProps {
  order: {
    order_number: string
    customer_name: string
    customer_email: string
    customer_phone: string | null
    payment_method: string
    total_cents: number
    created_at: string
    order_items: Array<{
      product_title: string
      qty: number
      price_cents: number
    }>
  }
}

export default function NewOrderAdminEmail({ order }: NewOrderAdminProps) {
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const paymentMethodLabels: Record<string, string> = {
    card: 'Tarjeta de crédito/débito',
    transfer: 'Transferencia bancaria',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    cash: 'Efectivo',
  }

  return (
    <EmailLayout preview={`Nueva orden #${order.order_number} - ${formatPrice(order.total_cents)}`}>
      <Text style={heading}>Nueva orden recibida</Text>

      <Section style={alertBox}>
        <Text style={alertText}>
          Se ha recibido una nueva orden por <strong>{formatPrice(order.total_cents)}</strong>
        </Text>
      </Section>

      <Section style={detailSection}>
        <Text style={sectionTitle}>Datos de la orden</Text>
        <table style={table}>
          <tbody>
            <tr>
              <td style={labelCell}>Número de orden</td>
              <td style={valueCell}>#{order.order_number}</td>
            </tr>
            <tr>
              <td style={labelCell}>Fecha</td>
              <td style={valueCell}>
                {new Date(order.created_at).toLocaleDateString('es-CO', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
            </tr>
            <tr>
              <td style={labelCell}>Método de pago</td>
              <td style={valueCell}>
                {paymentMethodLabels[order.payment_method] || order.payment_method}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section style={detailSection}>
        <Text style={sectionTitle}>Datos del cliente</Text>
        <table style={table}>
          <tbody>
            <tr>
              <td style={labelCell}>Nombre</td>
              <td style={valueCell}>{order.customer_name}</td>
            </tr>
            <tr>
              <td style={labelCell}>Email</td>
              <td style={valueCell}>{order.customer_email}</td>
            </tr>
            {order.customer_phone && (
              <tr>
                <td style={labelCell}>Teléfono</td>
                <td style={valueCell}>{order.customer_phone}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section style={detailSection}>
        <Text style={sectionTitle}>Productos</Text>
        <table style={table}>
          <thead>
            <tr>
              <th style={{ ...labelCell, fontWeight: 'bold' }}>Producto</th>
              <th style={{ ...labelCell, fontWeight: 'bold', textAlign: 'center' }}>Cant.</th>
              <th style={{ ...labelCell, fontWeight: 'bold', textAlign: 'right' }}>Precio</th>
            </tr>
          </thead>
          <tbody>
            {order.order_items?.map((item, i) => (
              <tr key={i}>
                <td style={valueCell}>{item.product_title}</td>
                <td style={{ ...valueCell, textAlign: 'center' }}>{item.qty}</td>
                <td style={{ ...valueCell, textAlign: 'right' }}>
                  {formatPrice(item.price_cents * item.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section style={totalSection}>
        <Text style={totalText}>
          Total: <strong>{formatPrice(order.total_cents)}</strong>
        </Text>
      </Section>

      <Text style={paragraph}>
        Accede al panel de administración para gestionar esta orden.
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

const alertBox = {
  backgroundColor: '#f0f9ff',
  border: '1px solid #2563eb',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
}

const alertText = {
  fontSize: '16px',
  color: '#1e40af',
  textAlign: 'center' as const,
  margin: 0,
}

const detailSection = {
  margin: '24px 0',
}

const sectionTitle = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#1a1a1a',
  marginBottom: '8px',
  borderBottom: '2px solid #06b6d4',
  paddingBottom: '4px',
}

const table = {
  width: '100%',
  borderCollapse: 'collapse' as const,
}

const labelCell = {
  fontSize: '13px',
  color: '#666666',
  padding: '6px 8px',
  borderBottom: '1px solid #eee',
}

const valueCell = {
  fontSize: '13px',
  color: '#1a1a1a',
  padding: '6px 8px',
  borderBottom: '1px solid #eee',
}

const totalSection = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
  textAlign: 'right' as const,
}

const totalText = {
  fontSize: '18px',
  color: '#1a1a1a',
  margin: 0,
}

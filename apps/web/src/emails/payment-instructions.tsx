import {
  Section,
  Text,
  Row,
  Column,
  Button,
} from '@react-email/components'
import EmailLayout from './components/email-layout'
import { BRAND } from '@/config/brand'

interface OrderItem {
  id: string
  product_title: string
  qty: number
  total_cents: number
}

interface Order {
  id: string
  order_number: string
  customer_name: string
  total_cents: number
  order_items: OrderItem[]
}

interface PaymentInstructionsEmailProps {
  order: Order
  paymentMethod: string
}

export default function PaymentInstructionsEmail({
  order,
  paymentMethod,
}: PaymentInstructionsEmailProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(cents / 100)
  }

  const getPaymentMethodName = (method: string) => {
    const methods: Record<string, string> = {
      transfer: 'Transferencia Bancaria',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
    }
    return methods[method] || method
  }

  const renderPaymentInstructions = () => {
    switch (paymentMethod) {
      case 'transfer':
        return (
          <Section style={instructionsBox}>
            <Text style={instructionsTitle}>Datos bancarios:</Text>
            <Text style={instructionsDetail}>
              <strong>Banco:</strong> {BRAND.payment.bank.bankName}
              <br />
              <strong>Tipo de cuenta:</strong> {BRAND.payment.bank.accountType}
              <br />
              <strong>Número de cuenta:</strong> {BRAND.payment.bank.accountNumber}
              <br />
              <strong>Titular:</strong> {BRAND.payment.bank.holderName}
              <br />
              <strong>NIT:</strong> {BRAND.payment.bank.nit}
            </Text>
            <Text style={referenceText}>
              <strong>Referencia de pago:</strong> {order.order_number}
            </Text>
            <Text style={warningText}>
              ⚠️ Es muy importante incluir el número de orden como referencia
            </Text>
          </Section>
        )

      case 'nequi':
        return (
          <Section style={instructionsBox}>
            <Text style={instructionsTitle}>Instrucciones Nequi:</Text>
            <Text style={instructionsDetail}>
              <strong>Número de celular:</strong> {BRAND.payment.nequi.phone}
              <br />
              <strong>Nombre:</strong> {BRAND.payment.nequi.name}
            </Text>
            <Text style={referenceText}>
              <strong>Referencia de pago:</strong> {order.order_number}
            </Text>
            <Text style={warningText}>
              ⚠️ Incluye el número de orden en el campo de descripción o mensaje
            </Text>
          </Section>
        )

      case 'daviplata':
        return (
          <Section style={instructionsBox}>
            <Text style={instructionsTitle}>Instrucciones Daviplata:</Text>
            <Text style={instructionsDetail}>
              <strong>Número de celular:</strong> {BRAND.payment.daviplata.phone}
              <br />
              <strong>Nombre:</strong> {BRAND.payment.daviplata.name}
            </Text>
            <Text style={referenceText}>
              <strong>Referencia de pago:</strong> {order.order_number}
            </Text>
            <Text style={warningText}>
              ⚠️ Incluye el número de orden en el campo de descripción o mensaje
            </Text>
          </Section>
        )

      default:
        return null
    }
  }

  return (
    <EmailLayout
      preview={`Instrucciones de pago para orden #${order.order_number}`}
    >
      {/* Header */}
      <Section style={headerSection}>
        <Text style={headerTitle}>Instrucciones de Pago</Text>
        <Text style={headerText}>
          ¡Gracias por tu compra! A continuación encontrarás las instrucciones
          para completar tu pago.
        </Text>
      </Section>

      {/* Order Summary */}
      <Section style={summarySection}>
        <Text style={sectionTitle}>Resumen de tu orden</Text>
        <Text style={orderNumber}>Orden #{order.order_number}</Text>
        <Text style={itemCount}>
          {order.order_items.length} producto
          {order.order_items.length !== 1 ? 's' : ''}
        </Text>
      </Section>

      {/* Payment Method */}
      <Section style={paymentMethodSection}>
        <Text style={paymentMethodLabel}>Método de pago seleccionado:</Text>
        <Text style={paymentMethodValue}>
          {getPaymentMethodName(paymentMethod)}
        </Text>
      </Section>

      {/* Total Amount */}
      <Section style={totalSection}>
        <Text style={totalLabel}>Total a pagar:</Text>
        <Text style={totalAmount}>{formatCurrency(order.total_cents)}</Text>
      </Section>

      {/* Payment Instructions */}
      {renderPaymentInstructions()}

      {/* Next Steps */}
      <Section style={nextStepsSection}>
        <Text style={sectionTitle}>Próximos pasos</Text>
        <Text style={stepText}>
          <strong>1.</strong> Realiza el pago usando los datos proporcionados
          <br />
          <strong>2.</strong> Asegúrate de incluir la referencia de pago
          <br />
          <strong>3.</strong> Confirmaremos tu pago en 1-2 horas hábiles
          <br />
          <strong>4.</strong> Recibirás un email cuando procesemos tu pedido
        </Text>
      </Section>

      {/* Deadline Notice */}
      <Section style={deadlineSection}>
        <Text style={deadlineText}>
          ⏰ Por favor completa tu pago dentro de las próximas 48 horas para
          mantener tu orden.
        </Text>
      </Section>

      {/* CTA Button */}
      <Section style={buttonSection}>
        <Button
          href={`${process.env.NEXT_PUBLIC_APP_URL}/orden/${order.id}/confirmacion`}
          style={button}
        >
          Ver mi orden
        </Button>
      </Section>

      {/* Help Section */}
      <Section style={helpSection}>
        <Text style={helpText}>
          ¿Tienes alguna pregunta? Visita nuestra página de contacto o responde
          a este email.
        </Text>
      </Section>
    </EmailLayout>
  )
}

// Styles
const headerSection = {
  textAlign: 'center' as const,
  padding: '32px 0 24px',
}

const headerTitle = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#333333',
  margin: '0 0 12px',
}

const headerText = {
  fontSize: '16px',
  color: '#666666',
  margin: 0,
  lineHeight: '24px',
}

const summarySection = {
  padding: '24px 0',
  borderBottom: '1px solid #e6e6e6',
}

const sectionTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#333333',
  marginBottom: '12px',
}

const orderNumber = {
  fontSize: '16px',
  fontWeight: '500',
  color: '#06b6d4',
  margin: '0 0 4px',
}

const itemCount = {
  fontSize: '14px',
  color: '#666666',
  margin: 0,
}

const paymentMethodSection = {
  textAlign: 'center' as const,
  padding: '24px 0',
}

const paymentMethodLabel = {
  fontSize: '14px',
  color: '#666666',
  margin: '0 0 8px',
}

const paymentMethodValue = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#333333',
  margin: 0,
}

const totalSection = {
  textAlign: 'center' as const,
  padding: '24px',
  backgroundColor: '#f0f9ff',
  borderRadius: '8px',
  margin: '16px 0',
}

const totalLabel = {
  fontSize: '16px',
  color: '#666666',
  margin: '0 0 8px',
}

const totalAmount = {
  fontSize: '32px',
  fontWeight: 'bold',
  color: '#06b6d4',
  margin: 0,
}

const instructionsBox = {
  backgroundColor: '#fef3c7',
  border: '2px solid #fbbf24',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
}

const instructionsTitle = {
  fontSize: '18px',
  fontWeight: 'bold',
  color: '#92400e',
  margin: '0 0 16px',
}

const instructionsDetail = {
  fontSize: '14px',
  color: '#78350f',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const referenceText = {
  fontSize: '16px',
  color: '#78350f',
  backgroundColor: '#fef9f2',
  padding: '12px',
  borderRadius: '4px',
  margin: '0 0 12px',
}

const warningText = {
  fontSize: '14px',
  color: '#92400e',
  fontWeight: 'bold',
  margin: 0,
}

const nextStepsSection = {
  padding: '24px 0',
}

const stepText = {
  fontSize: '14px',
  color: '#666666',
  lineHeight: '28px',
  margin: 0,
}

const deadlineSection = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
}

const deadlineText = {
  fontSize: '14px',
  color: '#991b1b',
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
  padding: '12px 32px',
}

const helpSection = {
  textAlign: 'center' as const,
  padding: '24px 0',
}

const helpText = {
  fontSize: '14px',
  color: '#666666',
  margin: 0,
  lineHeight: '20px',
}

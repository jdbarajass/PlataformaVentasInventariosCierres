// @ts-nocheck
import { Section, Text } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface WelcomeCouponProps {
  name: string
  code: string
  discountPct: number
  validUntilFormatted: string
}

export default function WelcomeCouponEmail({ name, code, discountPct, validUntilFormatted }: WelcomeCouponProps) {
  return (
    <EmailLayout preview={`Tu código de bienvenida: ${code} — ${discountPct}% en tu primera compra`}>
      <Section style={{ textAlign: 'center', paddingBottom: '16px' }}>
        <Text style={title}>¡Bienvenido a YJBMOTOCOM, {name}!</Text>
        <Text style={subtitle}>Aquí tienes un descuento para tu primera compra.</Text>
      </Section>

      <Section style={couponBox}>
        <Text style={couponLabel}>Tu código</Text>
        <Text style={couponCode}>{code}</Text>
        <Text style={couponDiscount}>{discountPct}% de descuento</Text>
      </Section>

      <Section style={{ textAlign: 'center', paddingTop: '8px' }}>
        <Text style={footnote}>
          Válido hasta el {validUntilFormatted}, en cualquier compra, sin monto mínimo. Un solo uso.
        </Text>
      </Section>
    </EmailLayout>
  )
}

const title = { fontSize: '20px', fontWeight: 'bold', color: '#333333', margin: '0 0 8px' }
const subtitle = { fontSize: '14px', color: '#666666', margin: 0 }
const couponBox = {
  textAlign: 'center' as const,
  padding: '20px',
  borderRadius: '12px',
  border: '2px dashed #06b6d4',
  background: '#f0fdff',
  margin: '8px 0',
}
const couponLabel = { fontSize: '12px', color: '#666666', margin: '0 0 4px', textTransform: 'uppercase' as const }
const couponCode = { fontSize: '26px', fontWeight: 'bold', color: '#0891b2', letterSpacing: '1px', margin: '0 0 4px' }
const couponDiscount = { fontSize: '15px', fontWeight: 'bold', color: '#333333', margin: 0 }
const footnote = { fontSize: '12px', color: '#999999', margin: 0 }

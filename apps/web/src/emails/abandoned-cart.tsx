// @ts-nocheck
import { Section, Text, Button } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface AbandonedCartProps {
  items: { title: string; qty: number; price_cents: number }[]
  subtotalCents: number
  siteUrl?: string
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(cents / 100)

export default function AbandonedCartEmail({ items, subtotalCents, siteUrl = 'https://yjbmotocom.com' }: AbandonedCartProps) {
  return (
    <EmailLayout preview="Dejaste productos en tu carrito — todavía están disponibles">
      <Section style={{ textAlign: 'center', paddingBottom: '16px' }}>
        <Text style={title}>¿Olvidaste algo?</Text>
        <Text style={subtitle}>Dejaste estos productos en tu carrito. Todavía están disponibles.</Text>
      </Section>

      <Section style={{ padding: '8px 0' }}>
        {items.map((item, i) => (
          <Text key={i} style={item.title.length > 40 ? itemSmall : itemLine}>
            {item.qty}x {item.title} — {formatPrice(item.price_cents * item.qty)}
          </Text>
        ))}
      </Section>

      <Section style={{ textAlign: 'center', paddingTop: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', color: '#333333', margin: '0 0 16px' }}>
          Subtotal: {formatPrice(subtotalCents)}
        </Text>
        <Button href={siteUrl} style={button}>
          Volver a la tienda
        </Button>
      </Section>
    </EmailLayout>
  )
}

const title = { fontSize: '22px', fontWeight: 'bold', color: '#333333', margin: '0 0 4px' }
const subtitle = { fontSize: '14px', color: '#666666', margin: 0 }
const itemLine = { fontSize: '14px', color: '#444444', margin: '0 0 6px' }
const itemSmall = { fontSize: '13px', color: '#444444', margin: '0 0 6px' }
const button = {
  background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}

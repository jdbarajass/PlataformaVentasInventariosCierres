// @ts-nocheck
import { Section, Text, Button } from '@react-email/components'
import EmailLayout from './components/email-layout'
import { BRAND } from '@/config/brand'

interface ReviewRequestProps {
  customerName: string
  items: { title: string; slug: string }[]
  siteUrl?: string
}

export default function ReviewRequestEmail({ customerName, items, siteUrl = BRAND.domain }: ReviewRequestProps) {
  return (
    <EmailLayout preview="¿Qué te pareció tu compra? Cuéntanos en una reseña">
      <Section style={{ textAlign: 'center', paddingBottom: '16px' }}>
        <Text style={title}>¿Qué te pareció tu compra, {customerName}?</Text>
        <Text style={subtitle}>Tu opinión ayuda a otros motociclistas a elegir mejor.</Text>
      </Section>

      <Section style={{ padding: '16px 0' }}>
        {items.slice(0, 3).map((item, i) => (
          <Section key={i} style={{ textAlign: 'center', paddingBottom: '12px' }}>
            <Text style={itemTitle}>{item.title}</Text>
            <Button href={`${siteUrl}/producto/${item.slug}`} style={button}>
              Dejar una reseña
            </Button>
          </Section>
        ))}
      </Section>

      <Section style={{ textAlign: 'center', paddingTop: '8px' }}>
        <Text style={footnote}>Solo toma un minuto — gracias por confiar en {BRAND.name}.</Text>
      </Section>
    </EmailLayout>
  )
}

const title = { fontSize: '20px', fontWeight: 'bold', color: '#333333', margin: '0 0 8px' }
const subtitle = { fontSize: '14px', color: '#666666', margin: 0 }
const itemTitle = { fontSize: '15px', fontWeight: 'bold', color: '#333333', margin: '0 0 10px' }
const footnote = { fontSize: '12px', color: '#999999', margin: 0 }
const button = {
  background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
  color: '#ffffff',
  padding: '10px 24px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}

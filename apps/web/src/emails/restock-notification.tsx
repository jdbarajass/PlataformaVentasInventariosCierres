// @ts-nocheck
import { Section, Text, Button, Img } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface RestockNotificationProps {
  productTitle: string
  productSlug: string
  productImage?: string | null
  productPrice: number
  siteUrl?: string
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    cents / 100
  )

export default function RestockNotificationEmail({
  productTitle,
  productSlug,
  productImage,
  productPrice,
  siteUrl = 'https://yjbmotocom.com',
}: RestockNotificationProps) {
  const productUrl = `${siteUrl}/producto/${productSlug}`

  return (
    <EmailLayout previewText={`¡${productTitle} ya está disponible! Cómpralo antes de que se agote.`}>
      <Section style={{ textAlign: 'center', paddingBottom: '24px' }}>
        <Text
          style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#06b6d4',
            margin: '0 0 8px',
          }}
        >
          ¡Ya está disponible!
        </Text>
        <Text
          style={{
            fontSize: '16px',
            color: '#94a3b8',
            margin: '0',
          }}
        >
          El producto que esperabas está de vuelta en stock
        </Text>
      </Section>

      {productImage && (
        <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Img
            src={productImage}
            alt={productTitle}
            width="200"
            height="200"
            style={{ objectFit: 'contain', borderRadius: '12px', background: '#f8fafc' }}
          />
        </Section>
      )}

      <Section
        style={{
          background: '#1e293b',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          textAlign: 'center',
        }}
      >
        <Text
          style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#f1f5f9',
            margin: '0 0 8px',
          }}
        >
          {productTitle}
        </Text>
        <Text
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#06b6d4',
            margin: '0 0 20px',
          }}
        >
          {formatPrice(productPrice)}
        </Text>
        <Button
          href={productUrl}
          style={{
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            color: '#ffffff',
            padding: '14px 32px',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Comprar ahora
        </Button>
      </Section>

      <Section>
        <Text
          style={{
            fontSize: '14px',
            color: '#64748b',
            textAlign: 'center',
            margin: '0',
          }}
        >
          Date prisa — el stock puede agotarse rápidamente.
        </Text>
        <Text
          style={{
            fontSize: '12px',
            color: '#475569',
            textAlign: 'center',
            margin: '16px 0 0',
          }}
        >
          Recibiste este email porque solicitaste notificación de disponibilidad para este producto.
        </Text>
      </Section>
    </EmailLayout>
  )
}

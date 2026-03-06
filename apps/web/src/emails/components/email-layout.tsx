import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Text,
  Link,
  Hr,
} from '@react-email/components'

interface EmailLayoutProps {
  children: React.ReactNode
  preview?: string
}

export default function EmailLayout({ children, preview }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={logoText}>YJBMOTOCOM</Text>
            <Text style={tagline}>Accesorios para Motos</Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              YJBMOTOCOM - Tienda de Accesorios para Motociclistas
            </Text>
            <Text style={footerText}>
              <Link href={process.env.NEXT_PUBLIC_APP_URL} style={link}>
                Visitar nuestra tienda
              </Link>
            </Text>
            <Text style={footerSmall}>
              Este es un email automático, por favor no responder.
              <br />
              Si tienes alguna consulta, contáctanos a través de nuestra página web.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const header = {
  padding: '32px 24px',
  backgroundColor: '#0A0A0F',
  textAlign: 'center' as const,
}

const logoText = {
  color: '#06b6d4',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '0 0 8px',
  background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

const tagline = {
  color: '#ffffff',
  fontSize: '14px',
  margin: 0,
}

const content = {
  padding: '24px',
}

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
}

const footerText = {
  color: '#666666',
  fontSize: '14px',
  marginTop: '12px',
}

const footerSmall = {
  color: '#999999',
  fontSize: '12px',
  marginTop: '24px',
  lineHeight: '16px',
}

const hr = {
  borderColor: '#e6e6e6',
  margin: '20px 0',
}

const link = {
  color: '#06b6d4',
  textDecoration: 'underline',
}

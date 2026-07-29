// @ts-nocheck
import { Section, Text } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface DailyDigestProps {
  invoices: { description: string; days: number }[]
  notes: { text: string; dueDate: string }[]
  oldCredits: { customerName: string; daysOld: number }[]
}

export default function DailyDigestEmail({ invoices, notes, oldCredits }: DailyDigestProps) {
  const total = invoices.length + notes.length + oldCredits.length

  return (
    <EmailLayout preview={`${total} pendiente${total !== 1 ? 's' : ''} por revisar hoy`}>
      <Section style={{ textAlign: 'center', paddingBottom: '16px' }}>
        <Text style={title}>Resumen de vencimientos</Text>
        <Text style={subtitle}>Lo que necesita tu atención hoy</Text>
      </Section>

      {invoices.length > 0 && (
        <Section style={block}>
          <Text style={blockTitle}>📄 Facturas por vencer ({invoices.length})</Text>
          {invoices.map((f, i) => (
            <Text key={i} style={item}>
              {f.description} — {f.days < 0 ? `vencida hace ${Math.abs(f.days)} día(s)` : f.days === 0 ? 'vence hoy' : `vence en ${f.days} día(s)`}
            </Text>
          ))}
        </Section>
      )}

      {notes.length > 0 && (
        <Section style={block}>
          <Text style={blockTitle}>📝 Notas con fecha límite próxima ({notes.length})</Text>
          {notes.map((n, i) => (
            <Text key={i} style={item}>{n.text} — {n.dueDate}</Text>
          ))}
        </Section>
      )}

      {oldCredits.length > 0 && (
        <Section style={block}>
          <Text style={blockTitle}>💳 Fiados con más de 30 días pendientes ({oldCredits.length})</Text>
          {oldCredits.map((c, i) => (
            <Text key={i} style={item}>{c.customerName} — {c.daysOld} días</Text>
          ))}
        </Section>
      )}

      {total === 0 && (
        <Section style={{ textAlign: 'center', padding: '16px 0' }}>
          <Text style={item}>Sin pendientes urgentes hoy. 🎉</Text>
        </Section>
      )}
    </EmailLayout>
  )
}

const title = { fontSize: '22px', fontWeight: 'bold', color: '#333333', margin: '0 0 4px' }
const subtitle = { fontSize: '14px', color: '#666666', margin: 0 }
const block = { padding: '12px 0', borderTop: '1px solid #e6e6e6' }
const blockTitle = { fontSize: '15px', fontWeight: 'bold', color: '#333333', margin: '0 0 8px' }
const item = { fontSize: '13px', color: '#444444', margin: '0 0 6px' }

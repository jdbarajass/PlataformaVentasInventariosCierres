import { Text, Section } from '@react-email/components'
import EmailLayout from './components/email-layout'

interface LowStockAlertProps {
  products: Array<{
    title: string
    sku: string | null
    stock_qty: number
    low_stock_threshold: number
  }>
}

export default function LowStockAlertEmail({ products }: LowStockAlertProps) {
  return (
    <EmailLayout preview={`Alerta: ${products.length} producto(s) con stock bajo`}>
      <Text style={heading}>Alerta de stock bajo</Text>

      <Section style={alertBox}>
        <Text style={alertText}>
          {products.length} producto{products.length > 1 ? 's' : ''} con stock bajo o agotado
        </Text>
      </Section>

      <Text style={paragraph}>
        Los siguientes productos han alcanzado su umbral mínimo de stock y necesitan reabastecimiento:
      </Text>

      <Section style={tableContainer}>
        <table style={table}>
          <thead>
            <tr>
              <th style={thCell}>Producto</th>
              <th style={thCell}>SKU</th>
              <th style={{ ...thCell, textAlign: 'center' }}>Stock</th>
              <th style={{ ...thCell, textAlign: 'center' }}>Umbral</th>
              <th style={{ ...thCell, textAlign: 'center' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, i) => (
              <tr key={i} style={i % 2 === 0 ? evenRow : {}}>
                <td style={tdCell}>{product.title}</td>
                <td style={tdCell}>{product.sku || '-'}</td>
                <td style={{ ...tdCell, textAlign: 'center', fontWeight: 'bold' }}>
                  <span style={product.stock_qty === 0 ? criticalText : warningText}>
                    {product.stock_qty}
                  </span>
                </td>
                <td style={{ ...tdCell, textAlign: 'center' }}>{product.low_stock_threshold}</td>
                <td style={{ ...tdCell, textAlign: 'center' }}>
                  {product.stock_qty === 0 ? (
                    <span style={criticalBadge}>AGOTADO</span>
                  ) : (
                    <span style={warningBadge}>BAJO</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Text style={paragraph}>
        Accede al panel de administración para actualizar el inventario de estos productos.
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
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '8px',
  padding: '16px',
  margin: '16px 0',
}

const alertText = {
  fontSize: '16px',
  color: '#92400e',
  textAlign: 'center' as const,
  margin: 0,
  fontWeight: 'bold' as const,
}

const tableContainer = {
  margin: '24px 0',
}

const table = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  border: '1px solid #e5e7eb',
}

const thCell = {
  fontSize: '12px',
  color: '#374151',
  padding: '10px 8px',
  backgroundColor: '#f9fafb',
  borderBottom: '2px solid #e5e7eb',
  textAlign: 'left' as const,
  fontWeight: 'bold' as const,
}

const tdCell = {
  fontSize: '13px',
  color: '#1a1a1a',
  padding: '8px',
  borderBottom: '1px solid #e5e7eb',
}

const evenRow = {
  backgroundColor: '#f9fafb',
}

const warningText = {
  color: '#d97706',
}

const criticalText = {
  color: '#dc2626',
}

const warningBadge = {
  backgroundColor: '#fef3c7',
  color: '#92400e',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold' as const,
}

const criticalBadge = {
  backgroundColor: '#fee2e2',
  color: '#991b1b',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 'bold' as const,
}

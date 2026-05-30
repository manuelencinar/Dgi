'use client'

export default function CarteraTab({ plan }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ fontSize: 40, marginBottom: 16 }}>📂</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#e0e8f0', marginBottom: 8 }}>
        Cartera personal
      </p>
      <p style={{ fontSize: 13, color: '#4a5270', maxWidth: 340, margin: '0 auto 20px' }}>
        Registra las acciones que tienes, el precio de compra y las comisiones pagadas.
        Verás tu rentabilidad actualizada y los dividendos cobrados.
      </p>
      <span style={{
        display: 'inline-block', fontSize: 11, fontWeight: 700,
        color: '#818cf8', background: 'rgba(99,102,241,0.12)',
        padding: '4px 12px', borderRadius: 20,
        border: '1px solid rgba(99,102,241,0.25)',
      }}>
        Próximamente
      </span>
    </div>
  )
}

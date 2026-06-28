import Link from 'next/link'

export const metadata = { title: 'Página no encontrada — EverDiv' }

// 404 con la marca. Antes una ruta inexistente caía en el 404 genérico de Next.
export default function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 14 }}>
      <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--accent)' }}>404</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>Esta página no existe</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
        El enlace puede estar roto o la página se ha movido. Prueba desde el inicio o el screener.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/" style={{ padding: '9px 20px', background: 'var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Ir al inicio
        </Link>
        <Link href="/screener" style={{ padding: '9px 20px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Ver el screener
        </Link>
      </div>
    </div>
  )
}

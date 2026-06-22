import Link from 'next/link'

export const metadata = { title: 'Página no encontrada — Mi Índice DGI' }

// 404 con la marca. Antes una ruta inexistente caía en el 404 genérico de Next.
export default function NotFound() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 14 }}>
      <div style={{ fontSize: 44, fontWeight: 900, color: '#818cf8' }}>404</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e0e8f0', margin: 0 }}>Esta página no existe</h2>
      <p style={{ fontSize: 14, color: '#8090a8', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
        El enlace puede estar roto o la página se ha movido. Prueba desde el inicio o el screener.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/" style={{ padding: '9px 20px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Ir al inicio
        </Link>
        <Link href="/screener" style={{ padding: '9px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#c8d0e0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Ver el screener
        </Link>
      </div>
    </div>
  )
}

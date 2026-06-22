'use client'
// Captura errores en el layout raíz. Reemplaza al root layout cuando se activa,
// así que debe definir su propio <html>/<body> y estilos inline (no hereda nada).
import { useEffect } from 'react'

export default function GlobalError({ error, reset, unstable_retry }) {
  const retry = unstable_retry || reset
  useEffect(() => { console.error('[global error boundary]', error) }, [error])

  return (
    <html lang="es">
      <body style={{ background: '#080b14', color: '#c8d0e0', margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        <title>Error — Mi Índice DGI</title>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 14 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e0e8f0', margin: 0 }}>Algo ha fallado</h2>
          <p style={{ fontSize: 14, color: '#8090a8', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
            Ha ocurrido un error inesperado. Reintenta o recarga la página.
          </p>
          {error?.digest && (
            <p style={{ fontSize: 11, color: '#4a5270', fontFamily: 'monospace' }}>ref: {error.digest}</p>
          )}
          <button onClick={() => retry?.()} style={{ marginTop: 4, padding: '9px 20px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}

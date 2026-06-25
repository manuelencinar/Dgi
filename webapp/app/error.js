'use client' // Los error boundaries deben ser Client Components
import { useEffect } from 'react'
import Link from 'next/link'

// Captura errores de runtime en cualquier segmento de la app (no la raíz; eso lo
// hace global-error.js). Antes un throw en un server component dejaba pantalla en
// blanco; ahora se muestra un fallback con la marca y opción de reintentar.
export default function Error({ error, reset, unstable_retry }) {
  const retry = unstable_retry || reset
  useEffect(() => {
    // Telemetría best-effort. Sustituir por Sentry/PostHog cuando se configure.
    console.error('[app error boundary]', error)
  }, [error])

  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, gap: 14 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>Algo ha fallado</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
        Ha ocurrido un error inesperado al cargar esta sección. Puedes reintentar; si persiste, vuelve al inicio.
      </p>
      {error?.digest && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>ref: {error.digest}</p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => retry?.()} style={{ padding: '9px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Reintentar
        </button>
        <Link href="/" style={{ padding: '9px 20px', background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}

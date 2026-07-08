'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// Aviso de cookies ligero. Guarda la elección en localStorage; el consentimiento
// de analítica queda registrado en `everdiv:cookies:v1` = 'all' | 'essential'
// para poder condicionar las cookies no esenciales (analítica) cuando se activen.
const KEY = 'everdiv:cookies:v1'

export default function CookieNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true) } catch {}
  }, [])

  const choose = (v) => {
    try { localStorage.setItem(KEY, v) } catch {}
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 200,
      maxWidth: 640, margin: '0 auto',
      background: 'var(--bg-elev)', border: '1px solid var(--border-strong)',
      borderRadius: 14, padding: '16px 18px', boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, flex: '1 1 300px', margin: 0 }}>
        Usamos cookies necesarias para que EverDiv funcione y, solo con tu permiso, cookies de analítica para mejorar la app.{' '}
        <Link href="/cookies" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Más información</Link>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={() => choose('essential')} style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'transparent',
          border: '1px solid var(--border-strong)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer',
        }}>Solo necesarias</button>
        <button onClick={() => choose('all')} style={{
          fontSize: 13, fontWeight: 800, color: '#fff', background: 'var(--accent)',
          border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
        }}>Aceptar</button>
      </div>
    </div>
  )
}

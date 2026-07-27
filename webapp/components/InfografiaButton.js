'use client'
import { useState } from 'react'

// Botón "Descargar infografía" (PDF). Llama al endpoint correspondiente, recibe el blob y
// dispara la descarga. La infografía es Premium: si el server responde 403, avisa con CTA.
// - Comparador:  <InfografiaButton kind="comparador" tickers={['KO','PEP']} />
// - Ficha:       <InfografiaButton kind="empresa" ticker="KO" />
export default function InfografiaButton({ kind, tickers, ticker, isPremium = true, style, className }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const href = kind === 'comparador'
    ? `/api/infografia/comparador?tickers=${encodeURIComponent((tickers || []).slice(0, 2).join(','))}`
    : `/api/infografia/empresa?ticker=${encodeURIComponent(ticker || '')}`

  const disabled = kind === 'comparador' ? (tickers || []).length < 2 : !ticker

  const download = async () => {
    setErr(null); setLoading(true)
    try {
      const res = await fetch(href)
      if (res.status === 403) {
        setErr('La infografía en PDF es una función Premium.')
        return
      }
      if (!res.ok) { setErr('No se pudo generar la infografía.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = kind === 'comparador'
        ? `EverDiv-${(tickers || []).slice(0, 2).join('-vs-')}.pdf`
        : `EverDiv-${ticker}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErr('No se pudo generar la infografía.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={download} disabled={disabled || loading} className={className}
        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled || loading ? 'default' : 'pointer', ...style }}>
        {loading ? '⏳ Generando…' : '📄 Descargar infografía'}
      </button>
      {err && <span style={{ fontSize: 10.5, color: 'var(--warning)' }}>{err} <a href="/pricing" style={{ color: 'var(--accent)', fontWeight: 700 }}>Ver Premium</a></span>}
    </span>
  )
}

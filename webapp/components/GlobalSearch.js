'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const TYPE_META = {
  company: { icon: '🏢', label: 'Empresa', color: '#818cf8' },
  etf:     { icon: '📊', label: 'ETF',     color: '#34d399' },
  fund:    { icon: '📦', label: 'Fondo',   color: '#34d399' },
  index:   { icon: '🌐', label: 'Índice',  color: '#fbbf24' },
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const router = useRouter()

  // Lista plana de resultados (para navegación con teclado)
  const flat = results

  const close = useCallback(() => {
    setOpen(false)
    setQ('')
    setResults([])
    setActive(0)
  }, [])

  // Atajo de teclado para abrir: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Foco al abrir
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 1) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const id = setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort()
        const ctrl = new AbortController()
        abortRef.current = ctrl
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const data = await res.json()
        const merged = [
          ...(data.companies || []),
          ...(data.indices || []),
          ...(data.funds || []),
        ]
        setResults(merged)
        setActive(0)
      } catch (e) {
        if (e?.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => clearTimeout(id)
  }, [q, open])

  const go = useCallback((item) => {
    if (!item) return
    close()
    router.push(item.href)
  }, [close, router])

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]) }
  }

  return (
    <>
      {/* Botón lupa */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        title="Buscar (Ctrl/⌘ K)"
        style={{
          background: 'none', border: 'none', color: '#4a5270', fontSize: 16,
          cursor: 'pointer', padding: '5px 7px', borderRadius: 7, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center',
        }}
      >🔍</button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(4,6,12,0.72)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            paddingTop: 'min(14vh, 110px)', paddingLeft: 16, paddingRight: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 560,
              background: '#0d1322', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
            }}
          >
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 16, opacity: 0.6 }}>🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Buscar empresa, ETF, fondo o índice…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#e0e8f0', fontSize: 15, fontFamily: 'inherit',
                }}
              />
              {loading && <span style={{ fontSize: 11, color: '#4a5270' }}>…</span>}
              <button onClick={close} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#4a5270', fontSize: 14, cursor: 'pointer', padding: 2 }}>✕</button>
            </div>

            {/* Resultados */}
            <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {q.trim().length >= 1 && !loading && flat.length === 0 && (
                <div style={{ padding: '26px 16px', textAlign: 'center', color: '#4a5270', fontSize: 13 }}>
                  Sin resultados para “{q.trim()}”
                </div>
              )}
              {q.trim().length < 1 && (
                <div style={{ padding: '22px 16px', textAlign: 'center', color: '#3a4258', fontSize: 12.5 }}>
                  Escribe un nombre o ticker. Empresas, ETFs, fondos e índices.
                </div>
              )}
              {flat.map((item, i) => {
                const meta = TYPE_META[item.type] || TYPE_META.company
                const isActive = i === active
                return (
                  <button
                    key={`${item.type}-${item.ticker}-${i}`}
                    onClick={() => go(item)}
                    onMouseEnter={() => setActive(i)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                      borderLeft: isActive ? `2px solid ${meta.color}` : '2px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>{meta.icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', color: '#e0e8f0', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                      {item.sub && <span style={{ display: 'block', color: '#4a5270', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</span>}
                    </span>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#8a93ab', fontVariantNumeric: 'tabular-nums' }}>{item.ticker}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: meta.color, background: `${meta.color}1f`, borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>{meta.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Pie */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 14, fontSize: 10.5, color: '#3a4258' }}>
              <span>↑↓ navegar</span>
              <span>↵ abrir</span>
              <span>esc cerrar</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

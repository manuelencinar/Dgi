'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DICT } from '@/data/dict'

const CURRENCIES = [{ v: 'EUR', l: '€ EUR' }, { v: 'USD', l: '$ USD' }, { v: 'GBP', l: '£ GBP' }, { v: 'CHF', l: 'CHF' }]
const COUNTRIES = [
  { v: 'ES', l: 'España' }, { v: 'MX', l: 'México' }, { v: 'AR', l: 'Argentina' },
  { v: 'CO', l: 'Colombia' }, { v: 'CL', l: 'Chile' }, { v: 'PE', l: 'Perú' }, { v: 'OTHER', l: 'Otro' },
]
const LEVELS = [
  { v: 'beginner', t: 'Empezando', d: 'Llevo menos de 2 años invirtiendo' },
  { v: 'intermediate', t: 'Intermedio', d: 'Tengo experiencia pero quiero mejorar' },
  { v: 'advanced', t: 'Avanzado', d: 'Conozco bien la estrategia DGI' },
]
const SUGGESTIONS = {
  beginner:     ['JNJ', 'KO', 'PG'],
  intermediate: ['ASML.AS', 'V', 'ADP'],
  advanced:     ['MUV2.DE', 'O', 'TXN'],
}

const BTN = { padding: '14px 28px', background: 'rgba(99,102,241,0.9)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const nameOf = t => DICT.find(d => d[1] === t)?.[0] || t

export default function OnboardingClient({ initial, hasPositions }) {
  const router = useRouter()
  const [step, setStep]   = useState(0)
  const [prefs, setPrefs] = useState(initial)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)   // ticker
  const [preview, setPreview]   = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k, v) => setPrefs(p => ({ ...p, [k]: v }))

  const save = (action, extra = {}) =>
    fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs, step, action, ...extra }) }).catch(() => {})

  const skip = async () => { setBusy(true); await save('skip'); router.push('/mercados') }

  // Engancha el wizard: marca el onboarding como completado (para que el proxy no
  // devuelva al usuario aquí) y lleva a "construir cartera desde cero".
  const goWizard = async () => { setBusy(true); await save('complete', { via: 'wizard' }); router.push('/construir-cartera') }

  const goStep2 = async () => {
    setBusy(true)
    await save('save', { step: 2 })
    if (hasPositions) { await save('complete'); setDone(true) }
    else { setStep(2); setBusy(false) }
  }

  const finish = async () => {
    setBusy(true)
    await save('complete', { firstCompany: selected })
    setDone(true)
  }

  // Buscador sobre el DICT
  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return DICT.filter(d => d[0].toLowerCase().includes(q) || d[1].toLowerCase().includes(q)).slice(0, 8)
  }, [search])

  const pickCompany = async (ticker) => {
    setSelected(ticker); setSearch(''); setPreview(null)
    try {
      const res = await fetch(`/api/comparador?tickers=${encodeURIComponent(ticker)}`, { cache: 'no-store' })
      const json = await res.json()
      setPreview(json.companies?.[0] || null)
    } catch {}
  }

  // ── Pantalla final ───────────────────────────────────────────────────────
  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 12 }}>Tu índice DGI está listo</h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32 }}>
            Aquí empieza tu camino hacia la independencia financiera.
          </p>
          <button onClick={() => router.push(selected ? `/cartera/nueva-posicion?ticker=${encodeURIComponent(selected)}` : '/mercados')} style={{ ...BTN, width: '100%', maxWidth: 320 }}>
            {selected ? `Añadir ${nameOf(selected)} a mi cartera →` : 'Explorar mercados →'}
          </button>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => router.push('/construir-cartera')} style={{ fontSize: 13, fontWeight: 700, padding: '11px 18px', borderRadius: 9, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer', fontFamily: 'inherit', width: '100%', maxWidth: 320 }}>
              🧭 Construir mi cartera desde cero →
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => router.push('/mercados')} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Ir al inicio</button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* Barra de progreso + saltar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: step === i ? 24 : 8, height: 8, borderRadius: 4, background: i <= step ? 'var(--accent)' : 'var(--border-strong)', transition: 'all 0.3s' }} />
          ))}
        </div>
        <button onClick={skip} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 13, cursor: 'pointer' }}>Saltar configuración</button>
      </div>

      {/* PASO 1 — Bienvenida */}
      {step === 0 && (
        <div style={fade} key="s0">
          <div style={{ textAlign: 'center', maxWidth: 460 }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📈</div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 28 }}>Bienvenido a Mi Índice DGI</h1>
            <div style={{ display: 'grid', gap: 16, marginBottom: 36, textAlign: 'left' }}>
              {[
                ['📊', '43 mercados globales analizados con criterios DGI'],
                ['🎯', 'Detecta empresas en zona de compra antes que nadie'],
                ['💰', 'Proyecta tu renta de dividendos a 10 y 20 años'],
              ].map(([icon, txt]) => (
                <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>{txt}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} style={{ ...BTN, width: '100%', maxWidth: 320 }}>Empezar →</button>
          </div>
        </div>
      )}

      {/* PASO 2 — Configuración */}
      {step === 1 && (
        <div style={fade} key="s1">
          <div style={{ width: '100%', maxWidth: 460 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4, textAlign: 'center' }}>Cuéntanos sobre ti</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 28, textAlign: 'center' }}>Solo 3 preguntas para personalizar tu experiencia</p>

            <Label>Divisa base</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
              {CURRENCIES.map(c => <Choice key={c.v} active={prefs.base_currency === c.v} onClick={() => set('base_currency', c.v)}>{c.l}</Choice>)}
            </div>

            <Label>País de residencia fiscal</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
              {COUNTRIES.map(c => <Choice key={c.v} active={prefs.country_residence === c.v} onClick={() => set('country_residence', c.v)} small>{c.l}</Choice>)}
            </div>

            <Label>Experiencia como inversor</Label>
            <div style={{ display: 'grid', gap: 8, marginBottom: 32 }}>
              {LEVELS.map(l => (
                <button key={l.v} onClick={() => set('experience_level', l.v)} style={{
                  textAlign: 'left', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid ' + (prefs.experience_level === l.v ? 'rgba(99,102,241,0.6)' : 'var(--surface-3)'),
                  background: prefs.experience_level === l.v ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
                }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: prefs.experience_level === l.v ? 'var(--accent)' : 'var(--text)' }}>{l.t}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{l.d}</p>
                </button>
              ))}
            </div>
            <button onClick={goStep2} disabled={busy} style={{ ...BTN, width: '100%' }}>{busy ? 'Guardando…' : 'Continuar →'}</button>
          </div>
        </div>
      )}

      {/* PASO 3 — Primera empresa */}
      {step === 2 && (
        <div style={fade} key="s2">
          <div style={{ width: '100%', maxWidth: 460 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4, textAlign: 'center' }}>Añade tu primera empresa</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 22, textAlign: 'center' }}>Busca cualquier empresa del mundo — tenemos casi 2.000 disponibles</p>

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Busca por nombre o ticker…" autoFocus
                style={{ width: '100%', padding: '13px 16px', background: 'var(--surface-2)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, color: 'var(--text-strong)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--bg-elev)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                  {results.map(d => (
                    <button key={d[1]} onClick={() => pickCompany(d[1])} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{d[0]}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faintest)', marginLeft: 6 }}>{d[1]} · {d[4]} · {d[2]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sugerencias según nivel */}
            {!selected && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>¿No sabes por dónde empezar? Prueba con:</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(SUGGESTIONS[prefs.experience_level] || SUGGESTIONS.intermediate).map(t => (
                    <button key={t} onClick={() => pickCompany(t)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 16, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {nameOf(t)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview de la empresa seleccionada */}
            {selected && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{nameOf(selected)} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{selected}</span></p>
                  <button onClick={() => { setSelected(null); setPreview(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 16, cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  <Stat label="Score DGI" value={preview?.score != null ? preview.score.toFixed(1) : '…'} color="var(--accent)" />
                  <Stat label="Yield" value={preview?.yield != null ? preview.yield.toFixed(2) + '%' : '…'} color="var(--positive)" />
                  <Stat label="Racha" value={preview?.streak != null ? preview.streak + 'a' : '…'} color="var(--text)" />
                  <Stat label="MoS" value={preview?.mos != null ? (preview.mos >= 0 ? '+' : '') + preview.mos.toFixed(0) + '%' : '…'} color={preview?.mos >= 0 ? 'var(--positive)' : 'var(--negative)'} />
                </div>
              </div>
            )}

            <button onClick={finish} disabled={busy || !selected} style={{ ...BTN, width: '100%', opacity: (busy || !selected) ? 0.5 : 1 }}>
              {busy ? 'Terminando…' : 'Añadir al índice y terminar →'}
            </button>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>¿No sabes qué comprar? Deja que te propongamos una cartera entera.</p>
              <button onClick={goWizard} disabled={busy} style={{ fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 9, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', cursor: 'pointer', fontFamily: 'inherit' }}>
                🧭 Construir mi cartera desde cero →
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', position: 'relative' }}>
      <style>{`@keyframes ob-fade { from { opacity: 0; transform: translateX(12px) } to { opacity: 1; transform: translateX(0) } }`}</style>
      {children}
    </div>
  )
}
function Label({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{children}</p>
}
function Choice({ active, onClick, children, small }) {
  return (
    <button onClick={onClick} style={{
      flex: small ? '0 0 auto' : 1, minWidth: small ? 0 : 70, padding: small ? '8px 14px' : '12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: small ? 13 : 15, fontWeight: 700,
      border: '1px solid ' + (active ? 'rgba(99,102,241,0.6)' : 'var(--surface-3)'),
      background: active ? 'rgba(99,102,241,0.18)' : 'var(--surface)',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
    }}>{children}</button>
  )
}
function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 9, color: 'var(--text-faintest)', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 800, color }}>{value}</p>
    </div>
  )
}
const fade = { width: '100%', display: 'flex', justifyContent: 'center', animation: 'ob-fade 0.4s ease' }

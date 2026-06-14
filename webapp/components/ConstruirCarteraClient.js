'use client'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'
import { buildPortfolioPlan } from '@/lib/build-plan'

const STORE_KEY = 'construir-cartera:v1'

const CUR_SYM = { EUR: '€', USD: '$', GBP: '£', GBp: 'p', JPY: '¥', CHF: 'Fr', CAD: 'C$', AUD: 'A$', SEK: 'kr', DKK: 'kr', NOK: 'kr', HKD: 'HK$', SGD: 'S$' }
function fmtPx(v, cur) {
  if (v == null) return '—'
  const s = CUR_SYM[cur] || (cur ? cur + ' ' : '')
  const n = Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })
  return cur === 'EUR' ? `${n} ${s}` : `${s}${n}`
}
function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; return '#f97316' }

const MONTHLY_OPTS = [100, 300, 500, 1000]
const YIELD_OPTS   = [2, 3, 4, 5]
const HORIZONS = [
  { k: 'corto', l: 'Corto', d: 'Menos de 5 años — prima la renta desde ya' },
  { k: 'medio', l: 'Medio', d: '5–15 años — equilibrio renta y crecimiento' },
  { k: 'largo', l: 'Largo', d: 'Más de 15 años — prima calidad y crecimiento' },
]

const TOTAL_STEPS = 4

export default function ConstruirCarteraClient({ companies = [], sectors = [], destWHT = 19, isPremium = false, isAuthed = false }) {
  const [step, setStep]       = useState(1)         // 1..4 preguntas, luego 'result'
  const [monthly, setMonthly] = useState(300)
  const [customMonthly, setCustomMonthly] = useState('')
  const [targetYield, setTargetYield] = useState(3)
  const [horizon, setHorizon] = useState('medio')
  const [exclude, setExclude] = useState([])

  const effMonthly = customMonthly !== '' ? Number(customMonthly) || 0 : monthly

  // Persistencia: recuperar respuestas (y plan) del último uso.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
      if (s) {
        if (typeof s.monthly === 'number') setMonthly(s.monthly)
        if (typeof s.customMonthly === 'string') setCustomMonthly(s.customMonthly)
        if (typeof s.targetYield === 'number') setTargetYield(s.targetYield)
        if (s.horizon) setHorizon(s.horizon)
        if (Array.isArray(s.exclude)) setExclude(s.exclude)
        if (s.generated) setStep('result')
      }
    } catch {}
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ monthly, customMonthly, targetYield, horizon, exclude, generated: step === 'result' })) } catch {}
  }, [loaded, monthly, customMonthly, targetYield, horizon, exclude, step])

  const result = useMemo(() => {
    if (step !== 'result') return null
    return buildPortfolioPlan(companies, { monthly: effMonthly, targetYield, horizon, excludeSectors: exclude, destWHT, size: 12 })
  }, [step, companies, effMonthly, targetYield, horizon, exclude, destWHT])

  const toggleSector = (s) => setExclude(x => x.includes(s) ? x.filter(v => v !== s) : [...x, s])
  const FREE_VISIBLE = 5

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 100px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>🧭 Construir cartera desde cero</h1>
        <p style={{ fontSize: 13, color: '#4a5270' }}>Responde 4 preguntas y te damos un plan de empresas DGI ordenadas por prioridad de entrada.</p>
      </div>

      {step !== 'result' ? (
        <>
          {/* Progreso */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? '#6366f1' : 'rgba(255,255,255,0.08)' }} />
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px 22px', minHeight: 260 }}>
            {step === 1 && (
              <Question n={1} title="¿Cuánto puedes invertir al mes?" hint="Lo usamos para repartir la asignación sugerida.">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {MONTHLY_OPTS.map(v => (
                    <Chip key={v} active={customMonthly === '' && monthly === v} onClick={() => { setMonthly(v); setCustomMonthly('') }}>{v} €</Chip>
                  ))}
                </div>
                <label style={{ fontSize: 11, color: '#4a5270', display: 'block', marginBottom: 6 }}>O un importe personalizado (€/mes)</label>
                <input type="number" min="0" value={customMonthly} onChange={e => setCustomMonthly(e.target.value)} placeholder="p. ej. 750"
                  style={inputStyle} />
              </Question>
            )}

            {step === 2 && (
              <Question n={2} title="¿Qué yield (rentabilidad por dividendo) buscas?" hint="Orienta el plan hacia más renta o más crecimiento.">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {YIELD_OPTS.map(v => (
                    <Chip key={v} active={targetYield === v} onClick={() => setTargetYield(v)}>{v}%{v === 2 ? ' (crecimiento)' : v === 5 ? '+ (renta alta)' : ''}</Chip>
                  ))}
                </div>
              </Question>
            )}

            {step === 3 && (
              <Question n={3} title="¿Cuál es tu horizonte de inversión?" hint="A más plazo, más peso a la calidad y el crecimiento del dividendo.">
                <div style={{ display: 'grid', gap: 10 }}>
                  {HORIZONS.map(h => (
                    <button key={h.k} onClick={() => setHorizon(h.k)} style={{
                      textAlign: 'left', padding: '14px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid ' + (horizon === h.k ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
                      background: horizon === h.k ? 'rgba(99,102,241,0.12)' : 'transparent',
                    }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: horizon === h.k ? '#a5b4fc' : '#c8d0e0', marginBottom: 2 }}>{h.l}</p>
                      <p style={{ fontSize: 12, color: '#4a5270' }}>{h.d}</p>
                    </button>
                  ))}
                </div>
              </Question>
            )}

            {step === 4 && (
              <Question n={4} title="¿Algún sector que prefieras excluir?" hint="Opcional. Tabaco, energía, lo que no encaje contigo.">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sectors.map(s => (
                    <Chip key={s} active={exclude.includes(s)} danger onClick={() => toggleSector(s)}>
                      {exclude.includes(s) ? '✕ ' : ''}{s}
                    </Chip>
                  ))}
                </div>
                {exclude.length > 0 && <p style={{ fontSize: 11, color: '#f87171', marginTop: 12 }}>Excluidos: {exclude.join(', ')}</p>}
              </Question>
            )}
          </div>

          {/* Navegación */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
            <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} style={{
              fontSize: 13, padding: '10px 18px', borderRadius: 9, fontFamily: 'inherit', cursor: step === 1 ? 'default' : 'pointer',
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: step === 1 ? '#2a3045' : '#8090a8',
            }}>← Atrás</button>
            {step < TOTAL_STEPS ? (
              <button onClick={() => setStep(s => s + 1)} style={primaryBtn}>Siguiente →</button>
            ) : (
              <button onClick={() => setStep('result')} style={primaryBtn}>Generar plan →</button>
            )}
          </div>
        </>
      ) : (
        <Result result={result} isPremium={isPremium} isAuthed={isAuthed} freeVisible={FREE_VISIBLE}
          onRestart={() => setStep(1)} />
      )}
    </div>
  )
}

// ── Resultado ────────────────────────────────────────────────────────────────
function Result({ result, isPremium, isAuthed, freeVisible, onRestart }) {
  if (!result || !result.plan?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 20px' }}>
        <p style={{ fontSize: 14, color: '#8090a8', marginBottom: 16 }}>No encontramos suficientes empresas con esos criterios. Prueba a bajar el yield objetivo o excluir menos sectores.</p>
        <button onClick={onRestart} style={primaryBtn}>← Ajustar respuestas</button>
      </div>
    )
  }
  const { plan, meta } = result
  const visible = isPremium ? plan : plan.slice(0, freeVisible)
  const hidden = plan.length - visible.length

  const [add, setAdd] = useState({ status: 'idle', added: 0, msg: null })
  const addToWatchlist = async () => {
    if (!isAuthed) { window.location.href = `/login?next=${encodeURIComponent('/construir-cartera')}&msg=watchlist`; return }
    if (!plan.length || add.status === 'adding') return
    setAdd({ status: 'adding', added: 0, msg: null })
    let added = 0
    // En orden de prioridad: si el free toca el límite (10), entran primero las mejores.
    for (const p of plan) {
      try {
        const res = await fetch('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: p.ticker }) })
        if (res.status === 403) { setAdd({ status: 'limit', added, msg: `Añadidas ${added}. Límite del plan gratuito (10) — Premium para seguir todas.` }); return }
        if (res.ok) added++
      } catch {}
      setAdd(a => ({ ...a, added }))
    }
    setAdd({ status: 'done', added, msg: null })
  }

  return (
    <div>
      {/* Cabecera de métricas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e0e8f0' }}>Tu plan: {meta.size} empresas</p>
          <p style={{ fontSize: 12, color: '#4a5270' }}>Ordenadas por prioridad de entrada · {meta.entryNowCount} en zona de compra ahora</p>
        </div>
        <button onClick={onRestart} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#8090a8', cursor: 'pointer', fontFamily: 'inherit' }}>↺ Rehacer</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
        <MetaCard label="Aportación" value={meta.monthly ? `${meta.monthly} €/mes` : '—'} />
        <MetaCard label="Yield medio" value={`${meta.avgYield.toFixed(1)}%`} color="#34d399" />
        <MetaCard label="Yield neto" value={`${meta.avgYieldNet.toFixed(1)}%`} color="#86efac" />
        <MetaCard label="Sectores" value={meta.sectors} />
      </div>

      {/* Acción: seguir el plan en la watchlist */}
      <div style={{ marginBottom: 14 }}>
        {add.status === 'done' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, color: '#34d399', fontSize: 13, fontWeight: 700 }}>
            ✓ {add.added} {add.added === 1 ? 'empresa añadida' : 'empresas añadidas'} a tu watchlist
          </div>
        ) : add.status === 'limit' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '11px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10 }}>
            <span style={{ fontSize: 12.5, color: '#fbbf24' }}>{add.msg}</span>
            <Link href="/pricing" style={{ ...primaryBtn, textDecoration: 'none', flexShrink: 0 }}>Ver Premium →</Link>
          </div>
        ) : (
          <button onClick={addToWatchlist} disabled={add.status === 'adding'} style={{
            width: '100%', padding: '12px', borderRadius: 10, cursor: add.status === 'adding' ? 'default' : 'pointer', fontFamily: 'inherit',
            border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', fontSize: 13.5, fontWeight: 700,
          }}>
            {add.status === 'adding' ? `Añadiendo… (${add.added})` : `👁 Seguir el plan en mi watchlist (${plan.length})`}
          </button>
        )}
      </div>

      {/* Lista del plan */}
      <div style={{ display: 'grid', gap: 8 }}>
        {visible.map(p => <PlanRow key={p.ticker} p={p} />)}
      </div>

      {/* Gate freemium */}
      {!isPremium && hidden > 0 && (
        <div style={{ marginTop: 12, padding: '18px 20px', textAlign: 'center', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#c8d0e0', marginBottom: 4 }}>+ {hidden} empresas más en tu plan</p>
          <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14 }}>Premium revela el plan completo y la asignación mensual de cada empresa.</p>
          <Link href="/pricing" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>Ver plan completo con Premium →</Link>
        </div>
      )}

      {/* CTA final */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        {isAuthed ? (
          <Link href="/cartera/nueva-posicion" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>Empezar a registrar mi cartera →</Link>
        ) : (
          <Link href="/register" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}>Crear cuenta gratis y guardar mi plan →</Link>
        )}
        <p style={{ fontSize: 10.5, color: '#2e3a55', marginTop: 12, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          No es asesoramiento financiero. Es un punto de partida basado en criterios DGI; revisa cada empresa antes de invertir.
        </p>
      </div>
    </div>
  )
}

function PlanRow({ p }) {
  const ct = getCountry(p.country)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#3a4260', width: 22, flexShrink: 0, textAlign: 'center' }}>{p.priority}</span>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/empresa/${encodeURIComponent(p.ticker)}`} style={{ textDecoration: 'none' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.name} <span style={{ fontSize: 10, color: '#2e3a55' }}>{p.ticker}</span>
          </p>
        </Link>
        {p.entryNow
          ? <p style={{ fontSize: 10.5, color: '#34d399', display: 'flex', gap: 5, marginTop: 1 }}><span>●</span><span style={{ color: '#86efac' }}>Entrar ahora: {p.reason}</span></p>
          : <p style={{ fontSize: 10.5, color: '#6a7090', marginTop: 1 }}>Acumular — esperar mejor precio</p>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#8090a8' }}>{p.yield != null ? p.yield.toFixed(1) + '%' : '—'}</p>
        {p.monthlyEur > 0 && <p style={{ fontSize: 9.5, color: '#3a4260' }}>{p.monthlyEur} €/mes · {p.weightPct}%</p>}
      </div>
      <span style={{ fontSize: 15, fontWeight: 900, color: scoreColor(p.score), minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{p.score != null ? p.score.toFixed(1) : '—'}</span>
    </div>
  )
}

function MetaCard({ label, value, color = '#e0e8f0' }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

function Question({ n, title, hint, children }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em', marginBottom: 8 }}>PASO {n} DE {TOTAL_STEPS}</p>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#e0e8f0', marginBottom: 6 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: '#4a5270', marginBottom: 18 }}>{hint}</p>
      {children}
    </div>
  )
}

function Chip({ active, danger, onClick, children }) {
  const c = danger
    ? { border: active ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)', bg: active ? 'rgba(248,113,113,0.14)' : 'transparent', col: active ? '#f87171' : '#8090a8' }
    : { border: active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)', bg: active ? 'rgba(99,102,241,0.18)' : 'transparent', col: active ? '#a5b4fc' : '#8090a8' }
  return (
    <button onClick={onClick} style={{
      fontSize: 13, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
      border: '1px solid ' + c.border, background: c.bg, color: c.col, fontWeight: active ? 700 : 500,
    }}>{children}</button>
  )
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#e0e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }
const primaryBtn = { fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 9, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }

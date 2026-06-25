'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'
import RankingsTabs from '@/components/RankingsTabs'

const ZONA_OPTS = [
  { v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' },
  { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }, { v: 'África', l: 'África' },
]
const FREE_PREVIEW = 25

function scoreColor(s) { if (s == null) return 'var(--text-faintest)'; if (s >= 8) return 'var(--positive)'; if (s >= 6.5) return 'var(--positive-soft)'; if (s >= 5) return 'var(--warning)'; if (s >= 3) return '#f97316'; return 'var(--negative)' }
function roicColor(r) { if (r >= 30) return 'var(--positive)'; if (r >= 22) return 'var(--positive-soft)'; return 'var(--warning)' }

const ROW_CSS = `
.cmp-row{display:flex;align-items:center;gap:8px;padding:5px 11px;background:var(--surface);border-radius:8px;margin-bottom:2px}
.cmp-rank{display:none}
.cmp-flag{font-size:14px;flex-shrink:0}
.cmp-namewrap{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
.cmp-name{font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.cmp-ticker{font-size:10px;color:var(--text-faintest);font-weight:600}
.cmp-m{display:none;flex-direction:column;text-align:right;min-width:62px;flex-shrink:0}
.cmp-mlabel{font-size:9px;color:var(--text-faintest);font-weight:400}
.cmp-mval{font-size:13px;font-weight:700;color:var(--text-muted);font-variant-numeric:tabular-nums}
.cmp-roic{font-size:16px;font-weight:900;font-variant-numeric:tabular-nums;flex-shrink:0;min-width:52px;text-align:right}
@media(min-width:760px){
  .cmp-row{gap:10px;padding:8px 12px;margin-bottom:5px;border-radius:9px}
  .cmp-rank{display:inline;width:24px;text-align:right;font-size:12px;font-weight:800;color:var(--text-faintest);flex-shrink:0}
  .cmp-flag{font-size:15px}
  .cmp-m{display:flex}
  .cmp-roic{font-size:19px;min-width:60px}
}`

function Row({ co, rank }) {
  const ct = getCountry(co.c)
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="cmp-row">
        <span className="cmp-rank">{rank}</span>
        <span className="cmp-flag">{ct?.flag || '🌐'}</span>
        <div className="cmp-namewrap">
          <p className="cmp-name">{co.n} <span className="cmp-ticker">{co.t}</span></p>
        </div>
        <div className="cmp-m" title="CapEx sobre flujo de caja operativo — cuanto más bajo, menos capital necesita el negocio">
          <span className="cmp-mlabel">CapEx/CFO</span>
          <span className="cmp-mval" style={{ color: co.capex <= 10 ? 'var(--positive)' : 'var(--positive-soft)' }}>{co.capex.toFixed(0)}%</span>
        </div>
        <div className="cmp-m" title="Crecimiento de ingresos (CAGR 5 años)">
          <span className="cmp-mlabel">Ingresos 5a</span>
          <span className="cmp-mval">{Math.min(co.rev, 50).toFixed(0)}%</span>
        </div>
        <div className="cmp-m">
          <span className="cmp-mlabel">Score DGI</span>
          <span className="cmp-mval" style={{ color: scoreColor(co.sc) }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
        </div>
        <span className="cmp-roic" style={{ color: roicColor(co.roic) }} title="ROIC — retorno sobre el capital invertido">{co.roic.toFixed(0)}%</span>
      </div>
    </Link>
  )
}

export default function CompoundersClient({ companies = [], isPremium = false, isAuthed = false }) {
  const [search, setSearch] = useState('')
  const [zona, setZona] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies.filter(co => {
      if (zona !== 'all' && co.cont !== zona) return false
      if (q && !(co.n.toLowerCase().includes(q) || co.t.toLowerCase().includes(q))) return false
      return true
    })
  }, [companies, search, zona])

  const visible = isPremium ? filtered : filtered.slice(0, FREE_PREVIEW)
  const hidden = filtered.length - visible.length

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 100px' }}>
      <style>{ROW_CSS}</style>
      <RankingsTabs active="compounders" />

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4 }}>⚙️ Máquinas de Compounding</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          El santo grial de la calidad: negocios con <strong style={{ color: 'var(--text-muted)' }}>ROIC alto y sostenido</strong> que <strong style={{ color: 'var(--text-muted)' }}>apenas necesitan reinvertir capital</strong> (CapEx/CFO &lt; 20%) y crecen de forma estable — generan caja y componen valor año tras año.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ticker…"
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 9, color: 'var(--text-strong)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18 }}>
        {ZONA_OPTS.map(o => (
          <button key={o.v} onClick={() => setZona(o.v)} style={{
            fontSize: 11, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + (zona === o.v ? 'rgba(99,102,241,0.5)' : 'var(--surface-3)'),
            background: zona === o.v ? 'rgba(99,102,241,0.18)' : 'transparent', color: zona === o.v ? 'var(--accent)' : 'var(--text-faint)',
          }}>{o.l}</button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14 }}>{filtered.length.toLocaleString('es-ES')}</span> máquinas de compounding (ROIC ≥18% · CapEx/CFO ≤20% · crecimiento ≥4%)
      </p>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Ranking en preparación — vuelve en unos minutos.</p>
        </div>
      ) : (
        <>
          {visible.map((co, i) => <Row key={co.t} co={co} rank={i + 1} />)}
          {!isPremium && hidden > 0 && (
            <div style={{ marginTop: 12, padding: '18px 20px', textAlign: 'center', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>+ {hidden} máquinas de compounding más</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>Premium desbloquea el ranking completo.</p>
              <Link href="/pricing" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--accent)', padding: '10px 20px', borderRadius: 9, textDecoration: 'none' }}>Ver ranking completo →</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

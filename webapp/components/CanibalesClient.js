'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'
import RankingsTabs from '@/components/RankingsTabs'

const ZONA_OPTS = [
  { v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' },
  { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }, { v: 'África', l: 'África' },
]
const FREE_PREVIEW = 10

function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; if (s >= 3) return '#f97316'; return '#f87171' }
function redColor(p) { if (p >= 20) return '#34d399'; if (p >= 10) return '#86efac'; if (p >= 4) return '#fbbf24'; return '#8090a8' }

const ROW_CSS = `
.can-row{display:flex;align-items:center;gap:8px;padding:5px 11px;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:2px}
.can-rank{display:none}
.can-flag{font-size:14px;flex-shrink:0}
.can-namewrap{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
.can-name{font-size:13px;font-weight:700;color:#d0d8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.can-ticker{font-size:10px;color:#2e3a55;font-weight:600}
.can-m{display:none;flex-direction:column;text-align:right;min-width:54px;flex-shrink:0}
.can-mlabel{font-size:9px;color:#3a4260;font-weight:400}
.can-mval{font-size:13px;font-weight:700;color:#8090a8;font-variant-numeric:tabular-nums}
.can-red{font-size:16px;font-weight:900;font-variant-numeric:tabular-nums;flex-shrink:0;min-width:54px;text-align:right}
@media(min-width:760px){
  .can-row{gap:10px;padding:8px 12px;margin-bottom:5px;border-radius:9px}
  .can-rank{display:inline;width:24px;text-align:right;font-size:12px;font-weight:800;color:#3a4260;flex-shrink:0}
  .can-flag{font-size:15px}
  .can-m{display:flex}
  .can-red{font-size:19px;min-width:64px}
}`

function Row({ co, rank }) {
  const ct = getCountry(co.c)
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="can-row">
        <span className="can-rank">{rank}</span>
        <span className="can-flag">{ct?.flag || '🌐'}</span>
        <div className="can-namewrap">
          <p className="can-name">{co.n} <span className="can-ticker">{co.t}</span></p>
        </div>
        <div className="can-m">
          <span className="can-mlabel">Score DGI</span>
          <span className="can-mval" style={{ color: scoreColor(co.sc) }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
        </div>
        <div className="can-m">
          <span className="can-mlabel">Sector</span>
          <span className="can-mval" style={{ color: '#6a7090', fontSize: 11 }}>{co.s || '—'}</span>
        </div>
        <span className="can-red" style={{ color: redColor(co.reduced) }} title={`Acciones eliminadas desde ${co.baseYear || '~2022'}`}>−{co.reduced.toFixed(1)}%</span>
      </div>
    </Link>
  )
}

export default function CanibalesClient({ companies = [], isPremium = false, isAuthed = false }) {
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
      <RankingsTabs active="canibales" />

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>🦈 Caníbales de acciones</h1>
        <p style={{ fontSize: 12, color: '#5a6480', lineHeight: 1.5 }}>
          Empresas que más han <strong style={{ color: '#8090a8' }}>reducido sus acciones en circulación desde ~2022</strong> — recompra neta real (en número de acciones), que aumenta tu participación sin que muevas un dedo.
        </p>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ticker…"
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: '#e0e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18 }}>
        {ZONA_OPTS.map(o => (
          <button key={o.v} onClick={() => setZona(o.v)} style={{
            fontSize: 11, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + (zona === o.v ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
            background: zona === o.v ? 'rgba(99,102,241,0.18)' : 'transparent', color: zona === o.v ? '#818cf8' : '#4a5270',
          }}>{o.l}</button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: '#c8d0e0', fontSize: 14 }}>{filtered.length.toLocaleString('es-ES')}</span> empresas han reducido acciones desde ~2022
      </p>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <p style={{ fontSize: 14, color: '#8090a8' }}>Ranking en preparación — vuelve en unos minutos.</p>
        </div>
      ) : (
        <>
          {visible.map((co, i) => <Row key={co.t} co={co} rank={i + 1} />)}
          {!isPremium && hidden > 0 && (
            <div style={{ marginTop: 12, padding: '18px 20px', textAlign: 'center', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#c8d0e0', marginBottom: 4 }}>+ {hidden} caníbales más</p>
              <p style={{ fontSize: 12, color: '#4a5270', marginBottom: 14 }}>Premium desbloquea el ranking completo de caníbales de acciones.</p>
              <Link href="/pricing" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#6366f1', padding: '10px 20px', borderRadius: 9, textDecoration: 'none' }}>Ver ranking completo →</Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

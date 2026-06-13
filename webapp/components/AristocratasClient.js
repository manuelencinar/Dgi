'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getCountry } from '@/lib/helpers'
import { netYield, getWHT } from '@/lib/screener'

const TIERS = [
  { id: 'rey',         name: 'Reyes',        emoji: '👑', color: '#fbbf24', desc: '50+ años subiendo el dividendo sin interrupción' },
  { id: 'aristocrata', name: 'Aristócratas', emoji: '🏆', color: '#a78bfa', desc: '25–49 años de incrementos consecutivos' },
  { id: 'aspirante',   name: 'Aspirantes',   emoji: '⭐', color: '#60a5fa', desc: '10–24 años — camino a la aristocracia' },
]

const ZONA_OPTS = [
  { v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' },
  { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }, { v: 'África', l: 'África' },
]

const FREE_PREVIEW = 5

function scoreColor(s) { if (s == null) return '#3a4260'; if (s >= 8) return '#34d399'; if (s >= 6.5) return '#86efac'; if (s >= 5) return '#fbbf24'; if (s >= 3) return '#f97316'; return '#f87171' }
function streakIcon(n) { if (n >= 50) return '👑'; if (n >= 35) return '🥇'; if (n >= 25) return '🥈'; return '🥉' }

// Estilos responsive: en móvil la ficha es más baja y el nombre se lee entero
// (puede envolver); en escritorio (≥760px) es el layout de una sola fila.
const ROW_CSS = `
.aristo-row{display:flex;align-items:center;gap:8px;padding:7px 11px;background:rgba(255,255,255,0.02);border-radius:9px;margin-bottom:5px;flex-wrap:wrap}
.aristo-rank{font-size:12px;font-weight:800;color:#3a4260;width:18px;text-align:right;flex-shrink:0}
.aristo-flag{font-size:15px;flex-shrink:0}
.aristo-namewrap{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.aristo-name{font-size:13px;font-weight:700;color:#d0d8e8;line-height:1.3;overflow-wrap:anywhere}
.aristo-ticker{font-size:10px;color:#2e3a55;font-weight:600}
.aristo-buy{align-self:flex-start;font-size:9px;font-weight:700;color:#34d399;background:rgba(52,211,153,0.12);padding:1px 6px;border-radius:4px}
.aristo-metrics{display:flex;align-items:baseline;gap:16px;flex:1 0 100%;padding-left:41px;margin-top:1px}
.aristo-m{display:flex;flex-direction:column}
.aristo-mlabel{display:none;font-size:9px;color:#3a4260;font-weight:400}
.aristo-mval{font-size:12px;font-weight:700;color:#8090a8;font-variant-numeric:tabular-nums}
.aristo-score{font-size:17px;font-weight:900;font-variant-numeric:tabular-nums;margin-left:auto}
@media(min-width:760px){
  .aristo-row{flex-wrap:nowrap;gap:10px;padding:8px 12px}
  .aristo-rank{width:22px}
  .aristo-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:normal}
  .aristo-metrics{flex:0 0 auto;padding-left:0;margin-top:0;gap:14px;align-items:stretch}
  .aristo-m{text-align:right;min-width:52px}
  .aristo-mlabel{display:block}
  .aristo-mval{font-size:13px}
  .aristo-score{font-size:18px;min-width:32px;text-align:right;margin-left:0}
}`

function Row({ co, rank, destWHT }) {
  const ct = getCountry(co.c)
  const ny = co.y != null ? netYield(co.y, getWHT(co.c), destWHT) : null
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none' }}>
      <div className="aristo-row">
        <span className="aristo-rank">{rank}</span>
        <span className="aristo-flag">{ct?.flag || '🌐'}</span>
        <div className="aristo-namewrap">
          <p className="aristo-name">{co.n} <span className="aristo-ticker">{co.t}</span></p>
          {co.buyZone && <span className="aristo-buy">● En zona de compra</span>}
        </div>
        <div className="aristo-metrics">
          <div className="aristo-m" title="Años consecutivos subiendo el dividendo">
            <span className="aristo-mlabel">Racha</span>
            <span className="aristo-mval" style={{ color: '#c8d0e0' }}>{streakIcon(co.streak)} {co.streak}a</span>
          </div>
          <div className="aristo-m">
            <span className="aristo-mlabel">Yield neto</span>
            <span className="aristo-mval">{ny != null ? ny.toFixed(2) + '%' : '—'}</span>
          </div>
          <span className="aristo-score" style={{ color: scoreColor(co.sc) }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
        </div>
      </div>
    </Link>
  )
}

export default function AristocratasClient({ companies = [], isPremium = false, destWHT = 19, isAuthed = false }) {
  const [search, setSearch] = useState('')
  const [zona, setZona] = useState('all')
  const [onlyBuy, setOnlyBuy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies.filter(co => {
      if (zona !== 'all' && co.cont !== zona) return false
      if (onlyBuy && !co.buyZone) return false
      if (q && !(co.n.toLowerCase().includes(q) || co.t.toLowerCase().includes(q))) return false
      return true
    })
  }, [companies, search, zona, onlyBuy])

  const byTier = useMemo(() => {
    const m = { rey: [], aristocrata: [], aspirante: [] }
    for (const co of filtered) m[co.tier]?.push(co)
    return m
  }, [filtered])

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 100px' }}>
      <style>{ROW_CSS}</style>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 4 }}>👑 Reyes, Aristócratas y Aspirantes</h1>
        <p style={{ fontSize: 12, color: '#5a6480', lineHeight: 1.5 }}>
          Empresas clasificadas por su <strong style={{ color: '#8090a8' }}>racha de años consecutivos subiendo el dividendo</strong> — la mejor evidencia de compromiso y estabilidad del negocio.
        </p>
      </div>

      {/* Resumen de niveles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {TIERS.map(t => (
          <div key={t.id} style={{ background: `${t.color}10`, border: `1px solid ${t.color}33`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 20 }}>{t.emoji}</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{t.name}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', fontVariantNumeric: 'tabular-nums' }}>{byTier[t.id].length}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ticker…"
          style={{ flex: 1, minWidth: 180, padding: '9px 13px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: '#e0e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={() => setOnlyBuy(b => !b)} style={{
          fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid ' + (onlyBuy ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.08)'),
          background: onlyBuy ? 'rgba(52,211,153,0.14)' : 'transparent', color: onlyBuy ? '#34d399' : '#4a5270', fontWeight: onlyBuy ? 700 : 400,
        }}>● Solo en zona de compra</button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {ZONA_OPTS.map(o => (
          <button key={o.v} onClick={() => setZona(o.v)} style={{
            fontSize: 11, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + (zona === o.v ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'),
            background: zona === o.v ? 'rgba(99,102,241,0.2)' : 'transparent', color: zona === o.v ? '#818cf8' : '#4a5270', fontWeight: zona === o.v ? 700 : 400,
          }}>{o.l}</button>
        ))}
      </div>

      {/* Niveles */}
      {TIERS.map(t => {
        const list = byTier[t.id]
        const shown = isPremium ? list : list.slice(0, FREE_PREVIEW)
        const hidden = list.length - shown.length
        return (
          <section key={t.id} style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${t.color}33` }}>
              <span style={{ fontSize: 20 }}>{t.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{t.name} <span style={{ fontSize: 11, color: '#3a4260', fontWeight: 600 }}>· {list.length}</span></p>
                <p style={{ fontSize: 10, color: '#4a5270' }}>{t.desc}</p>
              </div>
            </div>

            {list.length === 0
              ? <p style={{ fontSize: 12, color: '#3a4260', padding: '10px 0' }}>Ninguna empresa en este nivel con los filtros actuales.</p>
              : shown.map((co, i) => <Row key={co.t} co={co} rank={i + 1} destWHT={destWHT} />)}

            {hidden > 0 && (
              <div style={{ marginTop: 6, padding: '16px', textAlign: 'center', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: '#a8b0c8', fontWeight: 600, marginBottom: 8 }}>
                  +{hidden} {t.name.toLowerCase()} más {onlyBuy || zona !== 'all' || search ? 'con estos filtros' : ''}
                </p>
                <Link href={isAuthed ? '/pricing' : '/register'} style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '8px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8 }}>
                  {isAuthed ? 'Hazte premium para ver la lista completa' : 'Regístrate gratis'}
                </Link>
              </div>
            )}
          </section>
        )
      })}

      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 16, lineHeight: 1.5 }}>
        La racha se calcula con datos históricos de dividendos. En algunos mercados asiáticos puede quedarse corta por limitaciones de la fuente de datos.
      </p>
    </div>
  )
}

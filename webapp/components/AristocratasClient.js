'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getCountry, DIVIDEND_TIERS, dividendTierInfo } from '@/lib/helpers'
import { netYield, getWHT } from '@/lib/screener'
import RankingsTabs from '@/components/RankingsTabs'

const TIER_DESC = {
  rey:         '50+ años subiendo el dividendo sin interrupción',
  aristocrata: '25–49 años de incrementos consecutivos',
  aspirante:   '10–24 años — camino a la aristocracia',
}
// Niveles (nombre en plural para los encabezados) derivados de la fuente única.
const TIERS = DIVIDEND_TIERS.map(t => ({ id: t.id, name: t.plural, emoji: t.emoji, color: t.color, desc: TIER_DESC[t.id] }))

const ZONA_OPTS = [
  { v: 'all', l: 'Todas' }, { v: 'América', l: 'América' }, { v: 'Europa', l: 'Europa' },
  { v: 'Asia', l: 'Asia' }, { v: 'Oceanía', l: 'Oceanía' }, { v: 'África', l: 'África' },
]

const FREE_PREVIEW = 5

function scoreColor(s) { if (s == null) return 'var(--text-faintest)'; if (s >= 8) return 'var(--positive)'; if (s >= 6.5) return 'var(--positive-soft)'; if (s >= 5) return 'var(--warning)'; if (s >= 3) return '#f97316'; return 'var(--negative)' }
function streakIcon(n) { return dividendTierInfo(n)?.emoji || '' }

// Estilos responsive. Móvil: una SOLA línea compacta — bandera · nombre (… si
// es muy largo) · racha · nota. Escritorio (≥760px): layout de bloques con
// etiquetas (Racha / Yield neto / Score), como estaba.
const ROW_CSS = `
.aristo-row{display:flex;align-items:center;gap:8px;padding:5px 11px;background:var(--surface);border-radius:8px;margin-bottom:2px}
.aristo-rank{display:none}
.aristo-flag{font-size:14px;flex-shrink:0}
.aristo-namewrap{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
.aristo-name{font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.aristo-ticker{font-size:10px;color:var(--text-faintest);font-weight:600}
.aristo-buy{display:none}
.aristo-buydot{flex-shrink:0;font-size:9px;color:var(--positive)}
.aristo-chip{flex-shrink:0;font-size:11px;font-weight:700;color:var(--text-muted);font-variant-numeric:tabular-nums}
.aristo-ychip{color:#6a9b86}
.aristo-m{display:none;flex-direction:column;text-align:right;min-width:52px;flex-shrink:0}
.aristo-mlabel{font-size:9px;color:var(--text-faintest);font-weight:400}
.aristo-mval{font-size:13px;font-weight:700;color:var(--text-muted);font-variant-numeric:tabular-nums}
.aristo-score{font-size:16px;font-weight:900;font-variant-numeric:tabular-nums;flex-shrink:0;min-width:28px;text-align:right}
@media(min-width:760px){
  .aristo-row{gap:10px;padding:8px 12px;margin-bottom:5px;border-radius:9px}
  .aristo-rank{display:inline;width:22px;text-align:right;font-size:12px;font-weight:800;color:var(--text-faintest);flex-shrink:0}
  .aristo-flag{font-size:15px}
  .aristo-namewrap{gap:2px}
  .aristo-buy{display:inline-block;align-self:flex-start;font-size:9px;font-weight:700;color:var(--positive);background:rgba(52,211,153,0.12);padding:1px 6px;border-radius:4px}
  .aristo-buydot{display:none}
  .aristo-chip{display:none}
  .aristo-m{display:flex}
  .aristo-score{font-size:18px;min-width:32px}
}`

function Row({ co, rank, destWHT }) {
  const ct = getCountry(co.c)
  const ny = co.y != null ? netYield(co.y, getWHT(co.c), destWHT, co.c === 'ES') : null
  const nyTxt = ny != null ? ny.toFixed(2) + '%' : '—'
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div className="aristo-row">
        <span className="aristo-rank">{rank}</span>
        <span className="aristo-flag">{ct?.flag || '🌐'}</span>
        <div className="aristo-namewrap">
          <p className="aristo-name">{co.n} <span className="aristo-ticker">{co.t}</span></p>
          {co.buyZone && <span className="aristo-buy">● En zona de compra</span>}
        </div>
        {co.buyZone && <span className="aristo-buydot" title="En zona de compra">●</span>}
        <span className="aristo-chip" title="Años consecutivos subiendo el dividendo">{streakIcon(co.streak)} {co.streak}a</span>
        <span className="aristo-chip aristo-ychip" title="Yield neto (tras retención)">{nyTxt}</span>
        <div className="aristo-m" title="Años consecutivos subiendo el dividendo">
          <span className="aristo-mlabel">Racha</span>
          <span className="aristo-mval" style={{ color: 'var(--text)' }}>{streakIcon(co.streak)} {co.streak}a</span>
        </div>
        <div className="aristo-m">
          <span className="aristo-mlabel">Yield neto</span>
          <span className="aristo-mval">{nyTxt}</span>
        </div>
        <span className="aristo-score" style={{ color: scoreColor(co.sc) }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
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
      <RankingsTabs active="aristocratas" />
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 4 }}>👑 Reyes, Aristócratas y Aspirantes</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Empresas clasificadas por su <strong style={{ color: 'var(--text-muted)' }}>racha de años consecutivos subiendo el dividendo</strong> — la mejor evidencia de compromiso y estabilidad del negocio.
        </p>
      </div>

      {/* Resumen de niveles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {TIERS.map(t => (
          <div key={t.id} style={{ background: `${t.color}10`, border: `1px solid ${t.color}33`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <p style={{ fontSize: 20 }}>{t.emoji}</p>
            <p style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{t.name}</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{byTier[t.id].length}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o ticker…"
          style={{ flex: 1, minWidth: 180, padding: '9px 13px', background: 'var(--surface-2)', border: '1px solid var(--surface-3)', borderRadius: 9, color: 'var(--text-strong)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={() => setOnlyBuy(b => !b)} style={{
          fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid ' + (onlyBuy ? 'rgba(52,211,153,0.5)' : 'var(--surface-3)'),
          background: onlyBuy ? 'rgba(52,211,153,0.14)' : 'transparent', color: onlyBuy ? 'var(--positive)' : 'var(--text-faint)', fontWeight: onlyBuy ? 700 : 400,
        }}>● Solo en zona de compra</button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {ZONA_OPTS.map(o => (
          <button key={o.v} onClick={() => setZona(o.v)} style={{
            fontSize: 11, padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + (zona === o.v ? 'rgba(99,102,241,0.5)' : 'var(--border)'),
            background: zona === o.v ? 'rgba(99,102,241,0.2)' : 'transparent', color: zona === o.v ? 'var(--accent)' : 'var(--text-faint)', fontWeight: zona === o.v ? 700 : 400,
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
                <p style={{ fontSize: 15, fontWeight: 800, color: t.color }}>{t.name} <span style={{ fontSize: 11, color: 'var(--text-faintest)', fontWeight: 600 }}>· {list.length}</span></p>
                <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{t.desc}</p>
              </div>
            </div>

            {list.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--text-faintest)', padding: '10px 0' }}>Ninguna empresa en este nivel con los filtros actuales.</p>
              : shown.map((co, i) => <Row key={co.t} co={co} rank={i + 1} destWHT={destWHT} />)}

            {hidden > 0 && (
              <div style={{ marginTop: 6, padding: '16px', textAlign: 'center', background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)', borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: '#a8b0c8', fontWeight: 600, marginBottom: 8 }}>
                  +{hidden} {t.name.toLowerCase()} más {onlyBuy || zona !== 'all' || search ? 'con estos filtros' : ''}
                </p>
                <Link href={isAuthed ? '/pricing' : '/register'} style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#fff', textDecoration: 'none', padding: '8px 18px', background: 'var(--accent)', borderRadius: 8 }}>
                  {isAuthed ? 'Hazte premium para ver la lista completa' : 'Regístrate gratis'}
                </Link>
              </div>
            )}
          </section>
        )
      })}

      <p style={{ fontSize: 10, color: 'var(--text-faintest)', marginTop: 16, lineHeight: 1.5 }}>
        La racha se calcula con datos históricos de dividendos. En algunos mercados asiáticos puede quedarse corta por limitaciones de la fuente de datos.
      </p>
    </div>
  )
}

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

function Row({ co, rank, destWHT }) {
  const ct = getCountry(co.c)
  const ny = co.y != null ? netYield(co.y, getWHT(co.c), destWHT) : null
  return (
    <Link href={`/empresa/${encodeURIComponent(co.t)}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 9, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#3a4260', width: 22, textAlign: 'right', flexShrink: 0 }}>{rank}</span>
        <span style={{ fontSize: 15, flexShrink: 0 }}>{ct?.flag || '🌐'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#d0d8e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {co.n} <span style={{ fontSize: 10, color: '#2e3a55', fontWeight: 600 }}>{co.t}</span>
          </p>
          {co.buyZone && <span style={{ fontSize: 9, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '1px 6px', borderRadius: 4 }}>● En zona de compra</span>}
        </div>
        <div title="Años consecutivos subiendo el dividendo" style={{ textAlign: 'right', flexShrink: 0, minWidth: 52 }}>
          <p style={{ fontSize: 9, color: '#3a4260' }}>Racha</p>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#c8d0e0', fontVariantNumeric: 'tabular-nums' }}>{streakIcon(co.streak)} {co.streak}a</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
          <p style={{ fontSize: 9, color: '#3a4260' }}>Yield neto</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#8090a8', fontVariantNumeric: 'tabular-nums' }}>{ny != null ? ny.toFixed(2) + '%' : '—'}</p>
        </div>
        <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor(co.sc), minWidth: 32, textAlign: 'right', flexShrink: 0 }}>{co.sc != null ? co.sc.toFixed(1) : '—'}</span>
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

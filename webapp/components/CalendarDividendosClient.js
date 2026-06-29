'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { MONTHS_ES_LONG } from '@/lib/dividend-calendar'

const ZONAS = ['Todas', 'América', 'Europa', 'Asia', 'Oceanía', 'África']
const CURS = ['Todas', 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY']
const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }

function Chips({ label, opts, value, onChange }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {opts.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{
            fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 14, cursor: 'pointer',
            color: value === o ? '#fff' : 'var(--text-muted)',
            background: value === o ? 'var(--accent)' : 'var(--surface-2)',
            border: `1px solid ${value === o ? 'rgba(99,102,241,0.9)' : 'var(--border-strong)'}`,
          }}>{o}</button>
        ))}
      </div>
    </div>
  )
}

function MonthCard({ month, entries }) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 10
  const list = expanded ? entries : entries.slice(0, LIMIT)
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-strong)' }}>{MONTHS_ES_LONG[month]}</p>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{entries.length} {entries.length === 1 ? 'empresa' : 'empresas'}</span>
      </div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faintest)' }}>—</p>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {list.map(e => (
            <Link key={e.t} href={`/empresa/${e.t}`} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px', borderRadius: 6, textDecoration: 'none' }} className="cd-row">
              <span style={{ fontSize: 13, flexShrink: 0 }}>{e.flag}</span>
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.n}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--positive)', flexShrink: 0 }}>{e.y.toFixed(1)}%</span>
            </Link>
          ))}
          {entries.length > LIMIT && (
            <button onClick={() => setExpanded(v => !v)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 6px' }}>
              {expanded ? '▲ Ver menos' : `▼ Ver ${entries.length - LIMIT} más`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function CalendarDividendosClient({ byMonth }) {
  const [zona, setZona] = useState('Todas')
  const [cur, setCur] = useState('Todas')

  const filtered = useMemo(() => byMonth.map(entries => entries.filter(e =>
    (zona === 'Todas' || e.cont === zona) && (cur === 'Todas' || e.cur === cur)
  )), [byMonth, zona, cur])

  const totalUniq = useMemo(() => new Set(byMonth.flat().map(e => e.t)).size, [byMonth])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px 60px' }}>
      <h1 style={{ fontSize: 23, fontWeight: 900, color: 'var(--text-strong)', marginBottom: 6 }}>Calendario de dividendos</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.55, maxWidth: 760 }}>
        En qué meses reparte dividendo cada empresa del universo, para planificar tus ingresos a lo largo del año.
        Una empresa que paga trimestralmente aparece en sus cuatro meses de reparto. {totalUniq} empresas con dividendo.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 22 }}>
        <Chips label="Región" opts={ZONAS} value={zona} onChange={setZona} />
        <Chips label="Divisa" opts={CURS} value={cur} onChange={setCur} />
      </div>

      <style>{`.cd-row:hover{background:var(--surface-2)}`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {filtered.map((entries, i) => <MonthCard key={i} month={i} entries={entries} />)}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-faintest)', marginTop: 18, lineHeight: 1.5 }}>
        Meses estimados a partir de las fechas ex-dividendo recientes de cada empresa; el pago efectivo suele producirse unas semanas después. El rendimiento mostrado es el yield actual (dividendo anual / precio).
      </p>
    </div>
  )
}

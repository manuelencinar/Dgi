'use client'
import { INVESTOR_PROFILES, PROFILE_ORDER, SUPERSECTORS } from '@/lib/supersectors'

// Selector de perfil de inversor + comparación del reparto real por
// supersectores contra el objetivo del perfil elegido.

const ROW_KEYS = ['defensivo', 'sensible', 'ciclico']   // orden de lectura

function StackBar({ weights }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: 16, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
      {ROW_KEYS.map(k => {
        const v = weights[k] || 0
        if (v <= 0) return null
        return <div key={k} title={`${SUPERSECTORS[k].label}: ${v.toFixed(0)}%`} style={{ width: `${v}%`, background: SUPERSECTORS[k].color, opacity: 0.85 }} />
      })}
    </div>
  )
}

export default function InvestorProfile({ fit, profileKey, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Perfil de inversor</p>
          <p style={{ fontSize: 11, color: '#3a4260' }}>Define el peso objetivo de cada supersector según el tipo de inversión que quieres.</p>
        </div>
        {fit?.fitScore != null && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: fit.fitScore >= 7 ? '#34d399' : fit.fitScore >= 5 ? '#fbbf24' : '#f87171' }}>{fit.fitScore.toFixed(1)}</p>
            <p style={{ fontSize: 10, color: '#4a5270' }}>encaje / 10</p>
          </div>
        )}
      </div>

      {/* Selector de perfil */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {PROFILE_ORDER.map(k => {
          const p = INVESTOR_PROFILES[k]
          const active = k === profileKey
          return (
            <button key={k} onClick={() => onChange(k)} style={{
              flex: '1 1 140px', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid ' + (active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'),
              background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
            }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: active ? '#a5b4fc' : '#c8d0e0', marginBottom: 2 }}>{p.label}</p>
              <p style={{ fontSize: 10.5, color: '#4a5270', lineHeight: 1.35 }}>{p.desc}</p>
              <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>Def {p.targets.defensivo}% · Sen {p.targets.sensible}% · Cíc {p.targets.ciclico}%</p>
            </button>
          )
        })}
      </div>

      {!fit ? (
        <p style={{ fontSize: 12, color: '#4a5270' }}>Añade posiciones para ver el encaje con tu perfil.</p>
      ) : fit.fitScore == null ? (
        <p style={{ fontSize: 12, color: '#4a5270' }}>Tu cartera son solo ETFs/fondos: el reparto por supersectores no aplica.</p>
      ) : (
        <>
          {/* Comparación real vs objetivo */}
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Tu cartera</p>
              <StackBar weights={fit.actual} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#4a5270', marginBottom: 4 }}>Objetivo · {fit.profileLabel}</p>
              <StackBar weights={fit.targets} />
            </div>
          </div>

          {/* Detalle por supersector */}
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {fit.rows.map(r => {
              const off = Math.abs(r.diff) > 10
              return (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                  <span style={{ color: '#c8d0e0', flex: 1 }}>{r.label}</span>
                  <span style={{ color: '#8090a8', fontVariantNumeric: 'tabular-nums' }}>{r.actual.toFixed(0)}%</span>
                  <span style={{ color: '#3a4260', fontSize: 11 }}>obj. {r.target}%</span>
                  <span style={{ width: 52, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: off ? (r.diff > 0 ? '#fbbf24' : '#60a5fa') : '#34d399' }}>
                    {r.diff > 0 ? '+' : ''}{r.diff.toFixed(0)} pts
                  </span>
                </div>
              )
            })}
          </div>

          {fit.recommendation && (
            <p style={{ fontSize: 12, color: fit.tvd > 10 ? '#fbbf24' : '#34d399', lineHeight: 1.5 }}>{fit.recommendation}</p>
          )}
          {fit.otrosPct >= 5 && (
            <p style={{ fontSize: 10.5, color: '#3a4260', marginTop: 8 }}>
              ETFs y fondos ({fit.otrosPct.toFixed(0)}% de la cartera) se excluyen de este reparto; los supersectores se calculan sobre la parte en acciones.
            </p>
          )}
        </>
      )}
    </div>
  )
}

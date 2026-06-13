'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { computeDGIScore, detectSectorType } from '@/lib/dgi-score'
import { DICT } from '@/data/dict'

const CARD    = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, marginBottom: 20 }
const INPUT   = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', color: '#c8d0e0', fontSize: 12, outline: 'none', width: 64 }
const SEC_TIT = { fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }

const DEFAULT_CONFIG = {
  priceDrop:    { enabled: true,  threshold: 20 },
  divGrowthLow: { enabled: true,  threshold: 3 },
  scoreLow:     { enabled: true,  threshold: 5 },
  payoutHigh:   { enabled: true,  threshold: 90 },
  debtHigh:     { enabled: true },
  divCut:       { enabled: true },
  emailAlerts:  false,
}

const SECTOR_DEBT_LIMIT = { reit: 7, utilities: 6.5, energy: 2.8, bank: null, insurer: null, general: 4.5, pharma: 4.5, luxury: 4.5 }

function nameOf(t) { return DICT.find(d => d[1] === t)?.[0] ?? t }

function Toggle({ value, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!value)} disabled={disabled} style={{
      width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: value ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.1)', position: 'relative', opacity: disabled ? 0.4 : 1, flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  )
}

// ── Alert computation (idéntica a la antigua AlertasPage) ───────────────────
function computeAlerts(positions, fundamentals, config) {
  const alerts = []
  const now = new Date().toISOString().slice(0, 10)

  positions.forEach(pos => {
    const f = fundamentals[pos.ticker]
    if (!f) return
    const name = nameOf(pos.ticker)
    const entry = DICT.find(d => d[1] === pos.ticker)
    const type = entry?.[6] ?? 'general'

    if (config.priceDrop?.enabled && f.current_price > 0 && f.week52_high > 0) {
      const drop = (f.week52_high - f.current_price) / f.week52_high * 100
      if (drop >= config.priceDrop.threshold) {
        alerts.push({ key: `${pos.ticker}:priceDrop`, ticker: pos.ticker, name, level: 'medio', date: now,
          type: 'Caída de precio', current: `-${drop.toFixed(1)}% desde máx.`, threshold: `≥${config.priceDrop.threshold}%` })
      }
    }

    const divHistory = Array.isArray(f.div_history) ? f.div_history : []
    const fullYears = divHistory.filter(h => !h.isPartial && h.growth != null)
    const lastFull  = fullYears[fullYears.length - 1]
    if (config.divGrowthLow?.enabled && lastFull && lastFull.growth != null) {
      const g = lastFull.growth * 100
      if (g >= 0 && g < config.divGrowthLow.threshold) {
        alerts.push({ key: `${pos.ticker}:divGrowthLow`, ticker: pos.ticker, name, level: 'medio', date: now,
          type: 'Crecimiento del dividendo bajo', current: `+${g.toFixed(1)}%`, threshold: `<${config.divGrowthLow.threshold}%` })
      }
    }

    if (config.divCut?.enabled && lastFull && lastFull.growth != null && lastFull.growth < 0) {
      alerts.push({ key: `${pos.ticker}:divCut`, ticker: pos.ticker, name, level: 'alto', date: now,
        type: 'Recorte de dividendo', current: `${(lastFull.growth * 100).toFixed(1)}%`, threshold: 'recorte' })
    }

    if (config.scoreLow?.enabled) {
      const streak = f.div_streak ?? 0
      const cagr   = f.div_cagr5 != null ? f.div_cagr5 / 100 : null
      const score  = computeDGIScore({ ...f, divHistory }, streak, cagr, null, type)
      if (score?.hasData && score.total != null && score.total < config.scoreLow.threshold) {
        alerts.push({ key: `${pos.ticker}:scoreLow`, ticker: pos.ticker, name, level: 'alto', date: now,
          type: 'Score DGI bajo', current: score.total.toFixed(1), threshold: `<${config.scoreLow.threshold}` })
      }
    }

    if (config.payoutHigh?.enabled && f.payout_fcf != null && f.payout_fcf > config.payoutHigh.threshold) {
      alerts.push({ key: `${pos.ticker}:payoutHigh`, ticker: pos.ticker, name, level: f.payout_fcf > 110 ? 'alto' : 'medio', date: now,
        type: 'Payout FCF elevado', current: `${f.payout_fcf.toFixed(0)}%`, threshold: `>${config.payoutHigh.threshold}%` })
    }

    if (config.debtHigh?.enabled) {
      const nd  = f.net_debt_ebitda ?? f.debt_ebitda
      const sec = detectSectorType(type, f.sector, f.industry)
      const lim = SECTOR_DEBT_LIMIT[sec]
      if (nd != null && lim != null && nd > lim) {
        alerts.push({ key: `${pos.ticker}:debtHigh`, ticker: pos.ticker, name, level: 'medio', date: now,
          type: 'Deuda elevada', current: `${nd.toFixed(1)}× EBITDA`, threshold: `>${lim}× (${sec})` })
      }
    }
  })

  return alerts
}

const ALERT_TYPES = [
  { key: 'priceDrop',    label: 'Caída de precio desde máximos 52 semanas', unit: '%', configurable: true },
  { key: 'divGrowthLow', label: 'Crecimiento del dividendo por debajo de', unit: '%', configurable: true },
  { key: 'scoreLow',     label: 'Score DGI cae por debajo de', unit: '', configurable: true },
  { key: 'payoutHigh',   label: 'Payout FCF supera el', unit: '%', configurable: true },
  { key: 'debtHigh',     label: 'Deuda neta/EBITDA supera el umbral del sector', unit: '', configurable: false },
  { key: 'divCut',       label: 'Recorte de dividendo (siempre activa)', unit: '', configurable: false, locked: true },
]

// Configuración y vista de alertas de cartera — antes era /cartera/alertas.
// Ahora vive dentro de Ajustes. Carga su propia cartera y persiste vía /api/ajustes
// (service_role), preservando el resto de claves de alert_config (p.ej. emailAlerts,
// que lee /api/procesar-aportaciones).
export default function AlertsSettings({ isPremium }) {
  const [loading, setLoading]   = useState(true)
  const [config, setConfig]     = useState(DEFAULT_CONFIG)
  const [dismissed, setDismissed] = useState([])
  const [positions, setPositions] = useState([])
  const [fundamentals, setFundamentals] = useState({})
  const [showHistory, setShowHistory] = useState(false)
  const [saveErr, setSaveErr] = useState(false)

  const sb = useMemo(() => createClient(), [])

  useEffect(() => { if (isPremium) load() }, [isPremium])

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }

    // user_settings es legible desde el cliente (RLS SELECT); la escritura va por API.
    const { data: settings } = await sb.from('user_settings').select('alert_config, alert_dismissed').eq('user_id', user.id).maybeSingle()
    if (settings) {
      if (settings.alert_config)    setConfig({ ...DEFAULT_CONFIG, ...settings.alert_config })
      if (settings.alert_dismissed) setDismissed(settings.alert_dismissed)
    }

    const { data: pos } = await sb.from('positions').select('*').eq('user_id', user.id)
    setPositions(pos || [])
    if (pos?.length) {
      const tickers = [...new Set(pos.map(p => p.ticker))]
      const { data: funds } = await sb.from('company_fundamentals')
        .select('ticker,current_price,week52_high,dps,div_history,div_streak,div_cagr5,payout_fcf,debt_ebitda,net_debt_ebitda,sector,industry,roic,gross_margin,operating_margin,net_margin,roe,roa,revenue_cagr5,fcf_cagr5,current_ratio,interest_coverage,pe_trailing,pe_forward,ev_ebitda,price_to_book,eps_trailing,fcf_per_share,payout_eps,market_cap_m,income_statement_annual,balance_sheet_annual,cashflow_annual,net_income_history,fcf_history')
        .in('ticker', tickers)
      setFundamentals(Object.fromEntries((funds || []).map(f => [f.ticker, f])))
    }
    setLoading(false)
  }

  // Persistencia vía API (whitelist incluye alert_config / alert_dismissed)
  const persist = async (patch) => {
    setSaveErr(false)
    try {
      const res = await fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (!res.ok) setSaveErr(true)
    } catch { setSaveErr(true) }
  }

  const updateConfig = (key, patch) => {
    const next = { ...config, [key]: { ...config[key], ...patch } }
    setConfig(next)
    persist({ alert_config: next })
  }

  const allAlerts = useMemo(() => computeAlerts(positions, fundamentals, config), [positions, fundamentals, config])
  const activeAlerts = allAlerts.filter(a => !dismissed.includes(a.key))
  const dismissedAlerts = allAlerts.filter(a => dismissed.includes(a.key))

  const dismiss = (key) => {
    const next = [...dismissed, key]
    setDismissed(next)
    persist({ alert_dismissed: next })
  }

  if (!isPremium) {
    return (
      <div style={CARD}>
        <p style={SEC_TIT}>Alertas de cartera</p>
        <p style={{ fontSize: 13, color: '#8090a8', marginBottom: 14 }}>
          Recibe avisos cuando tus empresas recortan el dividendo, suben el payout o caen de precio.
        </p>
        <Link href="/pricing" style={{ padding: '9px 18px', background: 'rgba(99,102,241,0.85)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
          Activar Premium →
        </Link>
      </div>
    )
  }

  return (
    <div style={CARD}>
      <p style={SEC_TIT}>Alertas de cartera</p>

      {saveErr && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#fbbf24' }}>⚠ No se pudo guardar la configuración. Si el problema persiste, faltan columnas en la base de datos (alert_config, alert_dismissed).</p>
        </div>
      )}

      {/* Alertas activas */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#8090a8', marginBottom: 12 }}>
          Alertas activas {activeAlerts.length > 0 && <span style={{ color: '#f87171' }}>({activeAlerts.length})</span>}
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: '#4a5270' }}>Cargando alertas…</p>
        ) : positions.length === 0 ? (
          <p style={{ fontSize: 13, color: '#4a5270' }}>Añade posiciones a tu cartera para recibir alertas.</p>
        ) : activeAlerts.length === 0 ? (
          <p style={{ fontSize: 13, color: '#34d399' }}>✓ No hay alertas activas en este momento.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {activeAlerts.map(a => (
              <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: a.level === 'alto' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)', borderRadius: 8, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 220 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.level === 'alto' ? '#f87171' : '#fbbf24', flexShrink: 0 }} />
                  <div>
                    <Link href={`/empresa/${encodeURIComponent(a.ticker)}`} style={{ fontSize: 13, fontWeight: 700, color: '#c8d0e0', textDecoration: 'none' }}>{a.name}</Link>
                    <p style={{ fontSize: 11, color: a.level === 'alto' ? '#f87171' : '#fbbf24' }}>{a.type} · {a.current} <span style={{ color: '#4a5270' }}>(umbral {a.threshold})</span></p>
                  </div>
                </div>
                <button onClick={() => dismiss(a.key)} style={{ fontSize: 11, color: '#4a5270', background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', flexShrink: 0 }}>
                  Marcar como vista
                </button>
              </div>
            ))}
          </div>
        )}

        {dismissedAlerts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowHistory(s => !s)} style={{ background: 'none', border: 'none', color: '#4a5270', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              {showHistory ? '▲' : '▼'} Alertas vistas ({dismissedAlerts.length})
            </button>
            {showHistory && (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {dismissedAlerts.map(a => (
                  <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(255,255,255,0.015)', borderRadius: 6, opacity: 0.6 }}>
                    <span style={{ fontSize: 12, color: '#8090a8' }}>{a.name} — {a.type}</span>
                    <span style={{ fontSize: 11, color: '#4a5270' }}>{a.current}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuración de umbrales */}
      <p style={{ fontSize: 12, fontWeight: 700, color: '#8090a8', marginBottom: 12 }}>Umbrales de alerta</p>
      <div style={{ display: 'grid', gap: 12 }}>
        {ALERT_TYPES.map(t => (
          <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 13, color: '#c8d0e0', flex: 1 }}>{t.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {t.configurable && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" style={INPUT} value={config[t.key]?.threshold ?? ''} disabled={!config[t.key]?.enabled}
                    onChange={e => updateConfig(t.key, { threshold: parseFloat(e.target.value) || 0 })} />
                  {t.unit && <span style={{ fontSize: 11, color: '#4a5270' }}>{t.unit}</span>}
                </div>
              )}
              <Toggle value={config[t.key]?.enabled ?? false} disabled={t.locked} onChange={v => updateConfig(t.key, { enabled: v })} />
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: '#2e3a55', marginTop: 14 }}>
        Las alertas se comprueban cada domingo al actualizar los datos de mercado. El envío por email se activa en la sección <b style={{ color: '#4a5270' }}>Notificaciones</b>.
      </p>
    </div>
  )
}

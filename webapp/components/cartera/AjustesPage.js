'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const CARD  = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 }
const INPUT = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#c8d0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const LABEL = { fontSize: 12, color: '#4a5270', marginBottom: 6, display: 'block' }
const BTN   = { padding: '11px 24px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }

const CURRENCIES = ['EUR','USD','GBP','CHF','CAD','AUD','SEK','DKK','NOK','JPY']
const COUNTRIES  = [
  { v:'ES', l:'España' }, { v:'US', l:'Estados Unidos' }, { v:'GB', l:'Reino Unido' },
  { v:'DE', l:'Alemania' }, { v:'FR', l:'Francia' }, { v:'IT', l:'Italia' },
  { v:'NL', l:'Países Bajos' }, { v:'BE', l:'Bélgica' }, { v:'CH', l:'Suiza' },
  { v:'SE', l:'Suecia' }, { v:'DK', l:'Dinamarca' }, { v:'NO', l:'Noruega' },
  { v:'CA', l:'Canadá' }, { v:'AU', l:'Australia' }, { v:'NZ', l:'Nueva Zelanda' },
  { v:'JP', l:'Japón' }, { v:'SG', l:'Singapur' }, { v:'HK', l:'Hong Kong' },
  { v:'OTHER', l:'Otro' },
]
const BENCHMARKS = ['MSCI World','S&P 500','MSCI Europe','MSCI Emerging Markets','FTSE All-World','Eurostoxx 50']

const DEFAULTS = {
  base_currency: 'EUR', country_residence: 'ES', broker_name: '',
  fx_commission_pct: 0, fx_alert_threshold: 10,
  benchmark_index: 'MSCI World', monthly_summary_active: false, alerts_email_active: false,
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <p style={{ fontSize: 13, color: '#c8d0e0', marginBottom: 2 }}>{label}</p>
        {description && <p style={{ fontSize: 11, color: '#4a5270' }}>{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: value ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.08)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18,
          borderRadius: 9, background: '#fff', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

export default function AjustesPage() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [saved,   setSaved]     = useState(false)
  const [error,   setError]     = useState(null)

  const sb = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    // Lectura vía API con service_role (user_settings no es legible por RLS desde el navegador)
    let data = null
    try {
      const res  = await fetch('/api/ajustes', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      data = json.settings || null
    } catch {}

    if (data) {
      setSettings({
        base_currency:         data.base_currency         ?? DEFAULTS.base_currency,
        country_residence:     data.country_residence     ?? DEFAULTS.country_residence,
        broker_name:           data.broker_name           ?? '',
        fx_commission_pct:     data.fx_commission_pct     ?? 0,
        fx_alert_threshold:    data.fx_alert_threshold    ?? 10,
        benchmark_index:       data.benchmark_index       ?? DEFAULTS.benchmark_index,
        monthly_summary_active: data.monthly_summary_active ?? false,
        alerts_email_active:   data.alerts_email_active   ?? false,
      })
    }
    setLoading(false)
  }

  const set = (key, value) => setSettings(s => ({ ...s, [key]: value }))

  const save = async () => {
    setSaving(true); setError(null); setSaved(false)

    // Guardado vía API con service_role (user_settings no permite escritura por RLS desde el navegador)
    const payload = {
      base_currency:          settings.base_currency,
      country_residence:      settings.country_residence,
      broker_name:            settings.broker_name || null,
      fx_commission_pct:      parseFloat(settings.fx_commission_pct) || 0,
      fx_alert_threshold:     settings.fx_alert_threshold != null && settings.fx_alert_threshold !== '' ? parseFloat(settings.fx_alert_threshold) : null,
      benchmark_index:        settings.benchmark_index || null,
      monthly_summary_active: settings.monthly_summary_active,
      alerts_email_active:    settings.alerts_email_active,
    }
    try {
      const res  = await fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError('Error al guardar: ' + (data.error || 'desconocido')); setSaving(false); return }
    } catch (e) { setError('Error al guardar: ' + String(e.message || e)); setSaving(false); return }

    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#4a5270' }}>Cargando ajustes…</div>

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px 64px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e0e8f0', marginBottom: 24 }}>Ajustes</h1>

      {/* Divisa y broker */}
      <div style={CARD}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Divisa y broker</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={LABEL}>Divisa base</label>
            <select style={INPUT} value={settings.base_currency} onChange={e => set('base_currency', e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>País de residencia fiscal</label>
            <select style={INPUT} value={settings.country_residence} onChange={e => set('country_residence', e.target.value)}>
              {COUNTRIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={LABEL}>Broker o plataforma</label>
          <input style={INPUT} placeholder="Degiro, Interactive Brokers, MyInvestor…" value={settings.broker_name} onChange={e => set('broker_name', e.target.value)} />
        </div>
      </div>

      {/* Comisiones de cambio */}
      <div style={CARD}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Comisión de cambio de divisa</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={LABEL}>Comisión de cambio (%)</label>
            <input style={INPUT} type="number" step="0.01" min="0" max="5" placeholder="0.00" value={settings.fx_commission_pct} onChange={e => set('fx_commission_pct', e.target.value)} />
            <p style={{ fontSize: 11, color: '#4a5270', marginTop: 4 }}>Se aplica al calcular el coste real de operaciones en divisa extranjera</p>
          </div>
          <div>
            <label style={LABEL}>Umbral de alerta FX (%)</label>
            <input style={INPUT} type="number" step="0.5" min="0" placeholder="10" value={settings.fx_alert_threshold ?? ''} onChange={e => set('fx_alert_threshold', e.target.value)} />
            <p style={{ fontSize: 11, color: '#4a5270', marginTop: 4 }}>Avisa cuando la comisión acumulada supere este % del importe</p>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(129,140,248,0.06)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#8090a8' }}>
            Ejemplos: Degiro 0.25%, Interactive Brokers 0.20%, MyInvestor 0.75%, Revolut 0.00–1.00%
          </p>
        </div>
      </div>

      {/* Benchmark y análisis */}
      <div style={CARD}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Análisis y benchmark</p>
        <div>
          <label style={LABEL}>Índice de referencia</label>
          <select style={INPUT} value={settings.benchmark_index} onChange={e => set('benchmark_index', e.target.value)}>
            {BENCHMARKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {/* Notificaciones */}
      <div style={CARD}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Notificaciones</p>
        <Toggle
          value={settings.monthly_summary_active}
          onChange={v => set('monthly_summary_active', v)}
          label="Resumen mensual por email"
          description="Recibe el día 1 de cada mes un resumen de tu cartera, dividendos y progreso"
        />
        <Toggle
          value={settings.alerts_email_active}
          onChange={v => set('alerts_email_active', v)}
          label="Alertas por email"
          description="Notificaciones cuando se disparen tus alertas configuradas"
        />
      </div>

      {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</p>}
      {saved  && <p style={{ fontSize: 12, color: '#34d399', marginBottom: 12 }}>Ajustes guardados correctamente.</p>}

      <button onClick={save} disabled={saving} style={{ ...BTN, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </div>
  )
}

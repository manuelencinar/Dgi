'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Design tokens ──────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'vayaebookk@gmail.com'

const CARD    = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, marginBottom: 20 }
const INPUT   = { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#c8d0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const LABEL   = { fontSize: 12, color: '#4a5270', marginBottom: 6, display: 'block' }
const BTN     = { padding: '10px 22px', background: 'rgba(99,102,241,0.85)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const BTN_RED = { ...BTN, background: 'rgba(248,113,113,0.8)' }
const BTN_GHO = { ...BTN, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4a5270' }
const SEC_TIT = { fontSize: 11, fontWeight: 700, color: '#4a5270', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }
const H_LINE  = { borderTop: '1px solid rgba(255,255,255,0.06)', margin: '16px 0' }

const CURRENCIES = ['EUR','USD','GBP','CHF','CAD','AUD','SEK','DKK','NOK','JPY']
const COUNTRIES  = [
  { v:'ES',l:'España' },{ v:'US',l:'Estados Unidos' },{ v:'GB',l:'Reino Unido' },
  { v:'DE',l:'Alemania' },{ v:'FR',l:'Francia' },{ v:'IT',l:'Italia' },
  { v:'NL',l:'Países Bajos' },{ v:'BE',l:'Bélgica' },{ v:'CH',l:'Suiza' },
  { v:'SE',l:'Suecia' },{ v:'DK',l:'Dinamarca' },{ v:'NO',l:'Noruega' },
  { v:'PT',l:'Portugal' },{ v:'CA',l:'Canadá' },{ v:'AU',l:'Australia' },
  { v:'NZ',l:'Nueva Zelanda' },{ v:'JP',l:'Japón' },{ v:'SG',l:'Singapur' },
  { v:'OTHER',l:'Otro' },
]
const BENCHMARKS = [
  'MSCI World','S&P 500','MSCI Europe','MSCI Emerging Markets',
  'FTSE All-World','Eurostoxx 50','IBEX 35','DAX','CAC 40',
]
const BROKER_REFS = [
  { broker:'Interactive Brokers', range:'0.03% – 0.20%' },
  { broker:'DeGiro',              range:'0.25%' },
  { broker:'Trading 212',         range:'0.15%' },
  { broker:'Revolut',             range:'0% – 0.50% según plan' },
  { broker:'Banco español típico',range:'0.50% – 1.50%' },
]

function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <p style={{ fontSize:13, color:'#c8d0e0', marginBottom: description ? 2 : 0 }}>{label}</p>
        {description && <p style={{ fontSize:11, color:'#4a5270' }}>{description}</p>}
      </div>
      <button type="button" onClick={() => onChange(!value)} style={{
        width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', flexShrink:0,
        background: value ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.08)', position:'relative', transition:'background 0.2s',
      }}>
        <span style={{ position:'absolute', top:3, left: value ? 23 : 3, width:18, height:18, borderRadius:9, background:'#fff', transition:'left 0.2s' }} />
      </button>
    </div>
  )
}

function SaveFeedback({ saved, error }) {
  if (saved)  return <span style={{ fontSize:12, color:'#34d399', marginLeft:12 }}>✓ Guardado</span>
  if (error)  return <span style={{ fontSize:12, color:'#f87171', marginLeft:12 }}>{error}</span>
  return null
}

function useSave(fields, supabase) {
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [err,    setErr]    = useState(null)
  const timer = useRef(null)

  const save = async () => {
    setSaving(true); setErr(null); setSaved(false)
    const updates = {}
    fields.forEach(([key, val]) => { updates[key] = val })
    try {
      // Las preferencias se guardan vía API con service_role (user_settings no
      // permite escritura directa desde el cliente por RLS — campos sensibles).
      const res  = await fetch('/api/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Error al guardar'); setSaving(false); return }
    } catch (e) { setErr(String(e.message || e)); setSaving(false); return }
    setSaved(true); setSaving(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaved(false), 3000)
  }

  return { saving, saved, err, save }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AjustesGlobalPage() {
  const router = useRouter()
  const sb     = createClient()

  const [user,     setUser]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [settings, setSettings] = useState(null)
  const [plan,     setPlan]     = useState(null)
  const [premiumUntil, setPremiumUntil] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Sección-specific state
  const [baseCurrency,   setBaseCurrency]   = useState('EUR')
  const [country,        setCountry]        = useState('ES')
  const [brokerName,     setBrokerName]     = useState('')

  const [fxPct,          setFxPct]          = useState(0)
  const [fxThreshold,    setFxThreshold]    = useState(10)
  const [showBrokerTable, setShowBrokerTable] = useState(false)

  const [benchmark,      setBenchmark]      = useState('MSCI World')
  const [showOriginal,   setShowOriginal]   = useState(false)

  const [monthlySummary, setMonthlySummary] = useState(false)
  const [alertsEmail,    setAlertsEmail]    = useState(false)
  const [recurringEmail, setRecurringEmail] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteInput,   setDeleteInput]   = useState('')
  const [deleting,      setDeleting]      = useState(false)

  // Portal loading
  const [portalLoading, setPortalLoading] = useState(false)

  // Per-section save helpers
  const s1 = useSave([['base_currency',baseCurrency],['country_residence',country],['broker_name',brokerName||null]], sb)
  const s2 = useSave([['fx_commission_pct',parseFloat(fxPct)||0],['fx_alert_threshold',parseFloat(fxThreshold)||null]], sb)
  const s3 = useSave([['benchmark_index',benchmark],['show_returns_original',showOriginal]], sb)
  const s4 = useSave([['monthly_summary_active',monthlySummary],['alerts_email_active',alertsEmail],['recurring_email_active',recurringEmail||false]], sb)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data: { user: u } } = await sb.auth.getUser()
    if (!u) { router.push('/login'); return }
    setUser(u)

    // Las preferencias se leen vía API con service_role (user_settings no es
    // legible desde el navegador por RLS).
    let data = null
    try {
      const res  = await fetch('/api/ajustes', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setLoadError(`No se pudieron cargar los ajustes (${res.status}): ${json.error || 'error desconocido'}`)
      data = json.settings || null
    } catch (e) { setLoadError('No se pudieron cargar los ajustes: ' + String(e.message || e)) }

    if (data) {
      setBaseCurrency(data.base_currency || 'EUR')
      setCountry(data.country_residence || 'ES')
      setBrokerName(data.broker_name || '')
      setFxPct(data.fx_commission_pct ?? 0)
      setFxThreshold(data.fx_alert_threshold ?? 10)
      setBenchmark(data.benchmark_index || 'MSCI World')
      setShowOriginal(data.show_returns_original || false)
      setMonthlySummary(data.monthly_summary_active || false)
      setAlertsEmail(data.alerts_email_active || false)
      setRecurringEmail(data.recurring_email_active || false)
      setPlan(u.email === ADMIN_EMAIL ? 'premium' : (data.plan || 'free'))
      setPremiumUntil(data.premium_until || null)
    }
    // Si el usuario es admin y no tiene fila en user_settings, marcarlo premium
    if (!data && u.email === ADMIN_EMAIL) setPlan('premium')
    setSettings(data)
    setLoading(false)
  }

  const openStripePortal = async () => {
    setPortalLoading(true)
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) { window.location.href = data.url; return }
      alert(data.error || 'No se pudo abrir el portal de Stripe. Inténtalo de nuevo más tarde.')
    } catch {
      alert('No se pudo abrir el portal de Stripe. Inténtalo de nuevo más tarde.')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!user?.email) return
    await sb.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/ajustes` })
    alert('Te hemos enviado un email para restablecer tu contraseña.')
  }

  const handleExportData = async () => {
    const [{ data: positions }, { data: transactions }, { data: dividends }, { data: recurring }] = await Promise.all([
      sb.from('positions').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id),
      sb.from('dividends_received').select('*').eq('user_id', user.id),
      sb.from('recurring_contributions').select('*').eq('user_id', user.id),
    ])
    const blob = new Blob([
      JSON.stringify({ positions, transactions, dividends_received: dividends, recurring_contributions: recurring, exported_at: new Date().toISOString() }, null, 2)
    ], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'mi-cartera-dgi.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toLowerCase() !== 'eliminar') return
    setDeleting(true)
    const res = await fetch('/api/account/delete', { method: 'POST' })
    if (!res.ok) { setDeleting(false); alert('Error al eliminar la cuenta. Inténtalo de nuevo.'); return }
    await sb.auth.signOut()
    router.push('/')
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#4a5270' }}>Cargando ajustes…</div>

  const isPremium = plan === 'premium' && (!premiumUntil || new Date(premiumUntil) >= new Date())

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 16px 80px' }}>
      <h1 style={{ fontSize:22, fontWeight:900, color:'#e0e8f0', marginBottom: loadError ? 12 : 28 }}>Ajustes</h1>
      {loadError && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8 }}>
          <p style={{ fontSize: 12, color: '#f87171' }}>{loadError}</p>
        </div>
      )}

      {/* ── SECCIÓN 1: Perfil y preferencias ─────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Perfil y preferencias</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          <div>
            <label style={LABEL}>Divisa base</label>
            <select style={INPUT} value={baseCurrency} onChange={e => setBaseCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <p style={{ fontSize:11, color:'#4a5270', marginTop:4 }}>Todos los importes de la cartera se muestran en esta divisa</p>
          </div>
          <div>
            <label style={LABEL}>País de residencia fiscal</label>
            <select style={INPUT} value={country} onChange={e => setCountry(e.target.value)}>
              {COUNTRIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
            <p style={{ fontSize:11, color:'#4a5270', marginTop:4 }}>Afecta al cálculo de retenciones en origen</p>
          </div>
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={LABEL}>Broker principal</label>
          <input style={INPUT} placeholder="Ej: DeGiro, Interactive Brokers, MyInvestor…" value={brokerName} onChange={e => setBrokerName(e.target.value)} />
        </div>
        <div style={{ display:'flex', alignItems:'center' }}>
          <button onClick={() => s1.save(user.id)} disabled={s1.saving} style={{ ...BTN, opacity:s1.saving?0.6:1 }}>{s1.saving?'Guardando…':'Guardar cambios'}</button>
          <SaveFeedback saved={s1.saved} error={s1.err} />
        </div>
      </div>

      {/* ── SECCIÓN 2: Comisión de cambio ────────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Comisión de cambio de divisa</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:14 }}>
          <div>
            <label style={LABEL}>Comisión de cambio (%)</label>
            <input style={INPUT} type="number" step="0.01" min="0" max="5" placeholder="0.50" value={fxPct} onChange={e => setFxPct(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Umbral de alerta (€)</label>
            <input style={INPUT} type="number" step="1" min="0" placeholder="10" value={fxThreshold} onChange={e => setFxThreshold(e.target.value)} />
            <p style={{ fontSize:11, color:'#4a5270', marginTop:4 }}>Avisa cuando la comisión de una operación supere este importe</p>
          </div>
        </div>
        <p style={{ fontSize:12, color:'#8090a8', marginBottom:12 }}>
          Esta comisión se aplica cuando compras o vendes activos en una divisa diferente a la tuya. Consúltala en las tarifas de tu broker.
        </p>

        <button type="button" onClick={() => setShowBrokerTable(v => !v)} style={{ fontSize:12, color:'#818cf8', background:'none', border:'none', cursor:'pointer', padding:0, marginBottom: showBrokerTable ? 12 : 0 }}>
          {showBrokerTable ? '▲ Ocultar' : '▼ Ver'} comisiones típicas por broker
        </button>
        {showBrokerTable && (
          <div style={{ overflowX:'auto', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Broker','Comisión habitual'].map(h => (
                    <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:'#4a5270', borderBottom:'1px solid rgba(255,255,255,0.06)', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BROKER_REFS.map(b => (
                  <tr key={b.broker} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'6px 10px', color:'#c8d0e0' }}>{b.broker}</td>
                    <td style={{ padding:'6px 10px', color:'#8090a8' }}>{b.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', marginTop:6 }}>
          <button onClick={() => s2.save(user.id)} disabled={s2.saving} style={{ ...BTN, opacity:s2.saving?0.6:1 }}>{s2.saving?'Guardando…':'Guardar cambios'}</button>
          <SaveFeedback saved={s2.saved} error={s2.err} />
        </div>
      </div>

      {/* ── SECCIÓN 3: Cartera ───────────────────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Cartera</p>
        <div style={{ marginBottom:16 }}>
          <label style={LABEL}>Índice de referencia (benchmark)</label>
          <select style={INPUT} value={benchmark} onChange={e => setBenchmark(e.target.value)}>
            {BENCHMARKS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <p style={{ fontSize:11, color:'#4a5270', marginTop:4 }}>Se usa para comparar el rendimiento de tu cartera DGI</p>
        </div>
        <Toggle
          value={showOriginal}
          onChange={setShowOriginal}
          label="Mostrar rentabilidad en divisa original"
          description="Si está desactivado, todos los valores se convierten a tu divisa base"
        />
        <div style={{ display:'flex', alignItems:'center', marginTop:16 }}>
          <button onClick={() => s3.save(user.id)} disabled={s3.saving} style={{ ...BTN, opacity:s3.saving?0.6:1 }}>{s3.saving?'Guardando…':'Guardar cambios'}</button>
          <SaveFeedback saved={s3.saved} error={s3.err} />
        </div>
      </div>

      {/* ── SECCIÓN 4: Notificaciones ─────────────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Notificaciones</p>
        <Toggle
          value={monthlySummary}
          onChange={setMonthlySummary}
          label="Resumen mensual por email"
          description="Recibes el día 1 de cada mes: cartera, dividendos y progreso"
        />
        <Toggle
          value={alertsEmail}
          onChange={setAlertsEmail}
          label="Alertas por email"
          description="Notificaciones cuando se disparan tus alertas configuradas"
        />
        <Toggle
          value={recurringEmail}
          onChange={setRecurringEmail}
          label="Notificación al ejecutar aportaciones periódicas"
          description="Email cuando se realiza una aportación automática"
        />
        <div style={{ display:'flex', alignItems:'center', marginTop:16 }}>
          <button onClick={() => s4.save(user.id)} disabled={s4.saving} style={{ ...BTN, opacity:s4.saving?0.6:1 }}>{s4.saving?'Guardando…':'Guardar cambios'}</button>
          <SaveFeedback saved={s4.saved} error={s4.err} />
        </div>
      </div>

      {/* ── SECCIÓN 5: Suscripción ───────────────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Suscripción</p>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div>
            <p style={{ fontSize:15, fontWeight:700, color: isPremium ? '#fbbf24' : '#c8d0e0', marginBottom:4 }}>
              Plan {isPremium ? 'Premium' : 'Gratuito'}
            </p>
            {isPremium && premiumUntil && (
              <p style={{ fontSize:12, color:'#4a5270' }}>
                Renueva el {new Date(premiumUntil).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })}
              </p>
            )}
            {!isPremium && (
              <p style={{ fontSize:12, color:'#4a5270' }}>Acceso básico permanente sin tarjeta</p>
            )}
          </div>
          {isPremium ? (
            <button onClick={openStripePortal} disabled={portalLoading} style={{ ...BTN, opacity:portalLoading?0.6:1 }}>
              {portalLoading ? 'Abriendo…' : 'Gestionar suscripción →'}
            </button>
          ) : (
            <Link href="/pricing" style={{ ...BTN, textDecoration:'none', display:'inline-block' }}>Actualizar a Premium →</Link>
          )}
        </div>
        {!isPremium && (
          <div style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ textAlign:'center', padding:10 }}>
                <p style={{ fontSize:11, color:'#4a5270', marginBottom:4 }}>Plan mensual</p>
                <p style={{ fontSize:22, fontWeight:900, color:'#818cf8' }}>9,99€</p>
                <p style={{ fontSize:11, color:'#4a5270' }}>al mes</p>
              </div>
              <div style={{ textAlign:'center', padding:10, borderLeft:'1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize:11, color:'#4a5270', marginBottom:4 }}>Plan anual</p>
                <p style={{ fontSize:22, fontWeight:900, color:'#818cf8' }}>59,90€</p>
                <p style={{ fontSize:11, color:'#34d399' }}>4,99€/mes · ahorra 50%</p>
              </div>
            </div>
          </div>
        )}
        {isPremium && (
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Link href="/cancelar" style={{ fontSize: 12, color: '#4a5270', textDecoration: 'underline' }}>Cancelar suscripción</Link>
          </div>
        )}
      </div>

      {/* ── SECCIÓN 6: Cuenta ────────────────────────────────────────────── */}
      <div style={CARD}>
        <p style={SEC_TIT}>Cuenta</p>

        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:12, color:'#4a5270', marginBottom:2 }}>Email de la cuenta</p>
          <p style={{ fontSize:14, color:'#c8d0e0' }}>{user?.email}</p>
        </div>

        <div style={H_LINE} />

        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
          <button onClick={handleChangePassword} style={BTN_GHO}>Cambiar contraseña</button>
          <button onClick={handleExportData}     style={BTN_GHO}>Exportar mis datos (JSON)</button>
        </div>

        <div style={H_LINE} />

        {!deleteConfirm ? (
          <div>
            <p style={{ fontSize:12, color:'#4a5270', marginBottom:10 }}>
              Eliminar tu cuenta borrará permanentemente todas tus posiciones, transacciones y datos. Esta acción no se puede deshacer.
            </p>
            <button onClick={() => setDeleteConfirm(true)} style={BTN_RED}>Eliminar cuenta</button>
          </div>
        ) : (
          <div style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:10, padding:'16px' }}>
            <p style={{ fontSize:13, fontWeight:700, color:'#f87171', marginBottom:8 }}>¿Seguro que quieres eliminar tu cuenta?</p>
            <p style={{ fontSize:12, color:'#8090a8', marginBottom:12 }}>
              Escribe <strong style={{ color:'#f87171' }}>eliminar</strong> para confirmar. Se borrarán todos tus datos de forma permanente.
            </p>
            <input
              style={{ ...INPUT, marginBottom:12, borderColor:'rgba(248,113,113,0.3)' }}
              placeholder="eliminar"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setDeleteConfirm(false); setDeleteInput('') }} style={BTN_GHO}>Cancelar</button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput.trim().toLowerCase() !== 'eliminar' || deleting}
                style={{ ...BTN_RED, opacity:(deleteInput.trim().toLowerCase() === 'eliminar' && !deleting) ? 1 : 0.4 }}
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar mi cuenta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

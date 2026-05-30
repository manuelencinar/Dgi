'use client'
import { useState } from 'react'
import { BTN, INP, LBL } from '@/lib/helpers'

export default function SettingsPage({ onClose, destWHT, saveDestWHT, githubUrl, onSetGithubUrl, plan, userEmail, onLogout }) {
  const isFree  = plan === 'free'

  const [syncMsg,     setSyncMsg]     = useState('')
  const [syncing,     setSyncing]     = useState(false)
  const [localGithub, setLocalGithub] = useState(githubUrl || '')

  const [grantEmail,    setGrantEmail]    = useState('')
  const [grantMsg,      setGrantMsg]      = useState('')
  const [granting,      setGranting]      = useState(false)
  const [grantDate,     setGrantDate]     = useState('')
  const [indefinido,    setIndefinido]    = useState(true)

  async function handleSync() {
    if (!localGithub) { setSyncMsg('Introduce la URL del JSON primero.'); return }
    setSyncing(true)
    setSyncMsg('Sincronizando...')
    try {
      const r = await fetch('/api/admin/sync-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: localGithub }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Error desconocido')
      setSyncMsg(`✓ ${data.total} empresas · ${data.scored} con score`)
      onSetGithubUrl(localGithub)
    } catch(e) {
      setSyncMsg('✗ ' + e.message)
    }
    setSyncing(false)
  }

  async function handleGrant(revoke = false) {
    if (!grantEmail) { setGrantMsg('Introduce un email.'); return }
    setGranting(true)
    setGrantMsg(revoke ? 'Revocando...' : 'Concediendo premium...')
    try {
      const r = await fetch('/api/admin/grant-premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: grantEmail.trim(),
          revoke,
          premiumUntil: (!revoke && !indefinido && grantDate) ? new Date(grantDate + 'T23:59:59').toISOString() : null,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Error')
      const hasta = data.premium_until ? ` hasta ${new Date(data.premium_until).toLocaleDateString('es-ES')}` : ' indefinidamente'
      setGrantMsg(revoke ? `✓ Plan gratuito restaurado para ${data.email}` : `✓ Premium concedido a ${data.email}${hasta}`)
      setGrantEmail('')
    } catch(e) {
      setGrantMsg('✗ ' + e.message)
    }
    setGranting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#0f1221', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#e0e8f0' }}>Ajustes</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6a7090', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Plan */}
        <div style={{ padding: '12px 14px', background: isFree ? 'rgba(251,191,36,0.05)' : 'rgba(99,102,241,0.05)', border: '1px solid ' + (isFree ? 'rgba(251,191,36,0.2)' : 'rgba(99,102,241,0.2)'), borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: isFree ? '#fbbf24' : '#818cf8' }}>{isFree ? 'Plan Gratuito' : 'Plan Premium ✓'}</p>
              <p style={{ fontSize: 11, color: '#4a5270', marginTop: 2 }}>
                {isFree ? 'Acceso limitado al índice global' : 'Acceso completo · Todas las funciones'}
              </p>
            </div>
            {isFree && (
              <a href="/pricing" style={{ ...BTN, padding: '6px 14px', fontSize: 12, background: 'rgba(99,102,241,0.8)', textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
                Upgrade ↗
              </a>
            )}
          </div>
        </div>

        {/* Cuenta */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...LBL, color: '#818cf8' }}>Cuenta</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: '#8090a8' }}>{userEmail}</span>
            <button onClick={onLogout} style={{ ...BTN, padding: '4px 12px', fontSize: 11, background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
              Salir
            </button>
          </div>
        </div>

        {/* WHT */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>Retención fiscal destino (%)</label>
          <input style={{ ...INP, marginBottom: 0 }} type="number" step="0.1" value={destWHT}
            onChange={e => saveDestWHT(e.target.value)} placeholder="19" />
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 4 }}>España: 19 %. Ajusta según tu país de residencia fiscal.</p>
        </div>

        {/* Admin: Sincronizar índice */}
        <div style={{ padding: '14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ⚡ Admin — Sincronizar índice global
            </p>
            <input
              style={{ ...INP, marginBottom: 8 }}
              placeholder="https://raw.githubusercontent.com/..."
              value={localGithub}
              onChange={e => setLocalGithub(e.target.value)}
            />
            <button onClick={handleSync} disabled={syncing}
              style={{ ...BTN, width: '100%', background: syncing ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.6)', color: '#e0e8f0', fontSize: 12 }}>
              {syncing ? 'Sincronizando...' : '↻ Sincronizar ahora'}
            </button>
            {syncMsg && <p style={{ fontSize: 11, color: '#818cf8', marginTop: 8 }}>{syncMsg}</p>}
        </div>

        {/* Admin: Gestión de premium */}
        <div style={{ padding: '14px', background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, marginTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            🎁 Admin — Conceder Premium gratis
          </p>
          <input
            style={{ ...INP, marginBottom: 8 }}
            type="email"
            placeholder="email@usuario.com"
            value={grantEmail}
            onChange={e => setGrantEmail(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#8090a8' }}>
              <input type="checkbox" checked={indefinido} onChange={e => setIndefinido(e.target.checked)}
                style={{ accentColor: '#34d399', width: 14, height: 14 }}/>
              Sin fecha de fin
            </label>
            {!indefinido && (
              <input
                type="date"
                value={grantDate}
                onChange={e => setGrantDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={{ ...INP, flex: 1, marginBottom: 0, fontSize: 12, padding: '6px 10px' }}
              />
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => handleGrant(false)} disabled={granting}
              style={{ ...BTN, background: 'rgba(52,211,153,0.25)', color: '#34d399', fontSize: 12 }}>
              {granting ? '...' : '⭐ Dar Premium'}
            </button>
            <button onClick={() => handleGrant(true)} disabled={granting}
              style={{ ...BTN, background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: 12 }}>
              {granting ? '...' : '✕ Revocar'}
            </button>
          </div>
          {grantMsg && <p style={{ fontSize: 11, color: '#34d399', marginTop: 8 }}>{grantMsg}</p>}
        </div>
      </div>
    </div>
  )
}

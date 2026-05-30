'use client'
import { useState, useCallback } from 'react'
import { BTN } from '@/lib/helpers'
import IndexTab from './IndexTab'
import CarteraTab from './CarteraTab'
import SettingsPage from './SettingsPage'
import UpgradeModal from './UpgradeModal'

const TABS = [
  { id: 'indice',  label: 'Índice'  },
  { id: 'cartera', label: 'Cartera' },
]

export default function DgiApp({ scoresMap, initialSettings, userEmail }) {
  const [tab, setTab]               = useState('indice')
  const [destWHT, setDestWHT]       = useState(initialSettings?.dest_wht || 19)
  const [githubUrl, setGithubUrl]   = useState(initialSettings?.github_url || '')
  const [plan, setPlan]             = useState(initialSettings?.plan || 'free')
  const [showSettings, setShowSettings] = useState(false)
  const [showUpgrade, setShowUpgrade]   = useState(false)

  const saveSettings = useCallback(async (patch) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    } catch(e) {}
  }, [])

  function saveDestWHT(v) {
    const n = parseFloat(v) || 19
    setDestWHT(n)
    saveSettings({ dest_wht: n })
  }

  function handleSetGithubUrl(url) {
    setGithubUrl(url)
    saveSettings({ github_url: url })
  }

  async function handleLogout() {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 12px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: '#e0e8f0', lineHeight: 1 }}>Mi Índice DGI</h1>
          <p style={{ fontSize: 10, color: '#3a4260', marginTop: 2 }}>
            {plan === 'premium' ? '⭐ Premium' : 'Plan gratuito'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {plan !== 'premium' && (
            <button onClick={() => setShowUpgrade(true)} style={{
              fontSize: 9, color: '#fbbf24', background: 'rgba(251,191,36,0.12)',
              padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.2)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              FREE
            </button>
          )}
          <button onClick={() => setShowSettings(true)} style={{
            ...BTN, fontSize: 13, padding: '6px 11px',
            background: 'rgba(255,255,255,0.05)', color: '#6a7090',
          }}>
            ⚙️
          </button>
        </div>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {showSettings && (
        <SettingsPage
          onClose={() => setShowSettings(false)}
          destWHT={destWHT}
          saveDestWHT={saveDestWHT}
          githubUrl={githubUrl}
          onSetGithubUrl={handleSetGithubUrl}
          plan={plan}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)',
        borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 14,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              ...BTN, flex: 1, padding: '8px 0', fontSize: 11, borderRadius: 8,
              background: tab === t.id ? 'rgba(99,102,241,0.4)' : 'transparent',
              color: tab === t.id ? '#fff' : '#4a5270',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'indice' && (
        <IndexTab scoresMap={scoresMap} plan={plan} />
      )}
      {tab === 'cartera' && (
        <CarteraTab plan={plan} destWHT={destWHT} />
      )}
    </div>
  )
}

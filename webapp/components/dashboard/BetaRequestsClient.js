'use client'
import { useState, useEffect } from 'react'
import { Card, SectionTitle } from '@/components/dashboard/ui'

const STATUS = {
  pending:   { label: 'Pendiente', color: 'var(--warning)' },
  activated: { label: 'Activado',  color: 'var(--positive)' },
  rejected:  { label: 'Rechazado', color: 'var(--negative)' },
}
const fmtDate = d => d ? new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export default function BetaRequestsClient() {
  const [reqs, setReqs] = useState(null)
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = () => fetch('/api/admin/beta-requests').then(r => r.json()).then(d => setReqs(d.requests || [])).catch(() => setReqs([]))
  useEffect(() => { load() }, [])

  const act = async (id, action) => {
    setBusy(id); setMsg(null)
    try {
      const res = await fetch('/api/admin/beta-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const j = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: j.error || 'Error' }); return }
      if (action === 'activate') setMsg({ type: 'ok', text: `Premium activado hasta ${String(j.premium_until).slice(0, 10)}` })
      load()
    } catch (e) { setMsg({ type: 'err', text: String(e.message || e) }) } finally { setBusy(null) }
  }

  if (reqs == null) return <div style={{ maxWidth: 1100, color: 'var(--text-faint)', fontSize: 13 }}>Cargando solicitudes…</div>

  const activated = reqs.filter(r => r.status === 'activated').length

  return (
    <div style={{ maxWidth: 1100, display: 'grid', gap: 16 }}>
      <Card>
        <SectionTitle>Solicitudes de fundador (Bizum)</SectionTitle>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>
          Pagos por Bizum de la oferta beta (20 €/año de por vida). <b>Activar</b> concede Premium 1 año al email indicado (debe estar registrado).
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Plazas de fundador activadas: <b style={{ color: activated >= 100 ? 'var(--negative)' : 'var(--positive)' }}>{activated} / 100</b>
        </p>
        {msg && <p style={{ fontSize: 12.5, color: msg.type === 'ok' ? 'var(--positive)' : 'var(--negative)', marginBottom: 12 }}>{msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}</p>}

        {reqs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '16px 0' }}>Aún no hay solicitudes.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr>{['Fecha', 'Email', 'Nombre', 'Ref. Bizum', 'Estado', ''].map((h, i) => (
                <th key={i} style={{ padding: '7px 8px', textAlign: i === 5 ? 'right' : 'left', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {reqs.map(r => {
                  const st = STATUS[r.status] || STATUS.pending
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '8px', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                      <td style={{ padding: '8px', color: 'var(--text)', fontWeight: 600 }}>{r.email}</td>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{r.name || '—'}</td>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{r.bizum_ref || '—'}</td>
                      <td style={{ padding: '8px' }}><span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{st.label}{r.status === 'activated' && r.activated_at ? ` · ${fmtDate(r.activated_at).slice(0, 10)}` : ''}</span></td>
                      <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.status !== 'activated' && (
                          <button onClick={() => act(r.id, 'activate')} disabled={busy === r.id} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(52,211,153,0.18)', color: 'var(--positive)', marginRight: 6 }}>{busy === r.id ? '…' : '✓ Activar'}</button>
                        )}
                        {r.status === 'pending' && (
                          <button onClick={() => act(r.id, 'reject')} disabled={busy === r.id} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-strong)', cursor: 'pointer', background: 'none', color: 'var(--text-muted)' }}>Rechazar</button>
                        )}
                        {r.status === 'rejected' && (
                          <button onClick={() => act(r.id, 'pending')} disabled={busy === r.id} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'none', color: 'var(--text-muted)', textDecoration: 'underline' }}>Restaurar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

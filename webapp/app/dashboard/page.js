import { serviceClient } from '@/lib/admin'
import {
  getFundamentalsLite, computeDataStats, getUserMetrics, listAllAuthUsers,
} from '@/lib/admin-stats'
import { Card, PageTitle, SectionTitle, MetricCard, StatusDot, fmtDate, fmtDateTime } from '@/components/dashboard/ui'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const sc = serviceClient()

  const [fundamentals, metrics, users] = await Promise.all([
    getFundamentalsLite(sc),
    getUserMetrics(sc),
    listAllAuthUsers(sc),
  ])
  const dataStats = computeDataStats(fundamentals)

  // Planes por usuario
  let planByUser = {}
  try {
    const { data } = await sc.from('user_settings').select('user_id, plan')
    planByUser = Object.fromEntries((data || []).map(s => [s.user_id, s.plan]))
  } catch {}

  // Último run yfinance + últimos logs
  let lastRun = null, recentLogs = []
  try {
    const { data: runs } = await sc.from('admin_logs').select('*').eq('event_type', 'yfinance_run').order('created_at', { ascending: false }).limit(1)
    lastRun = runs?.[0] ?? null
    const { data: logs } = await sc.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(5)
    recentLogs = logs || []
  } catch {}

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageTitle sub="Visión general de la plataforma">Resumen</PageTitle>

      {/* Métricas superiores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Usuarios registrados" value={metrics.total} />
        <MetricCard label="Activos (30 días)" value={metrics.active30d} color="var(--positive)" />
        <MetricCard label="Premium activos" value={metrics.premiumTotal} color="var(--warning)" />
        <MetricCard label="MRR estimado" value={`${metrics.mrr.toFixed(0)} €`} sub={`${metrics.conversion.toFixed(1)}% conversión`} color="var(--accent)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* Estado de datos */}
        <Card>
          <SectionTitle>Estado de datos</SectionTitle>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { label: 'Empresas con fundamentales', value: dataStats.totalFundamentals, col: 'var(--text)' },
              { label: 'Sin fundamentales', value: dataStats.missingCount, col: dataStats.missingCount > 0 ? 'var(--warning)' : 'var(--positive)' },
              { label: 'Datos desactualizados (>30d)', value: dataStats.outdatedCount, col: dataStats.outdatedCount > 0 ? 'var(--warning)' : 'var(--positive)' },
              { label: 'Datos incompletos', value: dataStats.incompleteCount, col: dataStats.incompleteCount > 0 ? 'var(--negative)' : 'var(--positive)' },
              { label: 'No reparten dividendo (correcto)', value: dataStats.noDividendCount ?? 0, col: 'var(--text-muted)' },
              { label: 'Dividendo por verificar', value: dataStats.unverifiedCount ?? 0, col: (dataStats.unverifiedCount ?? 0) > 0 ? '#60a5fa' : 'var(--positive)' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: r.col }}>{r.value.toLocaleString('es-ES')}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Último run yfinance</p>
            {lastRun ? (
              <p style={{ fontSize: 13, color: 'var(--text)' }}>
                <StatusDot status={lastRun.status} />
                {fmtDateTime(lastRun.created_at)} — {lastRun.description || 'sin descripción'}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin registros todavía</p>
            )}
          </div>
        </Card>

        {/* Últimos registros */}
        <Card>
          <SectionTitle>Últimos usuarios</SectionTitle>
          <div style={{ display: 'grid', gap: 7 }}>
            {recentUsers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Sin usuarios todavía.</p>
            ) : recentUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, paddingBottom: 6, borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{u.email}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'var(--text-faint)' }}>{fmtDate(u.created_at)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: planByUser[u.id] === 'premium' ? 'var(--warning)' : 'var(--text-faint)', background: planByUser[u.id] === 'premium' ? 'rgba(251,191,36,0.12)' : 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                    {planByUser[u.id] === 'premium' ? 'PREMIUM' : 'free'}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {recentLogs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <SectionTitle>Últimas alertas del sistema</SectionTitle>
              <div style={{ display: 'grid', gap: 5 }}>
                {recentLogs.map(l => (
                  <div key={l.id} style={{ fontSize: 11, color: l.status === 'error' ? 'var(--negative)' : 'var(--text-muted)' }}>
                    <StatusDot status={l.status} />{l.description || l.event_type}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
